// #1196 f — Item subject link (migration 0098): `subjects[]` on itemCreate / itemRevise, the resolved subjects of
// itemDetail, the `subject` list filter and `specSubjectItems`, through the real `buildServer` over
// `/api/v1/menu-action` and `/api/v1/menu-query` against a real Postgres (throwaway DB only; app as platform_app,
// fixtures and cleanup as platform_migrate). Needs migration 0098.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';
import { buildTargetKey } from '../domain/spec-target-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ISB${randomUUID().slice(0, 6).toUpperCase()}`;
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

describe.skipIf(!runIntegration)('Item subject link (#1196 f)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let otherWorkspace = '';
  let foreignModel = '';
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
  async function newSoftware(model: string, label: string): Promise<string> {
    return one(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`,
      [WORKSPACE_ID, model, `${TAG}-${label}`, toCodeKey(`${TAG}-${label}`), admin.id],
    );
  }
  /** Draft → save → publish; answers the published revision id. */
  async function publishRevision(model: string, body: Record<string, unknown>): Promise<string> {
    const created = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC() });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    const saved = await act('specDraftSave', { revisionId: created.data.revisionId, mode: 'append', ...body }, { expectedVersion: created.data.version });
    expect(saved.outcome, JSON.stringify(saved)).toBe('ok');
    const published = await act('specPublish', { revisionId: created.data.revisionId }, { expectedVersion: saved.version as string });
    expect(published.data.outcome, JSON.stringify(published)).toBe('published');
    return created.data.revisionId as string;
  }
  beforeEach(async () => {
    await sql('delete from core.rate_limits');
  });

  const START = { module: 'Spindle', event: 'Start' };
  const STOP = { module: 'Spindle', event: 'Stop' };
  const startKey = buildTargetKey({ kind: 'event', module: 'SPINDLE', event: 'START' });
  const stopKey = buildTargetKey({ kind: 'event', module: 'SPINDLE', event: 'STOP' });
  const spindleKey = buildTargetKey({ kind: 'module', module: 'SPINDLE' });
  const subject = (modelId: string, target: Record<string, string> = START, over: Record<string, unknown> = {}) => ({
    modelId,
    targetKind: 'event',
    target,
    ...over,
  });
  /** Spec content: module Spindle with Start (+ Stop unless `stop: false`). */
  const spec = (opts: { stop?: boolean } = {}) => ({
    modules: [{ name: 'Spindle' }],
    events: [
      { module: 'Spindle', name: 'Start', fields: [field('speed')] },
      ...(opts.stop === false ? [] : [{ module: 'Spindle', name: 'Stop', fields: [] }]),
    ],
    relations: [],
  });
  const itemBody = (label: string, extra: Row = {}) => ({ typeCode: 'anomaly', title: `${TAG} ${label}`, observation: `observed ${label}`, ...extra });
  async function newItem(label: string, owner: Row, extra: Row = {}) {
    const a = await act('itemCreate', { ...owner, ...itemBody(label), ...extra });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.data as { id: string; itemNo: number };
  }
  const subjectRows = async (itemId: string, revisionNo?: number) =>
    (
      await sql(
        'select * from knowledge.item_revision_subject where item_id = $1 and ($2::int is null or revision_no = $2) order by revision_no, target_key',
        [itemId, revisionNo ?? null],
      )
    ).rows as Row[];
  const detail = async (itemId: string, revisionNo?: number) => (await read('itemDetail', { itemId, ...(revisionNo ? { revisionNo } : {}) })).data;
  const listed = async (filters: unknown[]) => ((await read('items', { q: TAG, filters })).data.rows as { id: string }[]).map((r) => r.id);
  const keyFilter = (key: string, model: string) => [
    { id: 'subject', op: 'in', value: [key] },
    { id: 'ownerModelId', op: 'in', value: [model] },
  ];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    const vendorCode = `${TAG}-v`;
    vendorId = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [WORKSPACE_ID, vendorCode, toCodeKey(vendorCode), admin.id]);
    const foreignVendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [otherWorkspace, `${TAG}-fv`, toCodeKey(`${TAG}-fv`), admin.id]);
    foreignModel = await newModel('fm', otherWorkspace, foreignVendor);
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    const mine = '(select id from knowledge.knowledge_item where created_by = any($1))';
    for (const table of ['item_revision_subject', 'item_assessment_event', 'item_revision_evidence', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id in ${mine}`, [actorIds]);
    }
    await sql('delete from knowledge.knowledge_item where created_by = any($1)', [actorIds]);
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where created_by = any($1)`, [actorIds]);
    }
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

  describe('itemCreate with subjects', () => {
    it('stores each subject by model + kind + stable key with the spec revision it was checked against; the detail resolves it', async () => {
      const model = await newModel('c1');
      await publishRevision(model, spec());
      const created = await newItem('c1', { ownerModelId: model }, {
        subjects: [subject(model), subject(model, { module: 'Spindle' }, { targetKind: 'module', relation: 'context' })],
      });
      expect(await subjectRows(created.id)).toMatchObject([
        { workspace_id: WORKSPACE_ID, revision_no: 1, model_id: model, target_kind: 'event', target_key: startKey, subject_relation: 'about', spec_rev_no_at_link: 1 },
        { revision_no: 1, model_id: model, target_kind: 'module', target_key: spindleKey, subject_relation: 'context', spec_rev_no_at_link: 1 },
      ]);
      const d = await detail(created.id);
      expect(d.subjects).toEqual([
        { modelId: model, modelName: expect.stringContaining(TAG), targetKind: 'event', targetKey: startKey, subjectRelation: 'about', specRevNoAtLink: 1, state: 'resolved', targetName: 'Start' },
        { modelId: model, modelName: expect.stringContaining(TAG), targetKind: 'module', targetKey: spindleKey, subjectRelation: 'context', specRevNoAtLink: 1, state: 'resolved', targetName: 'Spindle' },
      ]);
    });

    it('an item without subjects reads an empty list; the write is otherwise unchanged', async () => {
      const model = await newModel('c0');
      const created = await newItem('c0', { ownerModelId: model });
      expect((await detail(created.id)).subjects).toEqual([]);
      expect(await subjectRows(created.id)).toEqual([]);
    });

    it('a SW-owned item may point at a target of its SW version\'s model; another model is subjects.N.modelId:model_mismatch and nothing is written', async () => {
      const model = await newModel('sw');
      const other = await newModel('sw-other');
      await publishRevision(model, spec());
      await publishRevision(other, spec());
      const sw = await newSoftware(model, 'sw-1');
      const created = await newItem('sw-ok', { ownerSoftwareId: sw }, { subjects: [subject(model)] });
      expect((await subjectRows(created.id)).map((r) => r.model_id)).toEqual([model]);
      const bad = await act('itemCreate', { ownerSoftwareId: sw, ...itemBody('sw-bad'), subjects: [subject(model), subject(other)] });
      expect(bad.outcome).toBe('invalid');
      expect(fe(bad)).toEqual(['subjects.1.modelId:model_mismatch']);
      const bad2 = await act('itemCreate', { ownerModelId: model, ...itemBody('model-bad'), subjects: [subject(foreignModel)] });
      expect(fe(bad2)).toEqual(['subjects.0.modelId:model_mismatch']);
      const n = (await sql(`select count(*)::int as n from knowledge.knowledge_item_revision where title = any($1)`, [[`${TAG} sw-bad`, `${TAG} model-bad`]])).rows[0].n;
      expect(n).toBe(0);
    });

    it('the key must exist in the model\'s CURRENT published revision (subjects.N.targetKey:not_found); a module key is not an event key', async () => {
      const model = await newModel('nf');
      await publishRevision(model, spec());
      const miss = await act('itemCreate', { ownerModelId: model, ...itemBody('nf'), subjects: [subject(model, { module: 'Spindle', event: 'Ghost' })] });
      expect(fe(miss)).toEqual(['subjects.0.targetKey:not_found']);
      const wrongKind = await act('itemCreate', { ownerModelId: model, ...itemBody('nf2'), subjects: [subject(model, { module: 'Spindle' }, { targetKind: 'module' }), subject(model, { module: 'Nope' }, { targetKind: 'module' })] });
      expect(fe(wrongKind)).toEqual(['subjects.1.targetKey:not_found']);
    });

    it('caps a revision at 20 subjects and refuses a duplicate or a malformed one at validation', async () => {
      const model = await newModel('cap');
      await publishRevision(model, spec());
      const many = Array.from({ length: 21 }, () => subject(model));
      expect(fe(await act('itemCreate', { ownerModelId: model, ...itemBody('cap'), subjects: many }))).toEqual(['subjects:too_long']);
      expect(fe(await act('itemCreate', { ownerModelId: model, ...itemBody('dup'), subjects: [subject(model), subject(model)] }))).toEqual(['subjects.1:duplicate']);
      expect(fe(await act('itemCreate', { ownerModelId: model, ...itemBody('bad'), subjects: [{ modelId: model, targetKind: 'field', target: START }] }))).toEqual(['subjects.0.targetKind:malformed']);
      expect((await act('itemCreate', { ownerModelId: model, ...itemBody('two'), subjects: [subject(model), subject(model, STOP)] })).outcome).toBe('ok');
    });

    it('a model with no published spec accepts a well-formed key (spec_rev_no_at_link null) and reads no_spec until a spec is published', async () => {
      const model = await newModel('nospec');
      const created = await newItem('nospec', { ownerModelId: model }, { subjects: [subject(model)] });
      expect((await subjectRows(created.id))[0]).toMatchObject({ target_key: startKey, spec_rev_no_at_link: null });
      expect((await detail(created.id)).subjects[0]).toMatchObject({ state: 'no_spec', specRevNoAtLink: null, targetName: null });
      await publishRevision(model, spec());
      expect((await detail(created.id)).subjects[0]).toMatchObject({ state: 'resolved', targetName: 'Start' });
    });

    it('a User cannot write subjects (the item write right); the item and its subjects are not created', async () => {
      const model = await newModel('perm');
      await publishRevision(model, spec());
      const denied = await act('itemCreate', { ownerModelId: model, ...itemBody('perm'), subjects: [subject(model)] }, { who: user });
      expect(denied.outcome).toBe('forbidden');
      expect((await sql(`select count(*)::int as n from knowledge.knowledge_item_revision where title = $1`, [`${TAG} perm`])).rows[0].n).toBe(0);
      const own = await newItem('perm-ok', { ownerModelId: model }, { subjects: [subject(model)] });
      expect((await read('itemDetail', { itemId: own.id }, user)).data.subjects).toHaveLength(1);
    });
  });

  describe('itemRevise', () => {
    it('without `subjects` the previous revision\'s links are carried; a list replaces them; an empty list clears; old revisions keep theirs', async () => {
      const model = await newModel('rev');
      await publishRevision(model, spec());
      const item = await newItem('rev', { ownerModelId: model }, { subjects: [subject(model)] });
      const revise = (version: string, extra: Row) => act('itemRevise', { id: item.id, ...itemBody('rev'), changeNote: 'n', ...extra }, { expectedVersion: version });
      const r2 = await revise('1', {});
      expect(r2.outcome, JSON.stringify(r2)).toBe('ok');
      expect((await subjectRows(item.id, 2)).map((r) => [r.target_key, r.spec_rev_no_at_link])).toEqual([[startKey, 1]]);
      const r3 = await revise(r2.version as string, { subjects: [subject(model, STOP), subject(model, { module: 'Spindle' }, { targetKind: 'module' })] });
      expect(r3.outcome, JSON.stringify(r3)).toBe('ok');
      expect((await subjectRows(item.id, 3)).map((r) => r.target_key).sort()).toEqual([spindleKey, stopKey].sort());
      const r4 = await revise(r3.version as string, { subjects: [] });
      expect(r4.outcome, JSON.stringify(r4)).toBe('ok');
      expect(await subjectRows(item.id, 4)).toEqual([]);
      expect((await detail(item.id)).subjects).toEqual([]);
      expect((await detail(item.id, 1)).subjects.map((s: Row) => s.targetKey)).toEqual([startKey]);
      expect((await detail(item.id, 3)).subjects).toHaveLength(2);
      // the rows of earlier revisions are untouched
      expect((await subjectRows(item.id, 1)).map((r) => r.target_key)).toEqual([startKey]);
    });

    it('a SW-owned item revises against its SW version\'s model; a mismatch or a missing key refuses and writes no revision', async () => {
      const model = await newModel('rsw');
      await publishRevision(model, spec());
      const sw = await newSoftware(model, 'rsw-1');
      const item = await newItem('rsw', { ownerSoftwareId: sw }, { subjects: [subject(model)] });
      const other = await newModel('rsw-other');
      const revise = (extra: Row) => act('itemRevise', { id: item.id, ...itemBody('rsw'), changeNote: 'n', ...extra }, { expectedVersion: '1' });
      expect(fe(await revise({ subjects: [subject(other)] }))).toEqual(['subjects.0.modelId:model_mismatch']);
      expect(fe(await revise({ subjects: [subject(model, { module: 'Spindle', event: 'Ghost' })] }))).toEqual(['subjects.0.targetKey:not_found']);
      expect((await sql('select count(*)::int as n from knowledge.knowledge_item_revision where item_id = $1', [item.id])).rows[0].n).toBe(1);
      expect((await revise({ subjects: [subject(model, STOP)] })).outcome).toBe('ok');
    });
  });

  describe('links survive spec revisions', () => {
    it('a new spec revision keeps the link resolved; a revision that removes the key reads `gone` and the row is kept; a later revision that restores it reads resolved again', async () => {
      const model = await newModel('life');
      await publishRevision(model, spec());
      const item = await newItem('life', { ownerModelId: model }, { subjects: [subject(model, START), subject(model, STOP)] });
      await publishRevision(model, { ...spec(), events: [{ module: 'Spindle', name: 'Start', fields: [field('speed'), field('load')] }, { module: 'Spindle', name: 'Stop', fields: [] }] });
      const kept = (await detail(item.id)).subjects as Row[];
      expect(kept.map((s) => [s.targetKey, s.state, s.specRevNoAtLink]).sort()).toEqual([[startKey, 'resolved', 1], [stopKey, 'resolved', 1]].sort());
      await publishRevision(model, spec({ stop: false }));
      const after = (await detail(item.id)).subjects as Row[];
      expect(after.find((s) => s.targetKey === stopKey)).toMatchObject({ state: 'gone', targetName: null });
      expect(after.find((s) => s.targetKey === startKey)).toMatchObject({ state: 'resolved' });
      expect(await subjectRows(item.id)).toHaveLength(2);
      await publishRevision(model, { ...spec(), events: [{ module: 'Spindle', name: 'Start', fields: [] }, { module: 'Spindle', name: 'Stop', fields: [field('x')] }] });
      expect(((await detail(item.id)).subjects as Row[]).find((s) => s.targetKey === stopKey)).toMatchObject({ state: 'resolved' });
    });
  });

  describe('list filter and specSubjectItems', () => {
    it('the `subject` filter matches the LATEST revision\'s key, scoped by the model filter; the subject column is a single text value', async () => {
      const m1 = await newModel('flt1');
      const m2 = await newModel('flt2');
      await publishRevision(m1, spec());
      await publishRevision(m2, spec());
      const i1 = await newItem('flt-i1', { ownerModelId: m1 }, { subjects: [subject(m1)] });
      const i2 = await newItem('flt-i2', { ownerModelId: m2 }, { subjects: [subject(m2)] });
      const i3 = await newItem('flt-i3', { ownerModelId: m1 }, { subjects: [subject(m1, STOP)] });
      expect(await listed(keyFilter(startKey, m1))).toEqual([i1.id]);
      expect(await listed(keyFilter(startKey, m2))).toEqual([i2.id]);
      expect(await listed(keyFilter(stopKey, m1))).toEqual([i3.id]);
      expect(await listed([{ id: 'subject', op: 'in', value: [startKey] }])).toEqual(expect.arrayContaining([i1.id, i2.id]));
      // revise i1 to a different subject: the old key no longer matches (only the latest revision counts)
      const revised = await act('itemRevise', { id: i1.id, ...itemBody('flt-i1'), changeNote: 'n', subjects: [subject(m1, STOP)] }, { expectedVersion: '1' });
      expect(revised.outcome, JSON.stringify(revised)).toBe('ok');
      expect(await listed(keyFilter(startKey, m1))).toEqual([]);
      expect((await listed(keyFilter(stopKey, m1))).sort()).toEqual([i1.id, i3.id].sort());
      const two = await read('items', { q: TAG, filters: [{ id: 'subject', op: 'in', value: [startKey, stopKey] }] });
      expect(two.outcome).toBe('error');
      expect((await read('items', { q: TAG, filters: [{ id: 'subject', op: 'notIn', value: [startKey] }] })).outcome).toBe('error');
    });

    it('specSubjectItems lists the published items about one target of one model with the relation; an archived item and another model\'s same key are not listed; paging is 0-based', async () => {
      const m1 = await newModel('ssi1');
      const m2 = await newModel('ssi2');
      await publishRevision(m1, spec());
      await publishRevision(m2, spec());
      const a = await newItem('ssi-a', { ownerModelId: m1 }, { subjects: [subject(m1, START, { relation: 'context' })] });
      const b = await newItem('ssi-b', { ownerModelId: m1 }, { subjects: [subject(m1)] });
      const archived = await newItem('ssi-arch', { ownerModelId: m1 }, { subjects: [subject(m1)] });
      await newItem('ssi-other', { ownerModelId: m2 }, { subjects: [subject(m2)] });
      await newItem('ssi-stop', { ownerModelId: m1 }, { subjects: [subject(m1, STOP)] });
      expect((await act('itemSetArchived', { id: archived.id, archived: true }, { expectedVersion: '1' })).outcome).toBe('ok');
      const res = await read('specSubjectItems', { modelId: m1, targetKey: startKey });
      expect(res.outcome, JSON.stringify(res)).toBe('ok');
      expect(res.data.total).toBe(2);
      const byId = new Map((res.data.rows as { id: string; subjectRelation: string; title: string }[]).map((r) => [r.id, r]));
      expect([...byId.keys()].sort()).toEqual([a.id, b.id].sort());
      expect(byId.get(a.id)).toMatchObject({ subjectRelation: 'context', title: `${TAG} ssi-a` });
      expect(byId.get(b.id)?.subjectRelation).toBe('about');
      const p0 = await read('specSubjectItems', { modelId: m1, targetKey: startKey, page: 0, pageSize: 1 });
      const p1 = await read('specSubjectItems', { modelId: m1, targetKey: startKey, page: 1, pageSize: 1 });
      expect([p0.data.total, p0.data.rows.length, p1.data.rows.length]).toEqual([2, 1, 1]);
      expect(p0.data.rows[0].id).not.toBe(p1.data.rows[0].id);
      expect((await read('specSubjectItems', { modelId: m1, targetKey: 'NO/SUCH' })).data).toEqual({ total: 0, rows: [] });
      expect((await read('specSubjectItems', { modelId: foreignModel, targetKey: startKey })).data).toEqual({ total: 0, rows: [] });
    });
  });

  describe('append-only table', () => {
    it('the runtime role cannot UPDATE or DELETE a subject row; the database refuses a missing revision, a field kind, a duplicate key and a cross-workspace model', async () => {
      const model = await newModel('wall');
      await publishRevision(model, spec());
      const item = await newItem('wall', { ownerModelId: model }, { subjects: [subject(model)] });
      await expect(appSql(`update knowledge.item_revision_subject set target_key = 'X' where item_id = $1`, [item.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`delete from knowledge.item_revision_subject where item_id = $1`, [item.id])).rejects.toMatchObject({ code: '42501' });
      const insert = (revisionNo: number, kind: string, key: string, workspaceModel = model) =>
        sql(
          `insert into knowledge.item_revision_subject (workspace_id, item_id, revision_no, model_id, target_kind, target_key, subject_relation) values ($1,$2,$3,$4,$5,$6,'about')`,
          [WORKSPACE_ID, item.id, revisionNo, workspaceModel, kind, key],
        );
      await expect(insert(9, 'event', 'A/B'), 'revision').rejects.toMatchObject({ code: '23503' });
      await expect(insert(1, 'field', 'A/B#f'), 'kind').rejects.toMatchObject({ code: '23514' });
      await expect(insert(1, 'event', startKey), 'duplicate').rejects.toMatchObject({ code: '23505' });
      await expect(insert(1, 'event', 'A/B', foreignModel), 'model of another workspace').rejects.toMatchObject({ code: '23503' });
      expect(await subjectRows(item.id)).toHaveLength(1);
    });
  });
});
