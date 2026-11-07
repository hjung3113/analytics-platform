// #1195 b3 — `logKnowledge.importPaste` and `logKnowledge.importApply` through the real menu-action transport
// against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`, app as
// platform_app, fixtures and cleanup as platform_migrate). Needs migration 0088.

import { createHash, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';
import { applySlots, parseSlots } from '../import-admission.js';
import type { ImportApplyHooks } from '../import-apply-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `PST${randomUUID().slice(0, 6).toUpperCase()}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: Record<string, unknown> | null;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
  replayed: boolean;
}
type Hooks = ImportApplyHooks & { afterApply?(): Promise<void> };

describe.skipIf(!runIntegration)('catalog import by menu actions: paste and apply (#1195 b3)', () => {
  let app: FastifyInstance; // default budget
  let slowApp: FastifyInstance; // budget 0: one row per apply call
  let smallApp: FastifyInstance; // budget 0 on a pool of 5
  let dbHandle: DbHandle;
  let smallHandle: DbHandle;
  let followerApp: FastifyInstance; // budget 0 on a command pool of 3
  let followerHandle: DbHandle;
  let singleApp: FastifyInstance; // budget 0 on a command pool of 1 (DB_POOL_MAX=1)
  let singleHandle: DbHandle;
  let migrate: DbHandle;
  let granted: Person;
  let otherWorkspace = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;
  const name = (label: string) => `${TAG}-${label}`;
  const key = (label: string) => toCodeKey(name(label));
  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const HEADER = ['설비사명', '모델명', '공정명'];

  let hooks: Hooks = {};
  const delegating: Hooks = {
    beforeRow: (rowNo) => hooks.beforeRow?.(rowNo) ?? Promise.resolve(),
    afterApply: () => hooks.afterApply?.() ?? Promise.resolve(),
  };

  async function person(roleLevel: 'admin' | 'developer' | 'user', server: FastifyInstance = app): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(server, externalId);
    const boot = await server.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  /** `rows` makers/models: maker `MK<i%4>`, model `MD<i>`, processes `P<i%2>, PX`. */
  const sheet = (rows: number, sep = '\t', offset = 0) =>
    [
      HEADER.join(sep),
      ...Array.from({ length: rows }, (_, i) => [name(`MK${(i + offset) % 4}`), name(`MD${i + offset}`), `"${name(`P${i % 2}`)}, ${name('PX')}"`].join(sep)),
    ].join('\n');

  const send = (server: FastifyInstance, who: Person, action: string, input: Record<string, unknown>, idempotencyKey: string = randomUUID()) =>
    server.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action: `logKnowledge.${action}`, context: {}, input, idempotencyKey }),
    });
  async function act(who: Person, action: string, input: Record<string, unknown>, idempotencyKey?: string, server: FastifyInstance = app): Promise<Answer> {
    const res = await send(server, who, action, input, idempotencyKey);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const jobRow = async (id: string) => (await sql('select * from knowledge.catalog_import_job where id = $1', [id])).rows[0] as Record<string, unknown>;
  const jobCount = async () => Number((await sql('select count(*)::int as c from knowledge.catalog_import_job where created_by = any($1)', [actorIds])).rows[0].c);

  /** Paste and validate: returns the job id and its plan version. */
  async function stage(who: Person, text: string, sourceName?: string, server: FastifyInstance = app) {
    const pasted = await act(who, 'importPaste', { text, ...(sourceName ? { sourceName } : {}) }, undefined, server);
    expect(pasted.outcome, JSON.stringify(pasted)).toBe('ok');
    const jobId = pasted.data?.jobId as string;
    const version = String((await jobRow(jobId)).row_version);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action: 'logKnowledge.importValidate', context: {}, input: { jobId }, idempotencyKey: randomUUID(), expectedVersion: version }),
    });
    expect(res.json<Answer>().outcome, res.body).toBe('ok');
    return { jobId, planVersion: Number((await jobRow(jobId)).plan_version) };
  }

  /** Fresh idempotency key per call, a fresh actor every few calls (menu writes are rate-limited per actor and minute). */
  async function applyToEnd(jobId: string, planVersion: number, server: FastifyInstance = slowApp) {
    let who = await person('admin', server);
    let calls = 0;
    for (;;) {
      if (calls > 0 && calls % 6 === 0) who = await person('admin', server);
      const a = await act(who, 'importApply', { jobId, expectedPlanVersion: planVersion }, undefined, server);
      calls += 1;
      expect(a.outcome).toBe('ok');
      const data = a.data as { outcome: string; status?: string; remaining?: number };
      expect(data.outcome).toBe('progress');
      if (data.status !== 'applying' || calls > 40) return { calls, last: data };
    }
  }

  const createdAudit = async (jobId: string) =>
    (
      await sql(
        `select subject_id from core.audit_log where actor_id = any($1) and event_type = 'knowledge.catalog.created' and detail->'source'->>'importJobId' = $2`,
        [actorIds, jobId],
      )
    ).rows.map((r) => r.subject_id as string);
  const countBy = async (table: string) => Number((await sql(`select count(*)::int as c from knowledge.${table} where created_by = any($1)`, [actorIds])).rows[0].c);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    smallHandle = createDb(APP_URL, { budgets: { poolMax: 5, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000, lockTimeoutMs: 10_000, idleInTransactionTimeoutMs: 30_000 } });
    app = await buildServer({ config: loadConfig(), dbHandle });
    slowApp = await buildServer({ config: loadConfig(), dbHandle, logKnowledgeImport: { applyBudgetMs: 0, hooks: delegating } });
    smallApp = await buildServer({ config: loadConfig(), dbHandle: smallHandle, logKnowledgeImport: { applyBudgetMs: 0, hooks: delegating } });
    const poolOf = (poolMax: number) => createDb(APP_URL, { budgets: { poolMax, acquireTimeoutMs: 5000, statementTimeoutMs: 30_000, lockTimeoutMs: 10_000, idleInTransactionTimeoutMs: 30_000 } });
    followerHandle = poolOf(3);
    singleHandle = poolOf(1);
    followerApp = await buildServer({ config: loadConfig(), dbHandle: followerHandle, logKnowledgeImport: { applyBudgetMs: 0, hooks: delegating } });
    singleApp = await buildServer({ config: loadConfig(), dbHandle: singleHandle, logKnowledgeImport: { applyBudgetMs: 0, hooks: delegating } });
    await Promise.all([app.ready(), slowApp.ready(), smallApp.ready(), followerApp.ready(), singleApp.ready()]);
    granted = await person('developer');
    const admin = await person('admin');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'knowledge.catalog.import', null, $3)`,
      [WORKSPACE_ID, granted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
  });

  afterEach(() => {
    hooks = {};
  });

  afterAll(async () => {
    await sql('delete from knowledge.catalog_import_resolution where resolved_by = any($1)', [actorIds]);
    await sql('delete from knowledge.catalog_import_row where job_id in (select id from knowledge.catalog_import_job where created_by = any($1))', [actorIds]);
    await sql('delete from knowledge.catalog_import_job where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.external_identity_map where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.model_process where assigned_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'process_category', 'vendor']) {
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
    await Promise.all([app?.close(), slowApp?.close(), smallApp?.close(), followerApp?.close(), singleApp?.close()]);
    await Promise.all([dbHandle?.close(), smallHandle?.close(), followerHandle?.close(), singleHandle?.close(), migrate?.close()]);
  });

  describe('importPaste', () => {
    it('stages a pasted TSV like a CSV upload: default name, size, sha, mapped, rows kept', async () => {
      const admin = await person('admin');
      const text = sheet(3);
      const a = await act(admin, 'importPaste', { text });
      expect(a).toMatchObject({ outcome: 'ok', data: { rowCount: 3, status: 'mapped' } });
      const job = await jobRow(a.data?.jobId as string);
      expect(job).toMatchObject({
        entity_type: 'model',
        file_type: 'csv',
        file_name: '붙여넣기.tsv',
        file_size: Buffer.byteLength(text),
        file_sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
        status: 'mapped',
      });
      expect(job.headers).toEqual(HEADER);
      const stored = (await sql('select row_no, raw_json from knowledge.catalog_import_row where job_id = $1 order by row_no', [job.id])).rows;
      expect(stored).toHaveLength(3);
      expect(stored[0].raw_json).toEqual({ 설비사명: name('MK0'), 모델명: name('MD0'), 공정명: `${name('P0')}, ${name('PX')}` });
      // Staging only: the catalog is untouched.
      expect(await countBy('vendor')).toBe(0);
    });

    it.each([
      ['no name, comma', 'csv', undefined, '붙여넣기.csv'],
      ['a name without an extension', 'tsv', 'sheet', 'sheet'],
      ['a .xlsx name still parses as text', 'tsv', 'copy.xlsx', 'copy.xlsx'],
      ['a .csv name over tab text', 'tsv', 'copy.csv', 'copy.csv'],
      ['separators in the name become _', 'tsv', '../a\\b\n.csv', '.._a_b_.csv'],
    ])('%s', async (_label, kind, sourceName, expectedName) => {
      const admin = await person('admin');
      const a = await act(admin, 'importPaste', { text: sheet(1, kind === 'tsv' ? '\t' : ','), ...(sourceName ? { sourceName } : {}) });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect((await jobRow(a.data?.jobId as string)).file_name).toBe(expectedName);
    });

    it('parses pasted TSV, pasted CSV and an uploaded CSV to equal rows, normalized forms and plans', async () => {
      const admin = await person('admin');
      const tsv = await stage(admin, sheet(4, '\t'));
      const csv = await stage(admin, sheet(4, ','));
      const boundary = `----pst${randomUUID().replaceAll('-', '')}`;
      const up = await app.inject({
        method: 'POST',
        url: '/api/v1/log-knowledge/imports',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf, 'idempotency-key': randomUUID() },
        payload: Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\nmodel\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${TAG}.csv"\r\nContent-Type: application/octet-stream\r\n\r\n${sheet(4, ',')}\r\n--${boundary}--\r\n`,
        ),
      });
      expect(up.statusCode, up.body).toBe(201);
      const uploadId = up.json<{ jobId: string }>().jobId;
      const version = String((await jobRow(uploadId)).row_version);
      const validated = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf },
        payload: JSON.stringify({ action: 'logKnowledge.importValidate', context: {}, input: { jobId: uploadId }, idempotencyKey: randomUUID(), expectedVersion: version }),
      });
      expect(validated.json<Answer>().outcome, validated.body).toBe('ok');
      const view = async (id: string) =>
        (await sql('select row_no, raw_json, normalized_json, plan_state, validation_errors from knowledge.catalog_import_row where job_id = $1 order by row_no', [id])).rows;
      const a = await view(tsv.jobId);
      const b = await view(csv.jobId);
      const c = await view(uploadId);
      expect(a).toHaveLength(4);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
      expect(a[0].plan_state).toBe('new');
    });

    it('refuses with field errors and creates no job: missing and duplicate headers, empty, limits', async () => {
      const admin = await person('admin');
      const before = await jobCount();
      const missing = await act(admin, 'importPaste', { text: '모델명\tx\nM\t1\n' });
      expect(missing).toMatchObject({ outcome: 'invalid', data: null });
      expect(missing.fieldErrors).toEqual([
        { path: ['text'], code: 'missing_header' },
        { path: ['text', 'headers', '설비사명'], code: 'missing_header' },
      ]);
      const dup = await act(admin, 'importPaste', { text: '설비사명\t제조사\t모델명\nA\tB\tC\n' });
      expect(dup.fieldErrors).toEqual([
        { path: ['text'], code: 'duplicate_header' },
        { path: ['text', 'headers', '설비사명'], code: 'duplicate_header' },
        { path: ['text', 'headers', '제조사'], code: 'duplicate_header' },
      ]);
      expect((await act(admin, 'importPaste', { text: '   \n' })).fieldErrors).toEqual([{ path: ['text'], code: 'empty' }]);
      const head = `${HEADER.join('\t')}\n`;
      const big = `${head}${'x'.repeat(256 * 1024 + 1 - Buffer.byteLength(head))}`;
      expect(Buffer.byteLength(big)).toBe(256 * 1024 + 1);
      expect((await act(admin, 'importPaste', { text: big })).fieldErrors).toEqual([{ path: ['text'], code: 'file_too_large' }]);
      expect((await act(admin, 'importPaste', { text: sheet(1001) })).fieldErrors).toEqual([{ path: ['text'], code: 'too_many_rows' }]);
      expect(await jobCount()).toBe(before);
      // 1,000 rows pass.
      const full = await act(admin, 'importPaste', { text: sheet(1000) });
      expect(full).toMatchObject({ outcome: 'ok', data: { rowCount: 1000 } });
    });

    it('answers busy as invalid (not recorded) when both parse slots are taken, and works again once they are free', async () => {
      const admin = await person('admin');
      const held = [parseSlots.tryTake(), parseSlots.tryTake()];
      const keyUsed = randomUUID();
      try {
        expect(held.every(Boolean)).toBe(true);
        const busy = await act(admin, 'importPaste', { text: sheet(1) }, keyUsed);
        expect(busy).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['text'], code: 'busy' }] });
      } finally {
        for (const release of held) release?.();
      }
      const retry = await act(admin, 'importPaste', { text: sheet(1) }, keyUsed);
      expect(retry.outcome).toBe('ok');
    });

    it('checks the capability before replay: a revoked grant refuses the same key', async () => {
      const who = await person('developer');
      const admin = await person('admin');
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'knowledge.catalog.import', null, $3)`,
        [WORKSPACE_ID, who.id, admin.id],
      );
      const k = randomUUID();
      const first = await act(who, 'importPaste', { text: sheet(1) }, k);
      expect(first.outcome).toBe('ok');
      await sql(`delete from permission.permission_grants where actor_id = $1 and capability = 'knowledge.catalog.import'`, [who.id]);
      expect((await act(who, 'importPaste', { text: sheet(1) }, k)).outcome).toBe('forbidden');
      expect((await act(await person('user'), 'importPaste', { text: sheet(1) })).outcome).toBe('forbidden');
    });
  });

  describe('importApply', () => {
    it('applies a 12-row pasted sheet to the end through several fresh-key calls: parents once, audited once', async () => {
      const { jobId, planVersion } = await stage(await person('admin'), sheet(12));
      const { calls, last } = await applyToEnd(jobId, planVersion);
      expect(calls).toBeGreaterThan(3);
      expect(last).toMatchObject({ status: 'completed', remaining: 0, counts: { applied: 12 } });
      expect((await jobRow(jobId)).status).toBe('completed');
      for (let i = 0; i < 4; i += 1) {
        expect((await sql('select 1 from knowledge.vendor where workspace_id = $1 and code_key = $2', [WORKSPACE_ID, key(`MK${i}`)])).rowCount).toBe(1);
      }
      expect(await countBy('vendor')).toBe(4);
      expect(await countBy('process_category')).toBe(3);
      expect(await countBy('equipment_model')).toBe(12);
      const audited = await createdAudit(jobId);
      expect(audited).toHaveLength(19);
      expect(new Set(audited).size).toBe(19);

      // A later call on the finished job is progress again and creates nothing.
      const again = await act(await person('admin'), 'importApply', { jobId, expectedPlanVersion: planVersion });
      expect(again.data).toMatchObject({ outcome: 'progress', status: 'completed', remaining: 0 });
      expect(await countBy('equipment_model')).toBe(12);
      expect(await createdAudit(jobId)).toHaveLength(19);
    });

    it('replays the same idempotency key as the earlier progress and creates nothing', async () => {
      const admin = await person('admin');
      const { jobId, planVersion } = await stage(admin, sheet(3, '\t', 20));
      const k = randomUUID();
      const first = await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion }, k, slowApp);
      const modelsAfterFirst = await countBy('equipment_model');
      const replay = await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion }, k, slowApp);
      expect(replay).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
      expect(await countBy('equipment_model')).toBe(modelsAfterFirst);
      const done = await applyToEnd(jobId, planVersion);
      expect(done.last.status).toBe('completed');
    });

    it('survives a failure after rows commit and before the action record commits: the same key retries, nothing doubles', async () => {
      const admin = await person('admin');
      // Names unique to this fixture: new makers and processes (so parents are created) and one existing model to
      // map onto (so an identity is written).
      const seedStamp = { workspace_id: WORKSPACE_ID, created_by: admin.id, updated_by: admin.id };
      const insertOne = async (table: string, columns: Record<string, unknown>) =>
        (
          await sql(
            `insert into knowledge.${table} (${Object.keys(columns).join(',')}) values (${Object.keys(columns).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
            Object.values(columns),
          )
        ).rows[0].id as string;
      const vendorId = await insertOne('vendor', { ...seedStamp, code: name('CRV'), code_key: key('CRV'), name: name('CRV') });
      const targetId = await insertOne('equipment_model', {
        ...seedStamp,
        vendor_id: vendorId,
        code: name('CROLD'),
        code_key: key('CROLD'),
        name: name('CROLD'),
      });
      const procs = `"${name('CRP0')}, ${name('CRPX')}"`;
      const text = [
        HEADER.join('\t'),
        [name('CRV'), name('CRNEW'), procs].join('\t'), // row 1: mapped onto CROLD (renames it, writes the identity)
        [name('CRK0'), name('CRN1'), procs].join('\t'),
        [name('CRK1'), name('CRN2'), procs].join('\t'),
        [name('CRK1'), name('CRN3'), procs].join('\t'),
      ].join('\n');
      const { jobId } = await stage(admin, text);
      const resolved = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf },
        payload: JSON.stringify({
          action: 'logKnowledge.importResolve',
          context: {},
          input: { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: targetId }] },
          idempotencyKey: randomUUID(),
          expectedVersion: String((await jobRow(jobId)).row_version),
        }),
      });
      expect(resolved.json<Answer>().outcome, resolved.body).toBe('ok');
      const planVersion = Number((await jobRow(jobId)).plan_version);

      let thrown = 0;
      hooks.afterApply = async () => {
        thrown += 1;
        if (thrown === 1) throw new Error('injected: crash before the action record commits');
      };
      const k = randomUUID();
      const crashed = await send(slowApp, admin, 'importApply', { jobId, expectedPlanVersion: planVersion }, k);
      expect(crashed.statusCode).toBeGreaterThanOrEqual(500);
      // Row 1 (map) committed outside the action record, identity included; no record exists.
      expect((await sql(`select count(*)::int as c from knowledge.catalog_import_row where job_id = $1 and apply_status is not null`, [jobId])).rows[0].c).toBe(1);
      const identitiesOf = async () =>
        (await sql('select external_key, target_id from knowledge.external_identity_map where workspace_id = $1 and target_id = $2', [WORKSPACE_ID, targetId])).rows;
      const afterCrash = await identitiesOf();
      expect(afterCrash).toHaveLength(1);
      expect((await sql('select 1 from core.idempotency_keys where actor_id = $1 and key = $2', [admin.id, k])).rowCount).toBe(0);

      const retry = await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion }, k, slowApp);
      expect(retry.data).toMatchObject({ outcome: 'progress' });
      const done = await applyToEnd(jobId, planVersion);
      expect(done.last).toMatchObject({ status: 'completed', remaining: 0, counts: { applied: 4 } });

      const rowsOf = (table: string, labels: string[]) =>
        sql(`select id from knowledge.${table} where workspace_id = $1 and code_key = any($2)`, [WORKSPACE_ID, labels.map((l) => key(l))]);
      expect((await rowsOf('vendor', ['CRV', 'CRK0', 'CRK1'])).rowCount).toBe(3);
      expect((await rowsOf('process_category', ['CRP0', 'CRPX'])).rowCount).toBe(2);
      expect((await rowsOf('equipment_model', ['CROLD', 'CRN1', 'CRN2', 'CRN3'])).rowCount).toBe(4);
      expect((await rowsOf('equipment_model', ['CRNEW'])).rowCount).toBe(0); // the map renames the target, it never creates CRNEW
      expect((await sql('select name from knowledge.equipment_model where id = $1', [targetId])).rows[0].name).toBe(name('CRNEW'));
      expect(await identitiesOf()).toEqual(afterCrash); // one identity, same key and target as before the retry

      const audit = (
        await sql(`select event_type, subject_id from core.audit_log where actor_id = any($1) and detail->'source'->>'importJobId' = $2`, [actorIds, jobId])
      ).rows as { event_type: string; subject_id: string }[];
      const ofType = (type: string) => audit.filter((a) => a.event_type === type).map((a) => a.subject_id);
      const created = ofType('knowledge.catalog.created');
      expect(new Set(created).size).toBe(created.length);
      expect(created).toHaveLength(7); // 2 makers + 3 models + 2 processes, each once
      expect(ofType('knowledge.catalog.identity_mapped')).toEqual([targetId]);
      expect(ofType('knowledge.catalog.updated')).toEqual([targetId]);
      expect(audit).toHaveLength(9);
    });

    it('answers not_found for another workspace, conflict plan_version for a stale version, conflict state for an unvalidated job', async () => {
      const admin = await person('admin');
      const foreign = (
        await sql(
          `insert into knowledge.catalog_import_job (workspace_id, entity_type, file_name, file_size, file_type, file_sha256, headers, created_by, updated_by)
           values ($1,'model','x.csv',1,'csv','00',$2::jsonb,$3,$3) returning id`,
          [otherWorkspace, JSON.stringify(['a']), admin.id],
        )
      ).rows[0].id as string;
      expect((await act(admin, 'importApply', { jobId: foreign, expectedPlanVersion: 1 })).data).toEqual({ outcome: 'not_found' });
      expect((await act(admin, 'importApply', { jobId: randomUUID(), expectedPlanVersion: 1 })).data).toEqual({ outcome: 'not_found' });

      const { jobId, planVersion } = await stage(admin, sheet(2, '\t', 60));
      expect((await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion + 1 })).data).toEqual({ outcome: 'conflict', reason: 'plan_version' });
      expect((await jobRow(jobId)).status).toBe('validated');

      const pasted = await act(admin, 'importPaste', { text: sheet(1, '\t', 70) });
      expect((await act(admin, 'importApply', { jobId: pasted.data?.jobId, expectedPlanVersion: 1 })).data).toEqual({ outcome: 'conflict', reason: 'state' });
    });

    it('checks the capability before replay and refuses a caller without it', async () => {
      const admin = await person('admin');
      const { jobId, planVersion } = await stage(admin, sheet(1, '\t', 80));
      expect((await act(await person('user'), 'importApply', { jobId, expectedPlanVersion: planVersion })).outcome).toBe('forbidden');
      const k = randomUUID();
      const ok = await act(granted, 'importApply', { jobId, expectedPlanVersion: planVersion }, k, slowApp);
      expect(ok.outcome).toBe('ok');
      await sql(`delete from permission.permission_grants where actor_id = $1 and capability = 'knowledge.catalog.import'`, [granted.id]);
      expect((await act(granted, 'importApply', { jobId, expectedPlanVersion: planVersion }, k, slowApp)).outcome).toBe('forbidden');
    });

    it('answers busy at once when both apply slots are taken, then works again', async () => {
      const admin = await person('admin');
      const { jobId, planVersion } = await stage(admin, sheet(1, '\t', 90));
      const held = [applySlots.tryTake(), applySlots.tryTake()];
      try {
        expect(held.every(Boolean)).toBe(true);
        const started = Date.now();
        const busy = await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion });
        expect(busy.data).toEqual({ outcome: 'busy' });
        expect(Date.now() - started).toBeLessThan(3000);
        expect((await jobRow(jobId)).status).toBe('validated');
      } finally {
        for (const release of held) release?.();
      }
      expect((await act(admin, 'importApply', { jobId, expectedPlanVersion: planVersion })).data).toMatchObject({ outcome: 'progress', status: 'completed' });
    });

    it('runs two applies and a third caller concurrently on a pool of 5: no deadlock, the third gets busy', async () => {
      const [pa, pb, pc] = await Promise.all([person('admin', smallApp), person('admin', smallApp), person('admin', smallApp)]);
      const a = await stage(pa, sheet(2, '\t', 100), undefined, smallApp);
      const b = await stage(pb, sheet(2, '\t', 110), undefined, smallApp);
      const c = await stage(pc, sheet(2, '\t', 120), undefined, smallApp);
      let inside = 0;
      let open!: () => void;
      const gate = new Promise<void>((resolve) => (open = resolve));
      hooks.beforeRow = async () => {
        inside += 1;
        await gate;
      };
      const bounded = <T>(p: Promise<T>, ms = 20_000) =>
        Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out: deadlock or pool exhaustion')), ms))]);
      const runA = act(pa, 'importApply', { jobId: a.jobId, expectedPlanVersion: a.planVersion }, undefined, smallApp);
      const runB = act(pb, 'importApply', { jobId: b.jobId, expectedPlanVersion: b.planVersion }, undefined, smallApp);
      const deadline = Date.now() + 10_000;
      while (inside < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
      expect(inside).toBe(2);
      const busy = await bounded(act(pc, 'importApply', { jobId: c.jobId, expectedPlanVersion: c.planVersion }, undefined, smallApp));
      expect(busy.data).toEqual({ outcome: 'busy' });
      open();
      const [ra, rb] = await bounded(Promise.all([runA, runB]));
      expect(ra.data).toMatchObject({ outcome: 'progress' });
      expect(rb.data).toMatchObject({ outcome: 'progress' });
      hooks = {};
      expect((await bounded(applyToEnd(a.jobId, a.planVersion, smallApp))).last.status).toBe('completed');
      expect((await bounded(applyToEnd(b.jobId, b.planVersion, smallApp))).last.status).toBe('completed');
    });

    it('does not starve the runner when same-key callers hold every command connection (pool of 3)', async () => {
      const who = await person('admin', followerApp);
      const { jobId, planVersion } = await stage(who, sheet(2, '\t', 130), undefined, followerApp);
      const bounded = <T>(p: Promise<T>, ms = 20_000) =>
        Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out: runner starved by the command pool')), ms))]);
      const k = randomUUID();
      const input = { jobId, expectedPlanVersion: planVersion };
      // Hold the (actor, key) lock from outside, so all three same-key calls park on it, each in its own command
      // transaction; only then release it: the winner reaches the handler with no free command connection.
      const holder = await migrate.pool.connect();
      let calls: Promise<Awaited<ReturnType<typeof send>>>[] = [];
      try {
        await holder.query('select pg_advisory_lock(hashtext($1), hashtext($2))', [who.id, k]);
        calls = [0, 1, 2].map(() => send(followerApp, who, 'importApply', input, k));
        const deadline = Date.now() + 10_000;
        // Barrier: all three backends have an ungranted request on that very advisory lock (pg_locks; pg_stat_activity hides
        // other roles' wait events from this role).
        for (;;) {
          const waiting = await migrate.pool.query<{ n: string }>(
            `select count(*)::text as n
               from pg_locks l
              where l.locktype = 'advisory' and not l.granted
                and l.classid::bigint = (hashtext($1)::bigint & 4294967295)
                and l.objid::bigint = (hashtext($2)::bigint & 4294967295)`,
            [who.id, k],
          );
          if (Number(waiting.rows[0]?.n) === 3) break;
          if (Date.now() > deadline) throw new Error(`only ${waiting.rows[0]?.n} callers waiting on the same-key lock`);
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(followerHandle.pool.totalCount).toBe(3);
        expect(followerHandle.pool.idleCount).toBe(0);
      } finally {
        await holder.query('select pg_advisory_unlock(hashtext($1), hashtext($2))', [who.id, k]);
        holder.release();
      }
      const results = await bounded(Promise.all(calls));
      const bodies = results.map((r) => {
        expect(r.statusCode, r.body).toBe(200);
        return r.json<Answer>();
      });
      const fresh = bodies.filter((b) => !b.replayed);
      expect(fresh).toHaveLength(1);
      expect(fresh[0]?.data).toMatchObject({ outcome: 'progress' });
      for (const b of bodies.filter((x) => x.replayed)) expect(b).toMatchObject({ outcome: 'ok', data: fresh[0]?.data });
      expect((await bounded(applyToEnd(jobId, planVersion, followerApp))).last.status).toBe('completed');
    });

    it('applies to the end on a command pool of one (DB_POOL_MAX=1): the runner never waits on its own action', async () => {
      const who = await person('admin', singleApp);
      const { jobId, planVersion } = await stage(who, sheet(3, '\t', 140), undefined, singleApp);
      const bounded = <T>(p: Promise<T>, ms = 20_000) =>
        Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out: runner waits on the single command connection')), ms))]);
      const done = await bounded(applyToEnd(jobId, planVersion, singleApp));
      expect(done.last).toMatchObject({ status: 'completed', remaining: 0, counts: { applied: 3 } });
    });
  });
});
