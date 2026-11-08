// #1478 D-b — log test dataset baselines: draft / update / approve / supersede, events, 기준 낡음, through the real `buildServer` over
// `menu-action` / `menu-query` against a real Postgres (throwaway DB only; app as platform_app, fixtures as platform_migrate).
// Needs the `log_datasets` migration. Two servers share the database: one with a mock Source port, one with none.

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
import { toCodeKey } from '../../log-knowledge/domain/code-key.js';
import { knowledgeLookup } from '../../log-knowledge/index.js';
import type { DatasetSourceRead, DescribeFileResponse } from '../source-check.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LDB${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);

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

type PortMode = Record<string, DescribeFileResponse | 'throw'>;

describe.skipIf(!runIntegration)('log test dataset baselines (#1478 D-b)', () => {
  let withPort: FastifyInstance;
  let noPort: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let admin2: Person;
  let user: Person;
  let developer: Person;
  let grantee: Person;
  let approver: Person;
  let approver2: Person;
  let both: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignDataset = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const csrf = new Map<string, string>();
  let n = 0;
  const at = <T>(list: readonly T[], index: number): T => {
    const value = list[index];
    if (value === undefined) throw new Error(`no item ${index}`);
    return value;
  };
  // The mock Source port: the answer per fileRef; an absent key is `source_absent`.
  let portAnswers: PortMode = {};
  const portCalls: string[] = [];
  // The Source-owner ACL the `withPort` server asks (default open; a test closes it). Every owner asked is recorded.
  let ownerAllowed = true;
  const ownersAsked: string[] = [];

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
  const files = (...names: string[]) => names.map((name, i) => ({ fileRef: ref(name), order: i + 1, sha256: H(String.fromCharCode(97 + (name.charCodeAt(0) % 6))) }));
  const sampleSet = (...names: string[]) => ({ sourceOwner: 'fab-team', files: files(...names) });

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
  async function actOn(app: FastifyInstance, action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': await csrfOf(app, who) },
      payload: JSON.stringify({
        action: `logDataset.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
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
  const detail = (datasetId: string, who: Person) => read('datasetDetail', { datasetId }, who);

  async function makeDataset(who: Person, over: Record<string, unknown> = {}): Promise<{ id: string; version: string }> {
    const a = await act('datasetCreate', { name: `${TAG}-ds-${n++}`, purpose: `${TAG} purpose text`, ...over }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.datasetId, version: a.data.version };
  }
  const audit = async (subjectId: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [subjectId])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Record<string, unknown>;
    }[];

  let foreignBaseline = '';
  const baselineIds: string[] = [];
  const catalogReportIds: string[] = [];
  /** One accepted catalog report of the shared workspace, from its own source (one current report per source): a RuleSet with one Revision holding the given rule keys (#1496). */
  async function seedCatalog(revision: string, ruleKeys: string[]): Promise<void> {
    const reportId = randomUUID();
    const revisionId = randomUUID();
    catalogReportIds.push(reportId);
    const hex = () => randomUUID().replaceAll('-', '').repeat(2);
    await sql(`insert into log_rules.catalog_report (id, workspace_id, source_system, reported_by_actor_id, validator_version, report_digest, outcome) values ($1,$2,$3,$4,'0.0-synthetic',$5,'accepted')`, [reportId, WORKSPACE_ID, `${TAG}-src-${reportId.slice(0, 8)}`, admin.id, hex()]);
    await sql(`insert into log_rules.rule_set_revision (id, workspace_id, report_id, rule_set_key, revision, result_ref, revision_digest, status) values ($1,$2,$3,$4,$5,$5,$6,'active')`, [revisionId, WORKSPACE_ID, reportId, `${TAG}-rs`, revision, hex()]);
    for (const key of ruleKeys) {
      await sql(`insert into log_rules.rule (id, workspace_id, rule_set_revision_id, rule_key, title, summary, support, rule_digest) values ($1,$2,$3,$4,'합성 fixture','합성 fixture summary','supported',$5)`, [randomUUID(), WORKSPACE_ID, revisionId, key, hex()]);
    }
  }
  const revisionOf = async (ds: string, names: string[] = [`${n++}.log`], who: Person = grantee) => {
    const set = sampleSet(...names);
    const a = await act('revisionCreate', { datasetId: ds, sampleSet: set }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.revisionId as string, set };
  };
  const newDraft = async (revisionId: string, who: Person = grantee) => {
    const a = await act('baselineDraftCreate', { datasetRevisionId: revisionId }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    baselineIds.push(a.data.baselineId);
    return { id: a.data.baselineId as string, version: a.data.version as string, seq: a.data.seq as number };
  };
  const content = (fileRef: string) => ({
    expectedScope: ['R-1', 'R-2'],
    expectations: [
      { ruleId: 'R-1', expected: 'PASS' },
      { ruleId: 'R-2', expected: 'FAIL', exception: { reason: 'SECRET-EXC-REASON', scope: 'file a' }, evidence: [{ fileRef, line: 3 }] },
    ],
  });
  const fill = async (d: { id: string; version: string }, fileRef: string, who: Person = grantee, extra: Record<string, unknown> = {}) => {
    const a = await act('baselineUpdateDraft', { id: d.id, ...content(fileRef), ...extra }, who, d.version);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.version as string;
  };
  const approve = (id: string, version: string, who: Person, reason = 'checked by hand') => act('baselineApprove', { id, reason }, who, version);
  const baselines = (revisionId: string, who: Person = admin, app: FastifyInstance = withPort) => read('baselines', { datasetRevisionId: revisionId }, who, app);
  const bdetail = (id: string, who: Person = admin) => read('baselineDetail', { baselineId: id }, who);
  const row = async (id: string) => (await sql('select * from log_datasets.expected_baseline where id = $1', [id])).rows[0];
  const events = async (id: string) => (await sql('select kind, before, after, reason, actor_id, self_approved from log_datasets.baseline_event where baseline_id = $1 order by at, id', [id])).rows;
  /** A shared dataset with one revision, a filled and approved baseline (approved by `approver`). */
  async function approvedSetup(names?: string[]) {
    const ds = await makeDataset(admin, { shareScope: 'workspace' });
    const rev = await revisionOf(ds.id, names);
    const d = await newDraft(rev.id);
    const v = await fill(d, at(rev.set.files, 0).fileRef);
    const ap = await approve(d.id, v, approver);
    expect(ap.outcome, JSON.stringify(ap)).toBe('ok');
    return { ds, rev, baseline: d, version: ap.version as string };
  }

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
    portAnswers = {};
    portCalls.length = 0;
    ownerAllowed = true;
    ownersAsked.length = 0;
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    withPort = await buildServer({ config: loadConfig(), dbHandle, logDatasets: { sourceRead: mockPort, sourceOwnerAccess: { allows: async (_actor, owner) => { ownersAsked.push(owner); return ownerAllowed; } } } });
    noPort = await buildServer({ config: loadConfig(), dbHandle });
    await Promise.all([withPort.ready(), noPort.ready()]);
    admin = await person('admin');
    admin2 = await person('admin');
    user = await person('user');
    developer = await person('developer');
    grantee = await person('developer');
    approver = await person('developer');
    approver2 = await person('developer');
    both = await person('developer');
    const grant = (who: Person, cap: string) =>
      sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [WORKSPACE_ID, who.id, cap, admin.id]);
    await grant(grantee, 'dataset.manage');
    await grant(approver, 'dataset.baseline.approve');
    await grant(approver2, 'dataset.baseline.approve');
    await grant(both, 'dataset.manage');
    await grant(both, 'dataset.baseline.approve');
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    foreignDataset = (await sql(`insert into log_datasets.dataset (workspace_id, name, owner_actor_id, share_scope, created_by, updated_by) values ($1,$2,$3,'workspace',$3,$3) returning id`, [otherWorkspace, `${TAG}-f`, foreignActor])).rows[0].id as string;
    const frev = (await sql(`insert into log_datasets.dataset_revision (workspace_id, dataset_id, seq, sample_set, sample_manifest_digest, created_by) values ($1,$2,1,$3::jsonb,$4,$5) returning id`, [otherWorkspace, foreignDataset, JSON.stringify(sampleSet('f.log')), H('a'), foreignActor])).rows[0].id as string;
    foreignBaseline = (await sql(`insert into log_datasets.expected_baseline (workspace_id, dataset_revision_id, seq, author_actor_id) values ($1,$2,1,$3) returning id`, [otherWorkspace, frev, foreignActor])).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_datasets.baseline_event disable trigger baseline_event_append_only');
      await client.query('delete from log_datasets.baseline_event where actor_id = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('alter table log_datasets.baseline_event enable trigger baseline_event_append_only');
      await client.query('delete from log_datasets.expected_baseline where author_actor_id = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('alter table log_datasets.dataset_revision disable trigger dataset_revision_immutable');
      await client.query('delete from log_datasets.dataset_revision where created_by = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('alter table log_datasets.dataset_revision enable trigger dataset_revision_immutable');
      await client.query('delete from log_datasets.dataset where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (catalogReportIds.length > 0) {
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        for (const [table, trigger] of [['rule_target', 'rule_target_append_only'], ['rule', 'rule_append_only'], ['rule_set_revision', 'rule_set_revision_append_only'], ['catalog_report', 'catalog_report_no_delete'], ['catalog_report', 'catalog_report_guard']]) await client.query(`alter table log_rules.${table} disable trigger ${trigger}`);
        await client.query('delete from log_rules.rule where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id = any($1))', [catalogReportIds]);
        await client.query('delete from log_rules.rule_set_revision where report_id = any($1)', [catalogReportIds]);
        await client.query('delete from log_rules.catalog_report where id = any($1)', [catalogReportIds]);
        for (const [table, trigger] of [['rule_target', 'rule_target_append_only'], ['rule', 'rule_append_only'], ['rule_set_revision', 'rule_set_revision_append_only'], ['catalog_report', 'catalog_report_no_delete'], ['catalog_report', 'catalog_report_guard']]) await client.query(`alter table log_rules.${table} enable trigger ${trigger}`);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) await sql(`delete from knowledge.${table} where created_by = any($1)`, [actorIds]);
    for (const [table, column] of [['core.idempotency_keys', 'actor_id'], ['core.audit_log', 'actor_id'], ['permission.permission_grants', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await withPort?.close();
    await noPort?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('baselineDraftCreate', () => {
    it('needs dataset.manage; seq counts up per revision; the creation is an event and a body-free audit row', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      for (const who of [user, developer, approver]) expect((await act('baselineDraftCreate', { datasetRevisionId: rev.id }, who)).outcome).toBe('forbidden');
      const a = await newDraft(rev.id);
      const b = await newDraft(rev.id, admin);
      expect([a.seq, b.seq]).toEqual([1, 2]);
      expect(await row(a.id)).toMatchObject({ status: 'draft', row_version: 1, author_actor_id: grantee.id, workspace_id: WORKSPACE_ID });
      expect((await events(a.id)).map((e) => e.kind)).toEqual(['created']);
      expect((await audit(a.id)).map((e) => [e.event_type, e.subject_type, e.detail])).toEqual([['dataset.baseline_created', 'dataset_baseline', { datasetId: ds.id, revisionId: rev.id, seq: 1, expectationCount: 0, copied: false }]]);
    });

    it('an unknown or foreign revision is not_found; an archived dataset is frozen; a copy from an attempt is refused (no lifecycle read port)', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      expect(fe(await act('baselineDraftCreate', { datasetRevisionId: randomUUID() }, grantee))).toEqual(['datasetRevisionId:not_found']);
      const frev = (await sql('select dataset_revision_id as id from log_datasets.expected_baseline where id = $1', [foreignBaseline])).rows[0].id as string;
      expect(fe(await act('baselineDraftCreate', { datasetRevisionId: frev }, grantee))).toEqual(['datasetRevisionId:not_found']);
      expect(fe(await act('baselineDraftCreate', { datasetRevisionId: rev.id, fromAttemptId: randomUUID() }, grantee))).toEqual(['fromAttemptId:unsupported']);
      await act('datasetArchive', { id: ds.id }, admin, ds.version);
      expect(fe(await act('baselineDraftCreate', { datasetRevisionId: rev.id }, grantee))).toEqual(['datasetRevisionId:illegal_transition']);
    });
  });

  describe('baselineUpdateDraft', () => {
    it('refuses scope rule ids the pinned RuleSet Revision lacks, only when that Revision resolves (#1496)', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const scope = ['R-1', 'R-9'];
      // Unresolved pin (no such Revision in the catalog): accepted unchecked.
      const unchecked = await act('baselineUpdateDraft', { id: d.id, profilePin: { ruleSetRevision: `${TAG}-rv` }, expectedScope: scope }, grantee, d.version);
      expect(unchecked.outcome, JSON.stringify(unchecked)).toBe('ok');
      await seedCatalog(`${TAG}-rv`, ['R-1']);
      const refused = await act('baselineUpdateDraft', { id: d.id, expectedScope: ['R-1', 'R-9'] }, grantee, unchecked.version as string);
      expect(refused.outcome).toBe('invalid');
      expect(fe(refused)).toEqual(['expectedScope.1:unknown_rule']);
      expect((await row(d.id)).expected_scope).toEqual(scope);
      const ok = await act('baselineUpdateDraft', { id: d.id, expectedScope: ['R-1'] }, grantee, unchecked.version as string);
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
    });

    it('checks the stored scope against the stored pin on an expectations-only save once the pin resolves (#1496)', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const rv = `${TAG}-rv2`;
      // Stored while the pin names no catalog Revision: accepted unchecked.
      const stored = await act('baselineUpdateDraft', { id: d.id, profilePin: { ruleSetRevision: rv }, expectedScope: ['R-1', 'R-9'] }, grantee, d.version);
      expect(stored.outcome, JSON.stringify(stored)).toBe('ok');
      await seedCatalog(rv, ['R-1']);
      // The pin now resolves; a save that sends neither pin nor scope must still be refused.
      const refused = await act('baselineUpdateDraft', { id: d.id, expectations: [{ ruleId: 'R-1', expected: 'PASS' }] }, grantee, stored.version as string);
      expect(refused.outcome).toBe('invalid');
      expect(fe(refused)).toEqual(['expectedScope.1:unknown_rule']);
      expect((await row(d.id)).row_version).toBe(Number(stored.version));
    });

    it('stores the content by version, records an event and an audit row of names and counts, and a no-op save writes nothing', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const fileRef = at(rev.set.files, 0).fileRef;
      const v2 = await fill(d, fileRef, grantee, { parserGoldenRef: { location: 'golden://x', digest: H('c') }, profilePin: { parserVersion: '1.0' } });
      expect(v2).toBe('2');
      expect(await row(d.id)).toMatchObject({ expected_scope: ['R-1', 'R-2'], parser_golden_ref: { location: 'golden://x', digest: H('c') }, profile_pin: { parserVersion: '1.0' } });
      const same = await act('baselineUpdateDraft', { id: d.id, ...content(fileRef) }, grantee, v2);
      expect(same.outcome).toBe('ok');
      expect(same.version).toBe('2');
      const cleared = await act('baselineUpdateDraft', { id: d.id, parserGoldenRef: null }, grantee, v2);
      expect(cleared.version).toBe('3');
      expect((await row(d.id)).parser_golden_ref).toBeNull();
      expect((await events(d.id)).map((e) => e.kind)).toEqual(['created', 'updated', 'updated']);
      const trail = await audit(d.id);
      expect(trail.map((e) => e.event_type)).toEqual(['dataset.baseline_created', 'dataset.baseline_updated', 'dataset.baseline_updated']);
      expect(trail[1]?.detail).toEqual({ changed: ['profilePin', 'expectedScope', 'expectations', 'parserGoldenRef'], expectationCount: 2 });
      expect(JSON.stringify([trail, await events(d.id)])).not.toMatch(/SECRET-EXC-REASON|R-1|golden:\/\//);
    });

    it('a stale version conflicts; the vocabulary and evidence are judged; an unknown id is not_found', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      await fill(d, at(rev.set.files, 0).fileRef);
      expect((await act('baselineUpdateDraft', { id: d.id, expectedScope: [] }, grantee, d.version)).outcome).toBe('conflict');
      const bad = await act('baselineUpdateDraft', { id: d.id, expectations: [{ ruleId: 'R-9', expected: 'MAYBE' }] }, grantee, '2');
      expect(fe(bad)).toEqual(['expectations.0.expected:malformed']);
      const elsewhere = await act('baselineUpdateDraft', { id: d.id, expectations: [{ ruleId: 'R-9', expected: 'PASS', evidence: [{ fileRef: ref('not-in-revision.log'), line: 1 }] }] }, grantee, '2');
      expect(fe(elsewhere)).toEqual(['expectations.0.evidence.0.fileRef:not_found']);
      expect((await act('baselineUpdateDraft', { id: randomUUID(), expectedScope: [] }, grantee, '1')).outcome).toBe('not_found');
      expect((await act('baselineUpdateDraft', { id: d.id, expectedScope: [] }, approver, '2')).outcome).toBe('forbidden');
    });
  });

  describe('baselineApprove', () => {
    it('refuses a User and an Admin without the grant (no role bypass); the approver is recorded; the audit row names counts and the reason length only', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const v = await fill(d, at(rev.set.files, 0).fileRef);
      for (const who of [user, developer, grantee, admin]) expect((await approve(d.id, v, who)).outcome).toBe('forbidden');
      expect(fe(await act('baselineApprove', { id: d.id }, approver, v))).toEqual(['reason:required']);
      const ok = await approve(d.id, v, approver, 'looks right to me');
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      expect(ok.data).toMatchObject({ supersededBaselineId: null, selfApproved: false });
      expect(await row(d.id)).toMatchObject({ status: 'approved', approved_by_actor_id: approver.id, row_version: 3 });
      const evs = await events(d.id);
      expect(evs.map((e) => e.kind)).toEqual(['created', 'updated', 'approved']);
      expect(evs[2]).toMatchObject({ reason: 'looks right to me', actor_id: approver.id, self_approved: false });
      const last = (await audit(d.id)).at(-1);
      expect(last).toMatchObject({ event_type: 'dataset.baseline_approved', actor_id: approver.id, detail: { datasetId: ds.id, revisionId: rev.id, seq: 1, expectationCount: 2, supersededSeq: null, reasonLength: 17, selfApproved: false } });
      expect(JSON.stringify(await audit(d.id))).not.toContain('looks right');
    });

    it('a grantee demoted to User keeps the grant row but can no longer approve, and bootstrap stops listing dataset:baseline-approve', async () => {
      const demoted = await person('developer');
      await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'dataset.baseline.approve',null,$3)`, [WORKSPACE_ID, demoted.id, admin.id]);
      const listed = async () =>
        (await withPort.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(demoted.cookie) })).json<{ session: { user: { permissions: string[] } } }>().session.user.permissions.includes('dataset:baseline-approve');
      expect(await listed()).toBe(true);
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const v = await fill(d, at(rev.set.files, 0).fileRef);
      await sql(`update core.actors set role_level = 'user' where id = $1`, [demoted.id]);
      const eventsBefore = await events(d.id);
      const auditBefore = await audit(d.id);
      expect((await approve(d.id, v, demoted)).outcome).toBe('forbidden');
      expect(await row(d.id)).toMatchObject({ status: 'draft', approved_by_actor_id: null });
      expect(await events(d.id)).toEqual(eventsBefore);
      expect(await audit(d.id)).toEqual(auditBefore);
      expect(await listed()).toBe(false);
    });

    it('self-approval is allowed and recorded (event and audit)', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id, undefined, both);
      const d = await newDraft(rev.id, both);
      const v = await fill(d, at(rev.set.files, 0).fileRef, both);
      const ok = await approve(d.id, v, both);
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      expect(ok.data.selfApproved).toBe(true);
      expect((await events(d.id)).at(-1)).toMatchObject({ kind: 'approved', self_approved: true });
      expect((await audit(d.id)).at(-1)?.detail).toMatchObject({ selfApproved: true });
    });

    it('an empty baseline, a stale version and an already decided baseline are refused', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      expect(fe(await approve(d.id, d.version, approver))).toEqual(['id:empty']);
      const v = await fill(d, at(rev.set.files, 0).fileRef);
      expect((await approve(d.id, d.version, approver)).outcome).toBe('conflict');
      const ok = await approve(d.id, v, approver);
      expect(fe(await approve(d.id, ok.version as string, approver))).toEqual(['id:illegal_transition']);
      expect(fe(await act('baselineUpdateDraft', { id: d.id, expectedScope: [] }, grantee, ok.version as string))).toEqual(['id:illegal_transition']);
      expect((await approve(randomUUID(), '1', approver)).outcome).toBe('not_found');
    });

    it('approving a new seq supersedes the previous approved one in the same transaction; one approved per revision', async () => {
      const { rev, baseline: first } = await approvedSetup();
      const second = await newDraft(rev.id);
      const v = await fill(second, at(rev.set.files, 0).fileRef);
      const ok = await approve(second.id, v, approver2);
      expect(ok.data.supersededBaselineId).toBe(first.id);
      expect(await row(first.id)).toMatchObject({ status: 'superseded', row_version: 4 });
      expect((await row(first.id)).superseded_at).not.toBeNull();
      expect(await row(second.id)).toMatchObject({ status: 'approved' });
      expect((await sql(`select count(*)::int as n from log_datasets.expected_baseline where dataset_revision_id = $1 and status = 'approved'`, [rev.id])).rows[0].n).toBe(1);
      expect((await events(first.id)).at(-1)).toMatchObject({ kind: 'superseded', actor_id: approver2.id });
      expect((await audit(first.id)).at(-1)).toMatchObject({ event_type: 'dataset.baseline_superseded', detail: { seq: 1, bySeq: 2, from: 'approved' } });
      expect((await audit(second.id)).at(-1)?.detail).toMatchObject({ supersededSeq: 1 });
      const list = await baselines(rev.id);
      expect(list.data.rows.map((r: { seq: number; status: string }) => `${r.seq}:${r.status}`)).toEqual(['2:approved', '1:superseded']);
    });

    it('parallel approvals of two drafts of one revision leave exactly one approved; the same draft twice conflicts', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const fileRef = at(rev.set.files, 0).fileRef;
      const a = await newDraft(rev.id);
      const b = await newDraft(rev.id);
      const va = await fill(a, fileRef);
      const vb = await fill(b, fileRef);
      const answers = await Promise.all([approve(a.id, va, approver), approve(b.id, vb, approver2)]);
      expect(answers.map((x) => x.outcome)).toEqual(['ok', 'ok']);
      const states = (await sql('select status from log_datasets.expected_baseline where dataset_revision_id = $1 order by status', [rev.id])).rows.map((r) => r.status);
      expect(states).toEqual(['approved', 'superseded']);
      const c = await newDraft(rev.id);
      const vc = await fill(c, fileRef);
      const same = await Promise.all([approve(c.id, vc, approver), approve(c.id, vc, approver2)]);
      expect(same.map((x) => x.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await sql(`select count(*)::int as n from log_datasets.expected_baseline where dataset_revision_id = $1 and status = 'approved'`, [rev.id])).rows[0].n).toBe(1);
    });
  });

  describe('immutability and append-only history (database walls)', () => {
    it('an approved baseline cannot change content, status or identity, for the migrate role too; superseded is final; platform_app has no wider grant', async () => {
      const { rev, baseline: first } = await approvedSetup();
      const refuse = (text: string, params: unknown[] = []) => expect(sql(text, params)).rejects.toMatchObject({ code: '23514' });
      await refuse(`update log_datasets.expected_baseline set expectations = '[]'::jsonb, row_version = row_version + 1 where id = $1`, [first.id]);
      await refuse(`update log_datasets.expected_baseline set status = 'draft', approved_at = null, approved_by_actor_id = null, row_version = row_version + 1 where id = $1`, [first.id]);
      await refuse(`update log_datasets.expected_baseline set seq = 9, row_version = row_version + 1 where id = $1`, [first.id]);
      await refuse(`update log_datasets.expected_baseline set expected_scope = '[]'::jsonb where id = $1`, [first.id]); // no row_version bump
      const second = await newDraft(rev.id);
      await refuse(`update log_datasets.expected_baseline set status = 'superseded', superseded_at = now(), row_version = row_version + 1 where id = $1`, [second.id]); // draft -> superseded
      await approve(second.id, await fill(second, at(rev.set.files, 0).fileRef), approver);
      await refuse(`update log_datasets.expected_baseline set updated_at = now(), row_version = row_version + 1 where id = $1`, [first.id]); // superseded is final
      await expect(appSql(`update log_datasets.expected_baseline set seq = 9 where id = $1`, [second.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`update log_datasets.expected_baseline set author_actor_id = $2 where id = $1`, [second.id, approver.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`delete from log_datasets.expected_baseline where id = $1`, [second.id])).rejects.toMatchObject({ code: '42501' });
      expect((await row(first.id)).expectations).toHaveLength(2);
    });

    it('the unique index is the wall behind one approved per revision', async () => {
      const { rev } = await approvedSetup();
      const extra = await newDraft(rev.id);
      await expect(
        sql(`update log_datasets.expected_baseline set status = 'approved', approved_by_actor_id = $2, approved_at = now(), row_version = row_version + 1 where id = $1`, [extra.id, approver.id]),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('baseline_event refuses UPDATE and DELETE for every role', async () => {
      const { baseline } = await approvedSetup();
      await expect(sql(`update log_datasets.baseline_event set reason = 'x' where baseline_id = $1`, [baseline.id])).rejects.toMatchObject({ code: '23514' });
      await expect(sql(`delete from log_datasets.baseline_event where baseline_id = $1`, [baseline.id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql(`update log_datasets.baseline_event set reason = 'x' where baseline_id = $1`, [baseline.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`delete from log_datasets.baseline_event where baseline_id = $1`, [baseline.id])).rejects.toMatchObject({ code: '42501' });
      expect((await events(baseline.id)).length).toBe(3);
    });

    it('a baseline cannot name a revision of another workspace (composite FK)', async () => {
      const frev = (await sql('select dataset_revision_id as id from log_datasets.expected_baseline where id = $1', [foreignBaseline])).rows[0].id as string;
      await expect(sql(`insert into log_datasets.expected_baseline (workspace_id, dataset_revision_id, seq, author_actor_id) values ($1,$2,7,$3)`, [WORKSPACE_ID, frev, admin.id])).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('visibility and workspace isolation', () => {
    it('a private dataset\'s baselines are invisible to others on every read and write (same absence as missing)', async () => {
      const ds = await makeDataset(grantee, { shareScope: 'private' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const v = await fill(d, at(rev.set.files, 0).fileRef);
      expect((await baselines(rev.id, grantee)).data.rows).toHaveLength(1);
      expect((await bdetail(d.id, grantee)).data).toMatchObject({ id: d.id });
      for (const who of [admin, admin2, approver]) {
        expect((await baselines(rev.id, who)).data).toBeNull();
        expect((await bdetail(d.id, who)).data).toBeNull();
      }
      expect((await approve(d.id, v, approver)).outcome).toBe('not_found');
      expect((await act('baselineUpdateDraft', { id: d.id, expectedScope: [] }, admin, v)).outcome).toBe('not_found');
      expect(fe(await act('baselineDraftCreate', { datasetRevisionId: rev.id }, admin))).toEqual(['datasetRevisionId:not_found']);
      expect((await detail(ds.id, admin)).data).toBeNull();
      expect(await row(d.id)).toMatchObject({ status: 'draft' });
    });

    it('another workspace\'s baseline is not found for reads and writes', async () => {
      expect((await bdetail(foreignBaseline)).data).toBeNull();
      expect((await approve(foreignBaseline, '1', approver)).outcome).toBe('not_found');
      expect((await act('baselineUpdateDraft', { id: foreignBaseline, expectedScope: [] }, grantee, '1')).outcome).toBe('not_found');
      expect((await row(foreignBaseline)).status).toBe('draft');
    });

    it('the reads refuse an unknown key or a non-uuid with an error, never an empty answer', async () => {
      expect((await read('baselines', { datasetRevisionId: 'x' }, admin)).outcome).toBe('error');
      expect((await read('baselines', { datasetRevisionId: randomUUID(), nope: 1 }, admin)).outcome).toBe('error');
      expect((await read('baselineDetail', {}, admin)).outcome).toBe('error');
    });
  });

  describe('baselineDetail', () => {
    it('returns the content and the history with actors, newest state first in rows', async () => {
      const { baseline } = await approvedSetup();
      const d = await bdetail(baseline.id, user);
      expect(d.data).toMatchObject({ id: baseline.id, status: 'approved', expectedScope: ['R-1', 'R-2'], approvedBy: { id: approver.id }, author: { id: grantee.id } });
      expect(d.data.expectations).toHaveLength(2);
      expect(d.data.events.map((e: { kind: string }) => e.kind)).toEqual(['created', 'updated', 'approved']);
      expect(d.data.events[2]).toMatchObject({ reason: 'checked by hand', selfApproved: false, actor: { id: approver.id } });
    });
  });

  describe('기준 낡음 at read time', () => {
    const stale = async (revisionId: string, app: FastifyInstance = withPort) => (await baselines(revisionId, admin, app)).data.rows.find((r: { status: string }) => r.status === 'approved')?.stale;
    const matching = (set: ReturnType<typeof sampleSet>) => { for (const f of set.files) portAnswers[f.fileRef] = { status: 'ok', sha256: f.sha256 }; };

    it('matching files: fresh; a changed hash and a missing file are stale with their reasons; a stale baseline stays approved', async () => {
      const { rev, baseline } = await approvedSetup([`${n++}-a.log`, `${n++}-b.log`]);
      matching(rev.set);
      expect(await stale(rev.id)).toEqual({ state: 'fresh', reasons: [], unknown: [] });
      portAnswers[at(rev.set.files, 0).fileRef] = { status: 'ok', sha256: H('f') };
      expect(await stale(rev.id)).toMatchObject({ state: 'stale', reasons: ['file_hash_changed'] });
      portAnswers[at(rev.set.files, 1).fileRef] = { status: 'source_absent' };
      expect(await stale(rev.id)).toMatchObject({ state: 'stale', reasons: ['file_hash_changed', 'file_unavailable'] });
      expect((await row(baseline.id)).status).toBe('approved');
    });

    it('the Source-owner ACL gates the check: denied = no port call and unknown, never stale', async () => {
      const { rev } = await approvedSetup();
      matching(rev.set);
      portCalls.length = 0;
      ownerAllowed = false;
      expect(await stale(rev.id)).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      expect(portCalls).toEqual([]);
      expect(ownersAsked).toContain('fab-team');
    });

    it('no port: unknown; an adapter that throws: unknown; one that never settles is bounded by the deadline: unknown', async () => {
      const { rev } = await approvedSetup();
      expect(await stale(rev.id, noPort)).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      portAnswers[at(rev.set.files, 0).fileRef] = 'throw';
      expect(await stale(rev.id)).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
      const hang = { ...mockPort, describeFile: () => new Promise<never>(() => {}) };
      const hung = await buildServer({ config: loadConfig(), dbHandle, logDatasets: { sourceRead: hang, sourceOwnerAccess: { allows: async () => true } } });
      try {
        const started = Date.now();
        const hungRead = await baselines(rev.id, admin, hung);
        expect(hungRead.data.rows.find((r: { status: string }) => r.status === 'approved').stale).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
        expect(Date.now() - started).toBeLessThan(8000);
      } finally {
        await hung.close();
      }
    }, 30_000);

    it('a pinned spec that cannot be read and pinned engine values are unknown (never stale); a draft or superseded baseline has no badge', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      matching(rev.set);
      const d = await newDraft(rev.id);
      const pin = { specPin: { modelId: randomUUID(), softwareId: null, revisionId: randomUUID(), changeSetDigest: H('d') }, ruleSetRevision: '5', parserVersion: '2', engineProfileRef: 'p' };
      const v = await fill(d, at(rev.set.files, 0).fileRef, grantee, { profilePin: pin });
      expect((await baselines(rev.id)).data.rows[0].stale).toBeNull();
      await approve(d.id, v, approver);
      expect(await stale(rev.id)).toEqual({ state: 'unknown', reasons: [], unknown: ['spec_pin', 'rule_set', 'parser', 'engine_profile'] });
      const next = await newDraft(rev.id);
      await approve(next.id, await fill(next, at(rev.set.files, 0).fileRef), approver);
      const rows = (await baselines(rev.id)).data.rows as { status: string; stale: unknown }[];
      expect(rows.filter((r) => r.status !== 'approved').every((r) => r.stale === null)).toBe(true);
    });

    it('a pinned software must be a software of the pinned model; one that vanishes later makes the pin unknown, never stale (no base-spec fallback)', async () => {
      const actor = grantee.id;
      const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
      const catalog = (table: string, code: string, extra: Record<string, unknown> = {}) => {
        const cols = { workspace_id: WORKSPACE_ID, code, code_key: toCodeKey(code), name: code, created_by: actor, updated_by: actor, ...extra };
        return one(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols));
      };
      const vendor = await catalog('vendor', `${TAG}-sv`);
      const modelA = await catalog('equipment_model', `${TAG}-sa`, { vendor_id: vendor });
      const modelB = await catalog('equipment_model', `${TAG}-sb`, { vendor_id: vendor });
      const software = (modelId: string, label: string) =>
        one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`, [WORKSPACE_ID, modelId, label, toCodeKey(label), actor]);
      const swA = await software(modelA, `${TAG}-1`);
      const swB = await software(modelB, `${TAG}-1`);
      const specRev = await one(`insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,1,'draft',$3::jsonb,1,$4) returning id`, [WORKSPACE_ID, modelA, JSON.stringify({ docLabel: 'Synthetic log spec', docVersion: 'v1' }), actor]);
      await sql(`update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`, [specRev, '1'.padStart(64, '0'), actor]);
      const effective = await dbHandle.db.transaction((tx) => knowledgeLookup.getEffectiveSpecPin(tx, WORKSPACE_ID, modelA, swA, actor));
      if (!effective) throw new Error('the published model has an effective pin');
      const pinWith = (softwareId: string) => ({ profilePin: { specPin: { modelId: modelA, softwareId, revisionId: effective.revisionId, changeSetDigest: effective.changeSetDigest } } });

      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      matching(rev.set);
      const d = await newDraft(rev.id);
      for (const bad of [randomUUID(), swB]) {
        const refused = await act('baselineUpdateDraft', { id: d.id, ...pinWith(bad) }, grantee, d.version);
        expect(fe(refused), JSON.stringify(refused)).toEqual(['profilePin.specPin.softwareId:not_found']);
      }
      const v = await fill(d, at(rev.set.files, 0).fileRef, grantee, pinWith(swA));
      expect((await approve(d.id, v, approver)).outcome).toBe('ok');
      expect(await stale(rev.id)).toEqual({ state: 'fresh', reasons: [], unknown: [] });
      await sql('delete from knowledge.software_version where id = $1', [swA]);
      expect(await stale(rev.id)).toEqual({ state: 'unknown', reasons: [], unknown: ['spec_pin'] });
    });

    it('datasetDetail carries per-revision counts and the badge of the latest revision\'s approved baseline from the same file check', async () => {
      const { ds, rev, baseline } = await approvedSetup();
      matching(rev.set);
      await newDraft(rev.id);
      portCalls.length = 0;
      const d = await detail(ds.id, user);
      expect(d.data.revisions[0].baselines).toEqual({ draftCount: 1, supersededCount: 0, approved: { id: baseline.id, seq: 1, stale: { state: 'fresh', reasons: [], unknown: [] } } });
      expect(portCalls).toEqual(rev.set.files.map((f) => f.fileRef));
    });
  });

  describe('session-only: tokens are refused for reads and every baseline write, approval included', () => {
    const tokenIds: string[] = [];
    const TOKEN_IP = '10.78.0.1';
    async function rawToken(kind: 'personal' | 'service'): Promise<string> {
      let ownerId = approver.id;
      if (kind === 'service') {
        const externalId = `${TAG}-sys-${n++}`;
        ownerId = (await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`, [WORKSPACE_ID, externalId, `${externalId}@local`])).rows[0].id as string;
        actorIds.push(ownerId);
      }
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      const res = await sql(
        `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by) values ($1,$2,$3,'raw',$4,$5,$6,null,null,$7) returning id`,
        [WORKSPACE_ID, ownerId, kind, prefix, hashToken(value), ['dataset.manage', 'dataset.baseline.approve', 'workspace.read'], kind === 'personal' ? ownerId : admin.id],
      );
      tokenIds.push(res.rows[0].id as string);
      return value;
    }
    const call = async (url: string, value: string, payload: Record<string, unknown>): Promise<Answer> => {
      await sql('delete from core.rate_limits');
      const res = await withPort.inject({ method: 'POST', remoteAddress: TOKEN_IP, url, headers: { 'content-type': 'application/json', authorization: `Bearer ${value}` }, payload: JSON.stringify(payload) });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>();
    };
    afterAll(async () => {
      if (tokenIds.length > 0) await sql('delete from core.api_tokens where id = any($1)', [tokenIds]);
    });

    it.each([['a personal token', 'personal' as const], ['a service token', 'service' as const]])('%s, even with the legacy scopes inserted directly, is refused', async (_l, kind) => {
      const token = await rawToken(kind);
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      const v = await fill(d, at(rev.set.files, 0).fileRef);
      const act2 = (action: string, input: Record<string, unknown>, version?: string) =>
        call('/api/v1/menu-action', token, { action: `logDataset.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(version === undefined ? {} : { expectedVersion: version }) });
      const rd = (endpoint: string, params: Record<string, unknown>) => call('/api/v1/menu-query', token, { endpoint: `logDataset.${endpoint}`, context: {}, params });
      expect((await rd('baselines', { datasetRevisionId: rev.id })).outcome).toBe('forbidden');
      expect((await rd('baselineDetail', { baselineId: d.id })).outcome).toBe('forbidden');
      expect((await act2('baselineDraftCreate', { datasetRevisionId: rev.id })).outcome).toBe('forbidden');
      expect((await act2('baselineUpdateDraft', { id: d.id, expectedScope: [] }, v)).outcome).toBe('forbidden');
      expect((await act2('baselineApprove', { id: d.id, reason: 'via token' }, v)).outcome).toBe('forbidden');
      expect(await row(d.id)).toMatchObject({ status: 'draft', row_version: 2 });
    });

    it('a token cannot be issued with the dataset.baseline.approve scope', async () => {
      const res = await withPort.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-scope`, scopes: ['dataset.baseline.approve'], expiresAt: null } });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('session_only');
    });
  });

  describe('audit trail does not leak private baselines', () => {
    it('another Admin searching by the baseline subject type or id finds nothing', async () => {
      const ds = await makeDataset(grantee, { shareScope: 'private' });
      const rev = await revisionOf(ds.id);
      const d = await newDraft(rev.id);
      expect((await audit(d.id)).length).toBeGreaterThan(0);
      for (const query of [{ type: 'dataset_baseline' }, { targetId: d.id }, {}]) {
        const res = await withPort.inject({ method: 'POST', url: '/api/v1/platform/audit-trail/search', headers: { 'content-type': 'application/json', ...cookieHeader(admin2.cookie) }, payload: JSON.stringify(query) });
        expect(res.statusCode, res.body).toBe(200);
        expect(res.body, JSON.stringify(query)).not.toContain(d.id);
      }
    });
  });
});
