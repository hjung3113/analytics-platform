// #1195 b — catalog import resolve, seal and apply, retry, identity map, audit and the CSV report, through the real
// `buildServer` against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api
// test:integration`, app as platform_app, fixtures and cleanup as platform_migrate). Needs migration 0088.

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
import type { ImportApplyHooks } from '../import-apply-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `APL${randomUUID().slice(0, 6).toUpperCase()}`;

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
}
interface Progress {
  jobId: string;
  status: string;
  planVersion: number;
  remaining: number;
  counts: Record<string, number>;
}

describe.skipIf(!runIntegration)('catalog import resolve and apply (#1195 b)', () => {
  let app: FastifyInstance;
  let slowApp: FastifyInstance; // budget 0: one row per apply call
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let granted: Person;
  let otherWorkspace = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;
  const code = (label: string) => `${TAG}-${label}`;
  const key = (label: string) => toCodeKey(code(label));
  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  // Hook seam: each test sets what it needs; the servers delegate to it.
  let hooks: ImportApplyHooks = {};
  const delegating: ImportApplyHooks = {
    beforeRow: (rowNo) => hooks.beforeRow?.(rowNo) ?? Promise.resolve(),
    afterCodeKeyCheck: (rowNo, tx) => hooks.afterCodeKeyCheck?.(rowNo, tx) ?? Promise.resolve(),
    beforeCommit: (rowNo) => hooks.beforeCommit?.(rowNo) ?? Promise.resolve(),
  };

  async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the expected database state');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function upload(entityType: string, content: string, who: Person = admin) {
    const boundary = `----apl${randomUUID().replaceAll('-', '')}`;
    const fileName = `${TAG}-${n++}.csv`;
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\n${entityType}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/log-knowledge/imports',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        ...cookieHeader(who.cookie),
        'x-csrf-token': who.csrf,
        'idempotency-key': randomUUID(),
      },
      payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ jobId: string }>().jobId;
  }

  async function act(action: string, input: Record<string, unknown>, who: Person = admin, expectedVersion?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logKnowledge.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        expectedVersion: expectedVersion ?? (await versionOf(input.jobId as string)),
      }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }
  const versionOf = async (jobId: string) => String((await jobRow(jobId)).row_version);
  const jobRow = async (id: string) => (await sql('select * from knowledge.catalog_import_job where id = $1', [id])).rows[0] as Record<string, unknown>;

  /** Upload, map and validate: returns the job id. */
  async function stage(entity: string, content: string, mapping: Record<string, string>, who: Person = admin): Promise<string> {
    const jobId = await upload(entity, content, who);
    expect((await act('importMap', { jobId, mapping }, who)).outcome).toBe('ok');
    expect((await act('importValidate', { jobId }, who)).outcome).toBe('ok');
    return jobId;
  }

  async function apply(jobId: string, who: Person = admin, server: FastifyInstance = app, expected?: number) {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/log-knowledge/imports/${jobId}/apply`,
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ expectedPlanVersion: expected ?? Number((await jobRow(jobId)).plan_version) }),
    });
    return { res, body: res.json<Progress>() };
  }
  /** Calls apply until the job leaves `applying`; returns the calls made and the last answer. */
  async function applyToEnd(jobId: string, server: FastifyInstance = app) {
    let calls = 0;
    let last = await apply(jobId, admin, server);
    calls += 1;
    while (last.body.status === 'applying' && calls < 50) {
      last = await apply(jobId, admin, server);
      calls += 1;
    }
    return { calls, last };
  }

  const rows = async (jobId: string) =>
    (await sql('select row_no, apply_status, apply_error, result_target_id, apply_pass from knowledge.catalog_import_row where job_id = $1 order by row_no', [jobId])).rows as {
      row_no: number;
      apply_status: string | null;
      apply_error: string | null;
      result_target_id: string | null;
      apply_pass: number | null;
    }[];
  const statuses = async (jobId: string) => (await rows(jobId)).map((r) => r.apply_status);
  const auditFor = async (jobId: string) =>
    (
      await sql(
        `select event_type, subject_id, detail from core.audit_log where actor_id = any($1) and detail->'source'->>'importJobId' = $2 order by created_at, id`,
        [actorIds, jobId],
      )
    ).rows as { event_type: string; subject_id: string; detail: Record<string, unknown> }[];
  const vendorBy = async (label: string) =>
    (await sql('select id, name, active, row_version from knowledge.vendor where workspace_id = $1 and code_key = $2', [WORKSPACE_ID, key(label)])).rows as {
      id: string;
      name: string;
      active: boolean;
      row_version: number;
    }[];
  const identityRows = async (type: string) =>
    (await sql(`select external_key, target_id, mapping_state, accepted_by from knowledge.external_identity_map where workspace_id = $1 and source_system = 'catalog_import' and source_type = $2 and external_key like $3`, [
      WORKSPACE_ID,
      type,
      `%${TAG.toUpperCase()}%`,
    ])).rows as { external_key: string; target_id: string; mapping_state: string; accepted_by: string }[];

  const seed = async (table: string, columns: Record<string, unknown>) =>
    (
      await sql(
        `insert into knowledge.${table} (${Object.keys(columns).join(',')}) values (${Object.keys(columns).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
        Object.values(columns),
      )
    ).rows[0].id as string;
  const stamp = () => ({ workspace_id: WORKSPACE_ID, created_by: admin.id, updated_by: admin.id });
  const seedVendor = (label: string, name: string, active = true) =>
    seed('vendor', { ...stamp(), code: code(label), code_key: key(label), name, active });
  const seedProcess = (label: string, name: string, active = true) =>
    seed('process_category', { ...stamp(), code: code(label), code_key: key(label), name, active });
  const seedModel = (vendorId: string, label: string, name: string) =>
    seed('equipment_model', { ...stamp(), vendor_id: vendorId, code: code(label), code_key: key(label), name });
  const vendorMapping = { vendor_code: 'code', vendor_name: 'name' };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, logKnowledgeImport: { hooks: delegating } });
    slowApp = await buildServer({ config: loadConfig(), dbHandle, logKnowledgeImport: { applyBudgetMs: 0, hooks: delegating } });
    await app.ready();
    await slowApp.ready();
    admin = await person('admin');
    user = await person('user');
    granted = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'knowledge.catalog.import', null, $3)`,
      [WORKSPACE_ID, granted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
  });

  // A fresh admin per test: the mutation routes are rate-limited per actor and minute (10), and one admin shared by
  // all tests runs out of it.
  beforeEach(async () => {
    admin = await person('admin');
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
    await app?.close();
    await slowApp?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('resolve and cancel', () => {
    it('stores resolutions with CAS, refuses the disallowed ones and invalidates them on a re-validation', async () => {
      const vAcme = await seedVendor('R-ACME', 'Acme');
      await seedVendor('R-OLD', 'Old', false);
      const vInactive = await seedVendor('R-DEAD', 'Dead', false);
      const csv = ['code,name', `${code('R-NEW')},New one`, `${code('R-OLD')},Old`, `${code('R-ACME')},Acme`, `${code('R-ACME2')},`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping); // rows: new, conflict, unchanged, error

      const version = await versionOf(jobId);
      const stale = await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'skip' }] }, admin, String(Number(version) - 1));
      expect(stale.outcome).toBe('conflict');

      const refused = await act('importResolve', {
        jobId,
        resolutions: [
          { rowNo: 2, resolution: 'create' }, // create only on new
          { rowNo: 3, resolution: 'map', mapTargetId: vAcme }, // map only on new/conflict
        ],
      });
      expect(refused.outcome).toBe('invalid');
      expect(refused.fieldErrors).toEqual([
        { path: ['resolutions', '0', 'resolution'], code: 'not_allowed' },
        { path: ['resolutions', '1', 'resolution'], code: 'not_allowed' },
      ]);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 2, resolution: 'map', mapTargetId: vInactive }] })).fieldErrors).toEqual([
        { path: ['resolutions', '0', 'mapTargetId'], code: 'inactive' },
      ]);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'abort' }] })).outcome).toBe('invalid');
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 99, resolution: 'skip' }] })).fieldErrors).toEqual([
        { path: ['resolutions', '0', 'rowNo'], code: 'not_found' },
      ]);

      const before = await jobRow(jobId);
      const ok = await act('importResolve', {
        jobId,
        resolutions: [
          { rowNo: 1, resolution: 'create' },
          { rowNo: 2, resolution: 'map', mapTargetId: vAcme },
          { rowNo: 4, resolution: 'skip' },
        ],
      });
      expect(ok).toMatchObject({ outcome: 'ok', data: { jobId, resolved: 3 } });
      const after = await jobRow(jobId);
      expect(Number(after.row_version)).toBe(Number(before.row_version) + 1);
      expect(Number(after.plan_version)).toBe(Number(before.plan_version) + 1);
      expect(after.validation_generation).toBe(before.validation_generation);
      const stored = (await sql('select row_no, resolution, map_target_id, expected_target_version, resolved_by from knowledge.catalog_import_resolution where job_id = $1 order by row_no', [jobId])).rows;
      expect(stored).toEqual([
        { row_no: 1, resolution: 'create', map_target_id: null, expected_target_version: null, resolved_by: admin.id },
        { row_no: 2, resolution: 'map', map_target_id: vAcme, expected_target_version: 1, resolved_by: admin.id },
        { row_no: 4, resolution: 'skip', map_target_id: null, expected_target_version: null, resolved_by: admin.id },
      ]);

      const detail = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
        payload: JSON.stringify({ endpoint: 'logKnowledge.importDetail', context: {}, params: { jobId } }),
      });
      const shown = detail.json<{ data: { rows: { rowNo: number; resolution: string | null; applyStatus: string | null }[]; applyCounts: Record<string, number> } }>().data;
      expect(shown.rows.map((r) => r.resolution)).toEqual(['create', 'map', null, 'skip']);
      expect(shown.applyCounts).toMatchObject({ remaining: 4, applied: 0 });

      // A re-validation makes them stale: no resolution is shown and none counts.
      expect((await act('importValidate', { jobId })).outcome).toBe('ok');
      const again = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
        payload: JSON.stringify({ endpoint: 'logKnowledge.importDetail', context: {}, params: { jobId } }),
      });
      expect(again.json<{ data: { rows: { resolution: string | null }[] } }>().data.rows.every((r) => r.resolution === null)).toBe(true);
    });

    it('refuses map targets of another vendor and cancels a job before apply', async () => {
      const v1 = await seedVendor('S-V1', 'V one');
      const v2 = await seedVendor('S-V2', 'V two');
      const mine = await seedModel(v1, 'S-M', 'Mine');
      const other = await seedModel(v2, 'S-MX', 'Other vendor model');
      const csv = ['v,m,n', `${code('S-V1')},${code('S-NEW')},New model`].join('\n');
      const jobId = await stage('model', csv, { vendor_code: 'v', model_code: 'm', model_name: 'n' });
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: other }] })).fieldErrors).toEqual([
        { path: ['resolutions', '0', 'mapTargetId'], code: 'scope' },
      ]);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: mine }] })).outcome).toBe('ok');

      const cancelled = await act('importCancel', { jobId });
      expect(cancelled).toMatchObject({ outcome: 'ok', data: { status: 'cancelled' } });
      expect((await act('importCancel', { jobId })).outcome).toBe('invalid');
      expect((await apply(jobId)).res.statusCode).toBe(409);
    });
  });

  describe('seal and apply', () => {
    it('creates, updates and leaves the rest exactly once, with one audit row each carrying the source', async () => {
      await seedVendor('A-UPD', 'Upd');
      await seedVendor('A-SAME', 'Same');
      await seedVendor('A-OLD', 'Old', false);
      const csv = [
        'code,name',
        `${code('A-NEW')},Brand new`, // new
        `${code('A-UPD')},Upd renamed`, // update
        `${code('A-SAME')},Same`, // unchanged
        `${code('A-OLD')},Old`, // conflict, unresolved
        `${code('A-BAD')},`, // error
        `${code('A-SKIP')},Skipped`, // new + skip
      ].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 6, resolution: 'skip' }] })).outcome).toBe('ok');
      const planVersion = Number((await jobRow(jobId)).plan_version);

      expect((await apply(jobId, admin, app, planVersion + 1)).res.statusCode).toBe(409);
      expect((await jobRow(jobId)).status).toBe('review_required');

      const first = await apply(jobId);
      expect(first.res.statusCode).toBe(200);
      expect(first.body).toMatchObject({
        status: 'completed',
        remaining: 0,
        counts: { applied: 2, unchanged: 1, skipped: 1, excluded: 1, unresolved: 1, conflict: 0, failed: 0, remaining: 0 },
      });
      expect(await statuses(jobId)).toEqual(['applied', 'applied', 'unchanged', 'unresolved', 'excluded', 'skipped']);
      const job = await jobRow(jobId);
      expect(job.sealed_plan_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(job.applied_at).not.toBeNull();
      const hashes = (await sql('select plan_hash from knowledge.catalog_import_row where job_id = $1 order by row_no', [jobId])).rows.map((r) => r.plan_hash as string);
      expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);

      const created = await vendorBy('A-NEW');
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ name: 'Brand new', active: true });
      expect((await vendorBy('A-UPD'))[0]).toMatchObject({ name: 'Upd renamed', row_version: 2 });
      expect((await vendorBy('A-OLD'))[0]).toMatchObject({ active: false, row_version: 1 });
      expect(await vendorBy('A-BAD')).toHaveLength(0);
      expect(await vendorBy('A-SKIP')).toHaveLength(0);

      const audit = await auditFor(jobId);
      expect(audit.map((a) => a.event_type)).toEqual(['knowledge.catalog.created', 'knowledge.catalog.updated']);
      expect(audit[0]?.detail).toMatchObject({ code: code('A-NEW'), source: { importJobId: jobId, rowNo: 1 } });
      expect(audit[1]?.detail).toMatchObject({ changes: { name: ['Upd', 'Upd renamed'] }, source: { importJobId: jobId, rowNo: 2 } });

      // A second call changes nothing.
      const second = await apply(jobId);
      expect(second.body).toMatchObject({ status: 'completed', counts: first.body.counts });
      expect((await auditFor(jobId)).length).toBe(2);
      expect((await vendorBy('A-UPD'))[0]?.row_version).toBe(2);

      // After the seal map/validate/resolve/cancel refuse (status).
      expect((await act('importMap', { jobId, mapping: vendorMapping })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await act('importValidate', { jobId })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 4, resolution: 'skip' }] })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await act('importCancel', { jobId })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
    });

    it('refuses the other actions while the job is applying (a partly applied job)', async () => {
      const csv = ['code,name', `${code('P-1')},One`, `${code('P-2')},Two`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      const first = await apply(jobId, admin, slowApp);
      expect(first.body).toMatchObject({ status: 'applying', remaining: 1, counts: { applied: 1 } });
      expect((await jobRow(jobId)).status).toBe('applying');
      expect((await act('importMap', { jobId, mapping: vendorMapping })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await act('importValidate', { jobId })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await act('importCancel', { jobId })).fieldErrors).toEqual([{ path: ['jobId'], code: 'state' }]);
      expect((await apply(jobId, admin, slowApp)).body).toMatchObject({ status: 'completed', counts: { applied: 2 } });
    });

    it('a budget of 0 makes one row per call, always progresses, and ends like a single call', async () => {
      const csv = (label: string) => ['code,name', ...[1, 2, 3, 4].map((i) => `${code(`${label}-${i}`)},Name ${i}`)].join('\n');
      const slowJob = await stage('vendor', csv('B0'), vendorMapping);
      const fastJob = await stage('vendor', csv('B1'), vendorMapping);
      const slow: number[] = [];
      let calls = 0;
      let last = await apply(slowJob, admin, slowApp);
      for (;;) {
        calls += 1;
        slow.push(last.body.counts.applied ?? 0);
        if (last.body.status !== 'applying') break;
        expect(calls).toBeLessThan(10);
        last = await apply(slowJob, admin, slowApp);
      }
      expect(slow).toEqual([1, 2, 3, 4]);
      const fast = await applyToEnd(fastJob);
      expect(fast.calls).toBe(1);
      expect(last.body.counts).toEqual(fast.last.body.counts);
      expect(await statuses(slowJob)).toEqual(await statuses(fastJob));
      expect((await auditFor(slowJob)).length).toBe(4);
    });

    it('a target changed between seal and apply is a conflict stale_target; the job is partial_failure and a retry leaves it', async () => {
      const u1 = await seedVendor('ST-1', 'One');
      const u2 = await seedVendor('ST-2', 'Two');
      const csv = ['code,name', `${code('ST-1')},One renamed`, `${code('ST-2')},Two renamed`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      hooks = {
        beforeRow: async (rowNo) => {
          if (rowNo === 2) await sql('update knowledge.vendor set row_version = row_version + 1 where id = $1', [u2]);
        },
      };
      try {
        const done = await applyToEnd(jobId);
        expect(done.last.body).toMatchObject({ status: 'partial_failure', counts: { applied: 1, conflict: 1 } });
      } finally {
        hooks = {};
      }
      expect(await rows(jobId).then((r) => r.map((x) => [x.apply_status, x.apply_error]))).toEqual([
        ['applied', null],
        ['conflict', 'stale_target'],
      ]);
      expect((await sql('select name from knowledge.vendor where id = any($1) order by code_key', [[u1, u2]])).rows.map((r) => r.name)).toEqual(['One renamed', 'Two']);
      // A conflict is not retried.
      const again = await apply(jobId);
      expect(again.body).toMatchObject({ status: 'partial_failure', counts: { applied: 1, conflict: 1 } });
      expect((await auditFor(jobId)).length).toBe(1);
    });

    it('a parent deactivated after the seal fails only that row (parent_inactive); a retry applies only it', async () => {
      const vA = await seedVendor('PI-A', 'A');
      const vB = await seedVendor('PI-B', 'B');
      const csv = ['v,m,n', `${code('PI-A')},${code('PI-M1')},Model one`, `${code('PI-B')},${code('PI-M2')},Model two`].join('\n');
      const jobId = await stage('model', csv, { vendor_code: 'v', model_code: 'm', model_name: 'n' });
      hooks = {
        beforeRow: async (rowNo) => {
          if (rowNo === 1) await sql('update knowledge.vendor set active = false where id = $1', [vA]);
        },
      };
      try {
        const done = await applyToEnd(jobId);
        expect(done.last.body).toMatchObject({ status: 'partial_failure', counts: { applied: 1, failed: 1, remaining: 0 } });
      } finally {
        hooks = {};
      }
      expect((await rows(jobId)).map((r) => [r.apply_status, r.apply_error])).toEqual([
        ['failed', 'parent_inactive'],
        ['applied', null],
      ]);
      await sql('update knowledge.vendor set active = true where id = $1', [vA]);
      const retry = await applyToEnd(jobId);
      expect(retry.last.body).toMatchObject({ status: 'completed', counts: { applied: 2, failed: 0 } });
      const audit = await auditFor(jobId);
      expect(audit.map((a) => (a.detail.source as { rowNo: number }).rowNo).sort()).toEqual([1, 2]);
      expect(vB).toBeTruthy();
    });

    it('two overlapping calls: the second answers progress and starts nothing; one write and audit per row', async () => {
      const csv = ['code,name', `${code('OV-1')},One`, `${code('OV-2')},Two`, `${code('OV-3')},Three`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reachedFirstRow: () => void = () => undefined;
      const reached = new Promise<void>((resolve) => {
        reachedFirstRow = resolve;
      });
      hooks = {
        beforeRow: async (rowNo) => {
          if (rowNo === 1) {
            reachedFirstRow();
            await gate;
          }
        },
      };
      try {
        const a = apply(jobId);
        await reached;
        const b = await apply(jobId);
        expect(b.res.statusCode).toBe(200);
        expect(b.body).toMatchObject({ status: 'applying', counts: { applied: 0 }, remaining: 3 });
        release();
        const done = await a;
        expect(done.body).toMatchObject({ status: 'completed', counts: { applied: 3 } });
      } finally {
        hooks = {};
        release();
      }
      expect((await auditFor(jobId)).length).toBe(3);
      for (const l of ['OV-1', 'OV-2', 'OV-3']) expect(await vendorBy(l)).toHaveLength(1);
    });

    it('a failure after the writes and before commit rolls back catalog, identity map and audit; the retry succeeds', async () => {
      const target = await seedVendor('RB-T', 'Target');
      const csv = ['code,name', `${code('RB-X')},Renamed by map`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: target }] })).outcome).toBe('ok');
      let failures = 1;
      hooks = {
        beforeCommit: async () => {
          if (failures-- > 0) throw new Error('injected');
        },
      };
      try {
        const first = await apply(jobId);
        expect(first.body).toMatchObject({ status: 'partial_failure', counts: { failed: 1 } });
        expect((await rows(jobId))[0]).toMatchObject({ apply_status: 'failed', apply_error: 'unexpected' });
        expect((await vendorBy('RB-T'))[0]).toMatchObject({ name: 'Target', row_version: 1 });
        expect(await identityRows('vendor')).toEqual([]);
        expect(await auditFor(jobId)).toEqual([]);
        const retry = await apply(jobId);
        expect(retry.body).toMatchObject({ status: 'completed', counts: { applied: 1, failed: 0 } });
      } finally {
        hooks = {};
      }
      expect((await vendorBy('RB-T'))[0]).toMatchObject({ name: 'Renamed by map', row_version: 2 });
      expect(await identityRows('vendor')).toHaveLength(1);
      expect((await auditFor(jobId)).map((a) => a.event_type).sort()).toEqual(['knowledge.catalog.identity_mapped', 'knowledge.catalog.updated']);
    });

    it('a key taken between the pre-check and the insert is a conflict taken, not a failure', async () => {
      const csv = ['code,name', `${code('RC-1')},Racer`].join('\n');
      const jobId = await stage('vendor', csv, vendorMapping);
      hooks = {
        afterCodeKeyCheck: async () => {
          await seedVendor('RC-1', 'Won the race');
        },
      };
      try {
        const done = await apply(jobId);
        expect(done.body).toMatchObject({ status: 'partial_failure', counts: { conflict: 1, failed: 0 } });
      } finally {
        hooks = {};
      }
      expect((await rows(jobId))[0]).toMatchObject({ apply_status: 'conflict', apply_error: 'taken' });
      expect(await auditFor(jobId)).toEqual([]);
    });

    it('a grant lost before the failure marking leaves the row non-final and stops the pass with 403; a restored grant resumes', async () => {
      const owner = await person('admin'); // its own mutation rate-limit window
      const dev = await person('developer');
      const grant = () =>
        sql(
          `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
           values ($1, $2, 'knowledge.catalog.import', null, $3)`,
          [WORKSPACE_ID, dev.id, admin.id],
        );
      await grant();
      const jobId = await stage('vendor', ['code,name', `${code('CF-1')},One`].join('\n'), vendorMapping, owner);
      hooks = {
        beforeCommit: async () => {
          await sql(`delete from permission.permission_grants where actor_id = $1 and capability = 'knowledge.catalog.import'`, [dev.id]);
          throw new Error('injected');
        },
      };
      try {
        expect((await apply(jobId, dev)).res.statusCode).toBe(403);
      } finally {
        hooks = {};
      }
      expect((await rows(jobId))[0]).toMatchObject({ apply_status: null, apply_error: null });
      expect((await jobRow(jobId)).status).toBe('applying');
      await grant();
      expect((await apply(jobId, dev)).body).toMatchObject({ status: 'completed', counts: { applied: 1, failed: 0 } });
      expect(await vendorBy('CF-1')).toHaveLength(1);
    });

    it('runs the whole pass on one connection: a pool of 2 serves a runner and a busy caller, a pool of 1 a single apply', async () => {
      const owner = await person('admin'); // its own mutation rate-limit window
      const budgets = { poolMax: 2, acquireTimeoutMs: 3000, statementTimeoutMs: 30_000, lockTimeoutMs: 10_000, idleInTransactionTimeoutMs: 30_000 };
      const small = createDb(APP_URL, { budgets });
      const tiny = createDb(APP_URL, { budgets: { ...budgets, poolMax: 1 } });
      const smallApp = await buildServer({ config: loadConfig(), dbHandle: small, logKnowledgeImport: { hooks: delegating } });
      const tinyApp = await buildServer({ config: loadConfig(), dbHandle: tiny, logKnowledgeImport: { hooks: delegating } });
      try {
        await smallApp.ready();
        await tinyApp.ready();
        const csv = (label: string) => ['code,name', ...[1, 2].map((i) => `${code(`${label}-${i}`)},Name ${i}`)].join('\n');
        const jobId = await stage('vendor', csv('PL'), vendorMapping, owner);
        const single = await stage('vendor', csv('P1'), vendorMapping, owner);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let reachedFirstRow: () => void = () => undefined;
        const reached = new Promise<void>((resolve) => {
          reachedFirstRow = resolve;
        });
        hooks = {
          beforeRow: async (rowNo) => {
            if (rowNo === 1) {
              reachedFirstRow();
              await gate;
            }
          },
        };
        try {
          const runner = apply(jobId, owner, smallApp);
          await reached;
          const busy = await apply(jobId, owner, smallApp);
          expect(busy.res.statusCode).toBe(200);
          expect(busy.body).toMatchObject({ status: 'applying', counts: { applied: 0 }, remaining: 2 });
          release();
          expect((await runner).body).toMatchObject({ status: 'completed', counts: { applied: 2 } });
        } finally {
          hooks = {};
          release();
        }
        const alone = await apply(single, owner, tinyApp);
        expect(alone.res.statusCode).toBe(200);
        expect(alone.body).toMatchObject({ status: 'completed', counts: { applied: 2 } });
      } finally {
        await smallApp.close();
        await tinyApp.close();
        await small.close();
        await tiny.close();
      }
    });
  });

  describe('map: identity map, unmapped fields and scopes', () => {
    it('writes one accepted identity row and audit; a second job mapping the same key elsewhere is a conflict', async () => {
      const t1 = await seedVendor('M-T1', 'Target one');
      const t2 = await seedVendor('M-T2', 'Target two');
      const csv = ['code,name', `${code('M-EXT')},Mapped name`].join('\n');
      const job1 = await stage('vendor', csv, vendorMapping);
      expect((await act('importResolve', { jobId: job1, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: t1 }] })).outcome).toBe('ok');
      expect((await apply(job1)).body).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      const ids = (await identityRows('vendor')).filter((r) => r.external_key === JSON.stringify([key('M-EXT')]));
      expect(ids).toEqual([{ external_key: JSON.stringify([key('M-EXT')]), target_id: t1, mapping_state: 'accepted', accepted_by: admin.id }]);
      expect((await vendorBy('M-T1'))[0]?.name).toBe('Mapped name');
      const audit = await auditFor(job1);
      // Rows of one transaction share created_at, so the order is by event type, not by position.
      expect(audit.map((a) => a.event_type).sort()).toEqual(['knowledge.catalog.identity_mapped', 'knowledge.catalog.updated']);
      expect(audit.find((a) => a.event_type === 'knowledge.catalog.identity_mapped')).toMatchObject({ subject_id: t1, detail: { sourceSystem: 'catalog_import', sourceType: 'vendor', externalKey: JSON.stringify([key('M-EXT')]) } });

      const job2 = await stage('vendor', csv, vendorMapping);
      expect((await act('importResolve', { jobId: job2, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: t2 }] })).outcome).toBe('ok');
      expect((await apply(job2)).body).toMatchObject({ status: 'partial_failure', counts: { conflict: 1 } });
      expect((await rows(job2))[0]).toMatchObject({ apply_status: 'conflict', apply_error: 'identity_conflict' });
      expect((await vendorBy('M-T2'))[0]).toMatchObject({ name: 'Target two', row_version: 1 });
      expect((await identityRows('vendor')).filter((r) => r.external_key === JSON.stringify([key('M-EXT')]))).toHaveLength(1);
    });

    it('takes the identity acceptance from the stored resolution, not from the actor who applies', async () => {
      const resolver = await person('admin');
      const applier = await person('developer');
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, 'knowledge.catalog.import', null, $3)`,
        [WORKSPACE_ID, applier.id, admin.id],
      );
      const target = await seedVendor('PV-T', 'Target');
      const jobId = await stage('vendor', ['code,name', `${code('PV-EXT')},Mapped by two`].join('\n'), vendorMapping, resolver);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: target }] }, resolver)).outcome).toBe('ok');
      expect((await apply(jobId, applier)).body).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      const stored = (
        await sql(
          `select i.accepted_by, i.created_by, i.accepted_at = r.resolved_at as same_time
             from knowledge.external_identity_map i, knowledge.catalog_import_resolution r
            where r.job_id = $1 and i.workspace_id = $2 and i.source_system = 'catalog_import' and i.external_key = $3`,
          [jobId, WORKSPACE_ID, JSON.stringify([key('PV-EXT')])],
        )
      ).rows;
      expect(stored).toEqual([{ accepted_by: resolver.id, created_by: applier.id, same_time: true }]);
      const audit = await sql(`select distinct actor_id from core.audit_log where detail->'source'->>'importJobId' = $1`, [jobId]);
      expect(audit.rows).toEqual([{ actor_id: applier.id }]);
    });

    it('two jobs claiming one identity key for different targets at once: one wins, the other is a conflict with no write', async () => {
      const ownerA = await person('admin'); // own mutation rate-limit windows
      const ownerB = await person('admin');
      const t1 = await seedVendor('CC-T1', 'Target one');
      const t2 = await seedVendor('CC-T2', 'Target two');
      const csv = ['code,name', `${code('CC-EXT')},Claimed name`].join('\n');
      const jobA = await stage('vendor', csv, vendorMapping, ownerA);
      const jobB = await stage('vendor', csv, vendorMapping, ownerB);
      expect((await act('importResolve', { jobId: jobA, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: t1 }] }, ownerA)).outcome).toBe('ok');
      expect((await act('importResolve', { jobId: jobB, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: t2 }] }, ownerB)).outcome).toBe('ok');
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reachedFirst: () => void = () => undefined;
      const reached = new Promise<void>((resolve) => {
        reachedFirst = resolve;
      });
      let first = true;
      hooks = {
        beforeCommit: async () => {
          if (!first) return;
          first = false; // the first job holds its (uncommitted) claim here
          reachedFirst();
          await gate;
        },
      };
      let winner: Awaited<ReturnType<typeof apply>>;
      let loser: Awaited<ReturnType<typeof apply>>;
      try {
        const a = apply(jobA, ownerA);
        await reached;
        const b = apply(jobB, ownerB); // blocks on the unique index until A commits
        // Release A only once B's identity insert is observed waiting on a lock (A's uncommitted row), so the
        // schedule is the real overlap and never collapses into "A already committed".
        await waitFor(async () => {
          // The app's role hides query text from this connection, so observe the wait itself: a backend that holds a
          // lock on external_identity_map (B, inside its claim insert) waits on a transaction lock of a backend that
          // also holds one on that table (A, whose identity row is uncommitted). Unrelated waiters cannot match.
          const blocked = await sql(
            `select 1
               from pg_locks w
               join pg_locks wr on wr.pid = w.pid and wr.granted
                and wr.relation = 'knowledge.external_identity_map'::regclass
              where not w.granted and w.locktype in ('transactionid', 'speculative token')
                and exists (
                  select 1 from pg_locks hr
                   where hr.granted and hr.relation = 'knowledge.external_identity_map'::regclass
                     and hr.pid = any (pg_blocking_pids(w.pid)))`,
          );
          return blocked.rows.length > 0;
        });
        release();
        [winner, loser] = await Promise.all([a, b]);
      } finally {
        hooks = {};
        release();
      }
      expect(winner.body).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      expect(loser.body).toMatchObject({ status: 'partial_failure', counts: { conflict: 1, failed: 0 } });
      expect((await rows(jobB))[0]).toMatchObject({ apply_status: 'conflict', apply_error: 'identity_conflict' });
      const ids = (await identityRows('vendor')).filter((r) => r.external_key === JSON.stringify([key('CC-EXT')]));
      expect(ids).toEqual([{ external_key: JSON.stringify([key('CC-EXT')]), target_id: t1, mapping_state: 'accepted', accepted_by: ownerA.id }]);
      expect((await vendorBy('CC-T2'))[0]).toMatchObject({ name: 'Target two', row_version: 1 });
      expect((await vendorBy('CC-T1'))[0]).toMatchObject({ name: 'Claimed name', row_version: 2 });
      expect(await auditFor(jobB)).toEqual([]);
      expect((await auditFor(jobA)).map((x) => x.event_type).sort()).toEqual(['knowledge.catalog.identity_mapped', 'knowledge.catalog.updated']);
    });

    it('keeps identity keys apart for the same child key under different vendors; maps a changed target as stale', async () => {
      const vA = await seedVendor('K-VA', 'Va');
      const vB = await seedVendor('K-VB', 'Vb');
      const mA = await seedModel(vA, 'K-TA', 'Target A');
      const mB = await seedModel(vB, 'K-TB', 'Target B');
      const csv = ['v,m,n', `${code('K-VA')},${code('K-SAME')},Name A`, `${code('K-VB')},${code('K-SAME')},Name B`].join('\n');
      const jobId = await stage('model', csv, { vendor_code: 'v', model_code: 'm', model_name: 'n' });
      expect(
        (
          await act('importResolve', {
            jobId,
            resolutions: [
              { rowNo: 1, resolution: 'map', mapTargetId: mA },
              { rowNo: 2, resolution: 'map', mapTargetId: mB },
            ],
          })
        ).outcome,
      ).toBe('ok');
      hooks = {
        beforeRow: async (rowNo) => {
          if (rowNo === 2) await sql('update knowledge.equipment_model set row_version = row_version + 1 where id = $1', [mB]);
        },
      };
      try {
        const done = await applyToEnd(jobId);
        expect(done.last.body).toMatchObject({ status: 'partial_failure', counts: { applied: 1, conflict: 1 } });
      } finally {
        hooks = {};
      }
      const keys = (await identityRows('model')).map((r) => r.external_key);
      expect(keys).toEqual([JSON.stringify([key('K-VA'), key('K-SAME')])]);
      expect((await rows(jobId))[1]).toMatchObject({ apply_status: 'conflict', apply_error: 'stale_target' });
    });

    it('preserves the software name and the model process set when their columns are not mapped', async () => {
      const v = await seedVendor('U-V', 'Vu');
      const process = await seedProcess('U-P', 'Etch');
      const model = await seedModel(v, 'U-M', 'Model old');
      await sql('insert into knowledge.model_process (workspace_id, model_id, process_id, assigned_by) values ($1,$2,$3,$4)', [WORKSPACE_ID, model, process, admin.id]);
      const sw = await seed('software_version', { ...stamp(), model_id: model, version_label: '1.0', version_key: '1.0', name: 'Keep this name' });

      const modelJob = await stage('model', ['v,m,n', `${code('U-V')},${code('U-M')},Model renamed`].join('\n'), { vendor_code: 'v', model_code: 'm', model_name: 'n' });
      expect((await apply(modelJob)).body).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      expect((await sql('select name from knowledge.equipment_model where id = $1', [model])).rows[0].name).toBe('Model renamed');
      expect((await sql('select process_id from knowledge.model_process where model_id = $1', [model])).rows.map((r) => r.process_id)).toEqual([process]);

      const swJob = await stage('software', ['v,m,k', `${code('U-V')},${code('U-M')},9.9`].join('\n'), { vendor_code: 'v', model_code: 'm', version_key: 'k' });
      expect((await act('importResolve', { jobId: swJob, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: sw }] })).outcome).toBe('ok');
      expect((await apply(swJob)).body).toMatchObject({ status: 'completed', counts: { applied: 1 } }); // identity write only
      expect((await sql('select name, row_version from knowledge.software_version where id = $1', [sw])).rows[0]).toEqual({ name: 'Keep this name', row_version: 1 });
      expect((await identityRows('software')).map((r) => r.external_key)).toEqual([JSON.stringify([key('U-V'), key('U-M'), '9.9'])]);
    });

    it('a process deactivated after the seal fails the row (process_inactive) and writes nothing', async () => {
      const v = await seedVendor('PD-V', 'Vd');
      const keep = await seedProcess('PD-KEEP', 'Keep');
      const fresh = await seedProcess('PD-NEW', 'Fresh');
      const model = await seedModel(v, 'PD-M', 'Model');
      await sql('insert into knowledge.model_process (workspace_id, model_id, process_id, assigned_by) values ($1,$2,$3,$4)', [WORKSPACE_ID, model, keep, admin.id]);
      const csv = ['v,m,n,p', `${code('PD-V')},${code('PD-M')},Model,"${code('PD-KEEP')};${code('PD-NEW')}"`].join('\n');
      const jobId = await stage('model', csv, { vendor_code: 'v', model_code: 'm', model_name: 'n', process_codes: 'p' });
      hooks = {
        beforeRow: async () => {
          await sql('update knowledge.process_category set active = false where id = $1', [fresh]);
        },
      };
      try {
        const done = await apply(jobId);
        expect(done.body).toMatchObject({ status: 'partial_failure', counts: { failed: 1 } });
      } finally {
        hooks = {};
      }
      expect((await rows(jobId))[0]).toMatchObject({ apply_status: 'failed', apply_error: 'process_inactive' });
      expect((await sql('select process_id from knowledge.model_process where model_id = $1', [model])).rows.map((r) => r.process_id)).toEqual([keep]);
      expect((await sql('select row_version from knowledge.equipment_model where id = $1', [model])).rows[0].row_version).toBe(1);
    });
  });

  describe('report and permissions', () => {
    it('writes a guarded CSV with the stored headers, and answers 404 for another workspace', async () => {
      const owner = await person('admin'); // its own mutation rate-limit window
      const csv = [' code , name ', `${code('C-1')},"=HYPERLINK(""x"")"`, `${code('C-2')},"a, b"`].join('\n');
      const jobId = await stage('vendor', csv, { vendor_code: 'code', vendor_name: 'name' }, owner);
      await apply(jobId, owner);
      const res = await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${jobId}/report.csv`, headers: cookieHeader(owner.cookie) });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(String(res.headers['content-disposition'])).toContain('attachment');
      const lines = res.body.split('\r\n');
      expect(lines[0]).toBe('﻿row_no,plan_state,resolution,apply_status,apply_error,result_target_id,code,name');
      const created = (await vendorBy('C-1'))[0];
      expect(lines[1]).toBe(`1,new,,applied,,${created?.id},${code('C-1')},"'=HYPERLINK(""x"")"`);
      expect(lines[2]).toContain(`"a, b"`);

      const foreign = (
        await sql(
          `insert into knowledge.catalog_import_job (workspace_id, entity_type, file_name, file_size, file_type, file_sha256, headers, created_by, updated_by)
           values ($1,'vendor','x.csv',1,'csv','00',$2::jsonb,$3,$3) returning id`,
          [otherWorkspace, JSON.stringify(['code']), admin.id],
        )
      ).rows[0].id as string;
      expect((await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${foreign}/report.csv`, headers: cookieHeader(owner.cookie) })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${randomUUID()}/report.csv`, headers: cookieHeader(owner.cookie) })).statusCode).toBe(404);
      expect((await apply(foreign, owner)).res.statusCode).toBe(404);
    });

    it('without the capability: resolve, cancel, apply and report are refused; a granted developer may', async () => {
      const csv = ['code,name', `${code('F-1')},One`].join('\n');
      const owner = await person('admin'); // its own mutation rate-limit window
      const jobId = await stage('vendor', csv, vendorMapping, owner);
      expect((await act('importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'skip' }] }, user)).outcome).toBe('forbidden');
      expect((await act('importCancel', { jobId }, user)).outcome).toBe('forbidden');
      expect((await apply(jobId, user)).res.statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${jobId}/report.csv`, headers: cookieHeader(user.cookie) })).statusCode).toBe(403);
      expect((await jobRow(jobId)).status).toBe('validated');

      expect((await app.inject({ method: 'POST', url: `/api/v1/log-knowledge/imports/${jobId}/apply`, headers: { 'content-type': 'application/json', ...cookieHeader(owner.cookie) }, payload: '{}' })).statusCode).toBe(403); // no CSRF
      expect((await apply(jobId, granted)).body).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      expect((await app.inject({ method: 'GET', url: `/api/v1/log-knowledge/imports/${jobId}/report.csv`, headers: cookieHeader(granted.cookie) })).statusCode).toBe(200);
    });
  });
});
