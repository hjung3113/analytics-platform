import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../../db/client.js';
import { loadConfig } from '../../../config.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { createRecordingNotificationDispatcher } from '../../notifications/port.js';

const workspace = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_MIGRATE && workspace);
describe.skipIf(!runIntegration)('Atomic request batch decisions (#2408)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin = '';
  let adminActorId = '';
  let member = '';
  let actorId = '';
  let systemId = '';
  const actorIds: string[] = [];
  const systemIds: string[] = [];
  const notifications = createRecordingNotificationDispatcher();
  async function login(externalId: string) {
    const r = await app.inject({ method: 'POST', url: '/auth/mock-login', headers: { 'user-agent': 'batch-decide-test' }, payload: { external_id: externalId } });
    const cookies = r.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies : [cookies]).find(Boolean)?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
    if (!cookie) throw new Error('missing cookie');
    return cookie;
  }
  function post(url: string, cookie: string, payload: Record<string, unknown>, key?: string) {
    return app.inject({ method: 'POST', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, ...(key ? { 'idempotency-key': key } : {}) }, payload });
  }
  async function batch(capabilities = ['voc.read', 'finding.read']) {
    const r = await post('/permission-requests/batch', member, { reason: 'Batch request', items: capabilities.map((capability) => ({ requested_capability: capability, requested_managed_system_id: systemId })) });
    expect(r.statusCode).toBe(201);
    notifications.jobs.splice(0);
    const body = r.json() as { batch_id: string; items: { id: string; revision: number }[] };
    return { ...body, revisions: Object.fromEntries(body.items.map((x) => [x.id, x.revision])) };
  }
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(process.env.DATABASE_URL ?? '');
    migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    app = await buildServer({ config: loadConfig(), dbHandle: db, notificationDispatcher: notifications });
    await app.ready();
    admin = await login('mock-admin-1');
    const adminRow = await db.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [workspace],
    );
    adminActorId = adminRow.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock admin actor missing');
  });
  beforeEach(async () => {
    await migrate.pool.query('delete from core.rate_limits');
    const actor = await insertDevActor(db, workspace, `batch-decide-${randomUUID()}`);
    actorId = actor.id;
    actorIds.push(actorId);
    member = await login(actor.externalId);
    const r = await db.pool.query<{ id: string }>("insert into core.managed_systems(workspace_id,slug,name) values ($1,$2,'Batch decide') returning id", [workspace, randomUUID()]);
    systemId = r.rows[0]?.id ?? '';
    systemIds.push(systemId);
  });
  afterAll(async () => {
    await migrate.pool.query('delete from permission.permission_requests where requester_actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.idempotency_keys where actor_id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    await migrate.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [systemIds]);
    await app.close();
    await db.close();
    await migrate.close();
  });
  it('approves only listed rows, rejects the rest, audits both revisions and replays without side effects', async () => {
    const b = await batch();
    const approvedId = b.items[0]?.id;
    const key = randomUUID();
    const payload = { action: 'approve', approve_ids: [approvedId], expected_revisions: b.revisions, reason: 'Only one needed' };
    const r = await post(`/permissions/requests/batch/${b.batch_id}/decide`, admin, payload, key);
    expect(r.statusCode).toBe(200);
    expect(r.json().items).toEqual(expect.arrayContaining([expect.objectContaining({ id: approvedId, status: 'approved', grant_id: expect.any(String) }), expect.objectContaining({ id: b.items[1]?.id, status: 'rejected' })]));
    expect((await post(`/permissions/requests/batch/${b.batch_id}/decide`, admin, payload, key)).json()).toEqual(r.json());
    const audit = await migrate.pool.query("select event_type, detail from core.audit_log where subject_id = any($1::uuid[]) and event_type in ('permission_approved','permission_rejected')", [b.items.map((x) => x.id)]);
    expect(audit.rows).toHaveLength(2);
    expect(new Set(audit.rows.map((x) => x.event_type))).toEqual(new Set(['permission_approved', 'permission_rejected']));
    expect(audit.rows.every((x) => x.detail.previous_revision === 1 && x.detail.revision === 2 && x.detail.reason === payload.reason)).toBe(true);
    expect(new Set(notifications.jobs.map((x) => x.correlation_id)).size).toBe(1);
    expect(notifications.jobs).toHaveLength(1);
    const [notification] = notifications.jobs;
    expect(notification).toMatchObject({
      actor_id: actorId,
      event_type: 'permission_request.decided',
      subject_type: 'permission_request',
      detail: {
        batch_id: b.batch_id,
        actor_id: adminActorId,
        status: 'approved',
      },
    });
    expect(notification?.detail.permission_request_id).toBe(notification?.subject_id);
  });
  it.each(['reject', 'need-more-info'])('%s applies to every row and requires one reason', async (action) => {
    const b = await batch();
    const url = `/permissions/requests/batch/${b.batch_id}/decide`;
    expect((await post(url, admin, { action, expected_revisions: b.revisions })).statusCode).toBe(422);
    const r = await post(url, admin, { action, expected_revisions: b.revisions, reason: 'Please explain' });
    expect(r.statusCode).toBe(200);
    const status = action === 'reject' ? 'rejected' : 'needs_more_info';
    expect(r.json().items.every((x: { status: string }) => x.status === status)).toBe(true);
    const audit = await migrate.pool.query('select detail from core.audit_log where subject_id = any($1::uuid[]) and event_type = $2', [b.items.map((x) => x.id), action === 'reject' ? 'permission_rejected' : 'permission_needs_more_info']);
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows.every((x) => x.detail.revision === 2)).toBe(true);
    if (action === 'need-more-info') {
      const payload = { note: 'More details', expected_revisions: Object.fromEntries(b.items.map((x) => [x.id, 2])) };
      const key = randomUUID();
      const submitted = await post(`/permission-requests/batch/${b.batch_id}/submit-more-info`, member, payload, key);
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json()).toEqual({ batch_id: b.batch_id, items: expect.arrayContaining(b.items.map((x) => ({ id: x.id, status: 'pending', revision: 3 }))) });
      expect((await post(`/permission-requests/batch/${b.batch_id}/submit-more-info`, member, payload, key)).json()).toEqual(submitted.json());
      const submittedAudit = await migrate.pool.query("select detail from core.audit_log where subject_id = any($1::uuid[]) and event_type = 'permission_more_info_submitted'", [b.items.map((x) => x.id)]);
      expect(submittedAudit.rows).toHaveLength(2);
      expect(submittedAudit.rows.every((x) => x.detail.previous_revision === 2 && x.detail.revision === 3 && x.detail.reason === 'More details')).toBe(true);
    }
  });
  it('requires partial/sensitive reasons and complete current revisions, and refuses non-admin decisions', async () => {
    const b = await batch(['voc.read', 'survey.export']);
    const url = `/permissions/requests/batch/${b.batch_id}/decide`;
    for (const approve_ids of [[b.items[0]?.id], b.items.map((x) => x.id)]) {
      const r = await post(url, admin, { action: 'approve', approve_ids, expected_revisions: b.revisions });
      expect(r.statusCode).toBe(422);
      expect(r.json().detail.fields).toContainEqual(expect.objectContaining({ path: ['reason'] }));
    }
    expect((await post(url, member, { action: 'reject', reason: 'No', expected_revisions: b.revisions })).statusCode).toBe(403);
    for (const revisions of [{}, Object.fromEntries(b.items.map((x) => [x.id, 2]))]) {
      expect((await post(url, admin, { action: 'reject', reason: 'No', expected_revisions: revisions })).statusCode).toBe(409);
    }
    const rows = await db.pool.query('select status, revision from permission.permission_requests where batch_id = $1', [b.batch_id]);
    expect(rows.rows.every((x) => x.status === 'pending' && x.revision === 1)).toBe(true);
  });
  it('writes the shared reason to an approved sensitive grant', async () => {
    const b = await batch(['voc.read', 'survey.export']);
    const r = await post(`/permissions/requests/batch/${b.batch_id}/decide`, admin, { action: 'approve',
      approve_ids: b.items.map((x) => x.id), expected_revisions: b.revisions, reason: 'Approved audit export' });
    expect(r.statusCode).toBe(200);
    const grant = await db.pool.query("select sensitive_reason from permission.permission_grants where actor_id = $1 and capability = 'survey.export'", [actorId]);
    expect(grant.rows).toEqual([{ sensitive_reason: 'Approved audit export' }]);
  });
  it('rolls all decisions and audits back on an already granted row and names the request', async () => {
    const b = await batch();
    // Pick the last row in the command's deterministic UUID order so an earlier row writes before the refusal.
    const ordered = [...b.items].sort((a, z) => a.id.localeCompare(z.id));
    const refused = ordered[ordered.length - 1]?.id ?? '';
    await migrate.pool.query(`insert into permission.permission_grants
      (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
      select workspace_id, requester_actor_id, requested_capability, requested_managed_system_id, requester_actor_id
      from permission.permission_requests where id = $1`, [refused]);
    const r = await post(`/permissions/requests/batch/${b.batch_id}/decide`, admin, { action: 'approve',
      approve_ids: b.items.map((x) => x.id), expected_revisions: b.revisions });
    expect(r.statusCode).toBe(409);
    expect(r.json().detail.request_id).toBe(refused);
    const rows = await db.pool.query('select status, revision from permission.permission_requests where batch_id = $1', [b.batch_id]);
    expect(rows.rows.every((x) => x.status === 'pending' && x.revision === 1)).toBe(true);
    const audits = await migrate.pool.query("select id from core.audit_log where subject_id = any($1::uuid[]) and event_type = 'permission_approved'", [b.items.map((x) => x.id)]);
    expect(audits.rows).toEqual([]);
    const grants = await db.pool.query('select id from permission.permission_grants where actor_id = $1', [actorId]);
    expect(grants.rows).toHaveLength(1);
    expect(notifications.jobs).toHaveLength(0);
  });
});
