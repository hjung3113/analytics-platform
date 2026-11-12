import { generateKeyPairSync } from 'node:crypto';
import { text as readText } from 'node:stream/consumers';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import { withMenuSnapshotFile } from '../../../test-support/menu-snapshot.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { createCheckService } from '../../permissions/index.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const externalId = uid('syn-http');

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('HTTP mapped connector through production setup', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance; let legacyApp: FastifyInstance; let upstream: Server;
  let actorId: string | undefined; let dir: string; let cookie: string;
  let behavior: 'normal' | 'failure' | 'overflow' | 'slow' = 'normal';
  const calls: { path: string; identity: string | undefined; secret: string | undefined }[] = [];
  const logs: unknown[] = [];
  let legacyBody = ''; let legacyToken: Record<string, unknown> = {};
  const legacyBytes = '{"outcome":"ok","data":[{"id":7}],"assessments":[],"trust":null,"correlationId":"syn-wire"}';
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const query = (endpoint = 'syn.shared', site = 'S1', rooms: string[] | null = null) => app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint, context: { scopeId: site, roomNames: rooms }, params: {} } });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-http-it-'));
    upstream = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/legacy') {
        legacyToken = JSON.parse(Buffer.from(String(request.headers['x-internal-identity']).split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
        void readText(request).then((body) => { legacyBody = body; response.end(legacyBytes); }).catch(() => response.destroy()); return;
      }
      calls.push({ path: url.pathname, identity: request.headers['x-internal-identity'] as string | undefined, secret: request.headers['x-syn-secret'] as string | undefined });
      if (behavior === 'failure') { response.writeHead(500); response.end('syn-private-upstream'); return; }
      if (behavior === 'slow') { const timer = setTimeout(() => { timers.delete(timer); response.end('[]'); }, 4000); timers.add(timer); return; }
      const site = url.searchParams.get('site'); const room = url.searchParams.getAll('rooms')[0];
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(Array.from({ length: behavior === 'overflow' ? 5 : 1 }, (_, id) => ({ site, room, id, private: 'syn-source-only' }))));
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('synthetic address missing');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const file = join(dir, 'bundle.json'); const secret = join(dir, 'secret'); await writeFile(secret, 'syn-private-header');
    const call = { mode: 'mapped', method: 'GET', path: '/rows', query: { site: 'scope.site', rooms: 'scope.rooms' }, response: { fields: { id: { from: '/id' }, site: { from: '/site' }, room: { from: '/room' } } } };
    const scopeCheck = { mode: 'verify-rows', siteField: '/site', roomField: '/room' };
    await writeFile(file, JSON.stringify({
      endpoints: ['syn.shared', 'syn.split'].map((id) => ({ id, menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: { roomNames: 'apply' }, limits: { maxRows: 2 }, mergeTimeDomain: false })), actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
      targets: Object.fromEntries(['t1', 't2'].map((id) => [id, { kind: 'http', baseUrl, headers: { 'x-syn-secret': { file: secret } } }])),
      endpointOwners: { 'syn.shared': { routes: [{ sites: ['S1', 'S2'], targets: ['t1'] }], call, scopeCheck }, 'syn.split': { routes: [{ sites: ['S3'], rooms: ['R1'], targets: ['t1'] }, { sites: ['S3'], rooms: ['R2'], targets: ['t2'] }], call, scopeCheck } },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: 3000 };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), { checkService: createCheckService({ db: db.db }), fetch: (async () => new Response(JSON.stringify([{ site: 'S1', rooms: ['R1'] }, { site: 'S2', rooms: ['R2'] }, { site: 'S3', rooms: ['R1', 'R2'] } ]))) as typeof fetch, log: (entry) => logs.push(entry) });
    if (!setup) throw new Error('setup missing');
    app = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}) }); await app.ready();
    const keyFile = join(dir, 'identity'); const legacyFile = join(dir, 'legacy.json');
    await writeFile(keyFile, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(legacyFile, JSON.stringify({ endpoints: [{ id: 'syn.legacy', menuId: 'syn', paramKeys: [], permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false }], actions: [], permissions: [], endpointOwners: { 'syn.legacy': '/legacy' } }));
    const legacyConfig = { ...loadConfig(), MENU_DECLARATIONS_FILE: legacyFile, MENU_UPSTREAM_BASE_URL: baseUrl, MENU_IDENTITY_KEY_FILE: keyFile, MENU_IDENTITY_KEY_ID: 'syn-key' };
    const legacySetup = await loadMenuDeclarationSetup(withMenuSnapshotFile(legacyConfig), { checkService: createCheckService({ db: db.db }) });
    if (!legacySetup) throw new Error('legacy setup missing');
    legacyApp = await buildServer({ config: legacyConfig, dbHandle: db, menuDispatch: legacySetup.menuDispatch }); await legacyApp.ready();
    actorId = (await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic HTTP user', roleLevel: 'user' })).id; cookie = await loginAs(app, externalId);
  });
  beforeEach(() => { behavior = 'normal'; calls.length = 0; logs.length = 0; });
  afterAll(async () => {
    await legacyApp?.close(); await app?.close();
    for (const timer of timers) clearTimeout(timer);
    upstream?.closeAllConnections();
    if (upstream?.listening) await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    if (actorId) {
      for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) await migrate.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
      await migrate.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await db?.close(); await migrate?.close(); if (dir) await rm(dir, { recursive: true, force: true });
  });
  it.each([['S1', 'R1'], ['S2', 'R2']])('N sites to one mapped target: %s', async (site, room) => {
    const hit = await query('syn.shared', site);
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 0, site, room }] });
    expect(calls).toEqual([{ path: '/rows', identity: undefined, secret: 'syn-private-header' }]);
    expect(JSON.stringify(logs) + hit.body).not.toContain('syn-private-header'); expect(hit.body).not.toContain('syn-source-only');
  });
  it('one site fans out by room to N mapped targets', async () => {
    const hit = await query('syn.split', 'S3');
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 0, site: 'S3', room: 'R1' }, { id: 0, site: 'S3', room: 'R2' }] }); expect(calls).toHaveLength(2);
  });
  it('upstream 500 returns a sanitized 502', async () => {
    behavior = 'failure'; const hit = await query(); expect(hit.statusCode).toBe(502); expect(hit.json()).toMatchObject({ code: 'upstream.unavailable' }); expect(hit.body + JSON.stringify(logs)).not.toContain('syn-private-upstream');
  });
  it('slow upstream returns a data-free 200 timeout', async () => {
    behavior = 'slow'; const hit = await query(); expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'timeout', data: null });
  });
  it('keeps a string-only bundle request, response bytes and token audience unchanged', async () => {
    const hit = await legacyApp.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-correlation-id': 'syn-wire' }, payload: { endpoint: 'syn.legacy', context: {}, params: {} } });
    expect(hit.statusCode).toBe(200); expect(hit.body).toBe(legacyBytes);
    expect(legacyBody).toBe('{"endpoint":"syn.legacy","context":{},"params":{}}'); expect(legacyToken).toMatchObject({ aud: 'analytics', scopes: [], htu: '/legacy' });
  });
  it('maxRows overflow returns too_large and data null', async () => {
    behavior = 'overflow'; const hit = await query(); expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'too_large', data: null });
  });
  it('cancels an unfinished HTTP body at the overflow row and responds too_large', async () => {
    let closed: () => void = () => {};
    const cancelled = new Promise<void>((resolve) => { closed = resolve; });
    const stalled = createServer((_request, response) => {
      response.on('close', closed);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('[{"id":1},{"id":2},{"id":3},');
    });
    let boundedApp: FastifyInstance | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve) => stalled.listen(0, '127.0.0.1', resolve));
      const address = stalled.address(); if (!address || typeof address === 'string') throw new Error('synthetic address missing');
      const file = join(dir, 'stalled.json');
      await writeFile(file, JSON.stringify({
        endpoints: [{ id: 'syn.stalled', menuId: 'syn', permission: 'platform:view', paramKeys: [], requiresScope: false, context: {}, limits: { maxRows: 2 }, mergeTimeDomain: false }], actions: [], permissions: [],
        targets: { stalled: { kind: 'http', baseUrl: `http://127.0.0.1:${address.port}` } },
        endpointOwners: { 'syn.stalled': { call: { mode: 'mapped', method: 'GET', path: '/rows', response: {} }, routes: [{ targets: ['stalled'] }] } },
      }));
      const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_UPSTREAM_TIMEOUT_MS: 5000 };
      const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), { checkService: createCheckService({ db: db.db }), log: () => {} });
      if (!setup) throw new Error('setup missing');
      boundedApp = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch }); await boundedApp.ready();
      const pending = boundedApp.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'syn.stalled', context: {}, params: {} } });
      const early = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('overflow waited for tail or judgment timer')), 1000); });
      const hit = await Promise.race([pending, early]);
      expect(hit.statusCode).toBe(200);
      expect(hit.json()).toMatchObject({ outcome: 'too_large', data: null });
      await Promise.race([cancelled, early]);
    } finally {
      clearTimeout(timer);
      stalled.closeAllConnections();
      if (stalled.listening) await new Promise<void>((resolve, reject) => stalled.close((error) => error ? reject(error) : resolve()));
      await boundedApp?.close();
    }
  });

});

