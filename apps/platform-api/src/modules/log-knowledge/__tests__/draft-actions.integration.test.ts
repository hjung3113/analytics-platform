// #1198 (a) — the knowledge draft actions and reads through the real `buildServer` over `POST /api/v1/menu-action` and
// `/menu-query` against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`,
// app as platform_app, fixtures and cleanup as platform_migrate). Each write is judged on the wire answer, the `knowledge.*`
// rows and the `core.audit_log` rows written in the same transaction. Needs migration 0101 (the issue DB lacks it until the
// conductor recreates it).

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
const TAG = `DRA${randomUUID().slice(0, 6).toUpperCase()}`;

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

describe.skipIf(!runIntegration)('log knowledge draft actions and reads (#1198 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let author: Person; // User with knowledge.draft.create
  let author2: Person; // Developer with knowledge.draft.create
  let other: Person; // Developer with knowledge.draft.create, not the author of anything below
  let reviewer: Person; // Developer with knowledge.item.publish only
  let plainUser: Person; // no grant
  let plainDeveloper: Person; // no grant
  let otherWorkspace = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const ids = {} as Record<'model' | 'modelOff' | 'sw' | 'foreignModel' | 'item' | 'archivedItem', string>;
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

  async function newDraft(label: string, who: Person = author, extra: Row = {}) {
    const a = await act('draftCreate', { proposalType: 'create', proposal: createProposal(label, extra) }, { who });
    expect(a.outcome).toBe('ok');
    return { id: a.data.id as string, version: a.version as string, digest: a.data.payloadDigest as string };
  }

  const draftRow = async (id: string) => (await sql('select * from knowledge.draft where id = $1', [id])).rows[0] as Row | undefined;
  const draftRevs = async (id: string) => (await sql('select * from knowledge.draft_revision where draft_id = $1 order by draft_rev_no', [id])).rows as Row[];
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
                (select count(*) from knowledge.item_revision_evidence)::int as evidence,
                (select count(*) from knowledge.item_revision_subject)::int as subjects,
                (select coalesce(sum(last_item_no), 0) from knowledge.item_counter)::int as counter`,
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
    other = await person('developer', ['knowledge.draft.create']);
    reviewer = await person('developer', ['knowledge.item.publish']);
    plainUser = await person('user');
    plainDeveloper = await person('developer');
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
    const model = (code: string, ws: string, vendorId: string, active = true) => insert('equipment_model', { ...common(ws, code), vendor_id: vendorId, active });
    ids.model = await model(`${TAG}-m`, WORKSPACE_ID, vendor);
    ids.modelOff = await model(`${TAG}-moff`, WORKSPACE_ID, vendor, false);
    ids.foreignModel = await model(`${TAG}-fm`, otherWorkspace, foreignVendor);
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
    const mkItem = async (label: string) => {
      const a = await act('itemCreate', { ownerModelId: ids.model, typeCode: 'anomaly', title: title(label), observation: 'o' }, { who: admin });
      expect(a.outcome).toBe('ok');
      return a.data.id as string;
    };
    ids.item = await mkItem('target item');
    ids.archivedItem = await mkItem('archived item');
    const archived = await act('itemSetArchived', { id: ids.archivedItem, archived: true }, { who: admin, expectedVersion: '1' });
    expect(archived.outcome).toBe('ok');
  });

  // Many calls per actor in one file: clear this file's actors' per-actor buckets (`<workspace>:<actor>…`) before each test.
  beforeEach(async () => {
    if (actorIds.length === 0) return;
    await sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

  afterAll(async () => {
    // draft_revision refuses DELETE for every role: lift its trigger inside the cleanup transaction (the migrate role owns it).
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft_revision where author_actor_id = any($1)', [actorIds]);
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

  describe('capability', () => {
    it.each([
      ['a User without the grant', () => plainUser],
      ['a Developer without the grant', () => plainDeveloper],
      ['a Developer holding only knowledge.item.publish', () => reviewer],
    ])('%s is refused every write (forbidden, nothing written)', async (_label, who) => {
      const before = Number((await sql('select count(*)::int as n from knowledge.draft')).rows[0].n);
      const a = await act('draftCreate', { proposalType: 'create', proposal: createProposal('no-cap') }, { who: who() });
      expect(a.outcome).toBe('forbidden');
      const mine = await newDraft('cap-target');
      for (const [action, input] of [
        ['draftUpdate', { id: mine.id, proposal: createProposal('x') }],
        ['draftSubmit', { id: mine.id }],
        ['draftWithdraw', { id: mine.id }],
      ] as const) {
        expect((await act(action, input, { who: who(), expectedVersion: mine.version })).outcome).toBe('forbidden');
      }
      expect(Number((await sql('select count(*)::int as n from knowledge.draft')).rows[0].n)).toBe(before + 1);
    });

    it('a User with the grant, a Developer with the grant and an Admin all create a human draft', async () => {
      for (const who of [author, author2, admin]) {
        const d = await newDraft('who-creates', who);
        expect(await draftRow(d.id)).toMatchObject({ origin: 'human', submitter_actor_id: who.id, created_by: who.id });
      }
    });
  });

  describe('draftCreate', () => {
    it('create proposal: draft (status draft, rev 1, version 1), revision 1 with the digest, and one audit row', async () => {
      const a = await act('draftCreate', {
        proposalType: 'create',
        proposal: createProposal('create-1', { evidence: [{ sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: 'run-1' }] }),
      });
      expect(a).toMatchObject({ outcome: 'ok', version: '1', data: { status: 'draft', latestDraftRev: 1, payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/) } });
      const id = a.data.id as string;
      expect(await draftRow(id)).toMatchObject({
        workspace_id: WORKSPACE_ID,
        origin: 'human',
        proposal_type: 'create',
        target_item_id: null,
        base_revision_no: null,
        owner_model_id: ids.model,
        owner_software_id: null,
        status: 'draft',
        latest_draft_rev: 1,
        submitter_actor_id: author.id,
        submitted_at: null,
        row_version: 1,
      });
      const revs = await draftRevs(id);
      expect(revs).toHaveLength(1);
      expect(revs[0]).toMatchObject({ draft_rev_no: 1, payload_digest: a.data.payloadDigest, author_actor_id: author.id, author_auth: 'session', schema_version: 1 });
      expect(revs[0]?.proposal_json).toMatchObject({ title: title('create-1'), ownerModelId: ids.model, evidence: [{ sourceRef: 'run-1' }] });
      expect(proposalDigest(revs[0]?.proposal_json as never)).toBe(a.data.payloadDigest);
      const log = await audit(id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        event_type: 'knowledge.draft.created',
        subject_type: 'knowledge_draft',
        actor_id: author.id,
        detail: { draftId: id, proposalType: 'create', origin: 'human', targetItemId: null, draftRevNo: 1, payloadDigest: a.data.payloadDigest, statusBefore: null, statusAfter: 'draft' },
      });
      expect(JSON.stringify(log[0]?.detail)).not.toContain(TAG);
    });

    it('software owner: stored on the draft; revise proposal: target, base revision and the item owner are copied', async () => {
      const sw = await act('draftCreate', { proposalType: 'create', proposal: createProposal('sw', { ownerModelId: undefined, ownerSoftwareId: ids.sw }) });
      expect(await draftRow(sw.data.id)).toMatchObject({ owner_model_id: null, owner_software_id: ids.sw });
      const rv = await act('draftCreate', { proposalType: 'revise', targetItemId: ids.item, proposal: reviseProposal('rv') });
      expect(rv.outcome).toBe('ok');
      expect(await draftRow(rv.data.id)).toMatchObject({ proposal_type: 'revise', target_item_id: ids.item, base_revision_no: 1, owner_model_id: ids.model, owner_software_id: null });
      expect((await audit(rv.data.id))[0]?.detail).toMatchObject({ proposalType: 'revise', targetItemId: ids.item });
    });

    it('origin and identity never come from the input (an unknown input key or proposal key is refused)', async () => {
      const a = await act('draftCreate', { proposalType: 'create', origin: 'ai', proposal: createProposal('origin') });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['origin:unexpected_field']);
      const b = await act('draftCreate', { proposalType: 'create', proposal: createProposal('origin2', { origin: 'ai', submitterActorId: admin.id }) });
      expect(b.outcome).toBe('invalid');
      expect(fe(b)).toEqual(expect.arrayContaining(['proposal.origin:malformed', 'proposal.submitterActorId:malformed']));
    });

    it.each([
      ['an unknown owner', () => ({ proposalType: 'create', proposal: createProposal('v1', { ownerModelId: randomUUID() }) }), ['proposal.ownerModelId:not_found']],
      ['a foreign-workspace owner', () => ({ proposalType: 'create', proposal: createProposal('v2', { ownerModelId: ids.foreignModel }) }), ['proposal.ownerModelId:not_found']],
      ['an inactive owner', () => ({ proposalType: 'create', proposal: createProposal('v3', { ownerModelId: ids.modelOff }) }), ['proposal.ownerModelId:inactive']],
      ['an unknown target item', () => ({ proposalType: 'revise', targetItemId: randomUUID(), proposal: reviseProposal('v4') }), ['targetItemId:not_found']],
      ['an archived target item', () => ({ proposalType: 'revise', targetItemId: ids.archivedItem, proposal: reviseProposal('v5') }), ['targetItemId:archived']],
      ['a subject naming another model', () => ({ proposalType: 'create', proposal: createProposal('v6', { subjects: [{ modelId: ids.modelOff, targetKind: 'module', target: { module: 'm' } }] }) }), ['proposal.subjects.0.modelId:model_mismatch']],
    ])('%s is refused with the item write\'s field code and writes no draft', async (_label, input, expected) => {
      const before = Number((await sql('select count(*)::int as n from knowledge.draft')).rows[0].n);
      const a = await act('draftCreate', input() as Row);
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(expected);
      expect(Number((await sql('select count(*)::int as n from knowledge.draft')).rows[0].n)).toBe(before);
    });

    it('an idempotent replay answers the same result and creates one draft', async () => {
      const key = randomUUID();
      const input = { proposalType: 'create', proposal: createProposal('replay') };
      const first = await act('draftCreate', input, { key });
      const second = await act('draftCreate', input, { key });
      expect(second).toMatchObject({ outcome: 'ok', replayed: true, data: first.data, version: first.version });
      const rows = (await sql(`select id from knowledge.draft where id = $1`, [first.data.id])).rows;
      expect(rows).toHaveLength(1);
      expect(await audit(first.data.id)).toHaveLength(1);
      expect(await draftRevs(first.data.id)).toHaveLength(1);
    });
  });

  describe('draftUpdate', () => {
    it('appends revision 2 with a new digest, bumps the draft, audits `updated`; revision 1 is untouched', async () => {
      const d = await newDraft('upd');
      const a = await act('draftUpdate', { id: d.id, proposal: createProposal('upd', { observation: 'changed' }) }, { expectedVersion: d.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '2', data: { status: 'draft', latestDraftRev: 2 } });
      expect(a.data.payloadDigest).not.toBe(d.digest);
      const revs = await draftRevs(d.id);
      expect(revs.map((r) => r.draft_rev_no)).toEqual([1, 2]);
      expect(revs[0]).toMatchObject({ payload_digest: d.digest });
      expect(revs[1]).toMatchObject({ payload_digest: a.data.payloadDigest, author_actor_id: author.id });
      expect(await draftRow(d.id)).toMatchObject({ latest_draft_rev: 2, row_version: 2, status: 'draft', updated_by: author.id });
      const log = await audit(d.id);
      expect(log.map((l) => l.event_type)).toEqual(['knowledge.draft.created', 'knowledge.draft.updated']);
      expect(log[1]?.detail).toMatchObject({ draftRevNo: 2, payloadDigest: a.data.payloadDigest, statusBefore: 'draft', statusAfter: 'draft' });
    });

    it('a same-payload update is a no-op: ok with the current version, no revision, no audit', async () => {
      const d = await newDraft('noop');
      const a = await act('draftUpdate', { id: d.id, proposal: createProposal('noop') }, { expectedVersion: d.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '1', data: { latestDraftRev: 1, payloadDigest: d.digest } });
      expect(await draftRevs(d.id)).toHaveLength(1);
      expect(await audit(d.id)).toHaveLength(1);
      expect(await draftRow(d.id)).toMatchObject({ row_version: 1 });
    });

    it('an update while submitted keeps `submitted` and makes the digest differ from the one a reviewer saw', async () => {
      const d = await newDraft('upd-submitted');
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      const a = await act('draftUpdate', { id: d.id, proposal: createProposal('upd-submitted', { observation: 'edited in review' }) }, { expectedVersion: s.version as string });
      expect(a).toMatchObject({ outcome: 'ok', data: { status: 'submitted', latestDraftRev: 2 } });
      expect(a.data.payloadDigest).not.toBe(s.data.payloadDigest);
      expect(await draftRow(d.id)).toMatchObject({ status: 'submitted' });
    });

    it('the owner of a create draft is fixed: another owner is `proposal.ownerModelId: immutable`, nothing written', async () => {
      const d = await newDraft('immutable');
      const a = await act('draftUpdate', { id: d.id, proposal: createProposal('immutable', { ownerModelId: ids.modelOff }) }, { expectedVersion: d.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['proposal.ownerModelId:immutable']);
      expect(await draftRevs(d.id)).toHaveLength(1);
    });

    it('a revise draft takes the revise shape; an owner or id key in it is malformed; an archived target is `id: archived`', async () => {
      const rv = await act('draftCreate', { proposalType: 'revise', targetItemId: ids.item, proposal: reviseProposal('rv-upd') });
      const bad = await act('draftUpdate', { id: rv.data.id, proposal: reviseProposal('rv-upd', { ownerModelId: ids.model }) }, { expectedVersion: '1' });
      expect(fe(bad)).toEqual(['proposal.ownerModelId:malformed']);
      const ok = await act('draftUpdate', { id: rv.data.id, proposal: reviseProposal('rv-upd', { changeNote: 'another' }) }, { expectedVersion: '1' });
      expect(ok).toMatchObject({ outcome: 'ok', data: { latestDraftRev: 2 } });
      // Archive the target out from under the draft.
      const target = await act('itemCreate', { ownerModelId: ids.model, typeCode: 'anomaly', title: title('to-archive'), observation: 'o' }, { who: admin });
      const rv2 = await act('draftCreate', { proposalType: 'revise', targetItemId: target.data.id, proposal: reviseProposal('rv-arch') });
      await act('itemSetArchived', { id: target.data.id, archived: true }, { who: admin, expectedVersion: '1' });
      const refused = await act('draftUpdate', { id: rv2.data.id, proposal: reviseProposal('rv-arch', { changeNote: 'again' }) }, { expectedVersion: '1' });
      expect(fe(refused)).toEqual(['id:archived']);
    });

    it('an expectedVersion that is stale answers conflict with the current version', async () => {
      const d = await newDraft('stale');
      await act('draftUpdate', { id: d.id, proposal: createProposal('stale', { observation: 'v2' }) }, { expectedVersion: d.version });
      const a = await act('draftUpdate', { id: d.id, proposal: createProposal('stale', { observation: 'v3' }) }, { expectedVersion: d.version });
      expect(a).toMatchObject({ outcome: 'conflict', version: '2' });
      expect(await draftRevs(d.id)).toHaveLength(2);
    });

    it('parallel updates with one version: exactly one wins, the rest conflict, revision numbers stay gapless', async () => {
      const d = await newDraft('parallel');
      const answers = await Promise.all(
        Array.from({ length: 6 }, (_v, i) =>
          act('draftUpdate', { id: d.id, proposal: createProposal('parallel', { observation: `parallel ${i}` }) }, { expectedVersion: d.version }),
        ),
      );
      expect(answers.filter((a) => a.outcome === 'ok')).toHaveLength(1);
      expect(answers.filter((a) => a.outcome === 'conflict')).toHaveLength(5);
      expect((await draftRevs(d.id)).map((r) => r.draft_rev_no)).toEqual([1, 2]);
      expect(await draftRow(d.id)).toMatchObject({ latest_draft_rev: 2, row_version: 2 });
    });

    it('parallel updates each holding the version they just read stay gapless (serial chain over concurrent writers)', async () => {
      const d = await newDraft('chain');
      // Two writers alternate; each retries on conflict with the version in the answer. Every revision number is used once.
      const writer = async (who: string, rounds: number) => {
        let done = 0;
        let version = '1';
        let guard = 0;
        while (done < rounds && guard++ < 50) {
          const a = await act('draftUpdate', { id: d.id, proposal: createProposal('chain', { observation: `${who} ${done} ${randomUUID()}` }) }, { expectedVersion: version });
          if (a.outcome === 'ok') {
            done += 1;
            version = a.version as string;
          } else if (a.outcome === 'conflict') version = a.version as string;
          else throw new Error(`unexpected ${a.outcome}`);
        }
        return done;
      };
      const [x, y] = await Promise.all([writer('a', 3), writer('b', 3)]);
      expect([x, y]).toEqual([3, 3]);
      expect((await draftRevs(d.id)).map((r) => r.draft_rev_no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('draftSubmit', () => {
    it('draft → submitted sets submitted_at and audits `submitted` with the latest digest', async () => {
      const d = await newDraft('submit');
      const a = await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '2', data: { status: 'submitted', latestDraftRev: 1, payloadDigest: d.digest } });
      expect(await draftRow(d.id)).toMatchObject({ status: 'submitted', row_version: 2 });
      expect((await draftRow(d.id))?.submitted_at).toBeInstanceOf(Date);
      const log = await audit(d.id);
      expect(log[1]).toMatchObject({ event_type: 'knowledge.draft.submitted', detail: { statusBefore: 'draft', statusAfter: 'submitted', draftRevNo: 1, payloadDigest: d.digest } });
    });

    it('submitting a submitted draft is `id: illegal_transition`', async () => {
      const d = await newDraft('submit-twice');
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      const again = await act('draftSubmit', { id: d.id }, { expectedVersion: s.version as string });
      expect(again.outcome).toBe('invalid');
      expect(fe(again)).toEqual(['id:illegal_transition']);
    });

    it('resubmit after changes_requested (set as node b would) updates submitted_at and keeps the revisions', async () => {
      const d = await newDraft('resubmit');
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      const firstAt = (await draftRow(d.id))?.submitted_at as Date;
      await sql(`update knowledge.draft set status = 'changes_requested', row_version = row_version + 1 where id = $1`, [d.id]);
      await new Promise((r) => setTimeout(r, 20));
      const upd = await act('draftUpdate', { id: d.id, proposal: createProposal('resubmit', { observation: 'fixed' }) }, { expectedVersion: '3' });
      expect(upd.data.status).toBe('changes_requested');
      const again = await act('draftSubmit', { id: d.id }, { expectedVersion: upd.version as string });
      expect(again).toMatchObject({ outcome: 'ok', data: { status: 'submitted', latestDraftRev: 2 } });
      expect(((await draftRow(d.id))?.submitted_at as Date).getTime()).toBeGreaterThan(firstAt.getTime());
      expect(s.outcome).toBe('ok');
    });
  });

  describe('draftWithdraw', () => {
    it('is final: stores the reason on the draft only, closes it, and further update / submit / withdraw are `illegal_transition`', async () => {
      const d = await newDraft('withdraw');
      const a = await act('draftWithdraw', { id: d.id, reason: `${TAG} secret reason` }, { expectedVersion: d.version });
      expect(a).toMatchObject({ outcome: 'ok', data: { status: 'withdrawn' } });
      expect(await draftRow(d.id)).toMatchObject({ status: 'withdrawn', close_reason: `${TAG} secret reason`, closed_by: author.id });
      expect((await draftRow(d.id))?.closed_at).toBeInstanceOf(Date);
      const log = await audit(d.id);
      expect(log[1]).toMatchObject({ event_type: 'knowledge.draft.withdrawn', detail: { statusBefore: 'draft', statusAfter: 'withdrawn' } });
      expect(JSON.stringify(log[1]?.detail)).not.toContain('secret');
      const v = a.version as string;
      for (const [action, input] of [
        ['draftUpdate', { id: d.id, proposal: createProposal('withdraw', { observation: 'late' }) }],
        ['draftSubmit', { id: d.id }],
        ['draftWithdraw', { id: d.id }],
      ] as const) {
        const r = await act(action, input, { expectedVersion: v });
        expect(r.outcome, action).toBe('invalid');
        expect(fe(r), action).toEqual(['id:illegal_transition']);
      }
      expect(await draftRevs(d.id)).toHaveLength(1);
    });

    it.each(['submitted', 'changes_requested'])('a %s draft can be withdrawn', async (status) => {
      const d = await newDraft(`withdraw-${status}`);
      await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      let version = '2';
      if (status === 'changes_requested') {
        await sql(`update knowledge.draft set status = 'changes_requested', row_version = row_version + 1 where id = $1`, [d.id]);
        version = '3';
      }
      expect(await act('draftWithdraw', { id: d.id }, { expectedVersion: version })).toMatchObject({ outcome: 'ok', data: { status: 'withdrawn' } });
    });

    it('a reason over 500 characters is `reason: too_long`', async () => {
      const d = await newDraft('withdraw-long');
      const a = await act('draftWithdraw', { id: d.id, reason: 'x'.repeat(501) }, { expectedVersion: d.version });
      expect(fe(a)).toEqual(['reason:too_long']);
    });
  });

  describe('author boundary (visibility before version)', () => {
    it('another author who cannot see a private draft gets not_found for every write, even with a stale version', async () => {
      const d = await newDraft('private');
      for (const who of [other, admin, reviewer]) {
        for (const [action, input] of [
          ['draftUpdate', { id: d.id, proposal: createProposal('private', { observation: 'x' }) }],
          ['draftSubmit', { id: d.id }],
          ['draftWithdraw', { id: d.id }],
        ] as const) {
          const a = await act(action, input, { who, expectedVersion: '999' });
          // Admin and reviewer hold the review right but a plain `draft` is private to its author; `other` has no right.
          expect(['forbidden', 'not_found'], `${action} by ${who.id}`).toContain(a.outcome);
          if (who === other || who === admin) expect(a.outcome, `${action}`).toBe('not_found');
          expect(a.version).toBeNull();
        }
      }
      expect(await draftRow(d.id)).toMatchObject({ row_version: 1, status: 'draft' });
    });

    it('a visible draft that the caller did not author is `id: forbidden_not_author` (stale version or not)', async () => {
      const d = await newDraft('seen-by-reviewer');
      await act('draftSubmit', { id: d.id }, { expectedVersion: d.version });
      // Admin holds knowledge.draft.create (bypass) and the review right: the submitted draft is visible to them, not theirs.
      for (const expectedVersion of ['2', '999']) {
        const a = await act('draftWithdraw', { id: d.id }, { who: admin, expectedVersion });
        expect(a.outcome).toBe('invalid');
        expect(fe(a)).toEqual(['id:forbidden_not_author']);
      }
      expect(await draftRow(d.id)).toMatchObject({ status: 'submitted', row_version: 2 });
    });

    it('a draft id of another workspace or an unknown id is not_found', async () => {
      const foreign = (
        await sql(
          `insert into knowledge.draft (workspace_id, origin, proposal_type, owner_model_id, submitter_actor_id, created_by, updated_by)
           values ($1, 'human', 'create', $2, $3, $3, $3) returning id`,
          [otherWorkspace, ids.foreignModel, admin.id],
        )
      ).rows[0].id as string;
      for (const id of [foreign, randomUUID()]) {
        expect((await act('draftSubmit', { id }, { who: admin, expectedVersion: '1' })).outcome).toBe('not_found');
      }
      expect(await draftRow(foreign)).toMatchObject({ status: 'draft', row_version: 1 });
      await sql('delete from knowledge.draft where id = $1', [foreign]);
    });
  });

  describe('no item rows', () => {
    it('no draft action writes a knowledge item, revision, evidence, subject or counter row', async () => {
      const before = await itemTableCounts();
      const d = await newDraft('no-items', author, { evidence: [{ sourceKind: 'log_file', sourceOwner: 'ops', sourceRef: 'r' }] });
      const u = await act('draftUpdate', { id: d.id, proposal: createProposal('no-items', { observation: 'again' }) }, { expectedVersion: d.version });
      const s = await act('draftSubmit', { id: d.id }, { expectedVersion: u.version as string });
      await act('draftWithdraw', { id: d.id }, { expectedVersion: s.version as string });
      const rv = await act('draftCreate', { proposalType: 'revise', targetItemId: ids.item, proposal: reviseProposal('no-items-rv') });
      await act('draftSubmit', { id: rv.data.id }, { expectedVersion: '1' });
      expect(await itemTableCounts()).toEqual(before);
    });
  });

  describe('database walls', () => {
    it('draft_revision: the app role cannot UPDATE or DELETE (42501), the migrate role is stopped by the trigger (23514)', async () => {
      const d = await newDraft('wall-rev');
      await expect(appSql(`update knowledge.draft_revision set payload_digest = $2 where draft_id = $1`, [d.id, 'a'.repeat(64)])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from knowledge.draft_revision where draft_id = $1', [d.id])).rejects.toMatchObject({ code: '42501' });
      await expect(sql(`update knowledge.draft_revision set payload_digest = $2 where draft_id = $1`, [d.id, 'a'.repeat(64)])).rejects.toMatchObject({ code: '23514' });
      await expect(sql('delete from knowledge.draft_revision where draft_id = $1', [d.id])).rejects.toMatchObject({ code: '23514' });
      expect(await draftRevs(d.id)).toHaveLength(1);
    });

    it('draft: no DELETE for the app role, no UPDATE of an identity column (42501), the trigger stops the migrate role (23514)', async () => {
      const d = await newDraft('wall-draft');
      await expect(appSql('delete from knowledge.draft where id = $1', [d.id])).rejects.toMatchObject({ code: '42501' });
      for (const set of [`origin = 'ai'`, `submitter_actor_id = '${admin.id}'`, `proposal_type = 'revise'`, `owner_model_id = '${ids.modelOff}'`]) {
        await expect(appSql(`update knowledge.draft set ${set}, row_version = row_version + 1 where id = $1`, [d.id])).rejects.toMatchObject({ code: '42501' });
        await expect(sql(`update knowledge.draft set ${set}, row_version = row_version + 1 where id = $1`, [d.id])).rejects.toMatchObject({ code: '23514' });
      }
      expect(await draftRow(d.id)).toMatchObject({ origin: 'human', submitter_actor_id: author.id, row_version: 1 });
    });

    it('an illegal status pair or a missing row_version bump through an app UPDATE hits the trigger (23514)', async () => {
      const d = await newDraft('wall-status');
      const close = `closed_at = now(), closed_by = $2`;
      // draft -> approved is not a pair (only submitted -> approved is)
      await expect(appSql(`update knowledge.draft set status = 'approved', ${close}, row_version = row_version + 1 where id = $1`, [d.id, author.id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql(`update knowledge.draft set status = 'submitted', row_version = row_version where id = $1`, [d.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('row_version') });
      await expect(appSql(`update knowledge.draft set latest_draft_rev = 5, row_version = row_version + 1 where id = $1`, [d.id])).rejects.toMatchObject({ code: '23514' });
      // a legal pair succeeds
      await appSql(`update knowledge.draft set status = 'submitted', row_version = row_version + 1 where id = $1`, [d.id]);
      // a final draft is frozen
      await appSql(`update knowledge.draft set status = 'withdrawn', ${close}, row_version = row_version + 1 where id = $1`, [d.id, author.id]);
      await expect(appSql(`update knowledge.draft set close_reason = 'x', row_version = row_version + 1 where id = $1`, [d.id])).rejects.toMatchObject({ code: '23514' });
    });

    it('CHECKs: create/revise pairing, owner XOR, status and origin sets, digest shape', async () => {
      const ins = (cols: string, vals: unknown[]) =>
        sql(`insert into knowledge.draft (workspace_id, submitter_actor_id, created_by, updated_by, ${cols}) values ($1, $2, $2, $2, ${vals.map((_, i) => `$${i + 3}`).join(',')})`, [WORKSPACE_ID, admin.id, ...vals]);
      await expect(ins('origin, proposal_type, owner_model_id, target_item_id, base_revision_no', ['human', 'create', ids.model, ids.item, 1])).rejects.toMatchObject({ code: '23514' });
      await expect(ins('origin, proposal_type, owner_model_id', ['human', 'revise', ids.model])).rejects.toMatchObject({ code: '23514' });
      await expect(ins('origin, proposal_type', ['human', 'create'])).rejects.toMatchObject({ code: '23514' });
      await expect(ins('origin, proposal_type, owner_model_id, owner_software_id', ['human', 'create', ids.model, ids.sw])).rejects.toMatchObject({ code: '23514' });
      await expect(ins('origin, proposal_type, owner_model_id', ['robot', 'create', ids.model])).rejects.toMatchObject({ code: '23514' });
      await expect(ins('origin, proposal_type, owner_model_id, status', ['human', 'create', ids.model, 'published'])).rejects.toMatchObject({ code: '23514' });
      const d = await newDraft('check-digest');
      await expect(
        sql(`insert into knowledge.draft_revision (workspace_id, draft_id, draft_rev_no, proposal_json, payload_digest, author_actor_id, author_auth) values ($1,$2,2,'{}','ABC',$3,'session')`, [WORKSPACE_ID, d.id, admin.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        sql(`insert into knowledge.draft_revision (workspace_id, draft_id, draft_rev_no, proposal_json, payload_digest, author_actor_id, author_auth) values ($1,$2,2,'[]',$4,$3,'session')`, [WORKSPACE_ID, d.id, admin.id, 'a'.repeat(64)]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        sql(`insert into knowledge.draft_revision (workspace_id, draft_id, draft_rev_no, proposal_json, payload_digest, author_actor_id, author_auth) values ($1,$2,2,'{}',$4,$3,'api')`, [WORKSPACE_ID, d.id, admin.id, 'a'.repeat(64)]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('reads: visibility matrix', () => {
    let drafts: { priv: string; sub: string; withdrawn: string; authorDevPriv: string };
    const listIds = async (who: Person, params: Record<string, unknown> = {}) => {
      const a = await read('logKnowledge.drafts', { q: 'vis', pageSize: 100, ...params }, who);
      expect(a.outcome).toBe('ok');
      return (a.data.rows as { id: string }[]).map((r) => r.id).sort();
    };
    const detail = async (who: Person, id: string) => (await read('logKnowledge.draftDetail', { draftId: id }, who)).data;

    beforeAll(async () => {
      const priv = await newDraft('vis private');
      const sub = await newDraft('vis submitted');
      await act('draftSubmit', { id: sub.id }, { expectedVersion: '1' });
      const wd = await newDraft('vis withdrawn');
      await act('draftWithdraw', { id: wd.id }, { expectedVersion: '1' });
      const dev = await newDraft('vis dev private', author2);
      drafts = { priv: priv.id, sub: sub.id, withdrawn: wd.id, authorDevPriv: dev.id };
    });

    it('the author sees their own drafts in every status, and not another author\'s private draft', async () => {
      expect(await listIds(author)).toEqual([drafts.priv, drafts.sub, drafts.withdrawn].sort());
      expect(await listIds(author2)).toEqual([drafts.authorDevPriv]);
    });

    it('a holder of knowledge.item.publish (grant, or Admin by bypass) sees every non-`draft` draft and no private one', async () => {
      for (const who of [reviewer, admin]) {
        const seen = await listIds(who);
        expect(seen).toEqual([drafts.sub, drafts.withdrawn].sort());
        expect(seen).not.toContain(drafts.priv);
        expect(seen).not.toContain(drafts.authorDevPriv);
      }
    });

    it('another Developer with the draft right, a User and a Developer without any grant see no draft at all', async () => {
      for (const who of [other, plainUser, plainDeveloper]) expect(await listIds(who)).toEqual([]);
    });

    it('draftDetail: visible → draft, newest-first revisions and the latest proposal; hidden or unknown → ok with null', async () => {
      const d = await detail(author, drafts.sub);
      expect(d.draft).toMatchObject({ id: drafts.sub, status: 'submitted', origin: 'human', version: '2', submitterActorId: author.id });
      expect(d.revisions).toEqual([{ revNo: 1, payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/), authorActorId: author.id, createdAt: expect.any(String) }]);
      expect(d.proposal).toMatchObject({ title: title('vis submitted') });
      expect(await detail(reviewer, drafts.sub)).toMatchObject({ draft: { id: drafts.sub } });
      expect(await detail(admin, drafts.withdrawn)).toMatchObject({ draft: { status: 'withdrawn' } });
      expect(await detail(admin, drafts.priv)).toBeNull();
      expect(await detail(reviewer, drafts.priv)).toBeNull();
      expect(await detail(other, drafts.sub)).toBeNull();
      expect(await detail(plainUser, drafts.sub)).toBeNull();
      expect(await detail(author, randomUUID())).toBeNull();
    });

    it('revisions of an updated draft come newest first', async () => {
      const d = await newDraft('rev order');
      await act('draftUpdate', { id: d.id, proposal: createProposal('rev order', { observation: 'two' }) }, { expectedVersion: '1' });
      const got = await detail(author, d.id);
      expect(got.revisions.map((r: { revNo: number }) => r.revNo)).toEqual([2, 1]);
      expect(got.proposal.observation).toBe('two');
    });

    it('list rows carry the title from the latest revision and never the proposal', async () => {
      const a = await read('logKnowledge.drafts', { q: 'vis private', pageSize: 100 }, author);
      expect(a.data.rows).toHaveLength(1);
      expect(a.data.rows[0]).toEqual({
        id: drafts.priv,
        origin: 'human',
        proposalType: 'create',
        targetItemId: null,
        baseRevisionNo: null,
        ownerModelId: ids.model,
        ownerSoftwareId: null,
        title: title('vis private'),
        status: 'draft',
        latestDraftRev: 1,
        submitterActorId: author.id,
        postedItemId: null,
        submittedAt: null,
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(a.data.total).toBe(1);
    });

    it('filters (status, origin, proposalType, ownerModelId), sorting and paging', async () => {
      const f = (id: string, value: unknown[], op = 'in') => ({ id, op, value });
      expect(await listIds(author, { filters: [f('status', ['submitted'])] })).toEqual([drafts.sub]);
      expect(await listIds(author, { filters: [f('status', ['draft', 'submitted'], 'notIn')] })).toEqual([drafts.withdrawn]);
      expect(await listIds(author, { filters: [f('origin', ['ai'])] })).toEqual([]);
      expect(await listIds(author, { filters: [f('proposalType', ['revise'])] })).toEqual([]);
      expect(await listIds(author, { filters: [f('ownerModelId', [ids.model])] })).toHaveLength(3);
      expect(await listIds(author, { filters: [f('ownerModelId', [ids.modelOff])] })).toEqual([]);
      const bySubmitted = await read('logKnowledge.drafts', { q: 'vis', sorting: [{ id: 'submittedAt', desc: false }], pageSize: 100 }, author);
      expect((bySubmitted.data.rows as { id: string }[])[0]?.id).toBe(drafts.sub); // NULLS LAST
      const paged = await read('logKnowledge.drafts', { q: 'vis', page: 1, pageSize: 2 }, author);
      expect(paged.data).toMatchObject({ total: 3 });
      expect(paged.data.rows).toHaveLength(1);
    });

    it('a software-owned draft matches the ownerModelId filter through its SW version\'s model', async () => {
      const d = await act('draftCreate', { proposalType: 'create', proposal: createProposal('swowned', { ownerModelId: undefined, ownerSoftwareId: ids.sw }) });
      expect(await listIds(author, { q: 'swowned', filters: [{ id: 'ownerModelId', op: 'in', value: [ids.model] }] })).toEqual([d.data.id]);
    });

    it.each([
      ['an unknown filter field', { filters: [{ id: 'title', op: 'in', value: ['x'] }] }],
      ['an unknown sort', { sorting: [{ id: 'title', desc: false }] }],
      ['a bad page size', { pageSize: 0 }],
    ])('%s is refused (error), not an empty page', async (_label, params) => {
      expect((await read('logKnowledge.drafts', params, author)).outcome).toBe('error');
    });

    it('draftDetail refuses a non-uuid draftId', async () => {
      expect((await read('logKnowledge.draftDetail', { draftId: 'nope' }, author)).outcome).toBe('error');
    });
  });

  describe('digest', () => {
    it('the stored digest is the pure function of the stored proposal', async () => {
      const d = await newDraft('digest', author, { subjects: [] });
      const [rev] = await draftRevs(d.id);
      expect(proposalDigest(normalizeProposal(rev?.proposal_json as never))).toBe(d.digest);
    });
  });
});
