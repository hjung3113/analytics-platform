import { bootstrapHttpAdapter } from '@ap/http-adapter';
import { planServerConformance, type ServerConformanceHarness } from '@ap/server-conformance';
import { generateKeyPairSync } from 'node:crypto';
import pino from 'pino';
import { createHttpScopeResolver } from '../../menu-dispatch/http-scope-resolver.js';
import { createMenuForwarder } from '../../menu-dispatch/forwarder.js';
import { createIdentityTokenSigner } from '../../menu-dispatch/identity-token.js';
import type { MenuDispatchContribution } from '../../menu-dispatch/types.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs, SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { insertScopePermissionRow } from '../../../test-support/permissions-fixtures.js';
import { parseScopeCatalog } from '../../permissions/scope-catalog.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE);
const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'A', rooms: ['RA2', 'RA1'] },
  { site: 'SITE-B', label: 'B', rooms: ['RB1', 'RB2'] },
  { site: 'SITE-C', label: 'C', rooms: ['RC1'] },
]);
describe.skipIf(!runIntegration)('Scope session and check through buildServer', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let actorId: string;
  let cookie: string;
  const apps: FastifyInstance[] = [];
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
    if (migrate && actorId) {
      for (const [table, column] of [['core.audit_log', 'actor_id'], ['permission.permission_grants', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
        await migrate.pool.query(`delete from ${table} where ${column} = $1`, [actorId]);
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
