// #1445 d — the validation request queue (ADR-0117): register / cancel (menu-action), claim / heartbeat / result / fail
// (token REST), lease expiry, idempotent results, verdicts, run window, immediate limit, excerpt read right, audit and the
// DB walls, through the real `buildServer` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs migration 0108 (`log_lifecycle.execution_request` …). The worker is the 합성 fixture reference worker
// (`tooling/scripts/validation-worker-mock.mjs`), not a real Validator.

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMockWorker } from '../../../../../../tooling/scripts/validation-worker-mock.mjs';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { purgeExpiredExcerpts } from '../excerpt-purge-job.js';
import { sampleManifestDigest } from '../domain/sample-set.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `RQ${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const Q = '/api/v1/validation-queue';
const SATURDAY_NOON = new Date('2026-11-14T12:00:00+09:00'); // inside the default run window (weekend, Asia/Seoul)
const TUESDAY_NOON = new Date('2026-11-10T12:00:00+09:00'); // outside it

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
const SAMPLE = (n = 2, sourceOwner = `${TAG}-fab`) => ({ files: FILES(n), sourceOwner });

describe.skipIf(!runIntegration)('validation request queue (#1445 d)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let manager: Person; // developer with lifecycle.round.manage
  let reader: Person; // developer, excerpt reader of SOURCE
  let owner: Person;
  let systemA = '';
  let systemB = '';
  let workerA = '';
  let workerB = '';
  let noScopeToken = '';
  let vendorId = '';
  let clock: Date = SATURDAY_NOON;
  let foreignWorkspaceId = '';
  const SOURCE = `${TAG}-fab`;
  const actorIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(action: string, input: Record<string, unknown>, opts: { who?: Person; token?: string; expectedVersion?: string } = {}): Promise<Answer> {
    const who = opts.who ?? admin;
    const headers = opts.token
      ? { 'content-type': 'application/json', ...bearer(opts.token) }
      : { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers,
      payload: JSON.stringify({ action: `logLifecycle.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }) }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin, token?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...(token ? bearer(token) : cookieHeader(who.cookie)) },
      payload: JSON.stringify({ endpoint: `logLifecycle.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const post = (token: string | null, path: string, payload: unknown = {}, cookie?: string) =>
    app.inject({ method: 'POST', url: `${Q}${path}`, headers: token ? bearer(token) : cookie ? cookieHeader(cookie) : {}, payload: payload as object });
  const claim = (token = workerA) => post(token, '/claim');
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

  /** A fresh model → project → open round (samples from the user's list) → ids. */
  async function makeRound(sample = SAMPLE()) {
    const modelId = await catalog('equipment_model', `${TAG}-m${n++}`, { vendor_id: vendorId });
    const p = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id });
    expect(p.outcome, JSON.stringify(p)).toBe('ok');
    const r = await act('roundOpen', { projectId: p.data.projectId, sampleSet: sample });
    expect(r.outcome, JSON.stringify(r)).toBe('ok');
    return { projectId: p.data.projectId as string, roundId: r.data.roundId as string, modelId, digest: sampleManifestDigest(sample) };
  }
  /** Registers a request and returns its id. */
  async function makeRequest(roundId: string, over: Record<string, unknown> = {}, who: Person = admin) {
    const a = await act('requestCreate', { roundId, priority: 1, ...over }, { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.requestId as string, version: a.data.version as string };
  }
  const requestRow = async (id: string) => (await sql('select * from log_lifecycle.execution_request where id = $1', [id])).rows[0] as Row;
  const attempts = async (id: string) => (await sql('select * from log_lifecycle.execution_attempt where request_id = $1 order by attempt_no', [id])).rows as Row[];
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as { event_type: string; actor_id: string; detail: Row }[];
  const expireLease = (id: string) =>
    sql("update log_lifecycle.execution_request set lease_expires_at = now() - interval '1 minute', row_version = row_version + 1 where id = $1", [id]);
  const resultBody = (claimBody: { request: { sampleManifestDigest: string; sampleSet: { files: { fileRef: string; sha256: string }[] } }; attempt: { attemptNo: number } }, rules: Row[]) => ({
    attemptNo: claimBody.attempt.attemptNo,
    inputManifestDigest: claimBody.request.sampleManifestDigest,
    results: rules,
  });
  const rule = (ruleId: string, result: string, required = true, extra: Row = {}) => ({ ruleId, result, required, ...extra });

  beforeEach(async () => {
    clock = SATURDAY_NOON;
    await sql('delete from core.rate_limits');
    // Requests left by an earlier test would be claimed first: end every open one (the guard allows queued/claimed -> cancelled).
    await sql(
      `update log_lifecycle.execution_request set state = 'cancelled', claimed_by_actor_id = null, lease_expires_at = null, ended_at = now(), row_version = row_version + 1
        where workspace_id = $1 and state in ('queued','claimed')`,
      [WORKSPACE_ID],
    );
    await sql('delete from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, validationQueueClock: () => clock });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    manager = await person('developer');
    reader = await person('developer');
    owner = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'lifecycle.round.manage', null, $3)`,
      [WORKSPACE_ID, manager.id, admin.id],
    );
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
    await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: reader.id, allowed: true });
  }, 60_000);

  afterAll(async () => {
    const owned = `(select id from log_lifecycle.execution_request where requested_by_actor_id = any($1) or workspace_id = $2)`;
    // The excerpt table refuses every DELETE (guard trigger): fixtures are removed with the trigger off, like development_event below.
    const cleaner = await migrate.pool.connect();
    try {
      await cleaner.query('begin');
      await cleaner.query('alter table log_lifecycle.rule_result_excerpt disable trigger rule_result_excerpt_no_delete');
      await cleaner.query('delete from log_lifecycle.rule_result_excerpt where workspace_id = $1', [WORKSPACE_ID]);
      await cleaner.query('alter table log_lifecycle.rule_result_excerpt enable trigger rule_result_excerpt_no_delete');
      await cleaner.query('commit');
    } catch (error) {
      await cleaner.query('rollback');
      throw error;
    } finally {
      cleaner.release();
    }
    // The evidence side table is append-only (guard trigger): fixtures go with the trigger off, before their rule results.
    const evidenceCleaner = await migrate.pool.connect();
    try {
      await evidenceCleaner.query('begin');
      await evidenceCleaner.query('alter table log_lifecycle.rule_result_evidence disable trigger rule_result_evidence_append_only');
      await evidenceCleaner.query('delete from log_lifecycle.rule_result_evidence where workspace_id = $1', [WORKSPACE_ID]);
      await evidenceCleaner.query('alter table log_lifecycle.rule_result_evidence enable trigger rule_result_evidence_append_only');
      await evidenceCleaner.query('commit');
    } catch (error) {
      await evidenceCleaner.query('rollback');
      throw error;
    } finally {
      evidenceCleaner.release();
    }
    if (foreignWorkspaceId) {
      const foreign = await migrate.pool.connect();
      try {
        await foreign.query('begin');
        await foreign.query('alter table log_lifecycle.rule_result_evidence disable trigger rule_result_evidence_append_only');
        for (const table of ['rule_result_evidence', 'rule_result', 'execution_attempt', 'execution_request', 'validation_round']) {
          await foreign.query(`delete from log_lifecycle.${table} where workspace_id = $1`, [foreignWorkspaceId]);
        }
        await foreign.query('alter table log_lifecycle.rule_result_evidence enable trigger rule_result_evidence_append_only');
        await foreign.query('commit');
      } catch (error) {
        await foreign.query('rollback');
        throw error;
      } finally {
        foreign.release();
      }
      await sql('delete from log_lifecycle.development_project where workspace_id = $1', [foreignWorkspaceId]);
    }
    await sql(`delete from log_lifecycle.rule_result where workspace_id = $1`, [WORKSPACE_ID]);
    await sql(`delete from log_lifecycle.execution_attempt where request_id in ${owned}`, [actorIds, WORKSPACE_ID]);
    await sql(`delete from log_lifecycle.execution_request where id in ${owned}`, [actorIds, WORKSPACE_ID]);
    await sql('delete from log_lifecycle.excerpt_reader where workspace_id = $1', [WORKSPACE_ID]);
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
    if (foreignWorkspaceId) await sql('delete from core.workspaces where id = $1', [foreignWorkspaceId]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('screen projections (#1447)', () => {
    it('returns the current queue settings and a server timestamp to a reader', async () => {
      await sql('insert into log_lifecycle.queue_settings (workspace_id, run_window, immediate_limit, updated_by) values ($1,$2::jsonb,3,$3)', [WORKSPACE_ID, JSON.stringify({ timezone: 'UTC', weekday: { fromHour: 1, toHour: 2 }, weekendAllDay: false }), admin.id]);
      const result = await read('queueStatus', {}, user);
      expect(result.data).toMatchObject({ runWindow: { timezone: 'UTC', weekday: { fromHour: 1, toHour: 2 }, weekendAllDay: false }, immediateLimit: 3 });
      expect(Number.isFinite(Date.parse(result.data.serverAt))).toBe(true);
      const stored = await sql('select immediate_limit from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID]);
      expect(stored.rows[0]?.immediate_limit).toBe(3);
    });
    it('projects current validation and request counts, sorts rule results before paging, and counts only required unchecked rules', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const modelBefore = await read('models', { filters: [{ id: 'id', op: 'in', value: [round.modelId] }] });
      expect(modelBefore.data.rows[0]).toMatchObject({ validation: 'queued', pendingRequests: 1 });
      const claimed = (await claim()).json();
      const saved = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('A', 'PASS'), rule('B', 'ERROR'), rule('C', 'NOT_CHECKED', false)]));
      expect(saved.statusCode).toBe(200);
      const sorted = await read('ruleResults', { attemptId: claimed.attempt.id, pageSize: 1, sorting: [{ id: 'ruleId', desc: true }] });
      expect(sorted.data.rows.map((r: Row) => r.ruleId)).toEqual(['C']);
      expect(sorted.data.total).toBe(3);
      const detail = await read('requestDetail', { requestId: request.id });
      expect(detail.data).toMatchObject({ modelCode: expect.any(String), roundSeq: 1, softwareLabel: null });
      expect(detail.data.attempts[0]).toMatchObject({ requiredUnchecked: 1, verdict: 'incomplete' });
      const after = await read('models', { filters: [{ id: 'id', op: 'in', value: [round.modelId] }] });
      expect(after.data.rows[0]).toMatchObject({ validation: 'incomplete', pendingRequests: 0 });
      expect((await read('rounds', { projectId: round.projectId })).data.rows[0]).toMatchObject({ validation: 'incomplete', gateDecision: null });
    });
  });

  describe('register and cancel (human side)', () => {
    it('registers a request on an open round with the right, audits it, and lists it', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId, { priority: 2 }, manager);
      const row = await requestRow(request.id);
      expect(row).toMatchObject({ state: 'queued', priority: 2, immediate: false, attempt_count: 0, max_attempts: 3, round_id: round.roundId, requested_by_actor_id: manager.id });
      expect(row.request_digest).toMatch(/^[0-9a-f]{64}$/);
      const events = await audit(request.id);
      expect(events.map((e) => e.event_type)).toEqual(['lifecycle.request.created']);
      expect(events[0]?.detail).toEqual({ roundId: round.roundId, priority: 2, immediate: false, maxAttempts: 3 });

      const list = await read('requests', { roundId: round.roundId });
      expect(list.outcome).toBe('ok');
      expect(list.data.rows.map((r: Row) => r.id)).toEqual([request.id]);
      expect(list.data.rows[0]).toMatchObject({ state: 'queued', priority: 2, immediate: false, modelId: round.modelId, latestVerdict: null });
      const detail = await read('requestDetail', { requestId: request.id });
      expect(detail.data).toMatchObject({ id: request.id, attempts: [], round: { id: round.roundId, status: 'open', sourceOwner: SOURCE } });
    });

    it.each([
      ['a user without the right', () => user],
      ['a developer without the right', () => reader],
    ])('refuses %s', async (_label, who) => {
      const round = await makeRound();
      const a = await act('requestCreate', { roundId: round.roundId, priority: 1 }, { who: who() });
      expect(a.outcome).toBe('forbidden');
    });

    it('refuses an unknown round, a closed round and a foreign-workspace id; validates priority', async () => {
      expect(fe(await act('requestCreate', { roundId: randomUUID(), priority: 1 }))).toEqual(['roundId:not_found']);
      const round = await makeRound();
      expect(fe(await act('requestCreate', { roundId: round.roundId, priority: 3 }))).toEqual(['priority:malformed']);
      expect(fe(await act('requestCreate', { roundId: round.roundId }))).toEqual(['priority:required']);
      const closed = await act('roundClose', { id: round.roundId }, { expectedVersion: '1' });
      expect(closed.outcome).toBe('ok');
      expect(fe(await act('requestCreate', { roundId: round.roundId, priority: 1 }))).toEqual(['roundId:round_closed']);
    });

    it('a token carrying lifecycle.round.manage registers a request; the audit row names the token', async () => {
      const round = await makeRound();
      const a = await act('requestCreate', { roundId: round.roundId, priority: 0 }, { token: noScopeToken });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const [created] = await audit(a.data.requestId);
      expect(created?.actor_id).toBe(systemA);
      expect(created?.detail.api_token_id).toEqual(expect.any(String));
    });

    it('cancels a queued request, keeps the state final, and refuses a stale version', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const stale = await act('requestCancel', { id: request.id, reason: 'no longer needed' }, { expectedVersion: '99' });
      expect(stale.outcome).toBe('conflict');
      const ok = await act('requestCancel', { id: request.id, reason: 'no longer needed' }, { expectedVersion: request.version });
      expect(ok.outcome).toBe('ok');
      expect(await requestRow(request.id)).toMatchObject({ state: 'cancelled', cancel_reason: 'no longer needed' });
      const again = await act('requestCancel', { id: request.id, reason: 'again' }, { expectedVersion: ok.version as string });
      expect(fe(again)).toEqual(['id:illegal_transition']);
      expect(fe(await act('requestCancel', { id: request.id, reason: '  ' }, { expectedVersion: ok.version as string }))).toEqual(['reason:required']);
      expect((await audit(request.id)).map((e) => e.event_type)).toEqual(['lifecycle.request.created', 'lifecycle.request.cancelled']);
    });

    it('a cancelled claimed request loses its lease: the worker next call is lease_lost', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      expect(claimed.request.id).toBe(request.id);
      const c = await act('requestCancel', { id: request.id, reason: 'stop' }, { expectedVersion: String((await requestRow(request.id)).row_version) });
      expect(c.outcome).toBe('ok');
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 })).statusCode).toBe(409);
      const late = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'PASS')]));
      expect(late.statusCode).toBe(409);
      expect(late.json().code).toBe('queue.lease_lost');
      expect((await attempts(request.id))[0]?.outcome).toBe('lease_expired');
    });
  });

  describe('immediate limit and run window', () => {
    it('allows five immediate requests per user (setting), refuses the sixth with queue.immediate_limit, frees a slot on cancel', async () => {
      const round = await makeRound();
      const made: { id: string; version: string }[] = [];
      for (let i = 0; i < 5; i += 1) made.push(await makeRequest(round.roundId, { immediate: true }, manager));
      const sixth = await act('requestCreate', { roundId: round.roundId, priority: 1, immediate: true }, { who: manager });
      expect(sixth.outcome).toBe('invalid');
      expect(fe(sixth)).toEqual(['immediate:queue.immediate_limit']);
      // Not immediate: no limit. Another user: own count.
      await makeRequest(round.roundId, {}, manager);
      await makeRequest(round.roundId, { immediate: true }, admin);
      const first = made[0] as { id: string; version: string };
      expect((await act('requestCancel', { id: first.id, reason: 'free a slot' }, { who: manager, expectedVersion: first.version })).outcome).toBe('ok');
      expect((await act('requestCreate', { roundId: round.roundId, priority: 1, immediate: true }, { who: manager })).outcome).toBe('ok');
    });

    it('the limit is the workspace setting, changed by an admin only and audited', async () => {
      const round = await makeRound();
      expect((await act('queueSettingsUpdate', { immediateLimit: 1 }, { who: manager })).outcome).toBe('forbidden');
      const set = await act('queueSettingsUpdate', { immediateLimit: 1 });
      expect(set.outcome, JSON.stringify(set)).toBe('ok');
      expect(set.data.changed).toEqual(['immediateLimit']);
      await makeRequest(round.roundId, { immediate: true }, manager);
      expect(fe(await act('requestCreate', { roundId: round.roundId, priority: 1, immediate: true }, { who: manager }))).toEqual(['immediate:queue.immediate_limit']);
      const events = await sql("select detail from core.audit_log where event_type = 'lifecycle.queue_settings.updated' and workspace_id = $1 order by created_at desc limit 1", [WORKSPACE_ID]);
      expect(events.rows[0]?.detail).toEqual({ changed: ['immediateLimit'] });
      expect(fe(await act('queueSettingsUpdate', { runWindow: { timezone: 'Nope/Zone' } }))).toEqual(['runWindow:malformed']);
    });

    it('two concurrent first settings updates on a workspace without a row both survive', async () => {
      expect((await sql('select 1 from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID])).rows).toEqual([]);
      const [one, two] = await Promise.all([act('queueSettingsUpdate', { leaseSeconds: 60 }), act('queueSettingsUpdate', { immediateLimit: 1 })]);
      expect([one.outcome, two.outcome]).toEqual(['ok', 'ok']);
      const row = (await sql('select lease_seconds, immediate_limit, excerpt_retention_days from log_lifecycle.queue_settings where workspace_id = $1', [WORKSPACE_ID])).rows[0];
      expect(row).toEqual({ lease_seconds: 60, immediate_limit: 1, excerpt_retention_days: 90 });
    });

    it('outside the run window claim answers 204; an immediate request is still handed out; inside the window both are', async () => {
      const round = await makeRound();
      const normal = await makeRequest(round.roundId);
      clock = TUESDAY_NOON;
      expect((await claim()).statusCode).toBe(204);
      expect((await requestRow(normal.id)).state).toBe('queued');
      const immediate = await makeRequest(round.roundId, { immediate: true });
      const got = await claim();
      expect(got.statusCode).toBe(200);
      expect(got.json().request.id).toBe(immediate.id);
      expect(got.json().request.immediate).toBe(true);
      clock = SATURDAY_NOON;
      const inside = await claim();
      expect(inside.statusCode).toBe(200);
      expect(inside.json().request.id).toBe(normal.id);
    });

    it('the window is a workspace setting: moving it closes a weekend', async () => {
      const round = await makeRound();
      await makeRequest(round.roundId);
      const set = await act('queueSettingsUpdate', { runWindow: { timezone: 'Asia/Seoul', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: false } });
      expect(set.outcome, JSON.stringify(set)).toBe('ok');
      expect((await claim()).statusCode).toBe(204); // Saturday noon, weekend no longer open
    });
  });

  describe('worker authentication (token-only, validation.worker)', () => {
    it('refuses a cookie session, no credentials, a token without the scope, and a personal token carrying the scope', async () => {
      const human = await post(null, '/claim', {}, admin.cookie);
      expect(human.statusCode).toBe(403);
      expect(human.json().code).toBe('permission.denied');
      expect((await post(null, '/claim')).statusCode).toBe(401);
      const noScope = await claim(noScopeToken);
      expect(noScope.statusCode).toBe(403);
      expect(noScope.json().code).toBe('permission.denied');
      const personal = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(manager.cookie), payload: { name: 'p', scopes: ['validation.worker'] } });
      expect(personal.statusCode).toBe(422);
      expect(personal.json().detail.fields).toEqual([{ path: ['scopes', 0], code: 'service_only' }]);
      expect((await post('ap_00000000_' + 'x'.repeat(43), '/claim')).statusCode).toBe(401);
    });

    it('the human menu ports never accept the worker scope as a capability right: a worker token cannot register a request', async () => {
      const round = await makeRound();
      const a = await act('requestCreate', { roundId: round.roundId, priority: 1 }, { token: workerA });
      expect(a.outcome).toBe('forbidden');
    });
  });

  describe('claim, lease and heartbeat', () => {
    it('answers 204 on an empty queue, then hands out the highest priority, oldest request with its samples', async () => {
      expect((await claim()).statusCode).toBe(204);
      const round = await makeRound();
      const low = await makeRequest(round.roundId, { priority: 0 });
      const high = await makeRequest(round.roundId, { priority: 2 });
      const first = await claim();
      expect(first.statusCode).toBe(200);
      const body = first.json();
      expect(body.request).toMatchObject({ id: high.id, roundId: round.roundId, priority: 2, attemptNo: 1, maxAttempts: 3, sampleManifestDigest: round.digest });
      expect(body.request.sampleSet.files.map((f: { fileRef: string }) => f.fileRef)).toEqual(FILES().map((f) => f.fileRef));
      expect(new Date(body.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000); // default lease 5 minutes
      expect(await requestRow(high.id)).toMatchObject({ state: 'claimed', attempt_count: 1, claimed_by_actor_id: systemA });
      expect((await attempts(high.id))[0]).toMatchObject({ attempt_no: 1, outcome: 'running', worker_actor_id: systemA, input_manifest_digest: round.digest });
      expect((await claim()).json().request.id).toBe(low.id);
      expect((await claim()).statusCode).toBe(204);
      expect((await audit(high.id)).map((e) => e.event_type)).toEqual(['lifecycle.request.created', 'lifecycle.request.claimed']);
    });

    it('two simultaneous claims never get the same request', async () => {
      const round = await makeRound();
      const a = await makeRequest(round.roundId);
      const b = await makeRequest(round.roundId);
      const [one, two] = await Promise.all([claim(workerA), claim(workerB)]);
      expect([one.statusCode, two.statusCode]).toEqual([200, 200]);
      expect(new Set([one.json().request.id, two.json().request.id])).toEqual(new Set([a.id, b.id]));
    });

    it('one request, two simultaneous claims: exactly one 200 and one 204', async () => {
      const round = await makeRound();
      await makeRequest(round.roundId);
      const results = await Promise.all([claim(workerA), claim(workerB), claim(workerA), claim(workerB)]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 204, 204, 204]);
    });

    it('a heartbeat moves the lease to now + lease; another worker or an unknown attempt cannot', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      await claim();
      await sql("update log_lifecycle.execution_request set lease_expires_at = now() + interval '10 seconds', row_version = row_version + 1 where id = $1", [request.id]);
      const beat = await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 });
      expect(beat.statusCode).toBe(200);
      expect(new Date(beat.json().leaseExpiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
      const other = await post(workerB, `/requests/${request.id}/heartbeat`, { attemptNo: 1 });
      expect(other.statusCode).toBe(409);
      expect(other.json().code).toBe('queue.lease_lost');
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 7 })).statusCode).toBe(404);
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, {})).statusCode).toBe(422);
      expect((await post(workerA, `/requests/${randomUUID()}/heartbeat`, { attemptNo: 1 })).statusCode).toBe(404);
    });

    it('the lease length is the workspace setting', async () => {
      const round = await makeRound();
      await makeRequest(round.roundId);
      expect((await act('queueSettingsUpdate', { leaseSeconds: 60 })).outcome).toBe('ok');
      const body = (await claim()).json();
      const left = new Date(body.leaseExpiresAt).getTime() - Date.now();
      expect(left).toBeGreaterThan(30_000);
      expect(left).toBeLessThan(70_000);
    });

    it('an expired lease goes back to the queue on the next claim; the old worker is lease_lost; the attempt number rises', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const first = (await claim(workerA)).json();
      await expireLease(request.id);
      const second = await claim(workerB);
      expect(second.statusCode).toBe(200);
      expect(second.json().request).toMatchObject({ id: request.id, attemptNo: 2 });
      expect((await attempts(request.id)).map((a) => [a.attempt_no, a.outcome])).toEqual([[1, 'lease_expired'], [2, 'running']]);
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 })).json().code).toBe('queue.lease_lost');
      const late = await post(workerA, `/requests/${request.id}/result`, resultBody(first, [rule('R1', 'PASS')]));
      expect(late.statusCode).toBe(409);
      expect(late.json().code).toBe('queue.lease_lost');
      expect((await audit(request.id)).map((e) => e.event_type)).toContain('lifecycle.request.lease_expired');
    });

    it('max_attempts used up: the request expires and is not handed out again', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId, { maxAttempts: 1 });
      await claim();
      await expireLease(request.id);
      expect((await claim()).statusCode).toBe(204);
      expect(await requestRow(request.id)).toMatchObject({ state: 'expired', claimed_by_actor_id: null, lease_expires_at: null });
      expect((await audit(request.id)).find((e) => e.event_type === 'lifecycle.request.lease_expired')?.detail).toMatchObject({ attemptNo: 1, to: 'expired' });
    });

    it('a request of a closed round is not handed out', async () => {
      const round = await makeRound();
      await makeRequest(round.roundId);
      const closed = await act('roundClose', { id: round.roundId }, { expectedVersion: '1' });
      expect(closed.outcome).toBe('ok');
      expect((await claim()).statusCode).toBe(204);
    });
  });

  describe('late results (lease expired, nobody else took the request)', () => {
    it('a result after expiry is kept when no one else claimed; the request ends succeeded', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      await expireLease(request.id);
      // The next claim call requeues it; outside the window nothing is handed out, so nobody takes it.
      clock = TUESDAY_NOON;
      expect((await claim(workerB)).statusCode).toBe(204);
      expect((await requestRow(request.id)).state).toBe('queued');
      const res = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'PASS')]));
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ state: 'succeeded', verdict: 'pass', attemptNo: 1 });
      expect(await requestRow(request.id)).toMatchObject({ state: 'succeeded' });
      expect((await attempts(request.id))[0]).toMatchObject({ outcome: 'succeeded', verdict: 'pass' });
      expect((await audit(request.id)).find((e) => e.event_type === 'lifecycle.request.result_submitted')?.detail).toMatchObject({ late: true });
    });

    /** Claim by A, lease ends, a claim call by B outside the window requeues it and hands nothing out. */
    async function requeuedUnclaimed() {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      await expireLease(request.id);
      clock = TUESDAY_NOON;
      expect((await claim(workerB)).statusCode).toBe(204);
      expect(await requestRow(request.id)).toMatchObject({ state: 'queued', attempt_count: 1 });
      return { request, claimed };
    }

    it('a heartbeat on a requeued, unclaimed attempt gives the lease back to that attempt, which then ends with a result', async () => {
      const { request, claimed } = await requeuedUnclaimed();
      const before = Number((await requestRow(request.id)).row_version);
      const beat = await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 });
      expect(beat.statusCode, beat.body).toBe(200);
      expect(new Date(beat.json().leaseExpiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
      expect(await requestRow(request.id)).toMatchObject({ state: 'claimed', attempt_count: 1, claimed_by_actor_id: systemA, row_version: before + 1 });
      expect((await attempts(request.id)).map((a) => [a.attempt_no, a.outcome, a.ended_at])).toEqual([[1, 'running', null]]);
      const res = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'PASS')]));
      expect(res.statusCode, res.body).toBe(200);
      expect(await requestRow(request.id)).toMatchObject({ state: 'succeeded' });
    });

    it('a heartbeat after another worker claimed the request is lease_lost and changes nothing', async () => {
      const { request } = await requeuedUnclaimed();
      clock = SATURDAY_NOON;
      const second = await claim(workerB);
      expect(second.statusCode).toBe(200);
      expect(second.json().request).toMatchObject({ id: request.id, attemptNo: 2 });
      const beat = await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 });
      expect(beat.statusCode).toBe(409);
      expect(beat.json().code).toBe('queue.lease_lost');
      expect((await attempts(request.id)).map((a) => [a.attempt_no, a.outcome])).toEqual([[1, 'lease_expired'], [2, 'running']]);
      expect(await requestRow(request.id)).toMatchObject({ state: 'claimed', claimed_by_actor_id: systemB });
    });

    it('the reference worker keeps going when its heartbeat arrives after the requeue', async () => {
      const { request, claimed } = await requeuedUnclaimed();
      const send = async (method: 'POST', path: string, body: unknown) => {
        if (path.endsWith('/claim')) return { status: 200, body: claimed }; // the claim it made before the lease ran out
        const res = await app.inject({ method, url: path, headers: bearer(workerA), payload: body as object });
        return { status: res.statusCode, body: res.statusCode === 204 ? null : res.json() };
      };
      const out = await runMockWorker({ send, heartbeats: 2 });
      expect(out.heartbeat).toBeUndefined();
      expect(out.result?.status, JSON.stringify(out.result)).toBe(200);
      expect(await requestRow(request.id)).toMatchObject({ state: 'succeeded' });
    });
  });

  describe('result: idempotency, conflict, verdicts, input checks', () => {
    it('the same body again answers the same 200 and writes no new row; a different body for the attempt is conflict.stale_write', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const body = resultBody(claimed, [rule('R1', 'PASS'), rule('R2', 'WARN', false, { observed: 'close to the limit' })]);
      const first = await post(workerA, `/requests/${request.id}/result`, body);
      expect(first.statusCode, first.body).toBe(200);
      const again = await post(workerA, `/requests/${request.id}/result`, body);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual(first.json());
      expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where attempt_id = $1', [claimed.attempt.id])).rows[0].n).toBe(2);
      const changed = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'FAIL')]));
      expect(changed.statusCode).toBe(409);
      expect(changed.json().code).toBe('conflict.stale_write');
      expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where attempt_id = $1', [claimed.attempt.id])).rows[0].n).toBe(2);
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 })).json().code).toBe('queue.lease_lost');
      expect((await audit(request.id)).filter((e) => e.event_type === 'lifecycle.request.result_submitted')).toHaveLength(1);
    });

    it.each([
      ['pass: every required rule passed', [rule('R1', 'PASS'), rule('R2', 'PASS')], null, 'pass'],
      ['pass: an optional ERROR / SKIPPED / NOT_CHECKED does not block', [rule('R1', 'PASS'), rule('R2', 'ERROR', false), rule('R3', 'SKIPPED', false), rule('R4', 'NOT_CHECKED', false)], null, 'pass'],
      ['fail: one FAIL', [rule('R1', 'PASS'), rule('R2', 'FAIL', false)], null, 'fail'],
      ['incomplete: a required NOT_CHECKED', [rule('R1', 'PASS'), rule('R2', 'NOT_CHECKED')], null, 'incomplete'],
      ['incomplete: a required ERROR', [rule('R1', 'ERROR')], null, 'incomplete'],
      ['incomplete: a required SKIPPED', [rule('R1', 'SKIPPED')], null, 'incomplete'],
      ['incomplete: the worker used another manifest', [rule('R1', 'PASS')], H('f'), 'incomplete'],
      ['fail beats a manifest mismatch', [rule('R1', 'FAIL')], H('f'), 'fail'],
    ])('verdict is computed by the server — %s', async (_label, rules, manifest, expected) => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const body = { ...resultBody(claimed, rules), ...(manifest ? { inputManifestDigest: manifest } : {}), summary: { verdict: 'pass', note: 'worker says pass' } };
      const res = await post(workerA, `/requests/${request.id}/result`, body);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().verdict).toBe(expected);
      const [attempt] = await attempts(request.id);
      expect(attempt).toMatchObject({ verdict: expected, input_manifest_digest: manifest ?? round.digest, result_digest: res.json().resultDigest });
      // The worker's own summary is stored for reference and read by nothing.
      expect((attempt?.worker_summary as Row).verdict).toBe('pass');
      expect((await read('requestDetail', { requestId: request.id })).data.attempts[0]).toMatchObject({ verdict: expected, manifestMatches: manifest === null });
      expect((await read('requests', { roundId: round.roundId })).data.rows[0].latestVerdict).toBe(expected);
    });

    it('refuses bad input with 422, writes nothing and leaves the lease', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const ev = (extra: Row) => ({ fileRef: FILES()[0]?.fileRef, line: 3, fileSha256: H('b'), ...extra });
      const cases: [string, Row, string][] = [
        ['evidence outside the sample set', { ...resultBody(claimed, [rule('R1', 'FAIL', true, { evidence: [ev({ fileRef: 's3://elsewhere/x.log' })] })]) }, 'results.0.evidence.0.fileRef:not_in_sample'],
        ['a platform token in an excerpt', resultBody(claimed, [rule('R1', 'FAIL', true, { evidence: [ev({ excerpt: 'Authorization ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_' })] })]), 'results.0.evidence.0.excerpt:secret_detected'],
        ['an excerpt over 2,000 characters', resultBody(claimed, [rule('R1', 'FAIL', true, { evidence: [ev({ excerpt: 'x'.repeat(2001) })] })]), 'results.0.evidence.0.excerpt:too_long'],
        ['observed over 500 characters', resultBody(claimed, [rule('R1', 'FAIL', true, { observed: 'x'.repeat(501) })]), 'results.0.observed:too_long'],
        ['21 evidence entries', resultBody(claimed, [rule('R1', 'FAIL', true, { evidence: Array.from({ length: 21 }, () => ev({})) })]), 'results.0.evidence:too_many'],
        ['a verdict sent by the worker', { ...resultBody(claimed, [rule('R1', 'PASS')]), verdict: 'pass' }, 'verdict:malformed'],
        ['an AI opinion field', { ...resultBody(claimed, [rule('R1', 'PASS')]), aiOpinion: 'looks fine' }, 'aiOpinion:malformed'],
        ['a duplicate rule id', resultBody(claimed, [rule('R1', 'PASS'), rule('R1', 'FAIL')]), 'results.1.ruleId:duplicate'],
      ];
      for (const [label, body, expected] of cases) {
        const res = await post(workerA, `/requests/${request.id}/result`, body);
        expect(res.statusCode, label).toBe(422);
        expect(res.json().detail.fields.map((f: { path: (string | number)[]; code: string }) => `${f.path.join('.')}:${f.code}`), label).toContain(expected);
      }
      expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where workspace_id = $1 and attempt_id = $2', [WORKSPACE_ID, claimed.attempt.id])).rows[0].n).toBe(0);
      expect(await requestRow(request.id)).toMatchObject({ state: 'claimed' });
      expect((await post(workerA, `/requests/${request.id}/heartbeat`, { attemptNo: 1 })).statusCode).toBe(200);
    });

    it('refuses a token-looking rule id: 422, no rows, lease untouched, the token string nowhere', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const TOKEN = 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_';
      const before = await requestRow(request.id);
      const res = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule(TOKEN, 'PASS')]));
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json().code).toBe('validation.failed');
      expect(res.json().detail.fields.map((f: { path: (string | number)[]; code: string }) => `${f.path.join('.')}:${f.code}`)).toContain('results.0.ruleId:secret_detected');
      expect(res.body).not.toContain(TOKEN);
      expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where workspace_id = $1 and rule_id like $2', [WORKSPACE_ID, '%0123abcd%'])).rows[0].n).toBe(0);
      expect((await attempts(request.id))[0]).toMatchObject({ outcome: 'running', verdict: null, result_digest: null });
      expect(await requestRow(request.id)).toMatchObject({ state: 'claimed', lease_expires_at: before.lease_expires_at, row_version: before.row_version });
      expect(JSON.stringify(await read('ruleResults', { attemptId: claimed.attempt.id }))).not.toContain(TOKEN);
      expect(JSON.stringify(await read('requestDetail', { requestId: request.id }))).not.toContain(TOKEN);
      expect((await sql('select 1 from core.audit_log where workspace_id = $1 and (detail::text like $2 or summary like $2)', [WORKSPACE_ID, '%0123abcd_ABCDEF%'])).rows).toEqual([]);
    });

    it('refuses a token nested in the summary: 422, no rows, lease untouched, the token string nowhere', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const TOKEN = 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_';
      const before = await requestRow(request.id);
      const res = await post(workerA, `/requests/${request.id}/result`, { ...resultBody(claimed, [rule('R1', 'PASS')]), summary: { a: { b: `note ${TOKEN}` } } });
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json().code).toBe('validation.failed');
      expect(res.json().detail.fields.map((f: { path: (string | number)[]; code: string }) => `${f.path.join('.')}:${f.code}`)).toContain('summary:secret_detected');
      expect(res.body).not.toContain(TOKEN);
      expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where workspace_id = $1 and attempt_id = $2', [WORKSPACE_ID, claimed.attempt.id])).rows[0].n).toBe(0);
      expect((await attempts(request.id))[0]).toMatchObject({ outcome: 'running', verdict: null, result_digest: null, worker_summary: null });
      expect(await requestRow(request.id)).toMatchObject({ state: 'claimed', lease_expires_at: before.lease_expires_at, row_version: before.row_version });
      expect(JSON.stringify(await read('ruleResults', { attemptId: claimed.attempt.id }))).not.toContain(TOKEN);
      expect(JSON.stringify(await read('requestDetail', { requestId: request.id }))).not.toContain(TOKEN);
      expect((await sql('select 1 from core.audit_log where workspace_id = $1 and (detail::text like $2 or summary like $2)', [WORKSPACE_ID, '%0123abcd_ABCDEF%'])).rows).toEqual([]);
    });

    it('a worker fail ends the attempt and the request; the same fail again is the same answer; a result afterwards conflicts', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const failed = await post(workerA, `/requests/${request.id}/fail`, { attemptNo: 1, reason: 'validator crashed' });
      expect(failed.statusCode, failed.body).toBe(200);
      expect(failed.json()).toMatchObject({ state: 'failed', attemptNo: 1 });
      expect((await post(workerA, `/requests/${request.id}/fail`, { attemptNo: 1 })).statusCode).toBe(200);
      expect(await requestRow(request.id)).toMatchObject({ state: 'failed' });
      expect((await attempts(request.id))[0]).toMatchObject({ outcome: 'failed', verdict: null, worker_summary: { reason: 'validator crashed' } });
      const late = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'PASS')]));
      expect(late.statusCode).toBe(409);
      expect(late.json().code).toBe('conflict.stale_write');
      expect((await post(workerA, `/requests/${request.id}/fail`, { attemptNo: 1, reason: 'password = hunter2hunter2' })).statusCode).toBe(422);
      expect((await audit(request.id)).map((e) => e.event_type)).toContain('lifecycle.request.failed');
    });

    it('the 합성 fixture reference worker drives claim -> heartbeat -> result end to end', async () => {
      const round = await makeRound(SAMPLE(3));
      const request = await makeRequest(round.roundId);
      const send = async (method: 'POST', path: string, body: unknown) => {
        const res = await app.inject({ method, url: path, headers: bearer(workerA), payload: body as object });
        return { status: res.statusCode, body: res.statusCode === 204 ? null : res.json() };
      };
      const out = await runMockWorker({ send, mode: 'fail', heartbeats: 2 });
      expect(out.claimed).toBe(true);
      expect(out.request.id).toBe(request.id);
      expect(out.result?.status).toBe(200);
      expect(out.result?.body).toMatchObject({ state: 'succeeded', verdict: 'fail', ruleCount: 3 });
      expect((await runMockWorker({ send })).claimed).toBe(false);
    });
  });

  describe('excerpts: stored apart, hidden by default, read by right, audited without text', () => {
    const EXCERPT = `unique-excerpt-text-${randomUUID()}`;

    async function failedRequestWithExcerpt() {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const body = resultBody(claimed, [
        rule('R1', 'FAIL', true, { observed: 'bad value', evidence: [{ fileRef: FILES()[0]?.fileRef, line: 12, fileSha256: H('b'), excerpt: EXCERPT }, { fileRef: FILES()[1]?.fileRef, line: 2, fileSha256: H('c') }] }),
        rule('R2', 'PASS'),
      ]);
      expect((await post(workerA, `/requests/${request.id}/result`, body)).statusCode).toBe(200);
      const attemptId = claimed.attempt.id as string;
      const ruleId = (await sql("select id from log_lifecycle.rule_result where attempt_id = $1 and rule_id = 'R1'", [attemptId])).rows[0].id as string;
      return { request, attemptId, ruleId, round };
    }

    it('stores the text in rule_result_excerpt only; lists carry hasExcerpt and no text anywhere', async () => {
      const { request, attemptId } = await failedRequestWithExcerpt();
      const stored = (await sql('select evidence_index, excerpt from log_lifecycle.rule_result_excerpt where workspace_id = $1 and excerpt = $2', [WORKSPACE_ID, EXCERPT])).rows;
      expect(stored).toEqual([{ evidence_index: 0, excerpt: EXCERPT }]);
      const list = await read('ruleResults', { attemptId });
      expect(list.data.total).toBe(2);
      const r1 = list.data.rows.find((r: Row) => r.ruleId === 'R1');
      expect(r1).toMatchObject({ result: 'FAIL', required: true, hasExcerpt: true, observed: 'bad value' });
      expect(r1.evidence).toEqual([
        { fileRef: FILES()[0]?.fileRef, line: 12, fileSha256: H('b'), hasExcerpt: true },
        { fileRef: FILES()[1]?.fileRef, line: 2, fileSha256: H('c'), hasExcerpt: false },
      ]);
      expect(list.data.rows.find((r: Row) => r.ruleId === 'R2').hasExcerpt).toBe(false);
      expect(JSON.stringify(list)).not.toContain(EXCERPT);
      expect(JSON.stringify(await read('requestDetail', { requestId: request.id }))).not.toContain(EXCERPT);
      expect(JSON.stringify(await read('ruleResults', { attemptId, results: ['PASS'] }))).not.toContain('R1');
      // No audit row anywhere carries the text.
      const rows = await sql("select detail::text as d, summary from core.audit_log where workspace_id = $1 and (detail::text like $2 or summary like $2)", [WORKSPACE_ID, `%${EXCERPT}%`]);
      expect(rows.rows).toEqual([]);
    });

    it('reads the body only with the source-owner right, audits each read without the text, and refuses from the same call once the right is withdrawn', async () => {
      const { request, ruleId } = await failedRequestWithExcerpt();
      for (const who of [user, admin, manager]) {
        const denied = await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, who);
        expect(denied.outcome, 'no right').toBe('forbidden');
      }
      const ok = await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader);
      expect(ok.outcome).toBe('ok');
      expect(ok.data).toEqual({ ruleResultId: ruleId, evidenceIndex: 0, deleted: false, excerpt: EXCERPT });
      expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 1 }, reader)).data).toBeNull(); // evidence 1 has no excerpt
      expect((await read('excerpt', { ruleResultId: randomUUID(), evidenceIndex: 0 }, reader)).data).toBeNull();
      const reads = (await audit(request.id)).filter((e) => e.event_type === 'lifecycle.excerpt.read');
      expect(reads).toHaveLength(1);
      expect(reads[0]).toMatchObject({ actor_id: reader.id, detail: { ruleResultId: ruleId, evidenceIndex: 0 } });
      expect(JSON.stringify(reads)).not.toContain(EXCERPT);
      // Withdraw the right: the very next call is refused. A right for another source owner does not help.
      expect((await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: reader.id, allowed: false })).outcome).toBe('ok');
      expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader)).outcome).toBe('forbidden');
      expect((await act('excerptAccessSet', { sourceOwner: `${SOURCE}-other`, actorId: reader.id, allowed: true })).outcome).toBe('ok');
      expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader)).outcome).toBe('forbidden');
      expect((await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: reader.id, allowed: true })).outcome).toBe('ok');
      expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader)).outcome).toBe('ok');
    });

    it('a token never reads an excerpt, and only an admin grants the right', async () => {
      const { ruleId } = await failedRequestWithExcerpt();
      expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader, noScopeToken)).outcome).toBe('forbidden');
      expect((await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: user.id, allowed: true }, { who: manager })).outcome).toBe('forbidden');
      expect(fe(await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: randomUUID(), allowed: true }))).toEqual(['actorId:not_found']);
    });

    const stored = async (ruleId: string) =>
      (await sql('select excerpt, deleted_at, deleted_reason from log_lifecycle.rule_result_excerpt where rule_result_id = $1 order by evidence_index', [ruleId])).rows as Row[];
    const noTextInAudit = async (...needles: string[]) => {
      for (const needle of needles) {
        const rows = await sql('select 1 from core.audit_log where workspace_id = $1 and (detail::text like $2 or summary like $2)', [WORKSPACE_ID, `%${needle}%`]);
        expect(rows.rows, needle).toEqual([]);
      }
    };
    const DAY = 86_400_000;

    describe('retention purge (ADR-0117 decision 7)', () => {
      it('erases the body only after the Round was closed for the retention days; rule results and evidence stay; the read says deleted', async () => {
        const { request, ruleId, round, attemptId } = await failedRequestWithExcerpt();
        // Open Round: never purged, however late the clock.
        expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 400 * DAY) })).erased).toBe(0);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: EXCERPT, deleted_at: null });
        expect((await act('roundClose', { id: round.roundId }, { expectedVersion: '1' })).outcome).toBe('ok');
        // Before the boundary (default 90 days): nothing.
        expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 89 * DAY) })).erased).toBe(0);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: EXCERPT, deleted_at: null });
        // After it: erased once, summary audit row without text, second run is a no-op.
        const run = await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * DAY) });
        expect(run.erased).toBeGreaterThanOrEqual(1);
        const row = (await stored(ruleId))[0];
        expect(row).toMatchObject({ excerpt: '', deleted_reason: 'retention' });
        expect(row?.deleted_at).not.toBeNull();
        expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * DAY) })).erased).toBe(0);
        const summary = await sql("select detail, subject_type from core.audit_log where workspace_id = $1 and event_type = 'lifecycle.excerpt.purged' order by created_at desc limit 1", [WORKSPACE_ID]);
        expect(summary.rows[0]).toMatchObject({ subject_type: 'queue_settings', detail: { retentionDays: 90 } });
        await noTextInAudit(EXCERPT);
        // Evidence stays; the read says deleted, never text.
        const list = await read('ruleResults', { attemptId });
        expect(list.data.rows.find((r: Row) => r.ruleId === 'R1')).toMatchObject({ result: 'FAIL', observed: 'bad value' });
        const res = await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader);
        expect(res.data).toEqual({ ruleResultId: ruleId, evidenceIndex: 0, deleted: true, excerpt: null });
        expect(JSON.stringify(res)).not.toContain(EXCERPT);
        expect((await audit(request.id)).filter((e) => e.event_type === 'lifecycle.excerpt.read')).toHaveLength(1);
      });

      it('uses the workspace retention setting', async () => {
        const { ruleId, round } = await failedRequestWithExcerpt();
        expect((await act('queueSettingsUpdate', { excerptRetentionDays: 10 })).outcome).toBe('ok');
        expect((await act('roundClose', { id: round.roundId }, { expectedVersion: '1' })).outcome).toBe('ok');
        expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 9 * DAY) })).erased).toBe(0);
        expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 11 * DAY) })).erased).toBeGreaterThanOrEqual(1);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: '' });
      });

      it('works in batches of the given size', async () => {
        const { ruleId, round } = await failedRequestWithExcerpt();
        expect((await act('roundClose', { id: round.roundId }, { expectedVersion: '1' })).outcome).toBe('ok');
        const run = await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * DAY), batchSize: 1 });
        expect(run.erased).toBeGreaterThanOrEqual(1);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: '' });
      });
    });

    describe('administrator deletion (excerptDelete)', () => {
      it('deletes at attempt scope with a reason; audited without text; the read says deleted', async () => {
        const { request, ruleId, attemptId } = await failedRequestWithExcerpt();
        const done = await act('excerptDelete', { scope: 'attempt', id: attemptId, reason: 'ticket-1234 customer request' });
        expect(done.outcome, JSON.stringify(done)).toBe('ok');
        expect(done.data.count).toBe(1);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: '', deleted_reason: 'ticket-1234 customer request' });
        const ev = (await audit(request.id)).find((e) => e.event_type === 'lifecycle.excerpt.deleted');
        expect(ev?.detail).toEqual({ scope: 'attempt', count: 1, attemptId });
        await noTextInAudit(EXCERPT, 'ticket-1234');
        expect((await read('excerpt', { ruleResultId: ruleId, evidenceIndex: 0 }, reader)).data).toMatchObject({ deleted: true, excerpt: null });
        expect((await act('excerptDelete', { scope: 'attempt', id: attemptId, reason: 'again' })).data.count).toBe(0); // idempotent
      });

      it('deletes at Round scope, also on an open Round', async () => {
        const { ruleId, round } = await failedRequestWithExcerpt();
        const done = await act('excerptDelete', { scope: 'round', id: round.roundId, reason: 'privacy' });
        expect(done.outcome, JSON.stringify(done)).toBe('ok');
        expect(done.data.count).toBe(1);
        expect((await stored(ruleId))[0]).toMatchObject({ excerpt: '' });
        const ev = await sql("select detail, subject_type, subject_id from core.audit_log where event_type = 'lifecycle.excerpt.deleted' and subject_id = $1", [round.roundId]);
        expect(ev.rows[0]).toMatchObject({ subject_type: 'validation_round', detail: { scope: 'round', count: 1 } });
      });

      it('needs a reason, an admin session, and an existing Round / attempt of this workspace', async () => {
        const { ruleId, round, attemptId } = await failedRequestWithExcerpt();
        expect(fe(await act('excerptDelete', { scope: 'round', id: round.roundId }))).toEqual(['reason:required']);
        expect(fe(await act('excerptDelete', { scope: 'round', id: round.roundId, reason: '   ' }))).toEqual(['reason:required']);
        expect(fe(await act('excerptDelete', { scope: 'attempt', id: randomUUID(), reason: 'x' }))).toEqual(['id:not_found']);
        expect(fe(await act('excerptDelete', { scope: 'round', id: attemptId, reason: 'x' }))).toEqual(['id:not_found']); // an attempt id is no Round
        expect((await act('excerptDelete', { scope: 'round', id: round.roundId, reason: 'x' }, { who: manager })).outcome).toBe('forbidden');
        expect((await act('excerptDelete', { scope: 'round', id: round.roundId, reason: 'x' }, { who: reader })).outcome).toBe('forbidden');
        // A token never deletes an excerpt (ADR-0117 decision 9): `console:access` is `workspace.admin`, a session-only
        // capability, so the check refuses it before any DML. A judged refusal on the menu port is HTTP 200 + `forbidden`.
        for (const [scope, id] of [['round', round.roundId], ['attempt', attemptId]] as const) {
          const asToken = await act('excerptDelete', { scope, id, reason: 'x' }, { token: noScopeToken });
          expect(asToken.outcome, scope).toBe('forbidden');
          expect((await stored(ruleId))[0], scope).toMatchObject({ excerpt: EXCERPT, deleted_at: null, deleted_reason: null });
        }
      });
    });

    it('the runtime role cannot UPDATE or DELETE the excerpt table directly; even the owner may only erase a live row once', async () => {
      const { ruleId } = await failedRequestWithExcerpt();
      const app_ = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
      await expect(app_("update log_lifecycle.rule_result_excerpt set excerpt = '' where rule_result_id = $1", [ruleId])).rejects.toThrow(/permission denied/);
      await expect(app_("update log_lifecycle.rule_result_excerpt set deleted_at = now() where rule_result_id = $1", [ruleId])).rejects.toThrow(/permission denied/);
      await expect(app_('delete from log_lifecycle.rule_result_excerpt where rule_result_id = $1', [ruleId])).rejects.toThrow(/permission denied/);
      // The guard trigger refuses every UPDATE except body -> empty with deleted_at + reason set.
      await expect(sql("update log_lifecycle.rule_result_excerpt set excerpt = 'edited' where rule_result_id = $1", [ruleId])).rejects.toThrow(/can only be erased once/);
      await expect(sql("update log_lifecycle.rule_result_excerpt set deleted_at = now() where rule_result_id = $1", [ruleId])).rejects.toThrow(/length_check|can only be erased once/);
      await expect(sql("update log_lifecycle.rule_result_excerpt set excerpt = '', deleted_at = now() where rule_result_id = $1", [ruleId])).rejects.toThrow(/can only be erased once/); // no reason
      await expect(sql("update log_lifecycle.rule_result_excerpt set evidence_index = 5, excerpt = '', deleted_at = now(), deleted_reason = 'x' where rule_result_id = $1", [ruleId])).rejects.toThrow(/can only be erased once/);
      // Not even the owner removes a row: the tombstone stays.
      await expect(sql('delete from log_lifecycle.rule_result_excerpt where rule_result_id = $1', [ruleId])).rejects.toThrow(/cannot be deleted/);
      expect((await stored(ruleId))[0]).toMatchObject({ excerpt: EXCERPT, deleted_at: null });
      // The one door the runtime role has: the definer function, which needs exactly one scope and another workspace sees nothing.
      await expect(app_("select log_lifecycle.erase_excerpts($1, null, null, null, 'x', 10)", [WORKSPACE_ID])).rejects.toThrow(/exactly one scope/);
      expect((await app_("select log_lifecycle.erase_excerpts($1, $2, null, null, 'x', 10) as n", [randomUUID(), randomUUID()])).rows[0].n).toBe(0);
      await sql("update log_lifecycle.rule_result_excerpt set excerpt = '', deleted_at = now(), deleted_reason = 'x' where rule_result_id = $1", [ruleId]);
      await expect(sql("update log_lifecycle.rule_result_excerpt set deleted_reason = 'y' where rule_result_id = $1", [ruleId])).rejects.toThrow(/can only be erased once/);
      await expect(sql('delete from log_lifecycle.rule_result_excerpt where rule_result_id = $1', [ruleId])).rejects.toThrow(/cannot be deleted/); // the erased tombstone too
      expect((await stored(ruleId))).toHaveLength(1);
    });
    describe('evidenceStates (#1815 A2)', () => {
      it('returns live and unsubmitted states, same-file hash mismatches and no body or audit text', async () => {
        const { ruleId, request } = await failedRequestWithExcerpt();
        const got = await read('evidenceStates', { ruleResultId: ruleId }, reader);
        expect(got.outcome).toBe('ok');
        expect(got.data.rows).toEqual([
          { ruleResultId: ruleId, evidenceIndex: 0, evidenceRef: { fileRef: FILES()[0]?.fileRef, line: 12, fileSha256: H('b') }, excerptState: 'not_loaded', sourceState: 'hash_mismatch' },
          { ruleResultId: ruleId, evidenceIndex: 1, evidenceRef: { fileRef: FILES()[1]?.fileRef, line: 2, fileSha256: H('c') }, excerptState: 'not_submitted', sourceState: 'hash_mismatch' },
        ]);
        expect(JSON.stringify(got)).not.toContain(EXCERPT);
        expect(JSON.stringify(await audit(request.id))).not.toContain(EXCERPT);
      });

      it('checks source rights each call, preserves public not_submitted, and refuses tokens', async () => {
        const { ruleId } = await failedRequestWithExcerpt();
        const denied = await read('evidenceStates', { ruleResultId: ruleId }, user);
        expect(denied.outcome).toBe('ok');
        expect(denied.data.rows.map((r: Row) => [r.excerptState, r.sourceState])).toEqual([['no_permission', 'no_permission'], ['not_submitted', 'no_permission']]);
        expect((await read('evidenceStates', { ruleResultId: ruleId }, reader)).data.rows[0].excerptState).toBe('not_loaded');
        expect((await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: reader.id, allowed: false })).outcome).toBe('ok');
        expect((await read('evidenceStates', { ruleResultId: ruleId }, reader)).data.rows[0].excerptState).toBe('no_permission');
        expect((await act('excerptAccessSet', { sourceOwner: SOURCE, actorId: reader.id, allowed: true })).outcome).toBe('ok');
        expect((await read('evidenceStates', { ruleResultId: ruleId }, reader, noScopeToken)).outcome).toBe('forbidden');
      });

      it('refuses a token that passes the platform read permission before looking up source state', async () => {
        const { ruleId } = await failedRequestWithExcerpt();
        const token = await issueServiceToken(systemA, ['workspace.read']);
        expect(await read('evidenceStates', { ruleResultId: ruleId }, reader, token)).toMatchObject({ outcome: 'forbidden', data: null, message: 'evidence state reads need a login session' });
      });

      it('treats hidden and unknown results as missing and rejects index probes or unknown keys', async () => {
        const { ruleId, round } = await failedRequestWithExcerpt();
        await sql("update knowledge.equipment_model set access_mode = 'restricted' where id = $1", [round.modelId]);
        for (const who of [reader, user]) expect(await read('evidenceStates', { ruleResultId: ruleId }, who)).toMatchObject({ outcome: 'ok', data: null });
        expect(await read('evidenceStates', { ruleResultId: randomUUID() }, user)).toMatchObject({ outcome: 'ok', data: null });
        for (const params of [{ ruleResultId: ruleId, evidenceIndex: 19 }, { ruleResultId: ruleId, extra: true }, { ruleResultId: 'bad' }]) {
          expect((await read('evidenceStates', params)).outcome).toBe('error');
        }
      });

      it.each(['retention', 'synthetic-admin-reason', 'legacy-unknown'])('never guesses erasure provenance from free text (%s)', async (reason) => {
        const { ruleId, attemptId } = await failedRequestWithExcerpt();
        expect((await act('excerptDelete', { scope: 'attempt', id: attemptId, reason })).outcome).toBe('ok');
        const got = await read('evidenceStates', { ruleResultId: ruleId }, reader);
        expect(got.data.rows[0].excerptState).toBe('unknown');
        expect(JSON.stringify(got)).not.toContain(reason);
      });

      it('keeps purge erasure unknown because the same retention marker is also accepted from admins', async () => {
        const { ruleId, round } = await failedRequestWithExcerpt();
        expect((await act('roundClose', { id: round.roundId }, { expectedVersion: '1' })).outcome).toBe('ok');
        await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 100 * DAY) });
        expect((await stored(ruleId))[0]).toMatchObject({ deleted_reason: 'retention' });
        expect((await read('evidenceStates', { ruleResultId: ruleId }, reader)).data.rows[0].excerptState).toBe('unknown');
      });

      it('preserves duplicate indices and leaves a matching Source unchecked', async () => {
        const round = await makeRound();
        const request = await makeRequest(round.roundId);
        const claimed = (await claim()).json();
        const loc = { fileRef: FILES()[0]?.fileRef, line: 7, fileSha256: H('a') };
        expect((await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('SYN-1', 'FAIL', true, { evidence: [{ ...loc, excerpt: EXCERPT }, loc] })]))).statusCode).toBe(200);
        const ruleId = (await sql('select id from log_lifecycle.rule_result where attempt_id = $1', [claimed.attempt.id])).rows[0].id;
        const got = await read('evidenceStates', { ruleResultId: ruleId }, reader);
        expect(got.data.rows.map((r: Row) => [r.evidenceIndex, r.excerptState, r.sourceState])).toEqual([[0, 'not_loaded', 'not_checked'], [1, 'not_submitted', 'not_checked']]);
        expect(got.data.rows[0].evidenceRef).toEqual(got.data.rows[1].evidenceRef);
      });
    });

  });

  describe('reads', () => {
    it('filters the list by state, priority and immediate, and reports the immediate share of the filtered set', async () => {
      const round = await makeRound();
      await makeRequest(round.roundId, { priority: 0 });
      const imm = await makeRequest(round.roundId, { priority: 2, immediate: true });
      const claimedBody = (await claim()).json();
      expect(claimedBody.request.id).toBe(imm.id);
      const all = await read('requests', { roundId: round.roundId });
      expect(all.data).toMatchObject({ total: 2, immediateTotal: 1 });
      expect((await read('requests', { roundId: round.roundId, states: ['claimed'] })).data.rows.map((r: Row) => r.id)).toEqual([imm.id]);
      expect((await read('requests', { roundId: round.roundId, immediate: false })).data.total).toBe(1);
      expect((await read('requests', { roundId: round.roundId, priority: 2 })).data.total).toBe(1);
      const bad = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) }, payload: JSON.stringify({ endpoint: 'logLifecycle.requests', context: {}, params: { states: ['nope'] } }) });
      expect(bad.json().outcome).toBe('error');
      const unknown = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) }, payload: JSON.stringify({ endpoint: 'logLifecycle.requests', context: {}, params: { workspaceId: 'x' } }) });
      expect(unknown.json().outcome).toBe('error');
    });

    it('an unknown request or attempt answers ok with null / an empty page', async () => {
      expect((await read('requestDetail', { requestId: randomUUID() })).data).toBeNull();
      expect((await read('ruleResults', { attemptId: randomUUID() })).data).toEqual({ total: 0, rows: [] });
    });
  });

  describe('evidence side table and logExplorer.evidenceLinks (#1470 X-d)', () => {
    const queryLinks = (params: Record<string, unknown>, who: Person = user, token?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', ...(token ? bearer(token) : cookieHeader(who.cookie)) },
        payload: JSON.stringify({ endpoint: 'logExplorer.evidenceLinks', context: {}, params }),
      });
    const readLinks = async (params: Record<string, unknown>, who: Person = user, token?: string): Promise<Answer> => {
      const res = await queryLinks(params, who, token);
      expect(res.statusCode, res.body).toBe(200);
      return res.json<Answer>();
    };
    /** A token row inserted directly (a personal token or a scope set the issue route does not offer). */
    const rawToken = async (actorId: string, kind: 'personal' | 'service', scopes: string[]) => {
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      await sql(
        `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,$3,'raw',$4,$5,$6,$7)`,
        [WORKSPACE_ID, actorId, kind, prefix, hashToken(value), scopes, kind === 'personal' ? actorId : admin.id],
      );
      return value;
    };
    /** A sample set of the default two files plus `extra` file references. */
    const sampleWith = (...extra: string[]) => ({
      files: [...FILES(), ...extra.map((fileRef, i) => ({ fileRef, order: 3 + i, sha256: H('a') }))],
      sourceOwner: SOURCE,
    });
    /** The same chain (project → round → request → attempt → rule result → side row) in a second workspace, by SQL. */
    async function seedForeignChain(location: { fileRef: string; line: number; fileSha256: string }) {
      if (!foreignWorkspaceId) {
        foreignWorkspaceId = randomUUID();
        await sql("insert into core.workspaces (id, name) values ($1, $2)", [foreignWorkspaceId, `${TAG}-foreign`]);
      }
      const ids = { project: randomUUID(), round: randomUUID(), request: randomUUID(), attempt: randomUUID(), result: randomUUID() };
      const sample = JSON.stringify({ files: [{ fileRef: location.fileRef, order: 1, sha256: H('a') }], sourceOwner: SOURCE });
      await sql(
        `insert into log_lifecycle.development_project (id, workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,$3,'new',$4,$4,$4)`,
        [ids.project, foreignWorkspaceId, randomUUID(), admin.id],
      );
      await sql(
        `insert into log_lifecycle.validation_round (id, workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,$3,1,'registered',$4::jsonb,$5,$6,$6)`,
        [ids.round, foreignWorkspaceId, ids.project, sample, H('c'), admin.id],
      );
      await sql(
        `insert into log_lifecycle.execution_request (id, workspace_id, round_id, priority, request_digest, requested_by_actor_id, idempotency_key) values ($1,$2,$3,1,$4,$5,$6)`,
        [ids.request, foreignWorkspaceId, ids.round, H('d'), admin.id, `${TAG}-foreign-${ids.request}`],
      );
      await sql(
        `insert into log_lifecycle.execution_attempt (id, workspace_id, request_id, attempt_no, worker_actor_id, input_manifest_digest, outcome, verdict, result_digest, ended_at) values ($1,$2,$3,1,$4,$5,'succeeded','fail',$6,now())`,
        [ids.attempt, foreignWorkspaceId, ids.request, systemA, H('c'), H('e')],
      );
      await sql(`insert into log_lifecycle.rule_result (id, workspace_id, attempt_id, rule_id, result, required, evidence) values ($1,$2,$3,'FOREIGN','FAIL',true,$4::jsonb)`, [
        ids.result,
        foreignWorkspaceId,
        ids.attempt,
        JSON.stringify([{ ...location, hasExcerpt: false }]),
      ]);
      await sql(`insert into log_lifecycle.rule_result_evidence (rule_result_id, workspace_id, file_ref, line, file_sha256) values ($1,$2,$3,$4,$5)`, [
        ids.result,
        foreignWorkspaceId,
        location.fileRef,
        location.line,
        location.fileSha256,
      ]);
      return ids;
    }
    // `line` is a bigint column (the pg driver returns text): read it back as a number.
    const sideRows = async (ruleResultId: string) =>
      (await sql('select file_ref, line, file_sha256 from log_lifecycle.rule_result_evidence where rule_result_id = $1 order by file_ref, line', [ruleResultId])).rows.map(
        (r) => ({ ...r, line: Number(r.line) }),
      ) as Row[];
    /** A round with one claimed request answered with `rules`; returns the ids. */
    async function answered(rules: Row[], sample = SAMPLE()) {
      const round = await makeRound(sample);
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      const res = await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, rules));
      return { round, request, claimed, res, attemptId: claimed.attempt.id as string };
    }
    const ruleIdOf = async (attemptId: string, key: string) =>
      (await sql('select id from log_lifecycle.rule_result where attempt_id = $1 and rule_id = $2', [attemptId, key])).rows[0]?.id as string | undefined;
    const F1 = FILES()[0]?.fileRef ?? '';
    const F2 = FILES()[1]?.fileRef ?? '';

    it('writes one side row per distinct location with the result, no text, and the runtime role cannot edit or delete them', async () => {
      const dup = { fileRef: F1, line: 7, fileSha256: H('d') };
      const a = await answered([rule('R1', 'FAIL', true, { evidence: [dup, { ...dup, excerpt: 'same place, with text' }, { fileRef: F2, line: 3, fileSha256: H('e') }] })]);
      expect(a.res.statusCode).toBe(200);
      const id = (await ruleIdOf(a.attemptId, 'R1')) ?? '';
      expect(await sideRows(id)).toEqual([
        { file_ref: F1, line: 7, file_sha256: H('d') },
        { file_ref: F2, line: 3, file_sha256: H('e') },
      ]);
      const cols = (await sql("select column_name from information_schema.columns where table_schema = 'log_lifecycle' and table_name = 'rule_result_evidence'")).rows.map((r) => r.column_name);
      expect(cols.sort()).toEqual(['file_ref', 'file_sha256', 'line', 'rule_result_id', 'workspace_id']);
      const app_ = (text: string) => dbHandle.pool.query(text, [id]);
      await expect(app_("update log_lifecycle.rule_result_evidence set line = 9 where rule_result_id = $1")).rejects.toThrow(/permission denied/);
      await expect(app_('delete from log_lifecycle.rule_result_evidence where rule_result_id = $1')).rejects.toThrow(/permission denied/);
      await expect(sql('update log_lifecycle.rule_result_evidence set line = 9 where rule_result_id = $1', [id])).rejects.toThrow(/append-only/);
      await expect(sql('delete from log_lifecycle.rule_result_evidence where rule_result_id = $1', [id])).rejects.toThrow(/append-only/);
      // Same-workspace composite FK: a row naming another workspace for this result is refused.
      const other = (await sql('select id from core.workspaces where id <> $1 limit 1', [WORKSPACE_ID])).rows[0]?.id as string | undefined;
      if (other) {
        await expect(sql('insert into log_lifecycle.rule_result_evidence (rule_result_id, workspace_id, file_ref, line, file_sha256) values ($1,$2,$3,1,$4)', [id, other, F1, H('d')])).rejects.toThrow(/foreign key/);
      }
    });

    it('a failed side insert rolls the result back: no rule result, the attempt still running', async () => {
      await sql(`create or replace function log_lifecycle.test_evidence_fail() returns trigger language plpgsql as $f$ begin if new.file_ref like '%ROLLBACK-MARK%' then raise exception 'side insert refused'; end if; return new; end $f$`);
      await sql('create trigger test_evidence_fail before insert on log_lifecycle.rule_result_evidence for each row execute function log_lifecycle.test_evidence_fail()');
      try {
        const marked = `${F1}-ROLLBACK-MARK`;
        const a = await answered([rule('R1', 'PASS'), rule('R2', 'FAIL', true, { evidence: [{ fileRef: marked, line: 1, fileSha256: H('f') }] })], sampleWith(marked));
        // The marker file is in the Round sample, so the payload passes validation and the failure comes from the side insert itself.
        expect(a.res.statusCode).toBeGreaterThanOrEqual(500);
        expect(a.res.body).not.toContain('not_in_sample');
        expect((await sql('select count(*)::int as n from log_lifecycle.rule_result where attempt_id = $1', [a.attemptId])).rows[0]?.n).toBe(0);
        expect((await attempts(a.request.id))[0]).toMatchObject({ outcome: 'running' });
      } finally {
        await sql('drop trigger test_evidence_fail on log_lifecycle.rule_result_evidence');
        await sql('drop function log_lifecycle.test_evidence_fail()');
      }
    });

    it('backfills side rows from the jsonb evidence of existing results, idempotently', async () => {
      const BIG = 2_147_483_648;
      const a = await answered([rule('R1', 'FAIL', true, { evidence: [{ fileRef: F1, line: 21, fileSha256: H('a') }, { fileRef: F2, line: 22, fileSha256: H('b') }, { fileRef: F2, line: BIG, fileSha256: H('b') }] })]);
      const id = (await ruleIdOf(a.attemptId, 'R1')) ?? '';
      const c = await migrate.pool.connect();
      try {
        await c.query('alter table log_lifecycle.rule_result_evidence disable trigger rule_result_evidence_append_only');
        await c.query('delete from log_lifecycle.rule_result_evidence where rule_result_id = $1', [id]);
        await c.query('alter table log_lifecycle.rule_result_evidence enable trigger rule_result_evidence_append_only');
      } finally {
        c.release();
      }
      expect(await sideRows(id)).toEqual([]);
      const migrations = new URL('../../../../migrations/', import.meta.url);
      const name = readdirSync(migrations).find((f) => f.endsWith('_rule_result_evidence.sql'));
      const file = readFileSync(new URL(name ?? 'missing', migrations), 'utf8');
      const backfill = file.slice(file.indexOf('INSERT INTO log_lifecycle.rule_result_evidence'));
      await sql(backfill);
      await sql(backfill);
      expect(await sideRows(id)).toEqual([
        { file_ref: F1, line: 21, file_sha256: H('a') },
        { file_ref: F2, line: 22, file_sha256: H('b') },
        { file_ref: F2, line: BIG, file_sha256: H('b') },
      ]);
    });

    it('stores and finds a line above the 32-bit range (2147483648)', async () => {
      const LOC = { fileRef: F1, line: 2_147_483_648, fileSha256: H('7') };
      const a = await answered([rule('RBIG', 'FAIL', true, { evidence: [LOC] })]);
      expect(a.res.statusCode, a.res.body).toBe(200);
      expect(await sideRows((await ruleIdOf(a.attemptId, 'RBIG')) ?? '')).toEqual([{ file_ref: F1, line: 2_147_483_648, file_sha256: H('7') }]);
      const got = await readLinks(LOC);
      expect(got.outcome).toBe('ok');
      expect(got.data.results.total).toBe(1);
      expect(got.data.results.rows[0]).toMatchObject({ ruleKey: 'RBIG', roundId: a.round.roundId });
    });

    it('finds the rule results and Rounds that cite a location, newest first, deduped, paged; a body never appears', async () => {
      const LOC = { fileRef: `s3://${TAG}/lookup.log`, line: 40, fileSha256: H('9') };
      const first = await answered([rule('RA', 'FAIL', true, { evidence: [{ ...LOC, excerpt: `secret-body-${TAG}` }, { ...LOC }] }), rule('RB', 'WARN', false, { evidence: [LOC] })], sampleWith(LOC.fileRef));
      const second = await answered([rule('RC', 'PASS', true, { evidence: [LOC, { fileRef: F1, line: 1, fileSha256: H('1') }] })], sampleWith(LOC.fileRef));
      expect(first.res.statusCode).toBe(200);
      expect(second.res.statusCode).toBe(200);
      const got = await readLinks(LOC);
      expect(got.outcome).toBe('ok');
      expect(got.data.results.total).toBe(3);
      expect(got.data.results.rows.map((r: Row) => r.ruleKey)[0]).toBe('RC'); // the newest attempt first
      expect(new Set(got.data.results.rows.map((r: Row) => r.ruleKey))).toEqual(new Set(['RA', 'RB', 'RC']));
      expect(got.data.results.rows.find((r: Row) => r.ruleKey === 'RA')).toMatchObject({ result: 'FAIL', required: true, roundId: first.round.roundId, requestId: first.request.id, attemptId: first.attemptId });
      expect(got.data.rounds.total).toBe(2);
      expect(got.data.rounds.rows.map((r: Row) => r.roundId)).toEqual([second.round.roundId, first.round.roundId]);
      expect(got.data.rounds.rows[1]).toMatchObject({ citingResults: 2, status: 'open' });
      expect(JSON.stringify(got)).not.toContain('secret-body');
      // Paging: one per page, no overlap, same total.
      const p0 = await readLinks({ ...LOC, pageSize: 1, page: 0 });
      const p1 = await readLinks({ ...LOC, pageSize: 1, page: 1 });
      expect(p0.data.results.rows).toHaveLength(1);
      expect(p1.data.results.rows).toHaveLength(1);
      expect(p0.data.results.rows[0].ruleResultId).not.toBe(p1.data.results.rows[0].ruleResultId);
      expect(p1.data.results.total).toBe(3);
      // Unknown location, other line or other hash: the same empty answer.
      for (const miss of [{ ...LOC, line: 41 }, { ...LOC, fileSha256: H('8') }, { ...LOC, fileRef: 'nope' }]) {
        expect((await readLinks(miss)).data).toEqual({ results: { total: 0, rows: [] }, rounds: { total: 0, rows: [] } });
      }
    });

    it('evidenceStates hides a result from another workspace', async () => {
      const foreign = await seedForeignChain({ fileRef: `s3://${TAG}/state-foreign.log`, line: 1, fileSha256: H('a') });
      expect(await read('evidenceStates', { ruleResultId: foreign.result }, reader)).toMatchObject({ outcome: 'ok', data: null });
    });

    it('another workspace\'s citation answers like an unknown location and never changes a total or a page', async () => {
      const LOC = { fileRef: `s3://${TAG}/iso.log`, line: 5, fileSha256: H('6') };
      const FOREIGN_ONLY = { fileRef: `s3://${TAG}/iso-foreign.log`, line: 6, fileSha256: H('5') };
      const mine = await answered([rule('RISO', 'FAIL', true, { evidence: [LOC] })], sampleWith(LOC.fileRef));
      expect(mine.res.statusCode, mine.res.body).toBe(200);
      const unknown = (await readLinks({ ...FOREIGN_ONLY, fileRef: `s3://${TAG}/never.log` })).data;
      const before = (await readLinks({ ...LOC, pageSize: 1 })).data;
      const beforeForeignOnly = (await readLinks(FOREIGN_ONLY)).data;
      expect(beforeForeignOnly).toEqual(unknown);
      // The same location cited in a real chain of another workspace, and a location only that workspace cites.
      const sameLocation = await seedForeignChain(LOC);
      await seedForeignChain(FOREIGN_ONLY);
      const foreignRow = (await sql('select count(*)::int as n from log_lifecycle.rule_result_evidence where workspace_id = $1 and rule_result_id = $2', [foreignWorkspaceId, sameLocation.result])).rows[0];
      expect(foreignRow?.n).toBe(1);
      const after = (await readLinks({ ...LOC, pageSize: 1 })).data;
      expect(after).toEqual(before);
      expect(after.results.total).toBe(1);
      expect(after.rounds.total).toBe(1);
      expect(JSON.stringify(after)).not.toContain(sameLocation.round);
      expect(JSON.stringify(after)).not.toContain(sameLocation.result);
      expect((await readLinks({ ...LOC, pageSize: 1, page: 1 })).data).toEqual({ results: { total: 1, rows: [] }, rounds: { total: 1, rows: [] } });
      expect((await readLinks(FOREIGN_ONLY)).data).toEqual(unknown);
      expect(unknown).toEqual({ results: { total: 0, rows: [] }, rounds: { total: 0, rows: [] } });
    });

    it('a token needs workspace.read: a personal and a service token without it are refused, with it they read', async () => {
      const LOC = { fileRef: `s3://${TAG}/tok.log`, line: 8, fileSha256: H('4') };
      const a = await answered([rule('RTOK', 'FAIL', true, { evidence: [LOC] })], sampleWith(LOC.fileRef));
      expect(a.res.statusCode, a.res.body).toBe(200);
      // The Actor can read (role user holds workspace.read); only the token scopes differ.
      const personalWithout = await rawToken(user.id, 'personal', ['lifecycle.round.manage']);
      const serviceWithout = await rawToken(systemA, 'service', ['validation.worker']);
      const personalWith = await rawToken(user.id, 'personal', ['workspace.read']);
      const serviceWith = await rawToken(systemA, 'service', ['workspace.read']);
      expect((await readLinks(LOC, user)).outcome).toBe('ok'); // the session control: same Actor, same location
      for (const token of [personalWithout, serviceWithout]) {
        const res = await queryLinks(LOC, user, token);
        const refused = res.statusCode >= 400 || res.json<Answer>().outcome !== 'ok';
        expect(refused, res.body).toBe(true);
        expect(res.body).not.toContain('RTOK');
        expect(res.body).not.toContain(a.round.roundId);
      }
      for (const token of [personalWith, serviceWith]) {
        const got = await readLinks(LOC, user, token);
        expect(got.outcome).toBe('ok');
        expect(got.data.results.total).toBe(1);
        expect(got.data.results.rows[0]).toMatchObject({ ruleKey: 'RTOK', roundId: a.round.roundId });
      }
    });

    it('refuses bad or unknown params; the audit log gets no new row', async () => {
      const before = (await sql('select count(*)::int as n from core.audit_log where workspace_id = $1', [WORKSPACE_ID])).rows[0]?.n as number;
      for (const bad of [{}, { fileRef: 'x', line: 0, fileSha256: H('a') }, { fileRef: 'x', line: 1, fileSha256: 'abc' }, { fileRef: '', line: 1, fileSha256: H('a') }, { fileRef: 'x', line: 1, fileSha256: H('a'), workspaceId: 'x' }, { fileRef: 'x', line: 1, fileSha256: H('a'), pageSize: 1000 }]) {
        expect((await readLinks(bad)).outcome).toBe('error');
      }
      expect((await sql('select count(*)::int as n from core.audit_log where workspace_id = $1', [WORKSPACE_ID])).rows[0]?.n).toBe(before);
    });
  });

  describe('DB walls', () => {
    it('the runtime role cannot edit a rule result, delete a request, or move a terminal request', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      const claimed = (await claim()).json();
      await post(workerA, `/requests/${request.id}/result`, resultBody(claimed, [rule('R1', 'PASS')]));
      const app_ = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
      await expect(app_("update log_lifecycle.rule_result set result = 'FAIL' where attempt_id = $1", [claimed.attempt.id])).rejects.toThrow(/permission denied/);
      await expect(app_('delete from log_lifecycle.execution_request where id = $1', [request.id])).rejects.toThrow(/permission denied/);
      await expect(app_('delete from log_lifecycle.rule_result where attempt_id = $1', [claimed.attempt.id])).rejects.toThrow(/permission denied/);
      await expect(app_("update log_lifecycle.execution_request set state = 'queued', row_version = row_version + 1 where id = $1", [request.id])).rejects.toThrow(/cannot move from succeeded to queued/);
      await expect(app_("update log_lifecycle.execution_request set priority = 0, row_version = row_version + 1 where id = $1", [request.id])).rejects.toThrow(/permission denied/);
      await expect(sql("update log_lifecycle.execution_request set priority = 0, row_version = row_version + 1 where id = $1", [request.id])).rejects.toThrow(/identity columns cannot change/);
      await expect(sql("update log_lifecycle.execution_request set cancel_reason = 'x' where id = $1", [request.id])).rejects.toThrow(/row_version/);
      await expect(sql("update log_lifecycle.execution_attempt set verdict = 'fail' where request_id = $1", [request.id])).rejects.toThrow(/final/);
    });

    it('a round keeps its samples once a request exists (round_guard) and the request digest ties to them', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      await expect(sql("update log_lifecycle.validation_round set sample_set = '{\"files\":[],\"sourceOwner\":\"x\"}'::jsonb, row_version = row_version + 1 where id = $1", [round.roundId])).rejects.toThrow(/input columns cannot change/);
      expect((await requestRow(request.id)).request_digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('a claimed row must carry its lease and no other state may', async () => {
      const round = await makeRound();
      const request = await makeRequest(round.roundId);
      await expect(sql("update log_lifecycle.execution_request set state = 'claimed', attempt_count = 1, row_version = row_version + 1 where id = $1", [request.id])).rejects.toThrow(/lease_check/);
    });
  });
});
