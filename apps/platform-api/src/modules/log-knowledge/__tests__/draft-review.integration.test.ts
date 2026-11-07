// #1198 (b) — the knowledge draft review actions (approve, reject, request changes) through the real `buildServer` over
// `POST /api/v1/menu-action` and `/menu-query` against a real Postgres (throwaway DB only; run through
// `pnpm --filter @ap/platform-api test:integration`, app as platform_app, fixtures and cleanup as platform_migrate).
// Each decision is judged on the wire answer, the `knowledge.*` rows and the `core.audit_log` rows written in the same
// transaction. Needs migration 0103 (the issue DB lacks it until the conductor recreates it).

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
import { normalizeProposal, proposalDigest } from '../domain/draft-input.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `DRB${randomUUID().slice(0, 6).toUpperCase()}`;

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
  replayed: boolean;
}
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log knowledge draft review (#1198 b)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let author: Person; // User with knowledge.draft.create
  let author2: Person; // Developer with knowledge.draft.create
  let reviewer: Person; // Developer with knowledge.item.publish only
  let reviewer2: Person; // Developer with knowledge.item.publish only
  let dual: Person; // Developer with knowledge.draft.create and knowledge.item.publish
  let plainUser: Person;
  let plainDeveloper: Person;
  const actorIds: string[] = [];
  const ids = {} as Record<'model' | 'sw', string>;
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  async function person(roleLevel: 'admin' | 'developer' | 'user', capabilities: string[] = []): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    for (const capability of capabilities) {
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, $3, null, $4)`,
        [WORKSPACE_ID, id, capability, admin?.id ?? id],
      );
    }
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string; key?: string } = {},
  ): Promise<Answer> {
    const who = opts.who ?? author;
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

  async function read(endpoint: string, params: Record<string, unknown>, who: Person): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ outcome: string; data: unknown }>();
    return { ...body, version: null, fieldErrors: [], replayed: false } as Answer;
  }

  const title = (label: string) => `${TAG} ${label}`;
  const subject = (module: string) => ({ modelId: ids.model, targetKind: 'module', target: { module } });
  const createProposal = (label: string, extra: Row = {}) => ({
    ownerModelId: ids.model,
    typeCode: 'anomaly',
    title: title(label),
    observation: `observed ${label}`,
    ...extra,
  });
  const reviseProposal = (label: string, extra: Row = {}) => ({
    typeCode: 'guideline',
    title: title(label),
    expected: `expected ${label}`,
    changeNote: `note ${label}`,
    ...extra,
  });

  interface D {
    id: string;
    version: string;
    digest: string;
  }

  /** A draft created and submitted by `who`. */
  async function submitted(label: string, who: Person = author, proposal: Row = createProposal(label), targetItemId?: string): Promise<D> {
    const c = await act(
      'draftCreate',
      targetItemId ? { proposalType: 'revise', targetItemId, proposal } : { proposalType: 'create', proposal },
      { who },
    );
    expect(c.outcome).toBe('ok');
    const s = await act('draftSubmit', { id: c.data.id }, { who, expectedVersion: c.version as string });
    expect(s.outcome).toBe('ok');
    return { id: c.data.id as string, version: s.version as string, digest: s.data.payloadDigest as string };
  }

  const approve = (d: D, over: Row = {}, opts: { who?: Person; expectedVersion?: string; key?: string } = {}) =>
    act('draftApprove', { id: d.id, approvedDigest: d.digest, ...over }, { who: reviewer, expectedVersion: d.version, ...opts });

  async function newItem(label: string, subjects: Row[] = []) {
    const a = await act('itemCreate', { ownerModelId: ids.model, typeCode: 'anomaly', title: title(label), observation: 'o', subjects }, { who: admin });
    expect(a.outcome).toBe('ok');
    return { id: a.data.id as string, version: a.version as string };
  }

  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0] as Row | undefined;
  const draftRow = (id: string) => one('select * from knowledge.draft where id = $1', [id]);
  const reviews = async (id: string) => (await sql('select * from knowledge.draft_review where draft_id = $1 order by reviewed_at', [id])).rows as Row[];
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Row;
    }[];
  const itemTableCounts = async () =>
    (
      await sql(
        `select (select count(*) from knowledge.knowledge_item)::int as items,
                (select count(*) from knowledge.knowledge_item_revision)::int as revisions,
                (select count(*) from knowledge.item_revision_subject)::int as subjects,
                (select count(*) from knowledge.draft_review)::int as reviews,
                (select count(*) from core.audit_log where event_type like 'knowledge.item.%' or event_type in ('knowledge.draft.approved','knowledge.draft.rejected','knowledge.draft.changes_requested'))::int as audits`,
      )
    ).rows[0] as Row;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    author = await person('user', ['knowledge.draft.create']);
    author2 = await person('developer', ['knowledge.draft.create']);
    reviewer = await person('developer', ['knowledge.item.publish']);
    reviewer2 = await person('developer', ['knowledge.item.publish']);
    dual = await person('developer', ['knowledge.draft.create', 'knowledge.item.publish']);
    plainUser = await person('user');
    plainDeveloper = await person('developer');
    const insert = async (table: string, cols: Row) =>
      (
        await sql(
          `insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
          Object.values(cols),
        )
      ).rows[0].id as string;
    const common = (code: string) => ({ workspace_id: WORKSPACE_ID, created_by: admin.id, updated_by: admin.id, name: code, code, code_key: toCodeKey(code) });
    const vendor = await insert('vendor', common(`${TAG}-v`));
    ids.model = await insert('equipment_model', { ...common(`${TAG}-m`), vendor_id: vendor, active: true });
    ids.sw = await insert('software_version', {
      workspace_id: WORKSPACE_ID,
      model_id: ids.model,
      version_label: `${TAG}-sw`,
      version_key: toCodeKey(`${TAG}-sw`),
      name: `${TAG}-sw`,
      active: true,
      created_by: admin.id,
      updated_by: admin.id,
    });
  });

  beforeEach(async () => {
    if (actorIds.length === 0) return;
    await sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

  afterAll(async () => {
    // draft_review and draft_revision refuse DELETE for every role: lift their triggers inside the cleanup transaction.
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table knowledge.draft_review disable trigger draft_review_append_only');
      await client.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft_review where reviewer_actor_id = any($1)', [actorIds]);
      await client.query('delete from knowledge.draft_revision where author_actor_id = any($1)', [actorIds]);
      await client.query('alter table knowledge.draft_review enable trigger draft_review_append_only');
      await client.query('alter table knowledge.draft_revision enable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    const mine = '(select id from knowledge.knowledge_item where created_by = any($1))';
    await sql(`delete from knowledge.item_link where source_item_id in ${mine} or target_item_id in ${mine}`, [actorIds]);
    for (const table of ['item_assessment_event', 'item_revision_evidence', 'item_revision_subject', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id in ${mine}`, [actorIds]);
    }
    await sql('delete from knowledge.knowledge_item where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.item_counter where workspace_id = $1 and not exists (select 1 from knowledge.knowledge_item where workspace_id = $1)', [WORKSPACE_ID]);
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

  describe('approve a create draft', () => {
    it('writes one item, revision 1, its subjects, the review, the closed draft and both audit rows', async () => {
      const d = await submitted('approve-create', author, createProposal('approve-create', { subjects: [subject('m1')], evidence: [{ sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: 'r1' }] }));
      const a = await approve(d, { rationale: 'looks right' });
      expect(a).toMatchObject({ outcome: 'ok', version: '3', data: { itemNo: expect.any(Number), revisionNo: 1 } });
      const { reviewId, itemId } = a.data as { reviewId: string; itemId: string };

      const item = await one('select * from knowledge.knowledge_item where id = $1', [itemId]);
      expect(item).toMatchObject({ publication_state: 'published', latest_revision_no: 1, row_version: 1, owner_model_id: ids.model, created_by: reviewer.id });
      const rev = await one('select * from knowledge.knowledge_item_revision where item_id = $1 and revision_no = 1', [itemId]);
      expect(rev).toMatchObject({ title: title('approve-create'), type_code: 'anomaly', published_by: reviewer.id });
      expect((await sql('select * from knowledge.item_revision_subject where item_id = $1', [itemId])).rows).toHaveLength(1);
      expect((await sql('select * from knowledge.item_revision_evidence where item_id = $1', [itemId])).rows).toHaveLength(1);

      expect(await draftRow(d.id)).toMatchObject({ status: 'approved', closed_by: reviewer.id, row_version: 3 });
      expect((await draftRow(d.id))?.closed_at).toBeTruthy();
      expect(await reviews(d.id)).toEqual([
        expect.objectContaining({ id: reviewId, decision: 'approved', approved_digest: d.digest, self_approval: false, rationale: 'looks right', posted_item_id: itemId, posted_revision_no: 1, reviewer_actor_id: reviewer.id, reviewed_draft_rev_no: 1 }),
      ]);

      const itemAudit = (await audit(itemId)).filter((r) => r.event_type === 'knowledge.item.created');
      expect(itemAudit).toHaveLength(1);
      expect(itemAudit[0]).toMatchObject({ subject_type: 'knowledge_item', actor_id: reviewer.id, detail: { title: title('approve-create'), revisionNo: 1 } });
      const decisionAudit = (await audit(d.id)).filter((r) => r.event_type === 'knowledge.draft.approved');
      expect(decisionAudit).toEqual([
        expect.objectContaining({
          subject_type: 'knowledge_draft',
          actor_id: reviewer.id,
          detail: { draftId: d.id, reviewId, draftRevNo: 1, approvedDigest: d.digest, itemId, revisionNo: 1, selfApproval: false, origin: 'human' },
        }),
      ]);
      expect(JSON.stringify(decisionAudit[0]?.detail)).not.toContain('looks right');
    });

    it('the item audit row has the shape a direct create writes', async () => {
      const direct = await act('itemCreate', { ownerModelId: ids.model, typeCode: 'anomaly', title: title('direct-shape'), observation: 'o' }, { who: reviewer });
      const viaDraft = await approve(await submitted('draft-shape'));
      const shape = async (id: string) => {
        const row = (await audit(id)).find((r) => r.event_type === 'knowledge.item.created');
        return { keys: Object.keys(row?.detail ?? {}).sort(), subject_type: row?.subject_type, actor_id: row?.actor_id };
      };
      expect(await shape(viaDraft.data.itemId)).toEqual(await shape(direct.data.id));
    });

    it('a SW-owned create draft publishes under the SW version', async () => {
      const d = await submitted('sw-owned', author, createProposal('sw-owned', { ownerModelId: undefined, ownerSoftwareId: ids.sw }));
      const a = await approve(d);
      expect(a.outcome).toBe('ok');
      expect(await one('select owner_software_id, owner_model_id from knowledge.knowledge_item where id = $1', [a.data.itemId])).toEqual({ owner_software_id: ids.sw, owner_model_id: null });
    });
  });

  describe('approve a revise draft', () => {
    it('appends a revision to the target and carries its subjects when the proposal sends none', async () => {
      const target = await newItem('revise-carry', [subject('c1')]);
      const d = await submitted('revise-carry-d', author, reviseProposal('revise-carry-d'), target.id);
      const a = await approve(d, { expectedItemVersion: Number(target.version) });
      expect(a).toMatchObject({ outcome: 'ok', data: { itemId: target.id, revisionNo: 2 } });
      expect(await one('select * from knowledge.knowledge_item where id = $1', [target.id])).toMatchObject({ latest_revision_no: 2, row_version: 2 });
      expect(await one('select * from knowledge.knowledge_item_revision where item_id = $1 and revision_no = 2', [target.id])).toMatchObject({ title: title('revise-carry-d'), change_note: 'note revise-carry-d', published_by: reviewer.id });
      expect((await sql('select target_key from knowledge.item_revision_subject where item_id = $1 and revision_no = 2', [target.id])).rows).toEqual([{ target_key: 'c1' }]);
      const revised = (await audit(target.id)).filter((r) => r.event_type === 'knowledge.item.revised');
      expect(revised).toEqual([expect.objectContaining({ actor_id: reviewer.id, detail: expect.objectContaining({ revisionNo: 2 }) })]);
      expect(await draftRow(d.id)).toMatchObject({ status: 'approved' });
    });

    it('replaces the subjects when the proposal sends a list', async () => {
      const target = await newItem('revise-replace', [subject('r1')]);
      const d = await submitted('revise-replace-d', author, reviseProposal('revise-replace-d', { subjects: [subject('r2')] }), target.id);
      expect((await approve(d, { expectedItemVersion: Number(target.version) })).outcome).toBe('ok');
      expect((await sql('select target_key from knowledge.item_revision_subject where item_id = $1 and revision_no = 2', [target.id])).rows).toEqual([{ target_key: 'r2' }]);
    });

    it('expectedItemVersion is required for revise and refused for create', async () => {
      const target = await newItem('ev-required');
      const rev = await submitted('ev-rev', author, reviseProposal('ev-rev'), target.id);
      expect(fe(await approve(rev))).toEqual(['expectedItemVersion:required']);
      expect(fe(await approve(rev, { expectedItemVersion: 0 }))).toEqual(['expectedItemVersion:malformed']);
      const create = await submitted('ev-create');
      expect(fe(await approve(create, { expectedItemVersion: 1 }))).toEqual(['expectedItemVersion:malformed']);
    });

    it('a target that moved since the reviewer loaded it is stale and nothing is written', async () => {
      const target = await newItem('item-stale');
      const d = await submitted('item-stale-d', author, reviseProposal('item-stale-d'), target.id);
      const rev = await act('itemRevise', { id: target.id, title: title('direct-bump'), typeCode: 'anomaly', changeNote: 'bump' }, { who: admin, expectedVersion: target.version });
      expect(rev.outcome).toBe('ok');
      const before = await itemTableCounts();
      const a = await approve(d, { expectedItemVersion: Number(target.version) });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['expectedItemVersion:stale']);
      expect(await itemTableCounts()).toEqual(before);
      expect(await draftRow(d.id)).toMatchObject({ status: 'submitted' });
    });

    it('an archived target is refused', async () => {
      const target = await newItem('item-archived');
      const d = await submitted('item-archived-d', author, reviseProposal('item-archived-d'), target.id);
      expect((await act('itemSetArchived', { id: target.id, archived: true }, { who: admin, expectedVersion: target.version })).outcome).toBe('ok');
      const before = await itemTableCounts();
      expect(fe(await approve(d, { expectedItemVersion: 2 }))).toEqual(['id:archived']);
      expect(await itemTableCounts()).toEqual(before);
    });
  });

  describe('atomic refusals', () => {
    it('an edit after the reviewer loaded the draft is a conflict (engine version check), nothing written', async () => {
      const d = await submitted('edited');
      const edit = await act('draftUpdate', { id: d.id, proposal: createProposal('edited', { observation: 'changed' }) }, { expectedVersion: d.version });
      expect(edit.outcome).toBe('ok');
      const before = await itemTableCounts();
      const a = await approve(d);
      expect(a.outcome).toBe('conflict');
      expect(await itemTableCounts()).toEqual(before);
      expect(await reviews(d.id)).toHaveLength(0);
    });

    it('a stale digest with the current version is stale_digest, nothing written', async () => {
      const c = await act('draftCreate', { proposalType: 'create', proposal: createProposal('digest') });
      const first = c.data.payloadDigest as string;
      const u = await act('draftUpdate', { id: c.data.id, proposal: createProposal('digest', { observation: 'v2' }) }, { expectedVersion: c.version as string });
      const s = await act('draftSubmit', { id: c.data.id }, { expectedVersion: u.version as string });
      const before = await itemTableCounts();
      const a = await approve({ id: c.data.id, version: s.version as string, digest: first });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['approvedDigest:stale_digest']);
      expect(await itemTableCounts()).toEqual(before);
      // the current digest passes
      const ok = await approve({ id: c.data.id, version: s.version as string, digest: s.data.payloadDigest });
      expect(ok.outcome).toBe('ok');
      expect(proposalDigest(normalizeProposal({ ...createProposal('digest', { observation: 'v2' }), evidence: [], expected: null, analysisOpinion: null, improvement: null }))).toBe(s.data.payloadDigest);
    });

    it('an owner deactivated since the draft is refused under proposal.*, nothing written', async () => {
      const code = `${TAG}-moff`;
      const model = (
        await sql(
          `insert into knowledge.equipment_model (workspace_id, vendor_id, name, code, code_key, active, created_by, updated_by)
           select workspace_id, vendor_id, $1, $1, $2, true, created_by, updated_by from knowledge.equipment_model where id = $3 returning id`,
          [code, toCodeKey(code), ids.model],
        )
      ).rows[0].id as string;
      const d = await submitted('owner-off', author, createProposal('owner-off', { ownerModelId: model }));
      await sql('update knowledge.equipment_model set active = false where id = $1', [model]);
      const before = await itemTableCounts();
      const a = await approve(d);
      expect(fe(a)).toEqual(['proposal.ownerModelId:inactive']);
      expect(await itemTableCounts()).toEqual(before);
      expect(await draftRow(d.id)).toMatchObject({ status: 'submitted' });
    });

    it('a revoked review right between load and approve is forbidden', async () => {
      const temp = await person('developer', ['knowledge.item.publish']);
      const d = await submitted('revoked');
      await sql('delete from permission.permission_grants where actor_id = $1', [temp.id]);
      const before = await itemTableCounts();
      expect((await approve(d, {}, { who: temp })).outcome).toBe('forbidden');
      expect(await itemTableCounts()).toEqual(before);
    });
  });

  describe('who may decide', () => {
    it.each([
      ['a User without the grant', () => plainUser],
      ['a Developer without the grant', () => plainDeveloper],
      ['an author holding only knowledge.draft.create', () => author2],
    ])('%s is forbidden for approve, reject and request changes', async (_label, who) => {
      const d = await submitted('forbidden');
      const before = await itemTableCounts();
      expect((await approve(d, {}, { who: who() })).outcome).toBe('forbidden');
      for (const action of ['draftReject', 'draftRequestChanges']) {
        expect((await act(action, { id: d.id, rationale: 'x' }, { who: who(), expectedVersion: d.version })).outcome).toBe('forbidden');
      }
      expect(await itemTableCounts()).toEqual(before);
    });

    it('an Admin (module bypass) may approve', async () => {
      expect((await approve(await submitted('admin-approves'), {}, { who: admin })).outcome).toBe('ok');
    });

    it('a plain draft of another author is not_found for the reviewer', async () => {
      const c = await act('draftCreate', { proposalType: 'create', proposal: createProposal('private') });
      const a = await act('draftApprove', { id: c.data.id, approvedDigest: c.data.payloadDigest }, { who: reviewer, expectedVersion: c.version as string });
      expect(a.outcome).toBe('not_found');
    });
  });

  describe('self approval', () => {
    it('a human may approve their own session-authored draft; the review and the audit mark it', async () => {
      const d = await submitted('self', dual);
      const a = await approve(d, {}, { who: dual });
      expect(a.outcome).toBe('ok');
      expect((await reviews(d.id))[0]).toMatchObject({ self_approval: true, reviewer_actor_id: dual.id });
      const row = (await audit(d.id)).find((r) => r.event_type === 'knowledge.draft.approved');
      expect(row?.detail).toMatchObject({ selfApproval: true });
    });

    it('a reviewer who authored a token revision of the draft is refused, nothing written', async () => {
      const c = await act('draftCreate', { proposalType: 'create', proposal: createProposal('via-token') }, { who: dual });
      const proposal = normalizeProposal({ ...createProposal('via-token', { observation: 'by token' }), evidence: [], expected: null, analysisOpinion: null, improvement: null });
      const digest = proposalDigest(proposal);
      await sql(
        `insert into knowledge.draft_revision (workspace_id, draft_id, draft_rev_no, proposal_json, payload_digest, author_actor_id, author_auth)
         values ($1, $2, 2, $3, $4, $5, 'token')`,
        [WORKSPACE_ID, c.data.id, JSON.stringify(proposal), digest, dual.id],
      );
      await sql('update knowledge.draft set latest_draft_rev = 2, row_version = row_version + 1 where id = $1', [c.data.id]);
      const s = await act('draftSubmit', { id: c.data.id }, { who: dual, expectedVersion: '2' });
      expect(s.outcome).toBe('ok');
      const before = await itemTableCounts();
      const a = await approve({ id: c.data.id, version: s.version as string, digest }, {}, { who: dual });
      expect(fe(a)).toEqual(['id:self_approval_via_token']);
      expect(await itemTableCounts()).toEqual(before);
      // another reviewer may approve it
      expect((await approve({ id: c.data.id, version: s.version as string, digest })).outcome).toBe('ok');
    });
  });

  describe('reject and request changes', () => {
    it('reject: rationale required; no item row; draft closed; review and audit without the rationale text', async () => {
      const d = await submitted('reject');
      expect(fe(await act('draftReject', { id: d.id }, { who: reviewer, expectedVersion: d.version }))).toEqual(['rationale:required']);
      const before = await itemTableCounts();
      const r = await act('draftReject', { id: d.id, rationale: 'secret reason' }, { who: reviewer, expectedVersion: d.version });
      expect(r).toMatchObject({ outcome: 'ok', data: { draftId: d.id, status: 'rejected' } });
      const after = await itemTableCounts();
      expect({ ...after, reviews: 0, audits: 0 }).toEqual({ ...before, reviews: 0, audits: 0 });
      expect(await draftRow(d.id)).toMatchObject({ status: 'rejected', closed_by: reviewer.id });
      expect(await reviews(d.id)).toEqual([expect.objectContaining({ decision: 'rejected', rationale: 'secret reason', approved_digest: null, posted_item_id: null, self_approval: false })]);
      const row = (await audit(d.id)).find((x) => x.event_type === 'knowledge.draft.rejected');
      expect(row?.detail).toEqual({ draftId: d.id, reviewId: r.data.reviewId, draftRevNo: 1, payloadDigest: d.digest, origin: 'human' });
      // final: nothing more
      expect(fe(await act('draftReject', { id: d.id, rationale: 'again' }, { who: reviewer, expectedVersion: r.version as string }))).toEqual(['id:illegal_transition']);
    });

    it('request changes → author edits → resubmits → approve', async () => {
      const d = await submitted('changes');
      const rc = await act('draftRequestChanges', { id: d.id, rationale: 'please clarify' }, { who: reviewer, expectedVersion: d.version });
      expect(rc).toMatchObject({ outcome: 'ok', data: { status: 'changes_requested' } });
      expect(await draftRow(d.id)).toMatchObject({ status: 'changes_requested', closed_at: null });
      // the item tables are untouched by the decision
      expect((await sql('select 1 from knowledge.knowledge_item_revision where title = $1', [title('changes')])).rows).toHaveLength(0);
      const u = await act('draftUpdate', { id: d.id, proposal: createProposal('changes', { observation: 'clarified' }) }, { expectedVersion: rc.version as string });
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: u.version as string });
      expect(s.outcome).toBe('ok');
      const a = await approve({ id: d.id, version: s.version as string, digest: s.data.payloadDigest });
      expect(a).toMatchObject({ outcome: 'ok', data: { revisionNo: 1 } });
      expect((await reviews(d.id)).map((r) => [r.decision, r.reviewed_draft_rev_no])).toEqual([['changes_requested', 1], ['approved', 2]]);
    });
  });

  describe('transitions and replay', () => {
    it('withdrawn, plain-draft-of-the-reviewer and already approved drafts are refused', async () => {
      const w = await submitted('withdrawn-d');
      const wd = await act('draftWithdraw', { id: w.id }, { expectedVersion: w.version });
      expect(fe(await approve({ ...w, version: wd.version as string }))).toEqual(['id:illegal_transition']);

      const mine = await act('draftCreate', { proposalType: 'create', proposal: createProposal('own-plain') }, { who: dual });
      const plain = await act('draftApprove', { id: mine.data.id, approvedDigest: mine.data.payloadDigest }, { who: dual, expectedVersion: mine.version as string });
      expect(fe(plain)).toEqual(['id:illegal_transition']);

      const d = await submitted('twice');
      const first = await approve(d);
      expect(first.outcome).toBe('ok');
      const again = await approve({ ...d, version: first.version as string });
      expect(fe(again)).toEqual(['id:illegal_transition']);
      expect(await reviews(d.id)).toHaveLength(1);
    });

    it('the same idempotency key replays the original body: one item, one review', async () => {
      const d = await submitted('replay');
      const key = randomUUID();
      const first = await approve(d, {}, { key });
      const second = await approve(d, {}, { key });
      expect(first.outcome).toBe('ok');
      expect(second).toMatchObject({ outcome: 'ok', replayed: true, data: first.data, version: first.version });
      expect(await reviews(d.id)).toHaveLength(1);
      expect((await sql('select count(*)::int as n from knowledge.knowledge_item_revision where title = $1', [title('replay')])).rows[0].n).toBe(1);
    });

    it('two concurrent approves with different keys produce exactly one review and one item', async () => {
      const d = await submitted('race');
      const [a, b] = await Promise.all([approve(d, {}, { who: reviewer }), approve(d, {}, { who: reviewer2 })]);
      expect([a.outcome, b.outcome].filter((o) => o === 'ok')).toHaveLength(1);
      expect(['conflict', 'invalid']).toContain([a, b].find((x) => x.outcome !== 'ok')?.outcome);
      expect(await reviews(d.id)).toHaveLength(1);
      expect((await sql('select count(*)::int as n from knowledge.knowledge_item_revision where title = $1', [title('race')])).rows[0].n).toBe(1);
    });
  });

  describe('walls', () => {
    it('the app role can insert and read but never update or delete a review; the trigger refuses the migrate role', async () => {
      const d = await submitted('wall');
      const r = await act('draftRequestChanges', { id: d.id, rationale: 'w' }, { who: reviewer, expectedVersion: d.version });
      const reviewId = r.data.reviewId as string;
      await expect(appSql("update knowledge.draft_review set rationale = 'x' where id = $1", [reviewId])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from knowledge.draft_review where id = $1', [reviewId])).rejects.toMatchObject({ code: '42501' });
      await expect(sql("update knowledge.draft_review set rationale = 'x' where id = $1", [reviewId])).rejects.toMatchObject({ code: '23514' });
      await expect(sql('delete from knowledge.draft_review where id = $1', [reviewId])).rejects.toMatchObject({ code: '23514' });
    });

    it('the table refuses a second final decision, an approval without a digest and a rejection without a rationale', async () => {
      const d = await submitted('wall-final');
      await act('draftReject', { id: d.id, rationale: 'no' }, { who: reviewer, expectedVersion: d.version });
      const insert = (decision: string, digest: string | null, rationale: string | null) =>
        sql(
          `insert into knowledge.draft_review (workspace_id, draft_id, reviewed_draft_rev_no, decision, approved_digest, rationale, reviewer_actor_id)
           values ($1, $2, 1, $3, $4, $5, $6)`,
          [WORKSPACE_ID, d.id, decision, digest, rationale, reviewer.id],
        );
      await expect(insert('rejected', null, 'again')).rejects.toMatchObject({ code: '23505' });
      await expect(insert('changes_requested', null, null)).rejects.toMatchObject({ code: '23514' });
      await expect(insert('approved', null, null)).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('reads', () => {
    it('draftDetail lists the reviews newest first and gives a publish holder the target item version; drafts rows carry postedItemId', async () => {
      const target = await newItem('read-target');
      const d = await submitted('read-d', author, reviseProposal('read-d'), target.id);
      const asReviewer = await read('logKnowledge.draftDetail', { draftId: d.id }, reviewer);
      expect(asReviewer.data).toMatchObject({ targetItemVersion: Number(target.version), reviews: [] });
      const asAuthor = await read('logKnowledge.draftDetail', { draftId: d.id }, author);
      expect(asAuthor.data.targetItemVersion).toBeNull();

      const rc = await act('draftRequestChanges', { id: d.id, rationale: 'one' }, { who: reviewer, expectedVersion: d.version });
      const u = await act('draftUpdate', { id: d.id, proposal: reviseProposal('read-d', { expected: 'v2' }) }, { expectedVersion: rc.version as string });
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: u.version as string });
      const a = await approve({ id: d.id, version: s.version as string, digest: s.data.payloadDigest }, { expectedItemVersion: Number(target.version) });
      expect(a.outcome).toBe('ok');

      const detail = await read('logKnowledge.draftDetail', { draftId: d.id }, author);
      expect(detail.data.targetItemVersion).toBeNull();
      expect(detail.data.reviews).toEqual([
        { id: a.data.reviewId, decision: 'approved', reviewedDraftRevNo: 2, approvedDigest: s.data.payloadDigest, selfApproval: false, rationale: null, postedItemId: target.id, postedRevisionNo: 2, reviewerActorId: reviewer.id, reviewedAt: expect.any(String) },
        { id: rc.data.reviewId, decision: 'changes_requested', reviewedDraftRevNo: 1, approvedDigest: null, selfApproval: false, rationale: 'one', postedItemId: null, postedRevisionNo: null, reviewerActorId: reviewer.id, reviewedAt: expect.any(String) },
      ]);
      const list = await read('logKnowledge.drafts', { filters: [{ id: 'status', op: 'in', value: ['approved'] }], pageSize: 100 }, reviewer);
      expect(list.data.rows.find((r: Row) => r.id === d.id)).toMatchObject({ postedItemId: target.id, status: 'approved' });
      const other = await read('logKnowledge.drafts', { filters: [{ id: 'status', op: 'in', value: ['submitted'] }], pageSize: 100 }, reviewer);
      for (const row of other.data.rows) expect(row.postedItemId).toBeNull();
    });
  });
});
