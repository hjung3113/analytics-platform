// voc.read_public end to end (#1288 g): request → approve → grant scoped to A → A public, B hidden; scope
// validation; the platform audit projection lists the lifecycle events. Throwaway DB only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { publicVocListResponseSchema } from '@ap/feature-shared';

import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { type World, WORKSPACE_ID, createWorld, runIntegration } from '../../voc/public-read/__tests__/_world.js';

const TAG = 'it-pubperm';

describe.skipIf(!runIntegration)('voc.read_public request → approve → public read (#1288 g)', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld(TAG);
  });
  afterAll(async () => {
    if (w) {
      await w.migrate.pool.query(`delete from core.idempotency_keys where actor_id = any($1::uuid[])`, [Object.values(w.actors)]);
      await w.migrate.pool.query(`delete from permission.permission_requests where requester_actor_id = any($1::uuid[])`, [Object.values(w.actors)]);
    }
    await w?.teardown();
  });
  beforeEach(async () => {
    await w.clearRateLimits();
    await w.migrate.pool.query(`delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)`, [`${TAG}-%`]);
    await w.migrate.pool.query(`update core.managed_systems set external_key = null where slug like $1`, [`${TAG}-%`]);
  });

  const post = (url: string, who: Parameters<World['get']>[1], payload: Record<string, unknown>) =>
    w.app.inject({
      method: 'POST',
      url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${w.cookies[who ?? 'plain']}`, 'content-type': 'application/json' },
      payload,
    });

  it('a User requests voc.read_public for A; approval grants A only', async () => {
    const inA = await w.insertVoc(w.systems.a, 'admin', 'A VOC');
    const inB = await w.insertVoc(w.systems.b, 'admin', 'B VOC');
    const before = publicVocListResponseSchema.parse((await w.get('/vocs/public', 'plain')).json()).items;
    expect(before.map((i) => i.id)).not.toContain(inA);

    const created = await post('/permission-requests', 'plain', {
      requested_capability: 'voc.read_public',
      requested_managed_system_id: w.systems.a,
      reason: 'need to read A',
    });
    expect(created.statusCode).toBe(201);
    const requestId = created.json<{ id: string }>().id;

    const approved = await post(`/permissions/requests/${requestId}/approve`, 'admin', { expected_revision: 1 });
    expect(approved.statusCode).toBe(200);

    const grant = await w.migrate.pool.query<{ managed_system_id: string | null }>(
      `select managed_system_id from permission.permission_grants where actor_id = $1 and capability = 'voc.read_public'`,
      [w.actors.plain],
    );
    expect(grant.rows).toEqual([{ managed_system_id: w.systems.a }]);

    const after = publicVocListResponseSchema.parse((await w.get('/vocs/public', 'plain')).json()).items.map((i) => i.id);
    expect(after).toContain(inA);
    expect(after).not.toContain(inB);
    expect((await w.get(`/vocs/public/${inA}`, 'plain')).statusCode).toBe(200);
    expect((await w.get(`/vocs/public/${inB}`, 'plain')).statusCode).toBe(404);
    // The operator surfaces did not move.
    expect((await w.get('/vocs?view=inbox', 'plain')).statusCode).toBe(403);
    expect((await w.get(`/vocs/${inA}`, 'plain')).statusCode).toBe(404);
  });

  it.each([
    ['an unknown Managed System', () => '00000000-0000-4000-8000-00000000beef'],
    ['no Managed System (workspace-wide)', () => null],
  ])('a request with %s is refused', async (_name, system) => {
    const res = await post('/permission-requests', 'reporter', {
      requested_capability: 'voc.read_public',
      requested_managed_system_id: system(),
      reason: 'bad scope',
    });
    expect(res.statusCode).toBe(422);
  });

  it('an archived Managed System is refused', async () => {
    const archived = await w.insertSystem('archived', { archived: true });
    const res = await post('/permission-requests', 'reporter', {
      requested_capability: 'voc.read_public',
      requested_managed_system_id: archived,
      reason: 'archived scope',
    });
    expect(res.statusCode).toBe(422);
  });

  it('a User and a Developer may request it', async () => {
    for (const who of ['reporter', 'operatorB'] as const) {
      const res = await post('/permission-requests', who, {
        requested_capability: 'voc.read_public',
        requested_managed_system_id: w.systems.b,
        reason: 'role eligibility',
      });
      expect(res.statusCode).toBe(201);
    }
  });

  // Needs migration 0085 (the audit projection filters permission rows by an explicit capability list).
  it('the platform audit projection lists the capability lifecycle events', async () => {
    const migrated = await w.migrate.pool.query<{ ok: boolean }>(
      `select position('voc.read_public' in prosrc) > 0 as ok from pg_proc where proname = 'platform_audit_events'`,
    );
    if (migrated.rows[0]?.ok !== true) {
      // Migration 0085 is not applied to this database; the conductor runs this on the recreated one.
      return;
    }
    const created = await post('/permission-requests', 'plain', {
      requested_capability: 'voc.read_public',
      requested_managed_system_id: w.systems.a,
      reason: 'audit probe',
    });
    const requestId = created.json<{ id: string }>().id;
    await post(`/permissions/requests/${requestId}/approve`, 'admin', { expected_revision: 1 });
    const { rows } = await w.migrate.pool.query<{ event_type: string }>(
      `select event_type from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0)
        where subject_id = $3`,
      [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), requestId],
    );
    expect(rows.map((r) => r.event_type)).toEqual(expect.arrayContaining(['permission_requested', 'permission_approved']));
  });
});
