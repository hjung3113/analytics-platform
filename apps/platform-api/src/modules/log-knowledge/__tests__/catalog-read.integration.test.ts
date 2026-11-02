// #1193 — the four catalog reads and the schema invariants of migration 0080, against a real Postgres
// (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`, app as platform_app,
// fixtures and DDL-level checks as platform_migrate). The real `buildServer` over `app.inject`.

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

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IKN${randomUUID().slice(0, 6).toUpperCase()}`;

interface Page<T> {
  rows: T[];
  total: number;
}
interface Answer<T = Page<Record<string, unknown>>> {
  outcome: string;
  data: T | null;
  message?: string;
}

describe.skipIf(!runIntegration)('log knowledge catalog reads and schema (#1193)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let cookie = '';
  let userCookie = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let otherWorkspace = '';
  let actorId = '';
  const ids: Record<string, string> = {};

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const insert = async (table: string, columns: Record<string, unknown>) =>
    (
      await sql(
        `insert into knowledge.${table} (${Object.keys(columns).join(', ')}) values (${Object.keys(columns)
          .map((_, i) => `$${i + 1}`)
          .join(', ')}) returning id`,
        Object.values(columns),
      )
    ).rows[0].id as string;
  const entity = (
    table: string,
    code: string,
    name: string,
    extra: Record<string, unknown> = {},
    workspace = WORKSPACE_ID,
  ) =>
    insert(table, {
      workspace_id: workspace,
      code,
      code_key: toCodeKey(code),
      name,
      created_by: actorId,
      updated_by: actorId,
      ...extra,
    });
  const query = (
    endpoint: string,
    params: Record<string, unknown>,
    who: string | null = cookie,
    extra: Record<string, unknown> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: {
        'content-type': 'application/json',
        ...(who ? { cookie: `${SESSION_COOKIE_NAME}=${who}` } : {}),
      },
      payload: JSON.stringify({ endpoint, context: {}, params, ...extra }),
    });
  const read = async (endpoint: string, params: Record<string, unknown> = {}): Promise<Answer> => {
    const res = await query(endpoint, { q: TAG, ...params });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  };
  const codes = (answer: Answer) => (answer.data?.rows ?? []).map((r) => r.code);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    for (const role of ['admin', 'user'] as const) {
      const externalId = `${TAG}-${role}`;
      const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: role });
      actorIds.push(id);
      if (role === 'admin') actorId = id;
      const c = await loginAs(app, externalId);
      if (role === 'admin') cookie = c;
      else userCookie = c;
    }
    otherWorkspace = (
      await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])
    ).rows[0].id as string;
    workspaceIds.push(otherWorkspace);

    ids.va = await entity('vendor', `${TAG}-va`, 'Alpha Vendor');
    ids.vb = await entity('vendor', `${TAG}-vb`, 'Beta 벤더');
    ids.vOff = await entity('vendor', `${TAG}-voff`, 'Off Vendor', { active: false });
    ids.vOther = await entity('vendor', `${TAG}-vother`, 'Other WS', {}, otherWorkspace);
    ids.pEtch = await entity('process_category', `${TAG}-etch`, 'Etch');
    ids.pDep = await entity('process_category', `${TAG}-dep`, 'Deposition');
    ids.m1 = await entity('equipment_model', `${TAG}-m1`, 'Model One', { vendor_id: ids.va });
    ids.m2 = await entity('equipment_model', `${TAG}-m2`, 'Model Two', { vendor_id: ids.va });
    ids.m3 = await entity('equipment_model', `${TAG}-m3`, 'Model Three', { vendor_id: ids.vb });
    ids.mOff = await entity('equipment_model', `${TAG}-moff`, 'Model Off', { vendor_id: ids.vb, active: false });
    for (const [m, p] of [
      ['m1', 'pEtch'],
      ['m1', 'pDep'],
      ['m2', 'pEtch'],
    ] as const) {
      await sql(
        'insert into knowledge.model_process (workspace_id, model_id, process_id, assigned_by) values ($1,$2,$3,$4)',
        [WORKSPACE_ID, ids[m], ids[p], actorId],
      );
    }
    for (const [label, model] of [
      ['v1.0', 'm1'],
      ['v2.0', 'm1'],
      ['v1.0', 'm2'],
    ] as const) {
      ids[`sw-${model}-${label}`] = await insert('software_version', {
        workspace_id: WORKSPACE_ID,
        model_id: ids[model],
        version_label: `${TAG}-${label}`,
        version_key: toCodeKey(`${TAG}-${label}`),
        name: '',
        created_by: actorId,
        updated_by: actorId,
      });
    }
  });

  afterAll(async () => {
    // Children before parents; core.audit_log needs the migrate role (apps/platform-api/AGENTS.md).
    await sql('delete from knowledge.external_identity_map where created_by = any($1)', [actorIds]);
    for (const table of ['model_process', 'software_version', 'equipment_model', 'process_category', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and ${table === 'model_process' ? 'assigned_by' : 'created_by'} = any($2)`, [
        [WORKSPACE_ID, otherWorkspace],
        actorIds,
      ]);
    }
    if (actorIds.length > 0) {
      for (const [table, column] of [
        ['core.idempotency_keys', 'actor_id'],
        ['core.audit_log', 'actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.sessions', 'actor_id'],
        ['core.actors', 'id'],
      ]) {
        await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
    }
    if (workspaceIds.length > 0) await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('logKnowledge.vendors', () => {
    it('defaults to active rows and filters by status', async () => {
      expect(codes(await read('logKnowledge.vendors'))).toEqual([`${TAG}-va`, `${TAG}-vb`]);
      expect(codes(await read('logKnowledge.vendors', { status: 'inactive' }))).toEqual([`${TAG}-voff`]);
      const all = await read('logKnowledge.vendors', { status: 'all' });
      expect(codes(all)).toEqual([`${TAG}-va`, `${TAG}-vb`, `${TAG}-voff`]);
      expect(all.data?.total).toBe(3);
    });

    it('row shape: id, code (original), name, active, version, counts, timestamps', async () => {
      const row = (await read('logKnowledge.vendors')).data?.rows[0];
      expect(row).toEqual({
        id: ids.va,
        code: `${TAG}-va`,
        name: 'Alpha Vendor',
        active: true,
        version: '1',
        modelCount: 2,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('q matches the code case- and width-insensitively, and the name by contains', async () => {
      const fullWidth = [...`${TAG}-VA`.toLowerCase()].map((c) => (c === '-' ? '－' : c)).join('');
      expect(codes(await read('logKnowledge.vendors', { q: fullWidth }))).toEqual([`${TAG}-va`]);
      expect(codes(await read('logKnowledge.vendors', { q: 'beta' }))).toEqual([`${TAG}-vb`]);
      expect(codes(await read('logKnowledge.vendors', { q: '벤더' }))).toEqual([`${TAG}-vb`]);
      expect(codes(await read('logKnowledge.vendors', { q: 'ALPHA vend' }))).toEqual([`${TAG}-va`]);
    });

    it('q treats % and _ as literals', async () => {
      expect((await read('logKnowledge.vendors', { q: '%' })).data?.total).toBe(0);
      expect((await read('logKnowledge.vendors', { q: `${TAG}_va` })).data?.total).toBe(0);
    });

    it('pages with a total, and sorts with a deterministic id tie-break', async () => {
      const first = await read('logKnowledge.vendors', { status: 'all', page: 0, pageSize: 2 });
      const second = await read('logKnowledge.vendors', { status: 'all', page: 1, pageSize: 2 });
      expect(first.data?.total).toBe(3);
      expect(codes(first)).toHaveLength(2);
      expect(codes(second)).toHaveLength(1);
      expect([...codes(first), ...codes(second)]).toEqual([`${TAG}-va`, `${TAG}-vb`, `${TAG}-voff`]);
      // all three share `active` ties in pairs: order falls to id, the same on every request
      const tied = () => read('logKnowledge.vendors', { status: 'all', sorting: [{ id: 'active', desc: true }] });
      const a = (await tied()).data?.rows.map((r) => r.id);
      const b = (await tied()).data?.rows.map((r) => r.id);
      expect(a).toEqual(b);
      const activeIds = [ids.va, ids.vb].sort();
      expect(a?.slice(0, 2)).toEqual(activeIds);
      const desc = await read('logKnowledge.vendors', { sorting: [{ id: 'name', desc: true }] });
      expect(codes(desc)).toEqual([`${TAG}-vb`, `${TAG}-va`]);
    });

    it('never returns another workspace`s rows, by q or by status all', async () => {
      const res = await read('logKnowledge.vendors', { status: 'all' });
      expect(res.data?.rows.map((r) => r.id)).not.toContain(ids.vOther);
      expect(codes(await read('logKnowledge.vendors', { q: `${TAG}-vother`, status: 'all' }))).toEqual([]);
    });
  });

  describe('logKnowledge.processes', () => {
    it('lists processes with the count of active models', async () => {
      const res = await read('logKnowledge.processes', { sorting: [{ id: 'name', desc: false }] });
      expect(res.data?.rows.map((r) => [r.code, r.modelCount])).toEqual([
        [`${TAG}-dep`, 1],
        [`${TAG}-etch`, 2],
      ]);
    });
  });

  describe('logKnowledge.models', () => {
    it('filters by vendor, and shows vendor name, processes and software count', async () => {
      const res = await read('logKnowledge.models', { vendorId: ids.va });
      expect(codes(res)).toEqual([`${TAG}-m1`, `${TAG}-m2`]);
      const m1 = res.data?.rows[0];
      expect(m1).toMatchObject({
        id: ids.m1,
        vendorId: ids.va,
        vendorName: 'Alpha Vendor',
        softwareCount: 2,
        version: '1',
      });
      expect(m1?.processes).toEqual([
        { id: ids.pDep, name: 'Deposition' },
        { id: ids.pEtch, name: 'Etch' },
      ]);
    });

    it('filters by process; a model in two processes appears once', async () => {
      const etch = await read('logKnowledge.models', { processId: ids.pEtch });
      expect(codes(etch)).toEqual([`${TAG}-m1`, `${TAG}-m2`]);
      expect(etch.data?.total).toBe(2);
      const dep = await read('logKnowledge.models', { processId: ids.pDep });
      expect(codes(dep)).toEqual([`${TAG}-m1`]);
      const both = await read('logKnowledge.models', { vendorId: ids.vb, processId: ids.pEtch });
      expect(both.data?.total).toBe(0);
      expect(both.outcome).toBe('ok');
    });

    it('status filter and sort by vendorName', async () => {
      expect(codes(await read('logKnowledge.models', { status: 'inactive' }))).toEqual([`${TAG}-moff`]);
      const byVendor = await read('logKnowledge.models', { sorting: [{ id: 'vendorName', desc: true }] });
      expect(codes(byVendor)[0]).toBe(`${TAG}-m3`);
    });
  });

  describe('logKnowledge.softwareVersions', () => {
    it('filters by model and q, using the original label as code', async () => {
      const m1 = await read('logKnowledge.softwareVersions', { modelId: ids.m1 });
      expect(codes(m1)).toEqual([`${TAG}-v1.0`, `${TAG}-v2.0`]);
      expect(m1.data?.rows[0]).toMatchObject({ modelId: ids.m1, versionLabel: `${TAG}-v1.0` });
      expect(codes(await read('logKnowledge.softwareVersions', { q: `${TAG}-V2` }))).toEqual([`${TAG}-v2.0`]);
      expect((await read('logKnowledge.softwareVersions')).data?.total).toBe(3);
    });
  });

  describe('judgment', () => {
    it.each([
      ['unknown param key', { q: TAG, nope: 1 }],
      ['bad status', { status: 'deleted' }],
      ['pageSize over the bound', { pageSize: 1000 }],
      ['sort column off the whitelist', { sorting: [{ id: 'codeKey', desc: false }] }],
      ['vendorId not a uuid', { vendorId: 'x' }],
    ])('%s is an error outcome, not an empty page', async (_name, params) => {
      const res = await query('logKnowledge.models', params);
      expect(res.statusCode).toBe(200);
      expect(res.json<Answer>()).toMatchObject({ outcome: 'error', data: null });
    });

    it('modelId is not a models param', async () => {
      const res = await query('logKnowledge.models', { modelId: ids.m1 });
      expect(res.json<Answer>().outcome).toBe('error');
    });

    it('answers 401 without a session', async () => {
      expect((await query('logKnowledge.vendors', {}, null)).statusCode).toBe(401);
    });

    it('every active workspace session reads (a plain user too)', async () => {
      const res = await query('logKnowledge.vendors', { q: TAG }, userCookie);
      expect(res.json<Answer>().outcome).toBe('ok');
    });
  });

  describe('database invariants', () => {
    const attempt = (text: string, params: unknown[], pool = migrate.pool) => pool.query(text, params);

    it('rejects a duplicate code_key in scope, whatever the typed form', async () => {
      await expect(entity('vendor', `${TAG.toLowerCase()}-Va`, 'Dup')).rejects.toMatchObject({ code: '23505' });
      await expect(entity('equipment_model', `${TAG}-M1`, 'Dup', { vendor_id: ids.va })).rejects.toMatchObject({ code: '23505' });
      // the same model code under another vendor is a different scope
      await expect(entity('equipment_model', `${TAG}-m1`, 'Other vendor', { vendor_id: ids.vb })).resolves.toEqual(expect.any(String));
      await expect(
        insert('software_version', {
          workspace_id: WORKSPACE_ID,
          model_id: ids.m1,
          version_label: `${TAG}-V1.0`,
          version_key: toCodeKey(`${TAG}-V1.0`),
          name: '',
          created_by: actorId,
          updated_by: actorId,
        }),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('platform_app cannot DELETE from the catalog tables but can from model_process', async () => {
      for (const table of ['vendor', 'process_category', 'equipment_model', 'software_version', 'external_identity_map']) {
        await expect(attempt(`delete from knowledge.${table} where workspace_id = $1 and false`, [WORKSPACE_ID], dbHandle.pool)).rejects.toMatchObject({
          code: '42501',
        });
      }
      const vendorDelete = attempt('delete from knowledge.vendor where id = $1', [ids.va], dbHandle.pool);
      await expect(vendorDelete).rejects.toThrow(/permission denied/);
      const mapped = await dbHandle.pool.query(
        'delete from knowledge.model_process where workspace_id = $1 and model_id = $2 and process_id = $3',
        [WORKSPACE_ID, ids.m2, ids.pEtch],
      );
      expect(mapped.rowCount).toBe(1);
    });

    it('platform_app may SELECT, INSERT and UPDATE a catalog table', async () => {
      const row = await dbHandle.pool.query(
        `update knowledge.vendor set name = name, row_version = row_version where id = $1 returning id`,
        [ids.vb],
      );
      expect(row.rowCount).toBe(1);
    });

    it('the composite FK rejects a model whose vendor is in another workspace', async () => {
      await expect(entity('equipment_model', `${TAG}-x`, 'Cross', { vendor_id: ids.vOther })).rejects.toMatchObject({ code: '23503' });
    });

    it('rejects an over-long code and a bad mapping_state / target_kind', async () => {
      await expect(entity('vendor', 'X'.repeat(65), 'Long')).rejects.toMatchObject({ code: '23514' });
      const base = {
        workspace_id: WORKSPACE_ID,
        source_system: 's',
        source_type: 't',
        external_key: 'k',
        target_id: ids.va,
        created_by: actorId,
        updated_by: actorId,
      };
      await expect(insert('external_identity_map', { ...base, target_kind: 'vendor', mapping_state: 'maybe' })).rejects.toMatchObject({ code: '23514' });
      await expect(insert('external_identity_map', { ...base, target_kind: 'item' })).rejects.toMatchObject({ code: '23514' });
      await insert('external_identity_map', { ...base, target_kind: 'vendor' });
      await expect(insert('external_identity_map', { ...base, target_kind: 'model' })).rejects.toMatchObject({ code: '23505' });
    });
  });
});
