// Review regressions for #1504. Real Fastify + platform_app/Postgres; lane-only execution after migrations.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { createRuleCoveragePort } from '../../log-rules/index.js';
import { knowledgeLookup } from '../knowledge-lookup.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { insertJob, insertRows } from '../repositories/import-repo.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WS = process.env.WORKSPACE_ID ?? '';
const TAG = `AF${randomUUID().slice(0, 8).toUpperCase()}`;
interface Person { id: string; cookie: string; csrf: string }
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- assert the real wire envelope by path
  data: any;
  version: string;
  fieldErrors: { path: string[]; code: string }[];
  replayed: boolean;
}
const clean = (a: Answer) => ({ ...a, correlationId: undefined });

describe.skipIf(!(APP_URL && MIGRATE_URL && WS))('access review regressions (#1504)', () => {
  let app: FastifyInstance;
  let db: DbHandle;
  let migrate: DbHandle;
  let viewer: Person;
  let manager: Person;
  const people: string[] = [];
  let serial = 0;
  let beforeRow: (() => Promise<void>) | undefined;
  let vendor: string;
  let model: string;
  let sw1: string;
  let sw2: string;
  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const headers = (p = viewer) => ({ cookie: `${SESSION_COOKIE_NAME}=${p.cookie}`, 'x-csrf-token': p.csrf });
  async function person(): Promise<Person> {
    const externalId = `${TAG}-${serial++}`;
    const { id } = await insertActorRow(db, { workspaceId: WS, externalId, roleLevel: 'admin' });
    people.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }
  async function act(action: string, input: Record<string, unknown>, opts: { version?: string; key?: string; who?: Person } = {}): Promise<Answer> {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: headers(opts.who), payload: {
      action: action.includes('.') ? action : `logKnowledge.${action}`, context: {}, input,
      idempotencyKey: opts.key ?? randomUUID(), ...(opts.version === undefined ? {} : { expectedVersion: opts.version }),
    } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function read(endpoint: string, params: Record<string, unknown>): Promise<Answer> {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: headers(), payload: { endpoint, params, context: {} } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const mode = (table: string, id: string) => sql(`update knowledge.${table} set access_mode = 'restricted', row_version = row_version + 1 where id = $1`, [id]);
  const ok = (a: Answer) => { expect(a.outcome, JSON.stringify(a)).toBe('ok'); return a; };
  async function publish() {
    const c = ok(await act('specDraftCreate', { modelId: model, sourceDocRef: { docLabel: 'Fixture spec', docVersion: '1' } }));
    const s = ok(await act('specDraftSave', { revisionId: c.data.revisionId, mode: 'append', modules: [{ name: 'Motor' }], events: [{ module: 'Motor', name: 'Start', fields: [], triggerRule: 'on start' }], relations: [] }, { version: c.data.version }));
    ok(await act('specPublish', { revisionId: c.data.revisionId }, { version: s.version }));
  }
  async function change(softwareId: string, endsBeforeSoftwareId?: string) {
    return ok(await act('specChangeAdd', { modelId: model, softwareId, ...(endsBeforeSoftwareId ? { endsBeforeSoftwareId } : {}), targetKind: 'event', target: { module: 'Motor', event: 'Start' }, changeKind: 'changed', change: { before: { name: 'Start', triggerRule: 'on start', detailDocRef: null }, after: { name: 'Start', triggerRule: 'on stop', detailDocRef: null } } }));
  }
  const proposal = () => ({ ownerModelId: model, typeCode: 'anomaly', title: `${TAG} item ${serial++}`, observation: 'Observed motor start' });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db, logKnowledgeImport: { hooks: { beforeRow: async () => { await beforeRow?.(); } } } }); await app.ready();
    viewer = await person(); manager = await person();
    vendor = ok(await act('vendorCreate', { code: TAG, name: TAG })).data.id;
  });
  beforeEach(async () => {
    beforeRow = undefined;
    await sql('delete from core.rate_limits where key like any($1)', [people.map((id) => `${WS}:${id}%`)]);
    const code = `${TAG}-${serial++}`;
    model = ok(await act('modelCreate', { vendorId: vendor, code, name: code })).data.id;
    sw1 = ok(await act('softwareCreate', { modelId: model, versionLabel: '1', name: 'First' })).data.id;
    sw2 = ok(await act('softwareCreate', { modelId: model, versionLabel: '2', name: 'Second' })).data.id;
  });
  afterAll(async () => {
    await sql('delete from core.rate_limits where key like any($1)', [people.map((id) => `${WS}:${id}%`)]);
    const client = await migrate.pool.connect();
    const mine = '(select id from knowledge.knowledge_item where created_by = any($1))';
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    const projects = '(select id from log_lifecycle.development_project where created_by = any($1))';
    // Only fixtures of this suite. Append-only guards are restored in the same cleanup transaction.
    const deletes = [
      ['knowledge.object_access_rule', 'created_by = any($1)'],
      ['knowledge.draft_review', 'reviewer_actor_id = any($1)'], ['knowledge.draft_revision', 'author_actor_id = any($1)'], ['knowledge.draft', 'created_by = any($1)'],
      ['knowledge.item_link', `source_item_id in ${mine} or target_item_id in ${mine}`],
      ...['item_assessment_event', 'item_revision_evidence', 'item_revision_subject', 'knowledge_item_revision'].map((t) => [`knowledge.${t}`, `item_id in ${mine}`]),
      ['knowledge.knowledge_item', 'created_by = any($1)'],
      ['knowledge.catalog_import_resolution', 'resolved_by = any($1)'], ['knowledge.catalog_import_row', 'job_id in (select id from knowledge.catalog_import_job where created_by = any($1))'], ['knowledge.catalog_import_job', 'created_by = any($1)'],
      ['knowledge.external_identity_map', 'created_by = any($1)'], ['knowledge.spec_concept_mapping', 'proposed_by = any($1)'], ['knowledge.common_concept', 'created_by = any($1)'],
      ['knowledge.spec_sw_change', 'created_by = any($1)'],
      ...['spec_event_relation', 'spec_event', 'spec_module'].map((t) => [`knowledge.${t}`, `spec_rev_id in ${revs}`]),
      ['knowledge.model_spec_revision', 'created_by = any($1)'],
      ['log_lifecycle.execution_request', `round_id in (select id from log_lifecycle.validation_round where project_id in ${projects})`],
      ['log_lifecycle.validation_round', `project_id in ${projects}`], ['log_lifecycle.development_event', `project_id in ${projects}`], ['log_lifecycle.development_project', 'created_by = any($1)'],
      ['knowledge.model_process', 'assigned_by = any($1)'],
      ...['software_version', 'equipment_model', 'vendor'].map((t) => [`knowledge.${t}`, 'created_by = any($1)']),
      ['core.api_tokens', 'actor_id = any($1)'],
      ...['core.idempotency_keys', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions'].map((t) => [t, 'actor_id = any($1)']),
      ['core.actors', 'id = any($1)'],
    ];
    try {
      await client.query('begin');
      for (const [table, where] of deletes) {
        await client.query(`alter table ${table} disable trigger user`);
        await client.query(`delete from ${table} where ${where}`, [people]);
        await client.query(`alter table ${table} enable trigger user`);
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); await app?.close(); await db?.close(); await migrate?.close(); }
  });

  it('C2: a real published spec is unknown in summary immediately after model restriction', async () => {
    await publish();
    expect((await read('logRules.coverageSummary', { modelIds: [model] })).data.rows[0].reason).not.toBe('model_unknown');
    await mode('equipment_model', model);
    expect((await read('logRules.coverageSummary', { modelIds: [model] })).data.rows).toEqual([{ modelId: model, computable: false, reason: 'model_unknown' }]);
    expect((await read('logRules.coverage', { modelId: model })).data).toBeNull();
    const port = createRuleCoveragePort({ knowledgeLookup });
    expect(await db.db.transaction((tx) => port.getCoverage(tx, WS, model, null, viewer.id))).toMatchObject({ computable: false, reason: 'model_unknown' });
  });
  it('C3: neither ended-before references nor hidden SW filters disclose software', async () => {
    await publish();
    const ended = await change(sw1, sw2);
    ok(await act('specChangeRetire', { changeId: ended.data.changeId }, { version: '1' }));
    await change(sw1); // The open range must apply at SW2, so a hidden SW2 filter would be an oracle.
    await mode('software_version', sw2);
    const page = await read('logKnowledge.specChanges', { modelId: model, status: 'all' });
    expect(JSON.stringify(page.data)).not.toContain(sw2);
    expect(clean(await read('logKnowledge.specChanges', { modelId: model, softwareId: sw2 }))).toEqual(clean(await read('logKnowledge.specChanges', { modelId: model, softwareId: randomUUID() })));
  });
  it.each(['specChangeConfirm', 'specChangeRetire'])('C4: %s checks its software before any version', async (action) => {
    await publish(); const c = await change(sw1); await mode('software_version', sw1);
    const hidden = await act(action, { changeId: c.data.changeId }, { version: '999' });
    expect(clean(hidden)).toEqual(clean(await act(action, { changeId: randomUUID() }, { version: '999' })));
    expect(hidden.outcome).toBe('not_found');
    expect((await sql('select row_version, retired_at from knowledge.spec_sw_change where id = $1', [c.data.changeId])).rows[0]).toEqual({ row_version: 1, retired_at: null });
  });
  it('C9: an approved create draft hides its posted Item in list, detail and reviews', async () => {
    const d = ok(await act('draftCreate', { proposalType: 'create', proposal: proposal() }));
    const s = ok(await act('draftSubmit', { id: d.data.id }, { version: d.version }));
    const a = ok(await act('draftApprove', { id: d.data.id, approvedDigest: s.data.payloadDigest }, { version: s.version, who: manager }));
    await mode('knowledge_item', a.data.itemId);
    expect((await read('logKnowledge.draftDetail', { draftId: d.data.id })).data).toBeNull();
    const page = await read('logKnowledge.drafts', { filters: [{ id: 'ownerModelId', op: 'in', value: [model] }] });
    expect(page.data).toEqual({ rows: [], total: 0 });
    expect(JSON.stringify(page)).not.toContain(a.data.itemId);
  });
  it.each(['model', 'software'])('C1: lifecycle reads and commands hide a restricted %s', async (kind) => {
    const p = ok(await act('logLifecycle.projectCreate', { modelId: model, softwareId: sw1, kind: 'new', ownerActorId: viewer.id }));
    const projectId = p.data.projectId;
    const sampleSet = { sourceOwner: 'fixture', files: [{ fileRef: 'fixture.log', order: 1, sha256: 'a'.repeat(64) }] };
    const r = ok(await act('logLifecycle.roundOpen', { projectId, sampleSet }));
    const roundId = r.data.roundId;
    const q = ok(await act('logLifecycle.requestCreate', { roundId, priority: 0 }));
    await mode(kind === 'model' ? 'equipment_model' : 'software_version', kind === 'model' ? model : sw1);
    for (const [endpoint, key, id] of [['projectDetail', 'projectId', projectId], ['projectEvents', 'projectId', projectId], ['rounds', 'projectId', projectId], ['roundDetail', 'roundId', roundId], ['roundEvidence', 'roundId', roundId], ['requestDetail', 'requestId', q.data.requestId]] as const) {
      expect(clean(await read(`logLifecycle.${endpoint}`, { [key]: id }))).toEqual(clean(await read(`logLifecycle.${endpoint}`, { [key]: randomUUID() })));
    }
    const queue = await read('logLifecycle.requests', { modelId: model });
    expect(queue.data.total).toBe(0); expect(queue.data.immediateTotal).toBe(0);
    if (kind === 'model') expect((await read('logLifecycle.models', { filters: [{ id: 'id', op: 'in', value: [model] }] })).data).toEqual({ rows: [], total: 0 });
    for (const [action, extra, id] of [['projectUpdate', { targetDate: '2027-01-01' }, projectId], ['projectSetStage', { toStage: 'cancelled', reason: 'test' }, projectId], ['projectReopen', { reason: 'test' }, projectId], ['roundClose', {}, roundId], ['requestCancel', { reason: 'test' }, q.data.requestId]] as const) {
      expect(clean(await act(`logLifecycle.${action}`, { id, ...extra }, { version: '999' }))).toEqual(clean(await act(`logLifecycle.${action}`, { id: randomUUID(), ...extra }, { version: '999' })));
    }
    const denied = await act('logLifecycle.roundOpen', { projectId, sampleSet });
    expect(denied.fieldErrors).toEqual([{ path: ['projectId'], code: 'not_found' }]);
    expect((await sql('select count(*)::int as n from log_lifecycle.validation_round where project_id = $1', [projectId])).rows[0].n).toBe(1);
  });

  async function stageSoftware(validate = true, label = 'new-sw') {
    const jobId = await insertJob(db.db, { workspaceId: WS, actorId: viewer.id, entityType: 'software', fileName: 'fixture.csv', fileSize: 100, fileType: 'csv', fileSha256: 'a'.repeat(64), headers: ['v', 'm', 's'], mapping: { vendor_code: 'v', model_code: 'm', version_key: 's' } });
    const code = (await sql('select code from knowledge.equipment_model where id = $1', [model])).rows[0].code;
    await insertRows(db.db, WS, jobId, [{ rowNo: 1, raw: { v: TAG, m: code, s: label }, parseErrors: [] }]);
    if (!validate) return { jobId, planVersion: 1 };
    const v = ok(await act('importValidate', { jobId }, { version: '1' }));
    return { jobId, planVersion: v.data.planVersion };
  }
  it('C5: staging, filters, CSV and apply progress hide a job whose parent was restricted', async () => {
    const j = await stageSoftware();
    expect((await read('logKnowledge.importDetail', { jobId: j.jobId })).data.total).toBe(1);
    await mode('equipment_model', model);
    for (const filters of [undefined, [{ id: 'planState', op: 'in', value: ['new'] }]]) {
      expect(clean(await read('logKnowledge.importDetail', { jobId: j.jobId, ...(filters ? { filters } : {}) }))).toEqual(clean(await read('logKnowledge.importDetail', { jobId: randomUUID(), ...(filters ? { filters } : {}) })));
    }
    const csv = await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${j.jobId}/report.csv`, headers: headers() });
    const absent = await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${randomUUID()}/report.csv`, headers: headers() });
    expect(csv.statusCode).toBe(404); expect(csv.body).toBe(absent.body);
    const progress = await act('importApply', { jobId: j.jobId, expectedPlanVersion: j.planVersion });
    expect(progress.data).toEqual({ outcome: 'not_found' });
    expect((await sql('select count(*)::int as n from knowledge.software_version where model_id = $1', [model])).rows[0].n).toBe(2);
  });
  it.each(['model', 'software', 'item', 'draft'])('C8: %s create replay rechecks current object visibility without another write', async (kind) => {
    const key = randomUUID();
    const code = `${TAG}-${serial++}`;
    const action = `${kind}Create`;
    const input = kind === 'model' ? { vendorId: vendor, code, name: code }
      : kind === 'software' ? { modelId: model, versionLabel: code, name: code }
      : kind === 'item' ? proposal() : { proposalType: 'create', proposal: proposal() };
    const made = ok(await act(action, input, { key }));
    const id = made.data.id;
    if (kind === 'draft') await mode('equipment_model', model);
    else await mode(kind === 'model' ? 'equipment_model' : kind === 'software' ? 'software_version' : 'knowledge_item', id);
    const replay = await act(action, input, { key });
    expect(replay.outcome).toBe('not_found'); expect(replay.data).toBeNull(); expect(replay.version).toBeNull(); expect(replay.replayed).toBe(false);
    const table = kind === 'model' ? 'equipment_model' : kind === 'software' ? 'software_version' : kind === 'item' ? 'knowledge_item' : 'draft';
    expect((await sql(`select count(*)::int as n from knowledge.${table} where id = $1`, [id])).rows[0].n).toBe(1);
    expect((await sql('select count(*)::int as n from core.idempotency_keys where actor_id = $1 and key = $2', [viewer.id, key])).rows[0].n).toBe(1);
  });
  it('C11: a row-lock wait followed by restriction returns not_found instead of the new Item version', async () => {
    const i = ok(await act('itemCreate', proposal()));
    const blocker = await migrate.pool.connect();
    let pending: Promise<Answer> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query("update knowledge.knowledge_item set access_mode = 'restricted', row_version = row_version + 1 where id = $1", [i.data.id]);
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      pending = act('itemSetArchived', { id: i.data.id, archived: true }, { version: i.version });
      const deadline = Date.now() + 10_000;
      for (;;) {
        const waiting = await sql('select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))', [pid]);
        if (waiting.rowCount) break;
        if (Date.now() > deadline) throw new Error('command never waited for Item lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await blocker.query('commit');
      expect((await pending).outcome).toBe('not_found');
      expect((await sql('select publication_state, row_version from knowledge.knowledge_item where id = $1', [i.data.id])).rows[0]).toEqual({ publication_state: 'published', row_version: 2 });
    } finally { await blocker.query('rollback'); blocker.release(); await pending; }
  }, 20_000);
  it('GRANT: platform_app can change Item access_mode but cannot edit or delete access rule identity', async () => {
    const role = (await db.pool.query('select current_user as role')).rows[0].role;
    expect(role).toBe('platform_app');
    const i = ok(await act('itemCreate', proposal()));
    const a = await act('accessModeSet', { targetKind: 'item', targetId: i.data.id, mode: 'restricted' }, { version: i.version, who: manager });
    expect(a.outcome).toBe('ok');
    const r = ok(await act('accessRuleAdd', { targetKind: 'item', targetId: i.data.id, granteeId: viewer.id, effect: 'allow' }, { who: manager }));
    await expect(db.pool.query("update knowledge.object_access_rule set effect = 'deny' where rule_id = $1", [r.data.ruleId])).rejects.toMatchObject({ code: '42501' });
    for (const column of ['target_kind', 'target_id', 'grantee_id', 'valid_until', 'created_by']) await expect(db.pool.query(`update knowledge.object_access_rule set ${column} = ${column} where rule_id = $1`, [r.data.ruleId])).rejects.toMatchObject({ code: '42501' });
    await expect(db.pool.query('delete from knowledge.object_access_rule where rule_id = $1', [r.data.ruleId])).rejects.toMatchObject({ code: '42501' });
    expect((await read('logKnowledge.itemDetail', { itemId: i.data.id })).data).not.toBeNull();
  });

  it('C10: Admin audit projection excludes knowledge ids and counts while retaining the source audit', async () => {
    const i = ok(await act('itemCreate', proposal()));
    await mode('equipment_model', model);
    for (const [type, id] of [['knowledge_model', model], ['knowledge_item', i.data.id]]) {
      const query = async (targetId: string) => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/platform/audit-trail/search', headers: headers(), payload: { type, targetId } });
        expect(res.statusCode).toBe(200);
        return { ...res.json(), correlationId: undefined };
      };
      expect(await query(id)).toEqual(await query(randomUUID()));
      expect((await sql('select count(*)::int as n from core.audit_log where subject_type = $1 and subject_id = $2', [type, id])).rows[0].n).toBeGreaterThan(0);
    }
  });

  it('C6: apply rechecks the SW parent inside the row transaction after validation and sealing', async () => {
    const j = await stageSoftware();
    beforeRow = async () => { await mode('equipment_model', model); beforeRow = undefined; };
    const result = await act('importApply', { jobId: j.jobId, expectedPlanVersion: j.planVersion });
    expect(result.data).toEqual({ outcome: 'not_found' });
    expect((await sql('select apply_status, apply_error, result_target_id from knowledge.catalog_import_row where job_id = $1', [j.jobId])).rows[0]).toEqual({ apply_status: 'failed', apply_error: 'parent_missing', result_target_id: null });
    expect((await sql('select count(*)::int as n from knowledge.software_version where model_id = $1', [model])).rows[0].n).toBe(2);
    expect((await sql("select count(*)::int as n from core.audit_log where detail->'source'->>'importJobId' = $1", [j.jobId])).rows[0].n).toBe(0);
  });
  it.each(['model', 'software'])('C11: owner %s restriction while acquiring SHARE refuses create', async (kind) => {
    const target = kind === 'model' ? model : sw1;
    const field = kind === 'model' ? 'ownerModelId' : 'ownerSoftwareId';
    const table = kind === 'model' ? 'equipment_model' : 'software_version';
    const blocker = await migrate.pool.connect();
    let pending: Promise<Answer> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query(`update knowledge.${table} set access_mode = 'restricted', row_version = row_version + 1 where id = $1`, [target]);
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      pending = act('itemCreate', { ...proposal(), ownerModelId: undefined, [field]: target });
      const deadline = Date.now() + 10_000;
      while (!(await sql('select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))', [pid])).rowCount) {
        if (Date.now() > deadline) throw new Error('create never waited for owner lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await blocker.query('commit');
      expect((await pending).fieldErrors).toEqual([{ path: [field], code: 'not_found' }]);
      expect((await sql(`select count(*)::int as n from knowledge.knowledge_item where ${kind === 'model' ? 'owner_model_id' : 'owner_software_id'} = $1`, [target])).rows[0].n).toBe(0);
    } finally { await blocker.query('rollback'); blocker.release(); await pending; }
  }, 20_000);
  it.each(['deny', 'revoke'])('C11: %s during the Item lock wait prevents conflict/version disclosure', async (effect) => {
    const i = ok(await act('itemCreate', proposal()));
    let ruleId: string | undefined;
    if (effect === 'revoke') {
      await mode('knowledge_item', i.data.id);
      ruleId = ok(await act('accessRuleAdd', { targetKind: 'item', targetId: i.data.id, granteeId: viewer.id, effect: 'allow' }, { who: manager })).data.ruleId;
    }
    const blocker = await migrate.pool.connect();
    let pending: Promise<Answer> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query('select id from knowledge.knowledge_item where id = $1 for update', [i.data.id]);
      if (effect === 'deny') await blocker.query("insert into knowledge.object_access_rule (workspace_id, target_kind, target_id, grantee_id, effect, created_by) values ($1,'item',$2,$3,'deny',$4)", [WS, i.data.id, viewer.id, manager.id]);
      else await blocker.query('update knowledge.object_access_rule set revoked_at = now(), revoked_by = $2 where rule_id = $1', [ruleId, manager.id]);
      const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0].pid;
      pending = act('itemSetArchived', { id: i.data.id, archived: true }, { version: '999' });
      const deadline = Date.now() + 10_000;
      while (!(await sql('select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))', [pid])).rowCount) {
        if (Date.now() > deadline) throw new Error('write never waited for Item lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await blocker.query('commit');
      expect((await pending).outcome).toBe('not_found');
      expect((await sql('select publication_state from knowledge.knowledge_item where id = $1', [i.data.id])).rows[0].publication_state).toBe('published');
    } finally { await blocker.query('rollback'); blocker.release(); await pending; }
  }, 20_000);

  it('C8: populated subjects, mapping, evidence, assessment and derived links remain hidden on revise replay', async () => {
    await publish();
    const m = ok(await act('conceptPropose', { modelId: model, targetKind: 'module', target: { module: 'Motor' }, canonicalLabel: `${TAG}-${serial++}` }));
    ok(await act('conceptConfirm', { mappingId: m.data.mappingId }, { version: '1' }));
    const body = { ...proposal(), subjects: [{ modelId: model, targetKind: 'event', target: { module: 'Motor', event: 'Start' } }], evidence: [{ sourceKind: 'log_file', sourceOwner: 'fixture', sourceRef: 'motor.log', locator: 'line 1' }] };
    const i = ok(await act('itemCreate', body));
    const assessed = ok(await act('itemAssess', { id: i.data.id, dimension: 'verification', newState: 'observed', rationale: 'Observed in fixture' }, { version: i.version }));
    const derived = ok(await act('itemDerive', { ...proposal(), sourceItemId: i.data.id, sourceRevisionNo: 1 }));
    const key = randomUUID();
    const input = { ...body, id: i.data.id, ownerModelId: undefined, observation: 'Observed motor stop', changeNote: 'New observation' };
    ok(await act('itemRevise', input, { version: assessed.version, key }));
    await mode('knowledge_item', i.data.id);
    const replay = await act('itemRevise', input, { version: assessed.version, key });
    expect(replay.outcome).toBe('not_found'); expect(replay.version).toBeNull();
    expect((await read('logKnowledge.itemDetail', { itemId: i.data.id, revisionNo: 1 })).data).toBeNull();
    expect(JSON.stringify((await read('logKnowledge.itemDetail', { itemId: derived.data.id })).data)).not.toContain(i.data.id);
    const counts = (await sql('select (select count(*) from knowledge.knowledge_item_revision where item_id = $1)::int as revisions, (select count(*) from knowledge.item_revision_subject where item_id = $1)::int as subjects, (select count(*) from knowledge.item_revision_evidence where item_id = $1)::int as evidence, (select count(*) from knowledge.item_assessment_event where item_id = $1)::int as assessments', [i.data.id])).rows[0];
    expect(counts).toEqual({ revisions: 2, subjects: 2, evidence: 2, assessments: 1 });
  });

  it('C2: a system Actor gets no coverage bypass; allow expiry and revoke affect summary immediately', async () => {
    await publish();
    const external = `${TAG}-system-${serial++}`;
    const system = (await sql("insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$2 || '@local',$2,'user','system') returning id", [WS, external])).rows[0].id as string;
    people.push(system);
    await sql("insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id) values ($1,$2,'workspace.read',$3)", [WS, system, manager.id]);
    const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
    const token = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
    await sql("insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,'service','fixture',$3,$4,ARRAY['workspace.read'],$5)", [WS, system, prefix, hashToken(token), manager.id]);
    const summary = async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { authorization: `Bearer ${token}` }, payload: { endpoint: 'logRules.coverageSummary', context: {}, params: { modelIds: [model] } } });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<Answer>().outcome).toBe('ok');
      return res.json<Answer>().data.rows[0];
    };
    await mode('equipment_model', model);
    expect(await summary()).toEqual({ modelId: model, computable: false, reason: 'model_unknown' });
    const allow = ok(await act('accessRuleAdd', { targetKind: 'model', targetId: model, granteeId: system, effect: 'allow' }, { who: manager }));
    expect((await summary()).reason).not.toBe('model_unknown');
    await sql("update knowledge.object_access_rule set valid_until = '2020-01-01' where rule_id = $1", [allow.data.ruleId]);
    expect((await summary()).reason).toBe('model_unknown');
    const next = ok(await act('accessRuleAdd', { targetKind: 'model', targetId: model, granteeId: system, effect: 'allow' }, { who: manager }));
    ok(await act('accessRuleRevoke', { ruleId: next.data.ruleId }, { who: manager }));
    expect((await summary()).reason).toBe('model_unknown');
  });

  it.each(['raw-parent', 'existing-target'])('C5: %s cells are hidden even before validation or without apply', async (scenario) => {
    const j = await stageSoftware(scenario !== 'raw-parent', scenario === 'existing-target' ? '1' : 'new-sw');
    await mode(scenario === 'raw-parent' ? 'equipment_model' : 'software_version', scenario === 'raw-parent' ? model : sw1);
    expect((await read('logKnowledge.importDetail', { jobId: j.jobId })).data).toBeNull();
    const csv = await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${j.jobId}/report.csv`, headers: headers() });
    expect(csv.statusCode).toBe(404);
    expect(csv.body).not.toContain(TAG);
  });

});
