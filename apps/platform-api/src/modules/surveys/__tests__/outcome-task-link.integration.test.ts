import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { cleanupSystemRecoveryFixtures, deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-survey-outcome-task';

describe.skipIf(!runIntegration)('Outcome Survey measured Task link (#2540)', () => {
  let appHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminActorId: string;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');
    const admin = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock admin actor not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await migrateHandle.pool.query(`delete from core.rate_limits where key like '127.0.0.%'`);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await appHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await cleanupSystemRecoveryFixtures(migrateHandle, WORKSPACE_ID, `${SLUG_PREFIX}%`);
    const systems = 'select id from core.managed_systems where workspace_id = $1 and slug like $2';
    const surveys = `select id from survey.surveys where workspace_id = $1 and primary_managed_system_id in (${systems})`;
    const tasks = `select id from task.tasks where workspace_id = $1 and primary_managed_system_id in (${systems})`;
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id = $1 and (
        subject_id in (${surveys}) or subject_id in (select id from core.entity_links where workspace_id = $1 and source_id in (${surveys}))
        or actor_id in (select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-${SLUG_PREFIX}%')
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where workspace_id = $1 and (
        source_id in (${surveys}) or target_id in (${tasks})
      )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.survey_questions where workspace_id = $1 and survey_id in (${surveys})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from survey.surveys where workspace_id = $1 and primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys where actor_id in (
        select id from core.actors where workspace_id = $1 and (external_id = 'mock-admin-1' or external_id like 'mock-dev-read-${SLUG_PREFIX}%')
      )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id = $1 and managed_system_id in (${systems})`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.sessions where actor_id in (
        select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-${SLUG_PREFIX}%'
      )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-${SLUG_PREFIX}%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function seedSystem(label = 'Survey outcome Task MS'): Promise<string> {
    return insertMsDirectly(migrateHandle, WORKSPACE_ID, uid(SLUG_PREFIX), label);
  }

  async function seedTask(managedSystemId: string, title = 'Measured work', status?: 'released') {
    return insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: managedSystemId,
      title,
      ...(status ? { status } : {}),
      createdBy: adminActorId,
    });
  }

  async function developer(
    grants: Array<{ capability: string; managedSystemId: string }>,
  ): Promise<{ id: string; cookie: string }> {
    const actor = await insertDevActor(migrateHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    for (const grant of grants) {
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        actor.id,
        grant.capability,
        grant.managedSystemId,
        adminActorId,
      );
    }
    return { id: actor.id, cookie: await loginAs(app, actor.externalId) };
  }

  function surveyBody(managedSystemId: string, overrides: Record<string, unknown> = {}) {
    return {
      type: 'outcome',
      title: `Outcome survey ${randomUUID()}`,
      primary_managed_system_id: managedSystemId,
      responses_identity_protected: true,
      ...overrides,
    };
  }

  async function postSurvey(
    cookie: string,
    body: Record<string, unknown>,
    key = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: '/surveys',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      payload: body,
    });
  }

  async function surveyAndEntityLinkAuditCount(): Promise<number> {
    const result = await migrateHandle.pool.query<{ count: number }>(
      `select count(*)::int as count from core.audit_log
        where workspace_id = $1 and event_type in (
          'survey_created', 'survey_updated', 'entity_link.created', 'entity_link.detached'
        )`,
      [WORKSPACE_ID],
    );
    return result.rows[0]?.count ?? 0;
  }

  function withoutSurveyIdentity(detail: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(detail).filter(([key]) => key !== 'survey_id' && key !== 'display_id'),
    );
  }

  async function patchSurvey(cookie: string, surveyId: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/surveys/${surveyId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: body,
    });
  }

  async function createOutcome(managedSystemId: string, taskId?: string, cookie = adminCookie) {
    const response = await postSurvey(
      cookie,
      surveyBody(managedSystemId, taskId ? { outcome_task_id: taskId } : {}),
    );
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string; title: string }>();
  }

  it('creates one command-owned link, replays without duplicates, and leaves omission unchanged', async () => {
    const msId = await seedSystem();
    const task = await seedTask(msId);
    const body = surveyBody(msId, { outcome_task_id: task.id });
    const key = randomUUID();

    const first = await postSurvey(adminCookie, body, key);
    const replay = await postSurvey(adminCookie, body, key);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    const surveyId = first.json<{ id: string }>().id;
    expect(replay.json<{ id: string }>().id).toBe(surveyId);

    const linkRows = await migrateHandle.pool.query<{
      id: string;
      source_type: string;
      target_type: string;
      relation_type: string;
      status: string;
      visibility: string;
      managed_system_id: string;
    }>(
      `select id, source_type, target_type, relation_type, status, visibility, managed_system_id
         from core.entity_links where workspace_id = $1 and source_id = $2`,
      [WORKSPACE_ID, surveyId],
    );
    expect(linkRows.rows).toEqual([
      expect.objectContaining({
        source_type: 'survey',
        target_type: 'task',
        relation_type: 'measures_outcome_of',
        status: 'active',
        visibility: 'internal_only',
        managed_system_id: msId,
      }),
    ]);
    const linkAudit = await migrateHandle.pool.query<{ event_type: string; detail: unknown }>(
      `select event_type, detail from core.audit_log where subject_id = $1 and event_type like 'entity_link.%'`,
      [linkRows.rows[0]?.id],
    );
    expect(linkAudit.rows).toEqual([
      expect.objectContaining({
        event_type: 'entity_link.created',
        detail: {
          link_id: linkRows.rows[0]?.id,
          source: { type: 'survey', id: surveyId },
          target: { type: 'task', id: task.id },
          relation_type: 'measures_outcome_of',
          visibility: 'internal_only',
        },
      }),
    ]);

    const noTask = await createOutcome(msId);
    const noTaskLinks = await migrateHandle.pool.query(
      `select id from core.entity_links where workspace_id = $1 and source_id = $2`,
      [WORKSPACE_ID, noTask.id],
    );
    const noTaskAudits = await migrateHandle.pool.query(
      `select id from core.audit_log where workspace_id = $1 and subject_id = $2 and event_type like 'entity_link.%'`,
      [WORKSPACE_ID, noTask.id],
    );
    expect(noTaskLinks.rows).toEqual([]);
    expect(noTaskAudits.rows).toEqual([]);
    const creationAudits = await migrateHandle.pool.query<{
      subject_id: string;
      detail: Record<string, unknown>;
    }>(
      `select subject_id, detail from core.audit_log
        where workspace_id = $1 and subject_id in ($2, $3) and event_type = 'survey_created'
        order by subject_id`,
      [WORKSPACE_ID, surveyId, noTask.id],
    );
    expect(creationAudits.rows).toHaveLength(2);
    const linkedSurveyAudit = creationAudits.rows.find((row) => row.subject_id === surveyId);
    const omittedTaskAudit = creationAudits.rows.find((row) => row.subject_id === noTask.id);
    expect(linkedSurveyAudit).toBeDefined();
    expect(omittedTaskAudit).toBeDefined();
    expect(withoutSurveyIdentity(omittedTaskAudit?.detail ?? {})).toEqual(
      withoutSurveyIdentity(linkedSurveyAudit?.detail ?? {}),
    );
    expect(omittedTaskAudit?.detail).not.toHaveProperty('outcome_task_id');
  });

  it('rejects invalid type, missing, foreign, unreadable, and cross-system Tasks without persistence', async () => {
    const msId = await seedSystem();
    const otherMsId = await seedSystem('Other Survey outcome MS');
    const task = await seedTask(msId);
    const otherTask = await seedTask(otherMsId, 'Other-system Task');
    const manager = await developer([
      { capability: 'survey.read', managedSystemId: msId },
      { capability: 'survey.manage', managedSystemId: msId },
    ]);
    const readableTask = await developer([
      { capability: 'survey.read', managedSystemId: msId },
      { capability: 'survey.manage', managedSystemId: msId },
      { capability: 'finding.read', managedSystemId: msId },
      { capability: 'finding.read', managedSystemId: otherMsId },
    ]);

    const foreignWorkspaceId = randomUUID();
    await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      foreignWorkspaceId,
      'Foreign Outcome Survey workspace',
    ]);
    const foreignActor = await insertDevActor(migrateHandle, foreignWorkspaceId, uid(SLUG_PREFIX));
    const foreignMsId = await insertMsDirectly(
      migrateHandle,
      foreignWorkspaceId,
      uid(SLUG_PREFIX),
      'Foreign task MS',
    );
    const foreignTask = await insertTaskRow(migrateHandle, {
      workspaceId: foreignWorkspaceId,
      primaryManagedSystemId: foreignMsId,
      createdBy: foreignActor.id,
    });

    const cases = [
      {
        cookie: adminCookie,
        body: surveyBody(msId, { type: 'validation', outcome_task_id: task.id }),
        code: 'invalid',
      },
      {
        cookie: adminCookie,
        body: surveyBody(msId, { outcome_task_id: randomUUID() }),
        code: 'invalid',
        compareAs: 'missing',
      },
      { cookie: adminCookie, body: surveyBody(msId, { outcome_task_id: foreignTask.id }), code: 'invalid' },
      {
        cookie: manager.cookie,
        body: surveyBody(msId, { outcome_task_id: task.id }),
        code: 'invalid',
        compareAs: 'unreadable',
      },
      {
        cookie: readableTask.cookie,
        body: surveyBody(msId, { outcome_task_id: otherTask.id }),
        code: 'managed_system_mismatch',
      },
    ];
    let missingTaskError: unknown;
    let unreadableTaskError: unknown;
    for (const item of cases) {
      const body = { ...item.body, title: `Rejected ${randomUUID()}` };
      const auditCountBefore = await surveyAndEntityLinkAuditCount();
      const response = await postSurvey(item.cookie, body);
      expect(response.statusCode).toBe(422);
      const errorBody = response.json();
      expect(errorBody).toMatchObject({
        code: 'validation.failed',
        detail: { fields: [{ path: ['outcome_task_id'], code: item.code }] },
      });
      if (item.compareAs === 'missing') missingTaskError = errorBody;
      if (item.compareAs === 'unreadable') unreadableTaskError = errorBody;
      const rows = await migrateHandle.pool.query(
        'select id from survey.surveys where workspace_id = $1 and title = $2',
        [WORKSPACE_ID, body.title],
      );
      expect(rows.rows).toEqual([]);
      expect(await surveyAndEntityLinkAuditCount()).toBe(auditCountBefore);
    }
    expect(unreadableTaskError).toEqual(missingTaskError);
    const taskLinkAudits = await migrateHandle.pool.query(
      `select id from core.audit_log where workspace_id = $1 and event_type like 'entity_link.%' and detail->'target'->>'id' in ($2, $3)`,
      [WORKSPACE_ID, task.id, otherTask.id],
    );
    expect(taskLinkAudits.rows).toEqual([]);

    await migrateHandle.pool.query('delete from task.tasks where workspace_id = $1', [foreignWorkspaceId]);
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.managed_systems where workspace_id = $1',
      [foreignWorkspaceId],
    );
    await migrateHandle.pool.query('delete from core.actors where workspace_id = $1', [foreignWorkspaceId]);
    await deleteRecoveryFixtureParents(
      migrateHandle,
      'delete from core.workspaces where id = $1',
      [foreignWorkspaceId],
    );
  });

  it('sets, replaces, and clears on drafts; requires explicit clearing for system/type changes; freezes after open', async () => {
    const msId = await seedSystem();
    const otherMsId = await seedSystem('Replacement Task MS');
    const firstTask = await seedTask(msId, 'First measured Task');
    const secondTask = await seedTask(msId, 'Second measured Task');
    const otherTask = await seedTask(otherMsId, 'Replacement-system Task');
    const writerA = await developer([
      { capability: 'survey.read', managedSystemId: msId },
      { capability: 'survey.manage', managedSystemId: msId },
      { capability: 'finding.read', managedSystemId: msId },
      { capability: 'survey.read', managedSystemId: otherMsId },
      { capability: 'survey.manage', managedSystemId: otherMsId },
      { capability: 'finding.read', managedSystemId: otherMsId },
    ]);
    const writerB = await developer([
      { capability: 'survey.read', managedSystemId: msId },
      { capability: 'survey.manage', managedSystemId: msId },
      { capability: 'finding.read', managedSystemId: msId },
    ]);
    const survey = await createOutcome(msId, undefined, writerA.cookie);

    expect((await patchSurvey(writerA.cookie, survey.id, { outcome_task_id: firstTask.id })).statusCode).toBe(200);
    expect((await patchSurvey(writerA.cookie, survey.id, { outcome_task_id: secondTask.id })).statusCode).toBe(200);
    expect((await patchSurvey(writerA.cookie, survey.id, { outcome_task_id: null })).statusCode).toBe(200);
    const history = await migrateHandle.pool.query<{ target_id: string; status: string }>(
      `select target_id, status from core.entity_links where workspace_id = $1 and source_id = $2 order by created_at, id`,
      [WORKSPACE_ID, survey.id],
    );
    expect(history.rows).toEqual([
      { target_id: firstTask.id, status: 'detached' },
      { target_id: secondTask.id, status: 'detached' },
    ]);
    const events = await migrateHandle.pool.query<{ event_type: string; count: number }>(
      `select event_type, count(*)::int as count from core.audit_log where workspace_id = $1 and detail->'source'->>'id' = $2 group by event_type order by event_type`,
      [WORKSPACE_ID, survey.id],
    );
    expect(events.rows).toEqual([
      { event_type: 'entity_link.created', count: 2 },
      { event_type: 'entity_link.detached', count: 2 },
    ]);

    const systemGuard = await createOutcome(msId, firstTask.id, writerA.cookie);
    const systemRejected = await patchSurvey(writerA.cookie, systemGuard.id, {
      primary_managed_system_id: otherMsId,
    });
    expect(systemRejected.statusCode).toBe(422);
    expect(systemRejected.json()).toMatchObject({
      detail: { fields: [{ path: ['outcome_task_id'], code: 'managed_system_mismatch' }] },
    });
    expect(
      (await patchSurvey(writerA.cookie, systemGuard.id, {
        primary_managed_system_id: otherMsId,
        outcome_task_id: otherTask.id,
      })).statusCode,
    ).toBe(200);

    const typeGuard = await createOutcome(msId, secondTask.id, writerB.cookie);
    const typeRejected = await patchSurvey(writerB.cookie, typeGuard.id, { type: 'validation' });
    expect(typeRejected.statusCode).toBe(422);
    expect(typeRejected.json()).toMatchObject({
      detail: { fields: [{ path: ['outcome_task_id'], code: 'invalid' }] },
    });
    expect(
      (await patchSurvey(writerB.cookie, typeGuard.id, { type: 'validation', outcome_task_id: null }))
        .statusCode,
    ).toBe(200);

    const opened = await createOutcome(msId, firstTask.id, writerB.cookie);
    const question = await app.inject({
      method: 'POST',
      url: `/surveys/${opened.id}/questions`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${writerB.cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        kind: 'single_choice',
        prompt: 'Did this Task improve the result?',
        options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
      },
    });
    expect(question.statusCode).toBe(201);
    const openedResponse = await app.inject({
      method: 'POST',
      url: `/surveys/${opened.id}/open`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${writerB.cookie}`,
        'idempotency-key': randomUUID(),
      },
    });
    expect(openedResponse.statusCode).toBe(200);
    const frozen = await patchSurvey(writerB.cookie, opened.id, { outcome_task_id: null });
    expect(frozen.statusCode).toBe(422);
    expect(frozen.json()).toMatchObject({ detail: { fields: [{ path: ['status'], code: 'not_draft' }] } });
  });

  it('keeps generic writes closed, lists only safe summaries, and leaves follow-up counts unchanged', async () => {
    const msId = await seedSystem();
    const task = await seedTask(msId, 'Released work', 'released');
    const survey = await createOutcome(msId, task.id);
    const link = await migrateHandle.pool.query<{ id: string }>(
      `select id from core.entity_links where workspace_id = $1 and source_id = $2 and status = 'active'`,
      [WORKSPACE_ID, survey.id],
    );
    const linkId = link.rows[0]?.id;
    if (!linkId) throw new Error('expected active Outcome Survey Task link');

    const genericCreate = await app.inject({
      method: 'POST',
      url: '/entity-links',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`, 'content-type': 'application/json' },
      payload: {
        source: { type: 'survey', id: survey.id },
        target: { type: 'task', id: task.id },
        relation_type: 'measures_outcome_of',
      },
    });
    expect(genericCreate.statusCode).toBe(422);
    expect(genericCreate.json()).toMatchObject({ detail: { fields: [{ code: 'unsupported_tuple' }] } });

    const genericDetach = await app.inject({
      method: 'PATCH',
      url: `/entity-links/${linkId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
        'content-type': 'application/json',
      },
      payload: { reason: 'Generic detach must not own this relation' },
    });
    expect(genericDetach.statusCode).toBe(404);

    const adminList = await app.inject({
      method: 'GET',
      url: `/entity-links?target_type=task&target_id=${task.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json<{ items: Array<Record<string, unknown>> }>().items).toContainEqual(
      expect.objectContaining({
        id: linkId,
        visibility_state: 'allowed',
        source_summary: {
          type: 'survey',
          id: survey.id,
          display_id: expect.any(String),
          title: survey.title,
          survey_type: 'outcome',
          status: 'draft',
          primary_managed_system_id: msId,
        },
      }),
    );
    const noSurveyRead = await developer([
      { capability: 'finding.read', managedSystemId: msId },
    ]);
    const hiddenList = await app.inject({
      method: 'GET',
      url: `/entity-links?target_type=task&target_id=${task.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${noSurveyRead.cookie}` },
    });
    expect(hiddenList.statusCode).toBe(200);
    const hidden = hiddenList.json<{ items: Array<Record<string, unknown>> }>().items.find(
      (item) => item.id === linkId,
    );
    expect(hidden).toMatchObject({ visibility_state: 'hidden', relation_type: 'measures_outcome_of' });
    expect(hidden).not.toHaveProperty('source_id');
    expect(hidden).not.toHaveProperty('target_id');
    expect(hidden).not.toHaveProperty('source_summary');

    const userList = await app.inject({
      method: 'GET',
      url: `/entity-links?target_type=task&target_id=${task.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` },
    });
    expect(userList.statusCode).toBe(404);
    expect(userList.body).not.toContain(survey.id);
    expect(userList.body).not.toContain(linkId);

    const inventory = await app.inject({
      method: 'GET',
      url: `/entity-links?scope=workspace&managed_system_id=${msId}&relation_type=measures_outcome_of`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(inventory.statusCode).toBe(200);
    expect(inventory.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toContain(linkId);

    const classifierBefore = await appHandle.pool.query<{ count: string }>(
      'select survey.count_negative_outcome_without_followup($1::uuid, array[$2]::uuid[])::text as count',
      [WORKSPACE_ID, msId],
    );
    const dashboardBefore = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?category=bad-outcome-no-followup&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(dashboardBefore.statusCode).toBe(200);
    const classifierAfter = await appHandle.pool.query<{ count: string }>(
      'select survey.count_negative_outcome_without_followup($1::uuid, array[$2]::uuid[])::text as count',
      [WORKSPACE_ID, msId],
    );
    const dashboardAfter = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?category=bad-outcome-no-followup&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(dashboardAfter.statusCode).toBe(200);
    expect(classifierAfter.rows[0]?.count).toBe(classifierBefore.rows[0]?.count);
    expect(dashboardAfter.json<{ total: number }>().total).toBe(
      dashboardBefore.json<{ total: number }>().total,
    );

    await expect(
      migrateHandle.pool.query(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, 'survey', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, survey.id, task.id, msId, adminActorId],
      ),
    ).rejects.toThrow('entity_links_tuple_check');
  });
});
