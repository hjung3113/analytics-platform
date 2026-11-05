// #1358 a (ADR-0113): per-system VOC creation permission over the real server and database.
// Throwaway DB only (`pnpm --filter @ap/platform-api test:integration`). Four logins, no more: mock-login is limited to
// 50/min per IP.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { denyCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `vcp${randomUUID().slice(0, 6)}`;

const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe.skipIf(!runIntegration)('per-system VOC creation permission (#1358)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  const actorIds: string[] = [];
  const cookies: Record<'admin' | 'plain' | 'granted' | 'denied', string> = {
    admin: '',
    plain: '',
    granted: '',
    denied: '',
  };
  const ids: Record<string, string> = {};
  let openMs: string;
  let restrictedMs: string;
  let platformMs: string;

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    who: keyof typeof cookies,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${cookies[who]}`,
        ...(method !== 'GET' ? { 'idempotency-key': randomUUID() } : {}),
      },
      ...(payload ? { payload: JSON.stringify(payload) } : {}),
    });
  const file = (who: keyof typeof cookies, msId: string, title = 'a report') =>
    call('POST', '/vocs', who, {
      primary_managed_system_id: msId,
      title,
      description_rich_content: doc(title),
    });
  const setMode = (msId: string, mode: string) =>
    call('PATCH', `/managed-systems/${msId}`, 'admin', { voc_create_mode: mode });

  async function register(slug: string): Promise<string> {
    const res = await call('POST', '/managed-systems', 'admin', { slug, name: slug });
    if (res.statusCode !== 201) throw new Error(`register ${slug}: ${res.statusCode} ${res.body}`);
    return res.json().id;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const admin = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `${TAG}-admin`,
      roleLevel: 'admin',
    });
    ids.admin = admin.id;
    for (const [key, role] of [
      ['plain', 'user'],
      ['granted', 'user'],
      ['denied', 'user'],
    ] as const) {
      ids[key] = (
        await insertActorRow(dbHandle, {
          workspaceId: WORKSPACE_ID,
          externalId: `${TAG}-${key}`,
          roleLevel: role,
        })
      ).id;
    }
    actorIds.push(...Object.values(ids));
    for (const key of Object.keys(cookies) as (keyof typeof cookies)[]) {
      cookies[key] = await loginAs(app, `${TAG}-${key}`);
    }
    openMs = await register(`it-${TAG}-open`);
    restrictedMs = await register(`it-${TAG}-restricted`);
    const platform = await migrate.pool.query<{ id: string }>(
      `select id from core.managed_systems where workspace_id = $1 and external_key = 'platform' and archived_at is null`,
      [WORKSPACE_ID],
    );
    const platformId = platform.rows[0]?.id;
    if (!platformId) throw new Error('seed has no platform managed system');
    platformMs = platformId;

    expect((await setMode(restrictedMs, 'restricted')).statusCode).toBe(200);
    // The direct-grant API accepts voc.create scoped to one system (a User may hold it).
    const grant = await call('POST', '/permissions/grants', 'admin', {
      actor_id: ids.granted,
      capability: 'voc.create',
      managed_system_id: restrictedMs,
      reason: 'test',
    });
    expect(grant.statusCode).toBe(201);
    await denyCapability(dbHandle, WORKSPACE_ID, ids.denied as string, 'voc.create', openMs, ids.admin as string);
  });

  afterAll(async () => {
    const msIds = [openMs, restrictedMs].filter(Boolean);
    if (msIds.length > 0) {
      await migrate.pool.query('delete from voc.vocs where primary_managed_system_id = any($1)', [msIds]);
    }
    await migrate.pool.query('delete from core.idempotency_keys where actor_id = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['permission.permission_denies', 'actor_id'],
      ['core.sessions', 'actor_id'],
    ] as const) {
      await migrate.pool.query(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    if (msIds.length > 0) {
      await deleteRecoveryFixtureParents(
        migrate,
        `delete from core.managed_systems where id = any(ARRAY['${msIds.join("','")}']::uuid[])`,
      );
    }
    await migrate.pool.query('delete from core.actors where id = any($1)', [actorIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('a new system defaults to open and carries voc_create_mode on read', async () => {
    const list = await call('GET', '/managed-systems?limit=500', 'plain');
    const row = list.json().items.find((i: { id: string }) => i.id === openMs);
    expect(row.voc_create_mode).toBe('open');
  });

  it('open: any signed-in user files a VOC; an explicit deny on that system gives 403', async () => {
    expect((await file('plain', openMs)).statusCode).toBe(201);
    const refused = await file('denied', openMs);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('permission.denied');
  });

  it('restricted: a plain user gets 403, a grant holder and an Admin get 201', async () => {
    expect((await file('plain', restrictedMs)).statusCode).toBe(403);
    expect((await file('granted', restrictedMs)).statusCode).toBe(201);
    expect((await file('admin', restrictedMs)).statusCode).toBe(201);
  });

  it('a grant on another system does not open this one', async () => {
    expect((await file('granted', openMs)).statusCode).toBe(201);
    const second = await register(`it-${TAG}-second`);
    try {
      expect((await setMode(second, 'restricted')).statusCode).toBe(200);
      expect((await file('granted', second)).statusCode).toBe(403);
    } finally {
      await migrate.pool.query('delete from core.audit_log where subject_id = $1', [second]);
      await deleteRecoveryFixtureParents(migrate, `delete from core.managed_systems where id = '${second}'`);
    }
  });

  it('ordering: an unknown system is 404, an archived one is 409, both before the permission answer', async () => {
    expect((await file('plain', randomUUID())).statusCode).toBe(404);
    const archived = await register(`it-${TAG}-archived`);
    try {
      expect((await setMode(archived, 'restricted')).statusCode).toBe(200);
      expect((await call('POST', `/managed-systems/${archived}/archive`, 'admin')).statusCode).toBe(200);
      expect((await file('plain', archived)).statusCode).toBe(409);
    } finally {
      await migrate.pool.query('delete from core.audit_log where subject_id = $1', [archived]);
      await deleteRecoveryFixtureParents(migrate, `delete from core.managed_systems where id = '${archived}'`);
    }
  });

  it('the platform system rejects restricted and stays open', async () => {
    const res = await setMode(platformMs, 'restricted');
    expect(res.statusCode).toBe(422);
    expect(JSON.stringify(res.json())).toContain('platform_always_open');
    const row = await migrate.pool.query('select voc_create_mode from core.managed_systems where id = $1', [platformMs]);
    expect(row.rows[0].voc_create_mode).toBe('open');
    expect((await setMode(platformMs, 'open')).statusCode).toBe(200);
  });

  it('a mode change is audited with the old and the new mode', async () => {
    const audit = await migrate.pool.query<{ detail: { changes: Record<string, unknown> } }>(
      `select detail from core.audit_log
        where subject_id = $1 and event_type = 'managed_system_updated' order by created_at desc limit 1`,
      [restrictedMs],
    );
    expect(audit.rows[0]?.detail.changes).toMatchObject({
      voc_create_mode: { from: 'open', to: 'restricted' },
    });
  });

  it('create-targets lists every live system with the same decision POST /vocs gives', async () => {
    const targets = async (who: keyof typeof cookies) => {
      const res = await call('GET', '/vocs/create-targets', who);
      expect(res.statusCode).toBe(200);
      return new Map<string, { allowed: boolean; reason?: string }>(
        res.json().items.map((t: { managed_system_id: string; allowed: boolean; reason?: string }) => [
          t.managed_system_id,
          t,
        ]),
      );
    };
    const plain = await targets('plain');
    expect(plain.get(openMs)).toEqual({ managed_system_id: openMs, allowed: true });
    expect(plain.get(restrictedMs)).toEqual({ managed_system_id: restrictedMs, allowed: false, reason: 'restricted' });
    expect(plain.get(platformMs)?.allowed).toBe(true);
    expect((await targets('granted')).get(restrictedMs)?.allowed).toBe(true);
    expect((await targets('admin')).get(restrictedMs)?.allowed).toBe(true);
    expect((await targets('denied')).get(openMs)?.allowed).toBe(false);
  });

  it('Q4: a VOC filed before the system became restricted stays readable and updatable', async () => {
    const early = await register(`it-${TAG}-early`);
    try {
      const created = await file('plain', early, 'filed while open');
      expect(created.statusCode).toBe(201);
      const vocId = created.json().id as string;
      expect((await setMode(early, 'restricted')).statusCode).toBe(200);
      const read = await call('GET', `/vocs/${vocId}`, 'plain');
      expect(read.statusCode).toBe(200);
      const edit = await app.inject({
        method: 'PATCH',
        url: `/vocs/${vocId}/description`,
        headers: {
          'content-type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${cookies.plain}`,
          'idempotency-key': randomUUID(),
          'if-match': created.json().updated_at,
        },
        payload: JSON.stringify({ description_rich_content: doc('edited after restriction') }),
      });
      expect(edit.statusCode).toBe(200);
      expect((await file('plain', early)).statusCode).toBe(403);
    } finally {
      await migrate.pool.query('delete from voc.vocs where primary_managed_system_id = $1', [early]);
      await migrate.pool.query('delete from core.audit_log where subject_id = $1 or detail ->> $2 = $1::text', [early, 'primary_managed_system_id']);
      await deleteRecoveryFixtureParents(migrate, `delete from core.managed_systems where id = '${early}'`);
    }
  });
});
