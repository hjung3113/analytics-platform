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
import { purgeExpiredExcerpts } from '../excerpt-purge-job.js';
import { declaredRouteAuth } from '../../../middleware/route-auth.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `DG${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const Q = '/api/v1/validation-queue';
const SATURDAY_NOON = new Date('2026-11-14T12:00:00+09:00'); // inside the default run window
const TEXT = 'SYNTHETIC-DIAGNOSTIC-SOURCE-TEXT';

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

describe.skipIf(!runIntegration)('attempt diagnostics (#1815 B1)', () => {
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
      payload: JSON.stringify({ action: `logLifecycle.${action}`, context: {}, input, ...(action === 'roundClose' ? { expectedVersion: '1' } : {}), idempotencyKey: randomUUID() }),
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
    return { requestId, modelId, roundId: r.data.roundId as string, attemptId: claimed.attempt.id as string, attemptNo: claimed.attempt.attemptNo as number, verdict: result.json().verdict as string };
  }
  const path = (requestId: string, attemptNo: number | string = 1) => `/requests/${requestId}/attempts/${attemptNo}/diagnostics`;
  const document = (over: Row = {}) => ({ schemaVersion: 1, producer: 'synthetic', producerVersion: '1.0', inputManifestDigest: sampleManifestDigest(SAMPLE()), items: [{ itemKey: 'diagnostic:item', origin: 'rule', ruleId: 'R1', title: TEXT, explanation: TEXT, evidenceRefs: [{ fileRef: FILES()[0]?.fileRef, line: 1, fileSha256: H('a') }], tables: [{ tableKey: 'data', title: TEXT, columns: [{ key: 'value', label: TEXT, type: 'string' }], rows: Array.from({ length: 200 }, () => ({ value: TEXT })) }] }], ...over });
  const write = (requestId: string, body: unknown = document(), token = workerA) => post(token, path(requestId), body);
  const grant = (allowed: boolean) => act('excerptAccessSet', { sourceOwner: SAMPLE().sourceOwner, actorId: user.id, allowed });
  const itemQuery = (attemptId: string) => ({ attemptId, producer: 'synthetic', itemKey: 'diagnostic:item' });

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
    const cleanup = await migrate.pool.connect();
    try {
      await cleanup.query('begin');
      await cleanup.query('alter table log_lifecycle.attempt_diagnostic_item disable trigger attempt_diagnostic_item_no_delete');
      await cleanup.query('delete from log_lifecycle.attempt_diagnostic_item where workspace_id = $1', [WORKSPACE_ID]);
      await cleanup.query('alter table log_lifecycle.attempt_diagnostic_item enable trigger attempt_diagnostic_item_no_delete');
      await cleanup.query('alter table log_lifecycle.attempt_diagnostic disable trigger attempt_diagnostic_append_only');
      await cleanup.query('delete from log_lifecycle.attempt_diagnostic where workspace_id = $1', [WORKSPACE_ID]);
      await cleanup.query('alter table log_lifecycle.attempt_diagnostic enable trigger attempt_diagnostic_append_only');
      await cleanup.query('commit');
    } catch (error) { await cleanup.query('rollback'); throw error; } finally { cleanup.release(); }
    await sql('delete from log_lifecycle.excerpt_reader where workspace_id = $1', [WORKSPACE_ID]);
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

  it('registers guarded token-only writes and commits one audited document per producer', async () => {
    const s = await succeeded();
    expect(declaredRouteAuth(app).find((r) => r.url.endsWith('/diagnostics'))?.mode).toBe('guard');
    const fresh = await write(s.requestId);
    expect(fresh.statusCode, fresh.body).toBe(200);
    expect(fresh.json()).toMatchObject({ requestId: s.requestId, attemptNo: 1, itemCount: 1, duplicate: false });
    expect((await write(s.requestId, document(), workerB)).json()).toMatchObject({ duplicate: true });
    expect((await write(s.requestId, document({ producerVersion: '2' }))).statusCode).toBe(409);
    const rows = await sql('select * from log_lifecycle.attempt_diagnostic where attempt_id = $1', [s.attemptId]);
    expect(rows.rows).toHaveLength(1);
    expect((await audit(s.requestId)).filter((a) => a.event_type === 'lifecycle.diagnostic.recorded')).toHaveLength(1);
    expect(JSON.stringify(await audit(s.requestId))).not.toContain(TEXT);
    expect(JSON.stringify(await read('requestDetail', { requestId: s.requestId }))).not.toContain(TEXT);
    expect((await sql('select verdict from log_lifecycle.execution_attempt where id = $1', [s.attemptId])).rows[0].verdict).toBe(s.verdict);
  });
  it('refuses missing credentials, sessions, insufficient scopes, unknown ids and unsuccessful attempts', async () => {
    const s = await succeeded();
    expect((await post(null, path(s.requestId))).statusCode).toBe(401);
    expect((await post(null, path(s.requestId), document(), admin.cookie)).statusCode).toBe(403);
    expect((await write(s.requestId, document(), noScopeToken)).statusCode).toBe(403);
    expect((await write(randomUUID())).statusCode).toBe(404);
    expect((await post(workerA, path(s.requestId, 2), document())).statusCode).toBe(404);
    // A new suite request may be queued while its attempt is still running.
    const requestId = await suiteRequest();
    const claimed = await post(workerA, '/claim');
    expect(claimed.statusCode, claimed.body).toBe(200);
    const denied = await write(requestId);
    expect(denied.statusCode, denied.body).toBe(409);
    expect(denied.json().code).toBe('conflict.attempt_not_succeeded');
  });
  it.each([
    [{ inputManifestDigest: H('b') }, 'inputManifestDigest:manifest_mismatch'],
    [{ items: [{ itemKey: 'x', origin: 'rule', ruleId: 'foreign', title: TEXT }] }, 'items.0.ruleId:not_in_attempt'],
    [{ items: [{ itemKey: 'x', origin: 'analysis', title: TEXT, evidenceRefs: [{ fileRef: 'foreign', line: 1, fileSha256: H('a') }] }] }, 'items.0.evidenceRefs.0.fileRef:not_in_sample'],
  ])('rejects invalid intake with detail.fields and no writes (%s)', async (over, expected) => {
    const s = await succeeded();
    const res = await write(s.requestId, document(over));
    expect(res.statusCode, res.body).toBe(422);
    expect(fields(res)).toContain(expected);
    expect((await sql('select id from log_lifecycle.attempt_diagnostic where attempt_id = $1', [s.attemptId])).rows).toEqual([]);
    expect((await audit(s.requestId)).filter((a) => a.event_type === 'lifecycle.diagnostic.recorded')).toEqual([]);
  });
  it('serializes producer count and aggregate byte limits, preserving duplicate replay at the cap', async () => {
    const s = await succeeded();
    for (const producer of ['one', 'two', 'three', 'four']) expect((await write(s.requestId, document({ producer }))).statusCode).toBe(200);
    const fifth = await write(s.requestId, document({ producer: 'five' }));
    expect(fifth.statusCode).toBe(422);
    expect(fields(fifth)).toContain('producer:too_many');
    expect((await write(s.requestId, document({ producer: 'one' }))).json().duplicate).toBe(true);
    const other = await succeeded();
    const large = { items: Array.from({ length: 70 }, (_, i) => ({ itemKey: `i${i}`, origin: 'analysis', title: TEXT, explanation: 'x'.repeat(4000) })) };
    expect((await write(other.requestId, document({ ...large, producer: 'one' }))).statusCode).toBe(200);
    const over = await write(other.requestId, document({ ...large, producer: 'two' }));
    expect(over.statusCode).toBe(422);
    expect(fields(over)).toContain('items:diagnostic_total_too_large');
  });
  it('rechecks Source ACL per call, exposes only shape without it and pages table rows by 100', async () => {
    const s = await succeeded();
    expect((await write(s.requestId)).statusCode).toBe(200);
    const denied = await read('diagnostics', { attemptId: s.attemptId }, user);
    expect(denied.data).toMatchObject({ access: 'no_permission', total: 1, rows: [{ title: null, evidenceCount: 1, tableCount: 1, rowCounts: [200], bodyState: 'live' }] });
    expect(JSON.stringify(denied)).not.toContain(TEXT);
    expect((await read('diagnosticItem', itemQuery(s.attemptId), user)).outcome).toBe('forbidden');
    expect((await grant(true)).outcome).toBe('ok');
    expect((await read('diagnosticItem', { ...itemQuery(s.attemptId), itemKey: 'missing' }, user)).data).toBeNull();
    expect((await read('diagnostics', { attemptId: s.attemptId }, user)).data.rows[0].title).toBe(TEXT);
    const first = await read('diagnosticItem', itemQuery(s.attemptId), user);
    expect(first.data.item.tables[0]).toMatchObject({ totalRows: 200, rowOffset: 0 });
    expect(first.data.item.tables[0].rows).toHaveLength(100);
    const next = await read('diagnosticItem', { ...itemQuery(s.attemptId), tableKey: 'data', rowOffset: 100 }, user);
    expect(next.data.item.tables[0].rows).toHaveLength(100);
    expect(next.data.item.tables[0].rowOffset).toBe(100);
    expect((await grant(false)).outcome).toBe('ok');
    expect((await read('diagnosticItem', itemQuery(s.attemptId), user)).outcome).toBe('forbidden');
    expect((await read('diagnostics', { attemptId: s.attemptId }, user)).data.access).toBe('no_permission');
    expect((await audit(s.requestId)).filter((a) => a.event_type === 'lifecycle.diagnostic.read')).toHaveLength(3);
    expect(JSON.stringify(await audit(s.requestId))).not.toContain(TEXT);
  });
  it('returns null for hidden/unknown/suite attempts and refuses token reads', async () => {
    const s = await succeeded();
    expect((await write(s.requestId)).statusCode).toBe(200);
    await sql("update knowledge.equipment_model set access_mode = 'restricted' where id = $1", [s.modelId]);
    for (const endpoint of ['diagnostics', 'diagnosticItem']) {
      const params = endpoint === 'diagnostics' ? { attemptId: s.attemptId } : itemQuery(s.attemptId);
      expect((await read(endpoint, params, user)).data).toBeNull();
    }
    expect((await read('diagnostics', { attemptId: randomUUID() }, user)).data).toBeNull();
    const token = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: bearer(workerA), payload: { endpoint: 'logLifecycle.diagnostics', context: {}, params: { attemptId: s.attemptId } } });
    expect(token.json().outcome === 'forbidden' || token.statusCode === 403).toBe(true);
    const requestId = await suiteRequest();
    const claimed = (await post(workerA, '/claim')).json();
    expect(claimed.request.id).toBe(requestId);
    expect((await post(workerA, `/requests/${requestId}/result`, { attemptNo: 1, inputManifestDigest: sampleManifestDigest(SAMPLE()), results: [rule('R1', 'PASS')] })).statusCode).toBe(200);
    expect((await write(requestId)).statusCode).toBe(200);
    expect((await read('diagnostics', { attemptId: claimed.attempt.id }, user)).data).toBeNull();
    expect((await read('diagnosticItem', itemQuery(claimed.attempt.id), user)).data).toBeNull();
    await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * 86400000) });
    expect((await sql('select erased_cause from log_lifecycle.attempt_diagnostic_item where attempt_id = $1', [claimed.attempt.id])).rows[0].erased_cause).toBe('retention');
  });
  async function suiteRequest() {
    const { rows } = await sql(`insert into log_lifecycle.execution_request (workspace_id,suite_run_item_id,suite_run_id,subject_sample_set,subject_sample_manifest_digest,priority,request_digest,requested_by_actor_id,idempotency_key) values ($1,$2,$3,$4,$5,2,$5,$6,$7) returning id`, [WORKSPACE_ID, randomUUID(), randomUUID(), SAMPLE(), sampleManifestDigest(SAMPLE()), admin.id, randomUUID()]);
    return rows[0].id as string;
  }
  it.each(['admin', 'admin_round', 'retention'] as const)('erases bodies once through the shared %s path, preserving shape and enforcing DB guards', async (cause) => {
    const s = await succeeded();
    expect((await write(s.requestId)).statusCode).toBe(200);
    await grant(true);
    for (const table of ['attempt_diagnostic', 'attempt_diagnostic_item']) {
      await expect(dbHandle.pool.query(`update log_lifecycle.${table} set workspace_id = workspace_id where attempt_id = $1`, [s.attemptId])).rejects.toMatchObject({ code: '42501' });
      await expect(dbHandle.pool.query(`delete from log_lifecycle.${table} where attempt_id = $1`, [s.attemptId])).rejects.toMatchObject({ code: '42501' });
    }
    await expect(migrate.pool.query("update log_lifecycle.attempt_diagnostic_item set title = 'modified' where attempt_id = $1", [s.attemptId])).rejects.toMatchObject({ code: '23514' });
    const bodyCause = cause === 'retention' ? 'retention' : 'admin';
    if (cause !== 'retention') {
      const scope = cause === 'admin_round' ? 'round' : 'attempt';
      const id = scope === 'round' ? s.roundId : s.attemptId;
      expect((await act('excerptDelete', { scope, id, reason: 'retention' })).data.count).toBe(1);
      expect((await act('excerptDelete', { scope, id, reason: 'again' })).data.count).toBe(0);
    } else {
      await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * 86400000) });
      expect((await sql('select erased_at from log_lifecycle.attempt_diagnostic_item where attempt_id = $1', [s.attemptId])).rows[0].erased_at).toBeNull();
      expect((await act('roundClose', { id: s.roundId })).outcome).toBe('ok');
      expect((await purgeExpiredExcerpts({ db: dbHandle.db, now: () => new Date(Date.now() + 91 * 86400000) })).erased).toBeGreaterThanOrEqual(1);
    }
    const detail = (await read('diagnosticItem', itemQuery(s.attemptId), user)).data.item;
    expect(detail).toMatchObject({ bodyState: `erased_${bodyCause}`, title: null, explanation: null, evidenceRefs: [{ fileRef: FILES()[0]?.fileRef }] });
    expect(detail.tables[0]).toMatchObject({ title: null, columns: [{ key: 'value', label: null, type: 'string' }], totalRows: 200 });
    expect(detail.tables[0].rows).toEqual(Array.from({ length: 100 }, () => ({ value: null })));
    expect(JSON.stringify(detail)).not.toContain(TEXT);
    expect((await read('diagnostics', { attemptId: s.attemptId }, user)).data.rows[0]).toMatchObject({ title: null, rowCounts: [200], bodyState: `erased_${bodyCause}` });
  });
});
