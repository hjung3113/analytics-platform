// #1450 h — the log-lifecycle slice as ONE chain over the real HTTP surface, real DB, no mocked auth:
//   admin issues a service token (`validation.worker`) → a human opens a Round and registers a validation request →
//   the reference worker claims, heartbeats and submits with the token → the server computes `verdict` → the Round
//   reads show it → a session user holding `lifecycle.gate.decide` records the Gate decision with the evidence
//   snapshot → the project stage moves; the append-only events and audit rows exist.
// The seams only: the per-node behaviour (queue rules, Gate rules, run window, excerpts …) is pinned by
// `request-queue.integration.test.ts` and `gate-decision.integration.test.ts`; this file does not repeat them.
// The worker is the 합성 fixture `tooling/scripts/validation-worker-mock.mjs` (it invents rule results from the sample
// list, calls no Validator and no LLM); nothing here is evidence of an in-house Validator integration.
// The browser-visible half is covered by the mock E2E `log-lifecycle screens`, not here.
// Throwaway DB only: `pnpm --filter @ap/platform-api test:integration` (app as platform_app, fixtures as platform_migrate).
// Select with `-t "contract chain"`.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMockWorker } from '../../../../../../tooling/scripts/validation-worker-mock.mjs';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { sampleManifestDigest } from '../domain/sample-set.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `CHN${randomUUID().slice(0, 6).toUpperCase()}`;
const Q = '/api/v1/validation-queue';
const SATURDAY_NOON = new Date('2026-11-14T12:00:00+09:00'); // inside the default run window (weekend, Asia/Seoul)

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
interface Wire {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  body: any;
}
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log-lifecycle contract chain (#1450 h)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let developer: Person; // lifecycle.project.manage + lifecycle.round.manage: opens the Round, registers the request
  let decider: Person; // lifecycle.gate.decide
  let workerActor = '';
  let otherWorkerActor = '';
  let vendorId = '';
  const actorIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function person(roleLevel: 'admin' | 'developer'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }
  const grant = (who: Person, capability: string) =>
    sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [WORKSPACE_ID, who.id, capability, admin.id]);
  const systemActor = async (label: string) => {
    const externalId = `${TAG}-${label}`;
    const { rows } = await sql(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`],
    );
    actorIds.push(rows[0].id as string);
    return rows[0].id as string;
  };

  async function act(action: string, input: Record<string, unknown>, who: Person | { token: string }, opts: { expectedVersion?: string; key?: string } = {}): Promise<Answer> {
    const headers =
      'token' in who
        ? { 'content-type': 'application/json', ...bearer(who.token) }
        : { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers,
      payload: JSON.stringify({ action: `logLifecycle.${action}`, context: {}, input, idempotencyKey: opts.key ?? randomUUID(), ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }) }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function read(endpoint: string, params: Record<string, unknown>, who: Person | { token: string }) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...('token' in who ? bearer(who.token) : cookieHeader(who.cookie)) },
      payload: JSON.stringify({ endpoint: `logLifecycle.${endpoint}`, context: {}, params }),
    });
  }
  const readOk = async (endpoint: string, params: Record<string, unknown>, who: Person) => {
    const res = await read(endpoint, params, who);
    expect(res.statusCode, res.body).toBe(200);
    const answer = res.json<Answer>();
    expect(answer.outcome, res.body).toBe('ok');
    return answer.data;
  };
  /** The worker's transport: the real Fastify app over `app.inject` with a Bearer token. */
  const sendAs = (token: string) => async (method: string, path: string, body: unknown): Promise<Wire> => {
    const res = await app.inject({ method: method as 'POST', url: path, headers: { 'content-type': 'application/json', ...bearer(token) }, payload: JSON.stringify(body ?? {}) });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  const issueServiceToken = async (actorId: string, scopes: string[]) => {
    const res = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-svc-${n++}`, scopes, actorId } });
    expect(res.statusCode, res.body).toBe(201);
    return { token: res.json<{ token: string }>().token, id: res.json<{ item: { id: string } }>().item.id };
  };
  const catalog = async (table: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: WORKSPACE_ID, code, code_key: toCodeKey(code), name: code, created_by: admin.id, updated_by: admin.id, ...extra };
    const { rows } = await sql(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols));
    return rows[0].id as string;
  };
  const audit = async (subjectId: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [subjectId])).rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => SATURDAY_NOON });
    await app.ready();
    admin = await person('admin');
    developer = await person('developer');
    decider = await person('developer');
    await grant(developer, 'lifecycle.project.manage');
    await grant(developer, 'lifecycle.round.manage');
    await grant(decider, 'lifecycle.gate.decide');
    workerActor = await systemActor('worker');
    otherWorkerActor = await systemActor('worker-other');
    vendorId = await catalog('vendor', `${TAG}-v`);
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const [table, trigger] of [
        ['log_lifecycle.gate_decision', 'gate_decision_append_only'],
        ['log_lifecycle.development_event', 'development_event_append_only'],
        ['log_lifecycle.rule_result_evidence', 'rule_result_evidence_append_only'],
      ] as const) {
        await client.query(`alter table ${table} disable trigger ${trigger}`);
      }
      await client.query('delete from log_lifecycle.gate_decision where actor_id = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.development_event where actor_id = any($1)', [actorIds]);
      const requests = '(select id from log_lifecycle.execution_request where requested_by_actor_id = any($1))';
      const attempts = `(select id from log_lifecycle.execution_attempt where request_id in ${requests})`;
      await client.query(`delete from log_lifecycle.rule_result_evidence where rule_result_id in (select id from log_lifecycle.rule_result where attempt_id in ${attempts})`, [actorIds]);
      await client.query(`delete from log_lifecycle.rule_result where attempt_id in ${attempts}`, [actorIds]);
      await client.query(`delete from log_lifecycle.execution_attempt where request_id in ${requests}`, [actorIds]);
      await client.query('delete from log_lifecycle.execution_request where requested_by_actor_id = any($1)', [actorIds]);
      await client.query('alter table log_lifecycle.gate_decision enable trigger gate_decision_append_only');
      await client.query('alter table log_lifecycle.development_event enable trigger development_event_append_only');
      await client.query('alter table log_lifecycle.rule_result_evidence enable trigger rule_result_evidence_append_only');
      await client.query('delete from log_lifecycle.validation_round where created_by = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.development_project where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from knowledge.equipment_model where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from knowledge.vendor where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from core.api_tokens where workspace_id = $1 and (created_by = any($2) or actor_id = any($2))', [WORKSPACE_ID, actorIds]);
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

  it('contract chain: service token → claim → heartbeat → result → verdict → Round read → session Gate → stage + events + audit', async () => {
    await sql('delete from core.rate_limits');
    await sql('delete from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
    // A request left by another suite would be claimed first: end every open one of the workspace.
    await sql(
      `update log_lifecycle.execution_request set state = 'cancelled', claimed_by_actor_id = null, lease_expires_at = null, ended_at = now(), row_version = row_version + 1
        where workspace_id = $1 and state in ('queued','claimed')`,
      [WORKSPACE_ID],
    );

    // 1. An admin session issues the service tokens through the real endpoint (ADR-0116): the one scope `validation.worker`.
    const worker = await issueServiceToken(workerActor, ['validation.worker']);
    const otherWorker = await issueServiceToken(otherWorkerActor, ['validation.worker']);

    // 2. A human opens the Round with an ordered sample list and registers the request (menu-action, idempotencyKey).
    const modelId = await catalog('equipment_model', `${TAG}-m`, { vendor_id: vendorId });
    const project = await act('projectCreate', { modelId, kind: 'new', ownerActorId: developer.id }, developer);
    expect(project.outcome, JSON.stringify(project)).toBe('ok');
    const projectId = project.data.projectId as string;
    const sampleSet = {
      files: [1, 2].map((order) => ({ fileRef: `s3://${TAG}/chain-${order}.log`, order, sha256: String(order).repeat(64) })),
      sourceOwner: `${TAG}-fab`,
    };
    const round = await act('roundOpen', { projectId, sampleSet }, developer);
    expect(round.outcome, JSON.stringify(round)).toBe('ok');
    const roundId = round.data.roundId as string;
    const key = randomUUID();
    const registered = await act('requestCreate', { roundId, priority: 2 }, developer, { key });
    expect(registered.outcome, JSON.stringify(registered)).toBe('ok');
    const requestId = registered.data.requestId as string;
    const replay = await act('requestCreate', { roundId, priority: 2 }, developer, { key });
    expect(replay.data.requestId).toBe(requestId); // the same idempotencyKey answers the same request
    expect((await sql('select count(*)::int as n from log_lifecycle.execution_request where round_id = $1', [roundId])).rows[0]?.n).toBe(1);

    // 3. Boundaries before the claim: a human session cannot claim; no credentials; the token is not a human.
    const asHuman = await app.inject({ method: 'POST', url: `${Q}/claim`, headers: cookieHeader(developer.cookie), payload: {} });
    expect(asHuman.statusCode).toBe(403);
    expect(asHuman.json().code).toBe('permission.denied');
    expect((await app.inject({ method: 'POST', url: `${Q}/claim`, payload: {} })).statusCode).toBe(401);
    const tokenRead = await read('roundDetail', { roundId }, { token: worker.token });
    expect(tokenRead.statusCode, tokenRead.body).toBe(200);
    expect(tokenRead.json<Answer>().outcome).toBe('forbidden'); // scope ∩ permission: `validation.worker` is no `platform:view`
    expect(tokenRead.body).not.toContain(sampleSet.files[0]?.fileRef);

    // 4. The reference worker loop with the token: claim → heartbeat → result. A lease held by another worker is refused
    //    when it tries to submit in the middle (the interceptor runs before the real result call).
    const calls: string[] = [];
    let foreignResult: Wire | undefined;
    const realSend = sendAs(worker.token);
    const send = async (method: string, path: string, body: unknown): Promise<Wire> => {
      calls.push(path.replace(requestId, ':id').replace(Q, ''));
      if (path.endsWith('/result')) {
        const b = body as { attemptNo: number; inputManifestDigest: string };
        foreignResult = await sendAs(otherWorker.token)('POST', path, { attemptNo: b.attemptNo, inputManifestDigest: b.inputManifestDigest, results: [{ ruleId: 'X', result: 'PASS', required: true }] });
      }
      return realSend(method, path, body);
    };
    const run = await runMockWorker({ send, mode: 'pass', heartbeats: 1 });
    expect(run.claimed, JSON.stringify(run)).toBe(true);
    expect(calls).toEqual(['/claim', '/requests/:id/heartbeat', '/requests/:id/result']);
    expect(run.request.id).toBe(requestId);
    expect(foreignResult?.status).toBe(409);
    expect(foreignResult?.body.code).toBe('queue.lease_lost');
    expect(run.result?.status, JSON.stringify(run.result)).toBe(200);
    expect(run.result?.body).toMatchObject({ requestId, attemptNo: 1, state: 'succeeded', verdict: 'pass', ruleCount: 2 });

    // 5. The verdict is the server's: the attempt row carries it, computed from the rule results and the manifest digest.
    const attemptRow = (await sql('select * from log_lifecycle.execution_attempt where request_id = $1', [requestId])).rows[0] as Row;
    expect(attemptRow).toMatchObject({ outcome: 'succeeded', verdict: 'pass', worker_actor_id: workerActor, input_manifest_digest: sampleManifestDigest(sampleSet), result_digest: run.result?.body.resultDigest });
    const attemptId = attemptRow.id as string;

    // 6. A second submit of the same body is the same 200 and writes nothing; a changed body is a stale write.
    const sent = run.resultBody as { results: unknown[] };
    const again = await sendAs(worker.token)('POST', `${Q}/requests/${requestId}/result`, sent);
    expect(again.status).toBe(200);
    expect(again.body.resultDigest).toBe(run.result?.body.resultDigest);
    expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where attempt_id = $1', [attemptId])).rows[0]?.n).toBe(2);
    expect((await sql('select count(*)::int as n from log_lifecycle.execution_attempt where request_id = $1', [requestId])).rows[0]?.n).toBe(1);
    const changed = await sendAs(worker.token)('POST', `${Q}/requests/${requestId}/result`, { ...sent, results: sent.results.slice(0, 1) });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('conflict.stale_write');

    // 7. The human reads show the result: the Round list and the request detail carry the verdict; the rule results page.
    const rounds = await readOk('rounds', { projectId }, developer);
    expect(rounds.rows[0]).toMatchObject({ id: roundId, validation: 'pass', gateDecision: null });
    const detail = await readOk('requestDetail', { requestId }, developer);
    expect(detail.attempts[0]).toMatchObject({ id: attemptId, verdict: 'pass', manifestMatches: true });
    expect(detail.state).toBe('succeeded');
    const results = await readOk('ruleResults', { attemptId }, developer);
    expect(results.total).toBe(2);
    expect(results.rows.map((r: Row) => r.result)).toEqual(['PASS', 'PASS']);
    const roundDetail = await readOk('roundDetail', { roundId }, decider);
    expect(roundDetail.gateAvailability.decisions.approved.allowed).toBe(true);

    // 8. The same token cannot decide a Gate (session-only): refused, one denial audit row for the token, nothing written.
    const projectVersion = String((await readOk('projectDetail', { projectId }, decider)).version);
    const byToken = await act('gateDecide', { roundId, targetStage: 'kickoff', decision: 'approved', reason: 'by token' }, { token: worker.token }, { expectedVersion: projectVersion });
    expect(byToken.outcome).toBe('forbidden');
    const denied = await sql(`select 1 from core.audit_log where event_type = 'api_token.session_required_denied' and detail::text like $1`, [`%${worker.id}%`]);
    expect(denied.rows.length).toBeGreaterThan(0);
    expect((await sql('select count(*)::int as n from log_lifecycle.gate_decision where round_id = $1', [roundId])).rows[0]?.n).toBe(0);
    expect((await sql('select stage from log_lifecycle.development_project where id = $1', [projectId])).rows[0]?.stage).toBe('registered');

    // 9. A session user holding lifecycle.gate.decide records the decision; the stage moves in the same transaction.
    const decided = await act('gateDecide', { roundId, targetStage: 'kickoff', decision: 'approved', reason: 'all synthetic rules pass' }, decider, { expectedVersion: projectVersion });
    expect(decided.outcome, JSON.stringify(decided)).toBe('ok');
    expect(decided.data).toMatchObject({ stage: 'kickoff', selfApproved: false });
    const after = (await sql('select stage, row_version from log_lifecycle.development_project where id = $1', [projectId])).rows[0] as { stage: string; row_version: number };
    expect(after.stage).toBe('kickoff');
    expect(String(after.row_version)).toBe(decided.data.version);

    // 10. The evidence snapshot freezes the attempt, its verdict and digests; the row is the human's, apart from the verdict.
    const [gate] = (await sql('select * from log_lifecycle.gate_decision where round_id = $1', [roundId])).rows as Row[];
    expect(gate).toMatchObject({ decision: 'approved', from_stage: 'registered', target_stage: 'kickoff', actor_id: decider.id, self_approved: false, exception: null });
    expect(gate?.basis).toMatchObject({
      version: 1,
      decisiveAttemptId: attemptId,
      decisiveVerdict: 'pass',
      sampleManifestDigest: sampleManifestDigest(sampleSet),
      attempts: [{ attemptId, requestId, verdict: 'pass', inputManifestDigest: sampleManifestDigest(sampleSet) }],
    });
    expect((await sql('select verdict from log_lifecycle.execution_attempt where id = $1', [attemptId])).rows[0]?.verdict).toBe('pass'); // the Gate never rewrites a verdict
    const readBack = await readOk('roundDetail', { roundId }, developer);
    expect(readBack.gateDecisions).toHaveLength(1);
    expect(readBack.gateDecisions[0]).toMatchObject({ decision: 'approved', targetStage: 'kickoff', decidedBy: { id: decider.id }, basisSummary: { attemptCount: 1, decisiveVerdict: 'pass' } });
    expect((await readOk('projectDetail', { projectId }, developer)).stage).toBe('kickoff');

    // 11. Append-only events and audit rows exist; the worker's rows name the token's Actor and the token id.
    const events = (await sql('select kind, actor_id, after from log_lifecycle.development_event where project_id = $1 order by seq', [projectId])).rows as Row[];
    expect(events.map((e) => e.kind)).toEqual(['created', 'gate_decided']);
    expect(events[1]).toMatchObject({ actor_id: decider.id, after: { stage: 'kickoff', decision: 'approved', gateDecisionId: gate?.id } });
    const requestAudit = await audit(requestId);
    expect(requestAudit.map((e) => e.event_type)).toEqual(['lifecycle.request.created', 'lifecycle.request.claimed', 'lifecycle.request.result_submitted']);
    expect(requestAudit[0]).toMatchObject({ actor_id: developer.id });
    for (const row of requestAudit.slice(1)) {
      expect(row.actor_id).toBe(workerActor);
      expect(row.detail.api_token_id).toBe(worker.id);
    }
    const gateAudit = await audit(roundId);
    const decidedAudit = gateAudit.find((e) => e.event_type === 'lifecycle.gate.decided');
    expect(decidedAudit).toMatchObject({ actor_id: decider.id, subject_type: 'validation_round' });
    expect(decidedAudit?.detail.api_token_id).toBeUndefined();
    expect(JSON.stringify(decidedAudit?.detail)).not.toContain('all synthetic rules pass'); // the reason never enters the audit

    // 12. A revoked token is refused at the very next worker call; the request it held keeps its lease untouched.
    const second = await act('requestCreate', { roundId, priority: 2 }, developer);
    expect(second.outcome, JSON.stringify(second)).toBe('ok'); // the Round is still open (the Gate does not close it)
    const secondId = second.data.requestId as string;
    const claimed = await sendAs(worker.token)('POST', `${Q}/claim`, {});
    expect(claimed.status).toBe(200);
    expect(claimed.body.request.id).toBe(secondId);
    const revoke = await app.inject({ method: 'POST', url: `/api-tokens/service/${worker.id}/revoke`, headers: { ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf }, payload: {} });
    expect(revoke.statusCode, revoke.body).toBe(200);
    for (const [path, body] of [
      [`/requests/${secondId}/heartbeat`, { attemptNo: 1 }],
      [`/requests/${secondId}/result`, { attemptNo: 1, inputManifestDigest: claimed.body.request.sampleManifestDigest, results: [] }],
      ['/claim', {}],
    ] as const) {
      const refused = await sendAs(worker.token)('POST', `${Q}${path}`, body);
      expect(refused.status, path).toBe(401);
    }
    expect((await sql('select state, claimed_by_actor_id from log_lifecycle.execution_request where id = $1', [secondId])).rows[0]).toMatchObject({ state: 'claimed', claimed_by_actor_id: workerActor });
    expect((await sql('select count(*)::int as n from log_lifecycle.execution_attempt where request_id = $1 and result_digest is not null', [secondId])).rows[0]?.n).toBe(0);
  }, 60_000);
});
