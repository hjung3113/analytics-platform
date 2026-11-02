// #1197 (w) — the knowledge item write actions through the real `buildServer` over `POST /api/v1/menu-action`
// against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`,
// app as platform_app, fixtures and cleanup as platform_migrate). Each write is judged on the wire answer, the
// `knowledge.*` rows and the `core.audit_log` rows written in the same transaction.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
const TAG = `IWR${randomUUID().slice(0, 6).toUpperCase()}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: Record<string, unknown> | null;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
  replayed: boolean;
}
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log knowledge item write actions (#1197 w)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
  let otherWorkspace = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const ids = {} as Record<'model' | 'modelOff' | 'sw' | 'swOff' | 'swOfOffModel' | 'foreignModel', string>;
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
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

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string; key?: string } = {},
  ): Promise<Answer> {
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
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }

  const title = (label: string) => `${TAG} ${label}`;
  const body = (label: string, extra: Row = {}) => ({
    typeCode: 'anomaly',
    title: title(label),
    observation: `observed ${label}`,
    ...extra,
  });
  const pointer = (ref: string, extra: Row = {}) => ({ sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: ref, ...extra });

  const itemRow = async (id: string) => (await sql('select * from knowledge.knowledge_item where id = $1', [id])).rows[0] as Row | undefined;
  const revisions = async (id: string) =>
    (await sql('select * from knowledge.knowledge_item_revision where item_id = $1 order by revision_no', [id])).rows as Row[];
  const evidence = async (id: string, revisionNo?: number) =>
    (
      await sql(
        'select * from knowledge.item_revision_evidence where item_id = $1 and ($2::int is null or revision_no = $2) order by revision_no, ordinal',
        [id, revisionNo ?? null],
      )
    ).rows as Row[];
  const events = async (id: string) =>
    (await sql('select * from knowledge.item_assessment_event where item_id = $1 order by observed_at, id', [id])).rows as Row[];
  const links = async (id: string) => (await sql('select * from knowledge.item_link where source_item_id = $1', [id])).rows as Row[];
  const audit = async (id: string) =>
    (
      await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])
    ).rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];
  const countItems = async (label: string) =>
    Number(
      (
        await sql(
          `select count(*)::int as n from knowledge.knowledge_item i join knowledge.knowledge_item_revision r
             on r.workspace_id = i.workspace_id and r.item_id = i.id and r.revision_no = 1 where r.title = $1`,
          [title(label)],
        )
      ).rows[0].n,
    );

  async function newItem(label: string, extra: Row = {}, owner: Row = { ownerModelId: ids.model }) {
    const a = await act('itemCreate', { ...owner, ...body(label), ...extra });
    expect(a.outcome).toBe('ok');
    return { id: a.data?.id as string, version: a.version as string, itemNo: a.data?.itemNo as number };
  }

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
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'knowledge.item.publish', null, $3)`,
      [WORKSPACE_ID, developerGranted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    const insert = async (table: string, cols: Row) =>
      (
        await sql(
          `insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
          Object.values(cols),
        )
      ).rows[0].id as string;
    const common = (ws: string, code: string) => ({ workspace_id: ws, created_by: admin.id, updated_by: admin.id, name: code, code, code_key: toCodeKey(code) });
    const vendor = await insert('vendor', common(WORKSPACE_ID, `${TAG}-v`));
    const foreignVendor = await insert('vendor', common(otherWorkspace, `${TAG}-fv`));
    const model = (code: string, ws: string, vendorId: string, active = true) =>
      insert('equipment_model', { ...common(ws, code), vendor_id: vendorId, active });
    ids.model = await model(`${TAG}-m`, WORKSPACE_ID, vendor);
    ids.modelOff = await model(`${TAG}-moff`, WORKSPACE_ID, vendor, false);
    ids.foreignModel = await model(`${TAG}-fm`, otherWorkspace, foreignVendor);
    const software = (label: string, modelId: string, active = true) =>
      insert('software_version', {
        workspace_id: WORKSPACE_ID,
        model_id: modelId,
        version_label: label,
        version_key: toCodeKey(label),
        name: label,
        active,
        created_by: admin.id,
        updated_by: admin.id,
      });
    ids.sw = await software(`${TAG}-sw`, ids.model);
    ids.swOff = await software(`${TAG}-swoff`, ids.model, false);
    ids.swOfOffModel = await software(`${TAG}-swom`, ids.modelOff);
  });

  afterAll(async () => {
    const mine = '(select id from knowledge.knowledge_item where created_by = any($1))';
    await sql(`delete from knowledge.item_link where source_item_id in ${mine} or target_item_id in ${mine}`, [actorIds]);
    for (const table of ['item_assessment_event', 'item_revision_evidence', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id in ${mine}`, [actorIds]);
    }
    await sql('delete from knowledge.knowledge_item where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.item_counter where workspace_id = any($1)', [workspaceIds]);
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

  describe('itemCreate', () => {
    it('model owner: item, revision 1, evidence ordinals and the audit row land together', async () => {
      const a = await act('itemCreate', {
        ownerModelId: ids.model,
        ...body('create-model', { analysisOpinion: 'opinion', improvement: 'improve' }),
        evidence: [pointer('run-1', { note: 'first' }), pointer('run-2', { sourceKind: 'spec', sourceVersion: 'v2', locator: 'p3' })],
      });
      expect(a).toMatchObject({ outcome: 'ok', version: '1', data: { itemNo: expect.any(Number) } });
      const id = a.data?.id as string;
      expect(await itemRow(id)).toMatchObject({
        workspace_id: WORKSPACE_ID,
        item_no: a.data?.itemNo,
        owner_model_id: ids.model,
        owner_software_id: null,
        latest_revision_no: 1,
        publication_state: 'published',
        verification_state: 'not_checked',
        processing_state: 'open',
        row_version: 1,
        created_by: admin.id,
        updated_by: admin.id,
      });
      expect(await revisions(id)).toEqual([
        expect.objectContaining({
          revision_no: 1,
          title: title('create-model'),
          type_code: 'anomaly',
          observation: 'observed create-model',
          expected: null,
          analysis_opinion: 'opinion',
          improvement: 'improve',
          change_note: null,
          published_by: admin.id,
        }),
      ]);
      expect(await evidence(id)).toEqual([
        expect.objectContaining({ revision_no: 1, ordinal: 1, source_kind: 'log_file', source_ref: 'run-1', note: 'first' }),
        expect.objectContaining({ revision_no: 1, ordinal: 2, source_kind: 'spec', source_ref: 'run-2', source_version: 'v2', locator: 'p3', note: null }),
      ]);
      expect(await audit(id)).toEqual([
        {
          event_type: 'knowledge.item.created',
          subject_type: 'knowledge_item',
          actor_id: admin.id,
          detail: { itemNo: a.data?.itemNo, title: title('create-model'), revisionNo: 1 },
        },
      ]);
    });

    it('software owner', async () => {
      const item = await newItem('create-sw', { expected: 'exp' }, { ownerSoftwareId: ids.sw });
      expect(await itemRow(item.id)).toMatchObject({ owner_model_id: null, owner_software_id: ids.sw });
    });

    it.each([
      ['both owners', { ownerModelId: 'M', ownerSoftwareId: 'S' }, ['owner:required_one']],
      ['no owner', {}, ['owner:required_one']],
    ])('refuses %s with no row', async (label, owner, expected) => {
      const resolved = Object.fromEntries(Object.entries(owner).map(([k, v]) => [k, v === 'M' ? ids.model : ids.sw]));
      const a = await act('itemCreate', { ...resolved, ...body(`bad-owner-${label}`) });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(expected);
      expect(await countItems(`bad-owner-${label}`)).toBe(0);
    });

    it.each([
      ['unknown model', 'ownerModelId', () => randomUUID(), 'not_found'],
      ['other-workspace model', 'ownerModelId', () => ids.foreignModel, 'not_found'],
      ['inactive model', 'ownerModelId', () => ids.modelOff, 'inactive'],
      ['unknown software', 'ownerSoftwareId', () => randomUUID(), 'not_found'],
      ['inactive software', 'ownerSoftwareId', () => ids.swOff, 'inactive'],
      ['software of an inactive model', 'ownerSoftwareId', () => ids.swOfOffModel, 'inactive'],
    ] as const)('refuses %s', async (label, field, owner, code) => {
      const a = await act('itemCreate', { [field]: owner(), ...body(`owner-${label}`) });
      expect(a).toMatchObject({ outcome: 'invalid' });
      expect(fe(a)).toEqual([`${field}:${code}`]);
      expect(await countItems(`owner-${label}`)).toBe(0);
    });

    it('refuses a missing observation and expected', async () => {
      const a = await act('itemCreate', { ownerModelId: ids.model, typeCode: 'guideline', title: title('no-content') });
      expect(fe(a)).toEqual(['observation:required_one']);
    });

    it('a replay with the same key answers replayed and creates one item', async () => {
      const key = randomUUID();
      const input = { ownerModelId: ids.model, ...body('replay') };
      const first = await act('itemCreate', input, { key });
      const second = await act('itemCreate', input, { key });
      expect(first).toMatchObject({ outcome: 'ok', replayed: false });
      expect(second).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
      expect(await countItems('replay')).toBe(1);
    });

    it('concurrent creates get distinct item numbers', async () => {
      const answers = await Promise.all(
        Array.from({ length: 6 }, (_, i) => act('itemCreate', { ownerModelId: ids.model, ...body(`concurrent-${i}`) })),
      );
      expect(answers.map((a) => a.outcome)).toEqual(Array(6).fill('ok'));
      const numbers = answers.map((a) => a.data?.itemNo as number);
      expect(new Set(numbers).size).toBe(6);
    });
  });

  describe('itemRevise', () => {
    it('appends the next revision with its own evidence and leaves the old revision and evidence alone', async () => {
      const item = await newItem('revise', {}, { ownerModelId: ids.model });
      const first = await act('itemCreate', { ownerModelId: ids.model, ...body('revise-base'), evidence: [pointer('old-1'), pointer('old-2')] });
      const id = first.data?.id as string;
      const revisionsBefore = await revisions(id);
      const evidenceBefore = await evidence(id, 1);
      const a = await act(
        'itemRevise',
        { id, ...body('revise-base', { title: title('revise-v2'), expected: 'now expected' }), changeNote: 'clarified', evidence: [pointer('new-1', { sourceKind: 'image' })] },
        { expectedVersion: first.version as string },
      );
      expect(a).toMatchObject({ outcome: 'ok', version: '2', data: { id, revisionNo: 2 } });
      expect(await itemRow(id)).toMatchObject({ latest_revision_no: 2, row_version: 2, updated_by: admin.id, owner_model_id: ids.model });
      const after = await revisions(id);
      expect(after[0]).toEqual(revisionsBefore[0]);
      expect(after[1]).toMatchObject({ revision_no: 2, title: title('revise-v2'), expected: 'now expected', change_note: 'clarified', published_by: admin.id });
      expect(await evidence(id, 1)).toEqual(evidenceBefore);
      expect(await evidence(id, 2)).toEqual([expect.objectContaining({ ordinal: 1, source_kind: 'image', source_ref: 'new-1' })]);
      expect((await audit(id)).at(-1)).toMatchObject({
        event_type: 'knowledge.item.revised',
        detail: { itemNo: first.data?.itemNo, title: title('revise-v2'), revisionNo: 2 },
      });
      expect(item.id).not.toBe(id);
    });

    it('omitted evidence means none on the new revision', async () => {
      const item = await newItem('revise-noev', { evidence: [pointer('e1')] });
      const a = await act('itemRevise', { id: item.id, ...body('revise-noev'), changeNote: 'drop evidence' }, { expectedVersion: item.version });
      expect(a.outcome).toBe('ok');
      expect(await evidence(item.id, 2)).toEqual([]);
      expect(await evidence(item.id, 1)).toHaveLength(1);
    });

    it('a stale version conflicts and writes nothing', async () => {
      const item = await newItem('revise-stale');
      const a = await act('itemRevise', { id: item.id, ...body('revise-stale'), changeNote: 'x' }, { expectedVersion: '99' });
      expect(a.outcome).toBe('conflict');
      expect(await revisions(item.id)).toHaveLength(1);
      expect(await audit(item.id)).toHaveLength(1);
    });

    it('an unknown id is not_found; a missing change note is invalid', async () => {
      const gone = await act('itemRevise', { id: randomUUID(), ...body('x'), changeNote: 'c' }, { expectedVersion: '1' });
      expect(gone.outcome).toBe('not_found');
      const item = await newItem('revise-note');
      const bad = await act('itemRevise', { id: item.id, ...body('revise-note') }, { expectedVersion: item.version });
      expect(bad).toMatchObject({ outcome: 'invalid' });
      expect(fe(bad)).toEqual(['changeNote:required']);
    });

    it('an archived item refuses a revision', async () => {
      const item = await newItem('revise-archived');
      const archived = await act('itemSetArchived', { id: item.id, archived: true }, { expectedVersion: item.version });
      const a = await act('itemRevise', { id: item.id, ...body('revise-archived'), changeNote: 'x' }, { expectedVersion: archived.version as string });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['id:archived']);
      expect(await revisions(item.id)).toHaveLength(1);
    });
  });

  describe('itemAssess', () => {
    it('writes the event, moves the projection and bumps the version in one go', async () => {
      const item = await newItem('assess');
      const a = await act(
        'itemAssess',
        { id: item.id, dimension: 'verification', newState: 'verified', rationale: 'reproduced on tool 3' },
        { expectedVersion: item.version },
      );
      expect(a).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await itemRow(item.id)).toMatchObject({ verification_state: 'verified', processing_state: 'open', row_version: 2, updated_by: admin.id });
      expect(await events(item.id)).toEqual([
        expect.objectContaining({
          dimension: 'verification',
          prior_state: 'not_checked',
          new_state: 'verified',
          rationale: 'reproduced on tool 3',
          based_on_revision_no: 1,
          actor_id: admin.id,
        }),
      ]);
      expect((await audit(item.id)).at(-1)).toMatchObject({
        event_type: 'knowledge.item.assessed',
        detail: { itemNo: item.itemNo, title: title('assess'), revisionNo: 1, dimension: 'verification', priorState: 'not_checked', newState: 'verified' },
      });
      const b = await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'resolved', rationale: 'done' }, { expectedVersion: '2' });
      expect(b).toMatchObject({ outcome: 'ok', version: '3' });
      expect((await events(item.id))[1]).toMatchObject({ dimension: 'processing', prior_state: 'open', new_state: 'resolved' });
    });

    it('is based on the latest revision', async () => {
      const item = await newItem('assess-rev');
      const revised = await act('itemRevise', { id: item.id, ...body('assess-rev'), changeNote: 'c' }, { expectedVersion: item.version });
      await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'under_investigation', rationale: 'r' }, { expectedVersion: revised.version as string });
      expect((await events(item.id))[0]).toMatchObject({ based_on_revision_no: 2 });
    });

    it('refuses the current state as unchanged, and a state of the other dimension', async () => {
      const item = await newItem('assess-bad');
      const same = await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'open', rationale: 'r' }, { expectedVersion: item.version });
      expect(same).toMatchObject({ outcome: 'invalid' });
      expect(fe(same)).toEqual(['newState:unchanged']);
      const wrong = await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'verified', rationale: 'r' }, { expectedVersion: item.version });
      expect(fe(wrong)).toEqual(['newState:invalid_state']);
      expect(await events(item.id)).toEqual([]);
      expect(await itemRow(item.id)).toMatchObject({ row_version: 1 });
    });

    it('a stale version conflicts; an archived item refuses', async () => {
      const item = await newItem('assess-guard');
      const stale = await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'resolved', rationale: 'r' }, { expectedVersion: '7' });
      expect(stale.outcome).toBe('conflict');
      const archived = await act('itemSetArchived', { id: item.id, archived: true }, { expectedVersion: item.version });
      const a = await act('itemAssess', { id: item.id, dimension: 'processing', newState: 'resolved', rationale: 'r' }, { expectedVersion: archived.version as string });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['id:archived']);
      expect(await events(item.id)).toEqual([]);
    });
  });

  describe('itemDerive', () => {
    it('creates a not_checked/open item with no evidence and a link pinned to the given revision', async () => {
      const source = await newItem('derive-src', { evidence: [pointer('src-ev')] });
      const revised = await act('itemRevise', { id: source.id, ...body('derive-src'), changeNote: 'c' }, { expectedVersion: source.version });
      expect(revised.outcome).toBe('ok');
      const a = await act('itemDerive', { sourceItemId: source.id, sourceRevisionNo: 1, ownerSoftwareId: ids.sw, ...body('derived') });
      expect(a).toMatchObject({ outcome: 'ok', version: '1' });
      const id = a.data?.id as string;
      expect(await itemRow(id)).toMatchObject({ owner_software_id: ids.sw, owner_model_id: null, verification_state: 'not_checked', processing_state: 'open', latest_revision_no: 1, row_version: 1 });
      expect(await evidence(id)).toEqual([]);
      expect(await links(id)).toEqual([
        expect.objectContaining({ workspace_id: WORKSPACE_ID, source_item_id: id, target_item_id: source.id, link_kind: 'derived_from', source_revision_no: 1, created_by: admin.id }),
      ]);
      expect(await audit(id)).toEqual([
        {
          event_type: 'knowledge.item.derived',
          subject_type: 'knowledge_item',
          actor_id: admin.id,
          detail: { itemNo: a.data?.itemNo, title: title('derived'), revisionNo: 1, sourceItemId: source.id, sourceRevisionNo: 1 },
        },
      ]);
    });

    it.each([
      ['an unknown source item', () => ({ sourceItemId: randomUUID(), sourceRevisionNo: 1 }), 'sourceItemId:not_found'],
      ['an unknown source revision', (sourceId: string) => ({ sourceItemId: sourceId, sourceRevisionNo: 9 }), 'sourceRevisionNo:not_found'],
    ] as const)('refuses %s and creates nothing', async (label, pick, expected) => {
      const source = await newItem(`derive-bad-${label}`);
      const a = await act('itemDerive', { ...pick(source.id), ownerModelId: ids.model, ...body(`derive-bad-${label}-new`) });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual([expected]);
      expect(await countItems(`derive-bad-${label}-new`)).toBe(0);
    });

    it('refuses an inactive owner and a source of another workspace', async () => {
      const source = await newItem('derive-owner');
      const a = await act('itemDerive', { sourceItemId: source.id, sourceRevisionNo: 1, ownerModelId: ids.modelOff, ...body('derive-owner-new') });
      expect(fe(a)).toEqual(['ownerModelId:inactive']);
      await sql('insert into knowledge.item_counter (workspace_id, last_item_no) values ($1, 1) on conflict do nothing', [otherWorkspace]);
      const foreign = (
        await sql(
          `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, latest_revision_no, publication_state, created_by, updated_by)
           values ($1, 1, $2, 1, 'published', $3, $3) returning id`,
          [otherWorkspace, ids.foreignModel, admin.id],
        )
      ).rows[0].id as string;
      await sql(
        `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by)
         values ($1, $2, 1, 'foreign', 'anomaly', 'o', $3)`,
        [otherWorkspace, foreign, admin.id],
      );
      const b = await act('itemDerive', { sourceItemId: foreign, sourceRevisionNo: 1, ownerModelId: ids.model, ...body('derive-foreign-new') });
      expect(fe(b)).toEqual(['sourceItemId:not_found']);
      expect(await countItems('derive-foreign-new')).toBe(0);
    });
  });

  describe('itemSetArchived', () => {
    it('archives, restores and keeps the same value idempotent', async () => {
      const item = await newItem('archive');
      const archived = await act('itemSetArchived', { id: item.id, archived: true }, { expectedVersion: item.version });
      expect(archived).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await itemRow(item.id)).toMatchObject({ publication_state: 'archived', row_version: 2, updated_by: admin.id });
      const again = await act('itemSetArchived', { id: item.id, archived: true }, { expectedVersion: '2' });
      expect(again).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await itemRow(item.id)).toMatchObject({ row_version: 2 });
      const restored = await act('itemSetArchived', { id: item.id, archived: false }, { expectedVersion: '2' });
      expect(restored).toMatchObject({ outcome: 'ok', version: '3' });
      expect(await itemRow(item.id)).toMatchObject({ publication_state: 'published', row_version: 3 });
      expect((await audit(item.id)).map((e) => e.event_type)).toEqual(['knowledge.item.created', 'knowledge.item.archived', 'knowledge.item.restored']);
      expect((await audit(item.id)).at(-1)?.detail).toEqual({ itemNo: item.itemNo, title: title('archive') });
    });

    it('a stale version conflicts even for the same value, and nothing is deleted', async () => {
      const item = await newItem('archive-stale');
      const a = await act('itemSetArchived', { id: item.id, archived: false }, { expectedVersion: '5' });
      expect(a.outcome).toBe('conflict');
      expect(await revisions(item.id)).toHaveLength(1);
      expect(await itemRow(item.id)).toBeDefined();
    });
  });

  describe('permission', () => {
    it('a User is forbidden on every action and no row is written', async () => {
      const calls: [string, Row][] = [
        ['itemCreate', { ownerModelId: ids.model, ...body('forbidden') }],
        ['itemDerive', { sourceItemId: randomUUID(), sourceRevisionNo: 1, ownerModelId: ids.model, ...body('forbidden') }],
      ];
      for (const [action, input] of calls) {
        expect((await act(action, input, { who: user })).outcome).toBe('forbidden');
      }
      const item = await newItem('forbidden-target');
      for (const [action, input] of [
        ['itemRevise', { id: item.id, ...body('forbidden-target'), changeNote: 'c' }],
        ['itemAssess', { id: item.id, dimension: 'processing', newState: 'resolved', rationale: 'r' }],
        ['itemSetArchived', { id: item.id, archived: true }],
      ] as [string, Row][]) {
        expect((await act(action, input, { who: user, expectedVersion: item.version })).outcome).toBe('forbidden');
      }
      expect(await countItems('forbidden')).toBe(0);
      expect(await itemRow(item.id)).toMatchObject({ row_version: 1 });
      expect(await audit(item.id)).toHaveLength(1);
    });

    it('a Developer without the grant is forbidden; with the grant it passes', async () => {
      const input = { ownerModelId: ids.model, ...body('dev') };
      expect((await act('itemCreate', input, { who: developer })).outcome).toBe('forbidden');
      expect(await countItems('dev')).toBe(0);
      const ok = await act('itemCreate', input, { who: developerGranted });
      expect(ok.outcome).toBe('ok');
      expect((await audit(ok.data?.id as string))[0]).toMatchObject({ actor_id: developerGranted.id });
    });

    it('an Admin without any grant passes', async () => {
      const grants = await sql('select 1 from permission.permission_grants where actor_id = $1', [admin.id]);
      expect(grants.rowCount).toBe(0);
      expect((await act('itemCreate', { ownerModelId: ids.model, ...body('admin') })).outcome).toBe('ok');
    });
  });
});
