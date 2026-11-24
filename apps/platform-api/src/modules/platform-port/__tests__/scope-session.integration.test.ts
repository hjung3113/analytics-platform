import { bootstrapHttpAdapter } from '@ap/http-adapter';
import { planServerConformance, type ServerConformanceHarness } from '@ap/server-conformance';
import { generateKeyPairSync } from 'node:crypto';
import { jwtVerify, type JWTPayload } from 'jose';
import pino from 'pino';
import { createHttpScopeResolver } from '../../menu-dispatch/http-scope-resolver.js';
import { createMenuForwarder } from '../../menu-dispatch/forwarder.js';
import { createIdentityTokenSigner } from '../../menu-dispatch/identity-token.js';
import type { MenuDispatchContribution } from '../../menu-dispatch/types.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { type AuthStore, runWithAuthStore } from '../../../lib/auth-context.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs, SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { recordStatements } from '../../../test-support/statement-recorder.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createPlatformPermissionResolver, createRequestReads, holdsPlatformPermission } from '../permissions.js';
import { createSessionState } from '../session-snapshot.js';
import type { LoadedSession } from '../transport.js';
import { denyCapability, grantCapability, insertScopePermissionRow } from '../../../test-support/permissions-fixtures.js';
import { createGrantTableScopeResolver } from '../../permissions/grant-table-scope-resolver.js';
import { parseScopeCatalog } from '../../permissions/scope-catalog.js';
import { generateToken } from '../../api-tokens/token-format.js';
import { declaredContribution } from '../../menu-dispatch/declared-endpoints.js';
import type { DeclarationBundleInput } from '../../menu-dispatch/declarations-file.js';
import { defined } from '../../../test-support/defined.js';
import { menuSnapshotFor } from '../../../test-support/menu-snapshot.js';
import { sessionVersionOf } from '../session-version.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE);
const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'A', rooms: ['RA2', 'RA1'] },
  { site: 'SITE-B', label: 'B', rooms: ['RB1', 'RB2'] },
  { site: 'SITE-C', label: 'C', rooms: ['RC1'] },
]);
const declaredPermissions = [
  { permission: 'query-count:view', capability: 'workspace.read' },
  { permission: 'query-count:triage', capability: 'voc.triage' },
  { permission: 'query-count:publish', capability: 'knowledge.item.publish' },
] as const;
const allowedEnvelope = { outcome: 'ok', data: [{ value: 42 }], assessments: [], trust: null };
const deniedEnvelope = { outcome: 'forbidden', data: null, assessments: [], trust: null };
const grantedRoom = { scopeId: 'SITE-A', roomNames: ['RA1'] };

function queryFixture(dbHandle: DbHandle) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const claims: JWTPayload[] = [];
  const forwarder = createMenuForwarder({
    baseUrl: 'https://synthetic.test',
    timeoutMs: 1000,
    signer: createIdentityTokenSigner({
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'query-count',
    }),
    fetch: async (url, init) => {
      const correlationId = init.headers['x-correlation-id'];
      const { payload } = await jwtVerify(defined(init.headers['x-internal-identity']), publicKey, {
        algorithms: ['EdDSA'],
        audience: 'analytics',
      });
      expect(payload).toMatchObject({ cid: correlationId, htm: init.method, htu: new URL(url).pathname });
      claims.push(payload);
      return { ok: true, status: 200, json: async () => ({ ...allowedEnvelope, correlationId }) };
    },
  });
  const bundle = {
    actions: [],
    permissions: declaredPermissions,
    endpoints: ([
      { id: 'query-count.scope', menuId: 'query-count', permission: 'query-count:view', requiresScope: true, context: { roomNames: 'apply' } },
      { id: 'query-count.triage', menuId: 'query-count', permission: 'query-count:triage', requiresScope: true, context: { roomNames: 'apply' } },
      { id: 'query-count.local', menuId: 'query-count', permission: 'platform:view', requiresScope: false, context: { time: 'apply' }, limits: { maxHours: 1 } },
      { id: 'query-count.publish', menuId: 'query-count', permission: 'query-count:publish', requiresScope: false, context: {} },
    ] as const).map((row) => ({ ...row, paramKeys: [], mergeTimeDomain: false })),
    endpointOwners: {
      'query-count.scope': '/rows',
      'query-count.triage': '/rows',
      'query-count.local': '/rows',
      'query-count.publish': '/rows',
    },
  } as const satisfies DeclarationBundleInput;
  const contribution = declaredContribution({
    bundle,
    snapshot: menuSnapshotFor(bundle),
    checkService: createCheckService({ db: dbHandle.db }),
    forwarder,
  });
  return { claims, contribution };
}

