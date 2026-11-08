// #1476 X-k — the log explorer slice as ONE chain over the real HTTP surface and a real Postgres, no mocked auth:
//   a person holding the explorer rights issues two personal tokens (read only; read + export) → opens a round-origin investigation on a
//   validation Round → reads the synthetic Source (records, window) → stores two evidence locations → hands them to the Round (replayed
//   once) and to a new knowledge draft → the Round shows the handed locations → the read token reads and cannot export, the export
//   token exports a CSV → the Source-owner ACL, then `explorer.source.read`, then `explorer.investigate` are revoked, and each surface
//   answers its own refusal on the very next call → no source text is in any stored or audited row.
// The seams only: the per-node behaviour (limits, cursors, budgets, export lease, handoff validation and receivers) is pinned by
// `read-endpoints`, `export`, `evidence-handoff` and `log-explorer` integration tests; this file does not repeat them.
// The Source is the synthetic adapter of the dev assembly (the production assembly connects none yet: no evidence of an in-house Source).
// The browser-visible half is covered by the mock E2E `log explorer` and `log-lifecycle screens`, not here.
// Throwaway DB only: `pnpm --filter @ap/platform-api test:integration` (app as platform_app, fixtures as platform_migrate).
// Select with `-t "contract chain"`.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { devLogExplorerServerOptions } from '../../../test-support/log-explorer-dev-assembly.js';
import { grantCapability, revokeCapabilityGrant } from '../../../test-support/permissions-fixtures.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { createSyntheticScenario, sampleSetOf, syntheticFixture } from '../adapters/synthetic/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LXC${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);

interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
  replayed: boolean;
  message?: string;
}
type Row = Record<string, unknown>;

const SET = sampleSetOf(syntheticFixture('typical'));
const FILE_A = 'synthetic/a.log';
const SHA_A = SET.files.find((f) => f.fileRef === FILE_A)?.sha256 ?? '';
const REF = (line: number) => ({ fileRef: FILE_A, line, fileSha256: SHA_A });

