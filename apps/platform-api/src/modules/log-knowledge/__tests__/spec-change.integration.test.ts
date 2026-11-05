// #1196 c — SW change rows (migration 0096): the three actions, the publish flag step, the effective read and the change
// list through the real `buildServer` over `/api/v1/menu-action` and `/api/v1/menu-query` against a real Postgres
// (throwaway DB only; app as platform_app, fixtures and cleanup as platform_migrate). Needs migration 0096.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { defined } from '../../../test-support/defined.js';
import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ISC${randomUUID().slice(0, 6).toUpperCase()}`;
const DOC = (docVersion = 'v1') => ({ docLabel: 'Synthetic log spec', docVersion });

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
}
type Row = Record<string, unknown>;

const field = (name: string) => ({ name, type: 'float', unit: 'rpm', description: `${name} value` });
/** Revision content; `startTrigger` is the one knob the publish tests turn. */
const content = (startTrigger = 'on start') => ({
  modules: [{ name: 'Spindle' }, { name: 'Spindle Motor', parentModule: 'spindle' }],
  events: [
    { module: 'Spindle', name: 'Start', fields: [field('speed')], triggerRule: startTrigger },
    { module: 'Spindle Motor', name: 'Run', fields: [] },
    { module: 'Spindle Motor', name: 'Stop', fields: [field('speed')] },
  ],
  relations: [{ sourceModule: 'Spindle', sourceEvent: 'Start', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Run' }],
});
const START = { module: 'Spindle', event: 'Start' };
const STOP = { module: 'Spindle Motor', event: 'Stop' };
const startBefore = { name: 'Start', triggerRule: 'on start', detailDocRef: null };
const startChange = (after = 'on press') => ({ before: startBefore, after: { name: 'Start', triggerRule: after, detailDocRef: null } });

describe.skipIf(!runIntegration)('SW change rows (#1196 c)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
  let otherWorkspace = '';
  let foreignModel = '';
  let foreignChange = '';
  let vendorId = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(action: string, input: Record<string, unknown>, opts: { who?: Person; expectedVersion?: string; key?: string } = {}): Promise<Answer> {
    const who = opts.who ?? admin;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logKnowledge.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logKnowledge.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  async function newModel(label: string, workspace = WORKSPACE_ID, vendor = vendorId): Promise<string> {
    const code = `${TAG}-${label}`;
    return one(
      `insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`,
      [workspace, vendor, code, toCodeKey(code), admin.id],
    );
  }
  /** release_order is assigned by the insert trigger (max + 1 of the model). */
  async function newSoftware(model: string, label: string, workspace = WORKSPACE_ID): Promise<string> {
    return one(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`,
      [workspace, model, label, toCodeKey(label), admin.id],
    );
  }
  /** Draft → save → publish; answers the published revision id. */
  async function publishRevision(model: string, body = content()): Promise<string> {
    const created = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC() });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    const saved = await act('specDraftSave', { revisionId: created.data.revisionId, mode: 'append', ...body }, { expectedVersion: created.data.version });
    expect(saved.outcome, JSON.stringify(saved)).toBe('ok');
    const published = await act('specPublish', { revisionId: created.data.revisionId }, { expectedVersion: saved.version as string });
    expect(published.data.outcome, JSON.stringify(published)).toBe('published');
    return created.data.revisionId as string;
  }
  /** A model with revision 1 published and three versions SW1 < SW2 < SW3. */
  async function fixture(label: string) {
    const model = await newModel(label);
    const rev = await publishRevision(model);
    const [sw1, sw2, sw3] = [await newSoftware(model, `${label}-1`), await newSoftware(model, `${label}-2`), await newSoftware(model, `${label}-3`)];
    return { model, rev, sw1: defined(sw1), sw2: defined(sw2), sw3: defined(sw3) };
  }
  const addInput = (model: string, softwareId: string, over: Record<string, unknown> = {}) => ({
    modelId: model,
    softwareId,
    targetKind: 'event',
    target: START,
    changeKind: 'changed',
    change: startChange(),
    ...over,
  });
  async function add(model: string, softwareId: string, over: Record<string, unknown> = {}, who: Person = admin) {
    const a = await act('specChangeAdd', addInput(model, softwareId, over), { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.data.changeId as string;
  }
  const changeRow = async (id: string) => (await sql('select * from knowledge.spec_sw_change where id = $1', [id])).rows[0] as Row;
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id]))
      .rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];

  async function waitForLockWaiters(what: string, blockers: number[], count: number, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const rows: { pid: number; blockers: number[] }[] = (await appSql('select pid, pg_blocking_pids(pid) as blockers from pg_locks where not granted group by pid')).rows;
      const chained = new Set<number>(blockers);
      let grew = true;
      while (grew) {
        grew = false;
        for (const { pid, blockers: blocking } of rows) {
          if (!chained.has(pid) && blocking.some((b) => chained.has(b))) {
            chained.add(pid);
            grew = true;
          }
        }
      }
      if (chained.size - blockers.length >= count) return;
      if (Date.now() > deadline) throw new Error(`${what}: only ${chained.size - blockers.length} of ${count} queued lock waiters observed`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    developer = await person('developer');
    developerGranted = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'knowledge.spec.publish', null, $3)`,
      [WORKSPACE_ID, developerGranted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    const vendorCode = `${TAG}-v`;
    vendorId = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [WORKSPACE_ID, vendorCode, toCodeKey(vendorCode), admin.id]);
    const foreignVendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [otherWorkspace, `${TAG}-fv`, toCodeKey(`${TAG}-fv`), admin.id]);
    foreignModel = await newModel('fm', otherWorkspace, foreignVendor);
    // A change row of the other workspace (inserted as the migrate role: the app has no session there).
    const foreignSw = await newSoftware(foreignModel, 'fsw', otherWorkspace);
    const foreignRev = await one(
      `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, content_sha256, schema_version, created_by, published_by, published_at) values ($1,$2,1,'published',$3,$4,1,$5,$5,now()) returning id`,
      [otherWorkspace, foreignModel, JSON.stringify(DOC()), 'a'.repeat(64), admin.id],
    );
    expect(foreignRev).toBeTruthy();
    foreignChange = await one(
      `insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, note, based_on_rev_no, created_by) values ($1,$2,$3,'event','X/Y','behavior','{}','n',1,$4) returning id`,
      [otherWorkspace, foreignModel, foreignSw, admin.id],
    );
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql('delete from knowledge.spec_sw_change where created_by = any($1)', [actorIds]);
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.software_version where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.equipment_model where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.vendor where created_by = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('permissions and isolation', () => {
    it('a User and a Developer without the capability are refused; a granted Developer writes; a foreign model or change is not found', async () => {
      const f = await fixture('perm');
      const input = addInput(f.model, f.sw1);
      expect((await act('specChangeAdd', input, { who: user })).outcome).toBe('forbidden');
      expect((await act('specChangeAdd', input, { who: developer })).outcome).toBe('forbidden');
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(0);
      const granted = await act('specChangeAdd', input, { who: developerGranted });
      expect(granted.outcome, JSON.stringify(granted)).toBe('ok');
      expect((await changeRow(granted.data.changeId)).created_by).toBe(developerGranted.id);
      expect(fe(await act('specChangeAdd', addInput(foreignModel, f.sw1)))).toEqual(['modelId:not_found']);
      expect((await act('specChangeConfirm', { changeId: foreignChange }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await act('specChangeRetire', { changeId: foreignChange }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await changeRow(foreignChange)).retired_at).toBeNull();
    });
  });

  describe('specChangeAdd', () => {
    it('writes the row against the current published revision, answers { changeId } and audits without any body text', async () => {
      const f = await fixture('add');
      const a = await act('specChangeAdd', addInput(f.model, f.sw2, { note: 'secret note text', evidenceRef: 'ticket 7' }));
      expect(a).toMatchObject({ outcome: 'ok', version: null, data: { changeId: expect.any(String) } });
      expect(await changeRow(a.data.changeId)).toMatchObject({
        workspace_id: WORKSPACE_ID, model_id: f.model, software_id: f.sw2, ends_before_software_id: null, target_kind: 'event',
        target_key: 'SPINDLE/START', change_kind: 'changed', note: 'secret note text', evidence_ref: 'ticket 7', based_on_rev_no: 1,
        needs_revalidation: false, revalidation_rev_no: null, retired_at: null, retired_by_change_id: null, created_by: admin.id, row_version: 1,
        change_json: { before: startBefore, after: { name: 'Start', triggerRule: 'on press', detailDocRef: null } },
      });
      const trail = await audit(a.data.changeId);
      expect(trail).toEqual([
        {
          event_type: 'knowledge.spec.change_added', subject_type: 'knowledge_model_spec', actor_id: admin.id,
          detail: { modelId: f.model, changeId: a.data.changeId, softwareId: f.sw2, endsBeforeSoftwareId: null, targetKind: 'event', changeKind: 'changed', basedOnRevNo: 1 },
        },
      ]);
      expect(JSON.stringify(trail)).not.toContain('secret note text');
      expect(JSON.stringify(trail)).not.toContain('SPINDLE/START');
    });

    it('is visible through the audit projection (the existing subject type and capability)', async () => {
      const f = await fixture('auditproj');
      const id = await add(f.model, f.sw1);
      const { rows } = await appSql(
        `select event_type, subject_type from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = $3`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), id],
      );
      expect(rows).toEqual([{ event_type: 'knowledge.spec.change_added', subject_type: 'knowledge_model_spec' }]);
    });

    it('a replay with the same idempotency key answers the stored result and writes one row', async () => {
      const f = await fixture('replay');
      const key = randomUUID();
      const first = await act('specChangeAdd', addInput(f.model, f.sw1), { key });
      const again = await act('specChangeAdd', addInput(f.model, f.sw1), { key });
      expect(again).toMatchObject({ outcome: 'ok', data: first.data });
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(1);
    });

    it('refuses a model with no published revision', async () => {
      const model = await newModel('nopub');
      const sw = await newSoftware(model, 'nopub-1');
      const draft = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC() });
      expect(draft.outcome).toBe('ok');
      expect(fe(await act('specChangeAdd', addInput(model, sw)))).toEqual(['revision:none_published']);
    });

    it('judges the target key against the published revision: not_found for changed|removed|behavior, already_exists for added, a missing parent', async () => {
      const f = await fixture('keys');
      const ghost = { module: 'Spindle', event: 'Ghost' };
      const ghostBefore = { name: 'Ghost', triggerRule: null, detailDocRef: null };
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { target: ghost, change: { before: ghostBefore, after: { ...ghostBefore, triggerRule: 'x' } } })))).toEqual(['targetKey:not_found']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { target: ghost, changeKind: 'removed', change: { before: ghostBefore } })))).toEqual(['targetKey:not_found']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { target: ghost, changeKind: 'behavior', change: {}, note: 'n' })))).toEqual(['targetKey:not_found']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { changeKind: 'added', change: { after: { name: 'Start' } } })))).toEqual(['targetKey:already_exists']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { target: { module: 'Nope', event: 'New' }, changeKind: 'added', change: { after: { name: 'New' } } })))).toEqual(['targetKey:not_found']);
      const added = await act('specChangeAdd', addInput(f.model, f.sw1, { target: { module: 'Spindle', event: 'Brake' }, changeKind: 'added', change: { after: { name: 'Brake' } } }));
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      // a field and a relation of the published revision
      const fieldKey = await act('specChangeAdd', addInput(f.model, f.sw1, { targetKind: 'field', target: { ...START, field: 'speed' }, changeKind: 'behavior', change: {}, note: 'rounds' }));
      expect(fieldKey.outcome, JSON.stringify(fieldKey)).toBe('ok');
      const rel = { sourceModule: 'Spindle', sourceEvent: 'Start', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Run' };
      expect((await act('specChangeAdd', addInput(f.model, f.sw1, { targetKind: 'relation', target: rel, changeKind: 'changed', change: { before: { ruleRef: null }, after: { ruleRef: 'sec 4' } } }))).outcome).toBe('ok');
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { targetKind: 'relation', target: { ...rel, targetEvent: 'Ghost' }, changeKind: 'added', change: { after: {} } })))).toEqual(['targetKey:not_found']);
    });

    it('refuses a software version of another model or workspace, and an end that is not after the start', async () => {
      const f = await fixture('sw');
      const other = await fixture('sw-other');
      expect(fe(await act('specChangeAdd', addInput(f.model, other.sw1)))).toEqual(['softwareId:not_found']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { endsBeforeSoftwareId: other.sw3 })))).toEqual(['endsBeforeSoftwareId:not_found']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw2, { endsBeforeSoftwareId: f.sw1 })))).toEqual(['endsBeforeSoftwareId:not_after_start']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw2, { endsBeforeSoftwareId: f.sw2 })))).toEqual(['endsBeforeSoftwareId:not_after_start']);
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(0);
    });

    it('the database also refuses a cross-model software reference (composite FK)', async () => {
      const f = await fixture('fk');
      const other = await fixture('fk-other');
      await expect(
        sql(
          `insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, based_on_rev_no, created_by) values ($1,$2,$3,'event','X/Y','behavior','{}',1,$4)`,
          [WORKSPACE_ID, f.model, other.sw1, admin.id],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('overlapping open changes of one key are range:overlap; adjacent ranges, other keys and retired rows are not', async () => {
      const f = await fixture('overlap');
      await add(f.model, f.sw1, { endsBeforeSoftwareId: f.sw2 }); // [1,2)
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1)))).toEqual(['range:overlap']);
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, { endsBeforeSoftwareId: f.sw3 })))).toEqual(['range:overlap']);
      const second = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3 }); // [2,3) touches [1,2) only at the open end
      await add(f.model, f.sw1, { target: STOP, change: { before: { name: 'Stop', triggerRule: null, detailDocRef: null }, after: { name: 'Stop', triggerRule: 'x', detailDocRef: null } } });
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw2)))).toEqual(['range:overlap']);
      const row = await changeRow(second);
      const retired = await act('specChangeRetire', { changeId: second }, { expectedVersion: String(row.row_version) });
      expect(retired.outcome, JSON.stringify(retired)).toBe('ok');
      expect((await act('specChangeAdd', addInput(f.model, f.sw2))).outcome).toBe('ok');
    });

    it('caps the open changes of a model at 500 (changes:too_many) and retired rows do not count', async () => {
      const f = await fixture('cap');
      await sql(
        `insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, based_on_rev_no, created_by)
         select $1,$2,$3,'event','FILLER/'||g,'behavior','{}',1,$4 from generate_series(1, 500) g`,
        [WORKSPACE_ID, f.model, f.sw1, admin.id],
      );
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1)))).toEqual(['changes:too_many']);
      await sql(`update knowledge.spec_sw_change set retired_at = now(), retired_by = $2, row_version = row_version + 1 where model_id = $1 and target_key = 'FILLER/1'`, [f.model, admin.id]);
      expect((await act('specChangeAdd', addInput(f.model, f.sw1))).outcome).toBe('ok');
    });

    it('inserts a change of exactly 16 KiB serialized (jsonb text spacing sits inside the 17 KiB wall); one byte more is change:too_large, never a server error', async () => {
      const f = await fixture('capj');
      const at = (total: number) => {
        const structural = JSON.stringify({ after: { name: 'temp', type: 'enum', description: '', allowedValues: Array.from({ length: 78 }, () => 'v'.repeat(200)) } }).length;
        return { targetKind: 'field', target: { ...START, field: 'temp' }, changeKind: 'added', change: { after: { name: 'temp', type: 'enum', description: 'v'.repeat(total - structural), allowedValues: Array.from({ length: 78 }, () => 'v'.repeat(200)) } } };
      };
      expect(JSON.stringify(at(16384).change)).toHaveLength(16384);
      const ok = await act('specChangeAdd', addInput(f.model, f.sw1, at(16384)));
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      expect(fe(await act('specChangeAdd', addInput(f.model, f.sw1, at(16385))))).toEqual(['change:too_large']);
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(1);
    });
  });

  describe('append-only table', () => {
    it('the runtime role cannot DELETE nor UPDATE a content column; the trigger guards the migrate role too', async () => {
      const f = await fixture('guard');
      const id = await add(f.model, f.sw1);
      await expect(appSql('delete from knowledge.spec_sw_change where id = $1', [id])).rejects.toMatchObject({ code: '42501' });
      for (const column of ['note', 'change_json', 'target_key', 'change_kind', 'software_id', 'based_on_rev_no']) {
        const value = column === 'change_json' ? `'{}'::jsonb` : column === 'software_id' ? `'${f.sw2}'::uuid` : column === 'based_on_rev_no' ? '9' : `'x'`;
        await expect(appSql(`update knowledge.spec_sw_change set ${column} = ${value} where id = $1`, [id]), column).rejects.toMatchObject({ code: '42501' });
        await expect(sql(`update knowledge.spec_sw_change set ${column} = ${value}, row_version = row_version + 1 where id = $1`, [id]), `trigger ${column}`).rejects.toMatchObject({ code: '23514' });
      }
      await expect(sql('delete from knowledge.spec_sw_change where id = $1', [id])).resolves.toBeDefined(); // owner may; the runtime role may not
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where id = $1', [id])).rows[0].n).toBe(0);
    });

    it('row_version must rise by exactly 1; a retired row never changes; a flag needs a revision number', async () => {
      const f = await fixture('guard2');
      const id = await add(f.model, f.sw1);
      await expect(appSql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 1 where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 1, row_version = row_version + 2 where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql('update knowledge.spec_sw_change set needs_revalidation = true, row_version = row_version + 1 where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
      await appSql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 1, row_version = row_version + 1 where id = $1', [id]);
      await appSql('update knowledge.spec_sw_change set needs_revalidation = false, retired_at = now(), retired_by = $2, row_version = row_version + 1 where id = $1', [id, admin.id]);
      await expect(appSql('update knowledge.spec_sw_change set retired_at = null, retired_by = null, row_version = row_version + 1 where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 2, row_version = row_version + 1 where id = $1', [id])).rejects.toBeDefined();
    });

    it('the guard rejects a retired_by_change_id at the row itself or another target (direct role); a same-key row passes', async () => {
      const f = await fixture('guard3');
      const a = await add(f.model, f.sw1, { endsBeforeSoftwareId: f.sw2 }); // SPINDLE/START [1,2)
      const sameKey = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3 }); // SPINDLE/START [2,3)
      const otherKey = await add(f.model, f.sw1, { target: STOP, changeKind: 'behavior', change: {}, note: 'n' }); // SPINDLE MOTOR/STOP [1,∞)
      const retire = (target: string) =>
        sql(`update knowledge.spec_sw_change set retired_at = now(), retired_by = $2, retired_by_change_id = $3, row_version = row_version + 1 where id = $1`, [a, admin.id, target]);
      await expect(retire(otherKey), 'another target').rejects.toMatchObject({ code: '23514' });
      await expect(retire(a), 'self reference').rejects.toMatchObject({ code: '23514' });
      await expect(retire(sameKey), 'same target').resolves.toBeDefined();
      expect(await changeRow(a)).toMatchObject({ retired_by_change_id: sameKey, row_version: 2, needs_revalidation: false });
    });
  });

  describe('specChangeRetire and specChangeConfirm', () => {
    it('a plain retire closes the row, clears a flag and audits; a second retire is change:already_retired', async () => {
      const f = await fixture('retire');
      const id = await add(f.model, f.sw1);
      await sql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 1, row_version = row_version + 1 where id = $1', [id]);
      const a = await act('specChangeRetire', { changeId: id }, { expectedVersion: '2' });
      expect(a).toMatchObject({ outcome: 'ok', version: '3', data: { changeId: id } });
      expect(await changeRow(id)).toMatchObject({ retired_by: admin.id, retired_by_change_id: null, needs_revalidation: false, row_version: 3 });
      expect((await changeRow(id)).retired_at).not.toBeNull();
      expect((await audit(id)).at(-1)).toMatchObject({ event_type: 'knowledge.spec.change_retired', detail: { modelId: f.model, changeId: id } });
      const again = await act('specChangeRetire', { changeId: id }, { expectedVersion: '3' });
      expect(again.outcome).toBe('invalid');
      expect(fe(again)).toEqual(['change:already_retired']);
      expect((await act('specChangeRetire', { changeId: id }, { expectedVersion: '2' })).outcome).toBe('conflict');
    });

    it('a replacement is inserted first, then the old row is retired and points at it (same key, same transaction)', async () => {
      const f = await fixture('replace');
      const id = await add(f.model, f.sw1);
      const replacement = { softwareId: f.sw2, targetKind: 'event', target: START, changeKind: 'changed', change: startChange('on release'), note: 'narrowed' };
      const a = await act('specChangeRetire', { changeId: id, replacement }, { expectedVersion: '1' });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const fresh = a.data.replacementChangeId as string;
      expect(await changeRow(id)).toMatchObject({ retired_by_change_id: fresh, row_version: 2 });
      expect(await changeRow(fresh)).toMatchObject({ software_id: f.sw2, target_key: 'SPINDLE/START', retired_at: null, note: 'narrowed', based_on_rev_no: 1 });
      const added = (await audit(fresh)).at(-1);
      expect(added).toMatchObject({ event_type: 'knowledge.spec.change_added', detail: { replacesChangeId: id } });
      expect((await audit(id)).at(-1)?.detail).toMatchObject({ replacementChangeId: fresh });
    });

    it('a replacement of another target is replacement:target_mismatch and nothing changes; an invalid replacement rolls the retire back', async () => {
      const f = await fixture('replace2');
      const id = await add(f.model, f.sw1);
      const wrong = { softwareId: f.sw2, targetKind: 'event', target: STOP, changeKind: 'behavior', change: {}, note: 'n' };
      expect(fe(await act('specChangeRetire', { changeId: id, replacement: wrong }, { expectedVersion: '1' }))).toEqual(['replacement:target_mismatch']);
      const badSoftware = { ...wrong, target: START, softwareId: randomUUID() };
      expect(fe(await act('specChangeRetire', { changeId: id, replacement: badSoftware }, { expectedVersion: '1' }))).toEqual(['replacement.softwareId:not_found']);
      expect(await changeRow(id)).toMatchObject({ retired_at: null, row_version: 1 });
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(1);
    });

    it('a replacement of exactly 16 KiB serialized inserts; one byte more is replacement.change:too_large and retires nothing', async () => {
      const f = await fixture('caprep');
      const speedField = { name: 'speed', type: 'float', unit: 'rpm', description: 'speed value' };
      const at = (total: number) => {
        const allowedValues = Array.from({ length: 76 }, () => 'v'.repeat(200));
        const structural = JSON.stringify({ before: speedField, after: { ...speedField, description: '', allowedValues } }).length;
        return { targetKind: 'field', target: { ...START, field: 'speed' }, changeKind: 'changed', change: { before: speedField, after: { ...speedField, description: 'v'.repeat(total - structural), allowedValues } } };
      };
      expect(JSON.stringify(at(16384).change)).toHaveLength(16384);
      const a = await add(f.model, f.sw1, { endsBeforeSoftwareId: f.sw2, targetKind: 'field', target: { ...START, field: 'speed' }, changeKind: 'behavior', change: {}, note: 'a' }); // [1,2)
      const c = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3, targetKind: 'field', target: { ...START, field: 'speed' }, changeKind: 'behavior', change: {}, note: 'c' }); // [2,3)
      const ok = await act('specChangeRetire', { changeId: a, replacement: { ...at(16384), softwareId: f.sw1, endsBeforeSoftwareId: f.sw2 } }, { expectedVersion: '1' });
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      const over = await act('specChangeRetire', { changeId: c, replacement: { ...at(16385), softwareId: f.sw2, endsBeforeSoftwareId: f.sw3 } }, { expectedVersion: '1' });
      expect(over.outcome).toBe('invalid');
      expect(fe(over)).toEqual(['replacement.change:too_large']);
      expect(await changeRow(c)).toMatchObject({ retired_at: null, row_version: 1 });
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(3); // a retired + its replacement + c open
    });

    it('confirm clears the flag, keeps the content, bumps the version and audits; unflagged is needsRevalidation:not_set', async () => {
      const f = await fixture('confirm');
      const id = await add(f.model, f.sw1, { note: 'keep me' });
      const refused = await act('specChangeConfirm', { changeId: id }, { expectedVersion: '1' });
      expect(refused.outcome).toBe('invalid');
      expect(fe(refused)).toEqual(['needsRevalidation:not_set']);
      await sql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 2, row_version = row_version + 1 where id = $1', [id]);
      const before = await changeRow(id);
      const a = await act('specChangeConfirm', { changeId: id }, { expectedVersion: '2' });
      expect(a).toMatchObject({ outcome: 'ok', version: '3', data: { changeId: id } });
      const after = await changeRow(id);
      expect(after).toMatchObject({ needs_revalidation: false, revalidation_rev_no: 2, row_version: 3, note: 'keep me' });
      expect({ ...after, needs_revalidation: null, row_version: null }).toEqual({ ...before, needs_revalidation: null, row_version: null });
      expect((await audit(id)).at(-1)).toMatchObject({ event_type: 'knowledge.spec.change_confirmed', detail: { revalidationRevNo: 2 } });
      expect((await act('specChangeConfirm', { changeId: id }, { expectedVersion: '2' })).outcome).toBe('conflict');
      expect(fe(await act('specChangeConfirm', { changeId: id }, { expectedVersion: '3' }))).toEqual(['needsRevalidation:not_set']);
    });

    it('an unknown change id is not_found', async () => {
      expect((await act('specChangeConfirm', { changeId: randomUUID() }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await act('specChangeRetire', { changeId: randomUUID() }, { expectedVersion: '1' })).outcome).toBe('not_found');
    });
  });

  describe('needs_revalidation at publish', () => {
    it('flags exactly the open changes on a key the new revision changes, with the revision number as cause', async () => {
      const f = await fixture('flag');
      const onStart = await add(f.model, f.sw1);
      const onStop = await add(f.model, f.sw1, { target: STOP, changeKind: 'behavior', change: {}, note: 'n' });
      const onField = await add(f.model, f.sw1, { targetKind: 'field', target: { ...START, field: 'speed' }, changeKind: 'behavior', change: {}, note: 'f' });
      const retired = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3, target: { module: 'Spindle Motor', event: 'Run' }, changeKind: 'behavior', change: {}, note: 'r' });
      await act('specChangeRetire', { changeId: retired }, { expectedVersion: '1' });
      const rev2 = await publishRevision(f.model, content('on press'));
      expect((await changeRow(onStart))).toMatchObject({ needs_revalidation: true, revalidation_rev_no: 2, row_version: 2 });
      for (const id of [onStop, onField]) expect(await changeRow(id), id).toMatchObject({ needs_revalidation: false, revalidation_rev_no: null, row_version: 1 });
      expect(await changeRow(retired)).toMatchObject({ needs_revalidation: false, revalidation_rev_no: null });
      const published = (await audit(rev2)).at(-1);
      expect(published).toMatchObject({ event_type: 'knowledge.spec.published', detail: { outcome: 'published', revisionNo: 2, flagged: 1 } });
    });

    it('a publish touching no key of an open change flags nothing; the same content again is unchanged and flags nothing', async () => {
      const f = await fixture('noflag');
      const onStop = await add(f.model, f.sw1, { target: STOP, changeKind: 'behavior', change: {}, note: 'n' });
      await publishRevision(f.model, content('on press')); // touches Start only
      expect(await changeRow(onStop)).toMatchObject({ needs_revalidation: false, row_version: 1 });
      const draft = await act('specDraftCreate', { modelId: f.model, sourceDocRef: DOC('v3') });
      const saved = await act('specDraftSave', { revisionId: draft.data.revisionId, mode: 'append', ...content('on press') }, { expectedVersion: draft.data.version });
      const unchanged = await act('specPublish', { revisionId: draft.data.revisionId }, { expectedVersion: saved.version as string });
      expect(unchanged.data.outcome).toBe('unchanged');
      expect(await changeRow(onStop)).toMatchObject({ needs_revalidation: false, row_version: 1 });
    });

    it('a re-flag moves the cause to the newer revision; confirm clears it', async () => {
      const f = await fixture('reflag');
      const id = await add(f.model, f.sw1);
      await publishRevision(f.model, content('on press'));
      await publishRevision(f.model, content('on release'));
      expect(await changeRow(id)).toMatchObject({ needs_revalidation: true, revalidation_rev_no: 3, row_version: 3 });
      const confirmed = await act('specChangeConfirm', { changeId: id }, { expectedVersion: '3' });
      expect(confirmed.outcome, JSON.stringify(confirmed)).toBe('ok');
      expect(await changeRow(id)).toMatchObject({ needs_revalidation: false });
    });

    it('is all-or-nothing: a failure in the flag step leaves the draft unpublished and every row untouched', async () => {
      const f = await fixture('atomic');
      const id = await add(f.model, f.sw1);
      const draft = await act('specDraftCreate', { modelId: f.model, sourceDocRef: DOC('v2') });
      const saved = await act('specDraftSave', { revisionId: draft.data.revisionId, mode: 'append', ...content('on press') }, { expectedVersion: draft.data.version });
      // Inject the failure into the flag step only: an UPDATE trigger that always raises (dropped again below).
      await sql(`create function knowledge.fail_flag_${TAG.toLowerCase()}() returns trigger language plpgsql as $f$ begin raise exception 'injected flag failure'; end $f$`);
      await sql(`create trigger fail_flag_${TAG.toLowerCase()} before update on knowledge.spec_sw_change for each row execute function knowledge.fail_flag_${TAG.toLowerCase()}()`);
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/menu-action',
          headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf },
          payload: JSON.stringify({ action: 'logKnowledge.specPublish', context: {}, input: { revisionId: draft.data.revisionId }, idempotencyKey: randomUUID(), expectedVersion: saved.version }),
        });
        expect(res.statusCode === 200 ? res.json<Answer>().outcome : 'http-error').not.toBe('ok');
      } finally {
        await sql(`drop trigger fail_flag_${TAG.toLowerCase()} on knowledge.spec_sw_change`);
        await sql(`drop function knowledge.fail_flag_${TAG.toLowerCase()}()`);
      }
      expect((await sql('select state, content_sha256 from knowledge.model_spec_revision where id = $1', [draft.data.revisionId])).rows[0]).toEqual({ state: 'draft', content_sha256: null });
      expect(await changeRow(id)).toMatchObject({ needs_revalidation: false, row_version: 1 });
      expect((await audit(draft.data.revisionId)).map((t) => t.event_type)).not.toContain('knowledge.spec.published');
      // the same publish succeeds once the fault is gone
      const ok = await act('specPublish', { revisionId: draft.data.revisionId }, { expectedVersion: saved.version as string });
      expect(ok.data.outcome).toBe('published');
      expect(await changeRow(id)).toMatchObject({ needs_revalidation: true, revalidation_rev_no: 2 });
    });
  });

  describe('publish racing an add on the same key (two connections)', () => {
    /**
     * Holds the model's change lock on a third connection, lets `start` queue both writers behind it in a known order
     * (each waits until the previous one is observed waiting in `pg_locks`), then releases the lock.
     */
    async function holdLock(model: string, start: (holderPid: number) => Promise<void>): Promise<void> {
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        const pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid as number;
        await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`spec-change:${WORKSPACE_ID}:${model}`]);
        await start(pid);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
    const draftFor = async (model: string) => {
      const draft = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC('v2') });
      const saved = await act('specDraftSave', { revisionId: draft.data.revisionId, mode: 'append', ...content('on press') }, { expectedVersion: draft.data.version });
      return { id: draft.data.revisionId as string, version: saved.version as string };
    };

    it('publish first: the add waits, reads the NEW revision as its basis and needs no flag', async () => {
      const f = await fixture('raceA');
      const draft = await draftFor(f.model);
      let publish: Promise<Answer> | undefined;
      let addition: Promise<Answer> | undefined;
      await holdLock(f.model, async (pid) => {
        publish = act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
        await waitForLockWaiters('publish queued', [pid], 1);
        addition = act('specChangeAdd', addInput(f.model, f.sw1));
        await waitForLockWaiters('add queued', [pid], 2);
      });
      expect((await defined(publish)).data.outcome).toBe('published');
      const added = await defined(addition);
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      expect(await changeRow(added.data.changeId)).toMatchObject({ based_on_rev_no: 2, needs_revalidation: false });
    });

    it('add first: the publish waits for the add to commit and then flags it', async () => {
      const f = await fixture('raceB');
      const draft = await draftFor(f.model);
      let publish: Promise<Answer> | undefined;
      let addition: Promise<Answer> | undefined;
      await holdLock(f.model, async (pid) => {
        addition = act('specChangeAdd', addInput(f.model, f.sw1));
        await waitForLockWaiters('add queued', [pid], 1);
        publish = act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
        await waitForLockWaiters('publish queued', [pid], 2);
      });
      const added = await defined(addition);
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      expect((await defined(publish)).data.outcome).toBe('published');
      expect(await changeRow(added.data.changeId)).toMatchObject({ based_on_rev_no: 1, needs_revalidation: true, revalidation_rev_no: 2 });
      // the invariant in one query: no open change written against an older revision sits unflagged on a key a newer revision touched
      const stale = await sql(
        `select count(*)::int as n from knowledge.spec_sw_change where model_id = $1 and retired_at is null and not needs_revalidation and target_key = 'SPINDLE/START' and based_on_rev_no < 2`,
        [f.model],
      );
      expect(stale.rows[0].n).toBe(0);
    });

    it('a mixed-case add queues on the same lock: the lowercase add serialises first, the uppercase second is range:overlap', async () => {
      const f = await fixture('raceC');
      let first: Promise<Answer> | undefined;
      let second: Promise<Answer> | undefined;
      await holdLock(f.model, async (pid) => {
        first = act('specChangeAdd', addInput(f.model, f.sw1));
        await waitForLockWaiters('first add queued', [pid], 1);
        second = act('specChangeAdd', addInput(f.model, f.sw1, { modelId: f.model.toUpperCase(), softwareId: f.sw1.toUpperCase() }));
        await waitForLockWaiters('uppercase add queued', [pid], 2);
      });
      expect((await defined(first)).outcome, JSON.stringify(await defined(first))).toBe('ok');
      const secondAnswer = await defined(second);
      expect(secondAnswer.outcome, JSON.stringify(secondAnswer)).toBe('invalid');
      expect(fe(secondAnswer)).toEqual(['range:overlap']);
      expect((await sql('select count(*)::int as n from knowledge.spec_sw_change where model_id = $1', [f.model])).rows[0].n).toBe(1);
    });

    it('a mixed-case add waits for the publish behind one lock and is flagged like a lowercase one', async () => {
      const f = await fixture('raceD');
      const draft = await draftFor(f.model);
      let addition: Promise<Answer> | undefined;
      let publish: Promise<Answer> | undefined;
      await holdLock(f.model, async (pid) => {
        addition = act('specChangeAdd', addInput(f.model, f.sw1, { modelId: f.model.toUpperCase(), softwareId: f.sw1.toUpperCase() }));
        await waitForLockWaiters('uppercase add queued', [pid], 1);
        publish = act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
        await waitForLockWaiters('publish queued', [pid], 2);
      });
      const added = await defined(addition);
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      expect((await defined(publish)).data.outcome).toBe('published');
      expect(await changeRow(added.data.changeId)).toMatchObject({ based_on_rev_no: 1, needs_revalidation: true, revalidation_rev_no: 2 });
    });
  });

  describe('effective spec (modelSpec with softwareId)', () => {
    it('with no change the answer is the model spec and effective:false; without softwareId the old shape has no effective key', async () => {
      const f = await fixture('eff0');
      const plain = await read('modelSpec', { modelId: f.model });
      expect(plain.data).not.toHaveProperty('effective');
      const effective = await read('modelSpec', { modelId: f.model, softwareId: f.sw2 });
      expect(effective.data).toEqual({ ...plain.data, effective: false });
    });

    it('applies a change from its software version on, not before; ends_before excludes the end version', async () => {
      const f = await fixture('eff1');
      const id = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3 }); // [SW2, SW3)
      const at = async (sw: string) => (await read('modelSpec', { modelId: f.model, softwareId: sw })).data;
      expect(await at(f.sw1)).toMatchObject({ effective: false });
      const mid = await at(f.sw2);
      expect(mid).toMatchObject({ effective: true, softwareId: f.sw2, stale: [], removed: [] });
      const start = mid.events.find((e: { eventKey: string }) => e.eventKey === 'START');
      expect(start).toMatchObject({
        origin: 'revision', triggerRule: 'on press', needsRevalidation: false,
        changed: [{ changeId: id, changeKind: 'changed', targetKind: 'event', targetKey: 'SPINDLE/START' }],
      });
      expect(mid.events.filter((e: { changed: unknown[] }) => e.changed.length > 0)).toHaveLength(1);
      expect(await at(f.sw3)).toMatchObject({ effective: false });
    });

    it('an open-ended change keeps applying to later versions; added, removed and behavior changes are shown', async () => {
      const f = await fixture('eff2');
      await add(f.model, f.sw1, { target: { module: 'Spindle', event: 'Brake' }, changeKind: 'added', change: { after: { name: 'Brake', triggerRule: 'on stop', detailDocRef: null } } });
      await add(f.model, f.sw1, { target: STOP, changeKind: 'removed', change: { before: { name: 'Stop', triggerRule: null, detailDocRef: null } } });
      const behavior = await add(f.model, f.sw1, { target: { module: 'Spindle Motor', event: 'Run' }, changeKind: 'behavior', change: {}, note: 'fires twice' });
      const out = (await read('modelSpec', { modelId: f.model, softwareId: f.sw3 })).data;
      const brake = out.events.find((e: { eventKey: string }) => e.eventKey === 'BRAKE');
      expect(brake).toMatchObject({ id: null, origin: 'change', triggerRule: 'on stop' });
      expect(out.events.some((e: { eventKey: string }) => e.eventKey === 'STOP')).toBe(false);
      expect(out.removed).toHaveLength(1);
      expect(out.events.find((e: { eventKey: string }) => e.eventKey === 'RUN')).toMatchObject({ changed: [{ changeId: behavior, changeKind: 'behavior' }] });
    });

    it('carries needsRevalidation on the touched entry; a retired change no longer applies', async () => {
      const f = await fixture('eff3');
      const id = await add(f.model, f.sw1, { changeKind: 'behavior', change: {}, note: 'n' });
      await publishRevision(f.model, content('on press'));
      const flagged = (await read('modelSpec', { modelId: f.model, softwareId: f.sw1 })).data;
      expect(flagged.events.find((e: { eventKey: string }) => e.eventKey === 'START')).toMatchObject({ needsRevalidation: true });
      await act('specChangeRetire', { changeId: id }, { expectedVersion: '2' });
      expect((await read('modelSpec', { modelId: f.model, softwareId: f.sw1 })).data).toMatchObject({ effective: false });
    });

    it('a change whose before no longer matches the revision is reported stale, not applied', async () => {
      const f = await fixture('eff4');
      await add(f.model, f.sw1); // before: triggerRule 'on start'
      await publishRevision(f.model, content('on press')); // the revision moved on
      const out = (await read('modelSpec', { modelId: f.model, softwareId: f.sw2 })).data;
      expect(out.stale).toEqual([expect.objectContaining({ reason: 'before_mismatch', targetKey: 'SPINDLE/START' })]);
      expect(out.events.find((e: { eventKey: string }) => e.eventKey === 'START')).toMatchObject({ triggerRule: 'on press', changed: [] });
    });

    it('judges the range on the CURRENT release order: a reorder that empties the range turns the change off', async () => {
      const f = await fixture('eff5');
      await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3 });
      expect((await read('modelSpec', { modelId: f.model, softwareId: f.sw2 })).data).toMatchObject({ effective: true });
      await sql('update knowledge.software_version set release_order = 1 where id = $1', [f.sw3]); // end now before the start
      expect((await read('modelSpec', { modelId: f.model, softwareId: f.sw2 })).data).toMatchObject({ effective: false });
      expect((await read('modelSpec', { modelId: f.model, softwareId: f.sw3 })).data).toMatchObject({ effective: false });
    });

    it('two added ranges of one field that overlap only after a reorder compose to one keyed field, marks preserved', async () => {
      const f = await fixture('eff7');
      const first = await add(f.model, f.sw1, { endsBeforeSoftwareId: f.sw2, targetKind: 'field', target: { ...START, field: 'temp' }, changeKind: 'added', change: { after: { name: 'temp', type: 'float', description: 'a' } } }); // [1,2)
      const second = await add(f.model, f.sw3, { targetKind: 'field', target: { ...START, field: 'temp' }, changeKind: 'added', change: { after: { name: 'temp', type: 'float', description: 'b' } } }); // [3,∞)
      await sql('update knowledge.software_version set release_order = 3 where id = $1', [f.sw2]); // the ranges become [1,3) and [2,∞)
      await sql('update knowledge.software_version set release_order = 2 where id = $1', [f.sw3]); // both apply at sw3 (order 2)
      const out = (await read('modelSpec', { modelId: f.model, softwareId: f.sw3 })).data;
      const start = out.events.find((e: { eventKey: string }) => e.eventKey === 'START');
      expect((start.fields as { name: string; description: string }[]).filter((x) => x.name === 'temp')).toEqual([{ name: 'temp', type: 'float', description: 'b' }]);
      expect(start.changed.map((m: { changeId: string }) => m.changeId)).toEqual([first, second]);
      expect(out.stale).toEqual([]);
      const at1 = (await read('modelSpec', { modelId: f.model, softwareId: f.sw1 })).data; // only [1,3) applies here
      expect((at1.events.find((e: { eventKey: string }) => e.eventKey === 'START').fields as { name: string; description: string }[]).filter((x) => x.name === 'temp')).toEqual([{ name: 'temp', type: 'float', description: 'a' }]);
    });

    it('the apply order sorts by the full created_at precision: a submillisecond tie is not collapsed onto the id order', async () => {
      const f = await fixture('eff8');
      const idA = 'fffffff0-1111-4111-8111-111111111111'; // created first, but sorts after idB
      const idB = '00000000-1111-4111-8111-111111111111';
      const side = (trigger: string) => JSON.stringify({ before: startBefore, after: { name: 'Start', triggerRule: trigger, detailDocRef: null } });
      await sql(
        `insert into knowledge.spec_sw_change (id, workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, based_on_rev_no, created_by, created_at)
         values ($1,$2,$3,$4,'event','SPINDLE/START','changed',$5::jsonb,1,$6,$7), ($8,$2,$3,$4,'event','SPINDLE/START','changed',$9::jsonb,1,$6,$10)`,
        [idA, WORKSPACE_ID, f.model, f.sw1, side('from A'), admin.id, '2026-01-01 00:00:00.1231+00', idB, side('from B'), '2026-01-01 00:00:00.1239+00'],
      );
      const out = (await read('modelSpec', { modelId: f.model, softwareId: f.sw1 })).data;
      const start = out.events.find((e: { eventKey: string }) => e.eventKey === 'START');
      // created_at decides (.1231 then .1239), so the later change wins even though its id sorts after
      expect(start).toMatchObject({ triggerRule: 'from B', changed: [{ changeId: idA, changeKind: 'changed' }, { changeId: idB, changeKind: 'changed' }] });
    });

    it('an unknown, other-model or other-workspace softwareId answers data:null', async () => {
      const f = await fixture('eff6');
      const other = await fixture('eff6-other');
      for (const softwareId of [randomUUID(), other.sw1]) expect((await read('modelSpec', { modelId: f.model, softwareId })).data).toBeNull();
    });
  });

  describe('logKnowledge.specChanges', () => {
    it('lists newest first with filters, labels and paging; any session with platform:view may read', async () => {
      const f = await fixture('list');
      const first = await add(f.model, f.sw1, { endsBeforeSoftwareId: f.sw2 });
      const second = await add(f.model, f.sw2, { endsBeforeSoftwareId: f.sw3 });
      const behavior = await add(f.model, f.sw1, { target: STOP, changeKind: 'behavior', change: {}, note: 'n' });
      await sql('update knowledge.spec_sw_change set needs_revalidation = true, revalidation_rev_no = 2, row_version = row_version + 1 where id = $1', [second]);
      await act('specChangeRetire', { changeId: behavior }, { expectedVersion: '1' });
      const ids = async (params: Record<string, unknown>, who: Person = admin) => ((await read('specChanges', { modelId: f.model, ...params }, who)).data.rows as { id: string }[]).map((r) => r.id);
      expect(await ids({})).toEqual([second, first]); // open by default, created_at desc
      expect(await ids({ status: 'all' })).toEqual([behavior, second, first]);
      expect(await ids({ status: 'retired' })).toEqual([behavior]);
      expect(await ids({ needsRevalidation: true })).toEqual([second]);
      expect(await ids({ softwareId: f.sw1 })).toEqual([first]);
      expect(await ids({ softwareId: f.sw2 })).toEqual([second]);
      expect(await ids({ softwareId: f.sw3 })).toEqual([]);
      const paged = (await read('specChanges', { modelId: f.model, status: 'all', page: 1, pageSize: 2 }, user)).data;
      expect(paged).toMatchObject({ total: 3, rows: [{ id: first }] });
      expect(paged.rows[0]).toMatchObject({ softwareLabel: `list-1`, endsBeforeLabel: 'list-2', targetKind: 'event', changeKind: 'changed', version: 1, basedOnRevNo: 1, retiredAt: null });
      expect((await read('specChanges', { modelId: foreignModel, status: 'all' })).data).toEqual({ rows: [], total: 0 });
    });
  });
});
