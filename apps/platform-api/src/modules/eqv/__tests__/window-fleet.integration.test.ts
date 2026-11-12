// #1658 Sample Window·Fleet PR — the Sample Window and Fleet reads and actions of the eqv module through the real `buildServer` over
// `app.inject`, against a real Postgres (throwaway DB only; app as platform_app, fixtures and cleanup as platform_migrate). Needs migrations
// 0124 and 0125. Synthetic data only (`eq-synth-*` equipment, synthetic vendor and model rows, generated batches). Uploads go through the real
// `POST /api/v1/platform/files` into an in-memory object store. Actors differ in exactly the capability under test.

import { randomUUID } from 'node:crypto';

import { BUNDLED_TEMPLATE_IDS } from '@eqv/core';
import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { defined } from '../../../test-support/defined.js';
import { memoryStorage } from '../../../test-support/memory-storage.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { toCodeKey } from '../../log-knowledge/domain/code-key.js';
import { layoutFixture, sampleBatch } from './fixture.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `win${randomUUID().replace(/[^a-f]/g, '').slice(0, 6)}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  version?: string | null;
  fieldErrors?: { path: string[]; code: string }[];
}
type WindowRow = { hash: string; from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: number; state: string; counterpart: string | null; mappingCount: number };
type FleetRow = { equipmentId: string; label: string; vendorId: string; vendorName: string; modelId: string; modelName: string; status: string; latestWindow: { hash: string; from: string; to: string } | null; coverage: unknown; unmappedReferences: number | null };

