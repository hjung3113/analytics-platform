// #1442 — API token core (ADR-0116) through the real `buildServer`. Needs migration 0101 (`core.api_tokens`).
// Token-callable test endpoints/actions (module `itoken`) authorize through the real capability check, exactly like
// the production menu declarations, so the intersection rule, the session-only rule and the Admin bypass are
// exercised end to end. Run via `pnpm --filter @ap/platform-api test:integration`.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability, revokeCapabilityGrant } from '../../../test-support/permissions-fixtures.js';
import { createAuditService } from '../../core/audit/index.js';
import type { MenuActionDeclaration, MenuDispatchContribution, MenuEndpointDeclaration } from '../../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass, createCheckService } from '../../permissions/check-service.js';
import { hashToken } from '../token-format.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-token').replace(/[^a-z0-9]/gi, '');

type Person = { id: string; externalId: string; cookie: string; csrf: string };
const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
// A cookie-session menu-action is a mutating call: it needs the session's CSRF token (a Bearer call does not).
const cookieWrite = (p: { cookie: string; csrf: string }) => ({ ...cookieHeader(p.cookie), 'x-csrf-token': p.csrf });

describe.skipIf(!runIntegration)('API tokens: issue, revoke, auth hook, scope ∩ permission, audit (#1442)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let check: CheckService;
  let systemActorId: string;
  const actorIds: string[] = [];
  let n = 0;
  let admin: Person;
  let dev: Person;
  let devGrantId: string;

  // ── token-callable test menu: every decision goes through checkCapability ───────────────────────────
  const readId = `${PREFIX}.read`;
  const writeId = `${PREFIX}.write`;
  const publishId = `${PREFIX}.publish`;
  const manageId = `${PREFIX}.manage`;
  const holds = async (actor: { actor_id: string; workspace_id: string; role_level: string }, cap: Parameters<CheckService['checkCapability']>[1], tx?: Parameters<MenuActionDeclaration['authorize']>[1]) =>
    applyAdminModuleBypass(
      actor.role_level,
      cap,
      await check.checkCapability(actor, cap, { workspace_id: actor.workspace_id }, tx ? { tx } : {}),
    ).allow;
  const endpoint: MenuEndpointDeclaration = {
    spec: { id: readId, menuId: PREFIX, paramKeys: [], permission: 'itest:read', requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: (actor, tx) => holds(actor, 'knowledge.catalog.import', tx),
    validate: () => ({ ok: true }),
    handle: async () => ({ outcome: 'ok', data: [{ hello: 'world' }] }),
  };
  const action = (id: string, cap: Parameters<CheckService['checkCapability']>[1], write: boolean): MenuActionDeclaration => ({
    spec: { id, menuId: PREFIX, inputKeys: [], permission: `itest:${id}`, requiresScope: false, concurrency: 'none', invalidates: [] },
    authorize: (actor, tx) => holds(actor, cap, tx),
    validate: () => [],
    handle: async (tx, actor) => {
      if (write) {
        await createAuditService().record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'saved_view_visibility_changed',
          subject_type: 'saved_view',
          subject_id: randomUUID(),
          summary: 'token write probe',
          detail: { view_id: randomUUID(), version: 1, visibility: 'private', target_count: 0 },
        });
      }
      return { data: { ok: true }, version: null };
    },
  });
  const contribution: MenuDispatchContribution = {
    endpoints: [endpoint],
    // write: import capability (admin bypass 'always'); publish: session-only; manage: admin bypass 'always'.
    actions: [action(writeId, 'knowledge.catalog.import', true), action(publishId, 'knowledge.item.publish', false), action(manageId, 'improvement.manage', false)],
  };

  async function newPerson(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, externalId, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  /** A token row inserted directly (also the only way to get a session-only scope or an expired token). */
  async function rawToken(over: {
    actorId: string;
    scopes: string[];
    kind?: 'personal' | 'service';
    createdBy?: string;
    expiresAt?: string | null;
    revoked?: boolean;
  }): Promise<{ value: string; id: string }> {
    const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
    const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
    const res = await migrate.pool.query<{ id: string }>(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by)
       values ($1,$2,$3,'raw',$4,$5,$6,$7,$8,$9) returning id`,
      [WORKSPACE_ID, over.actorId, over.kind ?? 'personal', prefix, hashToken(value), over.scopes, over.expiresAt ?? null, over.revoked ? new Date() : null, over.createdBy ?? over.actorId],
    );
    return { value, id: res.rows[0]?.id as string };
  }

  const query = (headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...headers }, payload: JSON.stringify({ endpoint: readId, context: {}, params: {} }) });
  const act = (id: string, headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...headers },
      payload: JSON.stringify({ action: id, input: {}, context: {}, idempotencyKey: randomUUID() }),
    });
  const auditRows = async (eventType: string, actorId: string) =>
    (await migrate.pool.query<{ detail: Record<string, unknown>; subject_id: string }>(
      'select detail, subject_id from core.audit_log where event_type = $1 and actor_id = $2 order by created_at',
      [eventType, actorId],
    )).rows;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    check = createCheckService({ db: dbHandle.db });
    app = await buildServer({ config: loadConfig(), dbHandle, menuDispatch: [contribution] });
    await app.ready();
    admin = await newPerson('admin');
    dev = await newPerson('developer');
    const sys = await migrate.pool.query<{ id: string }>("select id from core.actors where workspace_id = $1 and external_id = 'system'", [WORKSPACE_ID]);
    systemActorId = sys.rows[0]?.id as string;
    devGrantId = await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'knowledge.catalog.import', null, admin.id);
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[]) => migrate.pool.query(text, params);
    await q('delete from core.api_tokens where workspace_id = $1 and (created_by = any($2) or actor_id = any($2))', [WORKSPACE_ID, actorIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await q(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    // Audit rows written for the shared system actor (failed-auth / service-token cases) are test-owned by prefix.
    await q("delete from core.audit_log where event_type like 'api_token.%' and actor_id = $1 and created_at > now() - interval '1 hour'", [systemActorId]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('issue and list', () => {
    it('returns the value once; the DB holds only its SHA-256; list never returns it', async () => {
      const res = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(dev.cookie), payload: { name: 'ci', scopes: ['knowledge.catalog.import'], expiresAt: null } });
      expect(res.statusCode).toBe(201);
      const { token, item } = res.json<{ token: string; item: { id: string; prefix: string; expiresAt: null } }>();
      expect(token).toMatch(/^ap_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
      expect(token.startsWith(`ap_${item.prefix}_`)).toBe(true);
      expect(item.expiresAt).toBeNull();
      const row = (await migrate.pool.query('select secret_hash, prefix from core.api_tokens where id = $1', [item.id])).rows[0];
      expect(row.secret_hash).toBe(hashToken(token));
      expect(row.secret_hash).not.toContain(token);
      const list = await app.inject({ method: 'GET', url: '/api-tokens', headers: cookieHeader(dev.cookie) });
      expect(list.body).not.toContain(token);
      expect(list.body).not.toContain(row.secret_hash);
      expect(list.json<{ items: Array<{ id: string; unusedWarning: boolean }> }>().items.find((i) => i.id === item.id)).toMatchObject({ unusedWarning: false });
      const issued = await auditRows('api_token.issue', dev.id);
      expect(JSON.stringify(issued)).not.toContain(token);
      expect(issued.at(-1)?.detail).toMatchObject({ token_id: item.id, kind: 'personal', prefix: item.prefix });
    });

    it.each([
      ['an unknown capability', ['nope.cap'], 'unknown_capability'],
      ['a session-only capability', ['knowledge.item.publish'], 'session_only'],
    ])('rejects %s as a scope with detail.fields', async (_label, scopes, code) => {
      const res = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(dev.cookie), payload: { name: 'bad', scopes } });
      expect(res.statusCode).toBe(422);
      expect(res.json().detail.fields).toEqual([{ path: ['scopes', 0], code }]);
    });

    it('lists a stale token with unusedWarning, and filters the admin list by noExpiry', async () => {
      const old = await rawToken({ actorId: dev.id, scopes: [] });
      await migrate.pool.query("update core.api_tokens set created_at = now() - interval '31 days' where id = $1", [old.id]);
      const mine = await app.inject({ method: 'GET', url: '/api-tokens', headers: cookieHeader(dev.cookie) });
      expect(mine.json<{ items: Array<{ id: string; unusedWarning: boolean }> }>().items.find((i) => i.id === old.id)?.unusedWarning).toBe(true);
      const all = await app.inject({ method: 'GET', url: '/api-tokens/service?noExpiry=true', headers: cookieHeader(admin.cookie) });
      const ids = all.json<{ items: Array<{ id: string; expiresAt: string | null }> }>().items;
      expect(ids.some((i) => i.id === old.id)).toBe(true);
      expect(ids.every((i) => i.expiresAt === null)).toBe(true);
    });
  });

  describe('service tokens', () => {
    it('are admin-only, for an existing system actor of the workspace', async () => {
      const body = { name: 'svc', scopes: ['workspace.read'], actorId: systemActorId };
      const denied = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(dev.cookie), payload: body });
      expect(denied.statusCode).toBe(403);
      const humanTarget = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { ...body, actorId: dev.id } });
      expect(humanTarget.statusCode).toBe(422);
      expect(humanTarget.json().detail.fields).toEqual([{ path: ['actorId'], code: 'not_system_actor' }]);
      const foreign = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { ...body, actorId: randomUUID() } });
      expect(foreign.statusCode).toBe(422);
      const ok = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: body });
      expect(ok.statusCode).toBe(201);
      const { token, item } = ok.json<{ token: string; item: { id: string; actorId: string } }>();
      expect(item.actorId).toBe(systemActorId);
      // The service token authenticates as the system actor (workspace.read in scope, held by role).
      expect((await query(bearer(token))).json().outcome).toBe('forbidden'); // catalog.import not in scope
      const revoke = await app.inject({ method: 'POST', url: `/api-tokens/service/${item.id}/revoke`, headers: cookieHeader(admin.cookie) });
      expect(revoke.statusCode).toBe(200);
      expect((await query(bearer(token))).statusCode).toBe(401);
    });

    it('a non-admin cannot revoke a workspace token through the service route', async () => {
      const t = await rawToken({ actorId: admin.id, scopes: [] });
      const res = await app.inject({ method: 'POST', url: `/api-tokens/service/${t.id}/revoke`, headers: cookieHeader(dev.cookie) });
      expect(res.statusCode).toBe(403);
      const own = await app.inject({ method: 'POST', url: `/api-tokens/${t.id}/revoke`, headers: cookieHeader(dev.cookie) });
      expect(own.statusCode).toBe(404); // not the caller's own token
    });
  });

  describe('session-only surfaces refuse a token', () => {
    it('token calls to issue / list / revoke are 403 session_required and audited', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['workspace.read'] });
      const calls = [
        { method: 'POST', url: '/api-tokens', payload: { name: 'x', scopes: [] } },
        { method: 'GET', url: '/api-tokens' },
        { method: 'POST', url: `/api-tokens/${t.id}/revoke` },
        { method: 'GET', url: '/me' }, // a route that never opted in
      ] as const;
      const before = (await auditRows('api_token.session_required_denied', dev.id)).length;
      for (const call of calls) {
        const res = await app.inject({ ...call, headers: bearer(t.value) } as never);
        expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
        expect(res.json().code).toBe('permission.session_required');
      }
      const rows = await auditRows('api_token.session_required_denied', dev.id);
      expect(rows.length - before).toBe(calls.length);
      expect(rows.at(-1)?.detail).toMatchObject({ token_id: t.id, method: 'GET' });
      const still = await migrate.pool.query('select revoked_at from core.api_tokens where id = $1', [t.id]);
      expect(still.rows[0].revoked_at).toBeNull();
    });

    it('a session-only capability is refused even when the scope names it (row inserted directly)', async () => {
      const t = await rawToken({ actorId: admin.id, scopes: ['knowledge.item.publish', 'workspace.read'] });
      const res = await act(publishId, bearer(t.value));
      // Wire result: the menu port's normal judged denial (HTTP 200), not the route-level 403 `permission.session_required`.
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ outcome: 'forbidden' });
      expect(res.json().code).toBeUndefined();
      // The capability-level refusal is audited like the route-level one: token id and capability, no secret.
      const denied = await auditRows('api_token.session_required_denied', admin.id);
      expect(denied.at(-1)?.detail).toMatchObject({ token_id: t.id, capability: 'knowledge.item.publish', method: 'POST' });
      expect(JSON.stringify(denied.at(-1)?.detail)).not.toContain(t.value);
      // Same action by the admin's cookie session: the Admin role bypass allows it — the refusal is the token's.
      expect((await act(publishId, cookieWrite(admin))).json().outcome).toBe('ok');
    });
  });

  describe('scope ∩ current permission, per call', () => {
    it('allows a scoped capability the issuer holds, denies one outside the scope, and follows a revoked grant', async () => {
      const inScope = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'] });
      const outOfScope = await rawToken({ actorId: dev.id, scopes: ['workspace.read'] });
      expect((await query(bearer(inScope.value))).json().outcome).toBe('ok');
      expect((await query(bearer(outOfScope.value))).json().outcome).toBe('forbidden');
      await revokeCapabilityGrant(dbHandle, devGrantId, admin.id);
      expect((await query(bearer(inScope.value))).json().outcome).toBe('forbidden'); // next call, no cache
      devGrantId = await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'knowledge.catalog.import', null, admin.id);
      expect((await query(bearer(inScope.value))).json().outcome).toBe('ok');
    });

    it("an admin's personal token is not widened by the Admin bypass", async () => {
      const t = await rawToken({ actorId: admin.id, scopes: ['workspace.read'] });
      // 'always'-bypass capabilities the Admin role holds by cookie, but the token does not list them:
      expect((await act(writeId, bearer(t.value))).json().outcome).toBe('forbidden');
      expect((await act(manageId, bearer(t.value))).json().outcome).toBe('forbidden');
      expect((await act(manageId, cookieWrite(admin))).json().outcome).toBe('ok');
      // Listing the capability opens exactly that one.
      const listed = await rawToken({ actorId: admin.id, scopes: ['improvement.manage'] });
      expect((await act(manageId, bearer(listed.value))).json().outcome).toBe('ok');
      expect((await act(writeId, bearer(listed.value))).json().outcome).toBe('forbidden');
    });

    it('a write by a token carries the token id in its audit detail; a cookie write does not', async () => {
      const t = await rawToken({ actorId: admin.id, scopes: ['knowledge.catalog.import'] });
      const res = await act(writeId, bearer(t.value));
      expect(res.json().outcome).toBe('ok');
      const rows = await auditRows('saved_view_visibility_changed', admin.id);
      expect(rows.some((r) => r.detail.api_token_id === t.id)).toBe(true);
      const before = rows.length;
      expect((await act(writeId, cookieWrite(admin))).json().outcome).toBe('ok');
      const after = await auditRows('saved_view_visibility_changed', admin.id);
      expect(after.length).toBe(before + 1);
      expect(after.at(-1)?.detail.api_token_id).toBeUndefined();
    });
  });

  describe('authentication', () => {
    const ipCounter = async () =>
      Number((await migrate.pool.query("select counter from core.rate_limits where key = '127.0.0.1' and route_group = 'global'")).rows[0]?.counter ?? 0);

    it('revoked / expired / unknown / malformed tokens get the identical 401, an auth_failed audit, and count in the IP bucket', async () => {
      const revoked = await rawToken({ actorId: dev.id, scopes: [], revoked: true });
      const expired = await rawToken({ actorId: dev.id, scopes: [], expiresAt: new Date(Date.now() - 1000).toISOString() });
      const unknown = `ap_${'a'.repeat(8)}_${'B'.repeat(43)}`;
      const values = [revoked.value, expired.value, unknown, 'not-a-token', ''];
      const bodies: string[] = [];
      const before = await ipCounter();
      for (const v of values) {
        const res = await query(bearer(v));
        expect(res.statusCode).toBe(401);
        bodies.push(JSON.stringify({ code: res.json().code, message: res.json().message }));
      }
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0] as string).code).toBe('auth.token_invalid');
      // Every rejected authentication counts once in the unauthenticated per-IP bucket (ADR-0116 decision 8); a
      // rejected value never gets a bucket of its own, even when it names a stored token.
      expect((await ipCounter()) - before).toBe(values.length);
      for (const t of [revoked, expired]) {
        const bucket = await migrate.pool.query("select counter from core.rate_limits where key = $1 and route_group = 'global'", [`${WORKSPACE_ID}:token:${t.id}`]);
        expect(bucket.rows.length).toBe(0);
      }
      const rows = await auditRows('api_token.auth_failed', dev.id);
      expect(rows.map((r) => r.detail.reason)).toEqual(expect.arrayContaining(['revoked', 'expired']));
      const all = await migrate.pool.query("select detail::text as d from core.audit_log where event_type = 'api_token.auth_failed' and created_at > now() - interval '5 minutes'");
      for (const r of all.rows) for (const v of values.filter((x) => x.length > 12)) expect(r.d).not.toContain(v);
    });

    it('a personal token whose creator is not the owning actor is refused', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'], createdBy: admin.id });
      expect((await query(bearer(t.value))).statusCode).toBe(401);
    });

    it('with both a Bearer header and a cookie, only the token is used', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'] });
      // valid token + the admin's cookie: the dev token's rights apply (dev holds import by grant), not the admin's
      const res = await act(writeId, { ...bearer(t.value), ...cookieHeader(admin.cookie) });
      expect(res.json().outcome).toBe('ok');
      const rows = await auditRows('saved_view_visibility_changed', dev.id);
      expect(rows.some((r) => r.detail.api_token_id === t.id)).toBe(true);
      // invalid token + a valid cookie: 401, the cookie is not a fallback
      const bad = await query({ ...bearer(`ap_${'c'.repeat(8)}_${'D'.repeat(43)}`), ...cookieHeader(admin.cookie) });
      expect(bad.statusCode).toBe(401);
    });

    it.each([
      ['revoked', async () => (await rawToken({ actorId: dev.id, scopes: [], revoked: true })).value],
      ['expired', async () => (await rawToken({ actorId: dev.id, scopes: [], expiresAt: new Date(Date.now() - 1000).toISOString() })).value],
      ['unknown', async () => `ap_${'e'.repeat(8)}_${'F'.repeat(43)}`],
      ['malformed', async () => 'not-a-token'],
      ['wrong owner', async () => (await rawToken({ actorId: dev.id, scopes: [], createdBy: admin.id })).value],
    ])('a %s token counts exactly once in the IP bucket', async (_kind, make) => {
      const value = await make();
      const before = await ipCounter();
      expect((await query(bearer(value))).statusCode).toBe(401);
      expect((await ipCounter()) - before).toBe(1);
    });

    it.each(['Bearer', 'bearer ', 'Bearer    '])(
      'an Authorization header %j with no credential is a failed token auth, never the cookie',
      async (authorization) => {
        const before = await ipCounter();
        const list = await app.inject({ method: 'GET', url: '/api-tokens', headers: { authorization, ...cookieHeader(dev.cookie) } });
        expect(list.statusCode).toBe(401);
        expect(list.json().code).toBe('auth.token_invalid');
        const write = await act(writeId, { authorization, ...cookieWrite(admin) });
        expect(write.statusCode).toBe(401);
        expect(write.json().code).toBe('auth.token_invalid');
        expect((await ipCounter()) - before).toBe(2);
      },
    );

    it('a header with a non-Bearer scheme stays cookie-eligible', async () => {
      const res = await app.inject({ method: 'GET', url: '/api-tokens', headers: { authorization: 'Basic abc', ...cookieHeader(dev.cookie) } });
      expect(res.statusCode).toBe(200);
    });

    it('stamps last_used_at / last_used_ip and throttles the stamp to once a minute', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'] });
      await query(bearer(t.value));
      const first = (await migrate.pool.query('select last_used_at, last_used_ip from core.api_tokens where id = $1', [t.id])).rows[0];
      expect(first.last_used_at).not.toBeNull();
      expect(first.last_used_ip).not.toBeNull();
      await query(bearer(t.value));
      const second = (await migrate.pool.query('select last_used_at from core.api_tokens where id = $1', [t.id])).rows[0];
      expect(second.last_used_at.getTime()).toBe(first.last_used_at.getTime());
    });

    it('uses a per-token rate-limit bucket', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'] });
      await query(bearer(t.value));
      const r = await migrate.pool.query('select counter from core.rate_limits where key = $1', [`${WORKSPACE_ID}:token:${t.id}`]);
      expect(Number(r.rows[0]?.counter)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('token mutation tier (C3)', () => {
    it('the 11th token menu-action in the window is 429; menu-query keeps the read tier; a cookie session is unaffected', async () => {
      const t = await rawToken({ actorId: dev.id, scopes: ['knowledge.catalog.import'] });
      for (let i = 0; i < 10; i++) expect((await act(writeId, bearer(t.value))).statusCode, `call ${i + 1}`).toBe(200);
      const eleventh = await act(writeId, bearer(t.value));
      expect(eleventh.statusCode).toBe(429);
      expect(eleventh.json().code).toBe('rate_limited.actor');
      expect((await query(bearer(t.value))).statusCode).toBe(200);
      for (let i = 0; i < 11; i++) expect((await act(writeId, cookieWrite(admin))).statusCode, `cookie ${i + 1}`).toBe(200);
    });
  });

  describe('keyset pagination of the token lists (C4)', () => {
    type Page = { items: Array<{ id: string; expiresAt: string | null }>; nextCursor: string | null };
    async function walk(url: string, headers: Record<string, string>, limit: number): Promise<{ ids: string[]; pages: number; items: Page['items'] }> {
      const ids: string[] = [];
      const items: Page['items'] = [];
      let cursor = null as string | null;
      let pages = 0;
      do {
        const sep = url.includes('?') ? '&' : '?';
        const res: Awaited<ReturnType<typeof app.inject>> = await app.inject({ method: 'GET', url: `${url}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, headers });
        expect(res.statusCode).toBe(200);
        const page = res.json<Page>();
        expect(page.items.length).toBeLessThanOrEqual(limit);
        ids.push(...page.items.map((i) => i.id));
        items.push(...page.items);
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 200);
      return { ids, pages, items };
    }

    it('an old live token behind newer revoked rows is reachable; no row repeats; order is created_at desc, id desc', async () => {
      const owner = await newPerson('user');
      const old = await rawToken({ actorId: owner.id, scopes: [] });
      await migrate.pool.query("update core.api_tokens set created_at = now() - interval '40 days' where id = $1", [old.id]);
      const newer: string[] = [];
      for (let i = 0; i < 5; i++) newer.push((await rawToken({ actorId: owner.id, scopes: [], revoked: true })).id);
      const { ids, pages } = await walk('/api-tokens', cookieHeader(owner.cookie), 2);
      expect(pages).toBe(3);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(old.id);
      expect(ids.at(-1)).toBe(old.id);
      expect([...ids].sort()).toEqual([old.id, ...newer].sort());
      const ordered = await migrate.pool.query<{ id: string }>('select id from core.api_tokens where created_by = $1 and kind = $2 order by created_at desc, id desc', [owner.id, 'personal']);
      expect(ids).toEqual(ordered.rows.map((r) => r.id));
    });

    it('the admin list keeps noExpiry across pages; limit and cursor are validated', async () => {
      const a = await rawToken({ actorId: admin.id, scopes: [] });
      await rawToken({ actorId: admin.id, scopes: [], expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
      const b = await rawToken({ actorId: admin.id, scopes: [] });
      const { ids, items, pages } = await walk('/api-tokens/service?noExpiry=true', cookieHeader(admin.cookie), 1);
      expect(pages).toBeGreaterThan(2);
      expect(items.every((i) => i.expiresAt === null)).toBe(true);
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of ['limit=0', 'limit=201', 'limit=abc', 'cursor=%25%25']) {
        const res = await app.inject({ method: 'GET', url: `/api-tokens?${q}`, headers: cookieHeader(admin.cookie) });
        expect(res.statusCode, q).toBe(422);
      }
      // Timestamp-shaped but impossible: must stay a cursor validation error, not reach the SQL cast (500).
      const impossible = Buffer.from('2026-99-99T99:99:99.000000Z,11111111-1111-4111-8111-111111111111').toString('base64url');
      for (const path of ['/api-tokens', '/api-tokens/service']) {
        const res = await app.inject({ method: 'GET', url: `${path}?cursor=${impossible}`, headers: cookieHeader(admin.cookie) });
        expect(res.statusCode, path).toBe(422);
        expect(res.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['cursor'] }] } });
      }
      const dflt = await app.inject({ method: 'GET', url: '/api-tokens', headers: cookieHeader(admin.cookie) });
      expect(dflt.json<Page>()).toHaveProperty('nextCursor');
    });
  });
});
