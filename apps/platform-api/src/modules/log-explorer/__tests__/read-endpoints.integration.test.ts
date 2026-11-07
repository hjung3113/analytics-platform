// #1469 — log explorer reads through the real `buildServer` over `POST /api/v1/menu-query` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration modules/log-explorer/__tests__/read-endpoints.integration.test.ts`; app as platform_app,
// fixtures and cleanup as platform_migrate). No migration needed: the capability is a text value in `permission.permission_grants`.
// Three servers: the dev/test assembly (synthetic adapter), the production shape (no adapter) and a slow Source for the cancel case.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { devLogExplorerServerOptions } from '../../../test-support/log-explorer-dev-assembly.js';
import { grantCapability, revokeCapabilityGrant } from '../../../test-support/permissions-fixtures.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LXR${randomUUID().slice(0, 6).toUpperCase()}`;
const CAPABILITY = 'explorer.source.read';

interface Person {
  id: string;
  cookie: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  message?: string;
}

describe.skipIf(!runIntegration)('log explorer reads (#1469)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let bare: FastifyInstance;
  let slow: FastifyInstance;
  let admin: Person;
  let reader: Person;
  let reader2: Person;
  let nobody: Person;
  const actorIds: string[] = [];
  const granted = new Map<string, Set<string>>();
  const synthetic = createSyntheticScenario('typical');
  const owner = synthetic.sampleSet.sourceOwner;
  let readerGrant = '';
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const access = { allows: async (actor: { actor_id: string }, sourceOwner: string) => granted.get(actor.actor_id)?.has(sourceOwner) === true };

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    return { id, cookie: await loginAs(app, externalId) };
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person, server: FastifyInstance = app) {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logExplorer.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  let listening: Promise<string> | null = null;
  const slowAddress = () => (listening ??= slow.listen({ port: 0, host: '127.0.0.1' }));
  const page = (extra: Record<string, unknown> = {}) => ({ sampleSet: synthetic.sampleSet, query: {}, limit: 10, ...extra });
  const audits = async (actorId: string) =>
    (await sql(`select detail, subject_type from core.audit_log where actor_id = $1 and event_type = 'explorer.source.read' order by created_at, id`, [actorId])).rows as {
      detail: Record<string, unknown>;
      subject_type: string;
    }[];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, logExplorer: devLogExplorerServerOptions(access, 'typical') });
    bare = await buildServer({ config: loadConfig(), dbHandle });
    slow = await buildServer({ config: loadConfig(), dbHandle, logExplorer: devLogExplorerServerOptions(access, 'slow') });
    await Promise.all([app.ready(), bare.ready(), slow.ready()]);
    admin = await person('admin');
    reader = await person('user');
    reader2 = await person('developer');
    nobody = await person('user');
    for (const who of [reader, reader2]) {
      const id = await grantCapability(dbHandle, WORKSPACE_ID, who.id, CAPABILITY, null, admin.id);
      if (who === reader) readerGrant = id;
      granted.set(who.id, new Set([owner]));
    }
    granted.set(admin.id, new Set([owner]));
    granted.set(nobody.id, new Set([owner]));
  });

  afterAll(async () => {
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await Promise.all([app?.close(), bare?.close(), slow?.close()]);
    await dbHandle?.close();
    await migrate?.close();
  });

  it('allowed: a holder of the capability and the Source owner reads rows marked synthetic, in file then line order', async () => {
    const a = await read('records', page({ limit: 40 }), reader);
    expect(a.outcome).toBe('ok');
    expect(a.data).toMatchObject({ state: 'ok', synthetic: true, label: '합성' });
    expect(a.data.rows).toHaveLength(40);
    expect(a.data.rows[29]).toMatchObject({ fileRef: 'synthetic/a.log', line: 30 });
    expect(a.data.rows[30]).toMatchObject({ fileRef: 'synthetic/b.log', line: 1 });
    const win = await read('window', { sourceOwner: owner, fileRef: 'synthetic/a.log', line: 10, before: 1, after: 1 }, reader);
    expect(win.data.rows.map((r: { line: number }) => r.line)).toEqual([9, 10, 11]);
    expect((await read('parsed', { sourceOwner: owner, fileRef: 'synthetic/a.log', line: 5 }, reader)).data.state).toBe('ok');
    expect((await read('periods', page(), reader)).data.state).toBe('ok');
  });

  it('denied without the capability, whatever the role: an Admin and a plain user get a state, not rows', async () => {
    for (const who of [admin, nobody]) {
      const a = await read('records', page(), who);
      expect(a.outcome).toBe('ok');
      expect(a.data).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held', rows: [] });
    }
  });

  it('denied for another Source owner even with the capability', async () => {
    granted.set(reader2.id, new Set(['elsewhere']));
    expect((await read('records', page(), reader2)).data).toMatchObject({ state: 'permission_denied', reason: 'source_owner_not_granted' });
    granted.set(reader2.id, new Set([owner]));
    expect((await read('records', page(), reader2)).data.state).toBe('ok');
  });

  it('judged per request: a revoked grant answers a state on the very next call; a re-grant restores it', async () => {
    const who = await person('user');
    const id = await grantCapability(dbHandle, WORKSPACE_ID, who.id, CAPABILITY, null, admin.id);
    granted.set(who.id, new Set([owner]));
    expect((await read('records', page(), who)).data.state).toBe('ok');
    await revokeCapabilityGrant(dbHandle, id, admin.id);
    expect((await read('records', page(), who)).data).toMatchObject({ state: 'permission_denied', rows: [] });
  });

  it('a grant in another workspace does not count', async () => {
    const otherWs = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    const foreign = (await insertActorRow(dbHandle, { workspaceId: otherWs, externalId: `${TAG}-foreign`, roleLevel: 'user' })).id;
    actorIds.push(foreign);
    const who = await person('user');
    await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [otherWs, who.id, CAPABILITY, foreign]);
    granted.set(who.id, new Set([owner]));
    try {
      expect((await read('records', page(), who)).data.state).toBe('permission_denied');
    } finally {
      await sql('delete from permission.permission_grants where workspace_id = $1', [otherWs]);
      await sql('delete from core.audit_log where workspace_id = $1', [otherWs]);
      await sql('delete from core.workspaces where id = $1', [otherWs]).catch(() => undefined);
    }
  });

  it('production shape: no adapter is connected, every read is source_absent / source_not_connected', async () => {
    const answers = [
      await read('records', page(), reader, bare),
      await read('window', { sourceOwner: owner, fileRef: 'x', line: 1, before: 0, after: 0 }, reader, bare),
      await read('parsed', { sourceOwner: owner, fileRef: 'x', line: 1 }, reader, bare),
      await read('periods', page(), reader, bare),
    ];
    for (const a of answers) expect(a.data).toMatchObject({ state: 'source_absent', reason: 'source_not_connected', synthetic: false, label: null });
    // Without the capability the same read is still refused first.
    expect((await read('records', page(), nobody, bare)).data).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held' });
  });

  it('limits: over-limit requests are refused as errors and never cut', async () => {
    expect((await read('records', page({ limit: 201 }), reader)).outcome).toBe('error');
    expect((await read('window', { sourceOwner: owner, fileRef: 'synthetic/a.log', line: 1, before: 100, after: 100 }, reader)).outcome).toBe('error');
  });

  it('cursor: replay with another request or another actor is refused', async () => {
    const first = await read('records', page({ limit: 5 }), reader);
    const cursor = first.data.nextCursor as string;
    expect((await read('records', page({ limit: 5, cursor }), reader)).data.rows[0].line).toBe(6);
    expect(await read('records', page({ limit: 6, cursor }), reader)).toMatchObject({ outcome: 'error', message: 'cursor_invalid' });
    expect(await read('records', page({ limit: 5, cursor, query: { module: 'ModuleA' } }), reader)).toMatchObject({ outcome: 'error', message: 'cursor_invalid' });
    expect(await read('records', page({ limit: 5, cursor }), reader2)).toMatchObject({ outcome: 'error', message: 'cursor_invalid' });
  });

  it('audit: one core.audit_log row per read with counts, digest and filter keys, and no body or filter value', async () => {
    const who = await person('user');
    await grantCapability(dbHandle, WORKSPACE_ID, who.id, CAPABILITY, null, admin.id);
    granted.set(who.id, new Set([owner]));
    await read('records', page({ limit: 10, query: { module: 'ModuleA', event: 'Tick' } }), who);
    await read('window', { sourceOwner: owner, fileRef: 'synthetic/a.log', line: 4, before: 1, after: 1 }, who);
    const rows = await audits(who.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.subject_type).toBe('log_explorer_source');
    expect(rows[0]?.detail).toMatchObject({ endpoint: 'records', sourceOwner: owner, fileCount: 2, filterKeys: ['module', 'event'], rowCount: 10, result: 'ok' });
    expect(rows[1]?.detail).toMatchObject({ endpoint: 'window', sampleSetDigest: null, fileCount: 1, rowCount: 3 });
    const dump = JSON.stringify(rows);
    for (const forbidden of ['ModuleA', 'Tick', '합성 a line', 'synthetic/a.log']) expect(dump).not.toContain(forbidden);
  });

  it('cancel: a client that goes away stops the Source call and the read is audited as aborted', async () => {
    // light-my-request ignores `signal` outside stream mode, so go through a real socket: a fetch the client abandons.
    const address = await slowAddress();
    const ctl = new AbortController();
    const pending = fetch(`${address}/api/v1/menu-query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cookieHeader(reader.cookie) },
      body: JSON.stringify({ endpoint: 'logExplorer.records', context: {}, params: page({ limit: 5 }) }),
      signal: ctl.signal,
    }).catch(() => null);
    setTimeout(() => ctl.abort(), 150);
    await pending;
    let aborted = false;
    for (let i = 0; i < 30 && !aborted; i += 1) {
      aborted = (await audits(reader.id)).some((r) => r.detail.result === 'aborted');
      if (!aborted) await new Promise((r) => setTimeout(r, 100));
    }
    expect(aborted).toBe(true);
  });

  it('cancel: a client that goes away while the session is still being loaded aborts the read too', async () => {
    const who = await person('user');
    await grantCapability(dbHandle, WORKSPACE_ID, who.id, CAPABILITY, null, admin.id);
    granted.set(who.id, new Set([owner]));
    // Hold the session row: the authentication UPDATE (touch) waits on this lock until the client is already gone.
    const holder = await migrate.pool.connect();
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await holder.query('commit');
      holder.release();
    };
    try {
      await holder.query('begin');
      await holder.query('select 1 from core.sessions where actor_id = $1 for update', [who.id]);
      const address = await slowAddress();
      const ctl = new AbortController();
      const pending = fetch(`${address}/api/v1/menu-query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
        body: JSON.stringify({ endpoint: 'logExplorer.records', context: {}, params: page({ limit: 5 }) }),
        signal: ctl.signal,
      }).catch(() => null);
      await new Promise((r) => setTimeout(r, 200)); // the request is inside authentication, blocked on the lock
      ctl.abort();
      await pending;
      await new Promise((r) => setTimeout(r, 200)); // the socket close reached the server before authentication returns
      await release();
      let results: unknown[] = [];
      for (let i = 0; i < 30 && results.length === 0; i += 1) {
        results = (await audits(who.id)).map((r) => r.detail.result);
        if (results.length === 0) await new Promise((r) => setTimeout(r, 100));
      }
      expect(results).toEqual(['aborted']);
    } finally {
      await release();
    }
  });

  it('the capability of a revoked reader is gone for the cursor too', async () => {
    await revokeCapabilityGrant(dbHandle, readerGrant, admin.id);
    expect((await read('records', page(), reader)).data.state).toBe('permission_denied');
  });
});
