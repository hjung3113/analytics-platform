// #1196 e — concept mapping (migration 0098): propose / confirm / reject, the reads and the suggestion scan through the
// real `buildServer` over `/api/v1/menu-action` and `/api/v1/menu-query` against a real Postgres (throwaway DB only; app
// as platform_app, fixtures and cleanup as platform_migrate). Needs migration 0098.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';
import { toCodeKey } from '../domain/code-key.js';
import { buildTargetKey } from '../domain/spec-target-key.js';
import { findEquivalents } from '../repositories/concept.js';
import { resolveTargets, scanCurrentTargets } from '../repositories/spec-targets.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ICM${randomUUID().slice(0, 6).toUpperCase()}`;
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

describe.skipIf(!runIntegration)('concept mapping (#1196 e)', () => {
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

  /** Spec content with names unique to `prefix`, so the workspace-wide suggestion scan of one test does not meet another's data. */
  const content = (prefix: string, opts: { stop?: boolean; startName?: string } = {}) => ({
    modules: [{ name: `${prefix} Spindle` }],
    events: [
      { module: `${prefix} Spindle`, name: opts.startName ?? 'Start', fields: [field('speed'), field('load')] },
      ...(opts.stop === false ? [] : [{ module: `${prefix} Spindle`, name: 'Stop', fields: [] }]),
    ],
    relations: [],
  });
  async function publishRevision(model: string, body: ReturnType<typeof content>): Promise<string> {
    const created = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC() });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    const saved = await act('specDraftSave', { revisionId: created.data.revisionId, mode: 'append', ...body }, { expectedVersion: created.data.version });
    expect(saved.outcome, JSON.stringify(saved)).toBe('ok');
    const published = await act('specPublish', { revisionId: created.data.revisionId }, { expectedVersion: saved.version as string });
    expect(published.data.outcome, JSON.stringify(published)).toBe('published');
    return created.data.revisionId as string;
  }
  const eventBody = (prefix: string, event = 'Start') => ({ module: `${prefix} Spindle`, event });
  const eventKey = (prefix: string, event = 'Start') => buildTargetKey({ kind: 'event', module: toCodeKey(`${prefix} Spindle`), event: toCodeKey(event) });
  const moduleKey = (prefix: string) => buildTargetKey({ kind: 'module', module: toCodeKey(`${prefix} Spindle`) });

  /** Two models with the same-shaped spec under `prefix` (a distinct prefix per test keeps tests independent). */
  async function pair(prefix: string) {
    const a = await newModel(`${prefix}-a`);
    const b = await newModel(`${prefix}-b`);
    await publishRevision(a, content(prefix));
    await publishRevision(b, content(prefix));
    return { a, b };
  }
  const propose = (modelId: string, prefix: string, over: Record<string, unknown> = {}, who: Person = admin) =>
    act('conceptPropose', { modelId, targetKind: 'event', target: eventBody(prefix), canonicalLabel: `${prefix} start`, ...over }, { who });
  async function proposeOk(modelId: string, prefix: string, over: Record<string, unknown> = {}) {
    const a = await propose(modelId, prefix, 'conceptId' in over ? { canonicalLabel: undefined, ...over } : over);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.data as { conceptId: string; mappingId: string; pairMappingId?: string };
  }
  const mappingRow = async (id: string) => (await sql('select * from knowledge.spec_concept_mapping where id = $1', [id])).rows[0] as Row;
  const mappingCount = async (model: string) => (await sql('select count(*)::int as n from knowledge.spec_concept_mapping where model_id = $1', [model])).rows[0].n as number;
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id]))
      .rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];

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
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql('delete from knowledge.spec_concept_mapping where proposed_by = any($1)', [actorIds]);
    await sql('delete from knowledge.common_concept where created_by = any($1)', [actorIds]);
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
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
    it('a User and a Developer without the capability are refused on every write; a granted Developer writes; reads need only platform:view', async () => {
      const { a } = await pair('perm');
      for (const who of [user, developer]) {
        expect((await propose(a, 'perm', {}, who)).outcome).toBe('forbidden');
        expect((await act('conceptConfirm', { mappingId: randomUUID() }, { who, expectedVersion: '1' })).outcome).toBe('forbidden');
        expect((await act('conceptReject', { mappingId: randomUUID(), reason: 'x' }, { who, expectedVersion: '1' })).outcome).toBe('forbidden');
      }
      expect(await mappingCount(a)).toBe(0);
      const granted = await propose(a, 'perm', {}, developerGranted);
      expect(granted.outcome, JSON.stringify(granted)).toBe('ok');
      expect((await mappingRow(granted.data.mappingId)).proposed_by).toBe(developerGranted.id);
      const asUser = await read('conceptMappings', { modelId: a }, user);
      expect(asUser.outcome).toBe('ok');
      expect(asUser.data.total).toBe(1);
      expect((await read('conceptSuggestions', { modelId: a }, user)).outcome).toBe('ok');
    });

    it('a model of another workspace is not found, and another workspace\'s rows are never read', async () => {
      expect(fe(await propose(foreignModel, 'iso'))).toEqual(['modelId:not_found']);
      const empty = await read('conceptMappings', { modelId: foreignModel });
      expect(empty.data).toEqual({ total: 0, rows: [] });
      const sugg = await read('conceptSuggestions', { modelId: foreignModel });
      expect(sugg.data).toEqual({ total: 0, rows: [] });
    });
  });

  describe('conceptPropose', () => {
    it('stores a proposed human mapping on a new concept, answers its ids, and audits without a label or key', async () => {
      const { a } = await pair('prop');
      const out = await proposeOk(a, 'prop', { description: 'start of spindle' });
      expect(await mappingRow(out.mappingId)).toMatchObject({
        workspace_id: WORKSPACE_ID, concept_id: out.conceptId, model_id: a, target_kind: 'event', target_key: eventKey('prop'),
        relation_kind: 'equivalent', review_state: 'proposed', origin: 'human', similarity_score: null, similarity_basis: null,
        reject_reason: null, proposed_by: admin.id, reviewed_by: null, reviewed_at: null, row_version: 1,
      });
      expect((await sql('select * from knowledge.common_concept where id = $1', [out.conceptId])).rows[0]).toMatchObject({
        kind: 'event', canonical_label: 'prop start', label_key: toCodeKey('prop start'), description: 'start of spindle', row_version: 1,
      });
      const trail = await audit(out.mappingId);
      expect(trail).toEqual([
        {
          event_type: 'knowledge.spec.concept_proposed', subject_type: 'knowledge_model_spec', actor_id: admin.id,
          detail: { modelId: a, mappingId: out.mappingId, conceptId: out.conceptId, targetKind: 'event', relationKind: 'equivalent', origin: 'human' },
        },
      ]);
      expect(JSON.stringify(trail)).not.toContain('prop start');
      expect(JSON.stringify(trail)).not.toContain(eventKey('prop'));
      const { rows } = await appSql(
        `select event_type, subject_type from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = $3`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), out.mappingId],
      );
      expect(rows).toEqual([]); // 0119: source event is asserted in `trail` above; no caller-aware Admin projection yet.
    });

    it('picks the existing concept of the same label key (a case or spacing variant is the same concept), never merging kinds', async () => {
      const { a, b } = await pair('pick');
      const first = await proposeOk(a, 'pick');
      const second = await proposeOk(b, 'pick', { canonicalLabel: '  PICK   START ' });
      expect(second.conceptId).toBe(first.conceptId);
      expect((await sql('select count(*)::int as n from knowledge.common_concept where label_key = $1', [toCodeKey('pick start')])).rows[0].n).toBe(1);
      const asModule = await act('conceptPropose', { modelId: a, targetKind: 'module', target: { module: 'pick Spindle' }, canonicalLabel: 'pick start' });
      expect(asModule.outcome, JSON.stringify(asModule)).toBe('ok');
      expect(asModule.data.conceptId).not.toBe(first.conceptId);
    });

    it('same name never implies same concept: two models with an identical event name get no mapping until a human proposes one', async () => {
      const { a, b } = await pair('same');
      expect(await mappingCount(a)).toBe(0);
      expect(await mappingCount(b)).toBe(0);
      expect((await read('conceptMappings', { modelId: b })).data.total).toBe(0);
    });

    it('uses an existing concept id; an unknown id is conceptId:not_found, the other kind is conceptId:kind_mismatch', async () => {
      const { a, b } = await pair('byid');
      const first = await proposeOk(a, 'byid');
      const reuse = await act('conceptPropose', { modelId: b, targetKind: 'event', target: eventBody('byid'), conceptId: first.conceptId, relationKind: 'related' });
      expect(reuse.outcome, JSON.stringify(reuse)).toBe('ok');
      expect(await mappingRow(reuse.data.mappingId)).toMatchObject({ concept_id: first.conceptId, relation_kind: 'related' });
      expect(fe(await act('conceptPropose', { modelId: b, targetKind: 'event', target: eventBody('byid', 'Stop'), conceptId: randomUUID() }))).toEqual(['conceptId:not_found']);
      expect(fe(await act('conceptPropose', { modelId: b, targetKind: 'module', target: { module: 'byid Spindle' }, conceptId: first.conceptId }))).toEqual(['conceptId:kind_mismatch']);
    });

    it('judges the target key against the CURRENT published revision: not_found, none_published, and a module key is not an event', async () => {
      const { a } = await pair('tgt');
      expect(fe(await propose(a, 'tgt', { target: eventBody('tgt', 'Ghost') }))).toEqual(['targetKey:not_found']);
      expect(fe(await propose(a, 'tgt', { targetKind: 'module', target: { module: 'tgt Spindle', } }))).toEqual([]);
      expect(fe(await propose(a, 'tgt', { targetKind: 'module', target: { module: 'Nope' }, canonicalLabel: 'x' }))).toEqual(['targetKey:not_found']);
      const bare = await newModel('tgt-bare');
      expect(fe(await propose(bare, 'tgt'))).toEqual(['revision:none_published']);
      expect(await mappingCount(bare)).toBe(0);
    });

    it('an open pair is targetKey-independent conflict `already_mapped`; after a reject the same pair is `already_rejected` and never re-proposed', async () => {
      const { a } = await pair('dup');
      const first = await proposeOk(a, 'dup');
      expect(fe(await propose(a, 'dup'))).toEqual(['target:already_mapped']);
      expect(await mappingCount(a)).toBe(1);
      const rejected = await act('conceptReject', { mappingId: first.mappingId, reason: 'not the same' }, { expectedVersion: '1' });
      expect(rejected.outcome, JSON.stringify(rejected)).toBe('ok');
      expect(fe(await propose(a, 'dup'))).toEqual(['target:already_rejected']);
      expect(await mappingCount(a)).toBe(1);
      // another concept for the same target is a different pair
      expect((await propose(a, 'dup', { canonicalLabel: 'dup other' })).outcome).toBe('ok');
    });

    it('a pair accepts a suggestion: both targets are proposed on ONE concept with the server-computed score, never confirmed', async () => {
      const { a, b } = await pair('acc');
      const out = await proposeOk(a, 'acc', { pairWith: { modelId: b, targetKind: 'event', target: eventBody('acc') } });
      expect(out.pairMappingId).toBeTruthy();
      const rows = [await mappingRow(out.mappingId), await mappingRow(out.pairMappingId as string)];
      expect(rows.map((r) => [r.model_id, r.review_state, r.origin, r.concept_id])).toEqual([
        [a, 'proposed', 'similarity', out.conceptId],
        [b, 'proposed', 'similarity', out.conceptId],
      ]);
      expect(rows[0]?.similarity_score).toBe(1);
      expect(rows[0]?.similarity_basis).toEqual({ name_trgm: 1, field_overlap: 1 });
      expect((await audit(out.pairMappingId as string)).at(-1)?.detail).toMatchObject({ origin: 'similarity', modelId: b });
      // a pair whose target is gone writes nothing at all
      const before = await mappingCount(a);
      expect(fe(await propose(a, 'acc', { canonicalLabel: 'acc two', pairWith: { modelId: b, targetKind: 'event', target: eventBody('acc', 'Ghost') } }))).toEqual(['pairWith.targetKey:not_found']);
      expect(await mappingCount(a)).toBe(before);
    });

    it('a replay with the same idempotency key answers the stored result and writes one row', async () => {
      const { a } = await pair('rep');
      const key = randomUUID();
      const first = await act('conceptPropose', { modelId: a, targetKind: 'event', target: eventBody('rep'), canonicalLabel: 'rep start' }, { key });
      const again = await act('conceptPropose', { modelId: a, targetKind: 'event', target: eventBody('rep'), canonicalLabel: 'rep start' }, { key });
      expect(again).toMatchObject({ outcome: 'ok', data: first.data });
      expect(await mappingCount(a)).toBe(1);
    });
  });

  describe('conceptConfirm and conceptReject', () => {
    it('confirm moves proposed → confirmed with the reviewer, bumps the version, audits; a stale version conflicts', async () => {
      const { a } = await pair('conf');
      const out = await proposeOk(a, 'conf');
      expect((await act('conceptConfirm', { mappingId: out.mappingId }, { expectedVersion: '7' })).outcome).toBe('conflict');
      const done = await act('conceptConfirm', { mappingId: out.mappingId }, { expectedVersion: '1' });
      expect(done).toMatchObject({ outcome: 'ok', version: '2', data: { mappingId: out.mappingId } });
      const row = await mappingRow(out.mappingId);
      expect(row).toMatchObject({ review_state: 'confirmed', reviewed_by: admin.id, row_version: 2, reject_reason: null });
      expect(row.reviewed_at).not.toBeNull();
      expect((await audit(out.mappingId)).at(-1)).toMatchObject({ event_type: 'knowledge.spec.concept_confirmed', detail: { relationKind: 'equivalent', conceptId: out.conceptId } });
      const again = await act('conceptConfirm', { mappingId: out.mappingId }, { expectedVersion: '2' });
      expect(fe(again)).toEqual(['mapping:already_confirmed']);
    });

    it('one confirmed equivalent per target: a second concept cannot be confirmed (target:already_confirmed); `related` can', async () => {
      const { a } = await pair('one');
      const first = await proposeOk(a, 'one');
      const second = await proposeOk(a, 'one', { canonicalLabel: 'one rival' });
      const related = await proposeOk(a, 'one', { canonicalLabel: 'one cousin', relationKind: 'related' });
      expect((await act('conceptConfirm', { mappingId: first.mappingId }, { expectedVersion: '1' })).outcome).toBe('ok');
      expect(fe(await act('conceptConfirm', { mappingId: second.mappingId }, { expectedVersion: '1' }))).toEqual(['target:already_confirmed']);
      expect((await mappingRow(second.mappingId)).review_state).toBe('proposed');
      expect((await act('conceptConfirm', { mappingId: related.mappingId }, { expectedVersion: '1' })).outcome).toBe('ok');
      // after the holder is rejected, the rival can take the place
      expect((await act('conceptReject', { mappingId: first.mappingId, reason: 'wrong' }, { expectedVersion: '2' })).outcome).toBe('ok');
      expect((await act('conceptConfirm', { mappingId: second.mappingId }, { expectedVersion: '1' })).outcome).toBe('ok');
    });

    it('the database holds the one-confirmed-equivalent rule too (partial unique index)', async () => {
      const { a } = await pair('uq');
      const first = await proposeOk(a, 'uq');
      const second = await proposeOk(a, 'uq', { canonicalLabel: 'uq rival' });
      await act('conceptConfirm', { mappingId: first.mappingId }, { expectedVersion: '1' });
      await expect(appSql(`update knowledge.spec_concept_mapping set review_state = 'confirmed', reviewed_by = $2, reviewed_at = now(), row_version = row_version + 1 where id = $1`, [second.mappingId, admin.id])).rejects.toMatchObject({ code: '23505' });
    });

    it('confirm refuses a target a later revision removed (targetKey:not_found); reject still works', async () => {
      const a = await newModel('gone-a');
      await publishRevision(a, content('gone'));
      const stop = await proposeOk(a, 'gone', { target: eventBody('gone', 'Stop'), canonicalLabel: 'gone stop' });
      await publishRevision(a, content('gone', { stop: false }));
      expect(fe(await act('conceptConfirm', { mappingId: stop.mappingId }, { expectedVersion: '1' }))).toEqual(['targetKey:not_found']);
      expect((await mappingRow(stop.mappingId)).review_state).toBe('proposed');
      expect((await act('conceptReject', { mappingId: stop.mappingId, reason: 'removed' }, { expectedVersion: '1' })).outcome).toBe('ok');
    });

    it('reject needs a reason; it takes proposed or confirmed, stores the reason and audits without it; a rejected row is final', async () => {
      const { a } = await pair('rej');
      const p = await proposeOk(a, 'rej');
      expect(fe(await act('conceptReject', { mappingId: p.mappingId }, { expectedVersion: '1' }))).toEqual(['reason:required']);
      expect(fe(await act('conceptReject', { mappingId: p.mappingId, reason: '   ' }, { expectedVersion: '1' }))).toEqual(['reason:required']);
      const done = await act('conceptReject', { mappingId: p.mappingId, reason: 'secret reason text' }, { expectedVersion: '1' });
      expect(done).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await mappingRow(p.mappingId)).toMatchObject({ review_state: 'rejected', reject_reason: 'secret reason text', reviewed_by: admin.id, row_version: 2 });
      const trail = await audit(p.mappingId);
      expect(trail.at(-1)).toMatchObject({ event_type: 'knowledge.spec.concept_rejected', detail: { priorState: 'proposed', conceptId: p.conceptId } });
      expect(JSON.stringify(trail)).not.toContain('secret reason text');
      expect(fe(await act('conceptReject', { mappingId: p.mappingId, reason: 'again' }, { expectedVersion: '2' }))).toEqual(['mapping:already_rejected']);
      expect(fe(await act('conceptConfirm', { mappingId: p.mappingId }, { expectedVersion: '2' }))).toEqual(['mapping:already_rejected']);
      const c = await proposeOk(a, 'rej', { canonicalLabel: 'rej confirmed' });
      await act('conceptConfirm', { mappingId: c.mappingId }, { expectedVersion: '1' });
      const demoted = await act('conceptReject', { mappingId: c.mappingId, reason: 'was wrong' }, { expectedVersion: '2' });
      expect(demoted.outcome, JSON.stringify(demoted)).toBe('ok');
      expect((await audit(c.mappingId)).at(-1)?.detail).toMatchObject({ priorState: 'confirmed' });
    });

    it('an unknown or foreign mapping id is not_found', async () => {
      expect((await act('conceptConfirm', { mappingId: randomUUID() }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await act('conceptReject', { mappingId: randomUUID(), reason: 'x' }, { expectedVersion: '1' })).outcome).toBe('not_found');
    });
  });

  describe('append-only tables and guard trigger', () => {
    it('the runtime role cannot DELETE or change identity / evidence columns; the trigger guards the migrate role too', async () => {
      const { a, b } = await pair('guard');
      const out = await proposeOk(a, 'guard');
      await expect(appSql('delete from knowledge.spec_concept_mapping where id = $1', [out.mappingId])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from knowledge.common_concept where id = $1', [out.conceptId])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql(`update knowledge.common_concept set canonical_label = 'x' where id = $1`, [out.conceptId])).rejects.toMatchObject({ code: '42501' });
      for (const [column, value] of [['target_key', `'X/Y'`], ['model_id', `'${b}'::uuid`], ['relation_kind', `'related'`], ['origin', `'similarity'`], ['proposed_by', `'${user.id}'::uuid`]] as const) {
        await expect(appSql(`update knowledge.spec_concept_mapping set ${column} = ${value} where id = $1`, [out.mappingId]), column).rejects.toMatchObject({ code: '42501' });
        await expect(sql(`update knowledge.spec_concept_mapping set ${column} = ${value}, row_version = row_version + 1 where id = $1`, [out.mappingId]), `trigger ${column}`).rejects.toMatchObject({ code: '23514' });
      }
      expect((await mappingRow(out.mappingId)).row_version).toBe(1);
    });

    it('row_version rises by exactly 1; the state only moves forward; a rejected row never changes; the reject reason follows the state', async () => {
      const { a } = await pair('state');
      const out = await proposeOk(a, 'state');
      const review = (set: string) => sql(`update knowledge.spec_concept_mapping set ${set} where id = $1`, [out.mappingId]);
      await expect(review(`review_state = 'confirmed', reviewed_by = '${admin.id}', reviewed_at = now()`)).rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'confirmed', reviewed_by = '${admin.id}', reviewed_at = now(), row_version = row_version + 2`)).rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'rejected', reviewed_by = '${admin.id}', reviewed_at = now(), row_version = row_version + 1`), 'reject without reason').rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'confirmed', row_version = row_version + 1`), 'confirm without reviewer').rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'confirmed', reviewed_at = now(), row_version = row_version + 1`), 'confirm with a time but no reviewer').rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'confirmed', reviewed_by = '${admin.id}', row_version = row_version + 1`), 'confirm with a reviewer but no time').rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'rejected', reject_reason = 'r', reviewed_at = now(), row_version = row_version + 1`), 'reject with a time but no reviewer').rejects.toMatchObject({ code: '23514' });
      await expect(review(`review_state = 'rejected', reject_reason = 'r', reviewed_by = '${admin.id}', row_version = row_version + 1`), 'reject with a reviewer but no time').rejects.toMatchObject({ code: '23514' });
      await review(`review_state = 'confirmed', reviewed_by = '${admin.id}', reviewed_at = now(), row_version = row_version + 1`);
      await expect(review(`review_state = 'proposed', reviewed_by = null, reviewed_at = null, row_version = row_version + 1`), 'confirmed → proposed').rejects.toMatchObject({ code: '23514' });
      await review(`review_state = 'rejected', reject_reason = 'r', row_version = row_version + 1`);
      await expect(review(`review_state = 'confirmed', reject_reason = null, row_version = row_version + 1`), 'rejected → confirmed').rejects.toMatchObject({ code: '23514' });
      await expect(review(`reject_reason = 'other', row_version = row_version + 1`), 'rejected → rejected').rejects.toMatchObject({ code: '23514' });
    });

    it('the database refuses a mapping whose kind differs from its concept, a similarity origin without evidence, and a second open pair row', async () => {
      const { a } = await pair('chk');
      const out = await proposeOk(a, 'chk');
      const insert = (over: Record<string, string>) => {
        const v = { target_kind: `'event'`, origin: `'human'`, score: 'null', basis: 'null', key: `'CHK SPINDLE/OTHER'`, ...over };
        return sql(
          `insert into knowledge.spec_concept_mapping (workspace_id, concept_id, model_id, target_kind, target_key, relation_kind, origin, similarity_score, similarity_basis, proposed_by)
           values ($1,$2,$3,${v.target_kind},${v.key},'equivalent',${v.origin},${v.score},${v.basis},$4)`,
          [WORKSPACE_ID, out.conceptId, a, admin.id],
        );
      };
      await expect(insert({ target_kind: `'module'`, key: `'CHK SPINDLE'` }), 'kind').rejects.toMatchObject({ code: '23503' });
      await expect(insert({ origin: `'similarity'` }), 'similarity without evidence').rejects.toMatchObject({ code: '23514' });
      await expect(insert({ score: '0.5', basis: `'{"name_trgm":0.5}'::jsonb` }), 'human with evidence').rejects.toMatchObject({ code: '23514' });
      await expect(insert({ origin: `'similarity'`, score: '1.5', basis: `'{"name_trgm":1}'::jsonb` }), 'score range').rejects.toMatchObject({ code: '23514' });
      await expect(insert({ key: `'${eventKey('chk')}'` }), 'second open pair').rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('reads', () => {
    it('conceptMappings filters by model, concept, state and kind, pages 0-based, and answers the concept and model names', async () => {
      const { a, b } = await pair('list');
      const first = await proposeOk(a, 'list');
      const second = await proposeOk(b, 'list', { conceptId: first.conceptId });
      const module = await act('conceptPropose', { modelId: a, targetKind: 'module', target: { module: 'list Spindle' }, canonicalLabel: 'list module' });
      await act('conceptConfirm', { mappingId: second.mappingId }, { expectedVersion: '1' });

      const byConcept = await read('conceptMappings', { conceptId: first.conceptId });
      expect(byConcept.data.total).toBe(2);
      expect(byConcept.data.rows.map((r: Row) => r.id).sort()).toEqual([first.mappingId, second.mappingId].sort());
      expect(byConcept.data.rows[0]).toMatchObject({ conceptLabel: 'list start', targetState: 'present', targetName: 'Start', kind: 'event', modelName: expect.stringContaining(TAG) });
      expect((await read('conceptMappings', { modelId: a })).data.total).toBe(2);
      expect((await read('conceptMappings', { modelId: a, kind: 'module' })).data.rows.map((r: Row) => r.id)).toEqual([module.data.mappingId]);
      expect((await read('conceptMappings', { modelId: b, reviewState: 'confirmed' })).data.rows.map((r: Row) => [r.id, r.version, r.reviewedBy])).toEqual([[second.mappingId, 2, admin.id]]);
      expect((await read('conceptMappings', { modelId: b, reviewState: 'proposed' })).data.total).toBe(0);
      const page0 = await read('conceptMappings', { modelId: a, page: 0, pageSize: 1 });
      const page1 = await read('conceptMappings', { modelId: a, page: 1, pageSize: 1 });
      expect([page0.data.total, page0.data.rows.length, page1.data.rows.length]).toEqual([2, 1, 1]);
      expect(page0.data.rows[0].id).not.toBe(page1.data.rows[0].id);
      expect((await read('conceptMappings', { modelId: a, page: 2, pageSize: 1 })).data.rows).toEqual([]);
    });

    it('a mapping whose key a later revision removed reads as target_gone and is kept; a new revision that keeps it stays present', async () => {
      const a = await newModel('tg-a');
      await publishRevision(a, content('tg'));
      const stop = await proposeOk(a, 'tg', { target: eventBody('tg', 'Stop'), canonicalLabel: 'tg stop' });
      const start = await proposeOk(a, 'tg', { canonicalLabel: 'tg start' });
      await act('conceptConfirm', { mappingId: stop.mappingId }, { expectedVersion: '1' });
      await publishRevision(a, content('tg', { stop: false }));
      const rows = (await read('conceptMappings', { modelId: a })).data.rows as Row[];
      expect(rows.find((r) => r.id === stop.mappingId)).toMatchObject({ targetState: 'target_gone', targetName: null, reviewState: 'confirmed' });
      expect(rows.find((r) => r.id === start.mappingId)).toMatchObject({ targetState: 'present', targetName: 'Start' });
      expect((await mappingRow(stop.mappingId)).review_state).toBe('confirmed');
    });

    it('a rename that keeps the key keeps the mapping present with the new name; a renamed key is gone (keys, not names, are the identity)', async () => {
      const a = await newModel('rn-a');
      await publishRevision(a, content('rn'));
      const start = await proposeOk(a, 'rn');
      await publishRevision(a, content('rn', { startName: 'START' })); // same key, new display name
      expect((await read('conceptMappings', { modelId: a })).data.rows[0]).toMatchObject({ id: start.mappingId, targetState: 'present', targetName: 'START' });
      await publishRevision(a, content('rn', { startName: 'Begin' }));
      expect((await read('conceptMappings', { modelId: a })).data.rows[0]).toMatchObject({ id: start.mappingId, targetState: 'target_gone' });
    });

    it('conceptSuggestions proposes same-shaped targets of other models, flagged proposal, stores nothing, and skips a pair a human already merged', async () => {
      const { a, b } = await pair('sug');
      const before = (await sql('select count(*)::int as n from knowledge.spec_concept_mapping')).rows[0].n;
      const s = await read('conceptSuggestions', { modelId: a, kind: 'event', pageSize: 200 });
      expect(s.outcome, JSON.stringify(s)).toBe('ok');
      const rows = (s.data.rows as { proposal: boolean; score: number; source: Row; candidate: Row; basis: Row }[]).filter((r) => r.candidate.modelId === b);
      expect(rows.map((r) => [r.source.targetKey, r.candidate.targetKey, r.score, r.proposal])).toEqual(
        expect.arrayContaining([[eventKey('sug'), eventKey('sug'), 1, true]]),
      );
      expect(rows.find((r) => r.source.targetKey === eventKey('sug'))).toMatchObject({ basis: { name_trgm: 1, field_overlap: 1 }, candidate: { modelName: expect.stringContaining(TAG) } });
      expect(s.data.rows.every((r: { proposal: boolean }) => r.proposal === true)).toBe(true);
      expect((await sql('select count(*)::int as n from knowledge.spec_concept_mapping')).rows[0].n).toBe(before);

      const first = await proposeOk(a, 'sug');
      const second = await proposeOk(b, 'sug', { conceptId: first.conceptId });
      await act('conceptConfirm', { mappingId: first.mappingId }, { expectedVersion: '1' });
      await act('conceptConfirm', { mappingId: second.mappingId }, { expectedVersion: '1' });
      const after = (await read('conceptSuggestions', { modelId: a, kind: 'event', pageSize: 200 })).data.rows as { source: Row; candidate: Row }[];
      expect(after.some((r) => r.source.targetKey === eventKey('sug') && r.candidate.targetKey === eventKey('sug') && r.candidate.modelId === b)).toBe(false);
      // a module suggestion is still offered (that pair is undecided)
      const modules = (await read('conceptSuggestions', { modelId: a, kind: 'module', pageSize: 200 })).data.rows as { source: Row; candidate: Row }[];
      expect(modules.some((r) => r.source.targetKey === moduleKey('sug') && r.candidate.modelId === b)).toBe(true);
    });
    it.each(['mappingId', 'pairMappingId'] as const)(
      'a pair with a rejected decision (%s) is not suggested again from either model; a different undecided association still is',
      async (rejectedSide) => {
        const prefix = `rjs-${rejectedSide === 'mappingId' ? 'a' : 'b'}`;
        const { a, b } = await pair(prefix);
        const out = await proposeOk(a, prefix, { canonicalLabel: `${prefix} start`, pairWith: { modelId: b, targetKind: 'event', target: eventBody(prefix) } });
        const offered = async (from: string, to: string, kind: 'event' | 'module', key: string) =>
          ((await read('conceptSuggestions', { modelId: from, kind, pageSize: 200 })).data.rows as { source: Row; candidate: Row }[]).some(
            (r) => r.source.targetKey === key && r.candidate.targetKey === key && r.candidate.modelId === to,
          );
        expect(await offered(a, b, 'event', eventKey(prefix)), 'before the decision').toBe(true);
        const rejected = await act('conceptReject', { mappingId: out[rejectedSide], reason: 'not the same' }, { expectedVersion: '1' });
        expect(rejected.outcome, JSON.stringify(rejected)).toBe('ok');
        expect(await offered(a, b, 'event', eventKey(prefix)), 'a to b').toBe(false);
        expect(await offered(b, a, 'event', eventKey(prefix)), 'b to a').toBe(false);
        expect(await offered(a, b, 'event', eventKey(prefix, 'Stop')), 'other event pair').toBe(true);
        expect(await offered(a, b, 'module', moduleKey(prefix)), 'module pair').toBe(true);
      },
    );

    it('suggestions say when the bounded scan stopped early; the exact lookup does not use the cap', async () => {
      const { a } = await pair('cap');
      expect((await read('conceptSuggestions', { modelId: a, pageSize: 5 })).data.truncated).toBe(false);
      const all = await scanCurrentTargets(migrate.db, WORKSPACE_ID, { workspaceId: WORKSPACE_ID, actorId: admin.id });
      const full = all.models.get(a)?.targets.size ?? 0;
      expect(full).toBeGreaterThanOrEqual(3);
      const capped = await scanCurrentTargets(migrate.db, WORKSPACE_ID, { workspaceId: WORKSPACE_ID, actorId: admin.id }, 1);
      expect(capped.truncated).toBe(true);
      expect(capped.models.get(a)?.targets.size ?? 0).toBeLessThan(full);
      // exact: every key of the spec resolves however the scan was cut; a ghost key and a wrong kind do not; a model without a spec has no revision
      const refs = [
        { modelId: a.toUpperCase(), targetKind: 'module', targetKey: moduleKey('cap') },
        { modelId: a, targetKind: 'event', targetKey: eventKey('cap') },
        { modelId: a, targetKind: 'event', targetKey: eventKey('cap', 'Stop') },
        { modelId: a, targetKind: 'event', targetKey: eventKey('cap', 'Ghost') },
        { modelId: a, targetKind: 'module', targetKey: eventKey('cap') },
      ];
      const bare = await newModel('cap-bare');
      const exact = await resolveTargets(migrate.db, WORKSPACE_ID, [...refs, { modelId: bare, targetKind: 'module', targetKey: moduleKey('cap') }]);
      expect(refs.map((x) => exact.get(x.modelId, x.targetKind, x.targetKey)?.kind ?? null)).toEqual(['module', 'event', 'event', null, null]);
      expect(exact.revisions.has(a)).toBe(true);
      expect(exact.revisions.has(bare)).toBe(false);
    });

    it('accepts an upper-case model and concept id everywhere: reads answer as for the lower-case spelling, a write names the same target', async () => {
      const { a, b } = await pair('upc');
      expect(a.toLowerCase()).not.toBe(a.toUpperCase());
      const lower = (await read('conceptSuggestions', { modelId: a, kind: 'event', pageSize: 200 })).data;
      const upper = (await read('conceptSuggestions', { modelId: a.toUpperCase(), kind: 'event', pageSize: 200 })).data;
      expect(lower.rows.length).toBeGreaterThan(0);
      expect(upper).toEqual(lower);
      const out = await proposeOk(a.toUpperCase(), 'upc', { pairWith: { modelId: b.toUpperCase(), targetKind: 'event', target: eventBody('upc') } });
      for (const params of [{ modelId: a.toUpperCase() }, { conceptId: out.conceptId.toUpperCase() }, { modelId: b.toUpperCase(), conceptId: out.conceptId.toUpperCase() }]) {
        const rows = (await read('conceptMappings', params)).data.rows as { modelId: string; conceptId: string; targetState: string }[];
        expect(rows.filter((x) => x.conceptId === out.conceptId).map((x) => [x.modelId, x.targetState]).sort()).toEqual(
          [[a, 'present'], [b, 'present']].filter(([m]) => !('modelId' in params) || m === (params.modelId as string).toLowerCase()).sort(),
        );
      }
    });
  });

  describe('equivalence lookup (confirmed + equivalent only)', () => {
    it('joins only human-confirmed equivalent targets of the same concept: not a proposal, a rejected row, a related row, or a same name', async () => {
      const { a, b } = await pair('eq');
      const c = await newModel('eq-c');
      await publishRevision(c, content('eq'));
      const d = await newModel('eq-d');
      await publishRevision(d, content('eq'));
      const e = await newModel('eq-e');
      await publishRevision(e, content('eq'));
      const key = eventKey('eq');
      const lookup = async (model: string) => (await findEquivalents(dbHandle.db, WORKSPACE_ID, model, key, { workspaceId: WORKSPACE_ID, actorId: admin.id })).map((x) => x.modelId).sort();

      const root = await proposeOk(a, 'eq');
      await act('conceptConfirm', { mappingId: root.mappingId }, { expectedVersion: '1' });
      expect(await lookup(a)).toEqual([]); // alone in its concept
      // a similarity-origin PROPOSAL (accepted suggestion) is not equivalence
      const accepted = await proposeOk(b, 'eq', { conceptId: root.conceptId, pairWith: { modelId: c, targetKind: 'event', target: eventBody('eq') } });
      expect(await lookup(a)).toEqual([]);
      expect(await lookup(b)).toEqual([]);
      // confirm b: a and b join; c is still only proposed
      await act('conceptConfirm', { mappingId: accepted.mappingId }, { expectedVersion: '1' });
      expect(await lookup(a)).toEqual([b]);
      expect(await lookup(b)).toEqual([a]);
      expect(await lookup(c)).toEqual([]);
      // a `related` confirmed row does not join
      const related = await proposeOk(d, 'eq', { conceptId: root.conceptId, relationKind: 'related' });
      await act('conceptConfirm', { mappingId: related.mappingId }, { expectedVersion: '1' });
      expect(await lookup(a)).toEqual([b]);
      expect(await lookup(d)).toEqual([]);
      // a rejected row does not join; neither does a mere same-name target (e has no mapping at all)
      const rejected = await proposeOk(e, 'eq', { conceptId: root.conceptId });
      await act('conceptReject', { mappingId: rejected.mappingId, reason: 'different' }, { expectedVersion: '1' });
      expect(await lookup(a)).toEqual([b]);
      expect(await lookup(e)).toEqual([]);
      // demoting b removes the join
      await act('conceptReject', { mappingId: accepted.mappingId, reason: 'mistake' }, { expectedVersion: '2' });
      expect(await lookup(a)).toEqual([]);
    });
  });
});
