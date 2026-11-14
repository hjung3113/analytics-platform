// #1480 D-d — comparison, coverage, review labels and the rerun diff: the reads `logDataset.comparison` and `logDataset.rerunDiff`, the action
// `reviewLabelAdd`, the append-only label table (API and DB trigger), visibility and workspace isolation, session-only refusals, and the
// classification of every kind against seeded runs / requests / attempts / rule results — through the real `buildServer` over `menu-action` /
// `menu-query`, against a real Postgres (throwaway DB only; app as platform_app, fixtures as platform_migrate). Needs migration 0115.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';
import type { DatasetSourceRead, DescribeFileResponse } from '../source-check.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LDS${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const Q = '/api/v1/validation-queue';
const SATURDAY_NOON = new Date('2026-11-14T12:00:00+09:00'); // inside the default run window

interface Person {
  id: string;
  cookie: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version?: string;
  fieldErrors: { path: string[]; code: string }[];
}
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('comparison, coverage, review labels, rerun diff (#1480 D-d)', () => {
  let withPort: FastifyInstance;
  let noPort: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let grantee: Person; // dataset.manage
  let approver: Person; // dataset.baseline.approve
  let runner: Person; // dataset.suite.run
  let runner2: Person; // dataset.suite.run
  let projectOwner: Person; // lifecycle.project.manage
  let privOwner: Person; // dataset.manage + dataset.baseline.approve + dataset.suite.run: owns the private datasets
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignSuite = '';
  let systemId = '';
  let worker = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const csrf = new Map<string, string>();
  let n = 0;
  const at = <T>(list: readonly T[], index: number): T => {
    const value = list[index];
    if (value === undefined) throw new Error(`no item ${index}`);
    return value;
  };
  let portAnswers: Record<string, DescribeFileResponse | 'throw'> = {};
  const portCalls: string[] = [];
  let ownerAllowed = true;
  const mockPort: DatasetSourceRead = {
    describe: () => Promise.reject(new Error('unused')),
    searchRecords: () => Promise.reject(new Error('unused')),
    getWindow: () => Promise.reject(new Error('unused')),
    getParsed: () => Promise.reject(new Error('unused')),
    getPeriods: () => Promise.reject(new Error('unused')),
    getTopViewLink: () => Promise.reject(new Error('unused')),
    async describeFile(request) {
      portCalls.push(request.fileRef);
      const answer = portAnswers[request.fileRef];
      if (answer === 'throw') throw new Error('adapter body: SECRET-LINE-TEXT');
      return answer ?? { status: 'source_absent' };
    },
  };

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
  const ref = (name: string) => `s3://${TAG}/${name}`;
  const shaOf = (name: string) => H(String.fromCharCode(97 + (name.charCodeAt(0) % 6)));
  const files = (...names: string[]) => names.map((name, i) => ({ fileRef: ref(name), order: i + 1, sha256: shaOf(name) }));
  const sampleSet = (...names: string[]) => ({ sourceOwner: `${TAG}-fab`, files: files(...names) });

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    return { id, cookie: await loginAs(withPort, externalId) };
  }
  async function csrfOf(app: FastifyInstance, who: Person): Promise<string> {
    const key = `${app === withPort ? 'p' : 'n'}:${who.id}`;
    let token = csrf.get(key);
    if (!token) {
      const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(who.cookie) });
      token = boot.json<{ csrfToken: string }>().csrfToken;
      csrf.set(key, token);
    }
    return token;
  }
  async function actOn(app: FastifyInstance, action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string, menu = 'logDataset'): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': await csrfOf(app, who) },
      payload: JSON.stringify({ action: `${menu}.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }) }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const act = (action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string) => actOn(withPort, action, input, who, expectedVersion);
  async function read(endpoint: string, params: Record<string, unknown>, who: Person, app: FastifyInstance = withPort): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logDataset.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const audit = async (subjectId: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [subjectId])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Row;
    }[];

  // ---- fixtures ----------------------------------------------------------------------------------------------------
  async function makeDataset(who: Person, over: Record<string, unknown> = {}): Promise<{ id: string }> {
    const a = await act('datasetCreate', { name: `${TAG}-ds-${n++}`, shareScope: 'workspace', ...over }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.datasetId as string };
  }
  async function makeRevision(datasetId: string, names: string[] = [`${n++}.log`], who: Person = grantee) {
    const set = sampleSet(...names);
    const a = await act('revisionCreate', { datasetId, sampleSet: set }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.revisionId as string, set, digest: a.data.digest as string };
  }
  async function approveBaseline(revision: { id: string; set: { files: { fileRef: string }[] } }, who: Person = grantee, approvedBy: Person = approver) {
    const d = await act('baselineDraftCreate', { datasetRevisionId: revision.id }, who);
    expect(d.outcome, JSON.stringify(d)).toBe('ok');
    const u = await act(
      'baselineUpdateDraft',
      { id: d.data.baselineId, expectedScope: ['R-1'], expectations: [{ ruleId: 'R-1', expected: 'PASS', evidence: [{ fileRef: at(revision.set.files, 0).fileRef, line: 1 }] }] },
      who,
      d.data.version as string,
    );
    expect(u.outcome, JSON.stringify(u)).toBe('ok');
    const ap = await act('baselineApprove', { id: d.data.baselineId, reason: 'checked' }, approvedBy, u.version);
    expect(ap.outcome, JSON.stringify(ap)).toBe('ok');
    return d.data.baselineId as string;
  }
  async function makeSuite(items: Record<string, unknown>[], over: Record<string, unknown> = {}, who: Person = grantee) {
    const a = await act('suiteCreate', { name: `${TAG}-suite-${n++}`, items, ...over }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.suiteId as string, version: a.data.version as string };
  }
  const run = (suiteId: string, who: Person = runner, key: string = randomUUID(), app: FastifyInstance = withPort) => actOn(app, 'suiteRun', { suiteId, idempotencyKey: key }, who);

  // ---- worker REST --------------------------------------------------------------------------------------------------
  const post = (path: string, payload: unknown = {}, token = worker) => withPort.inject({ method: 'POST', url: `${Q}${path}`, headers: { authorization: `Bearer ${token}` }, payload: payload as object });
  const claim = () => post('/claim');
  async function finish(claimBody: { request: { id: string; sampleManifestDigest: string; sampleSet: { files: { fileRef: string; sha256: string }[] } }; attempt: { attemptNo: number } }, rules: Row[]) {
    const res = await post(`/requests/${claimBody.request.id}/result`, { attemptNo: claimBody.attempt.attemptNo, inputManifestDigest: claimBody.request.sampleManifestDigest, results: rules });
    expect(res.statusCode, res.body).toBe(200);
  }
  const rule = (ruleId: string, result: string, extra: Row = {}) => ({ ruleId, result, required: true, ...extra });

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
    portAnswers = {};
    portCalls.length = 0;
    ownerAllowed = true;
    // Requests left by an earlier test would be claimed first: end every open one (the guard allows queued/claimed -> cancelled).
    await sql(
      `update log_lifecycle.execution_request set state = 'cancelled', claimed_by_actor_id = null, lease_expires_at = null, ended_at = now(), row_version = row_version + 1
        where workspace_id = $1 and state in ('queued','claimed')`,
      [WORKSPACE_ID],
    );
    await sql('delete from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    const owners = { allows: async () => ownerAllowed };
    withPort = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => SATURDAY_NOON, logDatasets: { sourceRead: mockPort, sourceOwnerAccess: owners } });
    noPort = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => SATURDAY_NOON });
    await Promise.all([withPort.ready(), noPort.ready()]);
    admin = await person('admin');
    user = await person('user');
    developer = await person('developer');
    grantee = await person('developer');
    approver = await person('developer');
    runner = await person('developer');
    runner2 = await person('developer');
    projectOwner = await person('developer');
    privOwner = await person('developer');
    const grant = (who: Person, cap: string) =>
      sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [WORKSPACE_ID, who.id, cap, admin.id]);
    await grant(grantee, 'dataset.manage');
    await grant(approver, 'dataset.baseline.approve');
    await grant(runner, 'dataset.suite.run');
    await grant(runner2, 'dataset.suite.run');
    await grant(projectOwner, 'lifecycle.project.manage');
    for (const cap of ['dataset.manage', 'dataset.baseline.approve', 'dataset.suite.run']) await grant(privOwner, cap);
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    foreignSuite = (await sql(`insert into log_datasets.regression_suite (workspace_id, name, items, created_by, updated_by) values ($1,$2,$3::jsonb,$4,$4) returning id`, [otherWorkspace, `${TAG}-fs`, JSON.stringify([{ datasetId: randomUUID() }]), foreignActor])).rows[0].id as string;
    systemId = (await sql("select id from core.actors where workspace_id = $1 and external_id = 'system'", [WORKSPACE_ID])).rows[0].id as string;
    const issued = await withPort.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-svc`, scopes: ['validation.worker'], actorId: systemId } });
    expect(issued.statusCode, issued.body).toBe(201);
    worker = issued.json<{ token: string }>().token;
  }, 90_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const [table, trigger] of [
        ['log_lifecycle.rule_result_excerpt', 'rule_result_excerpt_no_delete'],
        ['log_lifecycle.rule_result_evidence', 'rule_result_evidence_append_only'],
        ['log_datasets.suite_review_label', 'suite_review_label_append_only'],
        ['log_datasets.suite_run_item', 'suite_run_item_immutable'],
        ['log_datasets.suite_run', 'suite_run_immutable'],
        ['log_datasets.baseline_event', 'baseline_event_append_only'],
        ['log_datasets.dataset_revision', 'dataset_revision_immutable'],
      ] as const) await client.query(`alter table ${table} disable trigger ${trigger}`);
      await client.query('delete from log_lifecycle.rule_result_excerpt where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_lifecycle.rule_result_evidence where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_lifecycle.rule_result where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_lifecycle.execution_attempt where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_lifecycle.execution_request where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_datasets.suite_review_label where workspace_id = any($1)', [[WORKSPACE_ID, ...workspaceIds]]);
      await client.query('delete from log_datasets.suite_run_item where workspace_id = any($1)', [[WORKSPACE_ID, ...workspaceIds]]);
      await client.query('delete from log_datasets.suite_run where workspace_id = any($1)', [[WORKSPACE_ID, ...workspaceIds]]);
      await client.query('delete from log_datasets.regression_suite where created_by = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('delete from log_datasets.baseline_event where actor_id = any($1)', [actorIds]);
      await client.query('delete from log_datasets.expected_baseline where author_actor_id = any($1)', [actorIds]);
      await client.query('delete from log_datasets.dataset_revision where created_by = any($1)', [actorIds]);
      await client.query('delete from log_datasets.dataset where created_by = any($1)', [actorIds]);
      for (const [table, trigger] of [
        ['log_lifecycle.rule_result_excerpt', 'rule_result_excerpt_no_delete'],
        ['log_lifecycle.rule_result_evidence', 'rule_result_evidence_append_only'],
        ['log_datasets.suite_review_label', 'suite_review_label_append_only'],
        ['log_datasets.suite_run_item', 'suite_run_item_immutable'],
        ['log_datasets.suite_run', 'suite_run_immutable'],
        ['log_datasets.baseline_event', 'baseline_event_append_only'],
        ['log_datasets.dataset_revision', 'dataset_revision_immutable'],
      ] as const) await client.query(`alter table ${table} enable trigger ${trigger}`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from core.api_tokens where workspace_id = $1 and (created_by = any($2) or actor_id = any($2) or name like $3)', [WORKSPACE_ID, actorIds, `${TAG}%`]);
    for (const table of ['lifecycle.development_event', 'lifecycle.validation_round', 'lifecycle.development_project']) {
      await sql(`delete from log_${table.replace('lifecycle.', 'lifecycle.')} where workspace_id = $1 and created_by = any($2)`, [WORKSPACE_ID, actorIds]).catch(() => undefined);
    }
    for (const [table, column] of [['core.idempotency_keys', 'actor_id'], ['core.audit_log', 'actor_id'], ['permission.permission_grants', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]).catch(() => undefined);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]).catch(() => undefined);
    await withPort?.close();
    await noPort?.close();
    await migrate?.pool.end();
    await dbHandle?.pool.end();
  }, 60_000);

  // ---- seeding: requests, attempts and rule results the way the queue leaves them ------------------------------------
  type Rules = [ruleId: string, result: string, required?: boolean][];
  /** Ends the request as `succeeded` with one succeeded attempt (the guard allows queued -> succeeded) and writes the rule results. */
  async function seedResult(requestId: string, rules: Rules, over: { attemptNo?: number; text?: string; endRequest?: boolean } = {}): Promise<string> {
    const no = over.attemptNo ?? 1;
    const attemptId = (
      await sql(
        `insert into log_lifecycle.execution_attempt (workspace_id, request_id, attempt_no, worker_actor_id, ended_at, outcome, rule_set_revision, input_manifest_digest, result_digest, verdict)
         values ($1,$2,$3,$4,now(),'succeeded',$5,$6,$7,'pass') returning id`,
        [WORKSPACE_ID, requestId, no, systemId, `rs-${no}`, H('a'), H('e')],
      )
    ).rows[0].id as string;
    for (const [ruleId, result, required] of rules) {
      await sql(`insert into log_lifecycle.rule_result (workspace_id, attempt_id, rule_id, result, required, expected, observed) values ($1,$2,$3,$4,$5,$6,$6)`, [
        WORKSPACE_ID, attemptId, ruleId, result, required ?? true, over.text ?? null,
      ]);
    }
    if (over.endRequest !== false) {
      await sql(`update log_lifecycle.execution_request set state = 'succeeded', attempt_count = attempt_count + 1, ended_at = now(), row_version = row_version + 1 where id = $1 and state = 'queued'`, [requestId]);
    }
    return attemptId;
  }
  async function seedFailedAttempt(requestId: string, attemptNo: number) {
    await sql(
      `insert into log_lifecycle.execution_attempt (workspace_id, request_id, attempt_no, worker_actor_id, ended_at, outcome, input_manifest_digest) values ($1,$2,$3,$4,now(),'failed',$5)`,
      [WORKSPACE_ID, requestId, attemptNo, systemId, H('a')],
    );
  }

  /** A shared dataset with one revision and an approved baseline holding exactly these expectations (scope defaults to their rule ids). */
  async function datasetWith(expectations: [string, string][], scope: string[] = expectations.map(([id]) => id), over: Record<string, unknown> = {}) {
    const isPrivate = over.shareScope === 'private';
    const who = isPrivate ? privOwner : grantee;
    const ds = await makeDataset(isPrivate ? privOwner : admin, over);
    const revision = await makeRevision(ds.id, undefined, who);
    const d = await act('baselineDraftCreate', { datasetRevisionId: revision.id }, who);
    expect(d.outcome, JSON.stringify(d)).toBe('ok');
    const u = await act('baselineUpdateDraft', { id: d.data.baselineId, expectedScope: scope, expectations: expectations.map(([ruleId, expected]) => ({ ruleId, expected })) }, who, d.data.version as string);
    expect(u.outcome, JSON.stringify(u)).toBe('ok');
    const ap = await act('baselineApprove', { id: d.data.baselineId, reason: 'checked' }, isPrivate ? privOwner : approver, u.version);
    expect(ap.outcome, JSON.stringify(ap)).toBe('ok');
    return { ds, revision, baselineId: d.data.baselineId as string };
  }
  /** One dataset, one suite, one run; returns the pieces. The request is still queued. */
  async function scenario(expectations: [string, string][], scope?: string[], over: Record<string, unknown> = {}, who: Person = runner) {
    const d = await datasetWith(expectations, scope, over);
    const suite = await makeSuite([{ datasetId: d.ds.id }], {}, over.shareScope === 'private' ? privOwner : grantee);
    const started = await run(suite.id, who);
    expect(started.outcome, JSON.stringify(started)).toBe('ok');
    return { ...d, suite, runId: started.data.suiteRunId as string, requestId: at(started.data.items as { requestId: string }[], 0).requestId };
  }
  const compare = (runId: string, who: Person = runner, params: Record<string, unknown> = {}, app: FastifyInstance = withPort) => read('comparison', { suiteRunId: runId, ...params }, who, app);
  const byRule = (a: Answer) => Object.fromEntries((a.data.rules.rows as { ruleId: string; classification: string }[]).map((r) => [r.ruleId, r.classification]));
  const addLabel = (input: Record<string, unknown>, who: Person = grantee) => act('reviewLabelAdd', input, who);
  const labelInput = (s: { runId: string; revision: { id: string } }, over: Record<string, unknown> = {}) => ({ suiteRunId: s.runId, ordinal: 1, datasetRevisionId: s.revision.id, ruleId: 'R-1', label: 'false_positive', reason: 'checked by hand', ...over });
  const labelRows = async (runId: string) => (await sql('select * from log_datasets.suite_review_label where suite_run_id = $1 order by at, id', [runId])).rows as Row[];

  // ============================================================================================================
  describe('comparison: classification of every kind', () => {
    it('classifies each rule against the pinned baseline and the latest succeeded attempt; not_comparable never counts as PASS', async () => {
      const s = await scenario([['R-same', 'PASS'], ['R-regress', 'PASS'], ['R-fixed', 'FAIL'], ['R-skipped', 'PASS'], ['R-gone', 'PASS'], ['R-unsupported', 'EXPECTED_UNSUPPORTED'], ['R-na', 'NOT_APPLICABLE']]);
      await seedResult(s.requestId, [['R-same', 'PASS'], ['R-regress', 'FAIL'], ['R-fixed', 'PASS'], ['R-skipped', 'NOT_CHECKED'], ['R-unsupported', 'NOT_CHECKED'], ['R-na', 'NOT_APPLICABLE'], ['R-extra', 'FAIL', false]]);
      const a = await compare(s.runId);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(byRule(a)).toEqual({ 'R-same': 'unchanged', 'R-regress': 'regressed', 'R-fixed': 'fixed', 'R-skipped': 'not_comparable', 'R-gone': 'missing', 'R-unsupported': 'unchanged', 'R-na': 'unchanged', 'R-extra': 'new' });
      const item = at(a.data.items as Row[], 0) as Row & { counts: Row };
      expect(item.counts).toEqual({ unchanged: 3, regressed: 1, fixed: 1, new: 1, not_comparable: 1, missing: 1 });
      expect(a.data.run).toMatchObject({ id: s.runId, suiteId: s.suite.id, state: 'succeeded' });
      expect(item).toMatchObject({ ordinal: 1, restricted: false, datasetId: s.ds.id, datasetRevisionId: s.revision.id, baselineId: s.baselineId, requestState: 'succeeded', observed: { attemptNo: 1, ruleSetRevision: 'rs-1' } });
      // The default order puts the rules that need a look first.
      expect((a.data.rules.rows as { ruleId: string }[]).slice(0, 2).map((r) => r.ruleId)).toEqual(['R-regress', 'R-skipped']);
      expect(a.data.rules.total).toBe(8);
    });

    it('an item with no succeeded attempt is not classified at all: no observed attempt, no rules, no coverage, the request state shown', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      const a = await compare(s.runId);
      expect(a.outcome).toBe('ok');
      expect(a.data.items[0]).toMatchObject({ requestState: 'queued', observed: null, coverage: null, counts: { unchanged: 0, regressed: 0, fixed: 0, new: 0, not_comparable: 0, missing: 0 } });
      expect(a.data.rules).toEqual({ total: 0, rows: [] });
      expect(a.data.run.state).toBe('queued');
    });

    it('compares the LATEST succeeded attempt only: an older succeeded attempt and a later failed one are ignored', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      await seedResult(s.requestId, [['R-1', 'FAIL']], { attemptNo: 1 });
      await seedResult(s.requestId, [['R-1', 'PASS']], { attemptNo: 2, endRequest: false });
      await seedFailedAttempt(s.requestId, 3);
      const a = await compare(s.runId);
      expect(byRule(a)).toEqual({ 'R-1': 'unchanged' });
      expect(a.data.items[0].observed).toMatchObject({ attemptNo: 2, ruleSetRevision: 'rs-2' });
    });

    it('a request that ended failed (no succeeded attempt) is not classified', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      await seedFailedAttempt(s.requestId, 1);
      await sql(`update log_lifecycle.execution_request set state = 'failed', attempt_count = attempt_count + 1, ended_at = now(), row_version = row_version + 1 where id = $1`, [s.requestId]);
      const a = await compare(s.runId);
      expect(a.data.items[0]).toMatchObject({ requestState: 'failed', observed: null });
      expect(a.data.run.state).toBe('failed');
    });

    it('compares against the PINNED baseline: a later baseline revision of the same dataset revision does not change an earlier run', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      await seedResult(s.requestId, [['R-1', 'FAIL']]);
      expect(byRule(await compare(s.runId))).toEqual({ 'R-1': 'regressed' });
      const draft = await act('baselineDraftCreate', { datasetRevisionId: s.revision.id }, grantee);
      const upd = await act('baselineUpdateDraft', { id: draft.data.baselineId, expectedScope: ['R-1'], expectations: [{ ruleId: 'R-1', expected: 'FAIL' }] }, grantee, draft.data.version as string);
      expect((await act('baselineApprove', { id: draft.data.baselineId, reason: 'accepted' }, approver, upd.version)).outcome).toBe('ok');
      expect(byRule(await compare(s.runId))).toEqual({ 'R-1': 'regressed' });
    });

    it('answers rule ids, classifications, counts and ids only: no expected/observed text, no excerpt, no evidence location', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      const attemptId = await seedResult(s.requestId, [['R-1', 'FAIL']], { text: 'SECRET-LINE-TEXT 2026-11-01 ERROR boom' });
      await sql(`update log_lifecycle.rule_result set evidence = '[{"fileRef":"s3://SECRET-PATH/x.log","line":3,"fileSha256":"${H('a')}","hasExcerpt":true}]'::jsonb where attempt_id = $1`, [attemptId]);
      const text = JSON.stringify(await compare(s.runId));
      for (const secret of ['SECRET-LINE-TEXT', 'SECRET-PATH', 's3://', 'boom']) expect(text).not.toContain(secret);
    });

    it('is a pure read: it writes no row and no audit event', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      await seedResult(s.requestId, [['R-1', 'PASS']]);
      const count = async () => [
        Number((await sql('select count(*)::int c from core.audit_log where workspace_id = $1', [WORKSPACE_ID])).rows[0].c),
        Number((await sql('select count(*)::int c from log_lifecycle.rule_result where workspace_id = $1', [WORKSPACE_ID])).rows[0].c),
        Number((await sql('select count(*)::int c from log_datasets.suite_review_label where workspace_id = $1', [WORKSPACE_ID])).rows[0].c),
      ];
      const before = await count();
      await compare(s.runId);
      await compare(s.runId, admin, { ordinal: 1 });
      expect(await count()).toEqual(before);
    });
  });

  // ============================================================================================================
  describe('comparison: coverage', () => {
    it('counts and lists the expected scope against the executed rules: required gaps first, unknown ones next, rules outside the scope apart', async () => {
      const s = await scenario([['A', 'PASS'], ['B', 'PASS']], ['A', 'B', 'C', 'D', 'E', 'F']);
      await seedResult(s.requestId, [['A', 'PASS'], ['B', 'NOT_APPLICABLE'], ['C', 'SKIPPED', false], ['D', 'ERROR', true], ['E', 'NOT_CHECKED', true], ['X', 'WARN']]);
      const cov = (await compare(s.runId)).data.items[0].coverage;
      expect(cov).toMatchObject({ scopeCount: 6, executedCount: 2, notExecutedCount: 4, ratio: 2 / 6, executed: ['A', 'B'], outsideScope: ['X'], requiredGapCount: 2 });
      expect(cov.notExecuted).toEqual([
        { ruleId: 'D', reason: 'error', required: true },
        { ruleId: 'E', reason: 'not_checked', required: true },
        { ruleId: 'F', reason: 'missing', required: null },
        { ruleId: 'C', reason: 'skipped', required: false },
      ]);
    });

    it('an empty scope has no ratio; a scope with no executed rule is fully missing', async () => {
      const empty = await scenario([['A', 'PASS']], []);
      await seedResult(empty.requestId, [['A', 'PASS']]);
      const e = (await compare(empty.runId)).data.items[0];
      expect(e.coverage).toMatchObject({ scopeCount: 0, executedCount: 0, ratio: null, outsideScope: ['A'] });
      expect(e.counts.unchanged).toBe(1);
      const none = await scenario([['A', 'PASS']], ['A', 'B']);
      await seedResult(none.requestId, []);
      expect((await compare(none.runId)).data.items[0].coverage).toMatchObject({ executedCount: 0, notExecutedCount: 2, ratio: 0 });
    });
  });

  // ============================================================================================================
  describe('comparison: server page, filters and the item filter', () => {
    async function twoItems() {
      const a = await datasetWith([['R-1', 'PASS'], ['R-2', 'PASS'], ['R-3', 'FAIL']]);
      const b = await datasetWith([['R-1', 'PASS']]);
      const suite = await makeSuite([{ datasetId: a.ds.id }, { datasetId: b.ds.id }]);
      const started = await run(suite.id);
      const [i1, i2] = started.data.items as { requestId: string }[];
      await seedResult((i1 as { requestId: string }).requestId, [['R-1', 'FAIL'], ['R-2', 'PASS'], ['R-3', 'PASS'], ['R-4', 'WARN']]);
      await seedResult((i2 as { requestId: string }).requestId, [['R-1', 'NOT_CHECKED']]);
      return { runId: started.data.suiteRunId as string, a, b };
    }

    it('pages the rules of every item with a true total, a stable order and an item filter that leaves the item summaries whole', async () => {
      const t = await twoItems();
      const all = await compare(t.runId, runner, { pageSize: 3 });
      expect(all.data.rules.total).toBe(5);
      expect(all.data.items).toHaveLength(2);
      const seen: string[] = [];
      for (const page of [0, 1]) seen.push(...(await compare(t.runId, runner, { pageSize: 3, page })).data.rules.rows.map((r: { ordinal: number; ruleId: string }) => `${r.ordinal}/${r.ruleId}`));
      expect(seen).toEqual(['1/R-1', '2/R-1', '1/R-4', '1/R-3', '1/R-2']);
      expect((await compare(t.runId, runner, { pageSize: 3, page: 5 })).data.rules).toEqual({ total: 5, rows: [] });
      const one = await compare(t.runId, runner, { ordinal: 2 });
      expect(one.data.rules.rows.map((r: { ruleId: string }) => r.ruleId)).toEqual(['R-1']);
      expect(one.data.items).toHaveLength(2);
    });

    it('filters by classification, observed, expected, required and label with the ADR-0105 model, searches by rule id and sorts', async () => {
      const t = await twoItems();
      const f = async (params: Record<string, unknown>) => (await compare(t.runId, runner, params)).data.rules.rows.map((r: { ordinal: number; ruleId: string }) => `${r.ordinal}/${r.ruleId}`);
      expect(await f({ filters: [{ id: 'classification', op: 'in', value: ['regressed', 'new'] }] })).toEqual(['1/R-1', '1/R-4']);
      expect(await f({ filters: [{ id: 'classification', op: 'notIn', value: ['regressed', 'not_comparable', 'new'] }] })).toEqual(['1/R-3', '1/R-2']);
      expect(await f({ filters: [{ id: 'observed', op: 'in', value: ['NOT_CHECKED'] }] })).toEqual(['2/R-1']);
      expect(await f({ filters: [{ id: 'expected', op: 'in', value: ['none'] }] })).toEqual(['1/R-4']);
      expect(await f({ filters: [{ id: 'required', op: 'in', value: ['true'] }], q: 'r-2' })).toEqual(['1/R-2']);
      expect(await f({ sorting: [{ id: 'ruleId', desc: true }], pageSize: 2 })).toEqual(['1/R-4', '1/R-3']);
      const labelled = await compare(t.runId);
      expect(labelled.outcome).toBe('ok');
      expect((await addLabel({ suiteRunId: t.runId, datasetRevisionId: t.a.revision.id, ruleId: 'R-1', label: 'needs_review', reason: 'look' })).outcome).toBe('ok');
      expect(await f({ filters: [{ id: 'label', op: 'in', value: ['needs_review'] }] })).toEqual(['1/R-1']);
      expect(await f({ filters: [{ id: 'label', op: 'in', value: ['none'] }] })).toHaveLength(4);
    });

    it.each([
      ['an unknown param', { nope: 1 }],
      ['a malformed run id', { suiteRunId: 'x' }],
      ['an ordinal of 0', { ordinal: 0 }],
      ['an unknown filter value', { filters: [{ id: 'classification', op: 'in', value: ['good'] }] }],
      ['an unknown filter field', { filters: [{ id: 'ruleId', op: 'in', value: ['R-1'] }] }],
      ['a page size over the cap', { pageSize: 201 }],
    ])('refuses %s as a params error', async (_l, over) => {
      const s = await scenario([['R-1', 'PASS']]);
      const a = await compare(s.runId, runner, over);
      expect(a.outcome).toBe('error');
    });
  });

  // ============================================================================================================
  describe('comparison: visibility and workspace isolation', () => {
    it('a private dataset\'s run is invisible to everyone but its owner, with the same answer as an unknown run; a User may read a shared one', async () => {
      const priv = await scenario([['R-1', 'PASS']], undefined, { shareScope: 'private' }, privOwner);
      await seedResult(priv.requestId, [['R-1', 'PASS']]);
      const unknown = await compare(randomUUID(), runner);
      expect(unknown).toMatchObject({ outcome: 'ok', data: null });
      for (const who of [runner, grantee, admin, user]) expect(await compare(priv.runId, who), who.id).toMatchObject({ outcome: 'ok', data: null });
      expect((await compare(priv.runId, privOwner)).data.items[0]).toMatchObject({ restricted: false, datasetId: priv.ds.id });
      const shared = await scenario([['R-1', 'PASS']]);
      expect((await compare(shared.runId, user)).data.items[0]).toMatchObject({ restricted: false });
    });

    it('in a suite that mixes a shared and a private dataset the private item is restricted: no id, name, digest, rules or labels', async () => {
      const shared = await datasetWith([['R-1', 'PASS']]);
      const priv = await datasetWith([['R-1', 'PASS']], undefined, { shareScope: 'private' });
      const suite = await makeSuite([{ datasetId: shared.ds.id }, { datasetId: priv.ds.id }], {}, privOwner);
      const started = await run(suite.id, privOwner);
      expect(started.outcome, JSON.stringify(started)).toBe('ok');
      for (const item of started.data.items as { requestId: string }[]) await seedResult(item.requestId, [['R-1', 'FAIL']]);
      const seen = await compare(started.data.suiteRunId, runner);
      expect(seen.data.items[1]).toEqual({ ordinal: 2, restricted: true });
      expect(seen.data.rules.rows.map((r: { ordinal: number }) => r.ordinal)).toEqual([1]);
      expect(JSON.stringify(seen)).not.toContain(priv.ds.id);
      expect(JSON.stringify(seen)).not.toContain(priv.revision.id);
      expect((await compare(started.data.suiteRunId, privOwner)).data.rules.total).toBe(2);
    });

    it('a restricted item never feeds the run state or counts: only the visible items count, the answer ignores the private request, the owner sees both', async () => {
      const shared = await datasetWith([['R-1', 'PASS']]);
      const priv = await datasetWith([['R-1', 'PASS']], undefined, { shareScope: 'private' });
      const suite = await makeSuite([{ datasetId: shared.ds.id }, { datasetId: priv.ds.id }], {}, privOwner);
      const started = await run(suite.id, privOwner);
      expect(started.outcome, JSON.stringify(started)).toBe('ok');
      const items = started.data.items as { requestId: string }[];
      await seedResult(at(items, 0).requestId, [['R-1', 'PASS']]);
      const zero = { queued: 0, claimed: 0, succeeded: 0, failed: 0, cancelled: 0, expired: 0 };
      const headOf = async (who: Person) => (await compare(started.data.suiteRunId, who)).data.run as { state: string; counts: Record<string, number> };
      const before = await headOf(runner);
      expect(before).toMatchObject({ state: 'succeeded', counts: { ...zero, succeeded: 1 } });
      expect(await headOf(privOwner)).toMatchObject({ state: 'running', counts: { ...zero, queued: 1, succeeded: 1 } });
      // Only the private request changes (it ends cancelled): the non-owner's answer is the same, the owner's is not.
      await sql(`update log_lifecycle.execution_request set state = 'cancelled', ended_at = now(), row_version = row_version + 1 where id = $1 and state = 'queued'`, [at(items, 1).requestId]);
      expect(await headOf(runner)).toEqual(before);
      expect(await headOf(privOwner)).toMatchObject({ state: 'cancelled', counts: { ...zero, succeeded: 1, cancelled: 1 } });
    });

    it('a run of another workspace is the same absence', async () => {
      const foreignRun = (await sql(`select sr.id from log_datasets.suite_run sr limit 0`)).rows;
      expect(foreignRun).toEqual([]);
      const ds = (await sql(`insert into log_datasets.dataset (workspace_id, name, owner_actor_id, share_scope, created_by, updated_by) values ($1,$2,$3,'workspace',$3,$3) returning id`, [otherWorkspace, `${TAG}-cmp`, foreignActor])).rows[0].id as string;
      const rev = (await sql(`insert into log_datasets.dataset_revision (workspace_id, dataset_id, seq, sample_set, sample_manifest_digest, created_by) values ($1,$2,1,$3::jsonb,$4,$5) returning id`, [otherWorkspace, ds, JSON.stringify(sampleSet('f.log')), H('d'), foreignActor])).rows[0].id as string;
      const bl = (await sql(`insert into log_datasets.expected_baseline (workspace_id, dataset_revision_id, seq, status, author_actor_id, approved_by_actor_id, approved_at) values ($1,$2,1,'approved',$3,$3,now()) returning id`, [otherWorkspace, rev, foreignActor])).rows[0].id as string;
      const run0 = (await sql(`insert into log_datasets.suite_run (workspace_id, suite_id, requested_by_actor_id, idempotency_key) values ($1,$2,$3,'k') returning id`, [otherWorkspace, foreignSuite, foreignActor])).rows[0].id as string;
      await sql(`insert into log_datasets.suite_run_item (workspace_id, suite_run_id, ordinal, dataset_id, dataset_revision_id, baseline_id, sample_manifest_digest, baseline_digest, baseline_stale, request_id) values ($1,$2,1,$3,$4,$5,$6,$6,'{}'::jsonb,$7)`, [otherWorkspace, run0, ds, rev, bl, H('d'), randomUUID()]);
      expect(await compare(run0, admin)).toMatchObject({ outcome: 'ok', data: null });
      expect((await addLabel({ suiteRunId: run0, datasetRevisionId: rev, ruleId: 'R-1', label: 'accepted_change', reason: 'x' }, admin)).fieldErrors.map((e) => `${e.path}:${e.code}`)).toEqual(['suiteRunId:not_found']);
    });
  });

  // ============================================================================================================
  describe('reviewLabelAdd', () => {
    async function duplicateRevisionRun() {
      const d = await datasetWith([['R-1', 'PASS']]);
      const suite = await makeSuite([{ datasetId: d.ds.id }, { datasetId: d.ds.id, datasetRevisionId: d.revision.id }]);
      const started = await run(suite.id);
      const runId = started.data.suiteRunId as string;
      const items = started.data.items as { requestId: string }[];
      await seedResult(at(items, 0).requestId, [['R-1', 'PASS']]);
      await seedResult(at(items, 1).requestId, [['R-1', 'FAIL'], ['R-only-2', 'WARN']]);
      const input = (ordinal: number, over: Record<string, unknown> = {}) => ({ suiteRunId: runId, datasetRevisionId: d.revision.id, ordinal, ruleId: 'R-1', label: 'false_positive', reason: 'checked', ...over });
      return { runId, input };
    }

    it('#2107 isolates labels and counts by ordinal for a duplicated revision', async () => {
      const { runId, input } = await duplicateRevisionRun();
      expect((await addLabel(input(2))).outcome).toBe('ok');
      expect((await addLabel(input(1, { label: 'needs_review' }))).outcome).toBe('ok');
      const compared = await compare(runId);
      expect(compared.data.rules.rows.map((r: { ordinal: number; label: { label: string } }) => [r.ordinal, r.label.label])).toEqual([[1, 'needs_review'], [2, 'false_positive']]);
      expect(compared.data.items.map((i: { labelCount: number }) => i.labelCount)).toEqual([1, 1]);
      expect((await compare(runId, runner, { ordinal: 2 })).data.labels.total).toBe(1);
      expect((await labelRows(runId)).map(r => r.ordinal)).toEqual([2, 1]);
    });

    it('#2107 validates a result-only rule against the selected item', async () => {
      const { input } = await duplicateRevisionRun();
      expect((await addLabel(input(2, { ruleId: 'R-only-2' }))).outcome).toBe('ok');
      expect(fe(await addLabel(input(1, { ruleId: 'R-only-2' })))).toEqual(['ruleId:not_found']);
    });

    it('#2107 refuses a revision mismatch and a nonexistent ordinal', async () => {
      const { input } = await duplicateRevisionRun();
      expect(fe(await addLabel(input(2, { datasetRevisionId: randomUUID() })))).toEqual(['datasetRevisionId:not_found']);
      expect(fe(await addLabel(input(3)))).toEqual(['datasetRevisionId:not_found']);
    });

    it('#2107 audits the exact item ordinal', async () => {
      const { runId, input } = await duplicateRevisionRun();
      expect((await addLabel(input(2))).outcome).toBe('ok');
      expect((await audit(runId)).filter(e => e.event_type === 'dataset.review_label_added').map(e => e.detail.ordinal)).toEqual([2]);
    });

    it('#2107 requires ordinal instead of guessing an item', async () => {
      const s = await scenario([['R-1', 'PASS']]);
      const input = { ...labelInput(s), ordinal: undefined };
      expect(fe(await addLabel(input))).toEqual(['ordinal:required']);
    });

    it.each([0, -1, 1.5, '2', null])('#2107 refuses malformed ordinal %s', async ordinal => {
      const s = await scenario([['R-1', 'PASS']]);
      expect(fe(await addLabel(labelInput(s, { ordinal })))).toEqual(['ordinal:malformed']);
    });

    it('#2107 retains legacy labels only for an unambiguous revision', async () => {
      const d = await datasetWith([['R-1', 'PASS']]);
      const single = await datasetWith([['R-1', 'PASS']]);
      const suite = await makeSuite([{ datasetId: d.ds.id }, { datasetId: d.ds.id, datasetRevisionId: d.revision.id }, { datasetId: single.ds.id }]);
      const started = await run(suite.id);
      const runId = started.data.suiteRunId as string;
      for (const item of started.data.items as { requestId: string }[]) await seedResult(item.requestId, [['R-1', 'PASS']]);
      for (const revisionId of [d.revision.id, single.revision.id]) {
        await sql(`insert into log_datasets.suite_review_label (workspace_id, suite_run_id, dataset_revision_id, rule_id, label, reason, actor_id) values ($1,$2,$3,'R-1','needs_review','legacy',$4)`, [WORKSPACE_ID, runId, revisionId, grantee.id]);
      }
      const a = await compare(runId);
      expect(a.data.items.map((i: { labelCount: number }) => i.labelCount)).toEqual([0, 0, 1]);
      expect(a.data.rules.rows.map((r: { label: { label: string } | null }) => r.label?.label ?? null)).toEqual([null, null, 'needs_review']);
      expect(a.data.labels.total).toBe(1);
      expect(await labelRows(runId)).toHaveLength(2);
    });

    async function labelled() {
      const s = await scenario([['R-1', 'PASS'], ['R-2', 'PASS']]);
      await seedResult(s.requestId, [['R-1', 'FAIL'], ['R-9', 'WARN']]);
      return s;
    }

    it('needs dataset.manage: a User, a Developer without the grant and other grantees are refused; Admin and a grantee may label', async () => {
      const s = await labelled();
      for (const who of [user, developer, runner, approver]) expect((await addLabel(labelInput(s), who)).outcome, who.id).toBe('forbidden');
      expect(await labelRows(s.runId)).toHaveLength(0);
      expect((await addLabel(labelInput(s), admin)).outcome).toBe('ok');
      expect((await addLabel(labelInput(s), grantee)).outcome).toBe('ok');
      expect(await labelRows(s.runId)).toHaveLength(2);
    });

    it('a grantee demoted to User keeps the grant row but can no longer label', async () => {
      const demoted = await person('developer');
      await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'dataset.manage',null,$3)`, [WORKSPACE_ID, demoted.id, admin.id]);
      const s = await labelled();
      expect((await addLabel(labelInput(s), demoted)).outcome).toBe('ok');
      await sql(`update core.actors set role_level = 'user' where id = $1`, [demoted.id]);
      expect((await addLabel(labelInput(s), demoted)).outcome).toBe('forbidden');
      expect(await labelRows(s.runId)).toHaveLength(1);
    });

    it('appends a row and one body-free audit event in the same transaction; subject stays out of the platform projection', async () => {
      const s = await labelled();
      const a = await addLabel(labelInput(s, { reason: 'SECRET reviewer note' }));
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(await labelRows(s.runId)).toMatchObject([{ suite_run_id: s.runId, rule_id: 'R-1', dataset_revision_id: s.revision.id, label: 'false_positive', reason: 'SECRET reviewer note', actor_id: grantee.id }]);
      const events = (await audit(s.runId)).filter((e) => e.event_type === 'dataset.review_label_added');
      expect(events.map((e) => [e.subject_type, e.actor_id, e.detail])).toEqual([['suite_run', grantee.id, { datasetRevisionId: s.revision.id, ordinal: 1, ruleId: 'R-1', label: 'false_positive', reasonLength: 20 }]]);
      expect(JSON.stringify(events)).not.toContain('SECRET');
      // The real projection with the app's real action map, as the app role: the label event is written but never listed, a visible control row is.
      expect(events).toHaveLength(1);
      const control = randomUUID();
      await sql(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail) values ($1,$2,'permission_granted','permission_grant',$3,'probe',$4::jsonb)`,
        [WORKSPACE_ID, admin.id, control, JSON.stringify({ capability: 'dataset.suite.run' })],
      );
      const projected = await appSql(
        `select event_type, subject_type, subject_id from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = any($3)`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), [control, s.runId]],
      );
      expect(projected.rows.map((r) => r.subject_id)).toEqual([control]);
      const forRun = await appSql(`select audit_id, total from core.platform_audit_events($1, null, $2, null, null, null, null, null, $3::jsonb, 'at', true, 200, 0)`, [WORKSPACE_ID, s.runId, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE)]);
      expect(forRun.rows.filter((r) => r.audit_id !== null)).toEqual([]);
      expect(Number(forRun.rows[0]?.total ?? 0)).toBe(0);
    });

    it('a refused call (unknown rule) writes neither a label nor an audit event', async () => {
      const s = await labelled();
      const before = (await audit(s.runId)).length;
      expect((await addLabel(labelInput(s, { ruleId: 'R-nope' }))).fieldErrors.map((e) => `${e.path}:${e.code}`)).toEqual(['ruleId:not_found']);
      expect(await labelRows(s.runId)).toHaveLength(0);
      expect((await audit(s.runId)).length).toBe(before);
    });

    it('the rule must exist in that run item: named by the baseline or reported by the latest succeeded attempt, nothing else', async () => {
      const s = await labelled();
      expect((await addLabel(labelInput(s, { ruleId: 'R-2' }))).outcome).toBe('ok'); // only in the baseline (missing in the result)
      expect((await addLabel(labelInput(s, { ruleId: 'R-9' }))).outcome).toBe('ok'); // only in the result (new)
      expect((await addLabel(labelInput(s, { ruleId: 'r-1' }))).outcome).toBe('invalid'); // the id is exact
      const pending = await scenario([['R-1', 'PASS']]); // no attempt yet: the baseline alone names the rule
      expect((await addLabel(labelInput(pending, { ruleId: 'R-1' }))).outcome).toBe('ok');
      expect((await addLabel(labelInput(pending, { ruleId: 'R-9' }))).outcome).toBe('invalid');
    });

    it('names the run or revision that is not found; a revision of another item or a run the actor cannot see is not_found', async () => {
      const s = await labelled();
      const other = await labelled();
      const priv = await scenario([['R-1', 'PASS']], undefined, { shareScope: 'private' }, privOwner);
      const codes = async (input: Record<string, unknown>, who: Person = grantee) => (await addLabel(input, who)).fieldErrors.map((e) => `${e.path}:${e.code}`);
      expect(await codes(labelInput(s, { suiteRunId: randomUUID() }))).toEqual(['suiteRunId:not_found']);
      expect(await codes(labelInput(s, { datasetRevisionId: other.revision.id }))).toEqual(['datasetRevisionId:not_found']);
      expect(await codes(labelInput(priv))).toEqual(['suiteRunId:not_found']);
      expect((await addLabel(labelInput(priv), privOwner)).outcome).toBe('ok');
    });

    it.each([
      ['no label', { label: undefined }, ['label:required']],
      ['an unknown label', { label: 'accepted' }, ['label:malformed']],
      ['a blank reason', { reason: '   ' }, ['reason:required']],
      ['an overlong reason', { reason: 'x'.repeat(2001) }, ['reason:too_long']],
      ['an overlong rule id', { ruleId: 'r'.repeat(201) }, ['ruleId:too_long']],
      ['a malformed run id', { suiteRunId: 'x' }, ['suiteRunId:malformed']],
    ])('refuses %s', async (_l, over, expected) => {
      const s = await labelled();
      const a = await addLabel(labelInput(s, over));
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(expected);
      expect((await act('reviewLabelAdd', { ...labelInput(s), extra: 1 }, grantee)).outcome).toBe('invalid');
    });

    it('is append-only: a later label is a new row, the latest wins on read, the count counts them all, and the baseline and classifications stay as they were', async () => {
      const s = await labelled();
      const baselineBefore = (await sql('select * from log_datasets.expected_baseline where id = $1', [s.baselineId])).rows[0];
      const before = byRule(await compare(s.runId));
      expect((await addLabel(labelInput(s, { label: 'false_positive', reason: 'first' }))).outcome).toBe('ok');
      expect((await addLabel(labelInput(s, { label: 'accepted_change', reason: 'second' }), admin)).outcome).toBe('ok');
      expect((await addLabel(labelInput(s, { ruleId: 'R-2', label: 'false_negative', reason: 'other rule' }))).outcome).toBe('ok');
      const a = await compare(s.runId, user);
      const r1 = (a.data.rules.rows as { ruleId: string; label: { label: string; reason: string; actorId: string } | null }[]).find((r) => r.ruleId === 'R-1');
      expect(r1?.label).toMatchObject({ label: 'accepted_change', reason: 'second', actorId: admin.id });
      expect(a.data.items[0].labelCount).toBe(3);
      expect(a.data.labels.total).toBe(3);
      expect(byRule(a)).toEqual(before);
      expect((await sql('select * from log_datasets.expected_baseline where id = $1', [s.baselineId])).rows[0]).toEqual(baselineBefore);
      expect(await labelRows(s.runId)).toHaveLength(3);
    });

    it('labels are per run and per revision: another run of the same revision shows none', async () => {
      const s = await labelled();
      expect((await addLabel(labelInput(s))).outcome).toBe('ok');
      const again = await run(s.suite.id);
      await seedResult(at(again.data.items as { requestId: string }[], 0).requestId, [['R-1', 'FAIL']]);
      const a = await compare(again.data.suiteRunId);
      expect(a.data.items[0].labelCount).toBe(0);
      expect(a.data.rules.rows.every((r: { label: unknown }) => r.label === null)).toBe(true);
    });

    it('the database refuses UPDATE and DELETE on a label for every role (trigger), and the app role cannot change one either', async () => {
      const s = await labelled();
      await addLabel(labelInput(s));
      const id = (await labelRows(s.runId))[0]?.id;
      await expect(sql(`update log_datasets.suite_review_label set reason = 'edited' where id = $1`, [id])).rejects.toThrow(/append-only/);
      await expect(sql(`delete from log_datasets.suite_review_label where id = $1`, [id])).rejects.toThrow(/append-only/);
      await expect(appSql(`update log_datasets.suite_review_label set label = 'needs_review' where id = $1`, [id])).rejects.toThrow();
      await expect(appSql(`delete from log_datasets.suite_review_label where id = $1`, [id])).rejects.toThrow();
      expect((await labelRows(s.runId))[0]).toMatchObject({ reason: 'checked by hand', label: 'false_positive' });
    });

    it('composite same-workspace foreign keys: a label cannot name a run or revision of another workspace', async () => {
      const s = await labelled();
      const foreignDataset = (await sql(`insert into log_datasets.dataset (workspace_id, name, owner_actor_id, share_scope, created_by, updated_by) values ($1,$2,$3,'workspace',$3,$3) returning id`, [otherWorkspace, `${TAG}-fk`, foreignActor])).rows[0].id as string;
      const foreignRevision = (await sql(`insert into log_datasets.dataset_revision (workspace_id, dataset_id, seq, sample_set, sample_manifest_digest, created_by) values ($1,$2,1,$3::jsonb,$4,$5) returning id`, [otherWorkspace, foreignDataset, JSON.stringify(sampleSet('g.log')), H('c'), foreignActor])).rows[0].id as string;
      const insert = (workspace: string, runId: string, revisionId: string) =>
        sql(`insert into log_datasets.suite_review_label (workspace_id, suite_run_id, rule_id, dataset_revision_id, label, reason, actor_id) values ($1,$2,'R-1',$3,'needs_review','x',$4)`, [workspace, runId, revisionId, admin.id]);
      await expect(insert(otherWorkspace, s.runId, s.revision.id)).rejects.toThrow(/foreign key/);
      await expect(insert(WORKSPACE_ID, s.runId, foreignRevision)).rejects.toThrow(/foreign key/);
      await expect(sql(`insert into log_datasets.suite_review_label (workspace_id, suite_run_id, rule_id, dataset_revision_id, label, reason, actor_id) values ($1,$2,'R-1',$3,'good','x',$4)`, [WORKSPACE_ID, s.runId, s.revision.id, admin.id])).rejects.toThrow(/check/);
    });
  });

  // ============================================================================================================
  describe('rerunDiff', () => {
    const diff = (from: string, to: string, who: Person = runner, params: Record<string, unknown> = {}) => read('rerunDiff', { fromRunId: from, toRunId: to, ...params }, who);

    async function twoRuns(first: Rules, second: Rules | null, expectations: [string, string][] = [['R-1', 'PASS'], ['R-2', 'PASS'], ['R-3', 'FAIL']]) {
      const d = await datasetWith(expectations);
      const suite = await makeSuite([{ datasetId: d.ds.id }]);
      const r1 = await run(suite.id);
      const r2 = await run(suite.id);
      await seedResult(at(r1.data.items as { requestId: string }[], 0).requestId, first);
      if (second) await seedResult(at(r2.data.items as { requestId: string }[], 0).requestId, second);
      return { d, suite, from: r1.data.suiteRunId as string, to: r2.data.suiteRunId as string };
    }

    it('lists how each rule moved between two runs of the same revision, with complete counts and a page', async () => {
      const t = await twoRuns([['R-1', 'PASS'], ['R-2', 'FAIL'], ['R-3', 'FAIL'], ['R-4', 'PASS']], [['R-1', 'FAIL'], ['R-2', 'PASS'], ['R-3', 'FAIL'], ['R-5', 'PASS']]);
      const a = await diff(t.from, t.to);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data.from).toMatchObject({ id: t.from, suiteId: t.suite.id });
      expect(a.data.revisions).toHaveLength(1);
      expect(a.data.revisions[0]).toMatchObject({ datasetRevisionId: t.d.revision.id, status: 'compared', diffCounts: { same: 1, improved: 1, worsened: 1, changed: 0, appeared: 1, disappeared: 1 } });
      expect(a.data.diffs.rows.map((r: { ruleId: string; kind: string }) => [r.ruleId, r.kind])).toEqual([['R-1', 'worsened'], ['R-2', 'improved'], ['R-4', 'disappeared'], ['R-5', 'appeared']]);
      expect(a.data.diffs.total).toBe(4);
      expect((await diff(t.from, t.to, runner, { kinds: ['same'] })).data.diffs.rows.map((r: { ruleId: string }) => r.ruleId)).toEqual(['R-3']);
      expect((await diff(t.from, t.to, runner, { pageSize: 1, page: 1 })).data.diffs).toMatchObject({ total: 4, rows: [{ ruleId: 'R-2' }] });
      expect((await diff(t.from, t.to, runner, { kinds: ['bogus'] })).outcome).toBe('error');
    });

    it('is symmetric in its inputs: swapping the runs swaps from and to', async () => {
      const t = await twoRuns([['R-1', 'PASS']], [['R-1', 'FAIL']]);
      const back = await diff(t.to, t.from);
      expect(back.data.diffs.rows[0]).toMatchObject({ ruleId: 'R-1', kind: 'improved', from: { classification: 'regressed' }, to: { classification: 'unchanged' } });
    });

    it('a run without a succeeded attempt on either side is reported incomplete, never as "no change"', async () => {
      const t = await twoRuns([['R-1', 'PASS']], null);
      const a = await diff(t.from, t.to);
      expect(a.data.revisions[0]).toMatchObject({ status: 'incomplete', diffCounts: { same: 0, improved: 0, worsened: 0, changed: 0, appeared: 0, disappeared: 0 } });
      expect(a.data.diffs).toEqual({ total: 0, rows: [] });
    });

    it('refuses runs of different revisions with a field error, and the same run twice', async () => {
      const a = await datasetWith([['R-1', 'PASS']]);
      const b = await datasetWith([['R-1', 'PASS']]);
      const sa = await makeSuite([{ datasetId: a.ds.id }]);
      const sb = await makeSuite([{ datasetId: b.ds.id }]);
      const ra = await run(sa.id);
      const rb = await run(sb.id);
      const mismatch = await diff(ra.data.suiteRunId, rb.data.suiteRunId);
      expect(mismatch).toMatchObject({ outcome: 'error', data: { fieldErrors: [{ path: ['toRunId'], code: 'revision_mismatch' }] } });
      // A newer revision of the same dataset is a different revision too.
      const rev2 = await makeRevision(a.ds.id, ['newer.log']);
      await approveBaseline(rev2);
      const ra2 = await run(sa.id);
      expect((await diff(ra.data.suiteRunId, ra2.data.suiteRunId)).data.fieldErrors).toEqual([{ path: ['toRunId'], code: 'revision_mismatch' }]);
      expect((await diff(ra.data.suiteRunId, ra.data.suiteRunId)).data.fieldErrors).toEqual([{ path: ['toRunId'], code: 'same_run' }]);
    });

    it.each([[1], [2]])('a suite that repeats one resolved revision keeps every item: a regression confined to ordinal %i is in the diff and its counts', async (regressed) => {
      const d = await datasetWith([['R-1', 'PASS']]);
      const suite = await makeSuite([{ datasetId: d.ds.id }, { datasetId: d.ds.id, datasetRevisionId: d.revision.id }]);
      const r1 = await run(suite.id);
      const r2 = await run(suite.id);
      expect(r1.outcome, JSON.stringify(r1)).toBe('ok');
      const idsOf = (a: Answer) => (a.data.items as { datasetRevisionId: string; requestId: string }[]);
      expect(idsOf(r1).map((x) => x.datasetRevisionId)).toEqual([d.revision.id, d.revision.id]);
      for (const item of idsOf(r1)) await seedResult(item.requestId, [['R-1', 'PASS']]);
      for (const [index, item] of idsOf(r2).entries()) await seedResult(item.requestId, [['R-1', index + 1 === regressed ? 'FAIL' : 'PASS']]);
      const a = await diff(r1.data.suiteRunId, r2.data.suiteRunId);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data.revisions.map((x: { from: { ordinal: number }; diffCounts: Row }) => [x.from.ordinal, x.diffCounts.worsened, x.diffCounts.same])).toEqual([
        [1, regressed === 1 ? 1 : 0, regressed === 1 ? 0 : 1],
        [2, regressed === 2 ? 1 : 0, regressed === 2 ? 0 : 1],
      ]);
      expect(a.data.diffs.rows.map((r: { ordinal: number; ruleId: string; kind: string }) => [r.ordinal, r.ruleId, r.kind])).toEqual([[regressed, 'R-1', 'worsened']]);
      expect(a.data.diffs.total).toBe(1);
    });

    it('refuses two runs of different suites even when they hold the same revisions', async () => {
      const d = await datasetWith([['R-1', 'PASS']]);
      const s1 = await makeSuite([{ datasetId: d.ds.id }]);
      const s2 = await makeSuite([{ datasetId: d.ds.id }]);
      const r1 = await run(s1.id);
      const r2 = await run(s2.id);
      expect((await diff(r1.data.suiteRunId, r2.data.suiteRunId)).data.fieldErrors).toEqual([{ path: ['toRunId'], code: 'revision_mismatch' }]);
    });

    it('unknown, other-workspace and private-dataset runs are the same absence; the owner may diff their own', async () => {
      const t = await twoRuns([['R-1', 'PASS']], [['R-1', 'FAIL']]);
      expect(await diff(t.from, randomUUID())).toMatchObject({ outcome: 'ok', data: null });
      const priv = await datasetWith([['R-1', 'PASS']], undefined, { shareScope: 'private' });
      const suite = await makeSuite([{ datasetId: priv.ds.id }], {}, privOwner);
      const p1 = await run(suite.id, privOwner);
      const p2 = await run(suite.id, privOwner);
      for (const who of [runner, admin, grantee]) expect(await diff(p1.data.suiteRunId, p2.data.suiteRunId, who), who.id).toMatchObject({ outcome: 'ok', data: null });
      expect((await diff(p1.data.suiteRunId, p2.data.suiteRunId, privOwner)).data.revisions).toHaveLength(1);
      expect((await diff(p1.data.suiteRunId, t.to, runner)).data).toBeNull();
    });
  });

  // ============================================================================================================
  describe('session-only: tokens are refused for both reads and the label write', () => {
    const tokenIds: string[] = [];
    async function rawToken(kind: 'personal' | 'service', scopes: string[]): Promise<string> {
      let ownerId = admin.id;
      if (kind === 'service') {
        const externalId = `${TAG}-sys-${n++}`;
        ownerId = (await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`, [WORKSPACE_ID, externalId, `${externalId}@local`])).rows[0].id as string;
        actorIds.push(ownerId);
      }
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      const res = await sql(
        `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by) values ($1,$2,$3,'raw',$4,$5,$6,null,null,$7) returning id`,
        [WORKSPACE_ID, ownerId, kind, prefix, hashToken(value), scopes, kind === 'personal' ? ownerId : admin.id],
      );
      tokenIds.push(res.rows[0].id as string);
      return value;
    }
    const bearer = (value: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${value}` });
    // Own client address: token calls that do not resolve to an Actor key the global limiter by IP (shared by every test file of the run).
    const TOKEN_IP = '10.77.0.2';
    const tokenCall = async (value: string, url: string, payload: Record<string, unknown>): Promise<Answer> => {
      const res = await withPort.inject({ method: 'POST', remoteAddress: TOKEN_IP, url, headers: bearer(value), payload: JSON.stringify(payload) });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>();
    };
    afterAll(async () => {
      if (tokenIds.length > 0) await sql('delete from core.api_tokens where id = any($1)', [tokenIds]);
    });

    it.each([
      ['a personal token', 'personal' as const],
      ['a service token', 'service' as const],
    ])('%s holding dataset.manage and workspace.read is refused for comparison, rerunDiff and reviewLabelAdd', async (_label, kind) => {
      const token = await rawToken(kind, ['dataset.manage', 'workspace.read']);
      const s = await scenario([['R-1', 'PASS']]);
      await seedResult(s.requestId, [['R-1', 'FAIL']]);
      const again = await run(s.suite.id);
      await sql('delete from core.rate_limits');
      expect((await tokenCall(token, '/api/v1/menu-query', { endpoint: 'logDataset.comparison', context: {}, params: { suiteRunId: s.runId } })).outcome).toBe('forbidden');
      await sql('delete from core.rate_limits');
      expect((await tokenCall(token, '/api/v1/menu-query', { endpoint: 'logDataset.rerunDiff', context: {}, params: { fromRunId: s.runId, toRunId: again.data.suiteRunId } })).outcome).toBe('forbidden');
      await sql('delete from core.rate_limits');
      expect((await tokenCall(token, '/api/v1/menu-action', { action: 'logDataset.reviewLabelAdd', context: {}, input: labelInput(s), idempotencyKey: randomUUID() })).outcome).toBe('forbidden');
      expect(await labelRows(s.runId)).toHaveLength(0);
    });
  });

  // ============================================================================================================
  describe('through the real worker REST', () => {
    it('a result the reference worker sent is compared: claim, post the result, read the comparison', async () => {
      const s = await scenario([['R-1', 'PASS'], ['R-2', 'PASS']]);
      const claimed = (await claim()).json();
      expect(claimed.request.id).toBe(s.requestId);
      await finish(claimed, [rule('R-1', 'PASS'), rule('R-2', 'FAIL')]);
      const a = await compare(s.runId, user);
      expect(byRule(a)).toEqual({ 'R-1': 'unchanged', 'R-2': 'regressed' });
      expect(a.data.items[0].observed).toMatchObject({ attemptNo: 1 });
    });
  });
});
