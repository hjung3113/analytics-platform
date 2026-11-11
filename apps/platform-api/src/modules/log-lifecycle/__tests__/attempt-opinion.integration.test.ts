// #1778 a — attempt opinions (ADR-0117 amendment 2): the worker write, the idempotency by submissionId, the declared scale, the reads,
// the per-attempt caps, the DB walls, and the proof that an opinion changes no verdict, required-rule state, Gate availability or
// regression comparison. Through the real `buildServer` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs migration 0126 (`log_lifecycle.attempt_opinion`, `queue_settings.opinion_scale`).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { sampleManifestDigest } from '../domain/sample-set.js';
import { lifecycleSuiteResults } from '../suite-result-read-port.js';
import { defined } from '../../../test-support/defined.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `OP${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const Q = '/api/v1/validation-queue';
const SATURDAY_NOON = new Date('2026-11-14T12:00:00+09:00'); // inside the default run window
const SCALE = {
  grades: [
    { key: 'high', label: 'High' },
    { key: 'mid', label: 'Mid' },
    { key: 'low', label: 'Low' },
  ],
  marks: [{ key: 'flag', label: 'Flag' }],
};
const NOTE = 'ask the equipment owner about the retry NOTE-MARKER-9f3a';

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

const FILES = (n = 2) => Array.from({ length: n }, (_v, i) => ({ fileRef: `s3://${TAG}/f${i + 1}.log`, order: i + 1, sha256: H('a') }));
const SAMPLE = (n = 2) => ({ files: FILES(n), sourceOwner: `${TAG}-fab` });

