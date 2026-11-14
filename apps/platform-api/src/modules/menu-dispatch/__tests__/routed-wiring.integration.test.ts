import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { createCheckService } from '../../permissions/index.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { withMenuSnapshotFile } from '../../../test-support/menu-snapshot.js';
import { uid } from '../../../test-support/ids.js';
import type { ConnectorLeg, RoutingLog } from '../connectors/types.js';
import { TargetJudgmentTimeout } from '../connectors/types.js';
import { MenuUpstreamError } from '../forwarder.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const externalId = uid('syn-route');
const call = { statement: 'SELECT :site, :rooms', params: { site: 'scope.site', rooms: 'scope.rooms' } };
const scopeCheck = { mode: 'verify-rows', siteField: '/site', roomField: '/room' };
const endpoint = (id: string) => ({ id, menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: { roomNames: 'apply' }, limits: { maxRows: 2 }, kinds: ['collection'], mergeTimeDomain: false });

describe.skipIf(!runIntegration)('single-target routing through production setup and HTTP ScopeResolver', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance; let legacyApp: FastifyInstance;
  let actorId: string | undefined; let dir: string; let cookie: string;
  let grants: { site: string; rooms: string[] }[];
  let behavior: 'normal' | 'violation' | 'overflow' | 'judgment' | 'transport' | 'core' = 'normal';
  const calls: ConnectorLeg[] = []; const logs: RoutingLog[] = [];
  const query = (id: string, site: string, rooms: string[] | null) => app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: id, context: { scopeId: site, roomNames: rooms }, params: {} } });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-routed-it-'));
    const file = join(dir, 'bundle.json'); const secret = join(dir, 'secret');
    await writeFile(secret, 'syn-secret-not-in-response');
    await writeFile(file, JSON.stringify({
      endpoints: [endpoint('syn.shared'), endpoint('syn.split')], actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
      targets: Object.fromEntries(['tgt-1', 'tgt-2'].map((id) => [id, { kind: 'sql', dialect: 'postgres', connectionFile: secret }])),
      endpointOwners: {
        'syn.shared': { routes: [{ sites: ['SITE-A', 'SITE-B'], targets: ['tgt-1'] }], call, scopeCheck },
        'syn.split': { routes: [{ sites: ['SITE-C'], rooms: ['RC1'], targets: ['tgt-1'] }, { sites: ['SITE-C'], rooms: ['RC2'], targets: ['tgt-2'] }], call, scopeCheck },
      },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: 10000 };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
      checkService: createCheckService({ db: db.db }),
      fetch: (async () => new Response(JSON.stringify(grants), { status: 200 })) as typeof fetch,
      connectorFactories: { sql: () => ({ async *query(leg) {
        calls.push(leg);
        if (behavior === 'judgment') throw new TargetJudgmentTimeout();
        if (behavior === 'transport') throw new MenuUpstreamError('unavailable');
        if (behavior === 'core') throw new MenuUpstreamError('timeout');
        if (behavior === 'violation') { yield { site: leg.site, room: 'syn-outside', secret: 'syn-row-must-not-leak' }; return; }
        for (let i = 0; i < (behavior === 'overflow' ? 10 : 1); i++) yield { site: leg.site, room: leg.rooms[0], value: i };
      } }) },
      log: (entry) => logs.push(entry),
    });
    if (!setup) throw new Error('setup missing');
    app = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}) });
    await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic routing user', roleLevel: 'user' })).id;
    cookie = await loginAs(app, externalId);
  });
  beforeEach(() => {
    calls.length = 0; logs.length = 0; behavior = 'normal';
    grants = [{ site: 'SITE-A', rooms: ['RA1', 'RA2'] }, { site: 'SITE-B', rooms: ['RB1'] }, { site: 'SITE-C', rooms: ['RC1', 'RC2', 'RC3'] }];
  });
  afterAll(async () => {
    await legacyApp?.close(); await app?.close();
    if (actorId) {
      for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) await migrate.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
      await migrate.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await db?.close(); await migrate?.close(); if (dir) await rm(dir, { recursive: true, force: true });
  });
  it.each([['SITE-A', 'RA1'], ['SITE-B', 'RB1']])('N sites to one target: %s', async (site, room) => {
    const hit = await query('syn.shared', site, [room]);
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ site, room, value: 0 }], assessments: [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }], trust: null });
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ targetId: 'tgt-1', site, rooms: [room], bindings: { params: { site, rooms: [room] } } });
    expect(logs).toEqual([{ actorId, endpointId: 'syn.shared', targetId: 'tgt-1', correlationId: hit.json<{ correlationId: string }>().correlationId }]);
  });
  it.each([['RC1', 'tgt-1'], ['RC2', 'tgt-2']])('room shard %s calls only its owner', async (room, targetId) => {
    expect((await query('syn.split', 'SITE-C', [room])).json()).toMatchObject({ outcome: 'ok' });
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ targetId, site: 'SITE-C', rooms: [room] });
  });
  it.each(['none', 'other-room'])('forbids %s grants before the connector', async (kind) => {
    grants = kind === 'none' ? [] : [{ site: 'SITE-A', rooms: ['RA2'] }];
    expect((await query('syn.shared', 'SITE-A', ['RA1'])).json()).toMatchObject({ outcome: 'forbidden', data: null }); expect(calls).toEqual([]);
  });
  it('null roomNames carries exactly the granted rooms of this site', async () => {
    expect((await query('syn.shared', 'SITE-A', null)).json()).toMatchObject({ outcome: 'ok' });
    expect(calls[0]?.rooms).toEqual(['RA1', 'RA2']);
    expect(calls[0]?.bindings).toEqual({ params: { site: 'SITE-A', rooms: ['RA1', 'RA2'] } });
  });
  it('verify-rows fails 502 with no source text in response or routing logs', async () => {
    behavior = 'violation'; const hit = await query('syn.shared', 'SITE-A', ['RA1']);
    expect(hit.statusCode).toBe(502); expect(hit.json()).toMatchObject({ code: 'upstream.unavailable' });
    expect(hit.body + JSON.stringify(logs)).not.toContain('syn-row-must-not-leak');
  });
  it('overflow is too_large with data null', async () => {
    behavior = 'overflow'; expect((await query('syn.shared', 'SITE-A', ['RA1'])).json()).toMatchObject({ outcome: 'too_large', data: null });
  });
  it('uncovered granted room is error with data null and no call', async () => {
    expect((await query('syn.split', 'SITE-C', ['RC3'])).json()).toMatchObject({ outcome: 'error', data: null }); expect(calls).toEqual([]);
  });
  it.each([['judgment', 200, { outcome: 'timeout', data: null }], ['transport', 502, { code: 'upstream.unavailable' }], ['core', 504, { code: 'upstream.timeout' }]] as const)('%s keeps its HTTP/error category', async (kind, status, body) => {
    behavior = kind; const hit = await query('syn.shared', 'SITE-A', ['RA1']); expect(hit.statusCode).toBe(status); expect(hit.json()).toMatchObject(body);
  });
  it('returns timely 504 while the HTTP Scope resolver is still pending and aborts it', async () => {
    // The deadline must outlast the work before the resolver's fetch (session, permission check). At 100 ms a loaded CI
    // runner reached the deadline first, so fetch was never called and `resolverSignal` stayed undefined (#1991).
    const DEADLINE_MS = 400;
    const factoryCalls: unknown[] = [];
    let resolverSignal: AbortSignal | null | undefined;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: join(dir, 'bundle.json'), MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: DEADLINE_MS };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
      checkService: createCheckService({ db: db.db }),
      fetch: (async (_url: unknown, init?: RequestInit) => {
        resolverSignal = init?.signal;
        await held;
        return new Response('[]', { status: 200 });
      }) as typeof fetch,
      connectorFactories: { sql: () => { factoryCalls.push('constructed'); return { async *query() { yield { site: 'SITE-A', room: 'RA1' }; } }; } },
    });
    if (!setup) throw new Error('setup missing');
    const deadlineApp = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}) });
    await deadlineApp.ready();
    // A finite release makes a missing race fail with forbidden rather than hanging the suite.
    const watchdog = setTimeout(release, 3000);
    const started = performance.now();
    try {
      const hit = await deadlineApp.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'syn.shared', context: { scopeId: 'SITE-A', roomNames: ['RA1'] }, params: {} } });
      expect(hit.statusCode).toBe(504);
      expect(hit.json()).toMatchObject({ code: 'upstream.timeout', correlationId: expect.any(String) });
      expect(performance.now() - started).toBeLessThan(2000);
      expect(resolverSignal, 'the resolver fetch started before the deadline').toBeDefined();
      expect(resolverSignal?.aborted).toBe(true);
      expect(factoryCalls).toEqual([]);
    } finally {
      clearTimeout(watchdog); release(); await deadlineApp.close();
    }
  });
  it('keeps a string-only bundle wire-identical', async () => {
    const file = join(dir, 'legacy.json'); const keyFile = join(dir, 'key');
    await writeFile(keyFile, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(file, JSON.stringify({ endpoints: [{ id: 'syn.legacy', menuId: 'syn', paramKeys: [], permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false }], actions: [], permissions: [], endpointOwners: { 'syn.legacy': '/syn/rows' } }));
    const bytes = '{"outcome":"ok","data":[{"value":7}],"assessments":[],"trust":null,"correlationId":"syn-wire"}';
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_UPSTREAM_BASE_URL: 'https://upstream.test', MENU_IDENTITY_KEY_FILE: keyFile, MENU_IDENTITY_KEY_ID: 'syn-key' };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), { checkService: createCheckService({ db: db.db }), fetch: (async (url: unknown, init: RequestInit) => {
      expect(String(url)).toBe('https://upstream.test/syn/rows'); expect(init.body).toBe('{"endpoint":"syn.legacy","context":{},"params":{}}'); return new Response(bytes);
    }) as typeof fetch });
    if (!setup) throw new Error('legacy setup missing');
    legacyApp = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch }); await legacyApp.ready();
    const hit = await legacyApp.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-correlation-id': 'syn-wire' }, payload: { endpoint: 'syn.legacy', context: {}, params: {} } });
    expect(hit.statusCode).toBe(200); expect(hit.body).toBe(bytes); expect(calls).toEqual([]);
  });
});