// Separate fixtures leave the existing mapped/legacy wire cases unchanged.
describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('HTTP routed continuation through production setup', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance; let upstream: Server;
  let actorId: string | undefined; let dir: string; let cookie: string;
  const continuationActor = uid('syn-http-continuation');
  const received: { path: string; body: string; token: Record<string, unknown> }[] = [];
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-http-continuation-'));
    upstream = createServer((request, response) => {
      void readText(request).then((body) => {
        const token = request.headers['x-internal-identity'];
        received.push({ path: request.url ?? '/', body, token: token ? JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown> : {} });
        response.setHeader('content-type', 'application/json');
        response.end(request.url === '/envelope' ? JSON.stringify({ outcome: 'ok', data: [{ id: 9 }], assessments: [], trust: null, correlationId: request.headers['x-correlation-id'] }) : '[]');
      }).catch(() => response.destroy());
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('synthetic address missing');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const file = join(dir, 'bundle.json'); const keyFile = join(dir, 'identity');
    await writeFile(keyFile, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(file, JSON.stringify({
      endpoints: [
        { id: 'syn.envelope', menuId: 'syn', paramKeys: [], permission: 'platform:view', requiresScope: true, context: { roomNames: 'apply' }, mergeTimeDomain: false },
        { id: 'syn.path', menuId: 'syn', paramKeys: ['segment'], paramTypes: { segment: { type: 'string', maxLength: 80 } }, permission: 'platform:view', requiresScope: false, context: {}, limits: { maxRows: 2 }, mergeTimeDomain: false },
      ], actions: [], permissions: [],
      targets: { envelope: { kind: 'http', baseUrl: `${baseUrl}/envelope`, aud: 'syn-route-audience' }, mapped: { kind: 'http', baseUrl } },
      endpointOwners: {
        'syn.envelope': { routes: [{ sites: ['S1'], rooms: ['R1'], targets: ['envelope'] }], call: { mode: 'envelope' }, unroutedRooms: 'skip' },
        'syn.path': { routes: [{ targets: ['mapped'] }], call: { mode: 'mapped', method: 'GET', path: '/rows/{segment}', pathParams: { segment: 'params.segment' }, response: {} } },
      },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_UPSTREAM_BASE_URL: `${baseUrl}/unused`, MENU_IDENTITY_KEY_FILE: keyFile, MENU_IDENTITY_KEY_ID: 'syn-key' };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), { checkService: createCheckService({ db: db.db }), log: () => {} });
    if (!setup) throw new Error('setup missing');
    app = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, scopeResolver: { resolve: async () => [{ site: 'S1', rooms: ['R1', 'R2'] }, { site: 'S2', rooms: ['R3'] }] } }); await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId: continuationActor, displayName: 'Synthetic continuation user', roleLevel: 'user' })).id;
    cookie = await loginAs(app, continuationActor);
  });
  beforeEach(() => { received.length = 0; });
  afterAll(async () => {
    await app?.close(); upstream?.closeAllConnections();
    if (upstream?.listening) await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    if (actorId) {
      for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) await migrate.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
      await migrate.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await db?.close(); await migrate?.close(); if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('sends routed envelope identity only to its target with route rooms and declared audience', async () => {
    const payload = { endpoint: 'syn.envelope', context: { scopeId: 'S1', roomNames: ['R1', 'R2'] }, params: {} };
    const hit = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-correlation-id': 'syn-route-wire' }, payload });
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 9 }] });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ path: '/envelope', body: JSON.stringify(payload), token: expect.objectContaining({ aud: 'syn-route-audience', scopes: [JSON.stringify({ site: 'S1', rooms: ['R1'] })], htu: '/envelope' }) });
  });
  it.each(['', '.', '..'])('invalid mapped path %j returns error without reaching HTTP target', async (segment) => {
    const hit = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'syn.path', context: {}, params: { segment } } });
    expect(received).toEqual([]);
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'error', data: null });
  });
  it('valid mapped path reaches the same production HTTP target', async () => {
    const hit = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'syn.path', context: {}, params: { segment: 'syn-row' } } });
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'empty', data: [] });
    expect(received).toEqual([{ path: '/rows/syn-row', body: '', token: {} }]);
  });
});
