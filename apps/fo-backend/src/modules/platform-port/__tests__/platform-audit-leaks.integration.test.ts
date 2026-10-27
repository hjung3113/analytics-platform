// #621 FIX1 — what the audit projection must not show, proven with the REAL writers (not hand-made
// rows): permission lifecycle events of a sensitive capability (C1) and entity_link events that
// touch a survey response (C2). Route-level against a real Postgres (throwaway DB only). Every
// query filters on an actor or id this suite created, so other suites' rows never enter an assertion.

import { randomUUID } from 'node:crypto';
import { CAPABILITIES, isSensitiveCapability } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-audit-leaks');
const RAW_ANSWER = 'Raw answer that must never leave the Survey boundary';
const APPROVED = 'Approved, redacted operational excerpt';

type Envelope = {
  outcome: string;
  data: { items?: Array<Record<string, unknown>>; total?: number } | null;
};
type Person = { id: string; externalId: string; cookie: string };

const SENSITIVE_CAPABILITY = 'survey.read_personal_responses';
const CONTROL_CAPABILITY = 'voc.triage';

describe.skipIf(!runIntegration)('platform audit projection hides what it must (#621 FIX1)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const vocIds: string[] = [];
  let msId = '';
  let n = 0;

  async function newPerson(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
    });
    actorIds.push(id);
    // Sessions are seeded through SQL so this suite does not spend the shared mock-login limit.
    const cookie = randomUUID();
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, id, WORKSPACE_ID],
    );
    return { id, externalId, cookie };
  }

  const call = (method: 'POST' | 'PATCH', url: string, cookie: string, payload: object) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload,
    });
  const search = async (admin: Person, query: Record<string, unknown>) => {
    const res = await call('POST', '/api/v1/platform/audit-trail/search', admin.cookie, query);
    expect(res.statusCode).toBe(200);
    return res.json<Envelope>();
  };
  const idsOf = (body: Envelope) => (body.data?.items ?? []).map((i) => i.id as string);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, uid(PREFIX), 'Audit leaks MS');
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[] = []) => migrateHandle.pool.query(text, params);
    // $1 = the suite's Managed System; every survey/finding row hangs off it.
    const findings = 'select id from finding.findings where primary_managed_system_id = $1';
    const surveys = 'select id from survey.surveys where primary_managed_system_id = $1';
    const responses = `select id from survey.survey_responses where survey_id in (${surveys})`;
    if (actorIds.length > 0) {
      await q('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
      await q('delete from core.idempotency_keys where actor_id = any($1::uuid[])', [actorIds]);
    }
    if (msId) {
      await q(
        `delete from core.entity_links where source_id in (${responses}) or target_id in (${findings})`,
        [msId],
      );
      await q(`delete from finding.evidence_highlights where finding_id in (${findings})`, [msId]);
      await q(`delete from finding.findings where id in (${findings})`, [msId]);
      await q(
        `delete from survey.survey_response_excerpt_approvals where survey_id in (${surveys})`,
        [msId],
      );
      await q(`delete from survey.survey_response_answers where response_id in (${responses})`, [
        msId,
      ]);
      await q(`delete from survey.survey_responses where id in (${responses})`, [msId]);
      await q(`delete from survey.survey_questions where survey_id in (${surveys})`, [msId]);
      await q(`delete from survey.surveys where id in (${surveys})`, [msId]);
      await q('delete from permission.permission_grants where managed_system_id = $1', [msId]);
      await q('delete from permission.permission_denies where managed_system_id = $1', [msId]);
    }
    if (vocIds.length > 0) await q('delete from voc.vocs where id = any($1::uuid[])', [vocIds]);
    if (actorIds.length > 0) {
      await q(
        'delete from permission.permission_requests where requester_actor_id = any($1::uuid[])',
        [actorIds],
      );
      await q('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
      await q('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    }
    if (msId) {
      await deleteRecoveryFixtureParents(
        migrateHandle,
        'delete from core.managed_systems where id = $1',
        [msId],
      );
    }
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  describe('C1 — permission rows follow the capability, not a marker', () => {
    // Pins the SQL allowlist in 0074 to the TS registry: a new capability fails here until decided.
    it.each(CAPABILITIES.map((capability) => [capability]))(
      'permission rows for %s are listed iff the capability is non-sensitive',
      async (capability) => {
        const admin = await newPerson('admin');
        const subject = await newPerson('user');
        const rows: Array<[string, string]> = [
          ['permission_approved', 'permission_request'],
          ['permission_granted', 'permission_grant'],
          ['permission_deny_revoked', 'permission_deny'],
        ];
        const ids: string[] = [];
        for (const [eventType, subjectType] of rows) {
          const res = await migrateHandle.pool.query<{ id: string }>(
            `insert into core.audit_log
               (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
             values ($1, $2, $3, $4, $5, 's', $6::jsonb) returning id`,
            [
              WORKSPACE_ID,
              subject.id,
              eventType,
              subjectType,
              randomUUID(),
              JSON.stringify({ capability }),
            ],
          );
          ids.push(res.rows[0]?.id as string);
        }
        const body = await search(admin, { actor: subject.externalId, pageSize: 100 });
        if (isSensitiveCapability(capability)) {
          expect(body.outcome).toBe('empty');
        } else {
          expect(idsOf(body).sort()).toEqual([...ids].sort());
          expect(body.data?.total).toBe(3);
        }
      },
    );

    it('a permission row without a capability is excluded, whatever else it carries', async () => {
      const admin = await newPerson('admin');
      const subject = await newPerson('user');
      for (const detail of [{}, { reason: 'no capability here' }, { capability: null }]) {
        await migrateHandle.pool.query(
          `insert into core.audit_log
             (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
           values ($1, $2, 'permission_rejected', 'permission_request', $3, 's', $4::jsonb)`,
          [WORKSPACE_ID, subject.id, randomUUID(), JSON.stringify(detail)],
        );
      }
      expect((await search(admin, { actor: subject.externalId })).outcome).toBe('empty');
    });

    // Real writers: request → edit → clarification asked → clarification answered → cancel, then a
    // second request that the admin rejects. The later events carry no `sensitive` marker.
    async function permissionLifecycle(capability: string) {
      const admin = await newPerson('admin');
      const requester = await newPerson('developer');
      await migrateHandle.pool.query('delete from core.rate_limits');
      const created = await call('POST', '/permission-requests', requester.cookie, {
        requested_capability: capability,
        requested_managed_system_id: msId,
        reason: 'first reason',
      });
      expect(created.statusCode).toBe(201);
      const first = created.json<{ id: string; revision: number }>();
      const edited = await call('PATCH', `/permission-requests/${first.id}`, requester.cookie, {
        expected_revision: first.revision,
        reason: 'edited reason',
      });
      expect(edited.statusCode).toBe(200);
      const asked = await call(
        'POST',
        `/permissions/requests/${first.id}/need-more-info`,
        admin.cookie,
        { expected_revision: edited.json<{ revision: number }>().revision, note: 'which system?' },
      );
      expect(asked.statusCode).toBe(200);
      const answered = await call(
        'POST',
        `/permission-requests/${first.id}/submit-more-info`,
        requester.cookie,
        { expected_revision: asked.json<{ revision: number }>().revision, reason: 'this one' },
      );
      expect(answered.statusCode).toBe(200);
      const cancelled = await call(
        'POST',
        `/permission-requests/${first.id}/cancel`,
        requester.cookie,
        { expected_revision: answered.json<{ revision: number }>().revision },
      );
      expect(cancelled.statusCode).toBe(200);
      const again = await call('POST', '/permission-requests', requester.cookie, {
        requested_capability: capability,
        requested_managed_system_id: msId,
        reason: 'second reason',
      });
      expect(again.statusCode).toBe(201);
      const second = again.json<{ id: string; revision: number }>();
      const rejected = await call(
        'POST',
        `/permissions/requests/${second.id}/reject`,
        admin.cookie,
        { expected_revision: second.revision, reason: 'no' },
      );
      expect(rejected.statusCode).toBe(200);
      // The writers really wrote one audit row per step (7), none of them marked sensitive after
      // the first: without this the hidden-ness below could be vacuous.
      const written = await migrateHandle.pool.query<{ event_type: string }>(
        'select event_type from core.audit_log where subject_id = any($1::uuid[])',
        [[first.id, second.id]],
      );
      expect(written.rows).toHaveLength(7);
      return { admin, requester, requestIds: [first.id, second.id] };
    }

    it('a sensitive request never appears — items, total, targetId filter or paging', async () => {
      const sensitive = await permissionLifecycle(SENSITIVE_CAPABILITY);
      const control = await permissionLifecycle(CONTROL_CAPABILITY);
      const viewer = await newPerson('admin');

      for (const id of sensitive.requestIds) {
        expect(await search(viewer, { type: 'permission_request', targetId: id })).toMatchObject({
          outcome: 'empty',
          data: null,
        });
      }
      for (const actor of [sensitive.requester, sensitive.admin]) {
        expect(
          await search(viewer, { type: 'permission_request', actor: actor.externalId }),
        ).toMatchObject({ outcome: 'empty', data: null });
        expect(await search(viewer, { actor: actor.externalId, pageSize: 100 })).toMatchObject({
          outcome: 'empty',
        });
        expect(
          await search(viewer, { type: 'permission_request', actor: actor.externalId, page: 2 }),
        ).toMatchObject({ outcome: 'empty' });
      }

      // The control capability's rows are all there: 5 for the requester (create, edit, answer,
      // cancel, create again), 2 for the admin (need more info, reject).
      const requesterRows = await search(viewer, {
        type: 'permission_request',
        actor: control.requester.externalId,
        pageSize: 100,
      });
      expect(requesterRows.data?.total).toBe(5);
      expect(idsOf(requesterRows)).toHaveLength(5);
      const adminRows = await search(viewer, {
        type: 'permission_request',
        actor: control.admin.externalId,
        pageSize: 100,
      });
      expect(adminRows.data?.total).toBe(2);
      for (const id of control.requestIds) {
        const byTarget = await search(viewer, { type: 'permission_request', targetId: id });
        expect(byTarget.outcome).toBe('ok');
      }
      const paged = await search(viewer, {
        type: 'permission_request',
        actor: control.requester.externalId,
        page: 3,
        pageSize: 2,
      });
      expect(paged.data).toMatchObject({ total: 5 });
      expect(idsOf(paged)).toHaveLength(1);
    });
  });

  describe('C2 — links that touch a survey response never appear', () => {
    async function surveySource() {
      const admin = await newPerson('admin');
      const survey = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.surveys (workspace_id,display_id,type,status,title,primary_managed_system_id,operator_actor_id,responses_identity_protected,created_by,opened_at)
         values ($1,$2,'outcome','open','Private survey',$3,$4,true,$4,now()) returning id`,
        [WORKSPACE_ID, `S-${randomUUID()}`, msId, admin.id],
      );
      const surveyId = survey.rows[0]?.id as string;
      const question = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_questions (workspace_id,survey_id,kind,prompt,is_required,sort_order,branch_depth)
         values ($1,$2,'text','What needs improvement?',true,0,0) returning id`,
        [WORKSPACE_ID, surveyId],
      );
      const questionId = question.rows[0]?.id as string;
      // Five identity-protected responses so the approved excerpt passes the audience threshold.
      let responseId = '';
      for (let index = 0; index < 5; index++) {
        const respondent = index === 0 ? admin : await newPerson('user');
        const response = await migrateHandle.pool.query<{ id: string }>(
          `insert into survey.survey_responses (workspace_id,survey_id,respondent_actor_id,identity_protected,submitted_at)
           values ($1,$2,$3,true,now()) returning id`,
          [WORKSPACE_ID, surveyId, respondent.id],
        );
        const id = response.rows[0]?.id as string;
        if (index === 0) responseId = id;
        await migrateHandle.pool.query(
          `insert into survey.survey_response_answers (workspace_id,survey_id,response_id,question_id,answer_kind,answer_value)
           values ($1,$2,$3,$4,'text',$5::jsonb)`,
          [WORKSPACE_ID, surveyId, id, questionId, JSON.stringify(RAW_ANSWER)],
        );
      }
      const approval = await migrateHandle.pool.query<{ id: string }>(
        `insert into survey.survey_response_excerpt_approvals
           (workspace_id,survey_id,response_id,question_id,redacted_excerpt,approved_by)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [WORKSPACE_ID, surveyId, responseId, questionId, APPROVED, admin.id],
      );
      return {
        admin,
        responseId,
        questionId,
        attachApprovalId: approval.rows[0]?.id as string,
      };
    }

    it('survey-linked entity_link rows are absent from items, total, type listing and targetId; the VOC link stays', async () => {
      const source = await surveySource();
      const creator = await newPerson('developer');
      const reader = await newPerson('developer');
      await migrateHandle.pool.query('delete from core.rate_limits');
      for (const capability of [
        'survey.read',
        'survey.read_personal_responses',
        'survey.manage',
        'finding.manage',
      ]) {
        await grantCapability(
          migrateHandle,
          WORKSPACE_ID,
          creator.id,
          capability,
          msId,
          source.admin.id,
        );
      }
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        reader.id,
        'survey.read',
        msId,
        source.admin.id,
      );
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        reader.id,
        'finding.manage',
        msId,
        source.admin.id,
      );

      // Finding from a survey response (generated_finding + evidence_of links at creation).
      const approved = await call(
        'POST',
        `/survey-responses/${source.responseId}/approved-excerpts`,
        creator.cookie,
        { question_id: source.questionId, redacted_excerpt: APPROVED },
      );
      expect(approved.statusCode).toBe(201);
      const created = await call(
        'POST',
        `/survey-responses/${source.responseId}/create-finding`,
        creator.cookie,
        {
          severity: 'high',
          confidence: 'medium',
          approved_excerpt_ids: [
            approved.json<{ approved_excerpt_id: string }>().approved_excerpt_id,
          ],
        },
      );
      expect(created.statusCode).toBe(201);
      // Survey evidence attached to another Finding (evidence_of link from evidence.ts).
      const target = await insertFindingRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        sourceId: randomUUID(),
        createdBy: source.admin.id,
      });
      const attached = await call('POST', `/findings/${target.id}/survey-evidence`, reader.cookie, {
        approved_excerpt_id: source.attachApprovalId,
        sentiment: 'negative',
        importance: 'high',
      });
      expect(attached.statusCode).toBe(201);
      // Control: a VOC → Finding link is an ordinary, listable entity_link.
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        msId,
        source.admin.id,
        'link control',
      );
      vocIds.push(voc.id);
      const controlFinding = await call(
        'POST',
        `/vocs/${voc.id}/create-finding`,
        source.admin.cookie,
        {
          title: 'Control finding',
          summary: 'Control',
          severity: 'high',
        },
      );
      expect(controlFinding.statusCode).toBe(201);

      const links = await migrateHandle.pool.query<{
        id: string;
        subject_id: string;
        source: string;
      }>(
        `select id, subject_id, detail->'source'->>'type' as source from core.audit_log
          where event_type = 'entity_link.created' and actor_id = any($1::uuid[])`,
        [[creator.id, reader.id, source.admin.id]],
      );
      const surveyLinks = links.rows.filter((r) => r.source === 'survey_response');
      const vocLinks = links.rows.filter((r) => r.source === 'voc');
      // generated_finding + evidence_of at creation, evidence_of at attach — so the test is not vacuous.
      expect(surveyLinks.length).toBeGreaterThanOrEqual(3);
      expect(vocLinks).toHaveLength(1);
      const hiddenAuditIds = surveyLinks.map((r) => r.id);

      const viewer = await newPerson('admin');
      for (const actor of [creator, reader]) {
        const all = await search(viewer, { actor: actor.externalId, pageSize: 100 });
        for (const id of hiddenAuditIds) expect(idsOf(all)).not.toContain(id);
        expect(all.data?.total).toBe(idsOf(all).length);
        expect(
          await search(viewer, { type: 'entity_link', actor: actor.externalId }),
        ).toMatchObject({
          outcome: 'empty',
          data: null,
        });
      }
      for (const link of surveyLinks) {
        expect(
          await search(viewer, { type: 'entity_link', targetId: link.subject_id }),
        ).toMatchObject({
          outcome: 'empty',
          data: null,
        });
      }
      // The Finding's own safe event stays visible (the reviewer's point: only the link is hidden).
      const safe = await search(viewer, {
        type: 'finding',
        actor: creator.externalId,
        pageSize: 100,
      });
      expect(safe.outcome).toBe('ok');
      expect(safe.data?.total).toBeGreaterThanOrEqual(1);

      const control = vocLinks[0] as { id: string; subject_id: string };
      const controlList = await search(viewer, {
        type: 'entity_link',
        actor: source.admin.externalId,
      });
      expect(controlList.data?.total).toBe(1);
      expect(idsOf(controlList)).toEqual([control.id]);
      const controlById = await search(viewer, {
        type: 'entity_link',
        targetId: control.subject_id,
      });
      expect(idsOf(controlById)).toEqual([control.id]);
    });

    // Rows shaped like an entity_link writer that left out an endpoint type fail closed, too.
    it.each([
      ['no endpoint types', {}],
      ['only a source type', { source: { type: 'voc' } }],
      ['only a target type', { target: { type: 'finding' } }],
      [
        'survey_response target',
        { source: { type: 'finding' }, target: { type: 'survey_response' } },
      ],
    ])('entity_link row with %s is excluded', async (_name, detail) => {
      const viewer = await newPerson('admin');
      const writer = await newPerson('user');
      await migrateHandle.pool.query(
        `insert into core.audit_log
           (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail)
         values ($1, $2, 'entity_link.detached', 'entity_link', $3, 's', $4::jsonb)`,
        [WORKSPACE_ID, writer.id, randomUUID(), JSON.stringify(detail)],
      );
      expect((await search(viewer, { actor: writer.externalId })).outcome).toBe('empty');
    });
  });
});
