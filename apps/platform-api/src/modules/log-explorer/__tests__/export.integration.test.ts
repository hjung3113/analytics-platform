// #1472 — token scopes, read budget, export REST and usage read through the real `buildServer` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration modules/log-explorer/__tests__/export.integration.test.ts`; app as platform_app, fixtures as
// platform_migrate). No migration: capabilities are text values, counters live in the existing `core.rate_limits`, tokens in `core.api_tokens`.
// The dev/test assembly injects the synthetic Source (small export chunks and a hook before each chunk are the stream test seams).

import { randomUUID } from 'node:crypto';

import { EXPORT_DAILY_MAX, TOKEN_DAILY_BODY_BUDGET_BYTES } from '@ap/contract-schemas';
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
import { hashToken } from '../../api-tokens/token-format.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';
import { createUsageStore } from '../usage-store.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LXE${randomUUID().slice(0, 6).toUpperCase()}`;
const EXPORT = 'explorer.export';
const READ = 'explorer.source.read';

interface Person {
  id: string;
  cookie: string;
}

describe.skipIf(!runIntegration)('log explorer tokens, budget and export (#1472)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: Person;
  const actorIds: string[] = [];
  const tokenIds: string[] = [];
  const granted = new Map<string, Set<string>>();
  const synthetic = createSyntheticScenario('typical');
  const owner = synthetic.sampleSet.sourceOwner;
  const hook: { fn: ((index: number) => Promise<void> | void) | null } = { fn: null };
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const access = { allows: async (actor: { actor_id: string }, sourceOwner: string) => granted.get(actor.actor_id)?.has(sourceOwner) === true };
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

  async function person(roleLevel: 'admin' | 'developer' | 'user' = 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    return { id, cookie: await loginAs(app, externalId) };
  }
  /** An Actor holding both rights and the Source owner. */
  async function holder(): Promise<Person & { grants: string[] }> {
    const who = await person('user');
    const grants = [await grantCapability(dbHandle, WORKSPACE_ID, who.id, EXPORT, null, admin.id), await grantCapability(dbHandle, WORKSPACE_ID, who.id, READ, null, admin.id)];
    granted.set(who.id, new Set([owner]));
    return { ...who, grants };
  }
  /** A token row inserted directly (the issue path is #1442's; here only the scopes matter). */
  async function token(actorId: string, scopes: string[], kind: 'personal' | 'service' = 'personal'): Promise<{ value: string; id: string }> {
    const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
    const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
    const res = await sql(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,$3,'raw',$4,$5,$6,$7) returning id`,
      [WORKSPACE_ID, actorId, kind, prefix, hashToken(value), scopes, kind === 'service' ? admin.id : actorId],
    );
    const id = res.rows[0].id as string;
    tokenIds.push(id);
    return { value, id };
  }
  const body = (extra: Record<string, unknown> = {}) => ({ sampleSet: synthetic.sampleSet, query: {}, range: { rows: 20 }, format: 'csv', ...extra });
  const exportCall = (headers: Record<string, string>, extra: Record<string, unknown> = {}, server: FastifyInstance = app) =>
    server.inject({ method: 'POST', url: '/api/v1/log-explorer/export', headers: { 'content-type': 'application/json', ...headers }, payload: JSON.stringify(body(extra)) });
  const read = (headers: Record<string, string>, endpoint = 'records', params: Record<string, unknown> = { sampleSet: synthetic.sampleSet, query: {}, limit: 10 }) =>
    app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...headers }, payload: JSON.stringify({ endpoint: `logExplorer.${endpoint}`, context: {}, params }) });
  const audits = async (actorId: string, event = 'explorer.export') =>
    (await sql(`select detail from core.audit_log where actor_id = $1 and event_type = $2 order by created_at, id`, [actorId, event])).rows.map((r) => r.detail as Record<string, unknown>);
  const today = () => new Date().toISOString().slice(0, 10);
  const setCounter = (kind: 't' | 'a', id: string, metric: string, value: number) =>
    sql(`insert into core.rate_limits (key, route_group, counter, expires_at) values ($1,'explorer_usage',$2, now() + interval '2 days')
         on conflict (key, route_group) do update set counter = excluded.counter`, [`${WORKSPACE_ID}:${kind}:${id}:${metric}:${today()}`, value]);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({
      config: loadConfig(),
      dbHandle,
      logExplorer: { ...devLogExplorerServerOptions(access, 'typical'), exportChunkBytes: 2048, beforeExportChunk: (index) => hook.fn?.(index) },
    });
    await app.ready();
    admin = await person('admin');
    granted.set(admin.id, new Set([owner]));
  });

  afterAll(async () => {
    hook.fn = null;
    await sql(`delete from core.rate_limits where route_group in ('explorer_usage','explorer_export_lease') and (key like $1 or key = any($2))`, [`${WORKSPACE_ID}:%`, []]).catch(() => undefined);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['core.api_tokens', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('a session export streams a CSV with a header, formula-safe cells and a start audit row without any body', async () => {
    const who = await holder();
    const res = await exportCall(cookieHeader(who.cookie), { range: { rows: 35 } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('log-explorer-export.csv');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Number(res.headers['content-length'])).toBe(Buffer.byteLength(res.body));
    const lines = res.body.trimEnd().split('\r\n');
    expect(lines).toHaveLength(36);
    expect(lines[0]).toBe('fileRef,fileOrder,line,timestamp,text,truncated,timeReversal,synthetic');
    const rows = await audits(who.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceOwner: owner, fileCount: 2, filterKeys: [], format: 'csv', rowCount: 35, bytes: Buffer.byteLength(res.body), result: 'ok', viaToken: false });
    const dump = JSON.stringify(rows);
    for (const forbidden of ['합성', 'synthetic/a.log', 'line 1']) expect(dump).not.toContain(forbidden);
    expect(rows[0]).not.toHaveProperty('api_token_id');
  });

  it('JSONL for a session, and a request without a session or token is 401', async () => {
    const who = await holder();
    const res = await exportCall(cookieHeader(who.cookie), { format: 'jsonl', range: { rows: 3 } });
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.body.trimEnd().split('\n').map((l) => JSON.parse(l).line)).toEqual([1, 2, 3]);
    expect((await exportCall({})).statusCode).toBe(401);
  });

  it('a read-only token cannot export; the same Actor with an export token can; the audit carries the token id', async () => {
    const who = await holder();
    const readOnly = await token(who.id, [READ]);
    const denied = await exportCall(bearer(readOnly.value));
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'explorer.forbidden' });
    const exporting = await token(who.id, [EXPORT]);
    const ok = await exportCall(bearer(exporting.value), { range: { rows: 5 } });
    expect(ok.statusCode, ok.body).toBe(200);
    const rows = await audits(who.id);
    expect(rows.map((r) => r.result)).toEqual(['forbidden', 'ok']);
    expect(rows[0]).toMatchObject({ viaToken: true, api_token_id: readOnly.id });
    expect(rows[1]).toMatchObject({ viaToken: true, api_token_id: exporting.id });
  });

  it('the effective right is the issuer’s current permission ∩ the token scopes: a token cannot exceed its Actor', async () => {
    const who = await person('user');
    granted.set(who.id, new Set([owner]));
    const exporting = await token(who.id, [EXPORT, READ]); // scopes alone give nothing
    expect((await exportCall(bearer(exporting.value))).statusCode).toBe(403);
    expect((await read(bearer(exporting.value))).json().data).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held' });
  });

  it('the new scopes are accepted when a token is issued, an unknown one is not, and `explorer.investigate` can be a scope too', async () => {
    const who = await person('user');
    for (const scopes of [[EXPORT], [READ], ['explorer.investigate'], [READ, EXPORT, 'explorer.investigate']]) {
      const res = await app.inject({ method: 'POST', url: '/api-tokens', headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) }, payload: JSON.stringify({ name: 'scopes', scopes }) });
      expect(res.statusCode, res.body).toBe(201);
      tokenIds.push(res.json().item.id);
    }
    const bad = await app.inject({ method: 'POST', url: '/api-tokens', headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) }, payload: JSON.stringify({ name: 'bad', scopes: ['explorer.exports'] }) });
    expect(bad.statusCode).toBe(422);
  });

  it('a revoked token, a reduced permission and a revoked Source-owner grant are each refused on the very next call', async () => {
    const who = await holder();
    const t = await token(who.id, [EXPORT, READ]);
    expect((await exportCall(bearer(t.value), { range: { rows: 2 } })).statusCode).toBe(200);
    granted.set(who.id, new Set());
    expect((await exportCall(bearer(t.value))).statusCode).toBe(403);
    expect((await read(bearer(t.value))).json().data.state).toBe('permission_denied');
    granted.set(who.id, new Set([owner]));
    await revokeCapabilityGrant(dbHandle, who.grants[0] as string, admin.id);
    expect((await exportCall(bearer(t.value))).statusCode).toBe(403);
    await sql('update core.api_tokens set revoked_at = now() where id = $1', [t.id]);
    expect((await exportCall(bearer(t.value))).statusCode).toBe(401);
    expect((await read(bearer(t.value))).statusCode).toBe(401);
  });

  it('negative: another Source owner, a missing sample set owner grant, another workspace’s grant and no capability are all refused', async () => {
    const noOwner = await person('user');
    await grantCapability(dbHandle, WORKSPACE_ID, noOwner.id, EXPORT, null, admin.id);
    granted.set(noOwner.id, new Set(['someone-elses-owner']));
    expect((await exportCall(cookieHeader(noOwner.cookie))).json()).toMatchObject({ code: 'explorer.forbidden' });

    const none = await person('user');
    granted.set(none.id, new Set([owner]));
    expect((await exportCall(cookieHeader(none.cookie))).statusCode).toBe(403);
    // an Admin needs a grant like anyone else
    expect((await exportCall(cookieHeader(admin.cookie))).statusCode).toBe(403);

    const otherWs = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    const foreign = (await insertActorRow(dbHandle, { workspaceId: otherWs, externalId: `${TAG}-foreign`, roleLevel: 'user' })).id;
    actorIds.push(foreign);
    const inOther = await person('user');
    granted.set(inOther.id, new Set([owner]));
    await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [otherWs, inOther.id, EXPORT, foreign]);
    try {
      expect((await exportCall(cookieHeader(inOther.cookie))).statusCode).toBe(403);
    } finally {
      await sql('delete from permission.permission_grants where workspace_id = $1', [otherWs]);
      await sql('delete from core.audit_log where workspace_id = $1', [otherWs]);
      await sql('delete from core.workspaces where id = $1', [otherWs]).catch(() => undefined);
    }
  });

  it('a service token needs the explicit Source-owner grant on its service Actor', async () => {
    const svc = (
      await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`, [WORKSPACE_ID, `${TAG}-svc`, `${TAG}-svc@local`])
    ).rows[0].id as string;
    actorIds.push(svc);
    await grantCapability(dbHandle, WORKSPACE_ID, svc, EXPORT, null, admin.id);
    const issued = await app.inject({
      method: 'POST',
      url: '/api-tokens/service',
      headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
      payload: JSON.stringify({ name: 'svc', scopes: [EXPORT], actorId: svc }),
    });
    expect(issued.statusCode, issued.body).toBe(201);
    tokenIds.push(issued.json().item.id);
    const value = issued.json().token as string;
    expect((await exportCall(bearer(value))).statusCode).toBe(403);
    granted.set(svc, new Set([owner]));
    expect((await exportCall(bearer(value), { range: { rows: 3 } })).statusCode).toBe(200);
    granted.set(svc, new Set());
    expect((await exportCall(bearer(value))).statusCode).toBe(403);
  });

  it('range over 10,000 rows is 413 range_too_large and an investigation id is 422 with its own code', async () => {
    const who = await holder();
    const big = await exportCall(cookieHeader(who.cookie), { range: { rows: 10_001 } });
    expect(big.statusCode).toBe(413);
    expect(big.json()).toEqual({ code: 'explorer.range_too_large', message: expect.any(String) });
    expect((await audits(who.id)).at(-1)).toMatchObject({ result: 'range_too_large', rowCount: 0, bytes: 0 });
    const { sampleSet: _unused, ...rest } = body();
    const inv = await app.inject({
      method: 'POST',
      url: '/api/v1/log-explorer/export',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ ...rest, investigationId: randomUUID() }),
    });
    expect(inv.statusCode).toBe(422);
    expect(inv.json().code).toBe('explorer.investigation_unsupported');
    const bad = await exportCall(cookieHeader(who.cookie), { format: 'xlsx' });
    expect(bad.statusCode).toBe(422);
    expect(JSON.stringify(bad.json())).not.toContain('xlsx');
  });

  it('daily body budget: a token (or its Actor) at 50 MB is refused for reads and exports, never cut; a session is unaffected', async () => {
    const who = await holder();
    const t = await token(who.id, [EXPORT, READ]);
    await setCounter('t', t.id, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    const refusedExport = await exportCall(bearer(t.value));
    expect(refusedExport.statusCode).toBe(429);
    expect(refusedExport.json().code).toBe('explorer.budget_exceeded');
    const refusedRead = (await read(bearer(t.value))).json();
    expect(refusedRead).toMatchObject({ outcome: 'error', data: null, message: 'explorer.budget_exceeded' });
    expect((await audits(who.id, 'explorer.source.read')).at(-1)).toMatchObject({ result: 'budget_exceeded', rowCount: 0, bytes: 0, viaToken: true });
    // the Actor side holds across tokens
    const second = await token(who.id, [READ]);
    await setCounter('a', who.id, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    expect((await read(bearer(second.value))).json().message).toBe('explorer.budget_exceeded');
    expect((await exportCall(cookieHeader(who.cookie), { range: { rows: 2 } })).statusCode).toBe(200);
    expect((await read(cookieHeader(who.cookie))).json().data.state).toBe('ok');
  });

  it('token reads count against the token and Actor, and the admin usage read lists them; a non-admin and a token are refused', async () => {
    const who = await holder();
    const t = await token(who.id, [READ, EXPORT]);
    expect((await read(bearer(t.value))).json().data.state).toBe('ok');
    expect((await exportCall(bearer(t.value), { range: { rows: 4 } })).statusCode).toBe(200);
    const usage = await read(cookieHeader(admin.cookie), 'usage', {});
    expect(usage.statusCode).toBe(200);
    const out = usage.json().data;
    expect(out.limits).toEqual({ dailyBodyBytes: TOKEN_DAILY_BODY_BUDGET_BYTES, dailyExports: EXPORT_DAILY_MAX });
    const tokenRow = out.rows.find((r: { kind: string; id: string }) => r.kind === 'token' && r.id === t.id);
    expect(tokenRow).toMatchObject({ reads: 1, exports: 1, atLimit: false });
    expect(tokenRow.bytes).toBe(tokenRow.readBytes + tokenRow.exportBytes);
    expect(tokenRow.exportBytes).toBeGreaterThan(0);
    expect(out.rows.some((r: { kind: string; id: string }) => r.kind === 'actor' && r.id === who.id)).toBe(true);
    expect(JSON.stringify(out)).not.toContain('synthetic/a.log');
    expect((await read(cookieHeader(who.cookie), 'usage', {})).json().outcome).toBe('forbidden');
    const adminToken = await token(admin.id, [READ, EXPORT, 'workspace.read']);
    expect((await read(bearer(adminToken.value), 'usage', {})).json().outcome).toBe('forbidden');
  });

  it('one export at a time per Actor: a second request while the first is streaming is 429 export_busy; afterwards the lease is free', async () => {
    const who = await holder();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    hook.fn = (index) => (index === 1 ? gate : undefined);
    try {
      const first = await fetch(`${address}/api/v1/log-explorer/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
        body: JSON.stringify(body({ range: { rows: 60 } })),
      });
      expect(first.status).toBe(200);
      const second = await exportCall(cookieHeader(who.cookie));
      expect(second.statusCode).toBe(429);
      expect(second.json().code).toBe('explorer.export_busy');
      release();
      expect((await first.text()).length).toBeGreaterThan(2048);
    } finally {
      release();
      hook.fn = null;
    }
    let ok = 0;
    for (let i = 0; i < 20 && ok !== 200; i += 1) {
      ok = (await exportCall(cookieHeader(who.cookie), { range: { rows: 2 } })).statusCode;
      if (ok !== 200) await new Promise((r) => setTimeout(r, 50));
    }
    expect(ok).toBe(200);
  });

  it('daily count: 20 exports, then 429 export_daily_limit with its audit result', async () => {
    const who = await holder();
    for (let i = 0; i < EXPORT_DAILY_MAX; i += 1) {
      let status = 429;
      for (let tries = 0; tries < 20 && status === 429; tries += 1) {
        status = (await exportCall(cookieHeader(who.cookie), { range: { rows: 1 } })).statusCode;
        if (status === 429) await new Promise((r) => setTimeout(r, 25)); // the previous lease is released on stream close
      }
      expect(status).toBe(200);
    }
    const over = await exportCall(cookieHeader(who.cookie));
    expect(over.statusCode).toBe(429);
    expect(over.json().code).toBe('explorer.export_daily_limit');
    expect((await audits(who.id)).map((r) => r.result)).toContain('export_daily_limit');
  });

  it('a token revoked in the middle of a stream stops it at the next chunk boundary and the audit says revoked', async () => {
    const who = await holder();
    const t = await token(who.id, [EXPORT]);
    const address = await app.listen({ port: 0, host: '127.0.0.1' }).catch(() => `http://127.0.0.1:${(app.server.address() as { port: number }).port}`);
    hook.fn = async (index) => {
      if (index === 2) await sql('update core.api_tokens set revoked_at = now() where id = $1', [t.id]);
    };
    try {
      const res = await fetch(`${address}/api/v1/log-explorer/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(t.value) },
        body: JSON.stringify(body({ range: { rows: 60 } })),
      });
      expect(res.status).toBe(200);
      const declared = Number(res.headers.get('content-length'));
      expect(declared).toBeGreaterThan(2048 * 2);
      let received = 0;
      let failed = false;
      try {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('no body');
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
        }
      } catch {
        failed = true;
      }
      // The connection is cut before the declared length: the client can tell the file is not whole.
      expect(failed || received < declared).toBe(true);
      expect(received).toBeLessThan(declared);
    } finally {
      hook.fn = null;
    }
    let results: unknown[] = [];
    for (let i = 0; i < 30 && !results.includes('revoked'); i += 1) {
      results = (await audits(who.id)).map((r) => r.result);
      if (!results.includes('revoked')) await new Promise((r) => setTimeout(r, 100));
    }
    expect(results).toEqual(['ok', 'revoked']);
    expect((await exportCall(bearer(t.value))).statusCode).toBe(401);
  });

  it('production shape: a holder with no Source connected gets 503 source_unavailable; a non-holder gets 403 first', async () => {
    const bare = await buildServer({ config: loadConfig(), dbHandle, logExplorer: { sourceOwnerAccess: access } });
    await bare.ready();
    try {
      const who = await holder();
      const res = await exportCall(cookieHeader(who.cookie), {}, bare);
      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('explorer.source_unavailable');
      const none = await person('user');
      granted.set(none.id, new Set([owner]));
      expect((await exportCall(cookieHeader(none.cookie), {}, bare)).statusCode).toBe(403);
    } finally {
      await bare.close();
    }
  });
  it('C4: a token without the read scope is answered permission_denied through the server and leaves a body-free attempt audit (no Source access, no rows)', async () => {
    const who = await holder();
    const exportOnly = await token(who.id, [EXPORT]);
    for (const endpoint of ['records', 'window', 'parsed', 'periods']) {
      const params = endpoint === 'records' || endpoint === 'periods' ? { sampleSet: synthetic.sampleSet, query: {}, limit: 5 } : { sourceOwner: owner, fileRef: synthetic.sampleSet.files[0]?.fileRef, line: 2, ...(endpoint === 'window' ? { before: 1, after: 1 } : {}) };
      const res = await read(bearer(exportOnly.value), endpoint, params);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().data).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held' });
      expect(JSON.stringify(res.json())).not.toContain('synthetic/a.log line');
    }
    const rows = await audits(who.id, 'explorer.source.read');
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toMatchObject({ result: 'permission_denied', rowCount: 0, bytes: 0, viaToken: true, api_token_id: exportOnly.id });
    expect(JSON.stringify(rows)).not.toContain('synthetic/a.log');
  });

  it('C4: a malformed export body and an investigation id are audited body-free', async () => {
    const who = await holder();
    const bad = await exportCall(cookieHeader(who.cookie), { format: 'LEAKY-FORMAT' });
    expect(bad.statusCode).toBe(422);
    const { sampleSet: _unused, ...rest } = body();
    const inv = await app.inject({
      method: 'POST',
      url: '/api/v1/log-explorer/export',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ ...rest, investigationId: randomUUID() }),
    });
    expect(inv.statusCode).toBe(422);
    const rows = await audits(who.id);
    expect(rows.map((r) => r.result)).toEqual(['invalid_request', 'investigation_unsupported']);
    expect(rows[0]).toMatchObject({ sourceOwner: null, sampleSetDigest: null, format: null });
    expect(JSON.stringify(rows)).not.toContain('LEAKY-FORMAT');
  });

  it('C3: the daily budget charges the real HTTP body length of a token read', async () => {
    const who = await holder();
    const t = await token(who.id, [READ]);
    const res = await read(bearer(t.value));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.state).toBe('ok');
    const wire = res.rawPayload.length;
    expect((await audits(who.id, 'explorer.source.read')).at(-1)).toMatchObject({ result: 'ok', bytes: wire });
    const counter = await sql(`select counter from core.rate_limits where route_group = 'explorer_usage' and key = $1`, [`${WORKSPACE_ID}:t:${t.id}:bytes:${today()}`]);
    expect(Number(counter.rows[0]?.counter)).toBe(wire);
  });

  it('C5: a client that disconnects while authentication is pending cancels the export instead of reading the Source for nobody', async () => {
    const slow = await buildServer({
      config: loadConfig(),
      dbHandle,
      logExplorer: devLogExplorerServerOptions(access, 'slow'),
    });
    await slow.ready();
    try {
      const who = await holder();
      const address = await slow.listen({ port: 0, host: '127.0.0.1' });
      // Hold the session row: the authentication UPDATE (touch) waits on this lock until the client is already gone.
      const lock = await migrate.pool.connect();
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        await lock.query('commit');
        lock.release();
      };
      try {
        await lock.query('begin');
        await lock.query('select 1 from core.sessions where actor_id = $1 for update', [who.id]);
        const ctl = new AbortController();
        const pending = fetch(`${address}/api/v1/log-explorer/export`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` },
          body: JSON.stringify(body({ range: { rows: 5 } })),
          signal: ctl.signal,
        }).catch(() => null);
        await new Promise((r) => setTimeout(r, 200)); // the request is inside authentication, blocked on the lock
        ctl.abort();
        await pending;
        await new Promise((r) => setTimeout(r, 200)); // the socket close reached the server before authentication returns
        await release();
        let results: unknown[] = [];
        for (let i = 0; i < 40 && results.length === 0; i += 1) {
          results = (await audits(who.id)).map((r) => r.result);
          if (results.length === 0) await new Promise((r) => setTimeout(r, 100));
        }
        // The slow Source would take seconds and then answer ok; a cancelled read is audited aborted at once, with no rows.
        expect(results).toEqual(['aborted']);
        expect((await audits(who.id))[0]).toMatchObject({ rowCount: 0, bytes: 0 });
      } finally {
        await release();
      }
    } finally {
      await slow.close();
    }
  });

  it('C1: SQL lease release is ownership-aware: a late release of an expired lease does not free its replacement', async () => {
    const store = createUsageStore(dbHandle.db, () => new Date());
    const subject = { kind: 'actor', id: randomUUID() } as const;
    const first = await store.acquireLease(WORKSPACE_ID, subject);
    expect(first).not.toBeNull();
    expect(await store.acquireLease(WORKSPACE_ID, subject)).toBeNull(); // still held
    await sql(`update core.rate_limits set expires_at = now() - interval '1 second' where route_group = 'explorer_export_lease' and key = $1`, [`${WORKSPACE_ID}:a:${subject.id}`]);
    const second = await store.acquireLease(WORKSPACE_ID, subject); // the first ran out: replaced
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    await store.releaseLease(WORKSPACE_ID, subject, first as number); // late cleanup of the old export
    expect(await store.acquireLease(WORKSPACE_ID, subject)).toBeNull(); // the replacement still holds
    await store.releaseLease(WORKSPACE_ID, subject, second as number);
    const third = await store.acquireLease(WORKSPACE_ID, subject);
    expect(third).not.toBeNull();
    await store.releaseLease(WORKSPACE_ID, subject, third as number);
  });

  it('C6: with the clock past midnight between two adds, the pinned day keeps both on one set of counters (SQL)', async () => {
    let now = Date.UTC(2026, 10, 8, 23, 59, 59);
    const store = createUsageStore(dbHandle.db, () => new Date(now));
    const subjects = [{ kind: 'token', id: randomUUID() } as const, { kind: 'actor', id: randomUUID() } as const] as const;
    const day = store.today();
    await store.add(WORKSPACE_ID, subjects[0], 'bytes', 100, undefined, day);
    now += 2000;
    await store.add(WORKSPACE_ID, subjects[1], 'bytes', 100, undefined, day);
    expect(store.today()).toBe('2026-11-09');
    const rows = await sql(`select key from core.rate_limits where route_group = 'explorer_usage' and (key like $1 or key like $2)`, [`%${subjects[0].id}%`, `%${subjects[1].id}%`]);
    expect(rows.rows.map((r) => String(r.key).slice(-10))).toEqual(['2026-11-08', '2026-11-08']);
  });
});
