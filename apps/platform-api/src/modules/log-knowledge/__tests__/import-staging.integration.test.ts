// #1195 a — catalog import staging (upload → map → validate → detail) through the real `buildServer` against a real
// Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`, app as platform_app,
// fixtures and cleanup as platform_migrate). The invariant under test: staging never changes the catalog or writes
// knowledge audit rows. Needs migration 0087 (catalog_import_*).

import { randomUUID } from 'node:crypto';

import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IMP${randomUUID().slice(0, 6).toUpperCase()}`;

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
interface UploadOptions {
  who?: Person | null;
  entityType?: string;
  fileName?: string;
  content?: Buffer | string;
  key?: string | null;
  csrf?: string | null;
  cookie?: string | null;
}

describe.skipIf(!runIntegration)('catalog import staging (#1195 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let granted: Person;
  let otherWorkspace = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;
  const code = (label: string) => `${TAG}-${label}`;
  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  function multipartBody(entityType: string | null, fileName: string, content: Buffer | string) {
    const boundary = `----imp${randomUUID().replaceAll('-', '')}`;
    const chunks: Buffer[] = [];
    if (entityType !== null) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\n${entityType}\r\n`));
    }
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.isBuffer(content) ? content : Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    );
    return { boundary, payload: Buffer.concat(chunks) };
  }

  async function upload(opts: UploadOptions = {}) {
    const who = opts.who === undefined ? admin : opts.who;
    const fileName = opts.fileName ?? `${TAG}-${n++}.csv`;
    const { boundary, payload } = multipartBody(opts.entityType ?? 'vendor', fileName, opts.content ?? 'code,name\nA,B\n');
    const headers: Record<string, string> = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    const cookie = opts.cookie === undefined ? who?.cookie : opts.cookie;
    if (cookie) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
    const csrf = opts.csrf === undefined ? who?.csrf : opts.csrf;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (opts.key !== null) headers['idempotency-key'] = opts.key ?? randomUUID();
    const res = await app.inject({ method: 'POST', url: '/api/v1/log-knowledge/imports', headers, payload });
    return { res, fileName, body: res.json<Record<string, unknown>>() };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string; key?: string } = {},
  ): Promise<Answer> {
    const who = opts.who ?? admin;
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

  async function detail(jobId: string, params: Record<string, unknown> = {}, who: Person = admin) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: 'logKnowledge.importDetail', context: {}, params: { jobId, ...params } }),
    });
    return res.json<{
      outcome: string;
      message?: string;
      data: {
        job: { status: string; planVersion: number; rowVersion: number; fileName: string; headers: string[] };
        rows: { rowNo: number; raw: Record<string, string>; normalized: unknown; errors: { field: string; code: string }[]; planState: string; targetId: string | null; targetVersion: number | null }[];
        total: number;
      } | null;
    }>();
  }

  const jobCountByName = async (fileName: string) =>
    Number((await sql('select count(*)::int as n from knowledge.catalog_import_job where file_name = $1', [fileName])).rows[0].n);
  const jobRow = async (id: string) =>
    (await sql('select * from knowledge.catalog_import_job where id = $1', [id])).rows[0] as Record<string, unknown>;
  const catalogCounts = async () => {
    const out: Record<string, number> = {};
    for (const table of ['vendor', 'process_category', 'equipment_model', 'software_version', 'external_identity_map']) {
      out[table] = Number(
        (await sql(`select count(*)::int as n from knowledge.${table} where workspace_id = $1`, [WORKSPACE_ID])).rows[0].n,
      );
    }
    out.model_process = Number((await sql('select count(*)::int as n from knowledge.model_process where workspace_id = $1', [WORKSPACE_ID])).rows[0].n);
    out.versions = Number((await sql('select coalesce(sum(row_version),0)::int as n from knowledge.vendor where workspace_id = $1', [WORKSPACE_ID])).rows[0].n);
    return out;
  };
  const knowledgeAudit = async () =>
    Number(
      (await sql("select count(*)::int as n from core.audit_log where event_type like 'knowledge.%' and actor_id = any($1)", [actorIds])).rows[0].n,
    );

  const seed = async (table: string, columns: Record<string, unknown>) =>
    (
      await sql(
        `insert into knowledge.${table} (${Object.keys(columns).join(',')}) values (${Object.keys(columns).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
        Object.values(columns),
      )
    ).rows[0].id as string;
  const stamp = () => ({ workspace_id: WORKSPACE_ID, created_by: admin.id, updated_by: admin.id });

  const ids = {} as { vAcme: string; vUpd: string; vOld: string; pEtch: string; mX1: string; mGone: string; sw10: string };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    developer = await person('developer');
    granted = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'knowledge.catalog.import', null, $3)`,
      [WORKSPACE_ID, granted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);

    ids.vAcme = await seed('vendor', { ...stamp(), code: code('ACME'), code_key: toCodeKey(code('ACME')), name: 'Acme' });
    ids.vUpd = await seed('vendor', { ...stamp(), code: code('UPD'), code_key: toCodeKey(code('UPD')), name: 'Upd' });
    ids.vOld = await seed('vendor', { ...stamp(), code: code('OLD'), code_key: toCodeKey(code('OLD')), name: 'Old', active: false });
    ids.pEtch = await seed('process_category', { ...stamp(), code: code('ETCH'), code_key: toCodeKey(code('ETCH')), name: 'Etch' });
    ids.mX1 = await seed('equipment_model', { ...stamp(), vendor_id: ids.vAcme, code: code('X1'), code_key: toCodeKey(code('X1')), name: 'X one' });
    ids.mGone = await seed('equipment_model', { ...stamp(), vendor_id: ids.vAcme, code: code('GONE'), code_key: toCodeKey(code('GONE')), name: 'Gone', active: false });
    await sql('insert into knowledge.model_process (workspace_id, model_id, process_id, assigned_by) values ($1,$2,$3,$4)', [WORKSPACE_ID, ids.mX1, ids.pEtch, admin.id]);
    ids.sw10 = await seed('software_version', { ...stamp(), model_id: ids.mX1, version_label: '1.0', version_key: '1.0', name: 'Release one' });
  });

  afterAll(async () => {
    await sql('delete from knowledge.catalog_import_resolution where resolved_by = any($1)', [actorIds]);
    await sql('delete from knowledge.catalog_import_row where job_id in (select id from knowledge.catalog_import_job where created_by = any($1))', [actorIds]);
    await sql('delete from knowledge.catalog_import_job where created_by = any($1)', [actorIds]);
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
    await dbHandle?.close();
    await migrate?.close();
  });

  const vendorCsv = [
    'code,name',
    `${code('NEWV')},Brand new`, // new
    `${code('acme')},Acme`, // unchanged (key match)
    `${code('UPD')},Upd renamed`, // update (its own seeded vendor; a second ACME row would be duplicate_in_file)
    `${code('OLD')},Old`, // conflict: inactive keeps its key
    `${code('BLANK')},`, // error: required
    `${code('newv')},Again`, // error: duplicate_in_file
  ].join('\n');

  describe('upload → map → validate leaves the catalog and the audit log untouched', () => {
    let jobId = '';
    const before = {} as { counts: Record<string, number>; audit: number };

    it('uploads: 201 with counts only, a job and its rows, no file bytes', async () => {
      before.counts = await catalogCounts();
      before.audit = await knowledgeAudit();
      const key = randomUUID();
      const up = await upload({ content: vendorCsv, key });
      expect(up.res.statusCode).toBe(201);
      expect(up.body).toMatchObject({ rowCount: 6, status: 'uploaded' });
      jobId = up.body.jobId as string;
      expect(await jobRow(jobId)).toMatchObject({
        workspace_id: WORKSPACE_ID,
        entity_type: 'vendor',
        file_name: up.fileName,
        file_size: Buffer.byteLength(vendorCsv),
        file_type: 'csv',
        status: 'uploaded',
        plan_version: 1,
        row_version: 1,
        headers: ['code', 'name'],
        mapping_json: null,
        created_by: admin.id,
      });
      expect(String((await jobRow(jobId)).file_sha256)).toMatch(/^[0-9a-f]{64}$/);
      const rows = (await sql('select row_no, plan_state, parse_errors from knowledge.catalog_import_row where job_id = $1 order by row_no', [jobId])).rows;
      expect(rows.map((r) => r.row_no)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(rows.map((r) => r.plan_state))).toEqual(new Set(['pending']));
    });

    it('refuses a validate before a mapping and a mapping with missing, unknown or duplicate sources', async () => {
      expect((await act('importValidate', { jobId }, { expectedVersion: '1' })).fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`)).toEqual(['jobId:state']);
      const missing = await act('importMap', { jobId, mapping: { vendor_code: 'code' } }, { expectedVersion: '1' });
      expect(missing).toMatchObject({ outcome: 'invalid' });
      expect(missing.fieldErrors).toEqual([{ path: ['mapping', 'vendor_name'], code: 'required' }]);
      expect((await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'code' } }, { expectedVersion: '1' })).fieldErrors).toEqual([
        { path: ['mapping', 'vendor_name'], code: 'duplicate_source' },
      ]);
      expect((await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'nope' } }, { expectedVersion: '1' })).fieldErrors).toEqual([
        { path: ['mapping', 'vendor_name'], code: 'unknown_header' },
      ]);
      expect((await jobRow(jobId)).status).toBe('uploaded');
    });

    it('maps: version 2, plan version 2; a stale expectedVersion is a conflict', async () => {
      const mapping = { vendor_code: 'code', vendor_name: 'name' };
      const ok = await act('importMap', { jobId, mapping }, { expectedVersion: '1' });
      expect(ok).toMatchObject({ outcome: 'ok', version: '2', data: { jobId, status: 'mapped', planVersion: 2 } });
      expect(await jobRow(jobId)).toMatchObject({ mapping_json: mapping, status: 'mapped', plan_version: 2, row_version: 2 });
      const stale = await act('importMap', { jobId, mapping }, { expectedVersion: '1' });
      expect(stale).toMatchObject({ outcome: 'conflict', version: '2' });
      expect((await jobRow(jobId)).plan_version).toBe(2);
    });

    it('validates: plan states per row, counts only in the answer, status review_required', async () => {
      const v = await act('importValidate', { jobId }, { expectedVersion: '2' });
      expect(v).toMatchObject({
        outcome: 'ok',
        version: '3',
        data: { jobId, status: 'review_required', planVersion: 3, counts: { pending: 0, new: 1, unchanged: 1, update: 1, conflict: 1, error: 2 } },
      });
      expect(JSON.stringify(v)).not.toContain('Brand new');
      const d = await detail(jobId);
      expect(d.outcome).toBe('ok');
      expect(d.data?.rows.map((r) => r.planState)).toEqual(['new', 'unchanged', 'update', 'conflict', 'error', 'error']);
      expect(d.data?.rows[1]).toMatchObject({ targetId: ids.vAcme, targetVersion: 1, normalized: { name: 'Acme' } });
      expect(d.data?.rows[2]).toMatchObject({ targetId: ids.vUpd });
      expect(d.data?.rows[3]).toMatchObject({ targetId: ids.vOld });
      expect(d.data?.rows[4]?.errors).toEqual([{ field: 'vendor_name', code: 'required' }]);
      expect(d.data?.rows[5]?.errors).toEqual([{ field: 'vendor_code', code: 'duplicate_in_file' }]);
    });

    it('left every catalog table and the knowledge audit rows unchanged', async () => {
      expect(await catalogCounts()).toEqual(before.counts);
      expect(await knowledgeAudit()).toBe(before.audit);
      const acme = (await sql('select name, row_version, active from knowledge.vendor where id = $1', [ids.vAcme])).rows[0];
      expect(acme).toEqual({ name: 'Acme', row_version: 1, active: true });
    });

    it('pages the rows and filters by planState', async () => {
      const page = await detail(jobId, { page: 1, pageSize: 4 });
      expect(page.data).toMatchObject({ total: 6 });
      expect(page.data?.rows.map((r) => r.rowNo)).toEqual([5, 6]);
      const errors = await detail(jobId, { filters: [{ id: 'planState', op: 'in', value: ['error'] }] });
      expect(errors.data?.total).toBe(2);
      expect(errors.data?.rows.map((r) => r.rowNo)).toEqual([5, 6]);
      const notErrors = await detail(jobId, { filters: [{ id: 'planState', op: 'notIn', value: ['error', 'new'] }] });
      expect(notErrors.data?.rows.map((r) => r.rowNo)).toEqual([2, 3, 4]);
      expect((await detail(jobId, { filters: [{ id: 'planState', op: 'in', value: ['bogus'] }] })).outcome).toBe('error');
      expect((await detail(jobId, { pageSize: 500 })).outcome).toBe('error');
    });

    it('a remap clears the validation results and returns the rows to pending', async () => {
      const remap = await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'name' } }, { expectedVersion: '3' });
      expect(remap).toMatchObject({ outcome: 'ok', version: '4', data: { status: 'mapped', planVersion: 4 } });
      const d = await detail(jobId);
      expect(new Set(d.data?.rows.map((r) => r.planState))).toEqual(new Set(['pending']));
      expect(d.data?.rows.every((r) => r.normalized === null && r.errors.length === 0 && r.targetId === null)).toBe(true);
    });
  });

  describe('model and software jobs read the catalog scope, never infer a vendor move', () => {
    it('plans model rows: unchanged with the process set, new under the same code of another vendor', async () => {
      const csv = [
        'v,c,n,p',
        `${code('ACME')},${code('X1')},X one,${code('ETCH')}`, // unchanged
        `${code('ACME')},${code('X1')}-b,Fresh,`, // new
        `${code('ACME')},${code('GONE')},Gone,`, // conflict
        `${code('NOBODY')},${code('X1')},N,`, // parent_missing
      ].join('\n');
      const up = await upload({ entityType: 'model', content: csv });
      const jobId = up.body.jobId as string;
      expect(
        (await act('importMap', { jobId, mapping: { vendor_code: 'v', model_code: 'c', model_name: 'n', process_codes: 'p' } }, { expectedVersion: '1' })).outcome,
      ).toBe('ok');
      const v = await act('importValidate', { jobId }, { expectedVersion: '2' });
      expect(v.data?.counts).toMatchObject({ unchanged: 1, new: 1, conflict: 1, error: 1 });
      const d = await detail(jobId);
      expect(d.data?.rows.map((r) => r.planState)).toEqual(['unchanged', 'new', 'conflict', 'error']);
      expect(d.data?.rows[3]?.errors).toEqual([{ field: 'vendor_code', code: 'parent_missing' }]);
    });

    it('plans software rows', async () => {
      const csv = ['v,m,k,n', `${code('ACME')},${code('X1')},1.0,Release one`, `${code('ACME')},${code('X1')},2.0,Two`].join('\n');
      const up = await upload({ entityType: 'software', content: csv });
      const jobId = up.body.jobId as string;
      await act('importMap', { jobId, mapping: { vendor_code: 'v', model_code: 'm', version_key: 'k', version_name: 'n' } }, { expectedVersion: '1' });
      const v = await act('importValidate', { jobId }, { expectedVersion: '2' });
      expect(v).toMatchObject({ outcome: 'ok', data: { status: 'validated', counts: { unchanged: 1, new: 1 } } });
    });
  });

  describe('parse errors survive map and validate', () => {
    it('upload → map → validate → remap → validate keeps formula, merged and unsupported cells as errors', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('s');
      ws.addRow(['code', 'name', 'note']);
      ws.addRow([code('XF'), { formula: '1+1', result: 2 }, 'a']);
      ws.addRow([code('XM'), 'Merged', 'b']);
      ws.mergeCells('B3:C3');
      ws.addRow([code('XR'), { richText: [{ text: 'rich' }] }, 'c']);
      ws.addRow([code('XOK'), 'Fine', 'd']);
      const bytes = Buffer.from(await wb.xlsx.writeBuffer());
      const up = await upload({ fileName: `${TAG}-${n++}.xlsx`, content: bytes });
      expect(up.res.statusCode).toBe(201);
      const jobId = up.body.jobId as string;
      const stored = (await sql('select parse_errors from knowledge.catalog_import_row where job_id = $1 order by row_no', [jobId])).rows.map((r) => r.parse_errors);
      expect(stored[0]).toEqual([{ field: 'name', code: 'formula' }]);
      expect(stored[3]).toEqual([]);
      const mapping = { vendor_code: 'code', vendor_name: 'name' };
      await act('importMap', { jobId, mapping }, { expectedVersion: '1' });
      const first = await act('importValidate', { jobId }, { expectedVersion: '2' });
      expect(first.data?.counts).toMatchObject({ error: 3, new: 1 });
      await act('importMap', { jobId, mapping }, { expectedVersion: '3' });
      const second = await act('importValidate', { jobId }, { expectedVersion: '4' });
      expect(second.data?.counts).toMatchObject({ error: 3, new: 1 });
      const d = await detail(jobId);
      expect(d.data?.rows.map((r) => r.planState)).toEqual(['error', 'error', 'error', 'new']);
      expect(d.data?.rows[0]?.errors).toContainEqual({ field: 'name', code: 'formula' });
      expect(d.data?.rows[1]?.errors).toContainEqual({ field: 'name', code: 'merged' });
      expect(d.data?.rows[2]?.errors).toContainEqual({ field: 'name', code: 'unsupported_cell' });
      const kept = (await sql('select parse_errors from knowledge.catalog_import_row where job_id = $1 order by row_no', [jobId])).rows.map((r) => r.parse_errors);
      expect(kept).toEqual(stored);
    });
  });

  describe('permission and workspace isolation', () => {
    it('refuses the route, the actions and the detail without knowledge.catalog.import', async () => {
      const up = await upload({ content: 'code,name\nA,B\n' });
      const jobId = up.body.jobId as string;
      for (const who of [user, developer]) {
        const refused = await upload({ who });
        expect(refused.res.statusCode).toBe(403);
        expect(refused.body.code).toBe('permission.denied');
        expect(await jobCountByName(refused.fileName)).toBe(0);
        expect((await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'name' } }, { who, expectedVersion: '1' })).outcome).toBe('forbidden');
        expect((await act('importValidate', { jobId }, { who, expectedVersion: '1' })).outcome).toBe('forbidden');
        const d = await detail(jobId, {}, who);
        expect(d).toMatchObject({ outcome: 'forbidden', data: null });
      }
      expect((await jobRow(jobId)).status).toBe('uploaded');
    });

    it('accepts a developer holding the workspace grant (no Admin bypass needed)', async () => {
      const up = await upload({ who: granted });
      expect(up.res.statusCode).toBe(201);
      const jobId = up.body.jobId as string;
      expect((await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'name' } }, { who: granted, expectedVersion: '1' })).outcome).toBe('ok');
      expect((await detail(jobId, {}, granted)).outcome).toBe('ok');
    });

    it('answers another workspace’s job and an unknown job alike: not_found', async () => {
      const foreign = await seed('catalog_import_job', {
        workspace_id: otherWorkspace,
        entity_type: 'vendor',
        file_name: `${TAG}-foreign.csv`,
        file_size: 1,
        file_type: 'csv',
        file_sha256: 'a'.repeat(64),
        headers: JSON.stringify(['code', 'name']),
        created_by: admin.id,
        updated_by: admin.id,
      });
      for (const jobId of [foreign, randomUUID()]) {
        expect(await act('importMap', { jobId, mapping: { vendor_code: 'code', vendor_name: 'name' } }, { expectedVersion: '1' })).toMatchObject({ outcome: 'not_found' });
        expect(await act('importValidate', { jobId }, { expectedVersion: '1' })).toMatchObject({ outcome: 'not_found' });
        expect(await detail(jobId)).toMatchObject({ outcome: 'error', data: null, message: 'not_found' });
      }
      expect((await jobRow(foreign)).status).toBe('uploaded');
    });
  });

  describe('route: authentication, CSRF, idempotency', () => {
    it('refuses a missing, expired or foreign-workspace session and a missing or wrong CSRF token — no job', async () => {
      const probe = await person('admin');
      const none = await upload({ cookie: null, csrf: null });
      expect(none.res.statusCode).toBe(401);
      expect(await jobCountByName(none.fileName)).toBe(0);

      const noCsrf = await upload({ who: probe, csrf: null });
      expect(noCsrf.res.statusCode).toBe(403);
      expect(noCsrf.body.code).toBe('csrf.invalid');
      const badCsrf = await upload({ who: probe, csrf: 'not-the-token' });
      expect(badCsrf.res.statusCode).toBe(403);
      expect(badCsrf.body.code).toBe('csrf.invalid');
      expect(await jobCountByName(noCsrf.fileName)).toBe(0);
      expect(await jobCountByName(badCsrf.fileName)).toBe(0);

      await sql("update core.sessions set workspace_id = $2 where id = $1", [probe.cookie, otherWorkspace]);
      const foreign = await upload({ who: probe });
      expect(foreign.res.statusCode).toBe(403);
      expect(foreign.body.code).toBe('auth.workspace_mismatch');
      expect(await jobCountByName(foreign.fileName)).toBe(0);
      await sql("update core.sessions set workspace_id = $2, expires_at = now() - interval '1 hour' where id = $1", [probe.cookie, WORKSPACE_ID]);
      const expired = await upload({ who: probe });
      expect(expired.res.statusCode).toBe(401);
      expect(await jobCountByName(expired.fileName)).toBe(0);
    });

    it('needs an Idempotency-Key', async () => {
      const r = await upload({ key: null });
      expect(r.res.statusCode).toBeGreaterThanOrEqual(400);
      expect(await jobCountByName(r.fileName)).toBe(0);
    });

    it('replays the same key and request as one job; changed bytes or entityType under the same key conflict', async () => {
      const key = randomUUID();
      const fileName = `${TAG}-replay.csv`;
      const first = await upload({ key, fileName, content: 'code,name\nA,B\n' });
      const again = await upload({ key, fileName, content: 'code,name\nA,B\n' });
      expect(first.res.statusCode).toBe(201);
      expect(again.res.statusCode).toBe(201);
      expect(again.body.jobId).toBe(first.body.jobId);
      expect(await jobCountByName(fileName)).toBe(1);

      const bytes = await upload({ key, fileName, content: 'code,name\nA,C\n' });
      expect(bytes.res.statusCode).toBe(409);
      expect(bytes.body.code).toBe('conflict.idempotency_key_reuse');
      const entity = await upload({ key, fileName, entityType: 'process', content: 'code,name\nA,B\n' });
      expect(entity.res.statusCode).toBe(409);
      expect(await jobCountByName(fileName)).toBe(1);
    });

    it('refuses the replay of a valid key after the capability is revoked', async () => {
      const key = randomUUID();
      const fileName = `${TAG}-revoked.csv`;
      const holder = await person('developer');
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, 'knowledge.catalog.import', null, $3)`,
        [WORKSPACE_ID, holder.id, admin.id],
      );
      expect((await upload({ who: holder, key, fileName })).res.statusCode).toBe(201);
      await sql("delete from permission.permission_grants where actor_id = $1 and capability = 'knowledge.catalog.import'", [holder.id]);
      const replay = await upload({ who: holder, key, fileName });
      expect(replay.res.statusCode).toBe(403);
      expect(replay.body.code).toBe('permission.denied');
      expect(await jobCountByName(fileName)).toBe(1);
    });
  });

  describe('route: replay is judged on current permission, under the lock', () => {
    const holderWithGrant = async () => {
      const holder = await person('developer');
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, 'knowledge.catalog.import', null, $3)`,
        [WORKSPACE_ID, holder.id, admin.id],
      );
      return holder;
    };

    it('refuses an in-flight replay when the capability is revoked while it waits for the lock — no replay body', async () => {
      const key = randomUUID();
      const fileName = `${TAG}-inflight.csv`;
      const holder = await holderWithGrant();
      const first = await upload({ who: holder, key, fileName });
      expect(first.res.statusCode).toBe(201);

      // Hold the very advisory lock the frame takes, so the replay parks inside its transaction.
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))', [holder.id, key]);
        const replay = upload({ who: holder, key, fileName });
        for (let i = 0; i < 200; i += 1) {
          const waiting = await sql("select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted");
          if (Number(waiting.rows[0].n) > 0) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        expect(Number((await sql("select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted")).rows[0].n)).toBeGreaterThan(0);
        await sql("delete from permission.permission_grants where actor_id = $1 and capability = 'knowledge.catalog.import'", [holder.id]);
        await client.query('commit');
        const answered = await replay;
        expect(answered.res.statusCode).toBe(403);
        expect(answered.body.code).toBe('permission.denied');
        expect(answered.body.jobId).toBeUndefined();
      } finally {
        await client.query('rollback').catch(() => undefined);
        client.release();
      }
      expect(await jobCountByName(fileName)).toBe(1);
    });

    it('takes one lock and one record for the two spellings of a key: concurrent mixed-case uploads make one job', async () => {
      const key = randomUUID();
      const fileName = `${TAG}-case.csv`;
      const [lower, upper] = await Promise.all([
        upload({ key: key.toLowerCase(), fileName }),
        upload({ key: key.toUpperCase(), fileName }),
      ]);
      expect(lower.res.statusCode).toBe(201);
      expect(upper.res.statusCode).toBe(201);
      expect(upper.body.jobId).toBe(lower.body.jobId);
      expect(await jobCountByName(fileName)).toBe(1);
    });
  });

  describe('route: file-level refusals create no job', () => {
    const refuse = async (opts: UploadOptions, status: number, codeName: string) => {
      const r = await upload(opts);
      expect(r.res.statusCode, JSON.stringify(r.body)).toBe(status);
      expect(r.body.code).toBe(codeName);
      expect(await jobCountByName(r.fileName)).toBe(0);
    };

    it('answers the documented codes', async () => {
      await refuse({ content: Buffer.alloc(5 * 1024 * 1024 + 1024, 0x61) }, 413, 'file_too_large');
      await refuse({ fileName: `${TAG}-x.txt` }, 400, 'unsupported_type');
      await refuse({ content: '' }, 400, 'empty');
      await refuse({ content: 'a,b\n1\n' }, 400, 'unreadable');
      await refuse({ content: Buffer.from([0x61, 0x0a, 0xff, 0xfe]) }, 400, 'encoding');
      await refuse({ content: 'a,,c\n1,2,3\n' }, 400, 'invalid_headers');
      await refuse({ content: 'a,b,a\n1,2,3\n' }, 400, 'invalid_headers');
      const wide = (w: number) => `${Array.from({ length: w }, (_, i) => `c${i}`).join(',')}\n${Array.from({ length: w }, () => 'x').join(',')}\n`;
      await refuse({ content: wide(51) }, 400, 'too_many_columns');
      expect((await upload({ content: wide(50) })).res.statusCode).toBe(201);
      await refuse({ entityType: 'nonsense' }, 400, 'invalid_entity_type');
      const rows = (r: number) => `a\n${Array.from({ length: r }, (_, i) => `r${i}`).join('\n')}\n`;
      await refuse({ content: rows(5001) }, 400, 'too_many_rows');
      expect((await upload({ content: rows(5000) })).body.rowCount).toBe(5000);

      const twoSheets = new ExcelJS.Workbook();
      twoSheets.addWorksheet('a').addRow(['x']);
      twoSheets.addWorksheet('b').addRow(['x']);
      await refuse({ fileName: `${TAG}-2s.xlsx`, content: Buffer.from(await twoSheets.xlsx.writeBuffer()) }, 400, 'sheet_count');
    });
  });
});
