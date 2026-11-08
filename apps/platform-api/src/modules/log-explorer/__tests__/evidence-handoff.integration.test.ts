// #1474 X-h — `logExplorer.evidenceHandoff` through the real `buildServer` over `POST /api/v1/menu-action` against a real Postgres
// (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// The Source is the synthetic adapter of the dev assembly. Needs migration 0116 (`round_evidence_ref`).

import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { devLogExplorerServerOptions } from '../../../test-support/log-explorer-dev-assembly.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { createSyntheticScenario, sampleSetOf, syntheticFixture } from '../adapters/synthetic/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LEH${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);

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

const SET = sampleSetOf(syntheticFixture('typical'));
const FILE_A = 'synthetic/a.log';
const SHA_A = SET.files.find((f) => f.fileRef === FILE_A)?.sha256 ?? '';
/** A location of the synthetic file A (30 lines): line 31 and beyond answer `source_absent`. */
const REF = (line: number, over: Record<string, unknown> = {}) => ({ fileRef: FILE_A, line, fileSha256: SHA_A, ...over });
const KEYS = (refs: Row[]) => refs.map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256 }));

describe.skipIf(!runIntegration)('log explorer evidence handoff (#1474 X-h)', () => {
  let app: FastifyInstance;
  let noSource: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let holder: Person; // every right, in the Source ACL
  let other: Person; // every right, in the Source ACL: not the investigation owner
  let noHandoff: Person;
  let noRound: Person; // handoff + draft right, no lifecycle.round.manage
  let noDraft: Person; // handoff + round right, no knowledge.draft.create
  let noAcl: Person; // every right, not in the Source ACL
  let modelId = '';
  const aclActors = new Set<string>();
  const actorIds: string[] = [];
  const projectIds: string[] = [];
  const tokenIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
  const access = { allows: async (actor: { actor_id: string }, owner: string) => owner === SET.sourceOwner && aclActors.has(actor.actor_id) };

  async function person(capabilities: string[], inAcl = true): Promise<Person> {
    const externalId = `${TAG}-p-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'developer' });
    actorIds.push(id);
    for (const capability of capabilities) {
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`,
        [WORKSPACE_ID, id, capability, admin.id],
      );
    }
    if (inAcl) aclActors.add(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string; key?: string; server?: FastifyInstance } = {},
  ): Promise<Answer> {
    const who = opts.who ?? holder;
    const res = await (opts.server ?? app).inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logExplorer.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  /** An open standalone investigation (the synthetic sample set) holding `refs`, returning its id and current version. */
  async function seed(refs: Row[], who: Person = holder): Promise<{ id: string; version: string; refs: Row[] }> {
    const created = await act('investigationCreate', { title: `${TAG} inv`, origin: 'standalone', sampleSet: SET }, { who });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    const id = created.data.id as string;
    let version = created.data.version as string;
    for (const ref of refs) {
      const added = await act('evidenceAdd', { id, ref }, { who, expectedVersion: version });
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      version = added.version as string;
    }
    return { id, version, refs };
  }

  /** An open round whose sample set is the synthetic one. */
  async function makeRound(): Promise<string> {
    const project = (
      await sql(
        `insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`,
        [WORKSPACE_ID, randomUUID(), admin.id],
      )
    ).rows[0].id as string;
    projectIds.push(project);
    return (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id`,
        [WORKSPACE_ID, project, JSON.stringify(SET), H('d'), admin.id],
      )
    ).rows[0].id as string;
  }

  const roundRefs = async (roundId: string): Promise<Row[]> =>
    ((await sql('select * from log_lifecycle.round_evidence_ref where round_id = $1 order by seq', [roundId])).rows as Row[]).map((r) => ({ ...r, line: Number(r.line) }));
  const inv = async (id: string) => (await sql('select * from log_explorer.investigation where id = $1', [id])).rows[0] as Row;
  const handoffAudit = async (id: string) =>
    (await sql(`select actor_id, subject_type, detail from core.audit_log where subject_id = $1 and event_type = 'explorer.evidence_handed_off' order by created_at, id`, [id])).rows as Row[];
  const allAudit = async (id: string) => (await sql('select event_type from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as Row[];
  const draftCount = async () => Number((await sql('select count(*) from knowledge.draft where created_by = any($1)', [actorIds])).rows[0].count);
  const revisions = async (id: string) => (await sql('select * from knowledge.draft_revision where draft_id = $1 order by draft_rev_no', [id])).rows as Row[];

  const toRound = (roundId: string) => ({ kind: 'round', roundId });
  const toNewDraft = (over: Row = {}) => ({ kind: 'knowledgeDraft', mode: 'create', owner: { modelId }, title: `${TAG} handoff`, observation: 'seen in the log', ...over });

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, logExplorer: devLogExplorerServerOptions(access, 'typical') });
    await app.ready();
    // The same ACL but no Source adapter connected (production today).
    noSource = await buildServer({ config: loadConfig(), dbHandle, logExplorer: { sourceOwnerAccess: access } });
    await noSource.ready();
    const adminExternal = `${TAG}-admin`;
    admin = { id: (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId: adminExternal, roleLevel: 'admin' })).id, cookie: '', csrf: '' };
    actorIds.push(admin.id);
    const all = ['explorer.investigate', 'explorer.handoff', 'lifecycle.round.manage', 'knowledge.draft.create'];
    holder = await person(all);
    other = await person(all);
    noHandoff = await person(all.filter((c) => c !== 'explorer.handoff'));
    noRound = await person(all.filter((c) => c !== 'lifecycle.round.manage'));
    noDraft = await person(all.filter((c) => c !== 'knowledge.draft.create'));
    noAcl = await person(all, false);
    const vendor = (
      await sql('insert into knowledge.vendor (workspace_id, created_by, updated_by, name, code, code_key) values ($1,$2,$2,$3,$3,$4) returning id', [
        WORKSPACE_ID,
        admin.id,
        `${TAG}-v`,
        toCodeKey(`${TAG}-v`),
      ])
    ).rows[0].id as string;
    modelId = (
      await sql(
        'insert into knowledge.equipment_model (workspace_id, created_by, updated_by, name, code, code_key, vendor_id, active) values ($1,$2,$2,$3,$3,$4,$5,true) returning id',
        [WORKSPACE_ID, admin.id, `${TAG}-m`, toCodeKey(`${TAG}-m`), vendor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_lifecycle.round_evidence_ref disable trigger round_evidence_ref_append_only');
      await client.query('delete from log_lifecycle.round_evidence_ref where handed_off_by = any($1)', [actorIds]);
      await client.query('alter table log_lifecycle.round_evidence_ref enable trigger round_evidence_ref_append_only');
      await client.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft_review where draft_id in (select id from knowledge.draft where created_by = any($1))', [actorIds]);
      await client.query('delete from knowledge.draft_revision where author_actor_id = any($1)', [actorIds]);
      await client.query('alter table knowledge.draft_revision enable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft where created_by = any($1)', [actorIds]);
      await client.query('delete from log_explorer.investigation where owner_actor_id = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.validation_round where project_id = any($1)', [projectIds]);
      await client.query('delete from log_lifecycle.development_project where id = any($1)', [projectIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from knowledge.equipment_model where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.vendor where created_by = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.api_tokens', 'actor_id'],
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await noSource?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('Round target', () => {
    it('attaches the pointers with the receiver\'s statuses (a source_absent line is unresolved), leaves the investigation unchanged and audits body-free', async () => {
      const s = await seed([REF(1, { note: 'first' }), REF(2, { fileSha256: H('f') }), REF(99)]);
      const roundId = await makeRound();
      const before = await inv(s.id);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { expectedVersion: s.version });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data).toEqual({ targetKind: 'round', targetId: roundId, handedOff: 3, alreadyAttached: 0, byStatus: { match: 1, hash_mismatch: 1, unresolved: 1 } });
      expect(a.version).toBe(s.version);
      const rows = await roundRefs(roundId);
      expect(rows.map((r) => [r.line, r.status, r.note, r.origin_kind, r.origin_id, r.handed_off_by])).toEqual([
        [1, 'match', 'first', 'log_explorer', s.id, holder.id],
        [2, 'hash_mismatch', null, 'log_explorer', s.id, holder.id],
        [99, 'unresolved', null, 'log_explorer', s.id, holder.id],
      ]);
      expect(await inv(s.id)).toEqual(before);
      const rows2 = await handoffAudit(s.id);
      expect(rows2).toEqual([
        expect.objectContaining({
          actor_id: holder.id,
          subject_type: 'investigation',
          detail: { targetKind: 'round', targetId: roundId, refCount: 3, resolvedCount: 2, unresolvedCount: 1, attached: 3, alreadyAttached: 0, match: 1, hashMismatch: 1, unresolved: 1 },
        }),
      ]);
      expect(JSON.stringify(rows2)).not.toContain('first');
      expect(JSON.stringify(rows2)).not.toContain(FILE_A);
    });

    it('replays once for the same idempotencyKey, and a new key answers alreadyAttached', async () => {
      const s = await seed([REF(3), REF(4)]);
      const roundId = await makeRound();
      const key = randomUUID();
      const input = { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) };
      const first = await act('evidenceHandoff', input, { expectedVersion: s.version, key });
      const again = await act('evidenceHandoff', input, { expectedVersion: s.version, key });
      expect(first.outcome).toBe('ok');
      expect(again).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
      expect(await roundRefs(roundId)).toHaveLength(2);
      expect(await handoffAudit(s.id)).toHaveLength(1);

      const fresh = await act('evidenceHandoff', input, { expectedVersion: s.version });
      expect(fresh.data).toMatchObject({ handedOff: 0, alreadyAttached: 2 });
      expect(await roundRefs(roundId)).toHaveLength(2);
    });

    it('a missing round, and a round the receiver refuses, roll everything back', async () => {
      const s = await seed([REF(5)]);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(randomUUID()) }, { expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['target.roundId:not_found']);
      expect(await handoffAudit(s.id)).toEqual([]);
    });
  });

  describe('knowledge draft target', () => {
    it('create: a draft revision with the mapped pointers, [해시 불일치] on a mismatching ref, and the audit counts', async () => {
      const s = await seed([REF(6, { note: 'check' }), REF(7, { fileSha256: H('f') })]);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toNewDraft() }, { expectedVersion: s.version });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data).toMatchObject({ targetKind: 'knowledgeDraft', handedOff: 2 });
      const draftId = a.data.targetId as string;
      const revs = await revisions(draftId);
      expect(revs).toHaveLength(1);
      expect(revs[0]).toMatchObject({ author_auth: 'session' });
      const proposal = revs[0]?.proposal_json as { evidence: Row[] };
      expect(proposal.evidence).toEqual([
        expect.objectContaining({ sourceKind: 'log_file', sourceOwner: SET.sourceOwner, sourceRef: FILE_A, contentHash: SHA_A, locator: 'line:6', note: 'check' }),
        expect.objectContaining({ sourceRef: FILE_A, contentHash: H('f'), locator: 'line:7', note: expect.stringMatching(/^\[해시 불일치\]/) }),
      ]);
      expect(a.data.draftVersion).toBe(String((await sql('select row_version from knowledge.draft where id = $1', [draftId])).rows[0].row_version));
      expect(await handoffAudit(s.id)).toEqual([
        expect.objectContaining({ detail: { targetKind: 'knowledgeDraft', targetId: draftId, refCount: 2, resolvedCount: 2, unresolvedCount: 0, hashMismatchCount: 1 } }),
      ]);
    });

    it('append: adds the pointers to the caller\'s own draft with the draft\'s expected version', async () => {
      const first = await seed([REF(8)]);
      const created = await act('evidenceHandoff', { id: first.id, refs: KEYS(first.refs), target: toNewDraft() }, { expectedVersion: first.version });
      const draftId = created.data.targetId as string;
      const second = await seed([REF(9)]);
      const a = await act(
        'evidenceHandoff',
        { id: second.id, refs: KEYS(second.refs), target: { kind: 'knowledgeDraft', mode: 'append', draftId, draftExpectedVersion: created.data.draftVersion } },
        { expectedVersion: second.version },
      );
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data.targetId).toBe(draftId);
      const revs = await revisions(draftId);
      expect(revs).toHaveLength(2);
      expect((revs[1]?.proposal_json as { evidence: Row[] }).evidence.map((e) => e.locator)).toEqual(['line:8', 'line:9']);

      const stale = await act(
        'evidenceHandoff',
        { id: second.id, refs: KEYS(second.refs), target: { kind: 'knowledgeDraft', mode: 'append', draftId, draftExpectedVersion: created.data.draftVersion } },
        { expectedVersion: second.version },
      );
      expect(stale.outcome).toBe('invalid');
      expect(fe(stale)).toEqual(['expectedVersion:conflict']);
    });

    it('an unresolved line is refused and nothing is written (no draft, no audit)', async () => {
      const s = await seed([REF(10), REF(99)]);
      const drafts = await draftCount();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toNewDraft() }, { expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['refs.1:unresolved']);
      expect(await draftCount()).toBe(drafts);
      expect(await handoffAudit(s.id)).toEqual([]);
    });

    it('a token holding the explorer.handoff and knowledge.draft.create scopes hands off; the revision is author_auth=token', async () => {
      const s = await seed([REF(11)]);
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      const tokenId = (
        await sql(
          `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,'personal','raw',$3,$4,$5,$2) returning id`,
          [WORKSPACE_ID, holder.id, prefix, hashToken(value), ['explorer.handoff', 'knowledge.draft.create']],
        )
      ).rows[0].id as string;
      tokenIds.push(tokenId);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${value}` },
        payload: JSON.stringify({
          action: 'logExplorer.evidenceHandoff',
          context: {},
          input: { id: s.id, refs: KEYS(s.refs), target: toNewDraft() },
          idempotencyKey: randomUUID(),
          expectedVersion: s.version,
        }),
      });
      expect(res.statusCode, res.body).toBe(200);
      const a = res.json<Answer>();
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect((await revisions(a.data.targetId as string))[0]).toMatchObject({ author_auth: 'token' });

      // Without the explorer.handoff scope the same token is refused.
      const noScope = (
        await sql(
          `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,'personal','raw',$3,$4,$5,$2) returning id`,
          [WORKSPACE_ID, holder.id, prefix.split('').reverse().join(''), hashToken(`${value}x`), ['knowledge.draft.create']],
        )
      ).rows[0].id as string;
      tokenIds.push(noScope);
      const denied = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${value}x` },
        payload: JSON.stringify({ action: 'logExplorer.evidenceHandoff', context: {}, input: { id: s.id, refs: KEYS(s.refs), target: toNewDraft() }, idempotencyKey: randomUUID(), expectedVersion: s.version }),
      });
      expect(denied.statusCode === 403 || denied.json<Answer>().outcome === 'forbidden', denied.body).toBe(true);
    });
  });

  describe('receiver right on an idempotency replay (C1)', () => {
    const grantOf = (actorId: string, capability: string) =>
      sql('delete from permission.permission_grants where actor_id = $1 and capability = $2', [actorId, capability]);

    it('a replay with the same key is forbidden once the receiver grant is revoked (no cached answer)', async () => {
      const who = await person(['explorer.investigate', 'explorer.handoff', 'lifecycle.round.manage']);
      const s = await seed([REF(22)], who);
      const roundId = await makeRound();
      const key = randomUUID();
      const input = { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) };
      const first = await act('evidenceHandoff', input, { who, expectedVersion: s.version, key });
      expect(first.outcome, JSON.stringify(first)).toBe('ok');
      await grantOf(who.id, 'lifecycle.round.manage');
      const again = await act('evidenceHandoff', input, { who, expectedVersion: s.version, key });
      expect(again).toMatchObject({ outcome: 'forbidden', data: null, replayed: false });
    });

    it('a second token of the same actor holding only explorer.handoff cannot replay a successful request', async () => {
      const who = await person(['explorer.investigate', 'explorer.handoff', 'lifecycle.round.manage']);
      const s = await seed([REF(23)], who);
      const roundId = await makeRound();
      const key = randomUUID();
      const input = { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) };
      const first = await act('evidenceHandoff', input, { who, expectedVersion: s.version, key });
      expect(first.outcome, JSON.stringify(first)).toBe('ok');
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      const tokenId = (
        await sql(
          `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,'personal','raw',$3,$4,$5,$2) returning id`,
          [WORKSPACE_ID, who.id, prefix, hashToken(value), ['explorer.handoff']],
        )
      ).rows[0].id as string;
      tokenIds.push(tokenId);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${value}` },
        payload: JSON.stringify({ action: 'logExplorer.evidenceHandoff', context: {}, input, idempotencyKey: key, expectedVersion: s.version }),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<Answer>()).toMatchObject({ outcome: 'forbidden', data: null, replayed: false });
    });
  });

  describe('Source wait under the runtime DB budgets (C2)', () => {
    it('a stalled Source past the handoff budget is refs: source_unavailable on a pool with a 2 s idle-in-transaction timeout; nothing written, connection usable', async () => {
      const budgeted = createDb(APP_URL, {
        budgets: { poolMax: 5, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000, lockTimeoutMs: 5000, idleInTransactionTimeoutMs: 2000 },
      });
      const stalled = await buildServer({
        config: loadConfig(),
        dbHandle: budgeted,
        logExplorer: {
          sourceReadPort: { ...createSyntheticScenario('typical').port, getWindow: () => new Promise(() => undefined) },
          sourceOwnerAccess: access,
          handoffSourceTotalMs: 3000,
        },
      });
      await stalled.ready();
      try {
        const who = await person(['explorer.investigate', 'explorer.handoff', 'lifecycle.round.manage']);
        const s = await seed([REF(24)], who);
        const roundId = await makeRound();
        const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { who, server: stalled, expectedVersion: s.version });
        expect(a.outcome, JSON.stringify(a)).toBe('invalid');
        expect(fe(a)).toEqual(['refs:source_unavailable']);
        expect(await roundRefs(roundId)).toEqual([]);
        expect(await handoffAudit(s.id)).toEqual([]);
        const again = await act('investigationCreate', { title: `${TAG} after`, origin: 'standalone', sampleSet: SET }, { who, server: stalled });
        expect(again.outcome, JSON.stringify(again)).toBe('ok');
        expect((await budgeted.pool.query('select 1 as one')).rows[0]).toEqual({ one: 1 });
      } finally {
        await stalled.close();
        await budgeted.close();
      }
    }, 30_000);
  });

  describe('refusals write nothing', () => {
    const expectUntouched = async (id: string, before: Row, drafts: number) => {
      expect(await inv(id)).toEqual(before);
      expect(await handoffAudit(id)).toEqual([]);
      expect(await draftCount()).toBe(drafts);
    };

    it('a ref that is not stored in the investigation is refused at its request index', async () => {
      const s = await seed([REF(12)]);
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: [...KEYS(s.refs), REF(13)], target: toRound(roundId) }, { expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['refs.1:not_in_investigation']);
      expect(await roundRefs(roundId)).toEqual([]);
    });

    it('an archived investigation is refused', async () => {
      const s = await seed([REF(14)]);
      const archived = await act('investigationArchive', { id: s.id }, { expectedVersion: s.version });
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { expectedVersion: archived.version as string });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['id:illegal_transition']);
      expect(await roundRefs(roundId)).toEqual([]);
      expect(await handoffAudit(s.id)).toEqual([]);
    });

    it("another owner's investigation is not_found", async () => {
      const s = await seed([REF(15)]);
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { who: other, expectedVersion: s.version });
      expect(a.outcome).toBe('not_found');
      expect(await roundRefs(roundId)).toEqual([]);
    });

    it('a stale expectedVersion is a conflict', async () => {
      const s = await seed([REF(16), REF(17)]);
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { expectedVersion: '1' });
      expect(a.outcome).toBe('conflict');
      expect(await roundRefs(roundId)).toEqual([]);
    });

    it('without explorer.handoff the action is forbidden', async () => {
      const s = await seed([REF(18)], noHandoff);
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { who: noHandoff, expectedVersion: s.version });
      expect(a.outcome).toBe('forbidden');
      expect(await roundRefs(roundId)).toEqual([]);
    });

    it.each([
      ['round', () => noRound, (roundId: string) => toRound(roundId)],
      ['knowledge draft', () => noDraft, () => toNewDraft()],
    ])('without the %s receiver right the action is forbidden (judged in authorize) and nothing is written', async (_label, who, target) => {
      const s = await seed([REF(19)], who());
      const roundId = await makeRound();
      const drafts = await draftCount();
      const before = await inv(s.id);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: target(roundId) }, { who: who(), expectedVersion: s.version });
      expect(a.outcome).toBe('forbidden');
      expect(await roundRefs(roundId)).toEqual([]);
      await expectUntouched(s.id, before, drafts);
    });

    it('a Source owner the caller may not read is source_forbidden', async () => {
      const s = await seed([REF(20)], noAcl);
      const roundId = await makeRound();
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { who: noAcl, expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['refs:source_forbidden']);
      expect(await roundRefs(roundId)).toEqual([]);
    });

    it('with no Source adapter connected the handoff is source_unavailable, never a guessed resolved', async () => {
      const s = await seed([REF(21)]);
      const roundId = await makeRound();
      const before = await inv(s.id);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toRound(roundId) }, { server: noSource, expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['refs:source_unavailable']);
      expect(await roundRefs(roundId)).toEqual([]);
      expect(await inv(s.id)).toEqual(before);
      expect(await allAudit(s.id)).toEqual([{ event_type: 'explorer.investigation.created' }, { event_type: 'explorer.evidence.added' }]);
    });

    it('a defect target is not_available', async () => {
      const s = await seed([REF(22)]);
      const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: { kind: 'defect' } }, { expectedVersion: s.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['target:not_available']);
      expect(await handoffAudit(s.id)).toEqual([]);
    });
  });

  describe('investigationDetail.handoff (what the screen may offer)', () => {
    async function detailHandoff(who: Person, server: FastifyInstance = app): Promise<unknown> {
      const s = await seed([REF(2)], who);
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
        payload: JSON.stringify({ endpoint: 'logExplorer.investigationDetail', context: {}, params: { investigationId: s.id } }),
      });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>().data.handoff;
    }

    it.each([
      ['every right', () => holder, { round: true, knowledgeDraft: true }],
      ['no explorer.handoff', () => noHandoff, { round: false, knowledgeDraft: false }],
      ['no round receiver right', () => noRound, { round: false, knowledgeDraft: true }],
      ['no draft receiver right', () => noDraft, { round: true, knowledgeDraft: false }],
    ])('%s', async (_name, who, expected) => {
      expect(await detailHandoff(who())).toEqual(expected);
    });
  });

  describe('knowledge handoff reads (#1474c)', () => {
    it('cancels active Source calls on read disconnect and never starts a later batch', async () => {
      const s = await seed(Array.from({ length: 12 }, (_, i) => REF(i + 1)));
      const before = await inv(s.id);
      const audits = await allAudit(s.id);
      const signals: AbortSignal[] = [];
      let firstBatch: () => void = () => undefined;
      const started = new Promise<void>(resolve => { firstBatch = resolve; });
      const options = devLogExplorerServerOptions(access, 'typical');
      const slow = await buildServer({ config: loadConfig(), dbHandle, logExplorer: {
        ...options,
        handoffSourceTotalMs: 1500,
        sourceReadPort: { ...createSyntheticScenario('typical').port, getWindow: async (_request, ctx) => {
          signals.push(ctx.signal);
          if (signals.length === 10) firstBatch();
          return new Promise(() => undefined);
        } },
      } });
      let response: ServerResponse | undefined;
      slow.addHook('onRequest', async (req, reply) => { if (req.url === '/api/v1/menu-query') response = reply.raw; });
      let complete: () => void = () => undefined;
      const completed = new Promise<void>(resolve => { complete = resolve; });
      slow.addHook('onSend', async (req, _reply, payload) => { if (req.url === '/api/v1/menu-query') complete(); return payload; });
      let pending: Promise<unknown> | undefined;
      try {
        await slow.ready();
        pending = slow.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...cookieHeader(holder.cookie) }, payload: { endpoint: 'logExplorer.handoffCheck', context: {}, params: { investigationId: s.id } } }).catch(error => {
          expect(error.message).toBe('response destroyed before completion');
        });
        await started;
        expect(response).toBeDefined();
        response?.emit('close');
        expect(signals).toHaveLength(10);
        expect(signals.every(signal => signal.aborted)).toBe(true);
        await pending;
        await completed;
        expect(signals).toHaveLength(10);
        expect(await inv(s.id)).toEqual(before);
        expect(await allAudit(s.id)).toEqual(audits);
      } finally {
        await pending;
        await completed;
        await slow.close();
      }
    });
    async function query(endpoint: string, params: Row, who: Person = holder, server = app) {
      const res = await server.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) }, payload: { endpoint: `logExplorer.${endpoint}`, context: {}, params } });
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>();
    }
    it('checks statuses without a body, note, audit or investigation mutation', async () => {
      const s = await seed([REF(1, { note: 'private-note' }), REF(2, { fileSha256: H('f') }), REF(99)]);
      const before = await inv(s.id);
      const audits = await allAudit(s.id);
      const a = await query('handoffCheck', { investigationId: s.id });
      expect(a).toMatchObject({ outcome: 'ok', data: { state: 'ok', refs: [ { fileRef: FILE_A, line: 1, status: 'ok' }, { fileRef: FILE_A, line: 2, status: 'hash_mismatch' }, { fileRef: FILE_A, line: 99, status: 'unresolved' } ] } });
      expect(Object.keys(a.data)).toEqual(['state', 'refs']);
      for (const r of a.data.refs) expect(Object.keys(r)).toEqual(['fileRef', 'line', 'status']);
      expect(JSON.stringify(a)).not.toContain('private-note');
      expect(await inv(s.id)).toEqual(before);
      expect(await allAudit(s.id)).toEqual(audits);
    });
    it('hides foreign and unknown investigations identically', async () => {
      const s = await seed([REF(1)]);
      expect(await query('handoffCheck', { investigationId: s.id }, other)).toMatchObject({ outcome: 'ok', data: null });
      expect(await query('handoffCheck', { investigationId: randomUUID() })).toMatchObject({ outcome: 'ok', data: null });
    });
    it('requires the explorer right before any check', async () => {
      const s = await seed([REF(1)], noHandoff);
      expect(await query('handoffCheck', { investigationId: s.id }, noHandoff)).toMatchObject({ outcome: 'forbidden', data: null });
    });
    it('answers ACL denial and absent Source with no per-location information', async () => {
      const s = await seed([REF(1)], noAcl);
      expect(await query('handoffCheck', { investigationId: s.id }, noAcl)).toMatchObject({ outcome: 'ok', data: { state: 'source_forbidden', refs: [] } });
      const own = await seed([REF(1)]);
      expect(await query('handoffCheck', { investigationId: own.id }, holder, noSource)).toMatchObject({ outcome: 'ok', data: { state: 'source_unavailable', refs: [] } });
    });
    it('lists only own non-final drafts with pointer count and current version', async () => {
      const s = await seed([REF(3)]);
      const created = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toNewDraft() }, { expectedVersion: s.version });
      const draftId = created.data.targetId;
      const listed = await query('handoffDrafts', {});
      expect(listed.data.rows).toContainEqual(expect.objectContaining({ draftId, title: `${TAG} handoff`, ownerLabel: expect.stringContaining(TAG), evidenceCount: 1, status: 'draft', version: created.data.draftVersion, updatedAt: expect.any(String) }));
      expect((await query('handoffDrafts', {}, other)).data.rows.map((r: Row) => r.draftId)).not.toContain(draftId);
      const withdrawn = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: { 'content-type': 'application/json', ...cookieHeader(holder.cookie), 'x-csrf-token': holder.csrf }, payload: { action: 'logKnowledge.draftWithdraw', context: {}, input: { id: draftId }, expectedVersion: created.data.draftVersion, idempotencyKey: randomUUID() } });
      expect(withdrawn.json<Answer>().outcome, withdrawn.body).toBe('ok');
      expect((await query('handoffDrafts', {})).data.rows.map((r: Row) => r.draftId)).not.toContain(draftId);
    });
    it('caps own open drafts at 50, newest first', async () => {
      const s = await seed([REF(4)]);
      const ids: string[] = [];
      for (let i = 0; i < 51; i++) {
        const a = await act('evidenceHandoff', { id: s.id, refs: KEYS(s.refs), target: toNewDraft({ title: `${TAG} cap ${i}` }) }, { expectedVersion: s.version });
        expect(a.outcome, JSON.stringify(a)).toBe('ok');
        ids.push(a.data.targetId);
      }
      const rows = (await query('handoffDrafts', {})).data.rows;
      expect(rows).toHaveLength(50);
      expect(rows.map((r: Row) => r.draftId)).toEqual(ids.slice(1).reverse());
    });
    it.each(['handoffDrafts', 'handoffModels', 'handoffSoftware'])('%s requires both rights and returns empty for a missing receiving right', async name => {
      const params = name === 'handoffModels' ? { q: null, page: 0, pageSize: 20 } : name === 'handoffSoftware' ? { modelId } : {};
      expect(await query(name, params, noHandoff)).toMatchObject({ outcome: 'forbidden', data: null });
      const a = await query(name, params, noDraft);
      expect(a.outcome).toBe('ok');
      expect(name === 'handoffSoftware' ? a.data : a.data.rows).toEqual([]);
    });
    it('reads model and software options through the catalog port', async () => {
      const models = await query('handoffModels', { q: TAG, page: 0, pageSize: 20 });
      expect(models.data.rows).toContainEqual(expect.objectContaining({ id: modelId, code: `${TAG}-m`, active: true }));
      expect((await query('handoffSoftware', { modelId: randomUUID() })).data).toEqual([]);
    });
  });

});
