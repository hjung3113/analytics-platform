import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs, SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { insertScopePermissionRow, expireCapabilityGrant, denyCapability } from '../../../test-support/permissions-fixtures.js';
import { createSessionService } from '../../auth/session-service.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createNoopNotificationDispatcher, createNotificationNotifier } from '../../notifications/index.js';
import { getResolvedWorkspaceSettings } from '../../workspace-settings/index.js';
import { sessionVersionOf } from '../../platform-port/session-version.js';
import { createCheckService } from '../check-service.js';
import { createGrantTableScopeResolver } from '../grant-table-scope-resolver.js';
import { permissionsRoutes } from '../routes.js';
import { parseScopeCatalog } from '../scope-catalog.js';
import { createPermissionServices } from '../services.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE);
const prefix = `it-1844c-${randomUUID()}`;
const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'A', rooms: ['RA1', 'RA2'] },
  { site: 'SITE-B', label: 'B', rooms: ['RA1'] },
]);
const roomTarget = { requested_scope_kind: 'site_room', requested_scope_site: 'SITE-A', requested_scope_room: 'RA1' };

describe.skipIf(!runIntegration)('site and room Permission flows', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  const ids: string[] = [];
  let user: { id: string; cookie: string };
  let admin: { id: string; cookie: string };
  let other: { id: string; cookie: string };
  const actor = () => ({ actor_id: user.id, workspace_id: WORKSPACE, role_level: 'user' as const });
  const resolve = () => createGrantTableScopeResolver({ db: handle.db, catalog }).resolve(actor());
  // Pin hash invalidation at the resolver seam; production snapshot wiring belongs to 1844d.
  const version = async () => sessionVersionOf({ user: { id: user.id }, scopes: await resolve() });
  const headers = (person = user) => ({ cookie: `${SESSION_COOKIE_NAME}=${person.cookie}` });
  const request = (target: Record<string, unknown> = roomTarget, base = '/scope-test') => app.inject({
    method: 'POST', url: `${base}/permission-requests`, headers: headers(),
    payload: { requested_capability: 'scope.read', reason: 'Synthetic scope request', ...target },
  });
  const direct = (target: Record<string, unknown> = {}, base = '/scope-test') => app.inject({
    method: 'POST', url: `${base}/permissions/grants`, headers: headers(admin),
    payload: { actor_id: user.id, capability: 'scope.read', reason: 'Synthetic grant', scope_kind: 'site_room', scope_site: 'SITE-A', scope_room: 'RA1', ...target },
  });
  const decide = (id: string, action = 'approve', body: Record<string, unknown> = {}, base = '/scope-test', person = admin) => app.inject({
    method: 'POST', url: `${base}/permissions/requests/${id}/${action}`, headers: headers(person), payload: { expected_revision: 1, ...(action === 'need-more-info' ? {} : { reason: 'Reviewed' }), ...body },
  });
  async function person(role: 'user' | 'developer' | 'admin') {
    const externalId = `${prefix}-${randomUUID()}`;
    const row = await insertActorRow(handle, { workspaceId: WORKSPACE, externalId, roleLevel: role });
    ids.push(row.id);
    return { id: row.id, cookie: await loginAs(app, externalId) };
  }
  async function audit(subject: string, event: string) {
    const result = await migrate.pool.query('select detail from core.audit_log where subject_id=$1 and event_type=$2 order by created_at desc limit 1', [subject, event]);
    expect(result.rows).toHaveLength(1);
    return result.rows[0].detail;
  }
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    // Register the real Permission module on a prefix with real collaborators. No boot-file edit or DB mock.
    for (const [routePrefix, scopeCatalog] of [
      ['/scope-test', catalog], ['/without-catalog', undefined],
      ['/removed-target', parseScopeCatalog([{ site: 'SITE-A', label: 'A', rooms: ['RA2'] }])],
    ] as const) {
      const checkService = createCheckService({ db: handle.db });
      await app.register(permissionsRoutes, {
        prefix: routePrefix, workspaceId: WORKSPACE,
        sessionService: createSessionService({ db: handle.db, workspaceId: WORKSPACE }), checkService,
        ...createPermissionServices({ db: handle.db, checkService, scopeCatalog, auditService: createAuditService(),
          idempotencyService: createIdempotencyService(), notify: createNotificationNotifier(createNoopNotificationDispatcher()),
          resolveWorkspaceSettings: getResolvedWorkspaceSettings }),
        rateLimitConfig: { mutation: app.rateLimitConfig.mutation, sensitive: app.rateLimitConfig.sensitive },
      });
    }
    await app.ready();
  });
  beforeEach(async () => { user = await person('user'); admin = await person('admin'); other = await person('user'); });
  afterAll(async () => {
    try {
      if (migrate && ids.length) {
        await migrate.pool.query('delete from core.audit_log where actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from permission.permission_requests where requester_actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from permission.permission_denies where actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from permission.permission_grants where actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from core.idempotency_keys where actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [ids]);
        await migrate.pool.query('delete from core.actors where id=any($1::uuid[])', [ids]);
      }
    } finally { await app?.close(); await handle?.close(); await migrate?.close(); }
  });
  it('request → approve is visible on the next resolve, auditable and changes the session hash', async () => {
    const before = await version();
    const created = await request();
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    expect(await audit(id, 'permission_requested')).toMatchObject({ scope_kind: 'site_room', scope_site: 'SITE-A', scope_room: 'RA1', sensitive: false });
    const approved = await decide(id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ ...roomTarget, granted_scope_kind: 'site_room', granted_scope_site: 'SITE-A', granted_scope_room: 'RA1' });
    expect(await resolve()).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
    expect(await version()).not.toBe(before);
    expect(await audit(id, 'permission_approved')).toMatchObject({ requested_scope_kind: 'site_room', granted_scope_kind: 'site_room', scope_site: 'SITE-A' });
  });
  it('rejection leaves no grant', async () => {
    const created = await request();
    expect((await decide(created.json().id, 'reject')).statusCode).toBe(200);
    expect(await resolve()).toEqual([]);
    expect(await audit(created.json().id, 'permission_rejected')).toMatchObject({ scope_kind: 'site_room' });
  });
  it('direct grant → revoke updates the next resolver call and hash, with scope audit fields', async () => {
    const before = await version();
    const granted = await direct();
    expect(granted.statusCode, granted.body).toBe(201);
    const during = await version();
    expect(during).not.toBe(before);
    expect(await resolve()).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
    expect(await audit(granted.json().id, 'permission_granted')).toMatchObject({ scope_kind: 'site_room', scope_site: 'SITE-A', scope_room: 'RA1' });
    const revoked = await app.inject({ method: 'POST', url: `/scope-test/permissions/grants/${granted.json().id}/revoke`, headers: headers(admin), payload: { reason: 'Revoke' } });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(await resolve()).toEqual([]);
    expect(await version()).not.toBe(during);
    expect(await audit(granted.json().id, 'permission_revoked')).toMatchObject({ scope_kind: 'site_room', scope_room: 'RA1' });
  });
  it('expiry removes a direct grant on the next resolver call', async () => {
    const granted = await direct();
    expect(granted.statusCode).toBe(201);
    await expireCapabilityGrant(handle, granted.json().id);
    expect(await resolve()).toEqual([]);
  });
  it('allows approval narrowing from site to a room in that site', async () => {
    const created = await request({ requested_scope_kind: 'site', requested_scope_site: 'SITE-A' });
    expect(created.statusCode).toBe(201);
    const approved = await decide(created.json().id, 'approve', { granted_scope_kind: 'site_room', granted_scope_site: 'SITE-A', granted_scope_room: 'RA2' });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await resolve()).toEqual([{ site: 'SITE-A', rooms: ['RA2'] }]);
  });
  it.each([
    { granted_scope_kind: 'site', granted_scope_room: null },
    { granted_scope_site: 'SITE-B' },
    { granted_scope_room: 'RA2' },
  ])('refuses approval widening/movement %j', async target => {
    const created = await request();
    const result = await decide(created.json().id, 'approve', target);
    expect(result.statusCode, result.body).toBe(422);
    expect(result.json().code).toBe('validation.failed');
    expect(await resolve()).toEqual([]);
  });
  it.each([
    ['scope_site', 'GONE'], ['scope_room', 'GONE'],
  ])('refuses unknown %s on request, approval and direct grant', async (field, value) => {
    const badRequest = await request({ ...roomTarget, [`requested_${field}`]: value });
    expect(badRequest.statusCode, badRequest.body).toBe(422);
    expect(badRequest.json().detail.fields[0].path).toEqual([`requested_${field}`]);
    const badGrant = await direct({ [field]: value });
    expect(badGrant.statusCode).toBe(422);
    expect(badGrant.json().detail.fields[0].path).toEqual([field]);
    const created = await request();
    const badApproval = await decide(created.json().id, 'approve', { [`granted_${field}`]: value });
    expect(badApproval.statusCode).toBe(422);
    expect(badApproval.json().detail.fields[0].path).toEqual([`granted_${field}`]);
    expect(await resolve()).toEqual([]);
  });
  it.each([['SITE-A', 'requested_scope_room'], ['SITE-B', 'requested_scope_site']])('revalidates removed target %s at approval', async (site, field) => {
    const created = await request({ ...roomTarget, requested_scope_site: site });
    const result = await decide(created.json().id, 'approve', {}, '/removed-target');
    expect(result.statusCode, result.body).toBe(422);
    expect(result.json().detail.fields[0].path).toEqual([field]);
    expect(await resolve()).toEqual([]);
  });
  it('lists an out-of-catalog grant with in_catalog false, filters it and revokes it', async () => {
    const id = await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: user.id, kind: 'site_room', site: 'GONE', room: 'RA1' });
    const list = await app.inject({ method: 'GET', url: '/scope-test/permissions/grants?scope_kind=site_room&scope_site=GONE', headers: headers(admin) });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual([expect.objectContaining({ id, scope_kind: 'site_room', scope_site: 'GONE', in_catalog: false })]);
    const revoked = await app.inject({ method: 'POST', url: `/scope-test/permissions/grants/${id}/revoke`, headers: headers(admin), payload: { reason: 'Catalog cleanup' } });
    expect(revoked.statusCode, revoked.body).toBe(200);
  });
  it('candidate names come only from the catalog and coverage only from the caller', async () => {
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: user.id, kind: 'site_room', site: 'SITE-A', room: 'RA1' });
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: other.id, kind: 'site', site: 'SITE-B' });
    await insertScopePermissionRow(handle, { table: 'permission_grants', workspaceId: WORKSPACE, actorId: user.id, kind: 'site_room', site: 'GONE', room: 'SECRET' });
    const result = await app.inject({ method: 'GET', url: '/scope-test/permission-requests/scope-candidates', headers: headers() });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ sites: [
      { site: 'SITE-A', label: 'A', siteGranted: false, rooms: [{ room: 'RA1', granted: true }, { room: 'RA2', granted: false }] },
      { site: 'SITE-B', label: 'B', siteGranted: false, rooms: [{ room: 'RA1', granted: false }] },
    ] });
    expect((await app.inject({ method: 'GET', url: '/scope-test/permission-requests/scope-candidates' })).statusCode).toBe(401);
  });
  it('without a catalog writes fail closed and candidates are empty', async () => {
    for (const result of [await request(roomTarget, '/without-catalog'), await direct({}, '/without-catalog')]) {
      expect(result.statusCode).toBe(422);
      expect(result.json().message).toBe('scope catalog is not configured');
    }
    const created = await request();
    expect((await decide(created.json().id, 'approve', {}, '/without-catalog')).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/without-catalog/permission-requests/scope-candidates', headers: headers() })).json()).toEqual({ sites: [] });
  });
  it('refuses duplicate active requests but allows the same room in another site', async () => {
    expect((await request()).statusCode).toBe(201);
    const duplicate = await request();
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('conflict.permission_request_duplicate');
    expect((await request({ ...roomTarget, requested_scope_site: 'SITE-B' })).statusCode).toBe(201);
  });
  it('a site grant covers a room request in the same site', async () => {
    expect((await direct({ scope_kind: 'site', scope_room: null })).statusCode).toBe(201);
    const result = await request();
    expect(result.statusCode).toBe(409);
    expect(result.json().code).toBe('conflict.capability_already_granted');
  });
  it('owner reads keep 404 privacy and show scope fields in mine and selected reads', async () => {
    const created = await request();
    const id = created.json().id;
    const mine = await app.inject({ method: 'GET', url: '/scope-test/permission-requests/mine', headers: headers() });
    expect(mine.json().requests).toEqual([expect.objectContaining({ id, ...roomTarget })]);
    const detail = await app.inject({ method: 'GET', url: `/scope-test/permission-requests/${id}`, headers: headers() });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject(roomTarget);
    expect((await app.inject({ method: 'GET', url: `/scope-test/permission-requests/${id}`, headers: headers(other) })).statusCode).toBe(404);
    const review = await app.inject({ method: 'GET', url: `/scope-test/permissions/requests/${id}`, headers: headers(admin) });
    expect(review.statusCode, review.body).toBe(200);
    expect(review.json().effective_access.scope).toEqual({ kind: 'scoped', managed_system_ids: [] });
    expect(review.json().effective_access).toMatchObject({ scope_kind: 'site_room', scope_site: 'SITE-A', scope_room: 'RA1' });
    expect(review.json().risk_indicators.some((risk: { code: string }) => risk.code === 'workspace_scope')).toBe(false);
    const list = await app.inject({ method: 'GET', url: '/scope-test/permissions/requests', headers: headers(admin) });
    expect(list.json().requests).toContainEqual(expect.objectContaining({ id, ...roomTarget }));
  });
  it('requires workspace.admin to approve regardless of console permission names', async () => {
    const created = await request();
    const result = await decide(created.json().id, 'approve', {}, '/scope-test', other);
    expect(result.statusCode).toBe(403);
    expect(await resolve()).toEqual([]);
  });
  it.each(['developer', 'admin'] as const)('%s may request and receive scope.read', async role => {
    user = await person(role);
    const created = await request();
    expect(created.statusCode, created.body).toBe(201);
    expect((await decide(created.json().id)).statusCode).toBe(200);
    expect(await resolve()).toEqual([{ site: 'SITE-A', rooms: ['RA1'] }]);
  });
  it('preserves site fields through needs-more-info, supplement, edit and cancel', async () => {
    const created = await request();
    const id = created.json().id;
    const question = await decide(id, 'need-more-info', { note: 'Clarify the purpose' });
    expect(question.statusCode, question.body).toBe(200);
    expect(await audit(id, 'permission_needs_more_info')).toMatchObject({ scope_kind: 'site_room', scope_room: 'RA1' });
    const supplement = await app.inject({ method: 'POST', url: `/scope-test/permission-requests/${id}/submit-more-info`, headers: headers(),
      payload: { expected_revision: 2, reason: 'Clarified', requested_scope_room: 'RA2' } });
    expect(supplement.statusCode, supplement.body).toBe(200);
    expect(supplement.json()).toMatchObject({ ...roomTarget, requested_scope_room: 'RA2' });
    expect(await audit(id, 'permission_more_info_submitted')).toMatchObject({ scope_kind: 'site_room', scope_room: 'RA2', previous: { scope_room: 'RA1' } });
    const edited = await app.inject({ method: 'PATCH', url: `/scope-test/permission-requests/${id}`, headers: headers(),
      payload: { expected_revision: 3, reason: 'Updated explanation' } });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(await audit(id, 'permission_request_updated')).toMatchObject({ previous: { scope_room: 'RA2' }, resulting: { scope_room: 'RA2' } });
    const cancelled = await app.inject({ method: 'POST', url: `/scope-test/permission-requests/${id}/cancel`, headers: headers(), payload: { expected_revision: 4 } });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: 'cancelled', requested_scope_kind: 'site_room', requested_scope_site: 'SITE-A', requested_scope_room: 'RA2' });
    expect(await audit(id, 'permission_request_cancelled')).toMatchObject({ scope_kind: 'site_room', scope_room: 'RA2' });
    expect(await resolve()).toEqual([]);
  });
  it('reissues an expired scope grant with a new ID and superseded predecessor', async () => {
    const first = await direct();
    expect(first.statusCode).toBe(201);
    await expireCapabilityGrant(handle, first.json().id);
    const replacement = await direct();
    expect(replacement.statusCode, replacement.body).toBe(201);
    expect(replacement.json().id).not.toBe(first.json().id);
    const previous = await handle.pool.query('select superseded_at, revoked_at from permission.permission_grants where id=$1', [first.json().id]);
    expect(previous.rows[0].superseded_at).not.toBeNull();
    expect(previous.rows[0].revoked_at).toBeNull();
    expect(await audit(replacement.json().id, 'permission_granted')).toMatchObject({ mode: 'reissue', previous_grant_id: first.json().id, scope_room: 'RA1' });
  });
  it('uses the existing self-grant envelope and self_grant audit for an Admin', async () => {
    const result = await direct({ actor_id: admin.id, self_approval: { policy_citation: 'Synthetic policy', peer_reviewer_absence: 'Synthetic absence' } });
    expect(result.statusCode, result.body).toBe(201);
    expect(await audit(result.json().id, 'permission_granted')).toMatchObject({ self_grant: true, scope_kind: 'site_room', self_approval: { policy_citation: 'Synthetic policy' } });
  });
  it('replays scope requests and approvals by the existing idempotency key', async () => {
    const key = randomUUID();
    const submit = () => app.inject({ method: 'POST', url: '/scope-test/permission-requests', headers: { ...headers(), 'idempotency-key': key },
      payload: { requested_capability: 'scope.read', reason: 'Replay', ...roomTarget } });
    const created = await submit();
    expect(created.statusCode).toBe(201);
    expect((await submit()).json()).toEqual(created.json());
    const decisionKey = randomUUID();
    const approve = () => app.inject({ method: 'POST', url: `/scope-test/permissions/requests/${created.json().id}/approve`,
      headers: { ...headers(admin), 'idempotency-key': decisionKey }, payload: { expected_revision: 1 } });
    const approved = await approve();
    expect(approved.statusCode, approved.body).toBe(200);
    expect((await approve()).json()).toEqual(approved.json());
    const count = await migrate.pool.query("select count(*)::int as count from core.audit_log where subject_id=$1 and event_type='permission_approved'", [created.json().id]);
    expect(count.rows).toEqual([{ count: 1 }]);
  });
  it('a later explicit workspace.admin deny is rechecked inside approval', async () => {
    const created = await request();
    await denyCapability(handle, WORKSPACE, admin.id, 'workspace.admin', null, admin.id);
    const result = await decide(created.json().id);
    expect(result.statusCode, result.body).toBe(403);
    expect(await resolve()).toEqual([]);
  });
  it('refuses moving an entire site request to another catalog site', async () => {
    const created = await request({ requested_scope_kind: 'site', requested_scope_site: 'SITE-A' });
    const result = await decide(created.json().id, 'approve', { granted_scope_site: 'SITE-B' });
    expect(result.statusCode, result.body).toBe(422);
    expect(await resolve()).toEqual([]);
  });
  it('retains legacy managed-system request, approval and direct-grant response shapes', async () => {
    const created = await request({ requested_capability: 'knowledge.draft.create' });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toEqual({ id: created.json().id, status: 'pending', revision: 1, created_at: created.json().created_at });
    const approved = await decide(created.json().id);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toEqual({ id: created.json().id, revision: 2, updated_at: approved.json().updated_at,
      requested_managed_system_id: null, granted_managed_system_id: null, requested_expiration: null, granted_expiration: null,
      status: 'approved', grant_id: approved.json().grant_id });
    const granted = await app.inject({ method: 'POST', url: '/scope-test/permissions/grants', headers: headers(admin),
      payload: { actor_id: other.id, capability: 'knowledge.draft.create', reason: 'Synthetic legacy grant' } });
    expect(granted.statusCode, granted.body).toBe(201);
    expect(granted.json()).toEqual({ id: granted.json().id, actor_id: other.id, capability: 'knowledge.draft.create',
      managed_system_id: null, granted_by_actor_id: admin.id, granted_at: granted.json().granted_at, expires_at: null });
  });
  it('grant options advertise site and site_room without a workspace-wide scope.read candidate', async () => {
    const result = await app.inject({ method: 'GET', url: `/scope-test/permissions/grant-options?actor_id=${user.id}`, headers: headers(admin) });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().candidates.filter((candidate: { capability: string }) => candidate.capability === 'scope.read')).toEqual([
      { capability: 'scope.read', managed_system_id: null, scope_kinds: ['site', 'site_room'], governance_required: false, preflight: { state: 'available' } },
    ]);
  });
  it('refuses scope.read deny without changing the request', async () => {
    const created = await request();
    const denied = await decide(created.json().id, 'deny');
    expect(denied.statusCode).toBe(422);
    expect(denied.json().code).toBe('validation.failed');
    const state = await handle.pool.query('select status from permission.permission_requests where id=$1', [created.json().id]);
    expect(state.rows).toEqual([{ status: 'pending' }]);
  });
});
