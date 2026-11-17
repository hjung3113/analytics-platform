// Requires migration 0139. Host runs against the task's throwaway 5439 database.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { permissionGroupItemSchema } from '@ap/feature-shared';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';

const runIntegration = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_MIGRATE && process.env.WORKSPACE_ID);
const workspace = process.env.WORKSPACE_ID ?? '';
describe.skipIf(!runIntegration)('Permission groups (#2408)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin = '';
  let owner = '';
  let other = '';
  let ownerId = '';
  let otherId = '';
  let systemId = '';
  const systemIds: string[] = [];
  const groupIds: string[] = [];
  const actorIds: string[] = [];
  async function login(externalId: string) {
    const r = await app.inject({ method: 'POST', url: '/auth/mock-login', headers: { 'user-agent': 'groups-test' }, payload: { external_id: externalId } });
    const cookies = r.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies : [cookies]).find(Boolean)?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
    if (!cookie) throw new Error('missing session cookie');
    return cookie;
  }
  function call(method: HTTPMethods, url: string, cookie: string, payload?: Record<string, unknown>, key?: string) {
    return app.inject({ method, url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, ...(key ? { 'idempotency-key': key } : {}) }, ...(payload ? { payload } : {}) });
  }
  async function create(kind: 'operator' | 'personal', cookie = owner, capabilities = ['voc.read']) {
    const r = await call('POST', '/permission-groups', cookie, { kind, name: randomUUID(), capabilities });
    expect(r.statusCode).toBe(201);
    const group = permissionGroupItemSchema.parse(r.json());
    groupIds.push(group.id);
    return group;
  }
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(process.env.DATABASE_URL ?? '');
    migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    admin = await login('mock-admin-1');
  });
  beforeEach(async () => {
    await migrate.pool.query('delete from core.rate_limits');
    const a = await insertDevActor(db, workspace, `group-owner-${randomUUID()}`);
    const b = await insertDevActor(db, workspace, `group-other-${randomUUID()}`);
    actorIds.push(a.id, b.id);
    ownerId = a.id;
    otherId = b.id;
    owner = await login(a.externalId);
    other = await login(b.externalId);
    const system = await db.pool.query<{ id: string }>("insert into core.managed_systems(workspace_id, slug, name) values ($1, $2, 'Group test') returning id", [workspace, randomUUID()]);
    systemId = system.rows[0]?.id ?? '';
    systemIds.push(systemId);
  });
  afterAll(async () => {
    await migrate.pool.query('delete from permission.permission_requests where requester_actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_groups where id = any($1::uuid[])', [groupIds]);
    await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.idempotency_keys where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [systemIds]);
    await app.close();
    await db.close();
    await migrate.close();
  });

  it('keeps personal groups private, shares with humans, and exposes admin scope=all', async () => {
    const g = await create('personal');
    const op = await create('operator', admin);
    expect((await call('GET', `/permission-groups/${g.id}`, other)).statusCode).toBe(404);
    const list = (await call('GET', '/permission-groups', other)).json().items;
    expect(list.some((x: { id: string }) => x.id === op.id)).toBe(true);
    expect(list.some((x: { id: string }) => x.id === g.id)).toBe(false);
    expect((await call('GET', '/permission-groups?scope=all', admin)).json().items.some((x: { id: string }) => x.id === g.id)).toBe(true);
    expect((await call('GET', `/permission-groups/${g.id}`, admin)).json()).toMatchObject({ can_edit: false, grant_count: 0 });
    expect((await call('GET', '/permission-groups?scope=all', other)).statusCode).toBe(403);
    expect((await call('POST', '/permission-requests/batch', other, { permission_group_id: g.id, reason: 'Private', items: [{ requested_capability: 'voc.read' }] })).statusCode).toBe(404);
    const shared = await call('PUT', `/permission-groups/${g.id}/shares`, owner, { actor_ids: [otherId] });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().shared_with).toEqual([{ actor_id: otherId, display_name: expect.any(String) }]);
    const visible = (await call('GET', `/permission-groups/${g.id}`, other)).json();
    expect(visible).toMatchObject({ can_edit: false, shared_with: [], grant_count: null });
    const sharedRequest = await call('POST', '/permission-requests/batch', other, { permission_group_id: g.id, reason: 'Shared template',
      items: [{ requested_capability: 'voc.read', requested_managed_system_id: systemId }] });
    expect(sharedRequest.statusCode).toBe(201);
    expect((await call('PATCH', `/permission-groups/${g.id}`, other, { expected_updated_at: g.updated_at, name: 'Forbidden' })).statusCode).toBe(403);
    const audit = await migrate.pool.query('select event_type from core.audit_log where subject_id = $1 order by created_at', [g.id]);
    expect(audit.rows.map((x) => x.event_type)).toEqual(['permission_group_created', 'permission_group_shared']);
  });
  it.each(['survey.export', 'workspace.admin'])('rejects personal capability %s with its field index', async (capability) => {
    const r = await call('POST', '/permission-groups', owner, { kind: 'personal', name: randomUUID(), capabilities: ['voc.read', capability] });
    expect(r.statusCode).toBe(422);
    expect(r.json().detail.fields).toContainEqual({ path: ['capabilities', 1], code: 'custom' });
  });
  it('enforces uniqueness, stale writes, write replay, archive and editor gates', async () => {
    const g = await create('personal');
    expect((await call('POST', '/permission-groups', owner, { kind: 'personal', name: g.name, capabilities: ['voc.read'] })).json().code).toBe('conflict.permission_group_name_taken');
    expect((await call('PATCH', `/permission-groups/${g.id}`, owner, { expected_updated_at: '2000-01-01T00:00:00.000Z', name: 'Stale' })).statusCode).toBe(409);
    const key = randomUUID();
    const body = { expected_updated_at: g.updated_at, name: `Changed ${g.name}`, capabilities: ['finding.read'] };
    const updated = await call('PATCH', `/permission-groups/${g.id}`, owner, body, key);
    expect(updated.statusCode).toBe(200);
    expect((await call('PATCH', `/permission-groups/${g.id}`, owner, body, key)).json()).toEqual(updated.json());
    const archived = await call('POST', `/permission-groups/${g.id}/archive`, owner, { expected_updated_at: updated.json().updated_at });
    expect(archived.statusCode).toBe(200);
    expect((await call('GET', `/permission-groups/${g.id}`, owner)).statusCode).toBe(404);
    expect((await call('POST', '/permission-groups', other, { kind: 'operator', name: randomUUID(), capabilities: ['voc.read'] })).statusCode).toBe(403);
  });
  it('accepts a subset, marks foreign capabilities by row, refuses personal direct grants and preserves archived origin reads', async () => {
    const g = await create('personal', owner, ['voc.read', 'finding.read']);
    const bad = await call('POST', '/permission-requests/batch', owner, { permission_group_id: g.id, reason: 'Bad subset', items: [{ requested_capability: 'survey.read' }] });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().detail.item_index).toBe(0);
    const grant = await call('POST', '/permissions/grants/batch', admin, { actor_id: ownerId, permission_group_id: g.id, reason: 'Personal', items: [{ capability: 'voc.read' }] });
    expect(grant.statusCode).toBe(422);
    const r = await call('POST', '/permission-requests/batch', owner, { permission_group_id: g.id, reason: 'Subset', items: [{ requested_capability: 'voc.read', requested_managed_system_id: systemId }] });
    expect(r.statusCode).toBe(201);
    const id = r.json().items[0].id;
    await call('POST', `/permission-groups/${g.id}/archive`, owner, { expected_updated_at: g.updated_at });
    for (const [url, cookie] of [[`/permission-requests/${id}`, owner], [`/permissions/requests/${id}`, admin]] as const) {
      expect((await call('GET', url, cookie)).json()).toMatchObject({ batch_id: r.json().batch_id, permission_group: { id: g.id, name: g.name } });
    }
    for (const [url, cookie] of [['/permission-requests/mine', owner], ['/permissions/requests', admin]] as const) {
      expect((await call('GET', url, cookie)).json().requests.find((x: { id: string }) => x.id === id)).toMatchObject({ batch_id: r.json().batch_id, permission_group: { id: g.id, name: g.name } });
    }
  });
  it('keeps group origin on direct grants and approvals and counts only active grants for admins', async () => {
    const g = await create('operator', admin, ['voc.read', 'finding.read']);
    const direct = await call('POST', '/permissions/grants/batch', admin, { actor_id: otherId,
      permission_group_id: g.id, reason: 'Onboard', items: [{ capability: 'voc.read', managed_system_id: systemId }] });
    expect(direct.statusCode).toBe(201);
    expect(direct.json().items[0].permission_group).toEqual({ id: g.id, name: g.name });
    const request = await call('POST', '/permission-requests/batch', owner, { permission_group_id: g.id, reason: 'Review',
      items: [{ requested_capability: 'finding.read', requested_managed_system_id: systemId }] });
    expect(request.statusCode).toBe(201);
    const id = request.json().items[0].id;
    const decided = await call('POST', `/permissions/requests/batch/${request.json().batch_id}/decide`, admin,
      { action: 'approve', approve_ids: [id], expected_revisions: { [id]: 1 } });
    expect(decided.statusCode).toBe(200);
    const current = (await call('GET', `/permission-groups/${g.id}`, admin)).json();
    expect(current.grant_count).toBe(2);
    expect((await call('GET', `/permission-groups/${g.id}`, owner)).json().grant_count).toBeNull();
    expect((await call('PUT', `/permission-groups/${g.id}/shares`, admin, { actor_ids: [] })).statusCode).toBe(422);
    const archive = await call('POST', `/permission-groups/${g.id}/archive`, admin, { expected_updated_at: current.updated_at });
    expect(archive.statusCode).toBe(200);
    const grants = (await call('GET', '/permissions/grants', admin)).json().items.filter((x: { actor_id: string }) => x.actor_id === otherId || x.actor_id === ownerId);
    expect(grants).toHaveLength(2);
    expect(grants.every((x: { permission_group: { id: string; name: string } }) => x.permission_group.id === g.id && x.permission_group.name === g.name)).toBe(true);
  });
});
