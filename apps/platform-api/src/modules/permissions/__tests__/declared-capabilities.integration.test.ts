// ADR-0157 (#1902) through the production declaration path: `loadMenuDeclarationSetup` loads a synthetic bundle that
// declares capabilities, `buildServer` adopts the bundle's registry, and every acceptance line is judged on real routes
// against a real Postgres as `platform_app` (`pnpm --filter @ap/platform-api test:integration`, throwaway DB only).
// Needs migration 0131 (`core.declared_capabilities`, `core.sync_declared_capabilities`). Synthetic names only.

import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { runAsToken } from '../../../lib/auth-context.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { withMenuSnapshotFile } from '../../../test-support/menu-snapshot.js';
import {
  denyCapability,
  grantCapability,
  insertPermissionRequestRow,
  insertScopePermissionRow,
} from '../../../test-support/permissions-fixtures.js';
import type { MenuDispatchContribution } from '../../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../../platform-port/permissions.js';
import {
  type CapabilityRegistry,
  type CheckService,
  countUndeclaredPermissionRows,
  createCheckService,
  syncDeclaredCapabilities,
} from '../index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('itdeclcap').replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();

const ANNOTATE = `ext.${PREFIX}.annotate` as const;
const VIEW = `ext.${PREFIX}.view` as const;
const GADGET = `ext.${PREFIX}.gadget` as const;
const P_ANNOTATE = `${PREFIX}:annotate`;
const P_VIEW = `${PREFIX}:view`;
const P_GADGET = `${PREFIX}:gadget`;
const SITE = 'SITE-A';

const endpoint = (id: string, permission: string, requiresScope: boolean) => ({
  id: `${PREFIX}.${id}`, menuId: PREFIX, paramKeys: [], permission, requiresScope, context: {}, mergeTimeDomain: false,
});
/** Bundle A: `annotate` with no meta (closed defaults) and a relaxed `view` (any Role Level, token-callable, not sensitive). */
const BUNDLE_A = {
  endpoints: [endpoint('annotate', P_ANNOTATE, false), endpoint('scoped', P_ANNOTATE, true)],
  actions: [],
  permissions: [
    { permission: P_ANNOTATE, capability: ANNOTATE },
    { permission: P_VIEW, capability: VIEW },
  ],
  capabilities: [
    { id: ANNOTATE, displayName: 'Widget annotate' },
    { id: VIEW, sensitive: false, sessionOnly: false, roleLevels: ['admin', 'developer', 'user'] },
  ],
  endpointOwners: { [`${PREFIX}.annotate`]: '/upstream/annotate', [`${PREFIX}.scoped`]: '/upstream/scoped' },
  scopeCatalog: [{ site: SITE, label: 'Site A', rooms: ['RA1'] }],
};
/** Bundle B: another deployment that declares only `gadget` (and no longer `annotate`/`view`). */
const BUNDLE_B = {
  endpoints: [endpoint('gadget', P_GADGET, false)],
  actions: [],
  permissions: [{ permission: P_GADGET, capability: GADGET }],
  capabilities: [{ id: GADGET }],
  endpointOwners: { [`${PREFIX}.gadget`]: '/upstream/gadget' },
};

