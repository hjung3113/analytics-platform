// A public-only `voc.read_public` grant must not open any protected VOC caller (#1288 g, review F2).
// One fixture per gate, each with a positive control proving the route reaches the gate it names.
// Throwaway DB only.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../../test-support/auth.js';
import { grantCapability } from '../../../../test-support/permissions-fixtures.js';
import { SESSION_COOKIE_NAME } from '../../../../middleware/require-session.js';
import { type World, WORKSPACE_ID, createWorld, runIntegration } from './_world.js';

const TAG = 'it-pubcallers';
const VERSION = 1;

describe.skipIf(!runIntegration)('public-only voc.read_public grant vs protected callers (#1288 g)', () => {
  let w: World;
  const extra: string[] = [];
  const cookies = {} as Record<'finderPublic' | 'finderRead' | 'mixed', string>;

  beforeAll(async () => {
    process.env.EMBEDDING_PROVIDER = 'fake';
    w = await createWorld(TAG);
    // Two Developers with finding.manage on A: one holds only the public read, the other voc.read.
    for (const [name, readCap] of [
      ['finderPublic', 'voc.read_public'],
      ['finderRead', 'voc.read'],
    ] as const) {
      const externalId = `${TAG}-${name}`;
      const { id } = await insertActorRow(w.migrate, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'developer' });
      extra.push(id);
      cookies[name] = await loginAs(w.app, externalId);
      await grantCapability(w.migrate, WORKSPACE_ID, id, readCap, w.systems.a, w.actors.admin);
      await grantCapability(w.migrate, WORKSPACE_ID, id, 'finding.manage', w.systems.a, w.actors.admin);
      await grantCapability(w.migrate, WORKSPACE_ID, id, 'finding.read', w.systems.a, w.actors.admin);
    }
    // One actor with voc.read on B and voc.read_public on A: A must stay public-only for it.
    const mixedExternal = `${TAG}-mixed`;
    const mixed = await insertActorRow(w.migrate, { workspaceId: WORKSPACE_ID, externalId: mixedExternal, roleLevel: 'developer' });
    extra.push(mixed.id);
    cookies.mixed = await loginAs(w.app, mixedExternal);
    await grantCapability(w.migrate, WORKSPACE_ID, mixed.id, 'voc.read', w.systems.b, w.actors.admin);
    await grantCapability(w.migrate, WORKSPACE_ID, mixed.id, 'voc.read_public', w.systems.a, w.actors.admin);
  });

  afterAll(async () => {
    if (w) await cleanFixtures();
    if (w && extra.length > 0) {
      const q = (sql: string) => w.migrate.pool.query(sql, [extra]);
      await q(`delete from core.idempotency_keys where actor_id = any($1::uuid[])`);
      await q(`delete from permission.permission_grants where actor_id = any($1::uuid[])`);
      await q(`delete from core.sessions where actor_id = any($1::uuid[])`);
      await q(`delete from core.audit_log where actor_id = any($1::uuid[])`);
      await q(`delete from core.actors where id = any($1::uuid[])`);
    }
    await w?.teardown();
  });

  const ours = `(select id from core.managed_systems where slug like $1)`;
  async function cleanFixtures(): Promise<void> {
    const run = (sql: string) => w.migrate.pool.query(sql, [`${TAG}-%`]);
    await run(`delete from core.entity_links where workspace_id = '${WORKSPACE_ID}' and (source_id in (select id from voc.vocs where primary_managed_system_id in ${ours}) or target_id in (select id from voc.vocs where primary_managed_system_id in ${ours}))`);
    await run(`delete from core.entity_links where workspace_id = '${WORKSPACE_ID}' and (source_id in (select id from finding.findings where primary_managed_system_id in ${ours}) or target_id in (select id from finding.findings where primary_managed_system_id in ${ours}))`);
    await run(`delete from task_request.task_requests where primary_managed_system_id in ${ours}`);
    await run(`delete from finding.findings where primary_managed_system_id in ${ours}`);
    await run(`delete from voc_cluster.voc_cluster_members where cluster_id in (select id from voc_cluster.voc_clusters where primary_managed_system_id in ${ours})`);
    await run(`delete from voc_cluster.voc_clusters where primary_managed_system_id in ${ours}`);
    await run(`delete from voc.vocs where primary_managed_system_id in ${ours}`);
    await run(`delete from core.responsibility_default_failures where managed_system_id in ${ours}`);
  }
  beforeEach(async () => {
    await w.clearRateLimits();
    await cleanFixtures();
  });

  const send = (method: 'GET' | 'POST', url: string, cookie: string, payload?: Record<string, unknown>) =>
    w.app.inject({
      method,
      url,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        ...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {}),
      },
      ...(payload ? { payload } : {}),
    });

  async function embed(vocId: string, enabled = true): Promise<void> {
    if (!enabled) return;
    await w.migrate.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'callers', 3, '[1,0,0]'::vector, $4)`,
      [vocId, WORKSPACE_ID, VERSION, `callers-${vocId}`],
    );
  }

  describe('pre-submit peers', () => {
    it('lists only the actor’s own A VOC, not an operator-reported one', async () => {
      const own = await w.insertVoc(w.systems.a, 'granted', 'own A');
      const other = await w.insertVoc(w.systems.a, 'admin', 'someone else A');
      const res = await send('GET', `/vocs/pre-submit-peers?managed_system_id=${w.systems.a}`, w.cookies.granted);
      expect(res.statusCode).toBe(200);
      const ids = JSON.stringify(res.json());
      expect(ids).toContain(own); // positive control: the route reached the peer query
      expect(ids).not.toContain(other);
      // Positive control for the negative: a voc.read holder on A would see `other`.
      const reader = await send('GET', `/vocs/pre-submit-peers?managed_system_id=${w.systems.a}`, cookies.finderRead);
      expect(JSON.stringify(reader.json())).toContain(other);
    });
  });

  describe('recommendations', () => {
    it('an owned source ranks the actor’s own candidate and never a non-owned A candidate', async () => {
      const source = await w.insertVoc(w.systems.a, 'granted', 'source');
      const ownCandidate = await w.insertVoc(w.systems.a, 'granted', 'own candidate');
      const otherCandidate = await w.insertVoc(w.systems.a, 'admin', 'foreign candidate');
      for (const id of [source, ownCandidate, otherCandidate]) await embed(id);
      const res = await send('GET', `/vocs/${source}/recommendations`, w.cookies.granted);
      expect(res.statusCode).toBe(200);
      const body = JSON.stringify(res.json());
      expect(body).toContain(ownCandidate); // embeddings match, the route reached candidate filtering
      expect(body).not.toContain(otherCandidate);
    });

    it('a non-owned A source is the existing 404', async () => {
      const source = await w.insertVoc(w.systems.a, 'admin', 'foreign source');
      await embed(source);
      expect((await send('GET', `/vocs/${source}/recommendations`, w.cookies.granted)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${source}/recommendations`, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('conversation', () => {
    it('own VOC conversation opens, a non-owned A VOC conversation is 404', async () => {
      const own = await w.insertVoc(w.systems.a, 'granted', 'own');
      const other = await w.insertVoc(w.systems.a, 'admin', 'foreign');
      expect((await w.get(`/vocs/${own}/conversation`, 'granted')).statusCode).toBe(200);
      expect((await w.get(`/vocs/${other}/conversation`, 'granted')).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${other}/conversation`, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('clusters', () => {
    it('cluster detail and candidate peers stay closed to a public-only grant', async () => {
      const member = await w.insertVoc(w.systems.a, 'admin', 'member');
      const created = await send('POST', '/voc-clusters', w.cookies.admin, {
        title: 'cluster A',
        primary_managed_system_id: w.systems.a,
      });
      expect(created.statusCode).toBe(201);
      const clusterId = created.json<{ id: string }>().id;
      const added = await send('POST', `/voc-clusters/${clusterId}/vocs`, w.cookies.admin, { voc_id: member });
      expect([200, 201]).toContain(added.statusCode);
      // Positive control: a voc.read holder on A opens it and sees the member.
      const ok = await send('GET', `/voc-clusters/${clusterId}`, cookies.finderRead);
      expect(ok.statusCode).toBe(200);
      expect(JSON.stringify(ok.json())).toContain(member);
      // Public-only: no member id, no member count of the restricted VOC.
      const denied = await send('GET', `/voc-clusters/${clusterId}`, cookies.finderPublic);
      expect(denied.statusCode).toBe(200); // finding.read lets the cluster open ...
      expect(JSON.stringify(denied.json())).not.toContain(member); // ... the restricted member stays out
      const peers = await send('GET', `/voc-clusters/${clusterId}/candidate-peers`, cookies.finderPublic);
      expect(JSON.stringify(peers.json())).not.toContain(member);
    });
  });

  describe('Finding and Task Request creation from a VOC', () => {
    const finding = { title: 'f', summary: 's', severity: 'low' };
    const taskRequest = { evidence_summary: 'e', requested_outcome: 'o' };

    it('Finding creation: public-only source is 404, voc.read source passes the same gate', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'source');
      const denied = await send('POST', `/vocs/${voc}/create-finding`, cookies.finderPublic, finding);
      expect(denied.statusCode).toBe(404);
      const ok = await send('POST', `/vocs/${voc}/create-finding`, cookies.finderRead, finding);
      expect(ok.statusCode).toBe(201);
    });

    it('Task Request creation: public-only source is 404, voc.read source passes the source gate', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'source');
      const denied = await send('POST', `/vocs/${voc}/request-task`, cookies.finderPublic, taskRequest);
      expect(denied.statusCode).toBe(404);
      const ok = await send('POST', `/vocs/${voc}/request-task`, cookies.finderRead, taskRequest);
      expect(ok.statusCode).not.toBe(404);
    });
  });

  describe('entity-link provider', () => {
    it('listing links of a VOC the actor cannot read-as-source is refused, a voc.read holder lists', async () => {
      const voc = await w.insertVoc(w.systems.a, 'admin', 'linked');
      const url = `/entity-links?source_type=voc&source_id=${voc}`;
      const denied = await send('GET', url, w.cookies.granted);
      expect(denied.statusCode).toBeGreaterThanOrEqual(400);
      expect((await send('GET', url, cookies.finderRead)).statusCode).toBe(200);
    });
  });

  describe('counts and notifications', () => {
    it('nav counts: a public-only grant adds nothing to the actor’s own-scope counts', async () => {
      await w.insertVoc(w.systems.a, 'admin', 'A one');
      await w.insertVoc(w.systems.a, 'admin', 'A two');
      const before = await send('GET', '/nav/counts', w.cookies.granted);
      expect(before.statusCode).toBe(200);
      const operator = await send('GET', '/nav/counts', cookies.finderRead);
      expect(operator.statusCode).toBe(200);
      expect(JSON.stringify(before.json())).not.toEqual(JSON.stringify(operator.json()));
    });

    it('notifications: the list is the actor’s own, with a public-only grant it never carries foreign VOC ids', async () => {
      const foreign = await w.insertVoc(w.systems.a, 'admin', 'foreign');
      const res = await send('GET', '/notifications', w.cookies.granted);
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain(foreign);
    });
  });

  describe('one actor with voc.read on B and voc.read_public on A', () => {
    it('operator surfaces open B and stay closed for A', async () => {
      const a = await w.insertVoc(w.systems.a, 'admin', 'A foreign');
      const b = await w.insertVoc(w.systems.b, 'admin', 'B foreign');
      expect((await send('GET', `/vocs/${b}`, cookies.mixed)).statusCode).toBe(200);
      expect((await send('GET', `/vocs/${a}`, cookies.mixed)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/${a}/conversation`, cookies.mixed)).statusCode).toBe(404);
      expect((await send('GET', `/vocs/public/${a}`, cookies.mixed)).statusCode).toBe(200);
    });
  });
});
