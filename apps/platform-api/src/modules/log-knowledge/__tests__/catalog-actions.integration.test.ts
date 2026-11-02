// #1194 (a) — the catalog write actions through the real `buildServer` over `POST /api/v1/menu-action`
// against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`,
// app as platform_app, fixtures and cleanup as platform_migrate). Each write is judged on the wire answer,
// the `knowledge.*` rows and the `core.audit_log` rows written in the same transaction.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IKW${randomUUID().slice(0, 6).toUpperCase()}`;

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

describe.skipIf(!runIntegration)('log knowledge catalog write actions (#1194 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
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

  async function read(endpoint: string, params: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
      payload: JSON.stringify({ endpoint: `logKnowledge.${endpoint}`, context: {}, params: { q: TAG, status: 'all', ...params } }),
    });
    return res.json<{ outcome: string; data: { rows: Record<string, unknown>[]; total: number } }>().data;
  }

  const rowOf = async (table: string, id: string) =>
    (await sql(`select * from knowledge.${table} where id = $1`, [id])).rows[0] as Record<string, unknown> | undefined;
  const count = async (table: string, column: string, value: string) =>
    Number((await sql(`select count(*)::int as n from knowledge.${table} where ${column} = $1`, [value])).rows[0].n);
  const audit = async (subjectId: string) =>
    (
      await sql(
        'select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id',
        [subjectId],
      )
    ).rows as { event_type: string; subject_type: string; actor_id: string; detail: Record<string, unknown> }[];
  const mapped = async (modelId: string) =>
    (await sql('select process_id from knowledge.model_process where model_id = $1 order by process_id', [modelId])).rows.map(
      (r) => r.process_id as string,
    );
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  const ids = {} as { foreignProcess: string; foreignVendor: string; m1: string; m1b: string; mOff: string; pd: string; pe: string; pOff: string; px: string; sw: string; va: string; vb: string; vOff: string; };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    developer = await person('developer');
    developerGranted = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'knowledge.catalog.manage', null, $3)`,
      [WORKSPACE_ID, developerGranted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    const foreign = async (table: string, extra: Record<string, unknown>) => {
      const columns = { workspace_id: otherWorkspace, created_by: admin.id, updated_by: admin.id, ...extra };
      return (
        await sql(
          `insert into knowledge.${table} (${Object.keys(columns).join(',')}) values (${Object.keys(columns).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
          Object.values(columns),
        )
      ).rows[0].id as string;
    };
    ids.foreignVendor = await foreign('vendor', { code: code('fv'), code_key: toCodeKey(code('fv')), name: 'Foreign' });
    ids.foreignProcess = await foreign('process_category', { code: code('fp'), code_key: toCodeKey(code('fp')), name: 'Foreign' });
  });

  afterAll(async () => {
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

  describe('create, one per kind: ok + row + audit row', () => {
    it('vendorCreate', async () => {
      const a = await act('vendorCreate', { code: code('va'), name: 'Vendor VA' });
      expect(a).toMatchObject({ outcome: 'ok', version: '1', data: { code: code('va'), name: 'Vendor VA', active: true, version: '1' } });
      ids.va = a.data?.id as string;
      expect(await rowOf('vendor', ids.va)).toMatchObject({
        workspace_id: WORKSPACE_ID,
        code_key: toCodeKey(code('va')),
        row_version: 1,
        created_by: admin.id,
        updated_by: admin.id,
      });
      expect(await audit(ids.va)).toEqual([
        { event_type: 'knowledge.catalog.created', subject_type: 'knowledge_vendor', actor_id: admin.id, detail: { code: code('va'), name: 'Vendor VA' } },
      ]);
    });

    it('processCreate', async () => {
      for (const label of ['pe', 'pd'] as const) {
        const a = await act('processCreate', { code: code(label), name: `Process ${label}` });
        expect(a.outcome).toBe('ok');
        ids[label] = a.data?.id as string;
      }
      expect((await audit(ids.pe))[0]).toMatchObject({ event_type: 'knowledge.catalog.created', subject_type: 'knowledge_process' });
    });

    it('modelCreate maps the given processes', async () => {
      const a = await act('modelCreate', { vendorId: ids.va, code: code('m1'), name: 'Model One', processIds: [ids.pe, ids.pd] });
      expect(a).toMatchObject({ outcome: 'ok', version: '1' });
      ids.m1 = a.data?.id as string;
      expect(await mapped(ids.m1)).toEqual([ids.pe, ids.pd].sort());
      expect(await rowOf('equipment_model', ids.m1)).toMatchObject({ vendor_id: ids.va });
      expect((await audit(ids.m1))[0]).toMatchObject({ event_type: 'knowledge.catalog.created', subject_type: 'knowledge_model' });
    });

    it('softwareCreate (empty name allowed)', async () => {
      const a = await act('softwareCreate', { modelId: ids.m1, versionLabel: code('v1'), name: '' });
      expect(a).toMatchObject({ outcome: 'ok', data: { code: code('v1') } });
      ids.sw = a.data?.id as string;
      expect(await rowOf('software_version', ids.sw)).toMatchObject({ version_key: toCodeKey(code('v1')), name: '' });
      expect((await audit(ids.sw))[0]).toMatchObject({ event_type: 'knowledge.catalog.created', subject_type: 'knowledge_software' });
    });
  });

  describe('update', () => {
    it('a stale version answers conflict with the current version and writes nothing', async () => {
      const a = await act('vendorUpdate', { id: ids.va, code: code('va'), name: 'Changed' }, { expectedVersion: '7' });
      expect(a).toMatchObject({ outcome: 'conflict', version: '1' });
      expect(await rowOf('vendor', ids.va)).toMatchObject({ name: 'Vendor VA', row_version: 1 });
    });

    it.each([
      ['vendor', 'vendor', () => ({ id: ids.va, code: code('va'), name: 'Vendor VA 2' }), 'name'],
      ['process', 'process_category', () => ({ id: ids.pe, code: code('pe'), name: 'Etch 2' }), 'name'],
      ['model', 'equipment_model', () => ({ id: ids.m1, code: code('m1'), name: 'Model One 2', processIds: [ids.pe, ids.pd] }), 'name'],
      ['software', 'software_version', () => ({ id: ids.sw, versionLabel: code('v1'), name: 'SW named' }), 'name'],
    ] as const)('%sUpdate bumps the version, stamps the row and audits the change', async (kind, table, input, field) => {
      const body = input();
      const a = await act(`${kind}Update`, body, { expectedVersion: '1' });
      expect(a).toMatchObject({ outcome: 'ok', version: '2' });
      const row = await rowOf(table, body.id);
      expect(row).toMatchObject({ row_version: 2, updated_by: admin.id });
      const last = (await audit(body.id)).at(-1);
      expect(last).toMatchObject({ event_type: 'knowledge.catalog.updated' });
      expect(Object.keys((last?.detail.changes ?? {}) as object)).toEqual([field]);
    });

    it('a changed code recomputes the comparison key', async () => {
      const a = await act('vendorUpdate', { id: ids.va, code: code('vA'), name: 'Vendor VA 2' }, { expectedVersion: '2' });
      expect(a.outcome).toBe('ok');
      expect(await rowOf('vendor', ids.va)).toMatchObject({ code: code('vA'), code_key: toCodeKey(code('va')), row_version: 3 });
    });

    it('rejects changing the vendor of a model (no vendorId input)', async () => {
      const a = await act('modelUpdate', { id: ids.m1, vendorId: ids.va, code: code('m1'), name: 'x', processIds: [] }, { expectedVersion: '2' });
      expect(a).toMatchObject({ outcome: 'invalid' });
      expect(fe(a)).toEqual(['vendorId:unexpected_field']);
    });
  });

  describe('duplicates', () => {
    it.each([
      ['vendorCreate', () => ({ code: code('VA').toLowerCase(), name: 'dup' }), ['code:duplicate']],
      ['processCreate', () => ({ code: ` ${code('pe')} `, name: 'dup' }), ['code:duplicate']],
      ['modelCreate', () => ({ vendorId: ids.va, code: code('M1'), name: 'dup', processIds: [] }), ['code:duplicate']],
      ['softwareCreate', () => ({ modelId: ids.m1, versionLabel: code('V1'), name: 'dup' }), ['versionLabel:duplicate']],
    ] as const)('%s with an existing key in scope answers invalid duplicate', async (action, input, expected) => {
      const a = await act(action, input());
      expect(a).toMatchObject({ outcome: 'invalid', data: null });
      expect(fe(a)).toEqual(expected);
    });

    it('the same model code under another vendor is not a duplicate (ADR-0107 scope)', async () => {
      const vb = await act('vendorCreate', { code: code('vb'), name: 'VB' });
      ids.vb = vb.data?.id as string;
      const a = await act('modelCreate', { vendorId: ids.vb, code: code('m1'), name: 'Same code', processIds: [] });
      expect(a.outcome).toBe('ok');
      ids.m1b = a.data?.id as string;
    });

    it('update to another row`s key answers invalid duplicate and leaves the row unchanged', async () => {
      const a = await act('vendorUpdate', { id: ids.vb, code: code('va'), name: 'VB' }, { expectedVersion: '1' });
      expect(fe(a)).toEqual(['code:duplicate']);
      expect(await rowOf('vendor', ids.vb)).toMatchObject({ code: code('vb'), row_version: 1 });
    });

    it('two concurrent creates of one code: one ok, one invalid duplicate, no 500', async () => {
      const [x, y] = await Promise.all([
        act('vendorCreate', { code: code('race'), name: 'Race 1' }),
        act('vendorCreate', { code: code('RACE'), name: 'Race 2' }),
      ]);
      expect([x.outcome, y.outcome].sort()).toEqual(['invalid', 'ok']);
      const loser = x.outcome === 'invalid' ? x : y;
      expect(fe(loser)).toEqual(['code:duplicate']);
      expect(await count('vendor', 'code_key', toCodeKey(code('race')))).toBe(1);
    });
  });

  describe('parents and references', () => {
    it('unknown or other-workspace vendorId/modelId/processIds answer invalid not_found with the path', async () => {
      const unknown = randomUUID();
      expect(fe(await act('modelCreate', { vendorId: unknown, code: code('x1'), name: 'x', processIds: [] }))).toEqual(['vendorId:not_found']);
      expect(fe(await act('modelCreate', { vendorId: ids.foreignVendor, code: code('x1'), name: 'x', processIds: [] }))).toEqual(['vendorId:not_found']);
      expect(fe(await act('softwareCreate', { modelId: unknown, versionLabel: 'v9', name: '' }))).toEqual(['modelId:not_found']);
      expect(
        fe(await act('modelCreate', { vendorId: ids.va, code: code('x2'), name: 'x', processIds: [ids.pe, ids.foreignProcess, unknown] })),
      ).toEqual(['processIds.1:not_found', 'processIds.2:not_found']);
      expect(await count('equipment_model', 'code_key', toCodeKey(code('x2')))).toBe(0);
    });

    it('an inactive vendor, model or process answers invalid inactive and writes nothing', async () => {
      const vOff = (await act('vendorCreate', { code: code('voff'), name: 'Off' })).data?.id as string;
      const pOff = (await act('processCreate', { code: code('poff'), name: 'Off' })).data?.id as string;
      const mOff = (await act('modelCreate', { vendorId: ids.va, code: code('moff'), name: 'Off', processIds: [] })).data?.id as string;
      ids.vOff = vOff;
      ids.pOff = pOff;
      ids.mOff = mOff;
      for (const [action, id] of [['vendorSetActive', vOff], ['processSetActive', pOff], ['modelSetActive', mOff]] as const) {
        expect((await act(action, { id, active: false }, { expectedVersion: '1' })).outcome).toBe('ok');
      }
      expect(fe(await act('modelCreate', { vendorId: vOff, code: code('y1'), name: 'x', processIds: [] }))).toEqual(['vendorId:inactive']);
      expect(fe(await act('modelCreate', { vendorId: ids.va, code: code('y2'), name: 'x', processIds: [pOff] }))).toEqual(['processIds.0:inactive']);
      expect(fe(await act('softwareCreate', { modelId: mOff, versionLabel: 'v1', name: '' }))).toEqual(['modelId:inactive']);
      expect(
        fe(await act('modelUpdate', { id: ids.m1, code: code('m1'), name: 'Model One 2', processIds: [ids.pe, ids.pd, pOff] }, { expectedVersion: '2' })),
      ).toEqual(['processIds.2:inactive']);
      for (const c of ['y1', 'y2']) expect(await count('equipment_model', 'code_key', toCodeKey(code(c)))).toBe(0);
    });

    it('a process that is already mapped may stay mapped after it was deactivated', async () => {
      const m = (await act('modelCreate', { vendorId: ids.va, code: code('keep'), name: 'Keep', processIds: [ids.pd] })).data?.id as string;
      expect((await act('processSetActive', { id: ids.pd, active: false }, { expectedVersion: '1' })).outcome).toBe('ok');
      const a = await act('modelUpdate', { id: m, code: code('keep'), name: 'Keep 2', processIds: [ids.pd] }, { expectedVersion: '1' });
      expect(a.outcome).toBe('ok');
      expect((await act('processSetActive', { id: ids.pd, active: true }, { expectedVersion: '2' })).outcome).toBe('ok');
    });
  });

  describe('workspace isolation', () => {
    it.each([
      ['vendorUpdate', () => ({ id: ids.foreignVendor, code: 'a', name: 'b' })],
      ['vendorSetActive', () => ({ id: ids.foreignVendor, active: false })],
      ['processUpdate', () => ({ id: ids.foreignProcess, code: 'a', name: 'b' })],
    ] as const)('%s on another workspace`s row answers not_found and changes nothing', async (action, input) => {
      const a = await act(action, input(), { expectedVersion: '1' });
      expect(a).toMatchObject({ outcome: 'not_found', data: null });
      expect(await rowOf('vendor', ids.foreignVendor)).toMatchObject({ active: true, row_version: 1 });
      expect(await rowOf('process_category', ids.foreignProcess)).toMatchObject({ active: true, row_version: 1 });
    });
  });

  describe('model processIds replacement', () => {
    it('adds and removes mapping rows, keeps the model id, and audits id lists', async () => {
      const px = (await act('processCreate', { code: code('px'), name: 'PX' })).data?.id as string;
      const before = await rowOf('equipment_model', ids.m1);
      const a = await act(
        'modelUpdate',
        { id: ids.m1, code: code('m1'), name: 'Model One 2', processIds: [ids.pe, px] },
        { expectedVersion: String(before?.row_version) },
      );
      expect(a.outcome).toBe('ok');
      expect(a.data?.id).toBe(ids.m1);
      expect(await mapped(ids.m1)).toEqual([ids.pe, px].sort());
      expect(await rowOf('equipment_model', ids.m1)).toMatchObject({ id: ids.m1, row_version: Number(before?.row_version) + 1 });
      const last = (await audit(ids.m1)).at(-1);
      expect(last?.detail.changes).toEqual({ processIds: [[ids.pe, ids.pd].sort(), [ids.pe, px].sort()] });
      ids.px = px;
    });

    it('an empty set unmaps every process', async () => {
      const v = String((await rowOf('equipment_model', ids.m1))?.row_version);
      expect((await act('modelUpdate', { id: ids.m1, code: code('m1'), name: 'Model One 2', processIds: [] }, { expectedVersion: v })).outcome).toBe('ok');
      expect(await mapped(ids.m1)).toEqual([]);
    });
  });

  describe('setActive', () => {
    it('deactivates and reactivates one row, bumps the version, audits, and leaves children as they are', async () => {
      const swBefore = await rowOf('software_version', ids.sw);
      const off = await act('modelSetActive', { id: ids.m1, active: false }, { expectedVersion: String((await rowOf('equipment_model', ids.m1))?.row_version) });
      expect(off.outcome).toBe('ok');
      expect(off.data).toMatchObject({ active: false });
      expect(await rowOf('software_version', ids.sw)).toMatchObject({ active: true, row_version: swBefore?.row_version });
      const on = await act('modelSetActive', { id: ids.m1, active: true }, { expectedVersion: off.version as string });
      expect(on.data).toMatchObject({ active: true });
      expect((await audit(ids.m1)).slice(-2).map((r) => r.event_type)).toEqual(['knowledge.catalog.deactivated', 'knowledge.catalog.reactivated']);
    });

    it('does not cascade from a vendor to its models', async () => {
      const v = String((await rowOf('vendor', ids.va))?.row_version);
      const off = await act('vendorSetActive', { id: ids.va, active: false }, { expectedVersion: v });
      expect(off.outcome).toBe('ok');
      expect(await rowOf('equipment_model', ids.m1)).toMatchObject({ active: true });
      expect((await act('vendorSetActive', { id: ids.va, active: true }, { expectedVersion: off.version as string })).outcome).toBe('ok');
    });

    it('the same value answers ok with the current version, bumps nothing and audits nothing', async () => {
      const v = String((await rowOf('process_category', ids.pe))?.row_version);
      const events = (await audit(ids.pe)).length;
      const a = await act('processSetActive', { id: ids.pe, active: true }, { expectedVersion: v });
      expect(a).toMatchObject({ outcome: 'ok', version: v });
      expect(await rowOf('process_category', ids.pe)).toMatchObject({ row_version: Number(v) });
      expect((await audit(ids.pe)).length).toBe(events);
    });

    it('a stale version answers conflict', async () => {
      expect(await act('softwareSetActive', { id: ids.sw, active: false }, { expectedVersion: '99' })).toMatchObject({ outcome: 'conflict' });
    });
  });

  describe('permission', () => {
    it('a User answers forbidden and writes no row', async () => {
      const a = await act('vendorCreate', { code: code('nouser'), name: 'x' }, { who: user });
      expect(a).toMatchObject({ outcome: 'forbidden', data: null });
      expect(await count('vendor', 'code_key', toCodeKey(code('nouser')))).toBe(0);
    });

    it('a Developer without the grant answers forbidden; with a workspace grant, ok', async () => {
      expect((await act('vendorCreate', { code: code('nodev'), name: 'x' }, { who: developer })).outcome).toBe('forbidden');
      expect(await count('vendor', 'code_key', toCodeKey(code('nodev')))).toBe(0);
      const ok = await act('vendorCreate', { code: code('dev'), name: 'x' }, { who: developerGranted });
      expect(ok.outcome).toBe('ok');
      expect((await audit(ok.data?.id as string))[0]?.actor_id).toBe(developerGranted.id);
    });

    it('an Admin with no grant row is allowed (module bypass)', async () => {
      const grants = await sql('select 1 from permission.permission_grants where actor_id = $1', [admin.id]);
      expect(grants.rows).toHaveLength(0);
      expect((await act('processCreate', { code: code('adm'), name: 'x' })).outcome).toBe('ok');
    });
  });

  describe('replay and reads', () => {
    it('the same key and request replays the stored answer with one row', async () => {
      const key = randomUUID();
      const first = await act('vendorCreate', { code: code('rep'), name: 'Rep' }, { key });
      const second = await act('vendorCreate', { code: code('rep'), name: 'Rep' }, { key });
      expect(first).toMatchObject({ outcome: 'ok', replayed: false });
      expect(second).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
      expect(await count('vendor', 'code_key', toCodeKey(code('rep')))).toBe(1);
      expect(await audit(first.data?.id as string)).toHaveLength(1);
    });

    it('the audit projection (0081) lists the four knowledge subject types with their platform actions', async () => {
      const { rows } = await dbHandle.pool.query(
        `select event_type, subject_type, subject_id from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0)
          where subject_id = any($3)`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), [ids.va, ids.pe, ids.m1, ids.sw]],
      );
      expect(rows.map((r) => r.subject_type).sort()).toEqual(
        expect.arrayContaining(['knowledge_vendor', 'knowledge_process', 'knowledge_model', 'knowledge_software']),
      );
      expect(new Set(rows.map((r) => r.event_type))).toContain('knowledge.catalog.created');
    });

    it('the read endpoints reflect the writes (counts, status, version)', async () => {
      const models = await read('models', { vendorId: ids.va });
      const m1 = models.rows.find((r) => r.id === ids.m1);
      expect(m1).toMatchObject({ name: 'Model One 2', processes: [], softwareCount: 1 });
      const vendors = await read('vendors');
      expect(vendors.rows.find((r) => r.id === ids.va)).toMatchObject({ active: true });
      // models under va: m1, moff(inactive), keep → active ones count
      expect(vendors.rows.find((r) => r.id === ids.va)?.modelCount).toBe(2);
      const software = await read('softwareVersions', { modelId: ids.m1 });
      expect(software.rows).toHaveLength(1);
      expect(software.rows[0]).toMatchObject({ versionLabel: code('v1'), name: 'SW named' });
    });
  });
});