describe.skipIf(!runIntegration)('attempt opinions (#1778 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let owner: Person;
  let systemA = '';
  let systemB = '';
  let workerA = '';
  let workerB = '';
  let noScopeToken = '';
  let vendorId = '';
  const actorIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }
  async function act(action: string, input: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action: `logLifecycle.${action}`, context: {}, input, idempotencyKey: randomUUID() }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logLifecycle.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const post = (token: string | null, path: string, payload: unknown = {}, cookie?: string) =>
    app.inject({ method: 'POST', url: `${Q}${path}`, headers: token ? bearer(token) : cookie ? cookieHeader(cookie) : {}, payload: payload as object });
  const issueServiceToken = async (actorId: string, scopes: string[]) => {
    const res = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-svc-${n++}`, scopes, actorId } });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ token: string }>().token;
  };
  const catalog = async (table: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: WORKSPACE_ID, code, code_key: toCodeKey(code), name: code, created_by: admin.id, updated_by: admin.id, ...extra };
    const { rows } = await sql(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols));
    return rows[0].id as string;
  };
  const rule = (ruleId: string, result: string, required = true) => ({ ruleId, result, required });
  const fields = (res: { json: () => { detail?: { fields?: { path: (string | number)[]; code: string }[] } } }) =>
    (res.json().detail?.fields ?? []).map((f) => `${f.path.join('.')}:${f.code}`);
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as { event_type: string; subject_type: string; actor_id: string; detail: Row }[];
  const opinionRows = async (attemptId: string) =>
    (await sql('select * from log_lifecycle.attempt_opinion where attempt_id = $1 order by created_at, id', [attemptId])).rows as Row[];
  const setScale = async (scale: unknown) => {
    const a = await act('queueSettingsUpdate', { opinionScale: scale });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
  };

  /** A fresh model -> project -> open round -> request, claimed by workerA and finished with `rules`; returns the ids. */
  async function succeeded(rules: Row[] = [rule('R1', 'FAIL'), rule('R2', 'PASS'), rule('R3', 'WARN', false)]) {
    const modelId = await catalog('equipment_model', `${TAG}-m${n++}`, { vendor_id: vendorId });
    const p = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id });
    expect(p.outcome, JSON.stringify(p)).toBe('ok');
    const sample = SAMPLE();
    const r = await act('roundOpen', { projectId: p.data.projectId, sampleSet: sample });
    expect(r.outcome, JSON.stringify(r)).toBe('ok');
    const created = await act('requestCreate', { roundId: r.data.roundId, priority: 1 });
    expect(created.outcome, JSON.stringify(created)).toBe('ok');
    const requestId = created.data.requestId as string;
    const claimedRes = await post(workerA, '/claim');
    expect(claimedRes.statusCode, claimedRes.body).toBe(200);
    const claimed = claimedRes.json();
    expect(claimed.request.id).toBe(requestId);
    const result = await post(workerA, `/requests/${requestId}/result`, { attemptNo: claimed.attempt.attemptNo, inputManifestDigest: sampleManifestDigest(sample), results: rules });
    expect(result.statusCode, result.body).toBe(200);
    return { requestId, roundId: r.data.roundId as string, attemptId: claimed.attempt.id as string, attemptNo: claimed.attempt.attemptNo as number, verdict: result.json().verdict as string };
  }
  const opinionsPath = (requestId: string, attemptNo: number | string = 1) => `/requests/${requestId}/attempts/${attemptNo}/opinions`;
  const item = (over: Row = {}) => ({ itemKey: 'R1', grade: 'high', ...over });
  const write = (requestId: string, body: unknown, attemptNo: number | string = 1, token = workerA) => post(token, opinionsPath(requestId, attemptNo), body);
  const ruleResultsOf = async (attemptId: string, params: Row = {}) => (await read('ruleResults', { attemptId, ...params })).data as { total: number; rows: Row[] };

  beforeEach(async () => {
    // Requests left by an earlier test would be claimed first: end every open one (the guard allows queued/claimed -> cancelled).
    await sql('delete from core.rate_limits');
    await sql(
      `update log_lifecycle.execution_request set state = 'cancelled', claimed_by_actor_id = null, lease_expires_at = null, ended_at = now(), row_version = row_version + 1
        where workspace_id = $1 and state in ('queued','claimed')`,
      [WORKSPACE_ID],
    );
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => SATURDAY_NOON });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    owner = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'lifecycle.project.manage', null, $3)`,
      [WORKSPACE_ID, owner.id, admin.id],
    );
    systemA = (await sql("select id from core.actors where workspace_id = $1 and external_id = 'system'", [WORKSPACE_ID])).rows[0].id as string;
    systemB = (
      await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'user','system') returning id`, [WORKSPACE_ID, `${TAG}-system-b`, `${TAG}-system-b@local`])
    ).rows[0].id as string;
    actorIds.push(systemB);
    vendorId = await catalog('vendor', `${TAG}-v`);
    workerA = await issueServiceToken(systemA, ['validation.worker']);
    workerB = await issueServiceToken(systemB, ['validation.worker']);
    noScopeToken = await issueServiceToken(systemA, ['lifecycle.round.manage']);
    await sql('delete from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
  }, 60_000);

  afterAll(async () => {
    const owned = `(select id from log_lifecycle.execution_request where requested_by_actor_id = any($1) or workspace_id = $2)`;
    // The opinion table refuses every DELETE (guard trigger): fixtures are removed with the trigger off, before their attempts and rule results.
    const cleaner = await migrate.pool.connect();
    try {
      await cleaner.query('begin');
      await cleaner.query('alter table log_lifecycle.attempt_opinion disable trigger attempt_opinion_append_only');
      await cleaner.query('delete from log_lifecycle.attempt_opinion where workspace_id = $1', [WORKSPACE_ID]);
      await cleaner.query('alter table log_lifecycle.attempt_opinion enable trigger attempt_opinion_append_only');
      await cleaner.query('commit');
    } catch (error) {
      await cleaner.query('rollback');
      throw error;
    } finally {
      cleaner.release();
    }
    await sql(`delete from log_lifecycle.rule_result where workspace_id = $1`, [WORKSPACE_ID]);
    await sql(`delete from log_lifecycle.execution_attempt where request_id in ${owned}`, [actorIds, WORKSPACE_ID]);
    await sql(`delete from log_lifecycle.execution_request where id in ${owned}`, [actorIds, WORKSPACE_ID]);
    await sql('delete from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_lifecycle.development_event disable trigger development_event_append_only');
      await client.query('delete from log_lifecycle.development_event where actor_id = any($1)', [actorIds]);
      await client.query('alter table log_lifecycle.development_event enable trigger development_event_append_only');
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

  describe('the declared scale (queueSettingsUpdate.opinionScale, logLifecycle.opinionScale)', () => {
    it('is empty by default: a write is refused as opinion.scale_undeclared and nothing is stored', async () => {
      const s = await succeeded();
      expect((await read('opinionScale', {}, user)).data).toEqual({ grades: [], marks: [] });
      const res = await write(s.requestId, { submissionId: 's1', opinions: [item()] });
      expect(res.statusCode, res.body).toBe(422);
      expect(fields(res)).toEqual(['opinions:opinion.scale_undeclared']);
      expect(await opinionRows(s.attemptId)).toHaveLength(0);
    });

    it('an admin declares it whole; it is audited by field name only; any viewer reads it back in order', async () => {
      await setScale(SCALE);
      expect((await read('opinionScale', {}, user)).data).toEqual(SCALE);
      const settingsAudit = (await sql("select detail from core.audit_log where event_type = 'lifecycle.queue_settings.updated' and detail::text like '%opinionScale%' order by created_at desc limit 1")).rows[0]?.detail;
      expect(settingsAudit).toEqual({ changed: ['opinionScale'] });
      expect(JSON.stringify(settingsAudit)).not.toContain('High');
      // The same declaration again changes nothing and writes no audit row.
      const before = (await sql("select count(*)::int as n from core.audit_log where event_type = 'lifecycle.queue_settings.updated'")).rows[0].n;
      expect((await act('queueSettingsUpdate', { opinionScale: SCALE })).data).toEqual({ changed: [] });
      expect((await sql("select count(*)::int as n from core.audit_log where event_type = 'lifecycle.queue_settings.updated'")).rows[0].n).toBe(before);
      // Replace whole: the old entries are gone.
      await setScale({ grades: [{ key: 'only', label: '' }] });
      expect((await read('opinionScale', {}, user)).data).toEqual({ grades: [{ key: 'only', label: '' }], marks: [] });
      await setScale(SCALE);
    });

    it.each([
      ['a duplicate key', { grades: [{ key: 'a', label: '' }, { key: 'a', label: '' }] }, 'duplicate_key'],
      ['13 marks', { marks: Array.from({ length: 13 }, (_, i) => ({ key: `m${i}`, label: '' })) }, 'too_many'],
      ['an uppercase key', { grades: [{ key: 'High', label: '' }] }, 'malformed'],
      ['not an object', 'high', 'malformed'],
    ])('refuses %s with a field error and keeps the stored scale', async (_label, scale, code) => {
      await setScale(SCALE);
      const a = await act('queueSettingsUpdate', { opinionScale: scale });
      expect(a.outcome).toBe('invalid');
      expect(a.fieldErrors).toEqual([{ path: ['opinionScale'], code }]);
      expect((await read('opinionScale', {})).data).toEqual(SCALE);
    });

    it('only an admin session changes it', async () => {
      await setScale(SCALE);
      const a = await act('queueSettingsUpdate', { opinionScale: { grades: [{ key: 'x', label: '' }] } }, owner);
      expect(a.outcome).toBe('forbidden');
      expect((await read('opinionScale', {})).data).toEqual(SCALE);
    });
  });

  describe('the worker write (POST …/attempts/:attemptNo/opinions)', () => {
    beforeAll(async () => setScale(SCALE));

    it('refuses a cookie session, no credentials and a token without validation.worker', async () => {
      const s = await succeeded();
      const body = { submissionId: 's1', opinions: [item()] };
      const human = await post(null, opinionsPath(s.requestId), body, admin.cookie);
      expect(human.statusCode).toBe(403);
      expect(human.json().code).toBe('permission.denied');
      expect((await post(null, opinionsPath(s.requestId), body)).statusCode).toBe(401);
      const noScope = await write(s.requestId, body, 1, noScopeToken);
      expect(noScope.statusCode).toBe(403);
      expect(noScope.json().code).toBe('permission.denied');
      expect(await opinionRows(s.attemptId)).toHaveLength(0);
      // A personal token cannot carry the scope at all.
      const personal = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(owner.cookie), payload: { name: 'p', scopes: ['validation.worker'] } });
      expect(personal.statusCode).toBe(422);
      expect(personal.json().detail.fields).toEqual([{ path: ['scopes', 0], code: 'service_only' }]);
    });

    it('stores a linked and an unlinked item; links only a rule result of the same attempt; audits counts without text', async () => {
      const s = await succeeded();
      const other = await succeeded([rule('OTHER', 'PASS')]);
      const res = await write(s.requestId, {
        submissionId: 's1',
        opinions: [
          item({ itemKey: 'R1', mark: 'flag', note: NOTE, evidence: [{ fileRef: SAMPLE().files[0]?.fileRef, line: 7, fileSha256: H('b') }], inputRevision: 'prompt-3', producer: 'in-house-llm' }),
          item({ itemKey: 'FOUND-BY-LLM', grade: 'mid', note: 'no rule covers this' }),
          item({ itemKey: 'OTHER', grade: 'low' }), // a rule id of ANOTHER attempt is not a link
        ],
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toEqual({ requestId: s.requestId, attemptNo: 1, recorded: 3, duplicate: 0 });
      const rows = await opinionRows(s.attemptId);
      expect(rows).toHaveLength(3);
      const byKey = Object.fromEntries(rows.map((r) => [r.item_key as string, r]));
      const r1 = (await sql("select id from log_lifecycle.rule_result where attempt_id = $1 and rule_id = 'R1'", [s.attemptId])).rows[0].id;
      expect(byKey.R1).toMatchObject({ rule_result_id: r1, grade: 'high', mark: 'flag', note: NOTE, input_revision: 'prompt-3', producer: 'in-house-llm', actor_id: systemA, submission_id: 's1' });
      expect(byKey.R1?.token_id).toBeTruthy();
      expect(byKey.R1?.evidence).toEqual([{ fileRef: SAMPLE().files[0]?.fileRef, line: 7, fileSha256: H('b') }]);
      expect(byKey['FOUND-BY-LLM']?.rule_result_id).toBeNull();
      expect(byKey.OTHER?.rule_result_id).toBeNull();
      expect(await opinionRows(other.attemptId)).toHaveLength(0);
      const events = (await audit(s.requestId)).filter((e) => e.event_type === 'lifecycle.opinion.recorded');
      expect(events).toHaveLength(1);
      const event = defined(events[0], 'the opinion audit row');
      expect(event).toMatchObject({ event_type: 'lifecycle.opinion.recorded', subject_type: 'execution_request', actor_id: systemA });
      // A token call also carries the token id (api_token_id); the detail never has text.
      expect(Object.keys(event.detail as object).sort()).toEqual(['api_token_id', 'attemptNo', 'recorded']);
      expect(event.detail).toMatchObject({ attemptNo: 1, recorded: 3 });
      const allAudit = (await sql('select detail::text as d, summary from core.audit_log where workspace_id = $1', [WORKSPACE_ID])).rows;
      expect(JSON.stringify(allAudit)).not.toContain('NOTE-MARKER');
    });

    it('any worker token of the workspace may write, not only the one that claimed the attempt', async () => {
      const s = await succeeded();
      const res = await write(s.requestId, { submissionId: 'b1', opinions: [item()] }, 1, workerB);
      expect(res.statusCode, res.body).toBe(200);
      expect((await opinionRows(s.attemptId))[0]).toMatchObject({ actor_id: systemB });
    });

    it('control characters are removed from the stored text', async () => {
      const s = await succeeded();
      const res = await write(s.requestId, { submissionId: 'c1', opinions: [item({ note: 'a\u0000b\u0007c\nd', inputRevision: 'r\u0001v' })] });
      expect(res.statusCode, res.body).toBe(200);
      expect((await opinionRows(s.attemptId))[0]).toMatchObject({ note: 'abc\nd', input_revision: 'rv' });
    });

    it('answers 404 for an unknown request or attempt and 409 conflict.attempt_not_succeeded for a running or failed one', async () => {
      const s = await succeeded();
      const body = { submissionId: 's1', opinions: [item()] };
      expect((await write(randomUUID(), body)).statusCode).toBe(404);
      expect((await write(s.requestId, body, 2)).statusCode).toBe(404);
      expect((await write(s.requestId, body, 'abc')).statusCode).toBe(422);
      expect((await write('not-a-uuid', body)).statusCode).toBe(422);
      // A claimed (running) attempt.
      const modelId = await catalog('equipment_model', `${TAG}-m${n++}`, { vendor_id: vendorId });
      const p = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id });
      const r = await act('roundOpen', { projectId: p.data.projectId, sampleSet: SAMPLE() });
      const created = await act('requestCreate', { roundId: r.data.roundId, priority: 1 });
      const claimed = (await post(workerA, '/claim')).json();
      expect(claimed.request.id).toBe(created.data.requestId);
      const running = await write(created.data.requestId, body);
      expect(running.statusCode).toBe(409);
      expect(running.json().code).toBe('conflict.attempt_not_succeeded');
      // The same attempt after the worker failed it.
      expect((await post(workerA, `/requests/${created.data.requestId}/fail`, { attemptNo: 1 })).statusCode).toBe(200);
      const failed = await write(created.data.requestId, body);
      expect(failed.statusCode).toBe(409);
      expect(failed.json().code).toBe('conflict.attempt_not_succeeded');
      expect((await sql('select count(*)::int as n from log_lifecycle.attempt_opinion where workspace_id = $1 and attempt_id = $2', [WORKSPACE_ID, claimed.attempt.id])).rows[0].n).toBe(0);
    });

    it.each([
      ['an undeclared grade', { itemKey: 'R1', grade: 'severe' }, 'opinions.0.grade:not_declared'],
      ['an undeclared mark', { itemKey: 'R1', grade: 'high', mark: 'star' }, 'opinions.0.mark:not_declared'],
      ['evidence outside the sample list', { itemKey: 'R1', grade: 'high', evidence: [{ fileRef: 's3://elsewhere/x.log', line: 1, fileSha256: H('a') }] }, 'opinions.0.evidence.0.fileRef:not_in_sample'],
      ['a platform token in the note', { itemKey: 'R1', grade: 'high', note: 'Authorization ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_' }, 'opinions.0.note:secret_detected'],
      ['a secret in the item key', { itemKey: 'api_key=abcdef123456', grade: 'high' }, 'opinions.0.itemKey:secret_detected'],
      ['a secret in the input revision', { itemKey: 'R1', grade: 'high', inputRevision: 'password: hunter2hunter2' }, 'opinions.0.inputRevision:secret_detected'],
      ['a secret in the producer', { itemKey: 'R1', grade: 'high', producer: 'AKIAABCDEFGHIJKLMNOP' }, 'opinions.0.producer:secret_detected'],
      ['a note over 1,000 characters', { itemKey: 'R1', grade: 'high', note: 'n'.repeat(1001) }, 'opinions.0.note:too_long'],
      ['an item key over 200 characters', { itemKey: 'k'.repeat(201), grade: 'high' }, 'opinions.0.itemKey:too_long'],
      ['an unknown field', { itemKey: 'R1', grade: 'high', verdict: 'pass' }, 'opinions.0.verdict:malformed'],
    ])('refuses %s with 422, field path and code, and stores nothing', async (_label, opinion, expected) => {
      const s = await succeeded();
      const res = await write(s.requestId, { submissionId: 'x1', opinions: [item({ itemKey: 'OK-ONE' }), opinion] });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json().code).toBe('validation.failed');
      expect(fields(res)).toContain(expected.replace('opinions.0', 'opinions.1'));
      expect(await opinionRows(s.attemptId)).toHaveLength(0);
      expect((await audit(s.requestId)).some((e) => e.event_type === 'lifecycle.opinion.recorded')).toBe(false);
    });

    it('refuses a body-level duplicate item key, 501 entries, no entries, a missing submissionId and a body verdict', async () => {
      const s = await succeeded();
      const cases: [string, unknown, string][] = [
        ['the same itemKey twice', { submissionId: 'x', opinions: [item(), item()] }, 'opinions.1.itemKey:duplicate'],
        ['501 entries', { submissionId: 'x', opinions: Array.from({ length: 501 }, (_, i) => item({ itemKey: `k${i}` })) }, 'opinions:too_many'],
        ['no entries', { submissionId: 'x', opinions: [] }, 'opinions:required'],
        ['no submissionId', { opinions: [item()] }, 'submissionId:required'],
        ['a submissionId over 200 characters', { submissionId: 's'.repeat(201), opinions: [item()] }, 'submissionId:too_long'],
        ['a verdict in the body', { submissionId: 'x', opinions: [item()], verdict: 'pass' }, 'verdict:malformed'],
      ];
      for (const [label, body, expected] of cases) {
        const res = await write(s.requestId, body);
        expect(res.statusCode, label).toBe(422);
        expect(fields(res), label).toContain(expected);
      }
      expect(await opinionRows(s.attemptId)).toHaveLength(0);
    });

    it('accepts exactly 500 entries in one call', async () => {
      const s = await succeeded();
      const res = await write(s.requestId, { submissionId: 'big', opinions: Array.from({ length: 500 }, (_, i) => item({ itemKey: `k${i}` })) });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ recorded: 500, duplicate: 0 });
    });
  });

  describe('idempotency by (attempt, actor, submissionId, itemKey)', () => {
    beforeAll(async () => setScale(SCALE));

    it('the same body again is the same answer counted in duplicate, with no new row and no new audit row', async () => {
      const s = await succeeded();
      const body = { submissionId: 'once', opinions: [item({ note: NOTE }), item({ itemKey: 'X', grade: 'low' })] };
      expect((await write(s.requestId, body)).json()).toMatchObject({ recorded: 2, duplicate: 0 });
      const again = await write(s.requestId, body);
      expect(again.statusCode, again.body).toBe(200);
      expect(again.json()).toEqual({ requestId: s.requestId, attemptNo: 1, recorded: 0, duplicate: 2 });
      expect(await opinionRows(s.attemptId)).toHaveLength(2);
      expect((await audit(s.requestId)).filter((e) => e.event_type === 'lifecycle.opinion.recorded')).toHaveLength(1);
      // A partly new body: the known item is a duplicate, the new one is recorded.
      const partly = await write(s.requestId, { submissionId: 'once', opinions: [item({ note: NOTE }), item({ itemKey: 'Y', grade: 'mid' })] });
      expect(partly.json()).toMatchObject({ recorded: 1, duplicate: 1 });
    });

    it('the same submissionId and item key with other content is 409 conflict.stale_write and nothing from the call is stored', async () => {
      const s = await succeeded();
      expect((await write(s.requestId, { submissionId: 'one', opinions: [item()] })).statusCode).toBe(200);
      const changed = await write(s.requestId, { submissionId: 'one', opinions: [item({ itemKey: 'NEW', grade: 'low' }), item({ grade: 'low' })] });
      expect(changed.statusCode).toBe(409);
      expect(changed.json().code).toBe('conflict.stale_write');
      expect(await opinionRows(s.attemptId)).toHaveLength(1);
      for (const change of [{ mark: 'flag' }, { note: 'other' }, { inputRevision: 'r2' }, { producer: 'p2' }, { evidence: [{ fileRef: SAMPLE().files[0]?.fileRef, line: 2, fileSha256: H('a') }] }]) {
        expect((await write(s.requestId, { submissionId: 'one', opinions: [item(change)] })).statusCode, JSON.stringify(change)).toBe(409);
      }
    });

    it('a correction is a new submissionId: A -> B -> A returns the current opinion to A, and resending the first changes nothing', async () => {
      const s = await succeeded();
      const current = async () => (await ruleResultsOf(s.attemptId)).rows.find((r) => r.ruleId === 'R1')?.opinion as Row;
      expect((await write(s.requestId, { submissionId: 'a-1', opinions: [item({ grade: 'high' })] })).json().recorded).toBe(1);
      expect((await current()).grade).toEqual({ key: 'high', label: 'High' });
      expect((await write(s.requestId, { submissionId: 'b-1', opinions: [item({ grade: 'low' })] })).json().recorded).toBe(1);
      expect((await current()).grade).toEqual({ key: 'low', label: 'Low' });
      expect((await write(s.requestId, { submissionId: 'a-2', opinions: [item({ grade: 'high' })] })).json().recorded).toBe(1);
      expect(await current()).toMatchObject({ grade: { key: 'high', label: 'High' }, count: 3 });
      const resend = await write(s.requestId, { submissionId: 'b-1', opinions: [item({ grade: 'low' })] });
      expect(resend.json()).toMatchObject({ recorded: 0, duplicate: 1 });
      expect((await current()).grade).toEqual({ key: 'high', label: 'High' });
      expect(await opinionRows(s.attemptId)).toHaveLength(3);
    });

    it('two concurrent identical submissions record once', async () => {
      const s = await succeeded();
      const body = { submissionId: 'race', opinions: [item()] };
      const [x, y] = await Promise.all([write(s.requestId, body), write(s.requestId, body)]);
      expect([x.statusCode, y.statusCode]).toEqual([200, 200]);
      expect(x.json().recorded + y.json().recorded).toBe(1);
      expect(x.json().duplicate + y.json().duplicate).toBe(1);
      expect(await opinionRows(s.attemptId)).toHaveLength(1);
    });

    it('another actor may use the same submissionId: it is a separate key', async () => {
      const s = await succeeded();
      expect((await write(s.requestId, { submissionId: 'same', opinions: [item()] }, 1, workerA)).json().recorded).toBe(1);
      expect((await write(s.requestId, { submissionId: 'same', opinions: [item({ grade: 'low' })] }, 1, workerB)).json().recorded).toBe(1);
    });
  });

  describe('per-attempt caps (2,000 rows, 256 KB of notes)', () => {
    beforeAll(async () => setScale(SCALE));
    const bulk = (attemptId: string, rows: number, note: string | null) =>
      sql(
        `insert into log_lifecycle.attempt_opinion (workspace_id, attempt_id, item_key, actor_id, submission_id, grade, note)
         select $1, $2, 'bulk-' || g, $3, 'bulk', 'high', $4 from generate_series(1, $5) g`,
        [WORKSPACE_ID, attemptId, systemB, note, rows],
      );

    it('the 2,000th row is accepted and the 2,001st is refused as too_many, nothing cut', async () => {
      const s = await succeeded();
      await bulk(s.attemptId, 1998, null);
      const tooMany = await write(s.requestId, { submissionId: 'cap', opinions: [item({ itemKey: 'a' }), item({ itemKey: 'b' }), item({ itemKey: 'c' })] });
      expect(tooMany.statusCode, tooMany.body).toBe(422);
      expect(fields(tooMany)).toEqual(['opinions:too_many']);
      expect(await opinionRows(s.attemptId)).toHaveLength(1998);
      const ok = await write(s.requestId, { submissionId: 'cap2', opinions: [item({ itemKey: 'a' }), item({ itemKey: 'b' })] });
      expect(ok.statusCode, ok.body).toBe(200);
      expect((await write(s.requestId, { submissionId: 'cap3', opinions: [item({ itemKey: 'z' })] })).statusCode).toBe(422);
      // A resend of an already stored submission is not a new row and still passes at the cap.
      expect((await write(s.requestId, { submissionId: 'cap2', opinions: [item({ itemKey: 'a' })] })).json()).toMatchObject({ recorded: 0, duplicate: 1 });
    });

    it('notes stop at 256 KB per attempt: the first byte over is too_long, the last byte under is accepted', async () => {
      const s = await succeeded();
      await bulk(s.attemptId, 262, 'x'.repeat(1000)); // 262,000 bytes; the limit is 262,144
      const over = await write(s.requestId, { submissionId: 'n1', opinions: [item({ note: 'y'.repeat(145) })] });
      expect(over.statusCode, over.body).toBe(422);
      expect(fields(over)).toEqual(['opinions:too_long']);
      const exact = await write(s.requestId, { submissionId: 'n2', opinions: [item({ note: 'y'.repeat(144) })] });
      expect(exact.statusCode, exact.body).toBe(200);
      const next = await write(s.requestId, { submissionId: 'n3', opinions: [item({ itemKey: 'more', note: 'z' })] });
      expect(next.statusCode).toBe(422);
    });

    it('the caps are per attempt: another attempt starts from zero', async () => {
      const full = await succeeded();
      await bulk(full.attemptId, 2000, null);
      const fresh = await succeeded();
      expect((await write(full.requestId, { submissionId: 'z', opinions: [item()] })).statusCode).toBe(422);
      expect((await write(fresh.requestId, { submissionId: 'z', opinions: [item()] })).statusCode).toBe(200);
    });
  });

  describe('reads', () => {
    beforeAll(async () => setScale(SCALE));

    it('with no opinion every read keeps its shape: opinion null, opinionCount 0, an empty opinion page, byte-identical rule fields', async () => {
      const s = await succeeded();
      const list = await ruleResultsOf(s.attemptId);
      expect(list.total).toBe(3);
      for (const row of list.rows) {
        expect(Object.keys(row).sort()).toEqual(['evidence', 'expected', 'hasExcerpt', 'id', 'observed', 'opinion', 'required', 'result', 'ruleId']);
        expect(row.opinion).toBeNull();
      }
      const detail = await read('requestDetail', { requestId: s.requestId });
      expect(detail.data.attempts.map((a: Row) => a.opinionCount)).toEqual([0]);
      expect((await read('opinions', { attemptId: s.attemptId })).data).toEqual({ total: 0, rows: [] });
      expect((await ruleResultsOf(s.attemptId, { opinionGrade: 'none' })).total).toBe(3);
    });

    it('lists the latest opinion per item beside the verdict without the note, and the opinion page carries the note newest first', async () => {
      const s = await succeeded();
      await write(s.requestId, { submissionId: 'a', opinions: [item({ grade: 'high', note: NOTE, mark: 'flag' }), item({ itemKey: 'UNLINKED', grade: 'low', note: 'second memo' })] });
      await write(s.requestId, { submissionId: 'b', opinions: [item({ grade: 'mid' })] });
      const list = await ruleResultsOf(s.attemptId);
      const r1 = list.rows.find((r) => r.ruleId === 'R1');
      expect(r1?.opinion).toMatchObject({ grade: { key: 'mid', label: 'Mid' }, mark: null, hasNote: false, count: 2 });
      expect(Number.isFinite(Date.parse((r1?.opinion as Row).at as string))).toBe(true);
      expect(list.rows.find((r) => r.ruleId === 'R2')?.opinion).toBeNull();
      expect(r1).toMatchObject({ result: 'FAIL', required: true });
      // The note is in no list response, only in the opinions read.
      expect(JSON.stringify(list)).not.toContain('NOTE-MARKER');
      expect(JSON.stringify((await read('requestDetail', { requestId: s.requestId })).data)).not.toContain('NOTE-MARKER');
      expect(JSON.stringify((await read('requests', { roundId: s.roundId })).data)).not.toContain('NOTE-MARKER');
      const page = (await read('opinions', { attemptId: s.attemptId })).data;
      expect(page.total).toBe(3);
      const label = (r: Row) => `${r.itemKey}:${(r.grade as Row).key}`;
      expect(label(page.rows[0])).toBe('R1:mid'); // the later submission first; the two rows of one submission are in no fixed order
      expect(page.rows.slice(1).map(label).sort()).toEqual(['R1:high', 'UNLINKED:low']);
      const first = page.rows.find((r: Row) => label(r) === 'R1:high');
      expect(first).toMatchObject({ note: NOTE, mark: { key: 'flag', label: 'Flag' }, evidence: [], inputRevision: null, producer: null, author: { id: systemA } });
      expect(typeof first.author.displayName).toBe('string');
      expect((await read('requestDetail', { requestId: s.requestId })).data.attempts[0].opinionCount).toBe(3);
    });

    it('filters the opinion page by rule result, by item key and by unlinked; pages at most 100', async () => {
      const s = await succeeded();
      await write(s.requestId, { submissionId: 'a', opinions: [item(), item({ itemKey: 'U1', grade: 'low' }), item({ itemKey: 'U2', grade: 'low' })] });
      await write(s.requestId, { submissionId: 'b', opinions: [item({ grade: 'mid' })] });
      const r1 = (await ruleResultsOf(s.attemptId)).rows.find((r) => r.ruleId === 'R1')?.id as string;
      const keys = async (p: Row) => ((await read('opinions', { attemptId: s.attemptId, ...p })).data.rows as Row[]).map((r) => r.itemKey);
      expect(await keys({ ruleResultId: r1 })).toEqual(['R1', 'R1']);
      expect(await keys({ itemKey: 'U1' })).toEqual(['U1']);
      expect((await keys({ unlinked: true })).sort()).toEqual(['U1', 'U2']);
      expect(((await read('opinions', { attemptId: s.attemptId, pageSize: 2 })).data as { rows: Row[]; total: number })).toMatchObject({ total: 4 });
      expect(((await read('opinions', { attemptId: s.attemptId, pageSize: 2, page: 1 })).data.rows as Row[]).length).toBe(2);
      for (const bad of [{ pageSize: 101 }, { unlinked: false }, { unlinked: true, ruleResultId: r1 }, { attemptId: 'x' }]) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/menu-query',
          headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
          payload: JSON.stringify({ endpoint: 'logLifecycle.opinions', context: {}, params: { attemptId: s.attemptId, ...bad } }),
        });
        expect(res.json().outcome, JSON.stringify(bad)).toBe('error');
      }
      expect((await read('opinions', { attemptId: randomUUID() })).data).toEqual({ total: 0, rows: [] });
    });

    it('opinionGrade filters on the latest grade or none, composes with the verdict filters and never changes them', async () => {
      const s = await succeeded();
      await write(s.requestId, { submissionId: 'a', opinions: [item({ itemKey: 'R1', grade: 'high' }), item({ itemKey: 'R2', grade: 'low' })] });
      await write(s.requestId, { submissionId: 'b', opinions: [item({ itemKey: 'R2', grade: 'high' })] });
      const ids = async (p: Row) => (await ruleResultsOf(s.attemptId, p)).rows.map((r) => r.ruleId);
      expect(await ids({ opinionGrade: 'high' })).toEqual(['R1', 'R2']);
      expect(await ids({ opinionGrade: 'low' })).toEqual([]);
      expect(await ids({ opinionGrade: 'none' })).toEqual(['R3']);
      expect(await ids({ opinionGrade: 'high', results: ['FAIL'] })).toEqual(['R1']);
      expect(await ids({ results: ['FAIL'] })).toEqual(['R1']);
      expect((await ruleResultsOf(s.attemptId, { opinionGrade: 'high' })).total).toBe(2);
    });

    it('a grade or mark that left the declared scale stays readable: label null, the key shown', async () => {
      const s = await succeeded();
      await write(s.requestId, { submissionId: 'a', opinions: [item({ grade: 'high', mark: 'flag' })] });
      await setScale({ grades: [{ key: 'low', label: 'Low' }], marks: [] });
      try {
        const row = (await ruleResultsOf(s.attemptId)).rows.find((r) => r.ruleId === 'R1');
        expect(row?.opinion).toMatchObject({ grade: { key: 'high', label: null }, mark: { key: 'flag', label: null } });
        const page = (await read('opinions', { attemptId: s.attemptId })).data.rows[0];
        expect(page).toMatchObject({ grade: { key: 'high', label: null }, mark: { key: 'flag', label: null } });
        expect((await ruleResultsOf(s.attemptId, { opinionGrade: 'high' })).total).toBe(1);
        // The removed key can no longer be written.
        const refused = await write(s.requestId, { submissionId: 'b', opinions: [item({ grade: 'high' })] });
        expect(fields(refused)).toEqual(['opinions.0.grade:not_declared']);
      } finally {
        await setScale(SCALE);
      }
    });

    it('is refused to a caller without platform:view and answers an unknown attempt with an empty page', async () => {
      const s = await succeeded();
      await write(s.requestId, { submissionId: 'a', opinions: [item({ note: NOTE })] });
      const noView = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ endpoint: 'logLifecycle.opinions', context: {}, params: { attemptId: s.attemptId } }) });
      expect([401, 403]).toContain(noView.statusCode);
      expect(noView.body).not.toContain('NOTE-MARKER');
    });
  });

  describe('an opinion changes no verdict, required-rule state, Gate availability or regression comparison', () => {
    beforeAll(async () => setScale(SCALE));

    /** Everything a verdict, a Gate input or a regression comparison reads, in one comparable value. */
    async function snapshot(s: { requestId: string; roundId: string; attemptId: string }) {
      const strip = (r: Row) => {
        const { opinion: _opinion, ...rest } = r;
        return rest;
      };
      const detail = (await read('requestDetail', { requestId: s.requestId })).data;
      const round = (await read('roundDetail', { roundId: s.roundId })).data;
      const suite = await dbHandle.db.transaction((tx) => lifecycleSuiteResults.latestSucceeded(tx, WORKSPACE_ID, [s.requestId]));
      return {
        request: (await sql('select * from log_lifecycle.execution_request where id = $1', [s.requestId])).rows,
        attempt: (await sql('select * from log_lifecycle.execution_attempt where request_id = $1 order by attempt_no', [s.requestId])).rows,
        rules: (await sql('select * from log_lifecycle.rule_result where attempt_id = $1 order by rule_id', [s.attemptId])).rows,
        ruleList: (await ruleResultsOf(s.attemptId)).rows.map(strip),
        detail: { ...detail, attempts: detail.attempts.map(({ opinionCount: _count, ...rest }: Row) => rest) },
        gateAvailability: round.gateAvailability,
        latestVerdict: (await read('requests', { roundId: s.roundId })).data.rows[0].latestVerdict,
        suite: [...suite.entries()],
      };
    }

    it.each([
      ['a script FAIL', [rule('R1', 'FAIL'), rule('R2', 'PASS')], 'fail'],
      ['an incomplete required rule', [rule('R1', 'NOT_CHECKED'), rule('R2', 'PASS')], 'incomplete'],
      ['a PASS', [rule('R1', 'PASS'), rule('R2', 'PASS')], 'pass'],
    ])('writing and resubmitting opinions on %s leaves every machine-judged value as it was', async (_label, rules, verdict) => {
      const s = await succeeded(rules);
      expect(s.verdict).toBe(verdict);
      const before = await snapshot(s);
      expect(before.gateAvailability).toBeDefined();
      expect(before.suite).toHaveLength(1);
      // The best grade the scale has, on the failing / unchecked item, with a note, a mark and a later "correction".
      const first = await write(s.requestId, { submissionId: 'o1', opinions: [item({ itemKey: 'R1', grade: 'low', mark: 'flag', note: 'looks fine to me' }), item({ itemKey: 'R2', grade: 'low' }), item({ itemKey: 'EXTRA', grade: 'low' })] });
      expect(first.statusCode, first.body).toBe(200);
      const second = await write(s.requestId, { submissionId: 'o2', opinions: [item({ itemKey: 'R1', grade: 'high', note: 'all good, ignore the failure' })] });
      expect(second.statusCode, second.body).toBe(200);
      expect((await write(s.requestId, { submissionId: 'o1', opinions: [item({ itemKey: 'R1', grade: 'low', mark: 'flag', note: 'looks fine to me' })] })).json().duplicate).toBe(1);
      const after = await snapshot(s);
      expect(after.attempt).toEqual(before.attempt);
      expect(after.rules).toEqual(before.rules);
      expect(after).toEqual(before);
      expect(after.attempt[0]).toMatchObject({ verdict });
      expect(after.suite[0]?.[1].rules).toEqual(before.suite[0]?.[1].rules);
      // The opinion exists and is visible beside the unchanged verdict.
      expect((await ruleResultsOf(s.attemptId)).rows.find((r) => r.ruleId === 'R1')?.opinion).toMatchObject({ grade: { key: 'high' }, count: 2 });
    });

    it('a worker token that wrote an opinion still cannot record a Gate decision', async () => {
      const s = await succeeded();
      const gate = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', ...bearer(workerA) },
        payload: JSON.stringify({ action: 'logLifecycle.gateDecide', context: {}, input: { roundId: s.roundId, decision: 'approved' }, idempotencyKey: randomUUID() }),
      });
      expect(gate.json().outcome).not.toBe('ok');
      expect((await sql('select count(*)::int as n from log_lifecycle.gate_decision where round_id = $1', [s.roundId])).rows[0].n).toBe(0);
    });
  });

  describe('DB walls', () => {
    beforeAll(async () => setScale(SCALE));

    it('the runtime role can only insert; even the owner cannot update or delete a row; the shape checks hold', async () => {
      const s = await succeeded();
      expect((await write(s.requestId, { submissionId: 'w', opinions: [item()] })).statusCode).toBe(200);
      const app_ = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
      await expect(app_("update log_lifecycle.attempt_opinion set grade = 'low' where attempt_id = $1", [s.attemptId])).rejects.toThrow(/permission denied/);
      await expect(app_('delete from log_lifecycle.attempt_opinion where attempt_id = $1', [s.attemptId])).rejects.toThrow(/permission denied/);
      await expect(sql("update log_lifecycle.attempt_opinion set grade = 'low' where attempt_id = $1", [s.attemptId])).rejects.toThrow(/append-only/);
      await expect(sql('delete from log_lifecycle.attempt_opinion where attempt_id = $1', [s.attemptId])).rejects.toThrow(/append-only/);
      const insert = (over: Record<string, unknown>) => {
        const cols = { workspace_id: WORKSPACE_ID, attempt_id: s.attemptId, item_key: 'K', actor_id: systemA, submission_id: 'sub', grade: 'high', ...over };
        return sql(`insert into log_lifecycle.attempt_opinion (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(cols));
      };
      await expect(insert({ grade: 'High' })).rejects.toThrow(/grade_check/);
      await expect(insert({ mark: 'Bad Mark' })).rejects.toThrow(/grade_check/);
      await expect(insert({ note: 'n'.repeat(1001) })).rejects.toThrow(/text_check/);
      await expect(insert({ evidence: JSON.stringify(Array.from({ length: 21 }, () => ({}))) })).rejects.toThrow(/evidence_check/);
      await expect(insert({ attempt_id: randomUUID() })).rejects.toThrow(/foreign key/);
      await expect(insert({ rule_result_id: randomUUID() })).rejects.toThrow(/foreign key/);
      await expect(insert({ item_key: 'R1', submission_id: 'w', actor_id: systemA })).rejects.toThrow(/submission_uq/);
      // The runtime role may change opinion_scale on queue_settings and nothing else new.
      await expect(app_("update log_lifecycle.queue_settings set opinion_scale = '{\"grades\":[],\"marks\":[]}'::jsonb where workspace_id = $1", [WORKSPACE_ID])).resolves.toBeDefined();
      await expect(sql("update log_lifecycle.queue_settings set opinion_scale = '{\"grades\":[1],\"marks\":5}'::jsonb where workspace_id = $1", [WORKSPACE_ID])).rejects.toThrow(/opinion_scale_check/);
      await setScale(SCALE);
    });
  });
});