function dispatch(server: FastifyInstance, auth: Record<string, string>, endpoint: string, context = {}) {
  return server.inject({
    method: 'POST', url: '/api/v1/menu-query', headers: auth,
    payload: { endpoint, params: {}, context },
  });
}

describe.skipIf(!runIntegration)('Scope session and check through buildServer', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let actorId: string;
  let cookie: string;
  const apps: FastifyInstance[] = [];
  const dispatchActors: string[] = [];
  const headers = () => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const get = (path: string, server = app) => server.inject({ method: 'GET', url: `/api/v1/platform${path}`, headers: headers() });
  const grant = (kind: string, site: string, room: string | null = null) => insertScopePermissionRow(handle, {
    table: 'permission_grants', workspaceId: WORKSPACE, actorId, kind, site, room,
  });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    actorId = (await insertActorRow(handle, { workspaceId: WORKSPACE, externalId: 'it-1844d-user', roleLevel: 'user' })).id;
    app = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog });
    apps.push(app);
    await app.ready();
    cookie = await loginAs(app, 'it-1844d-user');
  });
  beforeEach(async () => {
    await migrate.pool.query('delete from permission.permission_grants where actor_id = $1', [actorId]);
  });
  afterAll(async () => {
    for (const server of apps) await server.close();
    const actors = [...dispatchActors, ...(actorId ? [actorId] : [])];
    if (migrate && actors.length) {
      for (const [table, column] of [
        ['core.audit_log', 'actor_id'], ['core.api_tokens', 'actor_id'],
        ['permission.permission_denies', 'actor_id'], ['permission.permission_grants', 'actor_id'],
        ['core.sessions', 'actor_id'], ['core.actors', 'id'],
      ]) {
        await migrate.pool.query(`delete from ${table} where ${column} = any($1::uuid[])`, [actors]);
      }
    }
    await handle?.close();
    await migrate?.close();
  });
  it('lists full and partial grants, separates requestable sites and never leaks ungranted room names', async () => {
    await grant('site', 'SITE-A');
    await grant('site_room', 'SITE-B', 'RB2');
    const response = await get('/bootstrap');
    expect(response.statusCode).toBe(200);
    expect(response.json().session.scopes).toEqual([
      { id: 'SITE-A', label: 'A', grantedRooms: 2, totalRooms: 2 },
      { id: 'SITE-B', label: 'B', grantedRooms: 1, totalRooms: 2 },
    ]);
    expect(response.json().session.requestableScopes).toEqual([{ id: 'SITE-C', label: 'C', totalRooms: 1 }]);
    expect(response.body).not.toMatch(/RB1|RC1/);
  });
  it('checks valid, forbidden and unknown scopes with plain no-store responses and session authentication', async () => {
    await grant('site', 'SITE-A');
    await grant('site_room', 'SITE-B', 'RB2');
    for (const [site, status, grantedRooms] of [
      ['SITE-A', 'valid', ['RA2', 'RA1']], ['SITE-B', 'valid', ['RB2']],
      ['SITE-C', 'forbidden', []], ['SITE-X', 'unknown_scope', []],
    ] as const) {
      const response = await get(`/scopes/${site}/check`);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ status, grantedRooms });
      expect(response.body).not.toMatch(/RB1|RC1/);
    }
    expect((await app.inject({ method: 'GET', url: '/api/v1/platform/scopes/SITE-A/check' })).statusCode).toBe(401);
  });
  it('passes the existing session and validateScope conformance cases over the real HTTP adapter', async () => {
    await grant('site', 'SITE-A');
    await grant('site_room', 'SITE-B', 'RB2');
    const result = await bootstrapHttpAdapter({ fetch: async (input) => {
      const response = await app.inject({ method: 'GET', url: String(input), headers: headers() });
      return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> });
    } });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('bootstrap failed');
    const sample: ServerConformanceHarness = {
      adapter: result.adapter, cases: [], implemented: ['session', 'validateScope'],
      context: { scopeId: 'SITE-A', from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00' }, foreignScopeId: 'SITE-C',
      ports: {
        otherGrantedScopeId: 'SITE-B', entity: { ref: { type: 'synthetic', id: 'synthetic', scopeId: 'SITE-A' }, permission: 'platform:view' },
        annotation: { chartId: 'synthetic', from: '0', to: '1', permission: 'platform:view' },
        usage: { name: 'entry', at: 1767225600000, menuId: 'synthetic', spaceId: null, path: '/synthetic', sessionId: 'synthetic' },
        clientError: { name: 'Error', correlationId: 'client-synthetic', menuId: 'synthetic', spaceId: null, path: '/synthetic' },
      },
      asGranted: fn => fn(), withoutPermission: (_permission, fn) => fn(), asConsole: fn => fn(), asOtherAnnotator: fn => fn(),
    };
    const checks = planServerConformance(sample).filter(check => check.mode !== 'skipped' && check.uses?.every(use => use === 'session' || use === 'validateScope'));
    expect(checks).toHaveLength(7);
    for (const check of checks) expect(await check.run(), check.id).toBeNull();
  });
  it('rechecks grants on the next request after revocation without restarting', async () => {
    const id = await grant('site', 'SITE-A');
    const first = (await get('/bootstrap')).json();
    expect((await get('/scopes/SITE-A/check')).json().status).toBe('valid');
    await handle.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [id]);
    expect((await get('/scopes/SITE-A/check')).json()).toEqual({ status: 'forbidden', grantedRooms: [] });
    const second = (await get('/bootstrap')).json();
    expect(second.session.scopes).toEqual([]);
    expect(second.sessionVersion).not.toBe(first.sessionVersion);
  });
  it('changes sessionVersion and identity sv when a granted room is replaced at the same count, without exposing room names', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    let sv: string | undefined;
    const forwarder = createMenuForwarder({ baseUrl: 'https://synthetic.test', timeoutMs: 1000,
      signer: createIdentityTokenSigner({ privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), keyId: 'synthetic' }),
      fetch: async (_url, init) => {
        sv = JSON.parse(Buffer.from((init.headers['x-internal-identity'] ?? '').split('.')[1] ?? '', 'base64url').toString()).sv;
        return { ok: true, status: 200, json: async () => ({ outcome: 'ok', data: [], assessments: [], trust: null, correlationId: init.headers['x-correlation-id'] }) };
      },
    });
    const contribution: MenuDispatchContribution = { endpoints: [{
      spec: { id: 'synthetic.replace', menuId: 'synthetic', paramKeys: [], permission: 'platform:view', requiresScope: true,
        context: { roomNames: 'apply' }, mergeTimeDomain: false },
      authorize: async () => true, validate: () => ({ ok: true }),
      handle: args => forwarder.forward({ endpointId: 'synthetic.replace', path: '/rows', args }),
    }] };
    const server = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog, menuDispatch: [contribution] });
    apps.push(server);
    const query = (room: string) => server.inject({ method: 'POST', url: '/api/v1/menu-query', headers: headers(),
      payload: { endpoint: 'synthetic.replace', params: {}, context: { scopeId: 'SITE-A', roomNames: [room] } } });
    const ra1 = await grant('site_room', 'SITE-A', 'RA1');
    const before = await get('/bootstrap', server);
    const beforeState = await get('/session-state', server);
    expect(beforeState.json().sessionVersion).toBe(before.json().sessionVersion);
    await grant('site_room', 'SITE-A', 'RA2');
    await handle.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [ra1]);
    const after = await get('/bootstrap', server);
    const afterState = await get('/session-state', server);
    expect(after.json().session).toEqual(before.json().session);
    expect(after.json().sessionVersion).not.toBe(before.json().sessionVersion);
    expect(afterState.json().sessionVersion).toBe(after.json().sessionVersion);
    expect((await get('/scopes/SITE-A/check', server)).json()).toEqual({ status: 'valid', grantedRooms: ['RA2'] });
    expect((await query('RA2')).json().outcome).toBe('ok');
    expect(sv).toBe(after.json().sessionVersion);
    for (const response of [before, beforeState, after, afterState]) expect(response.body).not.toMatch(/RA1|RA2/);
  });
  it('fails closed on resolver errors and omits requestableScopes for that snapshot', async () => {
    const failing = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog,
      scopeResolver: { resolve: async () => { throw new Error('private grant data'); } } });
    apps.push(failing);
    expect((await get('/scopes/SITE-A/check', failing)).json()).toEqual({ status: 'forbidden', grantedRooms: [] });
    const response = await get('/bootstrap', failing);
    expect(response.json().session.scopes).toEqual([]);
    expect(response.json().session).not.toHaveProperty('requestableScopes');
    expect(response.body).not.toContain('private grant');
  });
  it('uses the grant-table resolver for requiresScope dispatch and forwarded identity claims', async () => {
    await grant('site_room', 'SITE-A', 'RA1');
    const { privateKey } = generateKeyPairSync('ed25519');
    let claims: { scopes: string[]; sv: string } | undefined;
    const forwarder = createMenuForwarder({ baseUrl: 'https://synthetic.test', timeoutMs: 1000,
      signer: createIdentityTokenSigner({ privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), keyId: 'synthetic' }),
      fetch: async (_url, init) => {
        const token = init.headers['x-internal-identity'] ?? '';
        claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
        return { ok: true, status: 200, json: async () => ({ outcome: 'ok', data: [], assessments: [], trust: null, correlationId: init.headers['x-correlation-id'] }) };
      },
    });
    const contribution: MenuDispatchContribution = { endpoints: [{
      spec: { id: 'synthetic.scope', menuId: 'synthetic', paramKeys: [], permission: 'platform:view', requiresScope: true,
        context: { roomNames: 'apply' }, mergeTimeDomain: false },
      authorize: async () => true, validate: () => ({ ok: true }),
      handle: args => forwarder.forward({ endpointId: 'synthetic.scope', path: '/rows', args }),
    }] };
    const server = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog, menuDispatch: [contribution] });
    apps.push(server);
    const query = (room: string) => server.inject({ method: 'POST', url: '/api/v1/menu-query', headers: headers(),
      payload: { endpoint: 'synthetic.scope', params: {}, context: { scopeId: 'SITE-A', roomNames: [room] } } });
    expect((await query('RA1')).json().outcome).toBe('ok');
    expect(claims?.scopes.map(value => JSON.parse(value))).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
    expect(claims?.sv).toBe((await get('/bootstrap', server)).json().sessionVersion);
    expect((await query('RA2')).json().outcome).toBe('forbidden');
    await expect(buildServer({ config: loadConfig(), dbHandle: handle, menuDispatch: [contribution] })).rejects.toThrow('no Scope resolver');
  });
  it('keeps the forwarded envelope, denied room and bootstrap sv with five unique warm SQL statements', async () => {
    await grant('site_room', 'SITE-A', 'RA1');
    const recorder = recordStatements(handle);
    const { contribution, claims } = queryFixture(recorder.handle);
    const server = await buildServer({ config: loadConfig(), dbHandle: recorder.handle, scopeCatalog: catalog, menuDispatch: [contribution] });
    apps.push(server);
    const query = (endpoint: string, context = {}) => dispatch(server, headers(), endpoint, context);
    const boot = await get('/bootstrap', server);
    const { result, statements, poolStatements, drizzleStatements } = await recorder.capture(() =>
      query('query-count.scope', { scopeId: 'SITE-A', roomNames: ['RA1'] }),
    );
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ ...allowedEnvelope, correlationId: expect.any(String) });
    expect(claims.map(({ sv }) => sv)).toEqual([boot.json().sessionVersion]);
    const rejected = await query('query-count.scope', { scopeId: 'SITE-A', roomNames: ['RA2'] });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toEqual({
      ...deniedEnvelope, correlationId: expect.any(String),
      recovery: { deniedScope: { kind: 'site_room', site: 'SITE-A', room: 'RA2' } },
    });
    expect(claims).toHaveLength(1);
    // A declared limit short-circuits after authorization, before forwarding needs a session version.
    const local = await recorder.capture(() => query('query-count.local', {
      from: '2026-10-13T00:00:00', to: '2026-10-13T02:00:00',
    }));
    expect(local.result.statusCode).toBe(200);
    expect(local.result.json()).toEqual({
      ...deniedEnvelope, outcome: 'too_large', recovery: { maxHours: 1 }, correlationId: expect.any(String),
    });
    const localPerms = local.statements.filter(({ text }) => text.includes('permission_grants') || text.includes('permission_denies'));
    expect(localPerms).toEqual([]);
    expect(poolStatements.some(({ text }) => text.includes('core.rate_limits'))).toBe(true);
    expect(drizzleStatements.some(({ text }) => text.includes('permission_grants'))).toBe(true);
    console.info('warm forward SQL', statements.length, 'unique', new Set(statements.map(row => JSON.stringify(row))).size, 'platform:view permission SQL', localPerms.length);
    expect(new Set(statements.map(row => JSON.stringify(row))).size).toBe(statements.length);
    expect(statements).toHaveLength(5);
  });

  it('pins declared query envelopes, forwarded identity and persisted audit across cookie and Bearer calls', async () => {
    const { contribution, claims } = queryFixture(handle);
    const server = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog, menuDispatch: [contribution] });
    apps.push(server);
    const managedSystem = defined((await handle.pool.query<{ id: string }>(
      'select id from core.managed_systems where workspace_id = $1 order by id limit 1', [WORKSPACE],
    )).rows[0]).id;
    const auditOf = async (id: string) => (await migrate.pool.query<{
      id: string; event_type: string; subject_type: string; subject_id: string; detail: unknown;
    }>('select id, event_type, subject_type, subject_id, detail from core.audit_log where actor_id = $1', [id])).rows;

    for (const [roleLevel, state, allowed] of [
      ['admin', 'implicit', true],
      ['developer', 'direct', true],
      ['user', 'direct', true],
      ['developer', 'system', false],
      ['admin', 'deny', false],
      ['developer', 'expired', false],
      ['developer', 'revoked', false],
    ] as const) {
      const externalId = `it-2808-dispatch-${roleLevel}-${state}`;
      const { id } = await insertActorRow(handle, { workspaceId: WORKSPACE, externalId, roleLevel });
      dispatchActors.push(id);
      if (state !== 'implicit') {
        const grantId = await grantCapability(migrate, WORKSPACE, id, 'voc.triage', state === 'system' ? managedSystem : null, id);
        if (state === 'deny') await denyCapability(migrate, WORKSPACE, id, 'voc.triage', null, id);
        if (state === 'expired') await migrate.pool.query("update permission.permission_grants set expires_at = '2026-01-01' where id = $1", [grantId]);
        if (state === 'revoked') await migrate.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [grantId]);
      }
      await insertScopePermissionRow(handle, {
        table: 'permission_grants', workspaceId: WORKSPACE, actorId: id,
        kind: 'site_room', site: 'SITE-A', room: 'RA1',
      });
      const cookie = await loginAs(server, externalId);
      const cookieHeaders = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const bootstrap = await server.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeaders });
      expect(bootstrap.statusCode).toBe(200);
      const { session, sessionVersion } = bootstrap.json();
      const auditBefore = await auditOf(id);
      const auditDelta = async () => (await auditOf(id)).filter((row) => !auditBefore.some(({ id }) => id === row.id));
      const invoke = async (auth: Record<string, string>, endpoint: string, context: object, envelope: object, sv?: string) => {
        const forwarded = claims.length;
        const result = await dispatch(server, auth, `query-count.${endpoint}`, context);
        expect(result.statusCode, `${roleLevel}/${state} ${endpoint}`).toBe(200);
        expect(result.json()).toEqual({ ...envelope, correlationId: expect.any(String) });
        expect(claims.slice(forwarded)).toEqual(sv === undefined ? [] : [expect.objectContaining({
          sub: id, wid: WORKSPACE, sv, cid: result.json().correlationId,
          scopes: 'scopeId' in context ? [JSON.stringify({ site: 'SITE-A', rooms: ['RA1'] })] : [],
        })]);
      };
      const noTriage = { ...deniedEnvelope, message: 'No permission query-count:triage' };
      expect(session.user.permissions.includes('query-count:triage')).toBe(allowed);
      await invoke(cookieHeaders, 'triage', grantedRoom, allowed ? allowedEnvelope : noTriage, allowed ? sessionVersion : undefined);
      expect(await auditDelta()).toEqual([]);

      if (state !== 'implicit') continue;
      await invoke(cookieHeaders, 'publish', {}, allowedEnvelope, sessionVersion);

      async function bearer(scopes: string[]) {
        const token = generateToken();
        const { rows } = await migrate.pool.query<{ id: string }>(
          `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by)
           values ($1,$2,'personal','dispatch fixture',$3,$4,$5,$2) returning id`,
          [WORKSPACE, id, token.prefix, token.hash, scopes],
        );
        return { auth: { authorization: `Bearer ${token.value}` }, tokenId: defined(rows[0]).id };
      }

      const read = await bearer(['workspace.read', 'scope.read', 'voc.triage', 'knowledge.item.publish']);
      const tokenSession = {
        ...session,
        user: {
          ...session.user,
          permissions: ['features:access', 'notice:view', 'platform:view', 'query-count:triage', 'query-count:view', 'voc:view'],
        },
      };
      const tokenVersion = sessionVersionOf({ session: tokenSession, grants: [JSON.stringify(['SITE-A', 'RA1'])] });
      expect(tokenVersion).not.toBe(sessionVersion);
      await invoke(read.auth, 'triage', grantedRoom, allowedEnvelope, tokenVersion);
      // Descriptive permission enumeration sees the session-only declaration during the allowed call.
      expect(await auditDelta()).toEqual([]);
      await invoke(read.auth, 'triage', { scopeId: 'SITE-A', roomNames: ['RA2'] }, {
        ...deniedEnvelope, recovery: { deniedScope: { kind: 'site_room', site: 'SITE-A', room: 'RA2' } },
      });
      await invoke((await bearer(['workspace.read', 'voc.triage'])).auth, 'triage', grantedRoom, deniedEnvelope);
      await invoke((await bearer(['workspace.read', 'scope.read'])).auth, 'triage', grantedRoom, noTriage);
      expect(await auditDelta()).toEqual([]);

      await invoke(read.auth, 'publish', {}, { ...deniedEnvelope, message: 'No permission query-count:publish' });
      expect(await auditDelta()).toEqual([{
        id: expect.any(String),
        event_type: 'api_token.session_required_denied',
        subject_type: 'api_token',
        subject_id: read.tokenId,
        detail: {
          api_token_id: read.tokenId, token_id: read.tokenId, method: 'POST',
          route: '/api/v1/menu-query', capability: 'knowledge.item.publish',
        },
      }]);
    }
  });

  it('matches separate-read permission, session version and audit decisions across roles, grants and auth modes', async () => {
    const managedSystem = (await handle.pool.query<{ id: string }>(
      'select id from core.managed_systems where workspace_id = $1 limit 1', [WORKSPACE],
    )).rows[0]?.id;
    if (!managedSystem) throw new Error('missing seeded Managed System');
    const check = createCheckService({ db: handle.db, now: () => new Date('2026-11-24T00:00:00Z') });
    const menus = [
      { permission: 'synthetic:read', capability: 'voc.triage' },
      { permission: 'synthetic:publish', capability: 'knowledge.item.publish' },
    ] as const;
    await grant('site_room', 'SITE-A', 'RA1');
    const permissions = createPlatformPermissionResolver(menus);
    const scopeResolver = createGrantTableScopeResolver({ db: handle.db, catalog });
    const build = createSessionState({ checkService: check, permissions, scopeCatalog: catalog, scopeResolver });
    const permissionNames = ['platform:view', 'features:access', ...menus.map(row => row.permission)];
    const calls = [
      { kind: 'session' },
      { kind: 'token', tokenId: 'test', scopes: ['workspace.read', 'scope.read', 'voc.triage'] },
      { kind: 'token', tokenId: 'test', scopes: ['scope.read', 'voc.triage'] },
      { kind: 'token', tokenId: 'test', scopes: ['workspace.read', 'voc.triage'] },
      { kind: 'token', tokenId: 'test', scopes: ['workspace.read', 'scope.read', 'knowledge.item.publish'] },
    ] as const;
    for (const state of ['direct', 'system', 'deny', 'expired', 'revoked'] as const) {
      const grantId = await grantCapability(migrate, WORKSPACE, actorId, 'voc.triage',
        state === 'system' ? managedSystem : null, actorId);
      if (state === 'deny') await denyCapability(migrate, WORKSPACE, actorId, 'voc.triage', null, actorId);
      if (state === 'expired') await migrate.pool.query("update permission.permission_grants set expires_at = '2026-01-01' where id = $1", [grantId]);
      if (state === 'revoked') await migrate.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [grantId]);
      try {
        for (const role of ['admin', 'developer', 'user'] as const) {
          const actor = { actor_id: actorId, workspace_id: WORKSPACE, role_level: role };
          const loaded = { actor: { id: actorId, roleLevel: role, displayName: 'Role fixture' }, session: { workspaceId: WORKSPACE } } as unknown as LoadedSession;
          for (const auth of calls) {
            const observe = (shared: boolean) => {
              const store: AuthStore = { ctx: auth };
              return runWithAuthStore(store, async () => {
                const reads = shared ? createRequestReads(check, actor, menus, scopeResolver) : undefined;
                const decisions = [];
                for (const permission of permissionNames) {
                  decisions.push(await holdsPlatformPermission(check, actor, permission, { menuPermissions: menus, ...(reads ? { reads } : {}) }));
                }
                const auditBefore = [...(store.sessionOnlyDenied ?? [])];
                const session = await build(loaded, reads);
                const audit = [...(store.sessionOnlyDenied ?? [])];
                expect(audit).toEqual(auditBefore);
                return { decisions, session, audit };
              });
            };
            const baseline = await observe(false);
            expect(await observe(true), `${role} ${state} ${JSON.stringify(auth)}`).toEqual(baseline);
            if (auth.kind === 'token') expect(baseline.audit).toEqual(['knowledge.item.publish']);
            const hasScope = auth.kind === 'session' || (auth.scopes as readonly string[]).includes('scope.read');
            expect(baseline.session.session.scopes).toEqual(
              hasScope ? [{ id: 'SITE-A', label: 'A', grantedRooms: 1, totalRooms: 2 }] : [],
            );
          }
        }
      } finally {
        await migrate.pool.query('delete from permission.permission_denies where actor_id = $1', [actorId]);
        await migrate.pool.query('delete from permission.permission_grants where id = $1', [grantId]);
      }
    }
  });

  it('warns once with only the active out-of-catalog grant count', async () => {
    await grant('site', 'SITE-X');
    const expired = await grant('site_room', 'SITE-Y', 'RY1');
    const revoked = await grant('site', 'SITE-Z');
    const superseded = await grant('site', 'SITE-W');
    await handle.pool.query('update permission.permission_grants set expires_at = now() - interval \'1 second\' where id = $1', [expired]);
    await handle.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [revoked]);
    await handle.pool.query('update permission.permission_grants set superseded_at = now() where id = $1', [superseded]);
    const lines: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (line: string) => { lines.push(line); } });
    const server = await buildServer({ config: loadConfig(), dbHandle: handle, scopeCatalog: catalog, logger });
    apps.push(server);
    const warnings = lines.map(line => JSON.parse(line)).filter(row => row.msg === 'Active Scope grants outside catalog');
    expect(warnings).toEqual([expect.objectContaining({ count: 1 })]);
    expect(JSON.stringify(warnings)).not.toMatch(/SITE-X|SITE-Y|SITE-Z|SITE-W|RY1/);
    expect(JSON.stringify(warnings)).not.toContain(actorId);
  });
  it('preserves no-catalog defaults, including when the HTTP resolver is supplied', async () => {
    for (const scopeResolver of [undefined, createHttpScopeResolver({ baseUrl: 'https://synthetic.test', timeoutMs: 1000,
      fetch: async () => ({ ok: true, status: 200, json: async () => [{ site: 'SITE-A', rooms: ['RA1'] }] }),
    })]) {
      const server = await buildServer({ config: loadConfig(), dbHandle: handle, ...(scopeResolver ? { scopeResolver } : {}) });
      apps.push(server);
      const session = (await get('/bootstrap', server)).json().session;
      expect(session.scopes).toEqual([]);
      expect(session).not.toHaveProperty('requestableScopes');
      expect((await get('/scopes/SITE-A/check', server)).json()).toEqual({ status: 'unknown_scope', grantedRooms: [] });
    }
  });
});
