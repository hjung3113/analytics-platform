// Stored receipts model successful historical writes. Replay goes through the real
// HTTP routes and low-privilege database, without rerunning write validation.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { buildServer } from '../../../../server.js';
import { insertDevActor } from '../../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../../test-support/auth.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../../test-support/findings-fixtures.js';
import { denyCapability, grantCapability } from '../../../../test-support/permissions-fixtures.js';
import { insertTaskRow } from '../../../../test-support/task-fixtures.js';
import { insertVocClusterRow } from '../../../../test-support/voc-cluster-fixtures.js';
import { insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import { hashRequestBody } from '../canonicalize.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const stamp = '2026-01-01T00:00:00.000Z';
const note = { body_rich_content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Replay note' }] }] } };
type ReplayCase = {
  name: string;
  method?: 'POST' | 'PATCH';
  url: string;
  payload: Record<string, unknown>;
  hash: Record<string, unknown>;
  capability: string;
  body?: Record<string, unknown>;
};

describe.skipIf(!runIntegration)('stored response current-access boundary (#2113)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let ms: string;
  let voc: string;
  let finding: string;
  let task: string;
  let cluster: string;
  let survey: string;
  let response: string;
  const actors: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    const admins = await db.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'", [WORKSPACE_ID],
    );
    admin = admins.rows[0]?.id ?? '';
    ms = await insertMsDirectly(db, WORKSPACE_ID, `replay-${randomUUID()}`, 'Replay scope');
    voc = (await insertVocDirectly(db, WORKSPACE_ID, ms, admin, 'Replay source')).id;
    finding = (await insertFindingRow(db, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: ms, sourceId: voc, createdBy: admin })).id;
    task = (await insertTaskRow(db, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: ms, createdBy: admin })).id;
    cluster = (await insertVocClusterRow(db, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: ms, createdBy: admin })).id;
    const surveys = await migrate.pool.query<{ id: string }>(
      `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,created_by,opened_at,closed_at)
       values ($1,$2,'outcome','closed','Replay survey',$3,$4,$4,now(),now()) returning id`,
      [WORKSPACE_ID, `SRV-${randomUUID()}`, ms, admin],
    );
    survey = surveys.rows[0]?.id ?? '';
    const responses = await migrate.pool.query<{ id: string }>(
      `insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
       values ($1,$2,$3,true,now()) returning id`, [WORKSPACE_ID, survey, admin],
    );
    response = responses.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    if (migrate) {
      await migrate.pool.query('delete from core.audit_log where actor_id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from core.idempotency_keys where actor_id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from permission.permission_denies where actor_id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from permission.permission_grants where actor_id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from core.actors where id=any($1::uuid[])', [actors]);
      await migrate.pool.query('delete from survey.survey_responses where id=$1', [response]);
      await migrate.pool.query('delete from survey.surveys where id=$1', [survey]);
      await migrate.pool.query('delete from task.tasks where id=$1', [task]);
      await migrate.pool.query('delete from finding.findings where id=$1', [finding]);
      await migrate.pool.query('delete from voc_cluster.voc_clusters where id=$1', [cluster]);
      await migrate.pool.query('delete from voc.vocs where id=$1', [voc]);
      await migrate.pool.query('delete from core.managed_systems where id=$1', [ms]);
    }
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  function cases(): ReplayCase[] {
    const requestId = randomUUID(); // No write-side lookup should run on replay.
    const findingInput = { title: 'Finding', summary: 'Summary', severity: 'medium' };
    const requestInput = { evidence_summary: 'Evidence', requested_outcome: 'Outcome' };
    const surveyInput = { type: 'outcome', title: 'Survey', primary_managed_system_id: ms, responses_identity_protected: true };
    const result: ReplayCase[] = [
      { name: 'findings.createFromVoc', url: `/vocs/${voc}/create-finding`, payload: findingInput, hash: { ...findingInput, vocId: voc, route: 'voc.create_finding' }, capability: 'finding.read' },
      { name: 'findings.createFromSurveyResponse', url: `/survey-responses/${response}/create-finding`, payload: { severity: 'medium', approved_excerpt_ids: [] }, hash: { body: { severity: 'medium', approved_excerpt_ids: [] }, responseId: response, route: 'survey_response.create_finding' }, capability: 'survey.read_personal_responses' },
      { name: 'findings.patch', method: 'PATCH', url: `/findings/${finding}`, payload: { status: 'active' }, hash: { status: 'active', findingId: finding, route: 'finding.patch' }, capability: 'finding.read' },
      { name: 'findings.linkTask', url: `/findings/${finding}/link-task`, payload: { task_id: task }, hash: { task_id: task, findingId: finding, route: 'finding.link_task' }, capability: 'finding.read' },
      { name: 'findings.comment', url: `/findings/${finding}/comments`, payload: note, hash: { ...note, findingId: finding, route: 'finding.comment' }, capability: 'finding.read' },
      { name: 'findings.surveyEvidence', url: `/findings/${finding}/survey-evidence`, payload: { approved_excerpt_id: randomUUID() }, hash: {}, capability: 'finding.read' },
      { name: 'tasks.comment', url: `/tasks/${task}/comments`, payload: note, hash: { ...note, taskId: task, route: 'task.comment' }, capability: 'finding.manage' },
      { name: 'tasks.convert', url: `/task-requests/${requestId}/convert`, payload: { title: 'Task' }, hash: { title: 'Task', taskRequestId: requestId, route: 'task_request.convert' }, capability: 'finding.manage' },
      { name: 'tasks.linkExisting', url: `/task-requests/${requestId}/link-task`, payload: { task_id: task }, hash: { task_id: task, taskRequestId: requestId, route: 'task_request.link_task' }, capability: 'finding.manage' },
      { name: 'tasks.patchStatus', method: 'PATCH', url: `/tasks/${task}`, payload: { status: 'doing' }, hash: { status: 'doing', taskId: task, ifMatch: stamp, route: 'task.status_update' }, capability: 'finding.manage' },
      { name: 'tasks.assignMilestone', url: `/tasks/${task}/milestone`, payload: { milestone_id: null }, hash: { milestone_id: null, taskId: task, ifMatch: stamp, route: 'task.milestone_assign' }, capability: 'finding.manage' },
      { name: 'tasks.assignResponsibility', url: `/tasks/${task}/responsibility`, payload: { assignee_actor_id: null, assignee_team_id: null }, hash: { assignee_actor_id: null, assignee_team_id: null, id: task, ifMatch: stamp, route: 'assignResponsibility' }, capability: 'finding.manage' },
      { name: 'requests.fromFinding', url: `/findings/${finding}/request-task`, payload: requestInput, hash: { ...requestInput, findingId: finding, route: 'finding.request_task' }, capability: 'finding.manage' },
      { name: 'requests.fromVoc', url: `/vocs/${voc}/request-task`, payload: requestInput, hash: { ...requestInput, vocId: voc, route: 'voc.request_task' }, capability: 'finding.manage' },
      { name: 'requests.fromCluster', url: `/voc-clusters/${cluster}/request-task`, payload: requestInput, hash: { ...requestInput, clusterId: cluster, route: 'voc_cluster.request_task' }, capability: 'finding.manage' },
      { name: 'requests.decide', url: `/task-requests/${requestId}/reject`, payload: { reason: 'Reason' }, hash: { reason: 'Reason', taskRequestId: requestId, route: 'task_request.reject' }, capability: 'finding.manage' },
      { name: 'requests.assignReviewer', url: `/task-requests/${requestId}/reviewer`, payload: { assigned_reviewer_actor_id: null, assigned_reviewer_team_id: null }, hash: { assigned_reviewer_actor_id: null, assigned_reviewer_team_id: null, id: requestId, route: 'assignReviewer' }, capability: 'finding.manage' },
      { name: 'surveys.create', url: '/surveys', payload: surveyInput, hash: { ...surveyInput, route: 'survey.create' }, capability: 'survey.read' },
      { name: 'surveys.update', method: 'PATCH', url: `/surveys/${survey}`, payload: { title: 'Updated' }, hash: { body: { title: 'Updated' }, surveyId: survey, route: 'survey.update' }, capability: 'survey.read' },
      { name: 'surveys.question', url: `/surveys/${survey}/questions`, payload: { kind: 'rating', prompt: 'Rating', rating_min: 1, rating_max: 5 }, hash: {}, capability: 'survey.read' },
      { name: 'surveys.reorder', method: 'PATCH', url: `/surveys/${survey}/questions/reorder`, payload: { question_ids: [] }, hash: { body: { question_ids: [] }, surveyId: survey, route: 'survey.questions.reorder' }, capability: 'survey.read' },
      { name: 'surveys.transition', url: `/surveys/${survey}/open`, payload: {}, hash: { surveyId: survey, route: 'survey.open' }, capability: 'survey.read' },
      { name: 'followUp.mark', url: `/survey-responses/${response}/mark-no-follow-up`, payload: { reason: 'Reason' }, hash: { body: { reason: 'Reason' }, responseId: response, route: 'survey_response.mark_no_follow_up' }, capability: 'survey.read_personal_responses' },
      { name: 'followUp.reopen', url: `/survey-responses/${response}/reopen-follow-up`, payload: { reason: 'Reason' }, hash: { body: { reason: 'Reason' }, responseId: response, route: 'survey_response.reopen_follow_up' }, capability: 'survey.read_personal_responses' },
      { name: 'clusters.createFinding', url: `/voc-clusters/${cluster}/create-finding`, payload: findingInput, hash: { ...findingInput, clusterId: cluster, route: 'voc_cluster.create_finding' }, capability: 'finding.read' },
      { name: 'clusters.linkFinding', url: `/voc-clusters/${cluster}/link-finding`, payload: { finding_id: finding }, hash: { finding_id: finding, clusterId: cluster, route: 'voc_cluster.link_finding' }, capability: 'finding.read' },
    ];
    const statusCase = result.find((c) => c.name === 'tasks.patchStatus');
    if (!statusCase) throw new Error('status case missing');
    result.push({ ...statusCase, name: 'tasks.patchStatus.sourceVoc', capability: 'voc.read',
      body: { source: { voc: { visibility_state: 'allowed', id: voc, title: 'Replay source' } } } });
    for (const c of result) {
      if (c.name === 'findings.surveyEvidence') c.hash = { body: c.payload, findingId: finding, route: 'finding.survey_evidence' };
      if (c.name === 'surveys.question') c.hash = { body: c.payload, surveyId: survey, route: 'createQuestion', questionId: undefined };
    }
    return result;
  }

  // Generate after fixture IDs exist, but keep one independently named test per call site.
  const names = ['findings.createFromVoc', 'findings.createFromSurveyResponse', 'findings.patch', 'findings.linkTask', 'findings.comment', 'findings.surveyEvidence', 'tasks.comment', 'tasks.convert', 'tasks.linkExisting', 'tasks.patchStatus', 'tasks.patchStatus.sourceVoc', 'tasks.assignMilestone', 'tasks.assignResponsibility', 'requests.fromFinding', 'requests.fromVoc', 'requests.fromCluster', 'requests.decide', 'requests.assignReviewer', 'surveys.create', 'surveys.update', 'surveys.question', 'surveys.reorder', 'surveys.transition', 'followUp.mark', 'followUp.reopen', 'clusters.createFinding', 'clusters.linkFinding'];
  it.each(names)('%s refuses a stored receipt after current read access is denied', async (name) => {
    const c = cases().find((item) => item.name === name);
    if (!c) throw new Error(`missing case: ${name}`);
    const actor = await insertDevActor(db, WORKSPACE_ID, `replay-${randomUUID()}`);
    actors.push(actor.id);
    for (const capability of ['finding.read', 'finding.manage', 'survey.read', 'survey.read_personal_responses', 'voc.read']) {
      await grantCapability(db, WORKSPACE_ID, actor.id, capability, ms, admin);
    }
    const cookie = await loginAs(app, actor.externalId);
    const key = randomUUID();
    const stored = { id: finding, primary_managed_system_id: ms, response_id: response, marker: name, ...c.body };
    const hash = hashRequestBody(c.hash);
    await db.pool.query(
      `insert into core.idempotency_keys(actor_id,key,request_hash,response_status,response_body)
       values ($1,$2,$3,200,$4::jsonb)`, [actor.id, key, hash, JSON.stringify(stored)],
    );
    const send = () => app.inject({ method: c.method ?? 'POST', url: c.url,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': key, 'if-match': stamp }, payload: c.payload });
    const allowed = await send();
    expect({ status: allowed.statusCode, body: allowed.json() }).toEqual({ status: 200, body: stored });
    await denyCapability(db, WORKSPACE_ID, actor.id, c.capability, ms, admin);
    const denied = await send();
    expect(denied.json()).toMatchObject({ code: ['finding.manage'].includes(c.capability) && name.startsWith('tasks.') ? 'permission.denied' : c.capability === 'finding.read' && name.startsWith('findings.') ? 'permission.denied' : 'not_found.record' });
    expect([403, 404]).toContain(denied.statusCode);
    const receipts = await db.pool.query('select response_body from core.idempotency_keys where actor_id=$1 and key=$2', [actor.id, key]);
    expect(receipts.rows).toEqual([{ response_body: stored }]);
    const audits = await migrate.pool.query('select id from core.audit_log where actor_id=$1', [actor.id]);
    expect(audits.rows).toHaveLength(0);
  });
});
