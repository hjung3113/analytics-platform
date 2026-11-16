// #2406: several capabilities for one recipient with one reason, validated and audited per row, atomic per batch.
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { permissionGrantBatchResultSchema } from '@ap/feature-shared';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { createRecordingNotificationDispatcher } from '../../notifications/port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const AGENT = 'permission-batch-integration-test';

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values.find((entry) => entry)?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!value) throw new Error('mock login did not set a session cookie');
  return value;
}

describe.skipIf(!runIntegration)('Batch permission grant and request (#2406)', () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let actorId = '';
  let actorCookie = '';
  let systemId = '';
  const notifications = createRecordingNotificationDispatcher();

  const login = async (externalId: string) => {
    const response = await app.inject({ method: 'POST', url: '/auth/mock-login', headers: { 'user-agent': AGENT }, payload: { external_id: externalId } });
    return sessionCookie(response.headers['set-cookie']);
  };
  const post = (url: string, cookie: string, payload: Record<string, unknown>, key?: string) =>
    app.inject({ method: 'POST', url, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, ...(key ? { 'idempotency-key': key } : {}) }, payload });
  const grantRows = async () =>
    (await db.pool.query<{ capability: string }>('select capability from permission.permission_grants where actor_id = $1 order by capability', [actorId])).rows.map((r) => r.capability);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db, notificationDispatcher: notifications });
    await app.ready();
    adminCookie = await login('mock-admin-1');
  });

  beforeEach(async () => {
    notifications.jobs.splice(0);
    await migrateDb.pool.query('delete from core.rate_limits');
    const actor = await insertDevActor(db, WORKSPACE_ID, `perm-batch-${randomUUID()}`);
    actorId = actor.id;
    actorCookie = await login(actor.externalId);
    const system = await db.pool.query<{ id: string }>(
      "insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Batch system') returning id",
      [WORKSPACE_ID, `perm-batch-${randomUUID()}`],
    );
    systemId = system.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await db.pool.query('delete from permission.permission_requests where requester_actor_id = $1', [actorId]);
    await db.pool.query('delete from permission.permission_grants where actor_id = $1', [actorId]);
    await db.pool.query('delete from core.sessions where actor_id = $1', [actorId]);
    await migrateDb.pool.query('delete from core.audit_log where actor_id = $1 or detail->>\'grantee_actor_id\' = $2', [actorId, actorId]);
    await db.pool.query('delete from core.actors where id = $1', [actorId]);
    await migrateDb.pool.query('delete from core.managed_systems where id = $1', [systemId]);
  });

  afterAll(async () => {
    await app.close();
    await migrateDb.pool.end();
  });

  it('grants every candidate with one reason, one batch id on each audit row', async () => {
    const response = await post('/permissions/grants/batch', adminCookie, {
      actor_id: actorId,
      items: [{ capability: 'voc.read', managed_system_id: systemId }, { capability: 'survey.export', managed_system_id: systemId }],
      reason: 'Team onboarding',
    });
    expect(response.statusCode).toBe(201);
    const body = permissionGrantBatchResultSchema.parse(response.json());
    expect(body.items.map((item) => item.capability).sort()).toEqual(['survey.export', 'voc.read']);
    expect(await grantRows()).toEqual(['survey.export', 'voc.read']);
    const audit = await migrateDb.pool.query<{ batch: string }>(
      "select detail->>'batch_id' as batch from core.audit_log where event_type = 'permission_granted' and detail->>'grantee_actor_id' = $1",
      [actorId],
    );
    expect(audit.rows).toHaveLength(2);
    expect(new Set(audit.rows.map((row) => row.batch))).toEqual(new Set([body.batch_id]));
  });

  it('rolls the whole batch back when one row is refused, and names the row', async () => {
    const response = await post('/permissions/grants/batch', adminCookie, {
      actor_id: actorId,
      items: [{ capability: 'voc.read', managed_system_id: systemId }, { capability: 'workspace.admin', managed_system_id: systemId }],
      reason: 'Mixed batch',
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().message).toContain('row 2');
    expect(response.json().code).not.toBe('internal.unexpected');
    expect(await grantRows()).toEqual([]);
  });

  it('refuses a duplicate candidate and a non-admin caller; replays one idempotency key once', async () => {
    const duplicate = await post('/permissions/grants/batch', adminCookie, {
      actor_id: actorId,
      items: [{ capability: 'voc.read', managed_system_id: systemId }, { capability: 'voc.read', managed_system_id: systemId }],
      reason: 'Duplicate',
    });
    expect(duplicate.statusCode).toBe(422);
    const denied = await post('/permissions/grants/batch', actorCookie, { actor_id: actorId, items: [{ capability: 'voc.read', managed_system_id: systemId }], reason: 'Self serve' });
    expect(denied.statusCode).toBe(403);
    const key = randomUUID();
    const payload = { actor_id: actorId, items: [{ capability: 'voc.read', managed_system_id: systemId }], reason: 'Replay' };
    const first = await post('/permissions/grants/batch', adminCookie, payload, key);
    const second = await post('/permissions/grants/batch', adminCookie, payload, key);
    expect(first.statusCode).toBe(201);
    expect(second.json().batch_id).toBe(first.json().batch_id);
    expect(await grantRows()).toEqual(['voc.read']);
  });

  it('opens one request per candidate with a shared reason and batch id; a held capability refuses the batch', async () => {
    const response = await post('/permission-requests/batch', actorCookie, {
      items: [{ requested_capability: 'voc.read', requested_managed_system_id: systemId }, { requested_capability: 'survey.export', requested_managed_system_id: systemId }],
      reason: 'Need both for the audit',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().items).toHaveLength(2);
    // One admin notification per batch, not one per row.
    const notifiedRequests = new Set(notifications.jobs.map((job) => JSON.stringify(job).match(/"permission_request_id":"([0-9a-f-]{36})"/)?.[1]));
    expect([...notifiedRequests][0]).toBeDefined();
    expect(notifiedRequests.size).toBe(1);
    const rows = await db.pool.query('select requested_capability, reason from permission.permission_requests where requester_actor_id = $1', [actorId]);
    expect(rows.rows).toHaveLength(2);
    expect(new Set(rows.rows.map((row) => row.reason))).toEqual(new Set(['Need both for the audit']));
    const again = await post('/permission-requests/batch', actorCookie, {
      items: [{ requested_capability: 'voc.read', requested_managed_system_id: systemId }],
      reason: 'Again',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().message).toContain('row 1');
    // A refused row rolls the whole request batch back: the new candidate is not left behind.
    const mixed = await post('/permission-requests/batch', actorCookie, {
      items: [{ requested_capability: 'finding.read', requested_managed_system_id: systemId }, { requested_capability: 'voc.read', requested_managed_system_id: systemId }],
      reason: 'Mixed',
    });
    expect(mixed.statusCode).toBe(409);
    const left = await db.pool.query("select 1 from permission.permission_requests where requester_actor_id = $1 and requested_capability = 'finding.read'", [actorId]);
    expect(left.rows).toHaveLength(0);
  });
});