describe.skipIf(!runIntegration)('log explorer contract chain (#1476 k)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let adminId = '';
  let analyst: { id: string; cookie: string; csrf: string };
  let modelId = '';
  let projectId = '';
  let roundId = '';
  let investigationId = '';
  let version = '';
  let readToken = { value: '', id: '' };
  let exportToken = { value: '', id: '' };
  let seenText: string[] = []; // every source line the chain read: none of it may be stored or audited
  const grants = new Map<string, string>();
  const aclActors = new Set<string>();
  const actorIds: string[] = [];
  const synthetic = createSyntheticScenario('typical');

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });
  const access = { allows: async (actor: { actor_id: string }, owner: string) => owner === SET.sourceOwner && aclActors.has(actor.actor_id) };
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  const query = async (endpoint: string, params: Record<string, unknown>, headers: Record<string, string> = cookieHeader(analyst.cookie)): Promise<Answer> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...headers },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  };
  const act = async (action: string, input: Record<string, unknown>, opts: { expectedVersion?: string; key?: string } = {}): Promise<Answer> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(analyst.cookie), 'x-csrf-token': analyst.csrf },
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
  };
  const exportCall = (headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/log-explorer/export',
      headers: { 'content-type': 'application/json', ...headers },
      payload: JSON.stringify({ sampleSet: SET, query: {}, range: { rows: 20 }, format: 'csv' }),
    });
  const issueToken = async (name: string, scopes: string[]) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api-tokens',
      headers: { 'content-type': 'application/json', ...cookieHeader(analyst.cookie), 'x-csrf-token': analyst.csrf },
      payload: JSON.stringify({ name: `${TAG}-${name}`, scopes }),
    });
    expect(res.statusCode, res.body).toBe(201);
    return { value: res.json<{ token: string }>().token, id: res.json<{ item: { id: string } }>().item.id };
  };
  const auditRows = async (event: string): Promise<Row[]> =>
    (await sql(`select actor_id, subject_type, subject_id, detail from core.audit_log where actor_id = $1 and event_type = $2 order by created_at, id`, [analyst.id, event])).rows as Row[];
  const roundDetail = async () => (await query('logLifecycle.roundDetail', { roundId })).data as { evidenceRefs: Row[] };
  const rowsOf = (a: Answer) => (a.data.rows as { text: string; line: number; fileRef: string }[]) ?? [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, logExplorer: devLogExplorerServerOptions(access, 'typical') });
    await app.ready();
    adminId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId: `${TAG}-admin`, roleLevel: 'admin' })).id;
    actorIds.push(adminId);
    const externalId = `${TAG}-analyst`;
    const id = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'developer' })).id;
    actorIds.push(id);
    for (const capability of ['explorer.source.read', 'explorer.investigate', 'explorer.export', 'explorer.handoff', 'lifecycle.round.manage', 'knowledge.draft.create']) {
      grants.set(capability, await grantCapability(dbHandle, WORKSPACE_ID, id, capability, null, adminId));
    }
    aclActors.add(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    analyst = { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
    const vendor = (await sql('insert into knowledge.vendor (workspace_id, created_by, updated_by, name, code, code_key) values ($1,$2,$2,$3,$3,$4) returning id', [WORKSPACE_ID, adminId, `${TAG}-v`, toCodeKey(`${TAG}-v`)])).rows[0].id as string;
    modelId = (
      await sql('insert into knowledge.equipment_model (workspace_id, created_by, updated_by, name, code, code_key, vendor_id, active) values ($1,$2,$2,$3,$3,$4,$5,true) returning id', [
        WORKSPACE_ID,
        adminId,
        `${TAG}-m`,
        toCodeKey(`${TAG}-m`),
        vendor,
      ])
    ).rows[0].id as string;
    projectId = (await sql(`insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`, [WORKSPACE_ID, randomUUID(), adminId])).rows[0].id as string;
    roundId = (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id`,
        [WORKSPACE_ID, projectId, JSON.stringify(SET), H('d'), adminId],
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
      await client.query('delete from log_lifecycle.validation_round where project_id = $1', [projectId]);
      await client.query('delete from log_lifecycle.development_project where id = $1', [projectId]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql(`delete from core.rate_limits where route_group in ('explorer_usage','explorer_export_lease') and key like $1`, [`${WORKSPACE_ID}:%`]).catch(() => undefined);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['core.api_tokens', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['knowledge.equipment_model', 'created_by'],
      ['knowledge.vendor', 'created_by'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('contract chain: Source read → evidence → handoff → token read/export → revocation, with no source text stored', async () => {
    // 1. The analyst issues two personal tokens through the real endpoint (ADR-0116): one read-only, one read + export.
    readToken = await issueToken('read', ['explorer.source.read']);
    exportToken = await issueToken('export', ['explorer.source.read', 'explorer.export']);

    // 2. A round-origin investigation resolves the Round's own sample list (no copy: `sample_set` stays null in the row).
    const created = await act('investigationCreate', { title: `${TAG} chain`, origin: 'round', roundId });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    investigationId = created.data.id as string;
    version = created.data.version as string;
    const stored = (await sql('select origin, round_id, sample_set from log_explorer.investigation where id = $1', [investigationId])).rows[0] as Row;
    expect(stored).toMatchObject({ origin: 'round', round_id: roundId, sample_set: null });
    const detail = await query('logExplorer.investigationDetail', { investigationId });
    expect(detail.data).toMatchObject({ origin: 'round', roundId, sampleSetState: 'round', canInvestigate: true, handoff: { round: true, knowledgeDraft: true } });
    expect(detail.data.sampleSet).toEqual(SET);

    // 3. Reads from the synthetic Source: synthetic rows in file-then-line order, one body-free audit row per read.
    const records = await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 5 });
    expect(records.outcome).toBe('ok');
    expect(records.data).toMatchObject({ state: 'ok', synthetic: true });
    expect(rowsOf(records)).toHaveLength(5);
    expect(rowsOf(records).map((r) => r.line)).toEqual([1, 2, 3, 4, 5]);
    const window = await query('logExplorer.window', { sourceOwner: SET.sourceOwner, fileRef: FILE_A, line: 3, before: 1, after: 1 });
    expect(window.data.state).toBe('ok');
    expect(rowsOf(window).map((r) => r.line)).toEqual([2, 3, 4]);
    seenText = [...rowsOf(records), ...rowsOf(window)].map((r) => r.text).filter((t) => t.length >= 8);
    expect(seenText.length).toBeGreaterThan(0);
    const reads = await auditRows('explorer.source.read');
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((r) => (r.detail as Row).result === 'ok')).toBe(true);

    // 4. Two evidence locations are stored as references only (location + hash), each write guarded by the version it saw.
    for (const line of [3, 5]) {
      const added = await act('evidenceAdd', { id: investigationId, ref: REF(line) }, { expectedVersion: version });
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      version = added.version as string;
    }
    const withRefs = await query('logExplorer.investigationDetail', { investigationId });
    expect(withRefs.data.evidence.map((e: { ref: Row; state: Row }) => [e.ref.line, e.state.code])).toEqual([[3, 'available'], [5, 'available']]);
    const rowsStored = (await sql('select evidence from log_explorer.investigation where id = $1', [investigationId])).rows[0].evidence as Row[];
    expect(rowsStored.map((e) => Object.keys(e).sort())).toEqual(rowsStored.map(() => ['fileRef', 'fileSha256', 'line']));

    // 5. Hand off to the Round: the receiver stores the pointers; a replay with the same key is the same answer, and a new key finds them attached.
    const key = randomUUID();
    const toRound = await act('evidenceHandoff', { id: investigationId, refs: [REF(3), REF(5)], target: { kind: 'round', roundId } }, { expectedVersion: version, key });
    expect(toRound.outcome, JSON.stringify(toRound)).toBe('ok');
    expect(toRound.data).toMatchObject({ targetKind: 'round', targetId: roundId, handedOff: 2, byStatus: { match: 2, hash_mismatch: 0, unresolved: 0 } });
    const replay = await act('evidenceHandoff', { id: investigationId, refs: [REF(3), REF(5)], target: { kind: 'round', roundId } }, { expectedVersion: version, key });
    expect(replay.replayed).toBe(true);
    expect(replay.data).toEqual(toRound.data);
    const again = await act('evidenceHandoff', { id: investigationId, refs: [REF(3), REF(5)], target: { kind: 'round', roundId } }, { expectedVersion: version });
    expect(again.data).toMatchObject({ handedOff: 0, alreadyAttached: 2 });
    const handed = (await roundDetail()).evidenceRefs;
    expect(handed.map((r) => r.line).sort()).toEqual([3, 5]);
    expect(handed.every((r) => r.originKind === 'log_explorer' && r.originId === investigationId && r.handedOffBy === analyst.id)).toBe(true);
    expect(((await sql('select count(*)::int as n from log_lifecycle.round_evidence_ref where round_id = $1', [roundId])).rows[0] as { n: number }).n).toBe(2);

    // 6. Hand off to a new knowledge draft: the draft is a draft only (nothing is approved or published by the handoff).
    const toDraft = await act(
      'evidenceHandoff',
      { id: investigationId, refs: [REF(3)], target: { kind: 'knowledgeDraft', mode: 'create', owner: { modelId }, title: `${TAG} draft`, observation: 'seen in the log' } },
      { expectedVersion: version },
    );
    expect(toDraft.outcome, JSON.stringify(toDraft)).toBe('ok');
    expect(toDraft.data).toMatchObject({ targetKind: 'knowledgeDraft', handedOff: 1 });
    const revisions = (await sql('select author_actor_id, author_auth from knowledge.draft_revision where draft_id = $1 order by draft_rev_no', [toDraft.data.targetId])).rows as Row[];
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ author_actor_id: analyst.id, author_auth: 'session' });
    expect(((await sql('select count(*)::int as n from knowledge.draft_review where draft_id = $1', [toDraft.data.targetId])).rows[0] as { n: number }).n).toBe(0);
    const handoffAudit = await auditRows('explorer.evidence_handed_off');
    expect(handoffAudit.map((r) => (r.detail as Row).targetKind)).toEqual(expect.arrayContaining(['round', 'knowledgeDraft']));

    // 7. Tokens: the read token reads (counted against its Actor) and cannot export; the export token exports a CSV; both are audited by token id.
    const tokenRead = await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 3 }, bearer(readToken.value));
    expect(tokenRead.data).toMatchObject({ state: 'ok' });
    expect(rowsOf(tokenRead)).toHaveLength(3);
    const denied = await exportCall(bearer(readToken.value));
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('explorer.forbidden');
    const exported = await exportCall(bearer(exportToken.value));
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.body.trim().split('\n')).toHaveLength(21); // header + the 20 requested rows
    const exportAudit = await auditRows('explorer.export');
    expect(exportAudit.some((r) => (r.detail as Row).rowCount === 20 && Boolean((r.detail as Row).viaToken))).toBe(true);

    // 8. Revocation, surface by surface, each on the very next call. (a) The Source-owner ACL goes.
    aclActors.delete(analyst.id);
    const aclRecords = await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 5 });
    expect(aclRecords.data).toMatchObject({ state: 'permission_denied' });
    expect(rowsOf(aclRecords)).toEqual([]);
    expect((await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 5 }, bearer(readToken.value))).data).toMatchObject({ state: 'permission_denied' });
    expect((await exportCall(bearer(exportToken.value))).statusCode).toBe(403);
    const aclHandoff = await act('evidenceHandoff', { id: investigationId, refs: [REF(5)], target: { kind: 'round', roundId } }, { expectedVersion: version });
    expect(aclHandoff.outcome).toBe('invalid');
    expect(fe(aclHandoff)).toContain('refs:source_forbidden');
    expect(((await sql('select count(*)::int as n from log_lifecycle.round_evidence_ref where round_id = $1', [roundId])).rows[0] as { n: number }).n).toBe(2);
    aclActors.add(analyst.id);
    expect((await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 2 })).data).toMatchObject({ state: 'ok' });

    // (b) `explorer.source.read` goes: the session and both tokens are refused, and the refusal is audited without a body.
    await revokeCapabilityGrant(dbHandle, grants.get('explorer.source.read') as string, adminId);
    expect((await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 5 })).data).toMatchObject({ state: 'permission_denied' });
    expect((await query('logExplorer.window', { sourceOwner: SET.sourceOwner, fileRef: FILE_A, line: 3, before: 0, after: 0 })).data).toMatchObject({ state: 'permission_denied' });
    expect((await query('logExplorer.records', { sampleSet: SET, query: {}, limit: 5 }, bearer(exportToken.value))).data).toMatchObject({ state: 'permission_denied' });
    // Export is judged by its own capability (`explorer.source.read` is neither required nor enough, api/log-explorer.md): the read right going does not close it.
    expect((await exportCall(bearer(exportToken.value))).statusCode).toBe(200);
    const refused = (await auditRows('explorer.source.read')).filter((r) => (r.detail as Row).result === 'permission_denied');
    expect(refused.length).toBeGreaterThanOrEqual(3);

    // (c) `explorer.investigate` goes: the stored locations stay as references and are shown as «권한 없음», and writes are refused.
    await revokeCapabilityGrant(dbHandle, grants.get('explorer.investigate') as string, adminId);
    const after = await query('logExplorer.investigationDetail', { investigationId });
    expect(after.data).toMatchObject({ canInvestigate: false });
    expect(after.data.evidence.map((e: { state: Row }) => e.state)).toEqual([
      { code: 'no_access', reason: 'capability_lost' },
      { code: 'no_access', reason: 'capability_lost' },
    ]);
    const writeAfter = await act('evidenceAdd', { id: investigationId, ref: REF(7) }, { expectedVersion: version });
    expect(writeAfter.outcome).not.toBe('ok');
    // The handoff has its own capability (api/log-explorer.md: `explorer.handoff` held AND the receiver's right): revoking it closes the handoff.
    await revokeCapabilityGrant(dbHandle, grants.get('explorer.handoff') as string, adminId);
    const handoffAfter = await act('evidenceHandoff', { id: investigationId, refs: [REF(3)], target: { kind: 'round', roundId } }, { expectedVersion: version });
    expect(handoffAfter.outcome).not.toBe('ok');
    expect((await query('logExplorer.investigationDetail', { investigationId })).data.handoff).toEqual({ round: false, knowledgeDraft: false });
    expect((await roundDetail()).evidenceRefs).toHaveLength(2); // what the Round already holds is the receiver's data, unchanged

    // (d) `explorer.export` goes: the export token and the session are refused on the next call, before anything about the Source is learned.
    await revokeCapabilityGrant(dbHandle, grants.get('explorer.export') as string, adminId);
    for (const headers of [bearer(exportToken.value), cookieHeader(analyst.cookie)]) {
      const refusedExport = await exportCall(headers);
      expect(refusedExport.statusCode).toBe(403);
      expect(refusedExport.json<{ code: string }>().code).toBe('explorer.forbidden');
    }

    // 9. Leak boundary: nothing the Source returned is in any stored or audited row of the chain.
    const dump = JSON.stringify([
      (await sql('select * from core.audit_log where actor_id = $1', [analyst.id])).rows,
      (await sql('select * from log_explorer.investigation where owner_actor_id = $1', [analyst.id])).rows,
      (await sql('select * from log_lifecycle.round_evidence_ref where round_id = $1', [roundId])).rows,
      (await sql('select * from knowledge.draft_revision where author_actor_id = $1', [analyst.id])).rows,
    ]);
    expect(dump).toContain(investigationId); // positive control: the dump really holds the chain's rows
    expect(dump).toContain('explorer.evidence_handed_off');
    for (const text of seenText) expect(dump, `source text leaked: ${text.slice(0, 20)}`).not.toContain(text);
    expect(synthetic.sampleSet.sourceOwner).toBe(SET.sourceOwner);
  }, 120_000);
});