describe.skipIf(!runIntegration)('declared capabilities (ADR-0157)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let dir: string;
  let appA: FastifyInstance;
  let appB: FastifyInstance;
  let contributionA: MenuDispatchContribution;
  let registryA: CapabilityRegistry;
  let registryB: CapabilityRegistry;
  let checkA: CheckService;
  const upstreamCalls: string[] = [];
  const actorIds: string[] = [];
  const people: Record<string, { id: string; cookie: string; role: string }> = {};

  async function person(key: string, roleLevel: 'admin' | 'developer' | 'user') {
    const externalId = `${PREFIX}-${key}`;
    const { id } = await insertActorRow(migrateHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    // Sessions seeded through SQL: the suite does not spend the shared mock-login limit.
    const cookie = randomUUID();
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, id, WORKSPACE_ID],
    );
    people[key] = { id, cookie, role: roleLevel };
    return people[key];
  }
  const who = (key: string) => {
    const found = people[key];
    if (!found) throw new Error(`no person ${key}`);
    return found;
  };
  const actorOf = (key: string) => ({ actor_id: who(key).id, workspace_id: WORKSPACE_ID, role_level: who(key).role });
  const call = (app: FastifyInstance, method: 'GET' | 'POST', url: string, key: string, payload?: unknown) =>
    app.inject({
      method, url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${who(key).cookie}`, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  const held = async (app: FastifyInstance, key: string) => {
    const res = await call(app, 'GET', '/api/v1/platform/bootstrap', key);
    expect(res.statusCode).toBe(200);
    return res.json<{ session: { user: { permissions: string[] } } }>().session.user.permissions;
  };
  const query = (app: FastifyInstance, key: string, id: string, context: Record<string, unknown> = {}) =>
    call(app, 'POST', '/api/v1/menu-query', key, { endpoint: `${PREFIX}.${id}`, context, params: {} });
  const check = (app: FastifyInstance, key: string, capability: string) =>
    call(app, 'GET', `/me/permissions/check?capability=${encodeURIComponent(capability)}`, key);

  async function serverFor(bundle: unknown, name: string) {
    const bundleFile = join(dir, `${name}.json`);
    const keyFile = join(dir, `${name}.key`);
    const { privateKey } = generateKeyPairSync('ed25519');
    await Promise.all([writeFile(bundleFile, JSON.stringify(bundle)), writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }))]);
    const fetchImpl = (async (input: unknown) => {
      upstreamCalls.push(String(input));
      return new Response(JSON.stringify({ outcome: 'ok', data: { passed: true }, assessments: [], trust: null }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const config = {
      ...loadConfig(),
      MENU_DECLARATIONS_FILE: bundleFile,
      MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
      MENU_IDENTITY_KEY_FILE: keyFile,
      MENU_IDENTITY_KEY_ID: `${name}-key`,
    };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
      db: dbHandle.db,
      checkService: (capabilities) => createCheckService({ db: dbHandle.db, capabilities }),
      fetch: fetchImpl,
    });
    if (!setup) throw new Error('setup must build');
    const app = await buildServer({
      config, dbHandle, menuDispatch: setup.menuDispatch,
      ...(setup.scopeCatalog ? { scopeCatalog: setup.scopeCatalog } : {}),
      ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}),
    });
    await app.ready();
    const contribution = setup.menuDispatch.find((c) => c.capabilities);
    if (!contribution?.capabilities) throw new Error('the bundle contribution carries the registry');
    return { app, contribution, registry: contribution.capabilities };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'declared-capabilities-it-'));
    const a = await serverFor(BUNDLE_A, 'a');
    appA = a.app; contributionA = a.contribution; registryA = a.registry;
    checkA = createCheckService({ db: dbHandle.db, capabilities: registryA });

    await person('admin', 'admin');
    await person('granted', 'developer');   // annotate grant only
    await person('none', 'developer');      // scope.read site grant only
    await person('both', 'developer');      // annotate + view grants and the scope.read site grant
    await person('demoted', 'developer');   // annotate grant, later a User
    await person('user', 'user');
    const admin = who('admin').id;
    await grantCapability(migrateHandle, WORKSPACE_ID, who('granted').id, ANNOTATE, null, admin);
    await grantCapability(migrateHandle, WORKSPACE_ID, who('both').id, ANNOTATE, null, admin);
    await grantCapability(migrateHandle, WORKSPACE_ID, who('both').id, VIEW, null, admin);
    await grantCapability(migrateHandle, WORKSPACE_ID, who('demoted').id, ANNOTATE, null, admin);
    for (const key of ['none', 'both']) {
      await insertScopePermissionRow(migrateHandle, { table: 'permission_grants', workspaceId: WORKSPACE_ID, actorId: who(key).id, kind: 'site', site: SITE });
    }

    const b = await serverFor(BUNDLE_B, 'b');
    appB = b.app; registryB = b.registry;
  });

  afterAll(async () => {
    await appA?.close();
    await appB?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    if (actorIds.length > 0) {
      for (const [table, column] of [
        ['core.idempotency_keys', 'actor_id'],
        ['platform.usage_events', 'actor_id'],
        ['platform.client_errors', 'actor_id'],
        ['core.audit_log', 'actor_id'],
        ['permission.permission_requests', 'requester_actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.api_tokens', 'actor_id'],
        ['core.sessions', 'actor_id'],
        ['core.actors', 'id'],
      ]) {
        await migrateHandle.pool.query(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
    }
    // Leave the table as a server without declarations would: nothing declared.
    if (dbHandle) await syncDeclaredCapabilities(dbHandle.db, (await import('../index.js')).PLATFORM_CAPABILITY_REGISTRY);
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('without a grant a declared menu permission is closed on the session snapshot and the query judgment, also for the Admin role', async () => {
    expect(await held(appA, 'granted')).toContain(P_ANNOTATE);
    for (const key of ['none', 'admin']) {
      expect(await held(appA, key), key).not.toContain(P_ANNOTATE);
      expect(await holdsPlatformPermission(checkA, actorOf(key), P_ANNOTATE, { menuPermissions: contributionA.permissions ?? [] }), key).toBe(false);
    }
    expect(await holdsPlatformPermission(checkA, actorOf('granted'), P_ANNOTATE, { menuPermissions: contributionA.permissions ?? [] })).toBe(true);
    const before = upstreamCalls.length;
    expect((await query(appA, 'none', 'annotate')).json()).toMatchObject({ outcome: 'forbidden' });
    expect((await query(appA, 'admin', 'annotate')).json()).toMatchObject({ outcome: 'forbidden' });
    expect(upstreamCalls.length).toBe(before);
    expect((await query(appA, 'granted', 'annotate')).json()).toMatchObject({ outcome: 'ok' });
  });

  it('an explicit deny closes a declared capability over its grant', async () => {
    const denyId = await denyCapability(migrateHandle, WORKSPACE_ID, who('both').id, ANNOTATE, null, who('admin').id);
    try {
      expect(await held(appA, 'both')).not.toContain(P_ANNOTATE);
      expect((await check(appA, 'both', ANNOTATE)).json()).toMatchObject({ decision: { allow: false, reason: 'explicit_deny' } });
    } finally {
      await migrateHandle.pool.query('delete from permission.permission_denies where id = $1', [denyId]);
    }
  });

  it('a grant of one declared capability gives neither another declared capability nor workspace.read', async () => {
    expect(await held(appA, 'granted')).not.toContain(P_VIEW);
    expect((await check(appA, 'granted', VIEW)).json()).toMatchObject({ decision: { allow: false, reason: 'no_grant' } });
    expect((await check(appA, 'granted', 'workspace.read')).json()).toMatchObject({ decision: { allow: false } });
  });

  it('a capability without meta is refused as a token scope and a token call is session_required; workspace.read alone opens no declared permission', async () => {
    const issued = await call(appA, 'POST', '/api-tokens', 'both', { name: 'declared', scopes: [ANNOTATE] });
    expect(issued.statusCode).toBe(422);
    expect(issued.json()).toMatchObject({ detail: { fields: [{ path: ['scopes', 0], code: 'session_only' }] } });
    const relaxed = await call(appA, 'POST', '/api-tokens', 'both', { name: 'declared-view', scopes: [VIEW] });
    expect(relaxed.statusCode).toBe(201);
    const menu = { menuPermissions: contributionA.permissions ?? [] };
    await runAsToken('t-annotate', [ANNOTATE, VIEW], async () => {
      expect(await checkA.checkCapability(actorOf('both'), ANNOTATE, { workspace_id: WORKSPACE_ID })).toMatchObject({ reason: 'session_required' });
    });
    await runAsToken('t-read', ['workspace.read'], async () => {
      expect(await holdsPlatformPermission(checkA, actorOf('both'), P_VIEW, menu)).toBe(false);
    });
    await runAsToken('t-view', [VIEW], async () => {
      expect(await holdsPlatformPermission(checkA, actorOf('both'), P_VIEW, menu)).toBe(true);
    });
  });

  it('requiresScope needs both the declared capability and a scope.read site grant', async () => {
    const before = upstreamCalls.length;
    expect((await query(appA, 'granted', 'scoped', { scopeId: SITE })).json(), 'declared only').toMatchObject({ outcome: 'forbidden' });
    expect((await query(appA, 'none', 'scoped', { scopeId: SITE })).json(), 'scope.read only').toMatchObject({ outcome: 'forbidden' });
    expect(upstreamCalls.length).toBe(before);
    expect((await query(appA, 'both', 'scoped', { scopeId: SITE })).json(), 'both').toMatchObject({ outcome: 'ok' });
  });

  it('a Managed System or site request for a declared capability is validation.failed', async () => {
    const ms = await call(appA, 'POST', '/permission-requests', 'none', {
      requested_capability: ANNOTATE, requested_managed_system_id: randomUUID(), reason: 'need it',
    });
    expect(ms.statusCode).toBe(422);
    expect(ms.json()).toMatchObject({ code: 'validation.failed' });
    const site = await call(appA, 'POST', '/permission-requests', 'none', {
      requested_capability: ANNOTATE, requested_scope_kind: 'site', requested_scope_site: SITE, reason: 'need it',
    });
    expect(site.statusCode).toBe(422);
    expect(site.json()).toMatchObject({ code: 'validation.failed' });
  });

  it('a capability without meta is never granted to a User, and a grant stops at the next request after a demotion', async () => {
    const direct = await call(appA, 'POST', '/permissions/grants', 'admin', {
      actor_id: who('user').id, capability: ANNOTATE, reason: 'try',
    });
    expect(direct.statusCode).toBe(422);
    expect(direct.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['capability'] }] } });
    const request = await call(appA, 'POST', '/permission-requests', 'user', { requested_capability: ANNOTATE, reason: 'need it' });
    expect(request.statusCode).toBe(422);
    expect(await held(appA, 'demoted')).toContain(P_ANNOTATE);
    await migrateHandle.pool.query(`update core.actors set role_level = 'user' where id = $1`, [who('demoted').id]);
    who('demoted').role = 'user';
    expect(await held(appA, 'demoted')).not.toContain(P_ANNOTATE);
    // The read for clients says the same: a User may request `view` (allow-list) but not `annotate`.
    const read = await call(appA, 'GET', '/me/permissions/declared-capabilities', 'user');
    expect(read.json()).toEqual({ items: [
      { id: ANNOTATE, display_name: 'Widget annotate', sensitive: true, requestable: false },
      { id: VIEW, display_name: VIEW, sensitive: false, requestable: true },
    ] });
  });

  it('a capability the bundle no longer declares: judgment refused, approval refused, rejection allowed, list mark, boot count', async () => {
    const pending = await insertPermissionRequestRow(migrateHandle, { workspaceId: WORKSPACE_ID, requesterActorId: who('none').id, requestedCapability: ANNOTATE, reason: 'before' });
    const second = await insertPermissionRequestRow(migrateHandle, { workspaceId: WORKSPACE_ID, requesterActorId: who('admin').id, requestedCapability: ANNOTATE, reason: 'before' });
    // Server B is the same deployment after `annotate` left the bundle.
    expect((await check(appB, 'granted', ANNOTATE)).json()).toMatchObject({ code: 'validation.unknown_capability' });
    expect(await held(appB, 'granted')).not.toContain(P_ANNOTATE);
    const approve = await call(appB, 'POST', `/permissions/requests/${pending.id}/approve`, 'admin', { expected_revision: 1, reason: 'ok' });
    expect(approve.json()).toMatchObject({ code: 'validation.unknown_capability' });
    const reject = await call(appB, 'POST', `/permissions/requests/${second.id}/reject`, 'admin', { expected_revision: 1, reason: 'retired' });
    expect(reject.statusCode).toBe(200);
    const grants = await call(appB, 'GET', '/permissions/grants', 'admin');
    const mine = grants.json<{ items: { actor_id: string; capability: string; in_declarations?: boolean }[] }>().items
      .filter((item) => item.actor_id === who('granted').id && item.capability === ANNOTATE);
    expect(mine).toEqual([expect.objectContaining({ in_declarations: false })]);
    const onA = (await call(appA, 'GET', '/permissions/grants', 'admin')).json<{ items: { actor_id: string; capability: string; in_declarations?: boolean }[] }>().items
      .filter((item) => item.actor_id === who('granted').id && item.capability === ANNOTATE);
    expect(onA).toEqual([expect.objectContaining({ in_declarations: true })]);
    // Boot warning count: the rows of `annotate` and `view` count against B's registry and not against A's.
    const underB = await countUndeclaredPermissionRows(dbHandle.db, registryB);
    const underA = await countUndeclaredPermissionRows(dbHandle.db, registryA);
    expect(underB.requests - underA.requests).toBe(1);
    expect(underB.grants - underA.grants).toBe(4);
  });

  it('two servers in one process never accept each other\'s declared capabilities', async () => {
    expect((await check(appA, 'granted', GADGET)).json()).toMatchObject({ code: 'validation.unknown_capability' });
    expect((await check(appB, 'granted', VIEW)).json()).toMatchObject({ code: 'validation.unknown_capability' });
    expect(await held(appA, 'granted')).not.toContain(P_GADGET);
    expect(registryA.has(GADGET)).toBe(false);
    expect(registryB.has(ANNOTATE)).toBe(false);
  });

  it('audit projection (platform_app): a declared capability without meta stays out, a non-sensitive one is listed, and a platform name never enters the table', async () => {
    await syncDeclaredCapabilities(dbHandle.db, registryA);
    const subject = who('admin').id;
    const ids: Record<string, string> = {};
    for (const capability of [ANNOTATE, VIEW]) {
      const res = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
         values ($1, $2, 'permission_granted', 'permission_grant', $3, 's', $4::jsonb) returning id`,
        [WORKSPACE_ID, subject, randomUUID(), JSON.stringify({ capability })],
      );
      ids[capability] = res.rows[0]?.id as string;
    }
    const listed = async () => (await dbHandle.pool.query<{ audit_id: string | null }>(
      `select audit_id from core.platform_audit_events($1, null, null, $2, null, null, null, null, $3::jsonb, 'at', true, 100, 0)`,
      [WORKSPACE_ID, `${PREFIX}-admin`, JSON.stringify({ permission_granted: 'grant' })],
    )).rows.map((row) => row.audit_id).filter((id): id is string => id !== null);
    const visible = await listed();
    expect(visible).toContain(ids[VIEW]);
    expect(visible).not.toContain(ids[ANNOTATE]);
    // The app role holds no privilege on the table and cannot put a platform name into it through the sync function.
    await expect(dbHandle.pool.query('select capability from core.declared_capabilities')).rejects.toMatchObject({ code: '42501' });
    await expect(dbHandle.pool.query(`select core.sync_declared_capabilities(array['workspace.admin'], array[false])`)).rejects.toMatchObject({ code: '23514' });
    await migrateHandle.pool.query(
      `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
       values ($1, $2, 'permission_granted', 'permission_grant', $3, 's', $4::jsonb)`,
      [WORKSPACE_ID, subject, randomUUID(), JSON.stringify({ capability: 'workspace.admin' })],
    );
    expect(await listed()).toEqual(visible);
    // The failed sync rolled back: the declared rows are still there.
    expect(await listed()).toContain(ids[VIEW]);
  });
});