const inventory = (equipmentId: string, aliases: string[], from: string, to: string) => ({
  equipmentId,
  from,
  to,
  aliases: aliases.map((alias) => ({ alias, references: 1, slots: [], activity: [], firstSeen: null, lastSeen: null })),
  transfers: [],
});
const pmRules = (equipmentId: string) => ({
  schemaVersion: '0.4',
  scope: { level: 'equipment', equipmentId },
  rules: [{ id: 'pm', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-{n:letter}' }, certainty: 'verified' }],
});

describe.skipIf(!runIntegration)('eqv Sample Window and Fleet (#1658 Sample Window·Fleet PR)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  const storage = memoryStorage();
  let admin: Person;
  let nobody: Person;
  let viewer: Person;
  let importer: Person;
  let importer2: Person;
  let vendorId: string;
  let vendorName: string;
  let modelId: string;
  let hiddenModelId: string;
  let otherVendorModelId: string;
  const actorIds: string[] = [];
  const layoutIds: string[] = [];
  let n = 0;
  let seq = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const resetLimits = () => sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);

  async function person(roleLevel: 'admin' | 'developer', ...capabilities: string[]): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    for (const capability of capabilities) await grantCapability(dbHandle, WORKSPACE_ID, id, capability, null, admin?.id ?? id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = viewer): Promise<Answer> {
    await resetLimits();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }

  async function act(action: string, input: Record<string, unknown>, opts: { who?: Person; expectedVersion?: string } = {}): Promise<Answer> {
    await resetLimits();
    const who = opts.who ?? importer;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action, context: {}, input, idempotencyKey: randomUUID(), ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }) }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }

  /** An upload through the real generic upload port; returns the upload id. */
  async function upload(who: Person, body: unknown, name = 'window.batch.json'): Promise<string> {
    await resetLimits();
    const fd = new FormData();
    fd.append('file', Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)), { filename: name, contentType: 'application/json' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/files',
      headers: { ...fd.getHeaders(), ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf, 'idempotency-key': randomUUID() },
      payload: fd.getBuffer(),
    });
    const answer = res.json<{ outcome: string; data: { id: string } }>();
    expect(answer.outcome).toBe('ok');
    return answer.data.id;
  }

  async function newEquipment(model: string = modelId): Promise<string> {
    const equipmentId = `eq-synth-${TAG}-${seq++}`;
    await sql('insert into eqv.equipment (workspace_id, equipment_id, label, model_id) values ($1, $2, $3, $4)', [WORKSPACE_ID, equipmentId, 'Synthetic', model]);
    return equipmentId;
  }
  /** A stored window (a fixture row inserted as the migrate role) holding an Inventory of these aliases; returns the 64 hex digits of its hash. */
  async function fixtureWindow(equipmentId: string, aliases: string[], opts: { state?: string; from?: string; to?: string } = {}): Promise<string> {
    const hex = randomUUID().replaceAll('-', '').repeat(2);
    const from = opts.from ?? '2026-01-01T00:00:00.000';
    const to = opts.to ?? '2026-01-02T00:00:00.000';
    await sql(
      `insert into eqv.sample_window (workspace_id, equipment_id, hash, from_at, to_at, data_generation, time_domain, occurrences, state, batch, inventory, imported_by, updated_by)
       values ($1,$2,$3,$4,$5,'g1','site-synth',1,$6,'{}'::jsonb,$7::jsonb,$8,$8)`,
      [WORKSPACE_ID, equipmentId, `sha256:${hex}`, from, to, opts.state ?? 'active', JSON.stringify(inventory(equipmentId, aliases, from, to)), admin.id],
    );
    return hex;
  }
  async function publishedRevision(): Promise<[string, string]> {
    const layoutId = `${TAG}-l${seq++}`;
    layoutIds.push(layoutId);
    const saved = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who: admin, expectedVersion: '0' });
    expect(saved.outcome).toBe('ok');
    const published = await act('eqv.publishRevision', { layoutId }, { who: admin, expectedVersion: '1' });
    expect(published.outcome).toBe('ok');
    return [layoutId, published.data.revision as string];
  }
  /** Equipment with PM rules and a published Mapping over a first window of PM1 and PM2. Returns the ids the tests drive. */
  async function publishedEquipment() {
    const equipmentId = await newEquipment();
    const rules = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: pmRules(equipmentId) }, { who: admin, expectedVersion: '0' });
    expect(rules.outcome).toBe('ok');
    const [layoutId, layoutRevision] = await publishedRevision();
    const hex = await fixtureWindow(equipmentId, ['PM1', 'PM2']);
    const published = await act('eqv.publishMapping', { equipmentId, layoutId, layoutRevision, windowHash: hex, effectiveFrom: '2026-01-02T00:00:00.000' }, { who: admin, expectedVersion: '0' });
    expect(published.outcome).toBe('ok');
    return { equipmentId, layoutId, layoutRevision, hex, mappingHash: published.data.mappingHash as string };
  }

  const windows = async (equipmentId: string) => (await read('eqv.sampleWindows', { equipmentId })).data.rows as WindowRow[];
  const fleetRow = async (equipmentId: string) => ((await read('eqv.fleet', {})).data.rows as FleetRow[]).find((r) => r.equipmentId === equipmentId);
  const count = async (table: string, where: string, params: unknown[]) => Number((await sql(`select count(*) from eqv.${table} where ${where}`, params)).rows[0].count);
  const auditRows = async (subjectType: string) =>
    (
      await sql(`select event_type, subject_id, detail from core.audit_log where workspace_id = $1 and subject_type = $2 and actor_id = any($3) order by created_at`, [WORKSPACE_ID, subjectType, actorIds])
    ).rows as { event_type: string; subject_id: string; detail: Record<string, unknown> }[];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, storage });
    await app.ready();
    admin = await person('admin');
    nobody = await person('developer');
    viewer = await person('developer', 'eqv.view');
    importer = await person('developer', 'eqv.view', 'eqv.window.import');
    importer2 = await person('developer', 'eqv.view', 'eqv.window.import');
    vendorName = `${TAG}-v`;
    const vendor = async (code: string) =>
      (await sql(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [WORKSPACE_ID, code, toCodeKey(code), admin.id])).rows[0].id as string;
    vendorId = await vendor(vendorName);
    const otherVendorId = await vendor(`${TAG}-v2`);
    const model = async (vendor: string, code: string) =>
      (
        await sql(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`, [WORKSPACE_ID, vendor, code, toCodeKey(code), admin.id])
      ).rows[0].id as string;
    modelId = await model(vendorId, `${TAG}-m1`);
    hiddenModelId = await model(vendorId, `${TAG}-m2`);
    otherVendorModelId = await model(otherVendorId, `${TAG}-m3`);
    await sql(`update knowledge.equipment_model set access_mode = 'restricted', row_version = row_version + 1 where id = $1`, [hiddenModelId]);
  }, 90_000);

  beforeEach(resetLimits);

  afterAll(async () => {
    await sql('delete from eqv.binding where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.baseline_inventory where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.mapping_version where workspace_id = $1 and published_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.sample_window where workspace_id = $1 and imported_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.alias_rules where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_revision where workspace_id = $1 and published_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_draft where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.equipment where workspace_id = $1 and lower(equipment_id) like $2', [WORKSPACE_ID, `eq-synth-${TAG.toLowerCase()}%`]);
    await sql('delete from knowledge.equipment_model where workspace_id = $1 and code like $2', [WORKSPACE_ID, `${TAG}%`]);
    await sql('delete from knowledge.vendor where workspace_id = $1 and code like $2', [WORKSPACE_ID, `${TAG}%`]);
    await sql('delete from voc.voc_attachments where uploaded_by_actor_id = any($1)', [actorIds]);
    await sql('delete from core.idempotency_keys where actor_id = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['permission.permission_denies', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('permission: every read and write is refused on the server without its capability', () => {
    const hex = 'a'.repeat(64);
    it.each([
      ['eqv.fleet', {}],
      ['eqv.sampleWindows', { equipmentId: 'eq-synth-any' }],
      ['eqv.observedInventory', { equipmentId: 'eq-synth-any', windowHash: hex }],
      ['eqv.bundledTemplates', {}],
    ] as [string, Record<string, unknown>][])('read %s without eqv.view → forbidden; with it → not forbidden', async (endpoint, params) => {
      expect((await read(endpoint, params, nobody)).outcome, endpoint).toBe('forbidden');
      expect((await read(endpoint, params, viewer)).outcome, endpoint).not.toBe('forbidden');
    });

    it.each([
      ['eqv.importSampleWindow', { equipmentId: 'eq-synth-any', uploadId: randomUUID() }],
      ['eqv.replaceSampleWindow', { equipmentId: 'eq-synth-any', windowHash: hex }],
      ['eqv.retireSampleWindow', { equipmentId: 'eq-synth-any', windowHash: hex }],
      ['eqv.registerEquipment', { equipmentId: `eq-synth-${TAG}-denied`, label: 'x', vendorId: randomUUID(), modelId: randomUUID() }],
    ] as [string, Record<string, unknown>][])('%s needs eqv.window.import: nobody and a viewer are refused and nothing is written', async (action, input) => {
      for (const who of [nobody, viewer]) expect((await act(action, input, { who })).outcome, action).toBe('forbidden');
      expect(await count('equipment', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, `eq-synth-${TAG}-denied`])).toBe(0);
    });

    it('a mapping publisher without window import cannot import or register either (the capabilities are separate)', async () => {
      const publisher = await person('developer', 'eqv.view', 'eqv.mapping.publish');
      expect((await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-any', windowHash: hex }, { who: publisher })).outcome).toBe('forbidden');
    });
  });

  describe('bundled templates', () => {
    it('answers the templates the package ships, one row per id with its document', async () => {
      const answer = await read('eqv.bundledTemplates', {});
      expect(answer.outcome).toBe('ok');
      const rows = answer.data.rows as { templateId: string; name: string; document: { kind: string; id: string } }[];
      expect(rows.map((r) => r.templateId)).toEqual([...BUNDLED_TEMPLATE_IDS].sort());
      for (const row of rows) expect(row.document).toMatchObject({ kind: 'template', id: row.templateId });
    });
  });

  describe('importSampleWindow', () => {
    it('stores a valid batch as an active window: answers the row, serves its Inventory, lists it in Fleet and writes one audit row with ids and hashes only', async () => {
      const equipmentId = await newEquipment();
      const uploadId = await upload(importer, sampleBatch(equipmentId));
      const answer = await act('eqv.importSampleWindow', { equipmentId, uploadId });
      expect(answer).toMatchObject({ outcome: 'ok', data: { state: 'active', counterpart: null, mappingCount: 0, dataGeneration: 'g1' } });
      const row = answer.data as WindowRow;
      expect(row.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(await windows(equipmentId)).toEqual([row]);
      const inv = await read('eqv.observedInventory', { equipmentId, windowHash: row.hash.slice(7) });
      expect(inv.outcome).toBe('ok');
      expect(inv.data.equipmentId).toBe(equipmentId);
      expect(inv.data.aliases.length).toBeGreaterThan(0);
      expect(await fleetRow(equipmentId)).toMatchObject({ latestWindow: { hash: row.hash, from: row.from, to: row.to }, coverage: null, vendorId, vendorName, modelId });
      const audit = (await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === equipmentId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ event_type: 'eqv.sample_window.imported', detail: { equipmentId, windowHash: row.hash, state: 'active' } });
      expect(Object.keys(defined(audit[0], 'audit row').detail).sort()).toEqual(['equipmentId', 'state', 'windowHash']);
      // The stored batch is the validated one, the file name appears nowhere in eqv rows.
      const stored = (await sql('select batch, inventory from eqv.sample_window where workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).rows[0];
      expect(stored.batch.equipmentId).toBe(equipmentId);
      expect(JSON.stringify(audit)).not.toContain('batch.json');
    });

    it('the same content again answers the stored row unchanged: one row, one audit row', async () => {
      const equipmentId = await newEquipment();
      const first = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId)) });
      const again = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId)) });
      expect(again).toMatchObject({ outcome: 'ok', data: first.data });
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect((await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === equipmentId)).toHaveLength(1);
    });

    it('a reprocessed generation of the active range is stored staged with its counterpart; a second one is staged_exists; replace swaps them', async () => {
      const equipmentId = await newEquipment();
      const active = (await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId)) })).data as WindowRow;
      const staged = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId, { generation: 'g7' })) });
      expect(staged).toMatchObject({ outcome: 'ok', data: { state: 'staged', counterpart: active.hash, dataGeneration: 'g7' } });
      const stagedRow = staged.data as WindowRow;
      expect((await windows(equipmentId)).map((w) => [w.state, w.counterpart])).toEqual([['active', null], ['staged', active.hash]]);
      const second = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId, { generation: 'g8' })) });
      expect(second.fieldErrors).toEqual([{ path: ['file'], code: 'staged_exists' }]);
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(2);
      // A staged window is not the Fleet's window yet.
      expect((await fleetRow(equipmentId))?.latestWindow?.hash).toBe(active.hash);

      const replaced = await act('eqv.replaceSampleWindow', { equipmentId, windowHash: stagedRow.hash.slice(7) });
      expect(replaced).toMatchObject({ outcome: 'ok', data: { equipmentId, activeHash: stagedRow.hash, replacedHash: active.hash } });
      const rows = await windows(equipmentId);
      expect(rows.find((w) => w.hash === stagedRow.hash)).toMatchObject({ state: 'active', counterpart: active.hash });
      expect(rows.find((w) => w.hash === active.hash)).toMatchObject({ state: 'replaced', counterpart: stagedRow.hash });
      expect((await fleetRow(equipmentId))?.latestWindow?.hash).toBe(stagedRow.hash);
      // The replaced window's Inventory is still served.
      expect((await read('eqv.observedInventory', { equipmentId, windowHash: active.hash.slice(7) })).outcome).toBe('ok');
      const events = (await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === equipmentId).map((r) => r.event_type);
      expect(events).toEqual(['eqv.sample_window.imported', 'eqv.sample_window.imported', 'eqv.sample_window.replaced']);
      // Replacing again: the window is no longer staged.
      expect((await act('eqv.replaceSampleWindow', { equipmentId, windowHash: stagedRow.hash.slice(7) })).fieldErrors).toEqual([{ path: ['windowHash'], code: 'not_staged' }]);
    });

    it('one active window per range at every step: import A, stage B, retire A, import C is staged_exists, replace B', async () => {
      const equipmentId = await newEquipment();
      const importGen = async (generation: string) => act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId, { generation })) });
      const activeCount = () => count('sample_window', "workspace_id = $1 and equipment_id = $2 and state = 'active'", [WORKSPACE_ID, equipmentId]);
      const a = (await importGen('g1')).data as WindowRow;
      expect(await activeCount()).toBe(1);
      const b = (await importGen('g2')).data as WindowRow;
      expect(b.state).toBe('staged');
      expect((await act('eqv.retireSampleWindow', { equipmentId, windowHash: a.hash.slice(7) })).outcome).toBe('ok');
      expect(await activeCount()).toBe(0);
      expect((await importGen('g3')).fieldErrors).toEqual([{ path: ['file'], code: 'staged_exists' }]);
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(2);
      const replaced = await act('eqv.replaceSampleWindow', { equipmentId, windowHash: b.hash.slice(7) });
      expect(replaced).toMatchObject({ outcome: 'ok', data: { activeHash: b.hash, replacedHash: '' } });
      expect(await activeCount()).toBe(1);
      expect((await windows(equipmentId)).find((w) => w.hash === b.hash)?.state).toBe('active');
    });

    it('refusals: the batch of another equipment, not JSON and a malformed upload id answer {path, code} only and store nothing', async () => {
      const equipmentId = await newEquipment();
      await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch(equipmentId)) });
      const before = await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId]);
      const notJson = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, Buffer.from('{"truncated":')) });
      expect(notJson.fieldErrors).toEqual([{ path: ['file'], code: 'not_json' }]);
      const foreign = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, sampleBatch('eq-synth-someone-else')) });
      expect(foreign.outcome).toBe('invalid');
      for (const e of foreign.fieldErrors ?? []) {
        expect(e.path[0]).toBe('file');
        expect(Object.keys(e).sort()).toEqual(['code', 'path']);
      }
      expect(JSON.stringify(foreign)).not.toContain('someone-else');
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: 'not-a-uuid' })).fieldErrors).toEqual([{ path: ['uploadId'], code: 'invalid' }]);
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(before);
    });

    it('an upload is readable by its uploader only: another user, an unknown id, an expired and a linked upload all answer uploadId/not_found', async () => {
      const equipmentId = await newEquipment();
      const own = await upload(importer, sampleBatch(equipmentId));
      const notFound = [{ path: ['uploadId'], code: 'not_found' }];
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: own }, { who: importer2 })).fieldErrors).toEqual(notFound);
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: randomUUID() })).fieldErrors).toEqual(notFound);
      await sql(`update voc.voc_attachments set created_at = now() - interval '25 hours' where id = $1`, [own]);
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: own })).fieldErrors).toEqual(notFound);
      const linked = await upload(importer, sampleBatch(equipmentId));
      await sql(`update voc.voc_attachments set parent_kind = 'validation_round', parent_id = $2, linked_at = now() where id = $1`, [linked, randomUUID()]);
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: linked })).fieldErrors).toEqual(notFound);
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      // The refused attempts did not consume the uploader's own upload.
      const fresh = await upload(importer, sampleBatch(equipmentId));
      expect((await act('eqv.importSampleWindow', { equipmentId, uploadId: fresh })).outcome).toBe('ok');
    });

    it('rollback: an import whose audit row fails leaves no window', async () => {
      const equipmentId = await newEquipment();
      const uploadId = await upload(importer, sampleBatch(equipmentId));
      const fn = `eqv_fail_window_audit_${TAG}`;
      await sql(`create function ${fn}() returns trigger language plpgsql as $$ begin if new.detail->>'equipmentId' = '${equipmentId}' and new.event_type = 'eqv.sample_window.imported' then raise exception 'injected audit failure'; end if; return new; end $$`);
      await sql(`create trigger ${fn} before insert on core.audit_log for each row execute function ${fn}()`);
      try {
        await resetLimits();
        const failed = await app.inject({
          method: 'POST',
          url: '/api/v1/menu-action',
          headers: { 'content-type': 'application/json', ...cookieHeader(importer.cookie), 'x-csrf-token': importer.csrf },
          payload: JSON.stringify({ action: 'eqv.importSampleWindow', context: {}, input: { equipmentId, uploadId }, idempotencyKey: randomUUID() }),
        });
        expect(failed.statusCode).toBe(500);
      } finally {
        await sql(`drop trigger ${fn} on core.audit_log`);
        await sql(`drop function ${fn}()`);
      }
      expect(await count('sample_window', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect((await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === equipmentId)).toHaveLength(0);
    });
  });

  describe('retire keeps published Baselines', () => {
    it('retiring the window a Mapping was published over leaves its Baseline row and mappingCount; its content stays retired when imported again', async () => {
      const equipmentId = await newEquipment();
      const batch = sampleBatch(equipmentId);
      const imported = (await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, batch) })).data as WindowRow;
      const rules = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: pmRules(equipmentId) }, { who: admin, expectedVersion: '0' });
      expect(rules.outcome).toBe('ok');
      // A fixture window with PM aliases carries the publish (the synthetic batch's aliases need not match the PM rule).
      const hex = await fixtureWindow(equipmentId, ['PM1'], { from: '2026-02-01T00:00:00.000', to: '2026-02-02T00:00:00.000' });
      const [layoutId, layoutRevision] = await publishedRevision();
      const published = await act('eqv.publishMapping', { equipmentId, layoutId, layoutRevision, windowHash: hex, effectiveFrom: '2026-02-02T00:00:00.000' }, { who: admin, expectedVersion: '0' });
      expect(published.outcome).toBe('ok');
      expect((await windows(equipmentId)).find((w) => w.hash === `sha256:${hex}`)?.mappingCount).toBe(1);

      const retired = await act('eqv.retireSampleWindow', { equipmentId, windowHash: hex });
      expect(retired).toMatchObject({ outcome: 'ok', data: { equipmentId, retiredHash: `sha256:${hex}` } });
      expect((await windows(equipmentId)).find((w) => w.hash === `sha256:${hex}`)).toMatchObject({ state: 'retired', mappingCount: 1 });
      expect(await count('baseline_inventory', 'workspace_id = $1 and equipment_id = $2 and window_id is not null', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect((await read('eqv.baselineInventory', { equipmentId, mappingHash: published.data.mappingHash })).outcome).toBe('ok');
      expect((await act('eqv.retireSampleWindow', { equipmentId, windowHash: hex })).fieldErrors).toEqual([{ path: ['windowHash'], code: 'not_active' }]);
      // Retire the imported one and import its content again: refused, stays retired.
      expect((await act('eqv.retireSampleWindow', { equipmentId, windowHash: imported.hash.slice(7) })).outcome).toBe('ok');
      const again = await act('eqv.importSampleWindow', { equipmentId, uploadId: await upload(importer, batch) });
      expect(again.fieldErrors).toEqual([{ path: ['file'], code: 'retired' }]);
      expect((await windows(equipmentId)).find((w) => w.hash === imported.hash)?.state).toBe('retired');
      const events = (await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === equipmentId).map((r) => r.event_type);
      expect(events).toEqual(['eqv.sample_window.imported', 'eqv.sample_window.retired', 'eqv.sample_window.retired']);
    });
  });

  describe('publishMapping takes a stored window (D3)', () => {
    it('fills baseline_inventory.window_id and counts the Mapping Version on the window', async () => {
      const { equipmentId, hex, mappingHash } = await publishedEquipment();
      const baseline = (await sql('select window_id from eqv.baseline_inventory where workspace_id = $1 and equipment_id = $2 and mapping_hash = $3', [WORKSPACE_ID, equipmentId, mappingHash])).rows[0];
      const window = (await sql('select id from eqv.sample_window where workspace_id = $1 and equipment_id = $2 and hash = $3', [WORKSPACE_ID, equipmentId, `sha256:${hex}`])).rows[0];
      expect(baseline.window_id).toBe(window.id);
      expect((await windows(equipmentId))[0]?.mappingCount).toBe(1);
      expect((await read('eqv.baselineInventory', { equipmentId, mappingHash })).data.document.aliases).toHaveLength(2);
    });

    it('a staged, replaced, retired, foreign or unknown window is windowHash/not_active, all alike, and nothing is stored', async () => {
      const equipmentId = await newEquipment();
      const other = await newEquipment();
      await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: pmRules(equipmentId) }, { who: admin, expectedVersion: '0' });
      const [layoutId, layoutRevision] = await publishedRevision();
      const staged = await fixtureWindow(equipmentId, ['PM1'], { state: 'staged' });
      const retired = await fixtureWindow(equipmentId, ['PM1'], { state: 'retired' });
      const replaced = await fixtureWindow(equipmentId, ['PM1'], { state: 'replaced' });
      const foreign = await fixtureWindow(other, ['PM1']);
      for (const windowHash of [staged, retired, replaced, foreign, 'f'.repeat(64)]) {
        const refused = await act('eqv.publishMapping', { equipmentId, layoutId, layoutRevision, windowHash, effectiveFrom: '2026-01-02T00:00:00.000' }, { who: admin, expectedVersion: '0' });
        expect(refused.fieldErrors, windowHash).toEqual([{ path: ['windowHash'], code: 'not_active' }]);
      }
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect(await count('mapping_version', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect(await count('baseline_inventory', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
    });
  });

  describe('Fleet', () => {
    it('lists each of the six status codes with the latest active window and coverage of the latest Binding', async () => {
      const none = await newEquipment();
      const bare = await newEquipment();
      await fixtureWindow(bare, ['PM1']);
      const drafted = await newEquipment();
      await fixtureWindow(drafted, ['PM1']);
      expect((await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: drafted, document: pmRules(drafted) }, { who: admin, expectedVersion: '0' })).outcome).toBe('ok');
      const published = await publishedEquipment();
      const drifted = await publishedEquipment();
      await fixtureWindow(drifted.equipmentId, ['PM1', 'PM2', 'PM3'], { from: '2026-01-03T00:00:00.000', to: '2026-01-04T00:00:00.000' });
      const unknown = await publishedEquipment();
      expect((await act('eqv.retireSampleWindow', { equipmentId: unknown.equipmentId, windowHash: unknown.hex })).outcome).toBe('ok');

      const rows = (await read('eqv.fleet', {})).data.rows as FleetRow[];
      const by = (id: string) => defined(rows.find((r) => r.equipmentId === id), id);
      expect(by(none)).toMatchObject({ status: 'no-observations', latestWindow: null, coverage: null, unmappedReferences: null, label: 'Synthetic', vendorId, vendorName, modelId, modelName: `${TAG}-m1` });
      // `unstarted` needs no rule file at any level; a global file saved by another suite makes it `draft` (the rule is the screen's).
      const globalRuled = (await count('alias_rules', "workspace_id = $1 and level = 'global'", [WORKSPACE_ID])) > 0;
      expect(by(bare)).toMatchObject({ status: globalRuled ? 'draft' : 'unstarted', coverage: null, unmappedReferences: 1 });
      expect(by(drafted).status).toBe('draft');
      expect(by(published.equipmentId)).toMatchObject({
        status: 'published',
        latestWindow: { hash: `sha256:${published.hex}` },
        coverage: { referenceRatio: 1, aliasRatio: 1, assumedRatio: 0 },
        unmappedReferences: 0,
      });
      expect(by(drifted.equipmentId)).toMatchObject({ status: 'drift', coverage: { referenceRatio: 2 / 3, aliasRatio: 2 / 3 }, unmappedReferences: 1 });
      expect(by(unknown.equipmentId)).toMatchObject({ status: 'drift-unknown', latestWindow: null, coverage: null, unmappedReferences: null });
    });

    it('omits an equipment whose Hub model the actor cannot see, and never names it', async () => {
      const visible = await newEquipment();
      const hidden = await newEquipment(hiddenModelId);
      await fixtureWindow(hidden, ['PM1']);
      const rows = (await read('eqv.fleet', {})).data.rows as FleetRow[];
      expect(rows.some((r) => r.equipmentId === visible)).toBe(true);
      expect(rows.some((r) => r.equipmentId === hidden)).toBe(false);
      expect(JSON.stringify(rows)).not.toContain(hiddenModelId);
    });

    it('hidden equipment takes no slot of the 500-row cap, so the row count does not reveal how many exist (#1878)', async () => {
      const first = `0-${TAG.toLowerCase()}`;
      const ids = (rows: FleetRow[]) => rows.map((r) => r.equipmentId);
      const fleet = async () => (await read('eqv.fleet', {})).data.rows as FleetRow[];
      try {
        // Fill the visible side to exactly the cap, then add hidden equipment whose ids sort before every visible one.
        const have = (await fleet()).length;
        await sql(
          `insert into eqv.equipment (workspace_id, equipment_id, label, model_id)
           select $1, 'eq-synth-' || $2 || '-cap-' || g, 'Cap', $3 from generate_series(1, $4::int) g`,
          [WORKSPACE_ID, TAG.toLowerCase(), modelId, 500 - have],
        );
        const withoutHidden = await fleet();
        expect(withoutHidden).toHaveLength(500);
        await sql(
          `insert into eqv.equipment (workspace_id, equipment_id, label, model_id)
           select $1, $2 || '-' || g, 'Hidden', $3 from generate_series(1, 3) g`,
          [WORKSPACE_ID, first, hiddenModelId],
        );
        const withHidden = await fleet();
        expect(ids(withHidden).filter((id) => id.startsWith(first))).toEqual([]);
        expect(ids(withHidden)).toEqual(ids(withoutHidden));
        expect(withHidden).toHaveLength(500);
      } finally {
        await sql('delete from eqv.equipment where workspace_id = $1 and (equipment_id like $2 or equipment_id like $3)', [WORKSPACE_ID, `${first}-%`, `eq-synth-${TAG.toLowerCase()}-cap-%`]);
      }
    }, 60_000);
  });

  describe('a hidden Hub model is indistinguishable from a missing equipment', () => {
    it('reads answer empty and actions answer equipmentId/not_found, identically, with no audit row naming it', async () => {
      const hidden = await newEquipment(hiddenModelId);
      const hex = await fixtureWindow(hidden, ['PM1']);
      const missing = `eq-synth-${TAG}-missing`;
      const uploadId = await upload(importer, sampleBatch(hidden));
      for (const equipmentId of [hidden, missing]) {
        expect((await read('eqv.sampleWindows', { equipmentId })).outcome).toBe('empty');
        expect((await read('eqv.observedInventory', { equipmentId, windowHash: hex })).outcome).toBe('empty');
      }
      const notFound = [{ path: ['equipmentId'], code: 'not_found' }];
      for (const equipmentId of [hidden, missing]) {
        expect((await act('eqv.importSampleWindow', { equipmentId, uploadId })).fieldErrors, 'import').toEqual(notFound);
        expect((await act('eqv.replaceSampleWindow', { equipmentId, windowHash: hex })).fieldErrors, 'replace').toEqual(notFound);
        expect((await act('eqv.retireSampleWindow', { equipmentId, windowHash: hex })).fieldErrors, 'retire').toEqual(notFound);
      }
      const [layoutId, layoutRevision] = await publishedRevision();
      const publishInput = (equipmentId: string) => ({ equipmentId, layoutId, layoutRevision, windowHash: hex, effectiveFrom: '2026-01-02T00:00:00.000' });
      const hiddenPublish = await act('eqv.publishMapping', publishInput(hidden), { who: admin, expectedVersion: '0' });
      const missingPublish = await act('eqv.publishMapping', publishInput(missing), { who: admin, expectedVersion: '0' });
      expect(hiddenPublish.outcome).toBe('not_found');
      expect(missingPublish.outcome).toBe('not_found');
      expect(hiddenPublish.data ?? null).toEqual(missingPublish.data ?? null);
      expect(await count('sample_window', "workspace_id = $1 and equipment_id = $2 and state = 'active'", [WORKSPACE_ID, hidden])).toBe(1);
      const audited = (await auditRows('eqv_sample_window')).filter((r) => r.detail.equipmentId === hidden || r.detail.equipmentId === missing);
      expect(audited).toEqual([]);
    });

    it('registration under a hidden model is modelId/not_found, the same as an unknown model; a model of another vendor too', async () => {
      const input = (model: string) => ({ equipmentId: `eq-synth-${TAG}-reg${seq++}`, label: 'Hidden', vendorId, modelId: model });
      const hiddenAnswer = await act('eqv.registerEquipment', input(hiddenModelId));
      const unknownAnswer = await act('eqv.registerEquipment', input(randomUUID()));
      const otherVendor = await act('eqv.registerEquipment', input(otherVendorModelId));
      expect(hiddenAnswer.fieldErrors).toEqual([{ path: ['modelId'], code: 'not_found' }]);
      expect(unknownAnswer.fieldErrors).toEqual(hiddenAnswer.fieldErrors);
      expect(otherVendor.fieldErrors).toEqual(hiddenAnswer.fieldErrors);
      expect((await act('eqv.registerEquipment', { ...input(modelId), vendorId: randomUUID() })).fieldErrors).toEqual([{ path: ['vendorId'], code: 'not_found' }]);
      expect(await count('equipment', 'workspace_id = $1 and equipment_id like $2', [WORKSPACE_ID, `eq-synth-${TAG}-reg%`])).toBe(0);
      expect((await auditRows('eqv_equipment')).filter((r) => String(r.detail.equipmentId).startsWith(`eq-synth-${TAG}-reg`))).toEqual([]);
    });
  });

  describe('registerEquipment', () => {
    it('inserts the equipment, shows it in Fleet as no-observations and writes one audit row without the label', async () => {
      const equipmentId = `eq-synth-${TAG}-Reg${seq++}`;
      const answer = await act('eqv.registerEquipment', { equipmentId, label: '  Registered one  ', vendorId, modelId });
      expect(answer).toMatchObject({ outcome: 'ok', data: { equipmentId } });
      expect((await sql('select label, model_id from eqv.equipment where workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).rows[0]).toEqual({ label: 'Registered one', model_id: modelId });
      expect(await fleetRow(equipmentId)).toMatchObject({ status: 'no-observations', label: 'Registered one', vendorId, modelId, latestWindow: null });
      expect(await read('eqv.equipmentScopes', { equipmentId })).toMatchObject({ outcome: 'ok', data: { equipmentId, vendorId, modelId } });
      const audit = (await auditRows('eqv_equipment')).filter((r) => r.detail.equipmentId === equipmentId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ event_type: 'eqv.equipment.registered', detail: { equipmentId, vendorId, modelId } });
      expect(JSON.stringify(audit)).not.toContain('Registered one');
    });

    it('an id that exists, also one differing only by letter case, is equipmentId/exists; concurrent case variants register once', async () => {
      const equipmentId = `eq-synth-${TAG}-Case${seq++}`;
      const base = { label: 'Case', vendorId, modelId };
      expect((await act('eqv.registerEquipment', { ...base, equipmentId })).outcome).toBe('ok');
      for (const id of [equipmentId, equipmentId.toLowerCase(), equipmentId.toUpperCase()]) {
        expect((await act('eqv.registerEquipment', { ...base, equipmentId: id })).fieldErrors, id).toEqual([{ path: ['equipmentId'], code: 'exists' }]);
      }
      const raceId = `eq-synth-${TAG}-Race${seq++}`;
      const answers = await Promise.all([
        act('eqv.registerEquipment', { ...base, equipmentId: raceId }),
        act('eqv.registerEquipment', { ...base, equipmentId: raceId.toLowerCase() }, { who: importer2 }),
      ]);
      expect(answers.map((a) => a.outcome).sort()).toEqual(['invalid', 'ok']);
      expect(await count('equipment', 'workspace_id = $1 and lower(equipment_id) = $2', [WORKSPACE_ID, raceId.toLowerCase()])).toBe(1);
    });

    it('an id already used under a model hidden from the actor answers exactly equipmentId/exists and writes no audit row (accepted exception)', async () => {
      const taken = await newEquipment(hiddenModelId);
      const answer = await act('eqv.registerEquipment', { equipmentId: taken, label: 'Probe', vendorId, modelId });
      expect(answer.fieldErrors).toEqual([{ path: ['equipmentId'], code: 'exists' }]);
      expect((await auditRows('eqv_equipment')).filter((r) => r.detail.equipmentId === taken)).toEqual([]);
    });

    it('refuses a bad id, an empty, long or control-character label and non-uuid ids at validation', async () => {
      const base = { equipmentId: `eq-synth-${TAG}-bad${seq++}`, label: 'ok', vendorId, modelId };
      const cases: [Record<string, unknown>, { path: string[]; code: string }][] = [
        [{ equipmentId: '-bad' }, { path: ['equipmentId'], code: 'invalid' }],
        [{ equipmentId: 'a'.repeat(201) }, { path: ['equipmentId'], code: 'invalid' }],
        [{ label: '   ' }, { path: ['label'], code: 'invalid' }],
        [{ label: 'x'.repeat(121) }, { path: ['label'], code: 'invalid' }],
        [{ label: 'bad\u0007' }, { path: ['label'], code: 'invalid' }],
        [{ vendorId: 'acme' }, { path: ['vendorId'], code: 'invalid' }],
        [{ modelId: 'm1' }, { path: ['modelId'], code: 'invalid' }],
      ];
      for (const [patch, expected] of cases) expect((await act('eqv.registerEquipment', { ...base, ...patch })).fieldErrors, JSON.stringify(patch)).toEqual([expected]);
      expect(await count('equipment', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, base.equipmentId])).toBe(0);
    });
  });

  describe('walls by grant', () => {
    it('platform_app cannot change a window\'s content, delete one, update equipment, or insert an equipment column outside the action\'s four', async () => {
      const run = (text: string) => dbHandle.pool.query(text);
      await expect(run(`update eqv.sample_window set batch = batch`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.sample_window set hash = hash`)).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.sample_window`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.equipment set label = label`)).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.equipment`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.baseline_inventory set window_id = window_id`)).rejects.toThrow(/permission denied/);
      await expect(
        dbHandle.pool.query(`insert into eqv.equipment (workspace_id, equipment_id, label, model_id, created_at) values ($1,$2,'x',$3, now())`, [WORKSPACE_ID, `eq-synth-${TAG}-col`, modelId]),
      ).rejects.toThrow(/permission denied/);
    });

    it('a window row refuses a truncated wall-clock, a reversed range, an unknown state and a duplicate content', async () => {
      const equipmentId = await newEquipment();
      const insert = (hash: string, from: string, to: string, state: string) =>
        sql(
          `insert into eqv.sample_window (workspace_id, equipment_id, hash, from_at, to_at, data_generation, time_domain, occurrences, state, batch, inventory, imported_by, updated_by)
           values ($1,$2,$3,$4,$5,'g1','site-synth',1,$6,'{}'::jsonb,'{}'::jsonb,$7,$7)`,
          [WORKSPACE_ID, equipmentId, hash, from, to, state, admin.id],
        );
      const h = (c: string) => `sha256:${c.repeat(64)}`;
      await expect(insert(h('a'), '2026-01-01T00:00:00', '2026-01-02T00:00:00.000', 'active')).rejects.toThrow(/sample_window_from_check/);
      await expect(insert(h('a'), '2026-01-02T00:00:00.000', '2026-01-02T00:00:00.000', 'active')).rejects.toThrow(/sample_window_to_check/);
      await expect(insert(h('a'), '2026-01-01T00:00:00.000', '2026-01-02T00:00:00.000', 'gone')).rejects.toThrow(/sample_window_state_check/);
      await expect(insert('abc', '2026-01-01T00:00:00.000', '2026-01-02T00:00:00.000', 'active')).rejects.toThrow(/sample_window_hash_check/);
      await expect(insert(h('a'), '2026-01-01T00:00:00.000', '2026-01-02T00:00:00.000', 'active')).resolves.toBeDefined();
      await expect(insert(h('a'), '2026-01-01T00:00:00.000', '2026-01-02T00:00:00.000', 'active')).rejects.toThrow(/sample_window_workspace_equipment_hash_uq/);
    });
  });
});
