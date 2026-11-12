import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { runAsToken } from '../../../lib/auth-context.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs, SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { grantCapability, insertScopePermissionRow } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { createPlatformPermissionResolver } from '../../platform-port/permissions.js';
import { actorEffectiveScope, actorReadScope, canReadVocAsSource } from '../../voc/authorization.js';
import { createCheckService } from '../check-service.js';
import { createGrantTableScopeResolver } from '../grant-table-scope-resolver.js';
import { countRecoveryPermissionRequests, permissionRecoveryProjection, permissionRecoveryTruth } from '../recovery-read.js';
import { parseScopeCatalog } from '../scope-catalog.js';
import { actorScopeForCapability } from '../scope-service.js';
import { validateSupportedScope } from '../supported-scope-policy.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const PREFIX = 'it-1844b-kinds';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE);
const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'A', rooms: ['RA2', 'RA1'] },
  { site: 'SITE-B', label: 'B', rooms: ['RB2', 'RA1'] },
]);

describe.skipIf(!runIntegration)('scope grant kinds', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let actorId: string;
  let adminId: string;
  let otherId: string;
  let systemId: string;
  let userCookie: string;
  let adminCookie: string;
  const actor = () => ({ actor_id: actorId, workspace_id: WORKSPACE, role_level: 'user' as const });
  const resolve = () => createGrantTableScopeResolver({ db: handle.db, catalog });
  const grant = (kind: string, site: string | null = null, room: string | null = null) =>
    insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId, kind, site, room });
  const get = (url: string, cookie = userCookie) => app.inject({ method: 'GET', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    actorId = (await insertActorRow(handle, { workspaceId: WORKSPACE, externalId: `${PREFIX}-user`, roleLevel: 'user' })).id;
    adminId = (await insertActorRow(handle, { workspaceId: WORKSPACE, externalId: `${PREFIX}-admin`, roleLevel: 'admin' })).id;
    otherId = (await insertActorRow(handle, { workspaceId: WORKSPACE, externalId: `${PREFIX}-other`, roleLevel: 'user' })).id;
    systemId = await insertMsDirectly(handle, WORKSPACE, `${PREFIX}-system`, 'Scope system');
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    userCookie = await loginAs(app, `${PREFIX}-user`);
    adminCookie = await loginAs(app, `${PREFIX}-admin`);
  });
  beforeEach(async () => {
    await migrate.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [[actorId, adminId, otherId]]);
    await migrate.pool.query('delete from permission.permission_requests where requester_actor_id = any($1::uuid[])', [[actorId, adminId, otherId]]);
  });
  afterAll(async () => {
    if (migrate) {
      const ids = [actorId, adminId, otherId].filter(Boolean);
      await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [ids]);
      await migrate.pool.query('delete from permission.permission_requests where requester_actor_id = any($1::uuid[])', [ids]);
      await migrate.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [ids]);
      await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [ids]);
      await deleteRecoveryFixtureParents(migrate, 'delete from core.managed_systems where id = $1', [systemId]);
      await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [ids]);
    }
    await app?.close();
    await handle?.close();
    await migrate?.close();
  });

  it.each(['site', 'site_room'])('%s never becomes a workspace capability through any judgment path', async kind => {
    await grant(kind, 'SITE-A', kind === 'site_room' ? 'RA1' : null);
    const check = createCheckService({ db: handle.db });
    const admin = { actor_id: adminId, workspace_id: WORKSPACE, role_level: 'admin' };
    expect(await resolve().resolve(admin)).toEqual([]);
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: adminId, kind, site: 'SITE-A', room: kind === 'site' ? null : 'RA1' });
    expect((await check.checkCapability(admin, 'scope.read', { workspace_id: WORKSPACE })).allow).toBe(false);
    for (const capability of ['scope.read', 'voc.read', 'voc.triage', 'survey.manage'] as const) {
      expect((await check.checkCapability(actor(), capability, { workspace_id: WORKSPACE })).allow).toBe(false);
      expect((await check.checkCapability(actor(), capability, { workspace_id: WORKSPACE, managed_system_id: systemId })).allow).toBe(false);
      expect(await check.capabilityScope(actor(), capability, { workspace_id: WORKSPACE })).toEqual({ kind: 'scoped', managed_system_ids: [] });
      expect(await actorScopeForCapability(handle.db, actor(), capability)).toEqual({ kind: 'scoped', managedSystemIds: [] });
      const response = await get(`/me/permissions/check?capability=${capability}`);
      expect(response.statusCode).toBe(200);
      expect(response.json().decision.allow).toBe(false);
      const scope = await get(`/me/permissions/scope?capability=${capability}`);
      expect(scope.statusCode).toBe(200);
      expect(scope.json().scope).toEqual({ kind: 'scoped', managed_system_ids: [] });
    }
    const platform = createPlatformPermissionResolver([{ permission: 'scope:test', capability: 'scope.read' }]);
    expect(await platform.resolve(check, actor())).toEqual(['notice:view', 'platform:view', 'voc:view']);
    expect(await platform.holds(check, actor(), 'scope:test')).toBe(false);
    expect(await actorReadScope(handle.db, actor())).toEqual({ kind: 'scoped', managedSystemIds: [] });
    expect(await actorEffectiveScope(handle.db, actor())).toEqual({ kind: 'scoped', managedSystemIds: [] });
    expect(await canReadVocAsSource(check, actor(), { managedSystemId: systemId, reporterId: null })).toBe(false);
    const grants = await get('/permissions/grants', adminCookie);
    expect(grants.statusCode).toBe(200);
    expect(grants.json().items.filter((row: { actor_id: string }) => row.actor_id === actorId)).toEqual([]);
  });

  it('site_room yields only RA1, excludes managed-system rows and isolates actor and workspace', async () => {
    await grant('site_room', 'SITE-A', 'RA1');
    await grantCapability(handle, WORKSPACE, actorId, 'voc.read', systemId, adminId);
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: otherId, kind: 'site', site: 'SITE-B' });
    expect(await resolve().resolve(actor())).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
    expect(await resolve().resolve({ ...actor(), workspace_id: '00000000-0000-4000-8000-000000000000' })).toEqual([]);
    // Positive control: the existing Managed System grant still authorizes its own capability.
    expect((await createCheckService({ db: handle.db }).checkCapability(actor(), 'voc.read', { workspace_id: WORKSPACE, managed_system_id: systemId })).allow).toBe(true);
  });

  it('deduplicates overlaps in catalog site and room order', async () => {
    await grant('site_room', 'SITE-B', 'RA1');
    await grant('site_room', 'SITE-A', 'RA1');
    await grant('site', 'SITE-A');
    expect(await resolve().resolve(actor())).toEqual([{ site: 'SITE-A', rooms: ['RA2', 'RA1'] }, { site: 'SITE-B', rooms: ['RA1'] }]);
  });

  it('revoking only the site grant leaves the site_room grant on the next resolve call', async () => {
    const localCatalog = parseScopeCatalog([{ site: 'SITE-B', label: 'B', rooms: ['RB1', 'RB2'] }]);
    const siteId = await grant('site', 'SITE-B');
    await grant('site_room', 'SITE-B', 'RB1');
    const resolver = createGrantTableScopeResolver({ db: handle.db, catalog: localCatalog });
    expect(await resolver.resolve(actor())).toEqual([{ site: 'SITE-B', rooms: ['RB1', 'RB2'] }]);
    await handle.pool.query('update permission.permission_grants set revoked_at = now() where id = $1', [siteId]);
    expect(await resolver.resolve(actor())).toEqual([{ site: 'SITE-B', rooms: ['RB1'] }]);
  });

  it('catalog growth adds RB6 only for a site grant, never for a site_room grant', async () => {
    const original = parseScopeCatalog([{ site: 'SITE-B', label: 'B', rooms: ['RB1', 'RB2'] }]);
    const expanded = parseScopeCatalog([{ site: 'SITE-B', label: 'B', rooms: ['RB1', 'RB2', 'RB6'] }]);
    await grant('site', 'SITE-B');
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: otherId, kind: 'site_room', site: 'SITE-B', room: 'RB1' });
    const roomActor = { ...actor(), actor_id: otherId };
    const first = createGrantTableScopeResolver({ db: handle.db, catalog: original });
    const second = createGrantTableScopeResolver({ db: handle.db, catalog: expanded });
    expect(await first.resolve(actor())).toEqual([{ site: 'SITE-B', rooms: ['RB1', 'RB2'] }]);
    expect(await second.resolve(actor())).toEqual([{ site: 'SITE-B', rooms: ['RB1', 'RB2', 'RB6'] }]);
    expect(await first.resolve(roomActor)).toEqual([{ site: 'SITE-B', rooms: ['RB1'] }]);
    expect(await second.resolve(roomActor)).toEqual([{ site: 'SITE-B', rooms: ['RB1'] }]);
  });

  it('an Admin without a scope.read grant has no Scope role shortcut', async () => {
    await grant('site', 'SITE-A');
    const resolver = resolve();
    const admin = { actor_id: adminId, workspace_id: WORKSPACE, role_level: 'admin' };
    expect(await resolver.resolve(actor())).toEqual([{ site: 'SITE-A', rooms: ['RA2', 'RA1'] }]);
    expect(await resolver.resolve(admin)).toEqual([]);
  });

  it('API token scopes intersect owner grants before any grant read', async () => {
    await grant('site', 'SITE-A');
    await grant('site_room', 'SITE-B', 'RA1');
    const resolver = resolve();
    const ownerSet = [{ site: 'SITE-A', rooms: ['RA2', 'RA1'] }, { site: 'SITE-B', rooms: ['RA1'] }];
    expect(await resolver.resolve(actor())).toEqual(ownerSet);
    // Observe the real DB method without replacing it: a denied token must not even start a SELECT.
    const select = vi.spyOn(handle.db, 'select');
    try {
      expect(await runAsToken('scope-token', ['workspace.read'], () => resolver.resolve(actor()))).toEqual([]);
      expect(select).not.toHaveBeenCalled();
    } finally {
      select.mockRestore();
    }
    expect(await runAsToken('scope-token', ['scope.read'], () => resolver.resolve(actor()))).toEqual(ownerSet);
    expect(await resolver.resolve(actor())).toEqual(ownerSet);
  });

  it.each(['site', 'site_room'].flatMap(kind => ['expires_at', 'revoked_at', 'superseded_at'].map(column => [kind, column] as const)))('%s %s drops the row on the next resolve call', async (kind, column) => {
    const id = await grant(kind, 'SITE-A', kind === 'site' ? null : 'RA1');
    const resolver = resolve();
    expect(await resolver.resolve(actor())).toEqual([{ site: 'SITE-A', rooms: kind === 'site' ? ['RA2', 'RA1'] : ['RA1'] }]);
    // Column comes only from the closed test-case list.
    await handle.pool.query(`update permission.permission_grants set ${column} = now() - interval '1 second' where id = $1`, [id]);
    expect(await resolver.resolve(actor())).toEqual([]);
  });

  it('drops catalog drift and expands site rows against the injected catalog', async () => {
    await grant('site_room', 'SITE-A', 'RA1');
    await grant('site', 'SITE-B');
    expect(await resolve().resolve(actor())).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }, { site: 'SITE-B', rooms: ['RB2', 'RA1'] }]);
    const changed = parseScopeCatalog([{ site: 'SITE-A', label: 'A', rooms: ['RA2'] }, { site: 'SITE-B', label: 'B', rooms: ['RB3'] }]);
    expect(await createGrantTableScopeResolver({ db: handle.db, catalog: changed }).resolve(actor())).toEqual([{ site: 'SITE-B', rooms: ['RB3'] }]);
    const removed = parseScopeCatalog([{ site: 'SITE-A', label: 'A', rooms: ['RA2'] }]);
    expect(await createGrantTableScopeResolver({ db: handle.db, catalog: removed }).resolve(actor())).toEqual([]);
  });

  it.each(['permission_grants', 'permission_requests'] as const)('%s refuses an active duplicate, permits same room in another site and revoked history', async table => {
    const insert = (site: string, room: string | null, kind = 'site_room') => insertScopePermissionRow(handle, { table, workspaceId: WORKSPACE, actorId, kind, site, room });
    const id = await insert('SITE-A', 'RA1');
    await expect(insert('SITE-A', 'RA1')).rejects.toMatchObject({ code: '23505', constraint: `${table}_active_uq` });
    await insert('SITE-B', 'RA1');
    await handle.pool.query(`update permission.${table} set ${table === 'permission_grants' ? 'revoked_at = now()' : "status = 'revoked'"} where id = $1`, [id]);
    await insert('SITE-A', 'RA1');
    await insert('SITE-A', null, 'site');
    await expect(insert('SITE-A', null, 'site')).rejects.toMatchObject({ code: '23505', constraint: `${table}_active_uq` });
    if (table === 'permission_grants') expect(await resolve().resolve(actor())).toEqual([{ site: 'SITE-A', rooms: ['RA2', 'RA1'] }, { site: 'SITE-B', rooms: ['RA1'] }]);
  });

  it.each(['permission_grants', 'permission_requests'] as const)('%s rejects every invalid kind/column combination at the CHECK boundary', async table => {
    const invalid = [
      { kind: 'unknown', site: null, room: null },
      { kind: 'managed_system', capability: 'scope.read' },
      { kind: 'managed_system', capability: 'voc.read', site: 'SITE-A' },
      { kind: 'managed_system', capability: 'voc.read', room: 'RA1' },
      ...['site', 'site_room'].flatMap(kind => [
        { kind, site: 'SITE-A', room: kind === 'site' ? null : 'RA1', capability: 'voc.read' },
        { kind, site: 'SITE-A', room: kind === 'site' ? null : 'RA1', managedSystemId: systemId },
        ...[null, '', ' '].map(site => ({ kind, site, room: kind === 'site' ? null : 'RA1' })),
      ]),
      { kind: 'site', site: 'SITE-A', room: 'RA1' },
      ...[null, '', ' '].map(room => ({ kind: 'site_room', site: 'SITE-A', room })),
    ];
    const client = await handle.pool.connect();
    try {
      await client.query('BEGIN');
      for (const combination of invalid) {
        await client.query('SAVEPOINT invalid_kind');
        // A checked-out client keeps the failed INSERT inside this savepoint, under platform_app.
        const rowHandle = { pool: client } as unknown as Pick<DbHandle, 'pool'>;
        await expect(insertScopePermissionRow(rowHandle, { table, workspaceId: WORKSPACE, actorId, ...combination })).rejects.toMatchObject({ code: '23514', constraint: `${table}_scope_kind_check` });
        await client.query('ROLLBACK TO SAVEPOINT invalid_kind');
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it.each(['site', 'site_room'])('keeps %s requests out of legacy lists, selected read, recovery and decision paths', async kind => {
    const checkService = createCheckService({ db: handle.db });
    const admin = { actor_id: adminId, workspace_id: WORKSPACE, role_level: 'admin' };
    const before = await countRecoveryPermissionRequests(handle.db, checkService, admin);
    const id = await insertScopePermissionRow(handle, { table: 'permission_requests', workspaceId: WORKSPACE, actorId, kind, site: 'SITE-A', room: kind === 'site' ? null : 'RA1' });
    expect(await countRecoveryPermissionRequests(handle.db, checkService, admin)).toBe(before);
    const projection = await permissionRecoveryProjection(checkService, admin, id);
    expect((await handle.db.execute(projection.query)).rows).toEqual([]);
    expect((await handle.db.execute(permissionRecoveryTruth(WORKSPACE, id))).rows).toEqual([]);
    const mine = await get('/permission-requests/mine');
    expect(mine.statusCode).toBe(200);
    expect(mine.json().requests).toEqual([]);
    const list = await get('/permissions/requests', adminCookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().requests.some((row: { id: string }) => row.id === id)).toBe(false);
    expect((await get(`/permission-requests/${id}`)).statusCode).toBe(404);
    expect((await get(`/permissions/requests/${id}`, adminCookie)).statusCode).toBe(404);
    const check = await get('/me/permissions/check?capability=scope.read');
    expect(check.json().state).toBe('blocked_non_requestable');
    for (const action of [kind === 'site' ? 'approve' : 'deny']) {
      const response = await app.inject({ method: 'POST', url: `/permissions/requests/${id}/${action}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` }, payload: { expected_revision: 1, reason: 'Scope fixture' } });
      expect(response.statusCode).toBe(404);
    }
    const stored = await handle.pool.query('select status from permission.permission_requests where id=$1', [id]);
    expect(stored.rows).toEqual([{ status: 'pending' }]);
  });

  it('existing request, approval validation and direct grant refuse scope.read', async () => {
    const request = await app.inject({ method: 'POST', url: '/permission-requests', headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` }, payload: { requested_capability: 'scope.read', reason: 'Scope fixture' } });
    expect(request.statusCode).toBe(422);
    expect(request.json().code).toBe('validation.failed');
    await expect(validateSupportedScope(handle.db, WORKSPACE, 'scope.read', null, null, null, { approval: true })).rejects.toMatchObject({ code: 'validation.failed' });
    const direct = await app.inject({ method: 'POST', url: '/permissions/grants', headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` }, payload: { actor_id: actorId, capability: 'scope.read', reason: 'Scope fixture' } });
    expect(direct.statusCode).toBe(422);
    expect(direct.json().code).toBe('validation.failed');
    const stored = await handle.pool.query('select id from permission.permission_grants where actor_id=$1', [actorId]);
    expect(stored.rows).toEqual([]);
  });

  it('propagates a closed database handle error', async () => {
    const closed = createDb(APP_URL);
    await closed.close();
    await expect(createGrantTableScopeResolver({ db: closed.db, catalog }).resolve(actor())).rejects.toThrow();
  });
  it('honors abort after the database read', async () => {
    await grant('site', 'SITE-A');
    const controller = new AbortController();
    handle.pool.once('release', () => controller.abort());
    await expect(resolve().resolve(actor(), controller.signal)).rejects.toThrow();
  });
  it('honors abort before the read', async () => {
    const signal = AbortSignal.abort();
    await expect(resolve().resolve(actor(), signal)).rejects.toThrow();
  });
});
