// #1328 e1 — `improvement.assigned_to_me` fired from itemCreate / itemAssign in the write transaction, through the real
// `buildServer` over `POST /api/v1/menu-action` against a throwaway Postgres (see improvement-items-writes.integration.test.ts).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { initBoss, shutdownBoss } from '../../../lib/jobs.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { createFailAfterEnqueueNotificationDispatcher } from '../../../test-support/fail-after-enqueue-dispatcher.js';
import {
  NOTIFICATION_DISPATCH_QUEUE,
  type RecordingNotificationDispatcher,
  createRecordingNotificationDispatcher,
} from '../../notifications/port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IMN${randomUUID().slice(0, 6).toUpperCase()}`;
const ORIGIN = { menuId: 'analysis-workspace', context: { range: 'last-7d' } };

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}

describe.skipIf(!runIntegration)('improvement item assignee notification (#1328 e1)', () => {
  let app: FastifyInstance;
  let rollbackApp: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let boss: Awaited<ReturnType<typeof initBoss>>;
  let notifications: RecordingNotificationDispatcher;
  let failAfterEnqueue: ReturnType<typeof createFailAfterEnqueueNotificationDispatcher>;
  let admin: Person;
  let rollbackAdmin: Person;
  let assignee: Person;
  let foreignActor = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function person(server: FastifyInstance): Promise<Person> {
    const externalId = `${TAG}-admin-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' });
    actorIds.push(id);
    const cookie = await loginAs(server, externalId);
    const boot = await server.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; server?: FastifyInstance; expectedVersion?: string; key?: string } = {},
  ) {
    const who = opts.who ?? admin;
    const res = await (opts.server ?? app).inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `improvement.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
    return { status: res.statusCode, body: res.json<{ outcome: string; data: any; version: string | null }>() };
  }

  async function make(over: Record<string, unknown> = {}) {
    const { body } = await act('itemCreate', { problem: `secret problem ${TAG} ${n++}`, origin: ORIGIN, ...over });
    expect(body.outcome, JSON.stringify(body)).toBe('ok');
    return { id: body.data.itemId as string, no: body.data.itemNo as number, version: body.data.version as string };
  }

  const jobsFor = (itemId: string) => notifications.jobs.filter((job) => job.subject_id === itemId);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    boss = await initBoss({ connectionString: APP_URL, log: { info() {}, warn() {}, error() {} } });
    notifications = createRecordingNotificationDispatcher();
    failAfterEnqueue = createFailAfterEnqueueNotificationDispatcher(boss);
    app = await buildServer({ config: loadConfig(), dbHandle, notificationDispatcher: notifications });
    rollbackApp = await buildServer({ config: loadConfig(), dbHandle, notificationDispatcher: failAfterEnqueue.dispatcher });
    await app.ready();
    await rollbackApp.ready();
    admin = await person(app);
    rollbackAdmin = await person(rollbackApp);
    assignee = await person(app);
    const otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
  }, 60_000);

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
    notifications.jobs.splice(0);
    failAfterEnqueue.attemptedPayloads.length = 0;
  });

  afterEach(async () => {
    const ids = failAfterEnqueue.attemptedPayloads.map((p) => p.correlation_id);
    if (ids.length > 0) {
      await sql(`delete from pgboss.job where name = $1 and data ->> 'correlation_id' = any($2::text[])`, [NOTIFICATION_DISPATCH_QUEUE, ids]);
    }
  });

  afterAll(async () => {
    const mine = '(select id from improvement.item where created_by = any($1))';
    await sql(`delete from improvement.item_event where item_id in ${mine}`, [actorIds]);
    await sql(`delete from improvement.item_target where item_id in ${mine}`, [actorIds]);
    await sql('delete from improvement.item where created_by = any($1)', [actorIds]);
    await sql('delete from improvement.item_counter where workspace_id = any($1)', [workspaceIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await shutdownBoss(boss).catch(() => {});
    await rollbackApp?.close();
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('create with an assignee notifies the assignee once, body-free, subject improvement_item', async () => {
    const item = await make({ assigneeId: assignee.id });
    const jobs = jobsFor(item.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      actor_id: assignee.id,
      event_type: 'improvement.assigned_to_me',
      subject_type: 'improvement_item',
      subject_id: item.id,
      summary: `개선 아이템 IM-${item.no}이 지정되었습니다.`,
    });
    expect(JSON.stringify(jobs[0])).not.toContain('secret problem');
  });

  it('assign to a user notifies; a replay of the same assignee, a clear and self-assignment do not', async () => {
    const item = await make();
    expect(jobsFor(item.id)).toHaveLength(0);
    const first = await act('itemAssign', { itemId: item.id, assigneeId: assignee.id }, { expectedVersion: item.version });
    expect(first.body.outcome).toBe('ok');
    expect(jobsFor(item.id).map((j) => j.actor_id)).toEqual([assignee.id]);

    const replay = await act('itemAssign', { itemId: item.id, assigneeId: assignee.id }, { expectedVersion: String(first.body.version) });
    expect(replay.body.outcome).toBe('ok');
    const cleared = await act('itemAssign', { itemId: item.id, assigneeId: null }, { expectedVersion: String(first.body.version) });
    expect(cleared.body.outcome).toBe('ok');
    const self = await act('itemAssign', { itemId: item.id, assigneeId: admin.id }, { expectedVersion: String(cleared.body.version) });
    expect(self.body.outcome).toBe('ok');
    expect(jobsFor(item.id)).toHaveLength(1);
  });

  it('create assigned to oneself does not notify', async () => {
    const item = await make({ assigneeId: admin.id });
    expect(jobsFor(item.id)).toHaveLength(0);
  });

  it('an assignee of another workspace is refused and nothing is enqueued', async () => {
    const created = await act('itemCreate', { problem: `foreign ${TAG}`, origin: ORIGIN, assigneeId: foreignActor });
    expect(created.body.outcome).not.toBe('ok');
    const item = await make();
    const assigned = await act('itemAssign', { itemId: item.id, assigneeId: foreignActor }, { expectedVersion: item.version });
    expect(assigned.body.outcome).not.toBe('ok');
    expect(notifications.jobs).toHaveLength(0);
  });

  it('a failed notification enqueue rolls the create back: no item, no event, no audit row', async () => {
    const problem = `rollback create ${TAG}`;
    const res = await act('itemCreate', { problem, origin: ORIGIN, assigneeId: assignee.id }, { who: rollbackAdmin, server: rollbackApp });
    expect(res.body.outcome).not.toBe('ok');
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const [payload] = failAfterEnqueue.attemptedPayloads;
    if (!payload) throw new Error('notification enqueue payload missing');
    expect(payload).toMatchObject({
      workspace_id: WORKSPACE_ID,
      actor_id: assignee.id,
      event_type: 'improvement.assigned_to_me',
      subject_type: 'improvement_item',
    });
    expect((await sql('select 1 from improvement.item where problem = $1', [problem])).rowCount).toBe(0);
    expect((await sql(`select 1 from core.audit_log where actor_id = $1 and event_type = 'improvement.item.created'`, [rollbackAdmin.id])).rowCount).toBe(0);
    // The enqueue joined the rolled-back transaction: no notification job survives for the attempted correlation id.
    const jobs = await sql(`select 1 from pgboss.job where name = $1 and data ->> 'correlation_id' = $2`, [NOTIFICATION_DISPATCH_QUEUE, payload.correlation_id]);
    expect(jobs.rowCount).toBe(0);
  });

  it('a failed notification enqueue rolls the assignment back: assignee, event and audit row unchanged', async () => {
    const created = await act('itemCreate', { problem: `rollback assign ${TAG}`, origin: ORIGIN }, { who: rollbackAdmin, server: rollbackApp });
    expect(created.body.outcome).toBe('ok');
    const id = created.body.data.itemId as string;
    const res = await act('itemAssign', { itemId: id, assigneeId: assignee.id }, { who: rollbackAdmin, server: rollbackApp, expectedVersion: created.body.data.version });
    expect(res.body.outcome).not.toBe('ok');
    expect(failAfterEnqueue.attemptedPayloads).toHaveLength(1);
    const [payload] = failAfterEnqueue.attemptedPayloads;
    if (!payload) throw new Error('notification enqueue payload missing');
    expect(payload).toMatchObject({
      workspace_id: WORKSPACE_ID,
      actor_id: assignee.id,
      event_type: 'improvement.assigned_to_me',
      subject_type: 'improvement_item',
      subject_id: id,
    });
    expect((await sql('select assignee_id from improvement.item where id = $1', [id])).rows[0].assignee_id).toBeNull();
    expect((await sql(`select 1 from improvement.item_event where item_id = $1 and event_type = 'assigned'`, [id])).rowCount).toBe(0);
    expect((await sql(`select 1 from core.audit_log where subject_id = $1 and event_type = 'improvement.item.assigned'`, [id])).rowCount).toBe(0);
    // The enqueue joined the rolled-back transaction: no notification job survives for the attempted correlation id.
    const jobs = await sql(`select 1 from pgboss.job where name = $1 and data ->> 'correlation_id' = $2`, [NOTIFICATION_DISPATCH_QUEUE, payload.correlation_id]);
    expect(jobs.rowCount).toBe(0);
  });
});
