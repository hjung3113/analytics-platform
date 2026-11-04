// #1195 b2 — name-only model import and blank-code catalog create, through the real `buildServer` against a real
// Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`, app as platform_app,
// fixtures and cleanup as platform_migrate).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
const TAG = `NM${randomUUID().slice(0, 6).toUpperCase()}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: Record<string, unknown> | null;
  fieldErrors: { path: string[]; code: string }[];
}
interface Progress {
  status: string;
  counts: Record<string, number>;
}
interface DetailRow {
  rowNo: number;
  planState: string;
  errors: { field: string; code: string }[];
  creates: { vendor?: string; processes: string[] } | null;
  applyStatus: string | null;
}

describe.skipIf(!runIntegration)('catalog import by names (#1195 b2)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  const actorIds: string[] = [];
  let n = 0;
  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const name = (label: string) => `${TAG} ${label}`;
  const likeTag = `${TAG}%`;

  let hooks: ImportApplyHooks = {};
  const delegating: ImportApplyHooks = {
    afterCodeKeyCheck: (rowNo, tx) => hooks.afterCodeKeyCheck?.(rowNo, tx) ?? Promise.resolve(),
  };

  /** A fresh admin: mutation routes are rate-limited per actor and minute. */
  async function admin(): Promise<Person> {
    const externalId = `${TAG}-admin-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function uploadRaw(who: Person, content: string, entityType = 'model') {
    const boundary = `----nm${randomUUID().replaceAll('-', '')}`;
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="entityType"\r\n\r\n${entityType}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${TAG}-${n++}.csv"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({
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
  }
  const jobRow = async (id: string) => (await sql('select * from knowledge.catalog_import_job where id = $1', [id])).rows[0] as Record<string, unknown>;

  async function act(who: Person, action: string, input: Record<string, unknown>): Promise<Answer> {
    const expectedVersion = typeof input.jobId === 'string' ? String((await jobRow(input.jobId)).row_version) : undefined;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action: `logKnowledge.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion ? { expectedVersion } : {}) }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  /** Upload a names-only sheet and validate it: no `importMap` call. */
  async function stage(who: Person, content: string): Promise<string> {
    const up = await uploadRaw(who, content);
    expect(up.statusCode, up.body).toBe(201);
    const { jobId, status } = up.json<{ jobId: string; status: string }>();
    expect(status).toBe('mapped');
    expect((await act(who, 'importValidate', { jobId })).outcome).toBe('ok');
    return jobId;
  }
  async function detail(who: Person, jobId: string): Promise<{ rows: DetailRow[]; job: { status: string; mapping: Record<string, string> | null } }> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: 'logKnowledge.importDetail', context: {}, params: { jobId, pageSize: 100 } }),
    });
    return res.json<{ data: { rows: DetailRow[]; job: { status: string; mapping: Record<string, string> | null } } }>().data;
  }
  async function apply(who: Person, jobId: string): Promise<Progress> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/log-knowledge/imports/${jobId}/apply`,
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ expectedPlanVersion: Number((await jobRow(jobId)).plan_version) }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Progress>();
  }

  const count = async (table: string) =>
    Number((await sql(`select count(*)::int as c from knowledge.${table} where workspace_id = $1 and name like $2`, [WORKSPACE_ID, likeTag])).rows[0].c);
  const createdAudits = async (jobId: string) =>
    (
      await sql(
        `select subject_type, count(*)::int as c from core.audit_log
         where actor_id = any($1) and event_type = 'knowledge.catalog.created' and detail->'source'->>'importJobId' = $2
         group by subject_type order by subject_type`,
        [actorIds, jobId],
      )
    ).rows as { subject_type: string; c: number }[];
  const seed = async (table: string, columns: Record<string, unknown>) =>
    (
      await sql(
        `insert into knowledge.${table} (${Object.keys(columns).join(',')}) values (${Object.keys(columns).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
        Object.values(columns),
      )
    ).rows[0].id as string;
  const stamp = (by: Person) => ({ workspace_id: WORKSPACE_ID, created_by: by.id, updated_by: by.id });
  const seedNamed = (table: 'vendor' | 'process_category', by: Person, code: string, label: string, active = true) =>
    seed(table, { ...stamp(by), code, code_key: toCodeKey(code), name: name(label), active });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, logKnowledgeImport: { hooks: delegating } });
    await app.ready();
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
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('validates and applies a names-only sheet in one job: parents created once and audited, re-import unchanged, replay creates nothing', async () => {
    const a = await admin();
    // 2 existing makers (one found by code_key, one by its name) and 1 existing process.
    await seedNamed('vendor', a, name('Alpha'), 'Alpha'); // code = name: found by code_key
    await seedNamed('vendor', a, `${TAG}-BETA-CODE`, 'Beta'); // code differs: found by name
    await seedNamed('process_category', a, name('CMP'), 'CMP');
    const header = '메이커명,모델명,공정명';
    const lines: string[] = [];
    const makers = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']; // Gamma, Delta, Epsilon are new
    const processes = [['CMP'], ['CMP', 'Etch'], ['Etch', 'Clean'], ['Litho']]; // Etch, Clean, Litho are new
    for (let i = 0; i < 12; i += 1) {
      lines.push(`${name(makers[i % 5] as string)},${name(`Model ${i}`)},"${(processes[i % 4] as string[]).map(name).join(', ')}"`);
    }
    const csv = [header, ...lines].join('\n');

    const jobId = await stage(a, csv);
    const shown = await detail(a, jobId);
    expect(shown.job.mapping).toEqual({ vendor_name: '메이커명', model_name: '모델명', process_names: '공정명' });
    expect(shown.rows.map((r) => r.planState)).toEqual(Array(12).fill('new'));
    expect(shown.rows[2]?.creates).toEqual({ vendor: name('Gamma'), processes: [name('Etch'), name('Clean')] });
    expect(shown.rows[0]?.creates).toBeNull();
    expect(await count('vendor')).toBe(2);

    const done = await apply(a, jobId);
    expect(done).toMatchObject({ status: 'completed', counts: { applied: 12 } });
    expect(await count('vendor')).toBe(5);
    expect(await count('process_category')).toBe(4);
    expect(await count('equipment_model')).toBe(12);
    // Codes are the names; every maker and process was created exactly once.
    expect((await sql(`select code, code_key from knowledge.vendor where workspace_id = $1 and name = $2`, [WORKSPACE_ID, name('Gamma')])).rows).toEqual([
      { code: name('Gamma'), code_key: toCodeKey(name('Gamma')) },
    ]);
    expect(await createdAudits(jobId)).toEqual([
      { subject_type: 'knowledge_model', c: 12 },
      { subject_type: 'knowledge_process', c: 3 },
      { subject_type: 'knowledge_vendor', c: 3 },
    ]);
    const links = await sql(`select count(*)::int as c from knowledge.model_process mp join knowledge.equipment_model m on m.id = mp.model_id where m.workspace_id = $1 and m.name like $2`, [WORKSPACE_ID, likeTag]);
    expect(links.rows[0].c).toBe(3 * (1 + 2 + 2 + 1));

    // Replaying the apply creates nothing.
    const replay = await apply(a, jobId);
    expect(replay).toMatchObject({ status: 'completed', counts: { applied: 12 } });
    expect([await count('vendor'), await count('process_category'), await count('equipment_model')]).toEqual([5, 4, 12]);
    expect(await createdAudits(jobId)).toHaveLength(3);

    // The same file again plans every row unchanged and applies nothing.
    const b = await admin();
    const again = await stage(b, csv);
    expect((await detail(b, again)).rows.map((r) => r.planState)).toEqual(Array(12).fill('unchanged'));
    expect(await apply(b, again)).toMatchObject({ status: 'completed', counts: { unchanged: 12, applied: 0 } });
    expect(await createdAudits(again)).toEqual([]);

    // A new process on an existing model is created and linked in that row's transaction.
    const c = await admin();
    const extra = await stage(c, [header, `${name('Alpha')},${name('Model 0')},"${[name('CMP'), name('Bake')].join(',')}"`].join('\n'));
    expect((await detail(c, extra)).rows[0]).toMatchObject({ planState: 'update', creates: { processes: [name('Bake')] } });
    expect(await apply(c, extra)).toMatchObject({ status: 'completed', counts: { applied: 1 } });
    expect(await count('process_category')).toBe(5);
    expect(await createdAudits(extra)).toEqual([{ subject_type: 'knowledge_process', c: 1 }]);
  });

  it('refuses a sheet with a missing or duplicate header at upload, naming the header', async () => {
    const a = await admin();
    const missing = await uploadRaw(a, '모델명,공정명\nX,CMP\n');
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ code: 'missing_header', detail: { headers: ['메이커명'] } });
    const dup = await uploadRaw(a, '메이커명,제조사,모델명\nA,A,X\n');
    expect(dup.statusCode).toBe(400);
    expect(dup.json()).toMatchObject({ code: 'duplicate_header', detail: { headers: ['메이커명', '제조사'] } });
    const same = await uploadRaw(a, '메이커명,메이커명,모델명\nA,A,X\n');
    expect(same.json()).toMatchObject({ code: 'duplicate_header', detail: { headers: ['메이커명', '메이커명'] } });
    // Vendor uploads keep the old refusal and start unmapped.
    expect((await uploadRaw(a, 'a,b,a\n1,2,3\n', 'vendor')).json()).toMatchObject({ code: 'invalid_headers' });
    const vendorUp = await uploadRaw(a, 'code,name\nX,Y\n', 'vendor');
    expect(vendorUp.json()).toMatchObject({ status: 'uploaded' });
  });

  it('a maker named on several rows is created once, even when another runner creates it first', async () => {
    const a = await admin();
    const b = await admin();
    const shared = 'Shared Maker';
    const jobA = await stage(a, `메이커명,모델명\n${name(shared)},${name('SM-A')}\n`);
    const jobB = await stage(b, `메이커명,모델명\n${name(shared)},${name('SM-B')}\n`);
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The first runner stops after its key check, before it creates the maker; the second runner creates and commits it.
    hooks = {
      afterCodeKeyCheck: async () => {
        calls += 1;
        if (calls === 1) await gate;
      },
    };
    try {
      const first = apply(a, jobA);
      const deadline = Date.now() + 15_000;
      while (calls < 1) {
        if (Date.now() > deadline) throw new Error('the first runner never reached the hook');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await apply(b, jobB)).toMatchObject({ status: 'completed', counts: { applied: 1 } });
      release();
      expect(await first).toMatchObject({ status: 'completed', counts: { applied: 1 } });
    } finally {
      hooks = {};
      release();
    }
    expect((await sql(`select count(*)::int as c from knowledge.vendor where workspace_id = $1 and name = $2`, [WORKSPACE_ID, name(shared)])).rows[0].c).toBe(1);
    const vendorAudits = [...(await createdAudits(jobA)), ...(await createdAudits(jobB))].filter((r) => r.subject_type === 'knowledge_vendor');
    expect(vendorAudits).toEqual([{ subject_type: 'knowledge_vendor', c: 1 }]);
    expect(await count('equipment_model')).toBeGreaterThanOrEqual(2);
  });

  it('plans conflicts: inactive/ambiguous parents resolve by skip only, an ambiguous model name by map or skip', async () => {
    const a = await admin();
    await seedNamed('vendor', a, name('Dormant'), 'Dormant', false);
    const twin1 = await seedNamed('vendor', a, `${TAG}-TW1`, 'Twin');
    await seedNamed('vendor', a, `${TAG}-TW2`, 'Twin');
    const keeper = await seedNamed('vendor', a, name('Keeper'), 'Keeper');
    const m1 = await seed('equipment_model', { ...stamp(a), vendor_id: keeper, code: `${TAG}-K1`, code_key: toCodeKey(`${TAG}-K1`), name: name('Dup Model') });
    await seed('equipment_model', { ...stamp(a), vendor_id: keeper, code: `${TAG}-K2`, code_key: toCodeKey(`${TAG}-K2`), name: name('Dup Model') });
    const csv = [
      '메이커명,모델명',
      `${name('Dormant')},${name('D1')}`, // parent_inactive
      `${name('Twin')},${name('T1')}`, // ambiguous_parent
      `${name('Keeper')},${name('Dup Model')}`, // ambiguous_name
      `${name('Fresh')},${name('F1')}`, // new
    ].join('\n');
    const jobId = await stage(a, csv);
    const rows = (await detail(a, jobId)).rows;
    expect(rows.map((r) => [r.planState, r.errors[0]?.code])).toEqual([
      ['conflict', 'parent_inactive'],
      ['conflict', 'ambiguous_parent'],
      ['conflict', 'ambiguous_name'],
      ['new', undefined],
    ]);
    // A model target never stands in for a parent.
    const refused = await act(a, 'importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'map', mapTargetId: m1 }, { rowNo: 2, resolution: 'map', mapTargetId: m1 }] });
    expect(refused.fieldErrors).toEqual([
      { path: ['resolutions', '0', 'resolution'], code: 'not_allowed' },
      { path: ['resolutions', '1', 'resolution'], code: 'not_allowed' },
    ]);
    expect(twin1).toBeTruthy();
    expect(
      (await act(a, 'importResolve', { jobId, resolutions: [{ rowNo: 1, resolution: 'skip' }, { rowNo: 2, resolution: 'skip' }, { rowNo: 3, resolution: 'map', mapTargetId: m1 }] })).outcome,
    ).toBe('ok');
    const done = await apply(a, jobId);
    expect(done).toMatchObject({ status: 'completed', counts: { skipped: 2, applied: 2 } });
    // Two seeded + F1; D1 and T1 were skipped and the mapped row created no third 'Dup Model'.
    const names = (await sql(`select name from knowledge.equipment_model where workspace_id = $1 and name = any($2) order by name`, [WORKSPACE_ID, [name('Dup Model'), name('D1'), name('T1'), name('F1')]])).rows.map((r) => r.name);
    expect(names).toEqual([name('Dup Model'), name('Dup Model'), name('F1')]);
    expect((await sql(`select count(*)::int as c from knowledge.vendor where workspace_id = $1 and name = $2`, [WORKSPACE_ID, name('Fresh')])).rows[0].c).toBe(1);
  });

  it.each(['vendor', 'process', 'model'] as const)('catalog create of a %s with no code takes the name as the code (64 code points; 65 is too_long)', async (kind) => {
    const a = await admin();
    const text = (length: number) => `${TAG}${'가'.repeat(length - TAG.length)}`;
    const parent = kind === 'model' ? { vendorId: await seedNamed('vendor', a, `${TAG}-CV-${n++}`, 'CV'), processIds: [] } : {};
    const tooLong = await act(a, `${kind}Create`, { ...parent, name: text(65) });
    expect(tooLong.outcome).toBe('invalid');
    expect(tooLong.fieldErrors).toEqual([{ path: ['code'], code: 'too_long' }]);
    const ok = await act(a, `${kind}Create`, { ...parent, name: text(64) });
    expect(ok.outcome).toBe('ok');
    expect(ok.data).toMatchObject({ code: text(64), name: text(64) });
    const table = { vendor: 'vendor', process: 'process_category', model: 'equipment_model' }[kind];
    const row = (await sql(`select code, code_key from knowledge.${table} where id = $1`, [(ok.data as { id: string }).id])).rows[0];
    expect(row).toEqual({ code: text(64), code_key: toCodeKey(text(64)) });
    // The same derived key is taken the next time, with a blank code as well as a missing one.
    expect((await act(a, `${kind}Create`, { ...parent, code: '  ', name: text(64) })).fieldErrors).toEqual([{ path: ['code'], code: 'duplicate' }]);
  });
});
