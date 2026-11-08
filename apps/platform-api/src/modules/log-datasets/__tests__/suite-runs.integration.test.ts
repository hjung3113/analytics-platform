// #1479 D-c — regression suites and suite runs, and the request subject extension (ADR-0117 amendment): suiteCreate / suiteUpdate / suiteRun,
// the reads suites / suiteDetail / suiteRuns, the lifecycle claim for a Round AND a suite run item subject, the DB walls (subject XOR,
// immutable runs), the per-user run cap, idempotency, pinning, derived state and excerpt retention — through the real `buildServer` over
// `menu-action` / `menu-query` and the worker REST, against a real Postgres (throwaway DB only; app as platform_app, fixtures as
// platform_migrate). Needs migration 0114. Two servers share the database: one with a mock Source port, one with none.

import { randomUUID } from 'node:crypto';

import { validationClaimResponseSchema } from '@ap/contract-schemas';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { purgeExpiredExcerpts } from '../../log-lifecycle/excerpt-purge-job.js';
import { toCodeKey } from '../../log-knowledge/domain/code-key.js';
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

describe.skipIf(!runIntegration)('regression suites and suite runs (#1479 D-c)', () => {
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
  let vendorId = '';
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
  /** A shared dataset with one revision and an approved baseline. */
  async function approvedDataset(names?: string[], over: Record<string, unknown> = {}) {
    const isPrivate = over.shareScope === 'private'; // a private dataset is its owner's alone, so the owner does every step
    const who = isPrivate ? privOwner : grantee;
    const ds = await makeDataset(isPrivate ? privOwner : admin, over);
    const revision = await makeRevision(ds.id, names, who);
    const baselineId = await approveBaseline(revision, who, isPrivate ? privOwner : approver);
    return { ds, revision, baselineId };
  }
  async function makeSuite(items: Record<string, unknown>[], over: Record<string, unknown> = {}, who: Person = grantee) {
    const a = await act('suiteCreate', { name: `${TAG}-suite-${n++}`, items, ...over }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.suiteId as string, version: a.data.version as string };
  }
  const run = (suiteId: string, who: Person = runner, key: string = randomUUID(), app: FastifyInstance = withPort) => actOn(app, 'suiteRun', { suiteId, idempotencyKey: key }, who);
  const runs = (suiteId: string, who: Person = runner, app: FastifyInstance = withPort) => read('suiteRuns', { suiteId }, who, app);
  const requestRow = async (id: string) => (await sql('select * from log_lifecycle.execution_request where id = $1', [id])).rows[0] as Row;
  const runCount = async (suiteId: string) => Number((await sql('select count(*)::int as c from log_datasets.suite_run where suite_id = $1', [suiteId])).rows[0].c);

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
    const cols = { workspace_id: WORKSPACE_ID, code: `${TAG}-v`, code_key: toCodeKey(`${TAG}-v`), name: `${TAG}-v`, created_by: admin.id, updated_by: admin.id };
    vendorId = (await sql(`insert into knowledge.vendor (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols))).rows[0].id as string;
  }, 90_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const [table, trigger] of [
        ['log_lifecycle.rule_result_excerpt', 'rule_result_excerpt_no_delete'],
        ['log_lifecycle.rule_result_evidence', 'rule_result_evidence_append_only'],
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
      await client.query('delete from log_datasets.suite_run_item where workspace_id = $1', [WORKSPACE_ID]);
      await client.query('delete from log_datasets.suite_run where workspace_id = any($1)', [[WORKSPACE_ID, ...workspaceIds]]);
      await client.query('delete from log_datasets.regression_suite where created_by = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('delete from log_datasets.baseline_event where actor_id = any($1)', [actorIds]);
      await client.query('delete from log_datasets.expected_baseline where author_actor_id = any($1)', [actorIds]);
      await client.query('delete from log_datasets.dataset_revision where created_by = any($1)', [actorIds]);
      await client.query('delete from log_datasets.dataset where created_by = any($1)', [actorIds]);
      for (const [table, trigger] of [
        ['log_lifecycle.rule_result_excerpt', 'rule_result_excerpt_no_delete'],
        ['log_lifecycle.rule_result_evidence', 'rule_result_evidence_append_only'],
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

  // ============================================================================================================
  describe('suiteCreate / suiteUpdate', () => {
    it('needs dataset.manage; a User and a Developer without the grant are refused; Admin and a grantee may write', async () => {
      const a = await approvedDataset();
      const items = [{ datasetId: a.ds.id }];
      expect((await act('suiteCreate', { name: `${TAG}-x`, items }, user)).outcome).toBe('forbidden');
      expect((await act('suiteCreate', { name: `${TAG}-x`, items }, developer)).outcome).toBe('forbidden');
      expect((await act('suiteCreate', { name: `${TAG}-x`, items }, runner)).outcome).toBe('forbidden');
      expect((await act('suiteCreate', { name: `${TAG}-x`, items }, admin)).outcome).toBe('ok');
      expect((await act('suiteCreate', { name: `${TAG}-x`, items }, grantee)).outcome).toBe('ok');
    });

    it('stores the suite and writes one body-free audit row in the same transaction', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id, datasetRevisionId: a.revision.id }], { engineProfileRef: 'profile-1', requiredPin: { ruleSetRevision: '5' } });
      const row = (await sql('select * from log_datasets.regression_suite where id = $1', [suite.id])).rows[0] as Row;
      expect(row).toMatchObject({ engine_profile_ref: 'profile-1', row_version: 1, created_by: grantee.id });
      expect(row.items).toEqual([{ datasetId: a.ds.id, datasetRevisionId: a.revision.id }]);
      const events = await audit(suite.id);
      expect(events.map((e) => [e.event_type, e.subject_type, e.detail])).toEqual([['dataset.suite_created', 'regression_suite', { itemCount: 1, hasEngineProfile: true, hasRequiredPin: true }]]);
      expect(JSON.stringify(events)).not.toContain(a.ds.id);
    });

    it.each([
      ['no item', { items: [] }, ['items:required']],
      ['too many items', { items: Array.from({ length: 21 }, () => ({ datasetId: randomUUID() })) }, ['items:too_many']],
      ['the same dataset twice unpinned', { items: [{ datasetId: '00000000-0000-4000-8000-000000000001' }, { datasetId: '00000000-0000-4000-8000-000000000001' }] }, ['items:duplicate']],
      ['an unknown item key', { items: [{ datasetId: randomUUID(), command: 'rm -rf' }] }, ['items.0:malformed']],
      ['a malformed dataset id', { items: [{ datasetId: 'nope' }] }, ['items.0.datasetId:malformed']],
      ['an overlong engine profile', { items: [{ datasetId: randomUUID() }], engineProfileRef: 'x'.repeat(201) }, ['engineProfileRef:too_long']],
    ])('refuses %s', async (_label, input, expected) => {
      const a = await act('suiteCreate', { name: `${TAG}-v`, ...input }, grantee);
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(expected);
    });

    it('refuses a dataset the actor cannot see or that is of another workspace, as not_found; a revision or baseline of another dataset too', async () => {
      const mine = await approvedDataset();
      const other = await approvedDataset();
      const priv = await makeDataset(admin, { shareScope: 'private' });
      const foreignDataset = (await sql(`insert into log_datasets.dataset (workspace_id, name, owner_actor_id, share_scope, created_by, updated_by) values ($1,$2,$3,'workspace',$3,$3) returning id`, [otherWorkspace, `${TAG}-fd`, foreignActor])).rows[0].id as string;
      const a = await act(
        'suiteCreate',
        { name: `${TAG}-v`, items: [{ datasetId: priv.id }, { datasetId: foreignDataset }, { datasetId: mine.ds.id, datasetRevisionId: other.revision.id }, { datasetId: other.ds.id, baselineId: mine.baselineId }, { datasetId: randomUUID() }] },
        grantee,
      );
      expect(fe(a)).toEqual(['items.0.datasetId:not_found', 'items.1.datasetId:not_found', 'items.2.datasetRevisionId:not_found', 'items.3.baselineId:not_found', 'items.4.datasetId:not_found']);
    });

    it('suiteUpdate: version-checked, changes only what is sent, a save that changes nothing writes no audit row, and stale versions conflict', async () => {
      const a = await approvedDataset();
      const b = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const same = await act('suiteUpdate', { id: suite.id, name: (await sql('select name from log_datasets.regression_suite where id = $1', [suite.id])).rows[0].name }, grantee, suite.version);
      expect(same.outcome).toBe('ok');
      expect(same.version).toBe('1');
      expect((await audit(suite.id)).map((e) => e.event_type)).toEqual(['dataset.suite_created']);
      const changed = await act('suiteUpdate', { id: suite.id, name: `${TAG}-renamed`, items: [{ datasetId: a.ds.id }, { datasetId: b.ds.id }], engineProfileRef: 'p2' }, grantee, '1');
      expect(changed.outcome, JSON.stringify(changed)).toBe('ok');
      expect(changed.version).toBe('2');
      expect(await audit(suite.id).then((e) => e.at(-1))).toMatchObject({ event_type: 'dataset.suite_updated', detail: { changed: ['name', 'items', 'engineProfileRef'], itemCount: 2 } });
      expect((await act('suiteUpdate', { id: suite.id, name: `${TAG}-late` }, grantee, '1')).outcome).toBe('conflict');
      const cleared = await act('suiteUpdate', { id: suite.id, engineProfileRef: null }, grantee, '2');
      expect(cleared.outcome).toBe('ok');
      expect((await sql('select engine_profile_ref from log_datasets.regression_suite where id = $1', [suite.id])).rows[0].engine_profile_ref).toBeNull();
      expect((await act('suiteUpdate', { id: foreignSuite, name: 'x' }, grantee, '1')).outcome).toBe('not_found');
      expect(fe(await act('suiteUpdate', { id: suite.id, items: [{ datasetId: randomUUID() }] }, grantee, '3'))).toEqual(['items.0.datasetId:not_found']);
    });
  });

  // ============================================================================================================
  describe('suiteRun', () => {
    it('needs dataset.suite.run: a User, a Developer without it and a dataset.manage grantee are refused; Admin and a grantee run', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      for (const who of [user, developer, grantee]) expect((await run(suite.id, who)).outcome).toBe('forbidden');
      expect(await runCount(suite.id)).toBe(0);
      expect((await run(suite.id, admin)).outcome).toBe('ok');
      expect((await run(suite.id, runner)).outcome).toBe('ok');
    });

    it('a grantee demoted to User keeps the grant row but can no longer run, and bootstrap stops listing dataset:suite-run', async () => {
      const demoted = await person('developer');
      await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'dataset.suite.run',null,$3)`, [WORKSPACE_ID, demoted.id, admin.id]);
      const listed = async () =>
        (await withPort.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(demoted.cookie) })).json<{ session: { user: { permissions: string[] } } }>().session.user.permissions.includes('dataset:suite-run');
      expect(await listed()).toBe(true);
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      await sql(`update core.actors set role_level = 'user' where id = $1`, [demoted.id]);
      expect((await run(suite.id, demoted)).outcome).toBe('forbidden');
      expect(await runCount(suite.id)).toBe(0);
      expect(await listed()).toBe(false);
    });

    it('PINS the resolved revision, baseline and digests: an omitted revision is the latest approved baseline\'s revision; later approvals never change an earlier run', async () => {
      const a = await approvedDataset(['p1.log']);
      const rev2 = await makeRevision(a.ds.id, ['p2.log']); // a newer revision WITHOUT an approved baseline: not chosen
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const first = await run(suite.id);
      expect(first.outcome, JSON.stringify(first)).toBe('ok');
      expect(first.data).toMatchObject({ replayed: false, itemCount: 1 });
      const item1 = (await sql('select * from log_datasets.suite_run_item where suite_run_id = $1', [first.data.suiteRunId])).rows[0] as Row;
      expect(item1).toMatchObject({ dataset_id: a.ds.id, dataset_revision_id: a.revision.id, baseline_id: a.baselineId, sample_manifest_digest: a.revision.digest });
      expect(String(item1.baseline_digest)).toMatch(/^[0-9a-f]{64}$/);
      // The newer revision gets an approved baseline: the NEXT run pins it, the first stays.
      const baseline2 = await approveBaseline(rev2);
      const second = await run(suite.id);
      const item2 = (await sql('select * from log_datasets.suite_run_item where suite_run_id = $1', [second.data.suiteRunId])).rows[0] as Row;
      expect(item2).toMatchObject({ dataset_revision_id: rev2.id, baseline_id: baseline2, sample_manifest_digest: rev2.digest });
      expect((await sql('select dataset_revision_id, baseline_id from log_datasets.suite_run_item where id = $1', [item1.id])).rows[0]).toEqual({ dataset_revision_id: a.revision.id, baseline_id: a.baselineId });
      // The suite's profile is snapshotted too.
      await act('suiteUpdate', { id: suite.id, engineProfileRef: 'changed-later' }, grantee, suite.version);
      expect((await sql('select engine_profile_ref from log_datasets.suite_run where id = $1', [first.data.suiteRunId])).rows[0].engine_profile_ref).toBeNull();
    });

    it('a named revision / baseline is honoured; a baseline that is not approved (draft, superseded) refuses the run', async () => {
      const a = await approvedDataset(['n1.log']);
      const draft = await act('baselineDraftCreate', { datasetRevisionId: a.revision.id }, grantee);
      const named = await makeSuite([{ datasetId: a.ds.id, datasetRevisionId: a.revision.id, baselineId: a.baselineId }]);
      expect((await run(named.id)).outcome).toBe('ok');
      const notApproved = await makeSuite([{ datasetId: a.ds.id, baselineId: draft.data.baselineId }]);
      expect(fe(await run(notApproved.id))).toEqual(['items.0.datasetId:baseline_not_approved']);
      const second = await act('baselineUpdateDraft', { id: draft.data.baselineId, expectedScope: ['R-2'], expectations: [{ ruleId: 'R-2', expected: 'PASS' }] }, grantee, draft.data.version as string);
      await act('baselineApprove', { id: draft.data.baselineId, reason: 'newer' }, approver, second.version); // supersedes a.baselineId
      const superseded = await makeSuite([{ datasetId: a.ds.id, baselineId: a.baselineId }]);
      expect(fe(await run(superseded.id))).toEqual(['items.0.datasetId:baseline_not_approved']);
    });

    it('an item that cannot run (no approved baseline, archived dataset, vanished/private dataset) refuses the WHOLE run: no run, no request', async () => {
      const ok = await approvedDataset();
      const noBaseline = await makeDataset(admin);
      await makeRevision(noBaseline.id);
      const toArchive = await approvedDataset();
      const suite = await makeSuite([{ datasetId: ok.ds.id }, { datasetId: noBaseline.id }, { datasetId: toArchive.ds.id }], {}, admin);
      await act('datasetArchive', { id: toArchive.ds.id }, grantee, (await sql('select row_version from log_datasets.dataset where id = $1', [toArchive.ds.id])).rows[0].row_version.toString());
      const before = Number((await sql('select count(*)::int as c from log_lifecycle.execution_request where workspace_id = $1', [WORKSPACE_ID])).rows[0].c);
      const refused = await run(suite.id, admin);
      expect(refused.outcome).toBe('invalid');
      expect(fe(refused)).toEqual(['items.1.datasetId:no_approved_baseline', 'items.2.datasetId:archived']);
      expect(await runCount(suite.id)).toBe(0);
      expect(Number((await sql('select count(*)::int as c from log_lifecycle.execution_request where workspace_id = $1', [WORKSPACE_ID])).rows[0].c)).toBe(before);
    });

    it('is idempotent by (suite, actor, key): the same key answers the same run and writes and audits nothing more; another key or another actor starts a new run', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const key = randomUUID();
      const first = await run(suite.id, runner, key);
      const again = await run(suite.id, runner, key);
      expect(again.data).toMatchObject({ suiteRunId: first.data.suiteRunId, replayed: true, itemCount: 1 });
      expect(again.data.items[0].requestId).toBe(first.data.items[0].requestId);
      expect(await runCount(suite.id)).toBe(1);
      expect((await audit(first.data.suiteRunId)).map((e) => e.event_type)).toEqual(['dataset.suite_run_requested']);
      expect((await run(suite.id, runner2, key)).data.suiteRunId).not.toBe(first.data.suiteRunId);
      expect((await run(suite.id, runner)).data.suiteRunId).not.toBe(first.data.suiteRunId);
      // Two simultaneous calls with one key: one run, both answers name it.
      const racing = randomUUID();
      const pair = await Promise.all([run(suite.id, runner2, racing), run(suite.id, runner2, racing)]);
      expect(pair.map((p) => p.outcome)).toEqual(['ok', 'ok']);
      expect(new Set(pair.map((p) => p.data.suiteRunId)).size).toBe(1);
      expect(Number((await sql('select count(*)::int as c from log_datasets.suite_run where suite_id = $1 and idempotency_key = $2', [suite.id, racing])).rows[0].c)).toBe(1);
    });

    it('caps a user\'s concurrent runs at 3 (counted from the derived states, under a per-user lock), frees a slot when a run ends, and counts users apart', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      for (let i = 0; i < 3; i += 1) expect((await run(suite.id, runner)).outcome).toBe('ok');
      const fourth = await run(suite.id, runner);
      expect(fourth.outcome).toBe('invalid');
      expect(fe(fourth)).toEqual(['suiteId:suite.run_limit']);
      expect(await runCount(suite.id)).toBe(3);
      expect((await run(suite.id, runner2)).outcome).toBe('ok'); // another user: own count
      // The oldest run ends (its request is cancelled): its slot is free again.
      const oldest = (await runs(suite.id, runner)).data.rows.at(-1);
      await sql(`update log_lifecycle.execution_request set state = 'cancelled', ended_at = now(), row_version = row_version + 1 where id = $1`, [(oldest.items[0] as { requestId: string }).requestId]);
      expect((await run(suite.id, runner)).outcome).toBe('ok');
    });

    it('the cap holds under concurrency: five simultaneous distinct-key runs give exactly three runs', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const answers = await Promise.all(Array.from({ length: 5 }, () => run(suite.id, runner2)));
      expect(answers.filter((x) => x.outcome === 'ok')).toHaveLength(3);
      expect(answers.filter((x) => x.outcome === 'invalid').map(fe)).toEqual([['suiteId:suite.run_limit'], ['suiteId:suite.run_limit']]);
      expect(await runCount(suite.id)).toBe(3);
    });

    it('a stale baseline does not block: the run records the badge; the audit row carries counts, not names', async () => {
      const a = await approvedDataset(['s1.log']);
      for (const f of a.revision.set.files) portAnswers[f.fileRef] = { status: 'ok', sha256: H('f') }; // the file changed at the Source
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const r = await run(suite.id);
      expect(r.outcome, JSON.stringify(r)).toBe('ok');
      const item = (await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [r.data.suiteRunId])).rows[0] as Row;
      expect(item.baseline_stale).toEqual({ state: 'stale', reasons: ['file_hash_changed'], unknown: [] });
      expect((await audit(r.data.suiteRunId))[0]).toMatchObject({ event_type: 'dataset.suite_run_requested', subject_type: 'suite_run', detail: { suiteId: suite.id, itemCount: 1, stale: { fresh: 0, stale: 1, unknown: 0 }, activeRuns: 0 } });
      const listed = (await runs(suite.id)).data.rows[0];
      expect(listed.items[0].baselineStale.state).toBe('stale');
      // Matching hashes: fresh.
      for (const f of a.revision.set.files) portAnswers[f.fileRef] = { status: 'ok', sha256: f.sha256 };
      const r2 = await run(suite.id);
      expect((await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [r2.data.suiteRunId])).rows[0].baseline_stale).toEqual({ state: 'fresh', reasons: [], unknown: [] });
    });

    it('the Source-owner ACL comes first: denied = no Source call and the badge is unknown; no port = unknown; an adapter that throws = unknown with no error text kept', async () => {
      const a = await approvedDataset(['o1.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      ownerAllowed = false;
      portCalls.length = 0;
      const denied = await run(suite.id);
      expect(portCalls).toEqual([]);
      expect((await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [denied.data.suiteRunId])).rows[0].baseline_stale).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      ownerAllowed = true;
      const none = await run(suite.id, runner, randomUUID(), noPort);
      expect((await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [none.data.suiteRunId])).rows[0].baseline_stale).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      portAnswers[at(a.revision.set.files, 0).fileRef] = 'throw';
      const threw = await run(suite.id, runner2);
      expect(threw.outcome).toBe('ok');
      expect(JSON.stringify((await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [threw.data.suiteRunId])).rows)).not.toContain('SECRET-LINE-TEXT');
    });

    it('a Source adapter that never settles is bounded by the deadline: the run is still requested, the badge unknown', async () => {
      const a = await approvedDataset(['h1.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const hang = { ...mockPort, describeFile: () => new Promise<never>(() => {}) };
      const hung = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => SATURDAY_NOON, logDatasets: { sourceRead: hang, sourceOwnerAccess: { allows: async () => true } } });
      try {
        const started = Date.now();
        const r = await run(suite.id, runner, randomUUID(), hung);
        expect(r.outcome, JSON.stringify(r)).toBe('ok');
        expect(Date.now() - started).toBeLessThan(15_000);
        expect((await sql('select baseline_stale from log_datasets.suite_run_item where suite_run_id = $1', [r.data.suiteRunId])).rows[0].baseline_stale).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      } finally {
        await hung.close();
      }
    }, 40_000);

    it('never changes a baseline from results: after a full run with a FAIL result the baseline is still approved with its row_version', async () => {
      const a = await approvedDataset(['b1.log']);
      const before = (await sql('select status, row_version, expectations from log_datasets.expected_baseline where id = $1', [a.baselineId])).rows[0];
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      await run(suite.id);
      const claimed = (await claim()).json();
      await finish(claimed, [rule('R-1', 'FAIL')]);
      expect((await sql('select status, row_version, expectations from log_datasets.expected_baseline where id = $1', [a.baselineId])).rows[0]).toEqual(before);
    });
  });

  // ============================================================================================================
  describe('claim: both request subjects (ADR-0117 amendment)', () => {
    it('a suite run item request is claimed with the pinned sample list of its revision; the response satisfies the worker contract; roundId is null', async () => {
      const a = await approvedDataset(['c1.log', 'c2.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }], { engineProfileRef: 'engine-x' });
      const r = await run(suite.id);
      const itemId = (await sql('select id from log_datasets.suite_run_item where suite_run_id = $1', [r.data.suiteRunId])).rows[0].id as string;
      const requestRowBefore = await requestRow(r.data.items[0].requestId);
      expect(requestRowBefore).toMatchObject({ round_id: null, suite_run_item_id: itemId, suite_run_id: r.data.suiteRunId, priority: 0, immediate: false, engine_profile_ref: 'engine-x', state: 'queued' });
      const res = await claim();
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      expect(validationClaimResponseSchema.safeParse(body).success, JSON.stringify(validationClaimResponseSchema.safeParse(body))).toBe(true);
      expect(body.request).toMatchObject({
        id: r.data.items[0].requestId,
        roundId: null,
        suiteRunItemId: itemId,
        engineProfileRef: 'engine-x',
        sampleManifestDigest: a.revision.digest,
        sampleSet: { sourceOwner: a.revision.set.sourceOwner, files: a.revision.set.files },
        specPin: null,
      });
      expect((await sql('select input_manifest_digest from log_lifecycle.execution_attempt where request_id = $1', [body.request.id])).rows[0].input_manifest_digest).toBe(a.revision.digest);
    });

    it('a Round request is claimed exactly as before: roundId set, suiteRunItemId null, the same worker contract', async () => {
      const modelCols = { workspace_id: WORKSPACE_ID, code: `${TAG}-m${n++}`, vendor_id: vendorId, created_by: admin.id, updated_by: admin.id };
      const modelId = (await sql(`insert into knowledge.equipment_model (workspace_id, code, code_key, name, vendor_id, created_by, updated_by) values ($1,$2,$3,$2,$4,$5,$5) returning id`, [WORKSPACE_ID, modelCols.code, toCodeKey(modelCols.code), vendorId, admin.id])).rows[0].id as string;
      const project = await actOn(withPort, 'projectCreate', { modelId, kind: 'new', ownerActorId: projectOwner.id }, admin, undefined, 'logLifecycle');
      expect(project.outcome, JSON.stringify(project)).toBe('ok');
      const set = sampleSet('r1.log', 'r2.log');
      const round = await actOn(withPort, 'roundOpen', { projectId: project.data.projectId, sampleSet: set }, admin, undefined, 'logLifecycle');
      expect(round.outcome, JSON.stringify(round)).toBe('ok');
      const request = await actOn(withPort, 'requestCreate', { roundId: round.data.roundId, priority: 1 }, admin, undefined, 'logLifecycle');
      expect(request.outcome, JSON.stringify(request)).toBe('ok');
      const res = await claim();
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      expect(validationClaimResponseSchema.safeParse(body).success).toBe(true);
      expect(body.request).toMatchObject({ id: request.data.requestId, roundId: round.data.roundId, suiteRunItemId: null });
      expect(body.request.sampleSet.files).toEqual(set.files);
      // The Round list read never shows a suite subject, and a Round-only cancel does not see one.
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const r = await run(suite.id);
      const listed = await actOn(withPort, 'requestCancel', { id: r.data.items[0].requestId, reason: 'x' }, admin, '1', 'logLifecycle');
      expect(listed.outcome).toBe('not_found');
      expect((await requestRow(r.data.items[0].requestId)).state).toBe('queued');
    });

    it('result and fail work for a suite subject: evidence is checked against the pinned sample list and the verdict is the server\'s', async () => {
      const a = await approvedDataset(['v1.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }, ...[]]);
      await run(suite.id);
      const claimed = (await claim()).json();
      const bad = await post(`/requests/${claimed.request.id}/result`, { attemptNo: 1, inputManifestDigest: claimed.request.sampleManifestDigest, results: [rule('R-1', 'FAIL', { evidence: [{ fileRef: ref('not-in-sample.log'), line: 1, fileSha256: H('a') }] })] });
      expect(bad.statusCode).toBe(422);
      const good = await post(`/requests/${claimed.request.id}/result`, {
        attemptNo: 1,
        inputManifestDigest: claimed.request.sampleManifestDigest,
        results: [rule('R-1', 'PASS')],
      });
      expect(good.statusCode, good.body).toBe(200);
      expect(good.json()).toMatchObject({ state: 'succeeded', verdict: 'pass' });
      // A digest that differs from the pinned manifest makes the verdict incomplete.
      const b = await approvedDataset(['v2.log']);
      const suite2 = await makeSuite([{ datasetId: b.ds.id }]);
      await run(suite2.id);
      const claimed2 = (await claim()).json();
      const wrong = await post(`/requests/${claimed2.request.id}/result`, { attemptNo: 1, inputManifestDigest: H('9'), results: [rule('R-1', 'PASS')] });
      expect(wrong.json()).toMatchObject({ verdict: 'incomplete' });
    });
  });

  // ============================================================================================================
  describe('derived state, reads and visibility', () => {
    it('the run state is derived from the request states: queued -> running -> succeeded | failed, with counts; nothing is stored', async () => {
      const a = await approvedDataset(['d1.log']);
      const b = await approvedDataset(['d2.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }, { datasetId: b.ds.id }]);
      const r = await run(suite.id);
      const state = async () => (await runs(suite.id)).data.rows.find((x: { id: string }) => x.id === r.data.suiteRunId);
      expect(await state()).toMatchObject({ state: 'queued', counts: { queued: 2, claimed: 0, succeeded: 0, failed: 0, cancelled: 0, expired: 0 } });
      const c1 = (await claim()).json();
      expect(await state()).toMatchObject({ state: 'running', counts: { queued: 1, claimed: 1 } });
      await finish(c1, [rule('R-1', 'PASS')]);
      expect(await state()).toMatchObject({ state: 'running', counts: { queued: 1, succeeded: 1 } });
      const c2 = (await claim()).json();
      const failed = await post(`/requests/${c2.request.id}/fail`, { attemptNo: 1, reason: 'validator crashed' });
      expect(failed.statusCode, failed.body).toBe(200);
      expect(await state()).toMatchObject({ state: 'failed', counts: { succeeded: 1, failed: 1 } });
      expect((await state()).items.map((i: { requestState: string }) => i.requestState).sort()).toEqual(['failed', 'succeeded']);
      // No column of the run tables stores a state.
      const cols = (await sql(`select column_name from information_schema.columns where table_schema = 'log_datasets' and table_name in ('suite_run','suite_run_item') and column_name like '%state%'`)).rows;
      expect(cols.map((c) => c.column_name)).toEqual(['baseline_stale'].filter((c) => c.includes('state')));
      // All succeeded -> succeeded; all cancelled -> cancelled.
      const ok = await run(suite.id);
      for (let i = 0; i < 2; i += 1) await finish((await claim()).json(), [rule('R-1', 'PASS')]);
      expect((await runs(suite.id)).data.rows.find((x: { id: string }) => x.id === ok.data.suiteRunId).state).toBe('succeeded');
      const cancelled = await run(suite.id);
      await sql(`update log_lifecycle.execution_request set state = 'cancelled', ended_at = now(), row_version = row_version + 1 where suite_run_id = $1`, [cancelled.data.suiteRunId]);
      expect((await runs(suite.id)).data.rows.find((x: { id: string }) => x.id === cancelled.data.suiteRunId).state).toBe('cancelled');
    });

    it('suites lists with paging and search; suiteDetail shows what each item resolves to now; suiteRuns pages newest first; reads carry no log text', async () => {
      const a = await approvedDataset(['l1.log']);
      const noBaseline = await makeDataset(admin);
      const suite = await makeSuite([{ datasetId: a.ds.id }, { datasetId: noBaseline.id }], { engineProfileRef: 'eng' });
      const listed = await read('suites', { q: suite.id === '' ? '' : `${TAG}-suite`, pageSize: 100 }, user);
      expect(listed.data.rows.find((x: { id: string }) => x.id === suite.id)).toMatchObject({ itemCount: 2, engineProfileRef: 'eng', lastRunAt: null, version: '1' });
      expect((await read('suites', { q: 'zzz-no-such-suite' }, user)).data).toMatchObject({ total: 0, rows: [] });
      const detail = await read('suiteDetail', { suiteId: suite.id }, user);
      expect(detail.data.items).toEqual([
        expect.objectContaining({ ordinal: 1, restricted: false, datasetId: a.ds.id, resolvesTo: { ok: true, revisionId: a.revision.id, revisionSeq: 1, baselineId: a.baselineId, baselineSeq: 1 } }),
        expect.objectContaining({ ordinal: 2, restricted: false, datasetId: noBaseline.id, resolvesTo: { ok: false, problem: 'no_approved_baseline' } }),
      ]);
      const ok = await makeSuite([{ datasetId: a.ds.id }]);
      const r1 = await run(ok.id);
      const r2 = await run(ok.id);
      const page = await read('suiteRuns', { suiteId: ok.id, pageSize: 1 }, user);
      expect(page.data.total).toBe(2);
      expect(page.data.rows.map((x: { id: string }) => x.id)).toEqual([r2.data.suiteRunId]);
      expect((await read('suiteRuns', { suiteId: ok.id, pageSize: 1, page: 1 }, user)).data.rows.map((x: { id: string }) => x.id)).toEqual([r1.data.suiteRunId]);
      expect((await read('suites', { q: `${TAG}-suite` }, user)).data.rows.find((x: { id: string }) => x.id === ok.id).lastRunAt).not.toBeNull();
      expect(JSON.stringify(page.data)).not.toContain('SECRET');
      for (const bad of [{ suiteId: 'nope' }, { suiteId: ok.id, pageSize: 51 }, { suiteId: ok.id, page: -1 }, { suiteId: ok.id, extra: 1 }]) {
        expect((await read('suiteRuns', bad, user)).outcome).toBe('error');
      }
    });

    it('a private dataset\'s items are restricted for everyone else (no id, name or digest) in suiteDetail and suiteRuns; running the suite as someone who cannot see it writes nothing', async () => {
      const shared = await approvedDataset(['pv1.log']);
      const priv = await approvedDataset(['pv2.log'], { shareScope: 'private' }); // owned by privOwner
      const suite = await makeSuite([{ datasetId: shared.ds.id }, { datasetId: priv.ds.id }], {}, privOwner);
      const ownerRun = await run(suite.id, privOwner);
      expect(ownerRun.outcome, JSON.stringify(ownerRun)).toBe('ok');
      const detailOwner = await read('suiteDetail', { suiteId: suite.id }, privOwner);
      expect(detailOwner.data.items[1]).toMatchObject({ restricted: false, datasetId: priv.ds.id });
      const detail = await read('suiteDetail', { suiteId: suite.id }, user);
      expect(detail.data.items[1]).toEqual({ ordinal: 2, restricted: true });
      expect(detail.data.items[0]).toMatchObject({ restricted: false, datasetId: shared.ds.id });
      const seen = (await runs(suite.id, user)).data.rows[0];
      expect(seen.items[1]).toEqual({ ordinal: 2, restricted: true, requestState: 'queued', attemptCount: 0, latestVerdict: null });
      expect(JSON.stringify(seen)).not.toContain(priv.ds.id);
      expect(JSON.stringify(seen)).not.toContain(priv.revision.digest);
      const before = await runCount(suite.id);
      const refused = await run(suite.id, runner);
      expect(refused.outcome).toBe('invalid');
      expect(fe(refused)).toEqual(['items.1.datasetId:not_found']);
      expect(await runCount(suite.id)).toBe(before);
    });

    it('another workspace\'s suite is absent for reads and writes', async () => {
      expect((await read('suiteDetail', { suiteId: foreignSuite }, admin)).data).toBeNull();
      expect((await read('suiteRuns', { suiteId: foreignSuite }, admin)).data).toBeNull();
      expect((await read('suites', { q: `${TAG}-fs` }, admin)).data.total).toBe(0);
      const run404 = await run(foreignSuite, admin);
      expect(fe(run404)).toEqual(['suiteId:not_found']);
      expect((await act('suiteUpdate', { id: foreignSuite, name: 'x' }, admin, '1')).outcome).toBe('not_found');
    });

    it('no read or action accepts an unknown key; a run needs its idempotencyKey', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      expect((await act('suiteRun', { suiteId: suite.id, idempotencyKey: 'k', extra: 1 }, runner)).outcome).toBe('invalid');
      expect(fe(await act('suiteRun', { suiteId: suite.id }, runner))).toEqual(['idempotencyKey:required']);
      expect((await read('suiteDetail', { suiteId: suite.id, extra: 1 }, user)).outcome).toBe('error');
      expect((await read('suites', { nope: 1 }, user)).outcome).toBe('error');
    });
  });

  // ============================================================================================================
  describe('session-only: tokens are refused for reads and writes', () => {
    const tokenIds: string[] = [];
    async function rawToken(kind: 'personal' | 'service'): Promise<string> {
      let ownerId = runner.id;
      if (kind === 'service') {
        const externalId = `${TAG}-sys-${n++}`;
        ownerId = (await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`, [WORKSPACE_ID, externalId, `${externalId}@local`])).rows[0].id as string;
        actorIds.push(ownerId);
      }
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      const res = await sql(
        `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by) values ($1,$2,$3,'raw',$4,$5,$6,null,null,$7) returning id`,
        [WORKSPACE_ID, ownerId, kind, prefix, hashToken(value), ['dataset.manage', 'dataset.suite.run', 'workspace.read'], kind === 'personal' ? ownerId : admin.id],
      );
      tokenIds.push(res.rows[0].id as string);
      return value;
    }
    // Token requests use their own remote address (their rate-limit bucket) and a clean limiter.
    const call = async (url: string, value: string, payload: Record<string, unknown>, ip: string): Promise<Answer> => {
      await sql('delete from core.rate_limits');
      const res = await withPort.inject({ method: 'POST', remoteAddress: ip, url, headers: { 'content-type': 'application/json', authorization: `Bearer ${value}` }, payload: JSON.stringify(payload) });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>();
    };
    afterAll(async () => {
      if (tokenIds.length > 0) await sql('delete from core.api_tokens where id = any($1)', [tokenIds]);
    });

    it.each([['a personal token', 'personal' as const, '10.79.0.1'], ['a service token', 'service' as const, '10.79.0.2']])('%s, even with the legacy scopes inserted directly, is refused for reads, suiteCreate, suiteUpdate and suiteRun', async (_l, kind, ip) => {
      const token = await rawToken(kind);
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const act2 = (action: string, input: Record<string, unknown>, version?: string) =>
        call('/api/v1/menu-action', token, { action: `logDataset.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(version === undefined ? {} : { expectedVersion: version }) }, ip);
      const rd = (endpoint: string, params: Record<string, unknown>) => call('/api/v1/menu-query', token, { endpoint: `logDataset.${endpoint}`, context: {}, params }, ip);
      for (const [endpoint, params] of [['suites', {}], ['suiteDetail', { suiteId: suite.id }], ['suiteRuns', { suiteId: suite.id }]] as const) expect((await rd(endpoint, params)).outcome, endpoint).toBe('forbidden');
      expect((await act2('suiteCreate', { name: `${TAG}-t`, items: [{ datasetId: a.ds.id }] })).outcome).toBe('forbidden');
      expect((await act2('suiteUpdate', { id: suite.id, name: `${TAG}-t2` }, '1')).outcome).toBe('forbidden');
      expect((await act2('suiteRun', { suiteId: suite.id, idempotencyKey: 'tok' })).outcome).toBe('forbidden');
      expect(await runCount(suite.id)).toBe(0);
      expect((await sql('select name, row_version from log_datasets.regression_suite where id = $1', [suite.id])).rows[0]).toMatchObject({ row_version: 1 });
    });

    it('a token cannot be issued with the dataset.suite.run scope', async () => {
      const res = await withPort.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-scope`, scopes: ['dataset.suite.run'], expiresAt: null } });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('session_only');
    });
  });

  // ============================================================================================================
  describe('database walls', () => {
    const reqCols = `workspace_id, priority, immediate, request_digest, requested_by_actor_id, idempotency_key`;
    const reqVals = (key: string) => [WORKSPACE_ID, 1, false, H('a'), admin.id, `${TAG}-${key}`];
    const insertReq = (extraCols: string, extraVals: unknown[], key: string) => {
      const vals = [...reqVals(key), ...extraVals];
      return appSql(`insert into log_lifecycle.execution_request (${reqCols}${extraCols}) values (${vals.map((_, i) => `$${i + 1}`).join(',')})`, vals);
    };

    it('the request subject is a Round XOR a suite run item (DB CHECK): both, neither, a half-filled suite subject are refused', async () => {
      const roundId = randomUUID();
      const itemId = randomUUID();
      const runId = randomUUID();
      const set = JSON.stringify({ sourceOwner: 'x', files: [] });
      const subjectCheck = /execution_request_subject_check|violates (check|foreign key) constraint/;
      await expect(insertReq(', round_id, suite_run_item_id, suite_run_id, subject_sample_set, subject_sample_manifest_digest', [roundId, itemId, runId, set, H('a')], 'both')).rejects.toThrow(subjectCheck);
      await expect(insertReq('', [], 'neither')).rejects.toThrow(/execution_request_subject_check/);
      await expect(insertReq(', suite_run_item_id', [itemId], 'half')).rejects.toThrow(/execution_request_subject_check/);
      await expect(insertReq(', suite_run_item_id, suite_run_id, subject_sample_set', [itemId, runId, set], 'nodigest')).rejects.toThrow(/execution_request_subject_check/);
      await expect(insertReq(', round_id, subject_sample_set', [roundId, set], 'roundwithset')).rejects.toThrow(/execution_request_subject_check|foreign key/);
      // A bad pinned digest.
      await expect(insertReq(', suite_run_item_id, suite_run_id, subject_sample_set, subject_sample_manifest_digest', [itemId, runId, set, 'abc'], 'baddigest')).rejects.toThrow(/execution_request_subject_digest_check/);
      // A suite subject on its own is accepted, once per item.
      await insertReq(', suite_run_item_id, suite_run_id, subject_sample_set, subject_sample_manifest_digest', [itemId, runId, set, H('a')], 'one');
      await expect(insertReq(', suite_run_item_id, suite_run_id, subject_sample_set, subject_sample_manifest_digest', [itemId, runId, set, H('a')], 'two')).rejects.toThrow(/execution_request_suite_item_uq/);
    });

    it('a request keeps its subject: the guard refuses a change of the suite columns (migrate role too)', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const r = await run(suite.id);
      const id = r.data.items[0].requestId as string;
      for (const set of ["suite_run_id = gen_random_uuid()", "suite_run_item_id = gen_random_uuid()", "subject_sample_manifest_digest = '" + H('b') + "'", `subject_sample_set = '{"sourceOwner":"z","files":[]}'::jsonb`]) {
        await expect(sql(`update log_lifecycle.execution_request set ${set}, row_version = row_version + 1 where id = $1`, [id]), set).rejects.toThrow(/identity columns cannot change/);
      }
    });

    it('a suite run and its items are immutable after creation: no UPDATE, no DELETE, for the app role (no grant) and the migrate role (trigger)', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      const r = await run(suite.id);
      const runId = r.data.suiteRunId as string;
      for (const stmt of [
        `update log_datasets.suite_run set idempotency_key = 'x' where id = $1`,
        `delete from log_datasets.suite_run where id = $1`,
        `update log_datasets.suite_run_item set ordinal = 9 where suite_run_id = $1`,
        `delete from log_datasets.suite_run_item where suite_run_id = $1`,
      ]) {
        await expect(appSql(stmt, [runId]), `app: ${stmt}`).rejects.toThrow(/permission denied|immutable/);
        await expect(sql(stmt, [runId]), `migrate: ${stmt}`).rejects.toThrow(/immutable/);
      }
      expect((await sql('select count(*)::int as c from log_datasets.suite_run_item where suite_run_id = $1', [runId])).rows[0].c).toBe(1);
    });

    it('a suite keeps its identity and bumps row_version by exactly 1 (guard, migrate role too); the app role has no DELETE', async () => {
      const a = await approvedDataset();
      const suite = await makeSuite([{ datasetId: a.ds.id }]);
      await expect(sql(`update log_datasets.regression_suite set workspace_id = $2 where id = $1`, [suite.id, otherWorkspace])).rejects.toThrow(/identity columns cannot change/);
      await expect(sql(`update log_datasets.regression_suite set created_by = $2 where id = $1`, [suite.id, admin.id])).rejects.toThrow(/identity columns cannot change/);
      await expect(sql(`update log_datasets.regression_suite set name = 'x' where id = $1`, [suite.id])).rejects.toThrow(/row_version by exactly 1/);
      await expect(appSql(`delete from log_datasets.regression_suite where id = $1`, [suite.id])).rejects.toThrow(/permission denied/);
      await expect(appSql(`update log_datasets.regression_suite set created_by = $2 where id = $1`, [suite.id, admin.id])).rejects.toThrow(/permission denied/);
    });
  });

  // ============================================================================================================
  describe('excerpt retention for a suite subject', () => {
    it('the clock is the FINISH of the suite run: nothing is erased while a sibling request is still open, nothing before the retention days, everything after', async () => {
      const a = await approvedDataset(['x1.log']);
      const b = await approvedDataset(['x2.log']);
      const suite = await makeSuite([{ datasetId: a.ds.id }, { datasetId: b.ds.id }]);
      const r = await run(suite.id);
      const c1 = (await claim()).json();
      const withExcerpt = (c: typeof c1) => [rule('R-1', 'FAIL', { evidence: [{ fileRef: at(c.request.sampleSet.files as { fileRef: string; sha256: string }[], 0).fileRef, line: 1, fileSha256: at(c.request.sampleSet.files as { fileRef: string; sha256: string }[], 0).sha256, excerpt: `${TAG} SECRET LINE` }] })];
      await finish(c1, withExcerpt(c1));
      const alive = async () => Number((await sql('select count(*)::int as c from log_lifecycle.rule_result_excerpt e where e.deleted_at is null and e.rule_result_id in (select rr.id from log_lifecycle.rule_result rr join log_lifecycle.execution_attempt a on a.id = rr.attempt_id join log_lifecycle.execution_request q on q.id = a.request_id where q.suite_run_id = $1)', [r.data.suiteRunId])).rows[0].c);
      const day = 86_400_000;
      expect(await alive()).toBe(1);
      // The sibling is still queued: the run has not finished, so a far-future purge erases nothing of it.
      await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 400 * day) });
      expect(await alive()).toBe(1);
      const c2 = (await claim()).json();
      await finish(c2, withExcerpt(c2));
      expect(await alive()).toBe(2);
      // Finished just now: inside the default 90 days nothing goes; after them both bodies do, together.
      await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 30 * day) });
      expect(await alive()).toBe(2);
      await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * day) });
      expect(await alive()).toBe(0);
      const erased = (await sql(`select excerpt, deleted_reason from log_lifecycle.rule_result_excerpt e where e.rule_result_id in (select rr.id from log_lifecycle.rule_result rr join log_lifecycle.execution_attempt a on a.id = rr.attempt_id join log_lifecycle.execution_request q on q.id = a.request_id where q.suite_run_id = $1)`, [r.data.suiteRunId])).rows;
      expect(erased).toEqual([{ excerpt: '', deleted_reason: 'retention' }, { excerpt: '', deleted_reason: 'retention' }]);
    });
  });
});
