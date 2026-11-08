// #1505 S-b — Item Event relation record (migration 0117): `relations[]` on itemCreate / itemRevise and the
// `relations` of itemDetail, through the real `buildServer` over
// `/api/v1/menu-action` and `/api/v1/menu-query` against a real Postgres (throwaway DB only; app as platform_app,
// fixtures and cleanup as platform_migrate). Needs migration 0117 (the conductor migrates).

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

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IRR${randomUUID().slice(0, 6).toUpperCase()}`;
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

describe.skipIf(!runIntegration)('Item Event relation record (#1505)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let vendorId = '';
  const actorIds: string[] = [];
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

  const ev = (module: string, event: string) => ({ module, event });
  const START = ev('Spindle', 'Start');
  const STOP = ev('Spindle', 'Stop');
  const startKey = 'SPINDLE/START';
  const stopKey = 'SPINDLE/STOP';
  const rel = (over: Row = {}) => ({ kind: 'observed', source: START, target: STOP, ...over });
  const spec = {
    modules: [{ name: 'Spindle' }],
    events: [
      { module: 'Spindle', name: 'Start', fields: [field('speed')] },
      { module: 'Spindle', name: 'Stop', fields: [] },
    ],
    relations: [],
  };
  const itemBody = (label: string, extra: Row = {}) => ({ typeCode: 'anomaly', title: `${TAG} ${label}`, observation: `observed ${label}`, ...extra });
  async function newItem(label: string, owner: Row, extra: Row = {}) {
    const a = await act('itemCreate', { ...owner, ...itemBody(label), ...extra });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.data as { id: string; itemNo: number };
  }
  const records = async (itemId: string, revisionNo?: number) =>
    (
      await sql(
        'select * from knowledge.item_event_relation_record where item_id = $1 and ($2::int is null or revision_no = $2) order by revision_no, ordinal',
        [itemId, revisionNo ?? null],
      )
    ).rows as Row[];
  const detail = async (itemId: string, revisionNo?: number) => (await read('itemDetail', { itemId, ...(revisionNo ? { revisionNo } : {}) })).data;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    const vendorCode = `${TAG}-v`;
    vendorId = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [WORKSPACE_ID, vendorCode, toCodeKey(vendorCode), admin.id]);
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    const mine = '(select id from knowledge.knowledge_item where created_by = any($1))';
    for (const table of ['item_event_relation_record', 'item_revision_subject', 'item_assessment_event', 'item_revision_evidence', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id in ${mine}`, [actorIds]);
    }
    await sql('delete from knowledge.knowledge_item where created_by = any($1)', [actorIds]);
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.spec_sw_change where created_by = any($1)', [actorIds]);
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
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('stores relations on create, `after` as the swapped `before` row, and reads them back with labels', async () => {
    const model = await newModel('a');
    await publishRevision(model, spec);
    const item = await newItem('create', { ownerModelId: model }, { relations: [rel(), rel({ kind: 'expected', predicate: 'after', source: STOP, target: START })] });
    const rows = await records(item.id);
    expect(rows.map((r) => [r.ordinal, r.kind, r.source_key, r.predicate, r.target_key, r.resolved])).toEqual([
      [1, 'observed', startKey, 'before', stopKey, true],
      [2, 'expected', startKey, 'before', stopKey, true],
    ]);
    const shown = (await detail(item.id)).relations;
    expect(shown[0]).toMatchObject({ kind: 'observed', source: startKey, predicate: 'before', target: stopKey, resolved: true, sourceLabel: 'Start', targetLabel: 'Stop' });
  });

  it('stores a reverse pair as a different row and an unknown key as unresolved', async () => {
    const model = await newModel('b');
    await publishRevision(model, spec);
    const item = await newItem('reverse', { ownerModelId: model }, { relations: [rel(), rel({ source: STOP, target: START }), rel({ target: ev('Spindle', 'Ghost') })] });
    const rows = await records(item.id);
    expect(rows.map((r) => `${r.source_key}>${r.target_key}:${r.resolved}`)).toEqual([`${startKey}>${stopKey}:true`, `${stopKey}>${startKey}:true`, `${startKey}>SPINDLE/GHOST:false`]);
    const shown = (await detail(item.id)).relations;
    expect(shown[2]).toMatchObject({ resolved: false, targetLabel: null, sourceLabel: 'Start' });
  });

  it('refuses a self pair, a duplicate and more than the cap with field errors, writing nothing', async () => {
    const model = await newModel('c');
    const self = await act('itemCreate', { ownerModelId: model, ...itemBody('self'), relations: [rel({ target: START })] });
    expect(self.outcome).toBe('invalid');
    expect(fe(self)).toEqual(['relations.0.target:self_relation']);
    const dup = await act('itemCreate', { ownerModelId: model, ...itemBody('dup'), relations: [rel(), rel()] });
    expect(fe(dup)).toEqual(['relations.1:duplicate']);
    const many = await act('itemCreate', { ownerModelId: model, ...itemBody('many'), relations: Array.from({ length: 21 }, () => rel()) });
    expect(fe(many)).toEqual(['relations:too_long']);
  });

  it('carries the records on a revise without `relations`, and replaces them when sent (even empty)', async () => {
    const model = await newModel('d');
    await publishRevision(model, spec);
    const item = await newItem('revise', { ownerModelId: model }, { relations: [rel()] });
    const revise = (extra: Row, version: string) => act('itemRevise', { id: item.id, ...itemBody('revise'), changeNote: 'n', ...extra }, { expectedVersion: version });
    const carried = await revise({}, '1');
    expect(carried.outcome, JSON.stringify(carried)).toBe('ok');
    expect((await records(item.id, 2)).map((r) => [r.source_key, r.target_key])).toEqual([[startKey, stopKey]]);
    const replaced = await revise({ relations: [rel({ kind: 'expected', source: STOP, target: START })] }, carried.version as string);
    expect(replaced.outcome, JSON.stringify(replaced)).toBe('ok');
    expect((await records(item.id, 3)).map((r) => [r.kind, r.source_key])).toEqual([['expected', stopKey]]);
    const cleared = await revise({ relations: [] }, replaced.version as string);
    expect(cleared.outcome).toBe('ok');
    expect(await records(item.id, 4)).toHaveLength(0);
    expect((await detail(item.id, 1)).relations).toHaveLength(1);
    expect((await detail(item.id)).relations).toEqual([]);
  });

  it('judges a SW-owned item against that SW version effective spec and an old item reads an empty list', async () => {
    const model = await newModel('e');
    await publishRevision(model, spec);
    const swBefore = await newSoftware(model, 'sw0');
    const sw = await newSoftware(model, 'sw1');
    const swAfter = await newSoftware(model, 'sw2');
    // SW1 adds Brake and removes Stop; SW0 (earlier) is outside the range, SW2 (later) inherits it.
    const added = await act('specChangeAdd', { modelId: model, softwareId: sw, targetKind: 'event', target: ev('Spindle', 'Brake'), changeKind: 'added', change: { after: { name: 'Brake' } } });
    expect(added.outcome, JSON.stringify(added)).toBe('ok');
    const removed = await act('specChangeAdd', { modelId: model, softwareId: sw, targetKind: 'event', target: STOP, changeKind: 'removed', change: { before: { name: 'Stop', triggerRule: null, detailDocRef: null } } });
    expect(removed.outcome, JSON.stringify(removed)).toBe('ok');
    const brakeKey = 'SPINDLE/BRAKE';
    const relations = [rel({ target: ev('Spindle', 'Brake') }), rel()];
    const resolvedOf = async (id: string) => (await records(id)).map((r) => [r.target_key, r.resolved]);
    const labelsOf = async (id: string) => (await detail(id)).relations.map((r: Row) => [r.targetLabel, r.resolved]);

    const swItem = await newItem('sw', { ownerSoftwareId: sw }, { relations });
    expect(await resolvedOf(swItem.id)).toEqual([[brakeKey, true], [stopKey, false]]);
    expect(await labelsOf(swItem.id)).toEqual([['Brake', true], [null, false]]);
    const modelItem = await newItem('model', { ownerModelId: model }, { relations });
    expect(await resolvedOf(modelItem.id)).toEqual([[brakeKey, false], [stopKey, true]]);
    expect(await labelsOf(modelItem.id)).toEqual([[null, false], ['Stop', true]]);
    const beforeItem = await newItem('sw-before', { ownerSoftwareId: swBefore }, { relations });
    expect(await resolvedOf(beforeItem.id)).toEqual([[brakeKey, false], [stopKey, true]]);
    const afterItem = await newItem('sw-after', { ownerSoftwareId: swAfter }, { relations });
    expect(await resolvedOf(afterItem.id)).toEqual([[brakeKey, true], [stopKey, false]]);
    // A revise of the SW-owned item that sends relations is judged against the same effective spec.
    const revised = await act('itemRevise', { id: swItem.id, ...itemBody('sw-revise'), changeNote: 'n', relations }, { expectedVersion: '1' });
    expect(revised.outcome, JSON.stringify(revised)).toBe('ok');
    expect((await records(swItem.id, 2)).map((r) => [r.target_key, r.resolved])).toEqual([[brakeKey, true], [stopKey, false]]);

    const plain = await newItem('plain', { ownerModelId: model });
    expect((await detail(plain.id)).relations).toEqual([]);
  });

  it('stores keys of 200 non-compressible code points per part and finds them by md5(key)', async () => {
    const model = await newModel('g');
    await publishRevision(model, spec);
    const f = (start: number) => Array.from({ length: 200 }, (_, i) => String.fromCodePoint(0x20000 + 65 * (start + i))).join('');
    const module = f(0);
    const source = ev(module, f(200));
    const target = ev(module, f(400));
    const item = await newItem('long-keys', { ownerModelId: model }, { relations: [rel({ source, target })] });
    const rows = await records(item.id);
    expect(rows).toHaveLength(1);
    const sourceKey = String(rows[0]?.source_key);
    expect(sourceKey.length).toBeGreaterThan(400);
    expect(rows[0]).toMatchObject({ resolved: false });
    const shown = (await detail(item.id)).relations;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ source: sourceKey, target: rows[0]?.target_key, resolved: false });
    const found = await appSql(
      'select item_id from knowledge.item_event_relation_record where workspace_id = $1 and md5(source_key) = md5($2) and source_key = $2',
      [WORKSPACE_ID, sourceKey],
    );
    expect(found.rows.map((r) => r.item_id)).toEqual([item.id]);
  });

  it('is append-only for the runtime role and the database refuses a missing revision, a self pair, another predicate and a duplicate', async () => {
    const model = await newModel('f');
    await publishRevision(model, spec);
    const item = await newItem('wall', { ownerModelId: model }, { relations: [rel()] });
    await expect(appSql(`update knowledge.item_event_relation_record set kind = 'expected' where item_id = $1`, [item.id])).rejects.toMatchObject({ code: '42501' });
    await expect(appSql(`delete from knowledge.item_event_relation_record where item_id = $1`, [item.id])).rejects.toMatchObject({ code: '42501' });
    const insert = (revisionNo: number, ordinal: number, source: string, predicate: string, target: string) =>
      sql(
        `insert into knowledge.item_event_relation_record (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved) values ($1,$2,$3,$4,'observed',$5,$6,$7,true)`,
        [WORKSPACE_ID, item.id, revisionNo, ordinal, source, predicate, target],
      );
    await expect(insert(9, 1, 'A/B', 'before', 'A/C'), 'revision').rejects.toMatchObject({ code: '23503' });
    await expect(insert(1, 2, 'A/B', 'before', 'A/B'), 'self').rejects.toMatchObject({ code: '23514' });
    await expect(insert(1, 2, 'A/B', 'after', 'A/C'), 'predicate').rejects.toMatchObject({ code: '23514' });
    await expect(insert(1, 2, startKey, 'before', stopKey), 'duplicate').rejects.toMatchObject({ code: '23505' });
    expect(await records(item.id)).toHaveLength(1);
  });
});
