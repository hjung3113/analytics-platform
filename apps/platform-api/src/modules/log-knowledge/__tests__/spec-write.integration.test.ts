// #1196 b1 — the model spec write actions (migration 0092) through the real `buildServer` over
// `POST /api/v1/menu-action` against a real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`;
// app as platform_app, fixtures and cleanup as platform_migrate). Each write is judged on the wire answer, the
// `knowledge.*` rows and the `core.audit_log` row written in the same transaction. Needs migration 0092.

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
import { specContentHash } from '../domain/spec-hash.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ISW${randomUUID().slice(0, 6).toUpperCase()}`;
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
/** Two modules (one child), three events, two relations. */
const CONTENT = {
  modules: [{ name: 'Spindle' }, { name: 'Spindle Motor', parentModule: 'spindle' }],
  events: [
    { module: 'Spindle', name: 'Start', fields: [field('speed')], triggerRule: 'on start' },
    { module: 'Spindle Motor', name: 'Run', fields: [] },
    { module: 'Spindle Motor', name: 'Stop', fields: [field('speed')] },
  ],
  relations: [
    { sourceModule: 'Spindle', sourceEvent: 'Start', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Run' },
    { sourceModule: 'Spindle Motor', sourceEvent: 'Run', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Stop', ruleRef: 'sec 4' },
  ],
};

describe.skipIf(!runIntegration)('model spec write actions (#1196 b1)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
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
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  /** Reads need `platform:view` (and the spec right for the draft read); one read per call. */
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
  async function newDraft(model: string, docVersion = 'v1', who: Person = admin) {
    const a = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC(docVersion) }, { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.revisionId as string, version: a.data.version as string };
  }
  async function filled(model: string, docVersion = 'v1', content: Record<string, unknown> = CONTENT) {
    const draft = await newDraft(model, docVersion);
    const saved = await act('specDraftSave', { revisionId: draft.id, mode: 'append', ...content }, { expectedVersion: draft.version });
    expect(saved.outcome, JSON.stringify(saved)).toBe('ok');
    return { id: draft.id, version: saved.version as string };
  }
  const revisionRow = async (id: string) => (await sql('select * from knowledge.model_spec_revision where id = $1', [id])).rows[0] as Row;
  const counts = async (id: string) =>
    Object.fromEntries(
      await Promise.all(
        ['spec_module', 'spec_event', 'spec_event_relation'].map(async (t) => [
          t,
          Number((await sql(`select count(*)::int as n from knowledge.${t} where spec_rev_id = $1`, [id])).rows[0].n),
        ]),
      ),
    );
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id]))
      .rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];
  /** The hash recomputed from the stored rows (independent of the action's own read). */
  async function recomputedHash(id: string): Promise<string> {
    const modules = (await sql('select id, module_key, name, parent_module_id from knowledge.spec_module where spec_rev_id = $1', [id])).rows;
    const key = new Map(modules.map((m) => [m.id as string, m.module_key as string]));
    const events = (await sql('select id, module_id, event_key, name, fields_json, trigger_rule, detail_doc_ref from knowledge.spec_event where spec_rev_id = $1', [id])).rows;
    const ref = new Map(events.map((e) => [e.id as string, { m: key.get(e.module_id as string) as string, e: e.event_key as string }]));
    const relations = (await sql('select source_event_id, predicate, target_event_id, rule_ref from knowledge.spec_event_relation where spec_rev_id = $1', [id])).rows;
    return specContentHash(1, {
      modules: modules.map((m) => ({ key: m.module_key, name: m.name, parentKey: m.parent_module_id ? (key.get(m.parent_module_id as string) as string) : null })),
      events: events.map((e) => ({ moduleKey: key.get(e.module_id as string) as string, key: e.event_key, name: e.name, fields: e.fields_json, triggerRule: e.trigger_rule, detailDocRef: e.detail_doc_ref })),
      relations: relations.map((r) => {
        const s = defined(ref.get(r.source_event_id as string));
        const t = defined(ref.get(r.target_event_id as string));
        return { sourceModule: s.m, sourceEvent: s.e, predicate: r.predicate, targetModule: t.m, targetEvent: t.e, ruleRef: r.rule_ref };
      }),
    });
  }

  // The suite sends far more writes than one actor's rate window allows; a 429 would hide the real assertion.
  beforeEach(async () => { await sql('delete from core.rate_limits'); });

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
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
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

  describe('permissions', () => {
    it('a User and a Developer without the capability are refused; a Developer with the workspace grant and an Admin write', async () => {
      const model = await newModel('perm');
      const input = { modelId: model, sourceDocRef: DOC() };
      expect((await act('specDraftCreate', input, { who: user })).outcome).toBe('forbidden');
      expect((await act('specDraftCreate', input, { who: developer })).outcome).toBe('forbidden');
      expect((await sql('select count(*)::int as n from knowledge.model_spec_revision where model_id = $1', [model])).rows[0].n).toBe(0);
      const granted = await act('specDraftCreate', input, { who: developerGranted });
      expect(granted).toMatchObject({ outcome: 'ok', version: '1' });
      expect((await revisionRow(granted.data.revisionId)).created_by).toBe(developerGranted.id);
      expect((await act('specDraftCreate', { modelId: await newModel('perm2'), sourceDocRef: DOC() }, { who: admin })).outcome).toBe('ok');
    });

    it('the draft read is for the spec right only', async () => {
      const model = await newModel('permread');
      const draft = await newDraft(model);
      expect((await read('specDraft', { revisionId: draft.id }, user)).outcome).not.toBe('ok');
      expect((await read('specDraft', { revisionId: draft.id }, developer)).outcome).not.toBe('ok');
      expect((await read('specDraft', { revisionId: draft.id }, developerGranted)).outcome).toBe('ok');
    });
  });

  describe('specDraftCreate', () => {
    it('creates revision 1 as a draft at row_version 1 with the source ref, and audits it', async () => {
      const model = await newModel('create');
      const a = await act('specDraftCreate', { modelId: model, sourceDocRef: { ...DOC(), link: 'https://example.invalid/spec' } });
      expect(a).toMatchObject({ outcome: 'ok', version: '1', data: { version: '1' } });
      expect(await revisionRow(a.data.revisionId)).toMatchObject({
        workspace_id: WORKSPACE_ID, model_id: model, revision_no: 1, state: 'draft', row_version: 1, content_sha256: null,
        schema_version: 1, created_by: admin.id, source_doc_ref: { ...DOC(), link: 'https://example.invalid/spec' },
      });
      expect(await audit(a.data.revisionId)).toEqual([
        {
          event_type: 'knowledge.spec.draft_saved', subject_type: 'knowledge_model_spec', actor_id: admin.id,
          detail: { modelId: model, revisionNo: 1, mode: 'create', added: { modules: 0, events: 0, relations: 0 } },
        },
      ]);
    });

    it('an unknown or foreign-workspace model is modelId:not_found; an open draft is modelId:draft_exists', async () => {
      expect(fe(await act('specDraftCreate', { modelId: randomUUID(), sourceDocRef: DOC() }))).toEqual(['modelId:not_found']);
      expect(fe(await act('specDraftCreate', { modelId: foreignModel, sourceDocRef: DOC() }))).toEqual(['modelId:not_found']);
      const model = await newModel('exists');
      await newDraft(model);
      const again = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC() });
      expect(again).toMatchObject({ outcome: 'invalid', data: null });
      expect(fe(again)).toEqual(['modelId:draft_exists']);
    });

    it('rejects a bad source ref and an unknown key', async () => {
      const model = await newModel('badref');
      expect(fe(await act('specDraftCreate', { modelId: model, sourceDocRef: { docLabel: 'x' } }))).toEqual(['sourceDocRef.docVersion:required']);
      expect(fe(await act('specDraftCreate', { modelId: model, sourceDocRef: { ...DOC(), file: 'a.pdf' } }))).toEqual(['sourceDocRef:malformed']);
    });

    it('parallel first creates on one model leave exactly one draft; the others answer draft_exists', async () => {
      const model = await newModel('parallel');
      const people = await Promise.all([person('admin'), person('admin'), person('admin'), person('admin'), person('admin'), person('admin')]);
      const answers = await Promise.all(people.map((who) => act('specDraftCreate', { modelId: model, sourceDocRef: DOC() }, { who })));
      expect(answers.filter((a) => a.outcome === 'ok')).toHaveLength(1);
      expect(answers.filter((a) => a.outcome === 'invalid').every((a) => fe(a).join() === 'modelId:draft_exists')).toBe(true);
      expect((await sql(`select count(*)::int as n from knowledge.model_spec_revision where model_id = $1 and state = 'draft'`, [model])).rows[0].n).toBe(1);
    });
  });

  describe('specDraftSave', () => {
    it('append inserts modules, events and relations, bumps the version, answers small counts and audits once', async () => {
      const model = await newModel('append');
      const draft = await newDraft(model);
      const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', ...CONTENT }, { expectedVersion: draft.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '2', data: { revisionId: draft.id, version: '2', counts: { modules: 2, events: 3, relations: 2 } } });
      expect(await counts(draft.id)).toEqual({ spec_module: 2, spec_event: 3, spec_event_relation: 2 });
      const rows = (await sql('select module_key, name, parent_module_id from knowledge.spec_module where spec_rev_id = $1 order by module_key', [draft.id])).rows;
      expect(rows.map((r) => [r.module_key, r.name, r.parent_module_id === null])).toEqual([['SPINDLE', 'Spindle', true], ['SPINDLE MOTOR', 'Spindle Motor', false]]);
      expect((await revisionRow(draft.id)).row_version).toBe(2);
      const trail = await audit(draft.id);
      expect(trail.map((t) => t.detail.mode)).toEqual(['create', 'append']);
      expect(trail[1]?.detail).toEqual({ modelId: model, revisionNo: 1, mode: 'append', added: { modules: 2, events: 3, relations: 2 } });
    });

    it('a second append adds to the draft; the draft read returns content and version; the published read stays empty', async () => {
      const model = await newModel('append2');
      const draft = await newDraft(model);
      const first = await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: CONTENT.modules, events: CONTENT.events.slice(0, 1) }, { expectedVersion: draft.version });
      const second = await act('specDraftSave', { revisionId: draft.id, mode: 'append', events: CONTENT.events.slice(1), relations: CONTENT.relations }, { expectedVersion: first.version as string });
      expect(second).toMatchObject({ outcome: 'ok', version: '3' });
      const content = await read('specDraft', { revisionId: draft.id });
      expect(content.data.revision).toMatchObject({ id: draft.id, modelId: model, state: 'draft', version: 3 });
      expect([content.data.modules.length, content.data.events.length, content.data.relations.length]).toEqual([2, 3, 2]);
      expect((await read('modelSpec', { modelId: model })).data).toBeNull();
      const headers = (await read('modelSpecRevisions', { modelId: model })).data.rows;
      expect(headers[0]).toMatchObject({ id: draft.id, state: 'draft', version: 3 });
    });

    it('may update the source ref', async () => {
      const draft = await newDraft(await newModel('ref'));
      await act('specDraftSave', { revisionId: draft.id, mode: 'append', sourceDocRef: DOC('v2') }, { expectedVersion: draft.version });
      expect((await revisionRow(draft.id)).source_doc_ref).toEqual(DOC('v2'));
    });

    it('a dangling reference, a duplicate key and a cycle are row-numbered field errors and write nothing', async () => {
      const draft = await newDraft(await newModel('errors'));
      const save = (input: Record<string, unknown>) => act('specDraftSave', { revisionId: draft.id, mode: 'append', ...input }, { expectedVersion: draft.version });
      expect(fe(await save({ modules: [{ name: 'A', parentModule: 'Z' }] }))).toEqual(['modules.0.parentModule:not_found']);
      expect(fe(await save({ modules: [{ name: 'A' }, { name: 'a' }] }))).toEqual(['modules.1.name:duplicate']);
      expect(fe(await save({ modules: [{ name: 'A', parentModule: 'B' }, { name: 'B', parentModule: 'A' }] }))).toEqual(['modules.0.parentModule:cycle', 'modules.1.parentModule:cycle']);
      expect(fe(await save({ events: [{ module: 'A', name: 'E' }] }))).toEqual(['events.0.module:not_found']);
      expect(fe(await save({ modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E' }], relations: [{ sourceModule: 'A', sourceEvent: 'E', predicate: 'p', targetModule: 'A', targetEvent: 'Q' }] }))).toEqual(['relations.0.targetEvent:not_found']);
      expect(await counts(draft.id)).toEqual({ spec_module: 0, spec_event: 0, spec_event_relation: 0 });
      expect((await revisionRow(draft.id)).row_version).toBe(1);
      // a duplicate against what an earlier call stored
      await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E' }] }, { expectedVersion: '1' });
      expect(fe(await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: [{ name: 'a' }] }, { expectedVersion: '2' }))).toEqual(['modules.0.name:duplicate']);
      expect(fe(await act('specDraftSave', { revisionId: draft.id, mode: 'append', events: [{ module: 'A', name: 'e' }] }, { expectedVersion: '2' }))).toEqual(['events.0.name:duplicate']);
    });

    it('the same event name under two modules is two events', async () => {
      const draft = await newDraft(await newModel('samename'));
      const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: [{ name: 'A' }, { name: 'B' }], events: [{ module: 'A', name: 'E' }, { module: 'B', name: 'E' }] }, { expectedVersion: draft.version });
      expect(a.outcome).toBe('ok');
    });

    it('refuses an unknown field key, an unknown type, more than 2,000 rows and a body over 512 KiB', async () => {
      const draft = await newDraft(await newModel('caps'));
      const save = (input: Record<string, unknown>) => act('specDraftSave', { revisionId: draft.id, mode: 'append', ...input }, { expectedVersion: draft.version });
      expect(fe(await save({ modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E', fields: [{ ...field('x'), extra: 1 }] }] }))).toEqual(['events.0.fields.0:malformed']);
      expect(fe(await save({ modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E', fields: [{ ...field('x'), type: 'date' }] }] }))).toEqual(['events.0.fields.0.type:malformed']);
      expect(fe(await save({ modules: Array.from({ length: 2001 }, (_, i) => ({ name: `M${i}` })) }))).toEqual(['input:too_large']);
      expect(fe(await save({ modules: [{ name: 'A' }], events: [{ module: 'A', name: 'E', triggerRule: 'x'.repeat(520 * 1024) }] }))).toEqual(['input:too_large']);
      expect(await counts(draft.id)).toEqual({ spec_module: 0, spec_event: 0, spec_event_relation: 0 });
    });

    it('accepts a full 2,000-row call and answers a small body', async () => {
      const draft = await newDraft(await newModel('big'));
      const modules = Array.from({ length: 200 }, (_, i) => ({ name: `Mod ${i}`, ...(i > 0 ? { parentModule: `Mod ${i - 1}` } : {}) }));
      const events = Array.from({ length: 1800 }, (_, i) => ({ module: `Mod ${i % 200}`, name: `Event ${i}`, fields: [field('v')] }));
      const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules, events }, { expectedVersion: draft.version });
      expect(a).toMatchObject({ outcome: 'ok', data: { counts: { modules: 200, events: 1800, relations: 0 } } });
      expect(JSON.stringify(a).length).toBeLessThan(2000);
    });

    it('replace rejects the draft and opens a new one with only the new rows; the old rows stay (append-only)', async () => {
      const model = await newModel('replace');
      const old = await filled(model);
      const a = await act(
        'specDraftSave',
        { revisionId: old.id, mode: 'replace', sourceDocRef: DOC('v2'), modules: [{ name: 'Only' }], events: [{ module: 'Only', name: 'One' }] },
        { expectedVersion: old.version },
      );
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const fresh = a.data.revisionId as string;
      expect(fresh).not.toBe(old.id);
      expect(a.data.counts).toEqual({ modules: 1, events: 1, relations: 0 });
      expect(await revisionRow(old.id)).toMatchObject({ state: 'rejected', reject_reason: 'replaced', published_by: null, content_sha256: null });
      expect(await counts(old.id)).toEqual({ spec_module: 2, spec_event: 3, spec_event_relation: 2 });
      expect(await revisionRow(fresh)).toMatchObject({ state: 'draft', revision_no: 2, row_version: 1, source_doc_ref: DOC('v2') });
      expect(await counts(fresh)).toEqual({ spec_module: 1, spec_event: 1, spec_event_relation: 0 });
      expect((await audit(fresh)).at(-1)?.detail).toMatchObject({ mode: 'replace', replacedRevisionId: old.id, revisionNo: 2 });
      // a rejected draft takes no more writes
      expect((await act('specDraftSave', { revisionId: old.id, mode: 'append', modules: [{ name: 'Late' }] }, { expectedVersion: old.version })).outcome).toBe('conflict');
      expect((await sql(`select count(*)::int as n from knowledge.model_spec_revision where model_id = $1 and state = 'draft'`, [model])).rows[0].n).toBe(1);
    });

    it('replace into an invalid body leaves the old draft untouched (one transaction)', async () => {
      const old = await filled(await newModel('replacefail'));
      const a = await act('specDraftSave', { revisionId: old.id, mode: 'replace', modules: [{ name: 'X', parentModule: 'nope' }] }, { expectedVersion: old.version });
      expect(fe(a)).toEqual(['modules.0.parentModule:not_found']);
      expect(await revisionRow(old.id)).toMatchObject({ state: 'draft', row_version: 2 });
    });
  });

  describe('concurrency and state', () => {
    it('a stale version answers conflict with the current version; a foreign revision is not_found', async () => {
      const draft = await filled(await newModel('stale'));
      const stale = await act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: [{ name: 'Z' }] }, { expectedVersion: '1' });
      expect(stale).toMatchObject({ outcome: 'conflict', version: draft.version });
      const foreign = await sql(
        `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,1,'draft',$3::jsonb,1,$4) returning id`,
        [otherWorkspace, foreignModel, JSON.stringify(DOC()), admin.id],
      );
      const id = foreign.rows[0].id as string;
      for (const [action, extra] of [['specDraftSave', { mode: 'append' }], ['specPublish', {}], ['specReject', { reason: 'x' }]] as const) {
        expect((await act(action, { revisionId: id, ...extra }, { expectedVersion: '1' })).outcome, action).toBe('not_found');
      }
      expect((await read('specDraft', { revisionId: id })).data).toBeNull();
    });

    it('a write to a published or a rejected revision answers conflict with a value no client holds', async () => {
      const published = await filled(await newModel('pubwrite'));
      const done = await act('specPublish', { revisionId: published.id }, { expectedVersion: published.version });
      expect(done.data.outcome).toBe('published');
      const rejected = await newDraft(await newModel('rejwrite'));
      await act('specReject', { revisionId: rejected.id, reason: 'no' }, { expectedVersion: rejected.version });
      for (const [id, version] of [[published.id, published.version], [published.id, done.version as string], [rejected.id, rejected.version]] as const) {
        for (const [action, extra] of [['specDraftSave', { mode: 'append', modules: [{ name: 'Late' }] }], ['specPublish', {}], ['specReject', { reason: 'again' }]] as const) {
          const a = await act(action, { revisionId: id, ...extra }, { expectedVersion: version });
          expect(a.outcome, `${action} on ${id}`).toBe('conflict');
          expect(a.version).toMatch(/^(published|rejected):\d+$/);
        }
      }
      expect(await counts(published.id)).toEqual({ spec_module: 2, spec_event: 3, spec_event_relation: 2 });
    });

    it('concurrent append and publish on one draft: the published row set always hashes to content_sha256', async () => {
      for (let round = 0; round < 4; round += 1) {
        const draft = await filled(await newModel(`race${round}`));
        const [append, publish] = await Promise.all([
          act('specDraftSave', { revisionId: draft.id, mode: 'append', modules: [{ name: `Late ${round}` }] }, { expectedVersion: draft.version, who: await person('admin') }),
          act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version, who: await person('admin') }),
        ]);
        const row = await revisionRow(draft.id);
        // Exactly one of them wins the version; the loser answers conflict.
        expect([append.outcome, publish.outcome].sort()).toEqual(['conflict', 'ok']);
        if (row.state === 'published') {
          expect(row.content_sha256).toBe(await recomputedHash(draft.id));
          expect((await counts(draft.id)).spec_module).toBe(2);
        } else {
          expect((await counts(draft.id)).spec_module).toBe(3);
        }
      }
    });

    it('a child insert holds the revision FOR SHARE: a publish update waits for it, and a late insert is refused', async () => {
      const model = await newModel('interlock');
      const draft = await filled(model);
      const inserter = await dbHandle.pool.connect();
      const sealer = await migrate.pool.connect();
      try {
        await inserter.query('begin');
        await inserter.query(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,'RACE','race')`, [WORKSPACE_ID, draft.id]);
        let sealed = false;
        await sealer.query('begin');
        const pending = sealer
          .query(`update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`, [draft.id, 'a'.repeat(64), admin.id])
          .then(() => { sealed = true; });
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(sealed, 'the seal waits for the open insert').toBe(false);
        await inserter.query('commit');
        await pending;
        await sealer.query('commit');
        expect((await counts(draft.id)).spec_module).toBe(3);
      } finally {
        await inserter.query('rollback').catch(() => undefined);
        await sealer.query('rollback').catch(() => undefined);
        inserter.release();
        sealer.release();
      }
      await expect(
        appSql(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,'LATE','late')`, [WORKSPACE_ID, draft.id]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('specPublish', () => {
    it('refuses an empty draft', async () => {
      const draft = await newDraft(await newModel('empty'));
      const a = await act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
      expect(a).toMatchObject({ outcome: 'invalid' });
      expect(fe(a)).toEqual(['revisionId:empty']);
      expect((await revisionRow(draft.id)).state).toBe('draft');
    });

    it('seals the draft: state, hash of the stored rows, publisher and time, one audit row; modelSpec serves it', async () => {
      const model = await newModel('publish');
      const draft = await filled(model);
      const a = await act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
      expect(a).toMatchObject({ outcome: 'ok', data: { outcome: 'published', revisionId: draft.id, contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
      const row = await revisionRow(draft.id);
      expect(row).toMatchObject({ state: 'published', published_by: admin.id, row_version: 3, reject_reason: null });
      expect(row.published_at).toBeInstanceOf(Date);
      expect(row.content_sha256).toBe(a.data.contentSha256);
      expect(row.content_sha256).toBe(await recomputedHash(draft.id));
      const trail = await audit(draft.id);
      expect(trail.at(-1)).toMatchObject({ event_type: 'knowledge.spec.published', detail: { outcome: 'published', contentSha256: row.content_sha256, counts: { modules: 2, events: 3, relations: 2 } } });
      expect((await read('modelSpec', { modelId: model })).data.revision).toMatchObject({ id: draft.id, contentSha256: row.content_sha256 });
      expect((await read('specDraft', { revisionId: draft.id })).data).toBeNull();
    });

    it('the same rows streamed in two calls in another order hash like one call (names normalised, order free)', async () => {
      const a = await filled(await newModel('hash1'));
      const b = await newDraft(await newModel('hash2'));
      const first = await act('specDraftSave', { revisionId: b.id, mode: 'append', modules: [{ name: '  Spindle   Motor ', parentModule: 'SPINDLE' }, { name: 'Spindle' }], events: [CONTENT.events[2], CONTENT.events[0]] }, { expectedVersion: b.version });
      const second = await act('specDraftSave', { revisionId: b.id, mode: 'append', events: [CONTENT.events[1]], relations: [...CONTENT.relations].reverse() }, { expectedVersion: first.version as string });
      expect(second.outcome, JSON.stringify(second)).toBe('ok');
      const pa = await act('specPublish', { revisionId: a.id }, { expectedVersion: a.version });
      const pb = await act('specPublish', { revisionId: b.id }, { expectedVersion: second.version as string });
      expect(pb.data.contentSha256).toBe(pa.data.contentSha256);
    });

    it('unchanged: the same content under another docVersion creates no revision, rejects the draft, answers the existing revision', async () => {
      const model = await newModel('unchanged');
      const first = await filled(model);
      const published = await act('specPublish', { revisionId: first.id }, { expectedVersion: first.version });
      const again = await filled(model, 'v2');
      const a = await act('specPublish', { revisionId: again.id }, { expectedVersion: again.version });
      expect(a).toMatchObject({ outcome: 'ok', data: { outcome: 'unchanged', revisionId: first.id } });
      expect(await revisionRow(again.id)).toMatchObject({ state: 'rejected', reject_reason: 'unchanged', content_sha256: null, published_by: null });
      expect((await audit(again.id)).at(-1)?.detail).toMatchObject({ outcome: 'unchanged', existingRevisionId: first.id, contentSha256: published.data.contentSha256 });
      expect((await sql(`select count(*)::int as n from knowledge.model_spec_revision where model_id = $1 and state = 'published'`, [model])).rows[0].n).toBe(1);
      // no orphan draft: the next create works, and different content publishes revision 3
      const next = await filled(model, 'v3', { ...CONTENT, modules: [...CONTENT.modules, { name: 'Extra' }] });
      const c = await act('specPublish', { revisionId: next.id }, { expectedVersion: next.version });
      expect(c.data.outcome).toBe('published');
      expect((await revisionRow(next.id)).revision_no).toBe(3);
    });
  });

  describe('specReject', () => {
    it('rejects a draft with a reason; who and when are in the audit row only', async () => {
      const draft = await filled(await newModel('reject'));
      const a = await act('specReject', { revisionId: draft.id, reason: ' wrong document ' }, { expectedVersion: draft.version });
      expect(a).toMatchObject({ outcome: 'ok', data: { revisionId: draft.id } });
      expect(await revisionRow(draft.id)).toMatchObject({ state: 'rejected', reject_reason: 'wrong document', published_by: null, published_at: null });
      const last = (await audit(draft.id)).at(-1);
      expect(last).toMatchObject({ event_type: 'knowledge.spec.rejected', actor_id: admin.id, detail: { reasonLength: 14 } });
    });

    it('needs a reason of at most 500 characters', async () => {
      const draft = await newDraft(await newModel('rejectinput'));
      expect(fe(await act('specReject', { revisionId: draft.id, reason: ' ' }, { expectedVersion: draft.version }))).toEqual(['reason:required']);
      expect(fe(await act('specReject', { revisionId: draft.id, reason: 'r'.repeat(501) }, { expectedVersion: draft.version }))).toEqual(['reason:too_long']);
    });
  });

  describe('the runtime role (migration 0092 grants and trigger)', () => {
    it('cannot rewrite a published row, change identity columns, or delete', async () => {
      const draft = await filled(await newModel('walls'));
      const published = await act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
      const id = draft.id;
      for (const statement of [
        `update knowledge.model_spec_revision set state = 'rejected' where id = $1`,
        `update knowledge.model_spec_revision set content_sha256 = '${'b'.repeat(64)}' where id = $1`,
        `update knowledge.model_spec_revision set row_version = 99 where id = $1`,
        `update knowledge.model_spec_revision set source_doc_ref = '{"docLabel":"x","docVersion":"y"}' where id = $1`,
      ]) {
        await expect(appSql(statement, [id]), statement).rejects.toMatchObject({ code: '23514' });
      }
      for (const statement of [
        `update knowledge.model_spec_revision set model_id = '${randomUUID()}' where id = $1`,
        `update knowledge.model_spec_revision set revision_no = 77 where id = $1`,
        `delete from knowledge.model_spec_revision where id = $1`,
        `delete from knowledge.spec_module where spec_rev_id = $1`,
        `delete from knowledge.spec_event where spec_rev_id = $1`,
        `delete from knowledge.spec_event_relation where spec_rev_id = $1`,
      ]) {
        await expect(appSql(statement, [id]), statement).rejects.toMatchObject({ code: '42501' });
      }
      expect(await revisionRow(id)).toMatchObject({ state: 'published', content_sha256: published.data.contentSha256, row_version: 3, revision_no: 1 });
    });

    it('on a draft: identity columns are not updatable and a draft save must raise row_version', async () => {
      const draft = await newDraft(await newModel('draftwalls'));
      await expect(appSql(`update knowledge.model_spec_revision set model_id = '${randomUUID()}' where id = $1`, [draft.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`update knowledge.model_spec_revision set revision_no = 5 where id = $1`, [draft.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`update knowledge.model_spec_revision set source_doc_ref = $2::jsonb where id = $1`, [draft.id, JSON.stringify(DOC('v9'))])).rejects.toMatchObject({ code: '23514' });
      await appSql(`update knowledge.model_spec_revision set source_doc_ref = $2::jsonb, row_version = row_version + 1 where id = $1`, [draft.id, JSON.stringify(DOC('v9'))]);
    });

    it('allows only one open draft per model', async () => {
      const model = await newModel('onedraft');
      await newDraft(model);
      await expect(
        sql(`insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,2,'draft',$3::jsonb,1,$4)`, [WORKSPACE_ID, model, JSON.stringify(DOC()), admin.id]),
      ).rejects.toMatchObject({ constraint: 'model_spec_revision_open_draft_uq' });
    });
  });

  describe('audit projection (0092)', () => {
    it('lists the spec events with their platform actions, and still lists a voc.read_public grant row', async () => {
      const draft = await filled(await newModel('audit'));
      await act('specPublish', { revisionId: draft.id }, { expectedVersion: draft.version });
      const grantRow = randomUUID();
      await sql(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail) values ($1,$2,'permission_granted','permission_grant',$3,'probe',$4::jsonb)`,
        [WORKSPACE_ID, admin.id, grantRow, JSON.stringify({ capability: 'voc.read_public' })],
      );
      const { rows } = await dbHandle.pool.query(
        `select event_type, subject_type, subject_id from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = any($3)`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), [draft.id, grantRow]],
      );
      const spec = rows.filter((r) => r.subject_id === draft.id);
      expect(new Set(spec.map((r) => r.subject_type))).toEqual(new Set(['knowledge_model_spec']));
      expect(new Set(spec.map((r) => r.event_type))).toEqual(new Set(['knowledge.spec.draft_saved', 'knowledge.spec.published']));
      expect(rows.filter((r) => r.subject_id === grantRow)).toHaveLength(1);
    });

    it('lists a knowledge.spec.publish permission row (the capability is projected)', async () => {
      const subject = randomUUID();
      await sql(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail) values ($1,$2,'permission_granted','permission_grant',$3,'probe',$4::jsonb)`,
        [WORKSPACE_ID, admin.id, subject, JSON.stringify({ capability: 'knowledge.spec.publish' })],
      );
      const { rows } = await dbHandle.pool.query(
        `select event_type from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = $3`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), subject],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('software release_order under concurrent writes (#1196 a trigger, shared model)', () => {
    const insertSoftware = (model: string, label: string) =>
      sql(
        `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning release_order`,
        [WORKSPACE_ID, model, label, toCodeKey(label), admin.id],
      );
    const orders = async (model: string) =>
      (await sql('select release_order from knowledge.software_version where model_id = $1 order by release_order', [model])).rows.map((r) => r.release_order as number);

    it('8 parallel direct inserts and softwareCreate calls for one model get distinct consecutive orders from max+1', async () => {
      const model = await newModel('ro');
      await insertSoftware(model, `${TAG}-ro-seed`);
      const people = await Promise.all([person('admin'), person('admin')]);
      await Promise.all([
        ...Array.from({ length: 6 }, (_, i) => insertSoftware(model, `${TAG}-ro-direct-${i}`)),
        ...people.map((who, i) => act('softwareCreate', { modelId: model, versionLabel: `${TAG}-ro-action-${i}`, name: '' }, { who })),
      ]);
      expect(await orders(model)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('a transaction holding the lock for model A does not block an insert for model B', async () => {
      const a = await newModel('roa');
      const b = await newModel('rob');
      const holder = await migrate.pool.connect();
      try {
        await holder.query('begin');
        await holder.query(
          `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5)`,
          [WORKSPACE_ID, a, `${TAG}-roa-1`, toCodeKey(`${TAG}-roa-1`), admin.id],
        );
        const started = Date.now();
        const inserted = await insertSoftware(b, `${TAG}-rob-1`);
        expect(inserted.rows[0].release_order).toBe(1);
        expect(Date.now() - started).toBeLessThan(2000);
      } finally {
        await holder.query('rollback').catch(() => undefined);
        holder.release();
      }
      expect(await orders(a)).toEqual([]);
    });
  });
});
