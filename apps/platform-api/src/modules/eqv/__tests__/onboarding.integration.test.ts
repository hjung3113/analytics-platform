// #1658 — the Onboarding reads and writes of the eqv module through the real `buildServer` over `app.inject`, against a real Postgres
// (throwaway DB only; app as platform_app, fixtures and cleanup as platform_migrate). Needs migrations 0124 and 0125. Synthetic data only
// (`eq-synth-*` equipment, synthetic vendor and model rows). Actors differ in exactly the capability under test.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { toCodeKey } from '../../log-knowledge/domain/code-key.js';
import { layoutFixture } from './fixture.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `onb${randomUUID().replace(/[^a-f]/g, '').slice(0, 6)}`;

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

const globalRules = { schemaVersion: '0.4', scope: { level: 'global' }, rules: [{ id: 'pm-rule', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-{n:letter}' }, certainty: 'verified' }] };
const inventory = (equipmentId: string, aliases: string[]) => ({
  equipmentId,
  from: '2026-01-01T00:00:00.000',
  to: '2026-01-02T00:00:00.000',
  aliases: aliases.map((alias) => ({ alias, references: 1, slots: [], activity: [], firstSeen: null, lastSeen: null })),
  transfers: [],
});

describe.skipIf(!runIntegration)('eqv Onboarding storage, reads and publish (#1658)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let nobody: Person;
  let viewer: Person;
  let rulesEditor: Person;
  let globalEditor: Person;
  let mappingPublisher: Person;
  let vendorId: string;
  let modelId: string;
  let hiddenModelId: string;
  const actorIds: string[] = [];
  const layoutIds: string[] = [];
  const equipmentIds: string[] = [];
  let n = 0;
  let seq = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function person(roleLevel: 'admin' | 'developer', capability?: string): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    if (capability) await grantCapability(dbHandle, WORKSPACE_ID, id, capability, null, admin.id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
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
    const who = opts.who ?? admin;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }

  const count = async (table: string, where: string, params: unknown[]) => Number((await sql(`select count(*) from eqv.${table} where ${where}`, params)).rows[0].count);
  const auditRows = async (subjectType: string) =>
    (
      await sql(`select event_type, subject_id, detail from core.audit_log where workspace_id = $1 and subject_type = $2 and actor_id = any($3) order by created_at`, [
        WORKSPACE_ID,
        subjectType,
        actorIds,
      ])
    ).rows as { event_type: string; subject_id: string; detail: Record<string, unknown> }[];

  async function newEquipment(model: string = modelId): Promise<string> {
    const equipmentId = `eq-synth-${TAG}-${seq++}`;
    equipmentIds.push(equipmentId);
    await sql('insert into eqv.equipment (workspace_id, equipment_id, label, model_id) values ($1, $2, $3, $4)', [WORKSPACE_ID, equipmentId, 'Synthetic', model]);
    return equipmentId;
  }
  /** A stored Sample Window (a fixture row inserted as the migrate role) with the given aliases; returns the 64 hex digits of its hash. */
  async function newWindow(equipmentId: string, aliases: string[], opts: { state?: string; to?: string } = {}): Promise<string> {
    const hex = randomUUID().replaceAll('-', '').repeat(2);
    const to = opts.to ?? '2026-01-02T00:00:00.000';
    await sql(
      `insert into eqv.sample_window (workspace_id, equipment_id, hash, from_at, to_at, data_generation, time_domain, occurrences, state, batch, inventory, imported_by, updated_by)
       values ($1,$2,$3,'2026-01-01T00:00:00.000',$4,'g1','site-synth',1,$5,'{}'::jsonb,$6::jsonb,$7,$7)`,
      [WORKSPACE_ID, equipmentId, `sha256:${hex}`, to, opts.state ?? 'active', JSON.stringify({ ...inventory(equipmentId, aliases), to }), admin.id],
    );
    return hex;
  }
  async function publishedRevision(): Promise<[string, string]> {
    const layoutId = `${TAG}-l${seq++}`;
    layoutIds.push(layoutId);
    expect((await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '0' })).outcome).toBe('ok');
    const published = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
    expect(published.outcome).toBe('ok');
    return [layoutId, published.data.revision as string];
  }
  const scopeGlobal = { level: 'global' };
  const saveGlobalRules = (who: Person, expectedVersion: string, document: unknown = globalRules) =>
    act('eqv.saveAliasRules', { ...scopeGlobal, document }, { who, expectedVersion });

  /** Saves the global PM rule once (shared by several publishes; later saves with the same document only bump the version). */
  async function ensureGlobalRules() {
    const row = await read('eqv.aliasRules', scopeGlobal);
    if (row.outcome === 'empty') expect((await saveGlobalRules(admin, '0')).outcome).toBe('ok');
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    nobody = await person('developer');
    viewer = await person('developer', 'eqv.view');
    rulesEditor = await person('developer', 'eqv.rules.edit');
    globalEditor = await person('developer', 'eqv.dictionary.global_edit');
    mappingPublisher = await person('developer', 'eqv.mapping.publish');
    await grantCapability(dbHandle, WORKSPACE_ID, rulesEditor.id, 'eqv.view', null, admin.id);
    await grantCapability(dbHandle, WORKSPACE_ID, globalEditor.id, 'eqv.view', null, admin.id);
    await grantCapability(dbHandle, WORKSPACE_ID, mappingPublisher.id, 'eqv.view', null, admin.id);
    vendorId = (
      await sql(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [
        WORKSPACE_ID,
        `${TAG}-v`,
        toCodeKey(`${TAG}-v`),
        admin.id,
      ])
    ).rows[0].id as string;
    const model = async (code: string) =>
      (
        await sql(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`, [
          WORKSPACE_ID,
          vendorId,
          code,
          toCodeKey(code),
          admin.id,
        ])
      ).rows[0].id as string;
    modelId = await model(`${TAG}-m1`);
    hiddenModelId = await model(`${TAG}-m2`);
    await sql(`update knowledge.equipment_model set access_mode = 'restricted', row_version = row_version + 1 where id = $1`, [hiddenModelId]);
  }, 90_000);

  beforeEach(async () => {
    await sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

  afterAll(async () => {
    await sql('delete from eqv.binding where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.baseline_inventory where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.mapping_version where workspace_id = $1 and published_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.sample_window where workspace_id = $1 and imported_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.alias_rules where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.type_dictionary where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_revision where workspace_id = $1 and published_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_draft where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.equipment where workspace_id = $1 and equipment_id like $2', [WORKSPACE_ID, `eq-synth-${TAG}%`]);
    await sql('delete from knowledge.equipment_model where workspace_id = $1 and code like $2', [WORKSPACE_ID, `${TAG}%`]);
    await sql('delete from knowledge.vendor where workspace_id = $1 and code like $2', [WORKSPACE_ID, `${TAG}%`]);
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

  describe('permission: a denied call is refused on the server', () => {
    const hash = `sha256:${'a'.repeat(64)}`;
    it.each([
      ['eqv.aliasRules', { level: 'global' }],
      ['eqv.typeDictionary', { level: 'global' }],
      ['eqv.equipmentScopes', { equipmentId: 'eq-synth-any' }],
      ['eqv.mappingVersions', { equipmentId: 'eq-synth-any' }],
      ['eqv.mappingVersion', { equipmentId: 'eq-synth-any', hash }],
      ['eqv.bindings', { equipmentId: 'eq-synth-any' }],
      ['eqv.baselineInventory', { equipmentId: 'eq-synth-any', mappingHash: hash }],
    ] as [string, Record<string, unknown>][])('read %s without eqv.view → forbidden; with it → not forbidden', async (endpoint, params) => {
      expect((await read(endpoint, params, nobody)).outcome, endpoint).toBe('forbidden');
      expect((await read(endpoint, params, viewer)).outcome, endpoint).not.toBe('forbidden');
    });

    it('a rules editor cannot write the global level; a global editor can write it but not the maker level', async () => {
      expect((await saveGlobalRules(rulesEditor, '0')).outcome).toBe('forbidden');
      expect((await saveGlobalRules(nobody, '0')).outcome).toBe('forbidden');
      expect(await count('alias_rules', "workspace_id = $1 and level = 'global' and created_by = any($2)", [WORKSPACE_ID, [rulesEditor.id, nobody.id]])).toBe(0);
      const maker = { level: 'maker', vendorId, document: { schemaVersion: '0.4', scope: { level: 'maker', maker: vendorId }, rules: [] } };
      expect((await act('eqv.saveAliasRules', maker, { who: globalEditor, expectedVersion: '0' })).outcome).toBe('forbidden');
      expect((await act('eqv.saveAliasRules', maker, { who: rulesEditor, expectedVersion: '0' })).outcome).toBe('ok');
    });

    it('the dictionary follows the same rule: global needs global_edit, maker needs rules.edit', async () => {
      const dict = (scope: Record<string, unknown>) => ({ schemaVersion: '0.4', scope, entries: [{ moduleType: 'PM', role: 'process-module' }] });
      expect((await act('eqv.saveTypeDictionary', { level: 'global', document: dict({ level: 'global' }) }, { who: rulesEditor, expectedVersion: '0' })).outcome).toBe('forbidden');
      const maker = { level: 'maker', vendorId, document: dict({ level: 'maker', maker: vendorId }) };
      expect((await act('eqv.saveTypeDictionary', maker, { who: globalEditor, expectedVersion: '0' })).outcome).toBe('forbidden');
      expect((await act('eqv.saveTypeDictionary', maker, { who: rulesEditor, expectedVersion: '0' })).outcome).toBe('ok');
    });

    it('publishMapping needs eqv.mapping.publish: nobody, a rules editor and a viewer are refused and nothing is written', async () => {
      const equipmentId = await newEquipment();
      const [layoutId, layoutRevision] = await publishedRevision();
      const input = { equipmentId, layoutId, layoutRevision, windowHash: 'a'.repeat(64), effectiveFrom: '2026-01-01T00:00:00.000' };
      for (const who of [nobody, rulesEditor, viewer, globalEditor]) expect((await act('eqv.publishMapping', input, { who, expectedVersion: '0' })).outcome).toBe('forbidden');
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect(await count('mapping_version', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
    });
  });

  describe('alias rules and Type Dictionary', () => {
    it('stores a scope row with version contract: create with 0, update with 1, a stale 0 conflicts; the audit rows carry ids only', async () => {
      const doc = { schemaVersion: '0.4', scope: { level: 'model', maker: vendorId, model: modelId }, rules: [] };
      const input = { level: 'model', vendorId, modelId, document: doc };
      const created = await act('eqv.saveAliasRules', input, { expectedVersion: '0' });
      expect(created).toMatchObject({ outcome: 'ok', version: '1' });
      expect(Object.keys(created.data).sort()).toEqual(['id', 'version']);
      expect((await act('eqv.saveAliasRules', input, { expectedVersion: '0' })).outcome).toBe('conflict');
      expect((await act('eqv.saveAliasRules', input, { expectedVersion: '1' }))).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await read('eqv.aliasRules', { level: 'model', vendorId, modelId }, viewer)).toMatchObject({ outcome: 'ok', data: { document: doc, version: '2' } });
      const rows = (await auditRows('eqv_alias_rules')).filter((r) => r.detail.modelId === modelId);
      expect(rows.map((r) => r.event_type)).toEqual(['eqv.alias_rules.created', 'eqv.alias_rules.saved']);
      expect(rows[0]).toMatchObject({ subject_id: created.data.id, detail: { level: 'model', vendorId, modelId, version: 1 } });
      expect(JSON.stringify(rows)).not.toContain('rules"');
    });

    it('a creation race: of two concurrent first saves one wins and the other conflicts (one row)', async () => {
      const equipmentId = await newEquipment();
      const input = { level: 'equipment', equipmentId, document: { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId }, rules: [] } };
      const answers = await Promise.all([act('eqv.saveAliasRules', input, { expectedVersion: '0' }), act('eqv.saveAliasRules', input, { expectedVersion: '0' })]);
      expect(answers.map((a) => a.outcome).sort()).toEqual(['conflict', 'ok']);
      expect(await count('alias_rules', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(1);
    });

    it('invalid documents answer {path, code} only and store nothing; a document for another scope is scope_mismatch', async () => {
      const equipmentId = await newEquipment();
      const dup = { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId }, rules: [{ id: 'a', match: { exact: ['X'] }, target: { ignore: true }, certainty: 'verified' }, { id: 'a', match: { exact: ['Y'] }, target: { ignore: true }, certainty: 'verified' }] };
      const bad = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: dup }, { expectedVersion: '0' });
      expect(bad.outcome).toBe('invalid');
      expect(bad.fieldErrors).toEqual([{ path: ['document', 'rules', '1', 'id'], code: 'duplicate-id' }]);
      const other = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: { ...dup, scope: { level: 'global' }, rules: [] } }, { expectedVersion: '0' });
      expect(other.fieldErrors).toEqual([{ path: ['document', 'scope'], code: 'scope_mismatch' }]);
      expect(await count('alias_rules', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
    });

    it('a free maker string, a surplus id and the equipment level of a dictionary are refused at validation', async () => {
      const doc = { schemaVersion: '0.4', scope: { level: 'maker', maker: 'acme' }, rules: [] };
      expect((await act('eqv.saveAliasRules', { level: 'maker', vendorId: 'acme', document: doc }, { expectedVersion: '0' })).fieldErrors).toEqual([{ path: ['vendorId'], code: 'invalid' }]);
      expect((await act('eqv.saveAliasRules', { level: 'global', vendorId, document: { ...doc, scope: { level: 'global' } } }, { expectedVersion: '0' })).fieldErrors).toEqual([{ path: ['vendorId'], code: 'unexpected' }]);
      expect((await act('eqv.saveTypeDictionary', { level: 'equipment', document: {} }, { expectedVersion: '0' })).fieldErrors).toEqual([{ path: ['level'], code: 'invalid' }]);
      // A dictionary has no equipment key: the dispatch refuses it before the action's own validation.
      expect((await act('eqv.saveTypeDictionary', { level: 'model', equipmentId: 'x', document: {} }, { expectedVersion: '0' })).fieldErrors).toEqual([{ path: ['equipmentId'], code: 'unexpected_field' }]);
    });

    it('an unknown vendor, an unknown equipment and a hidden model answer alike (not_found) and read as empty', async () => {
      const hiddenEquipment = await newEquipment(hiddenModelId);
      const unknown = `eq-synth-${TAG}-missing`;
      const writes = [
        { level: 'maker', vendorId: randomUUID(), document: { schemaVersion: '0.4', scope: { level: 'maker', maker: 'x' }, rules: [] } },
        { level: 'equipment', equipmentId: unknown, document: { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: unknown }, rules: [] } },
        { level: 'equipment', equipmentId: hiddenEquipment, document: { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: hiddenEquipment }, rules: [] } },
      ];
      for (const w of writes) {
        const doc = { ...w.document, scope: w.level === 'maker' ? { level: 'maker', maker: w.vendorId } : w.document.scope };
        expect((await act('eqv.saveAliasRules', { ...w, document: doc }, { expectedVersion: '0' })).outcome).toBe('not_found');
      }
      for (const id of [unknown, hiddenEquipment]) {
        const a = await read('eqv.equipmentScopes', { equipmentId: id });
        expect(a).toMatchObject({ outcome: 'empty', data: null });
        expect((await read('eqv.bindings', { equipmentId: id })).outcome).toBe('empty');
        expect((await read('eqv.mappingVersions', { equipmentId: id })).outcome).toBe('empty');
      }
      expect((await read('eqv.aliasRules', { level: 'model', vendorId, modelId: hiddenModelId })).outcome).toBe('empty');
    });

    it('equipmentScopes answers the Hub vendor and model ids of a visible equipment', async () => {
      const equipmentId = await newEquipment();
      expect(await read('eqv.equipmentScopes', { equipmentId }, viewer)).toMatchObject({ outcome: 'ok', data: { equipmentId, vendorId, modelId } });
    });
  });

  describe('publishMapping', () => {
    /** A publish input over a new active window with these aliases (every call stores a window with a hash of its own). */
    const publishInput = async (equipmentId: string, layoutId: string, layoutRevision: string, effectiveFrom: string, aliases = ['PM1', 'PM2'], to?: string) => ({
      equipmentId, layoutId, layoutRevision, windowHash: await newWindow(equipmentId, aliases, to === undefined ? {} : { to }), effectiveFrom,
    });

    it('stores a Mapping Version, the Baseline and the first Binding in one transaction; answers ids and hashes; reads them back', async () => {
      await ensureGlobalRules();
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const answer = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000'), { who: mappingPublisher, expectedVersion: '0' });
      expect(answer).toMatchObject({ outcome: 'ok', version: '1' });
      expect(Object.keys(answer.data).sort()).toEqual(['bindingId', 'mappingHash', 'version']);
      const hash = answer.data.mappingHash as string;
      const list = await read('eqv.mappingVersions', { equipmentId }, viewer);
      expect(list.data.rows).toEqual([{ hash, layoutId, layoutRevision: revision, entryCount: 2, publishedAt: expect.any(String) }]);
      const one = await read('eqv.mappingVersion', { equipmentId, hash }, viewer);
      expect(one.data.document).toMatchObject({ equipmentId, layoutId, hash });
      expect((await read('eqv.baselineInventory', { equipmentId, mappingHash: hash }, viewer)).data.document.aliases).toHaveLength(2);
      expect(await read('eqv.bindings', { equipmentId }, viewer)).toMatchObject({
        outcome: 'ok',
        data: { version: '1', document: { schemaVersion: '0.4', equipmentId, bindings: [{ layoutId, mappingHash: hash, layoutRevision: revision, effectiveFrom: '2026-01-01T00:00:00.000' }] } },
      });
      const audit = (await auditRows('eqv_binding')).filter((r) => r.detail.equipmentId === equipmentId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ event_type: 'eqv.mapping.published', subject_id: answer.data.bindingId, detail: { equipmentId, mappingHash: hash, layoutRevision: revision, effectiveFrom: '2026-01-01T00:00:00.000' } });
    });

    it('replay access: a stored publish answer is refused like a fresh call once the actor can no longer see the equipment model (C3)', async () => {
      await ensureGlobalRules();
      const visibleModel = (
        await sql(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`, [
          WORKSPACE_ID, vendorId, `${TAG}-m${seq}`, toCodeKey(`${TAG}-m${seq}`), admin.id,
        ])
      ).rows[0].id as string;
      const equipmentId = await newEquipment(visibleModel);
      const [layoutId, revision] = await publishedRevision();
      const key = randomUUID();
      const replayInput = await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000');
      const send = async () =>
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/menu-action',
            headers: { 'content-type': 'application/json', ...cookieHeader(mappingPublisher.cookie), 'x-csrf-token': mappingPublisher.csrf },
            payload: JSON.stringify({ action: 'eqv.publishMapping', context: {}, input: replayInput, idempotencyKey: key, expectedVersion: '0' }),
          })
        ).json<Answer & { replayed?: boolean }>();
      expect(await send()).toMatchObject({ outcome: 'ok' });
      expect(await send()).toMatchObject({ outcome: 'ok', replayed: true });
      await sql(`update knowledge.equipment_model set access_mode = 'restricted', row_version = row_version + 1 where id = $1`, [visibleModel]);
      const replay = await send();
      expect(replay.outcome).toBe('not_found');
      expect(replay.data ?? null).toBeNull();
    });

    it('rollback after insert: a publish whose audit row fails leaves no Mapping Version, Baseline, Binding change or audit row (C4)', async () => {
      await ensureGlobalRules();
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const first = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000'), { expectedVersion: '0' });
      expect(first.outcome).toBe('ok');
      // Test-only DB trigger (no production seam): the audit insert of the next publish of this equipment raises, after every eqv row was written.
      const fn = `eqv_fail_audit_${TAG}`;
      await sql(`create function ${fn}() returns trigger language plpgsql as $$ begin if new.detail->>'equipmentId' = '${equipmentId}' and new.event_type = 'eqv.mapping.published' then raise exception 'injected audit failure'; end if; return new; end $$`);
      await sql(`create trigger ${fn} before insert on core.audit_log for each row execute function ${fn}()`);
      try {
        const failed = await app.inject({
          method: 'POST',
          url: '/api/v1/menu-action',
          headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': admin.csrf },
          payload: JSON.stringify({
            action: 'eqv.publishMapping', context: {}, input: await publishInput(equipmentId, layoutId, revision, '2026-02-01T00:00:00.000', ['PM1']), idempotencyKey: randomUUID(), expectedVersion: '1',
          }),
        });
        expect(failed.statusCode).toBe(500);
      } finally {
        await sql(`drop trigger ${fn} on core.audit_log`);
        await sql(`drop function ${fn}()`);
      }
      expect(await count('mapping_version', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect(await count('baseline_inventory', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2 and effective_to is null', [WORKSPACE_ID, equipmentId])).toBe(1);
      expect((await auditRows('eqv_binding')).filter((r) => r.detail.equipmentId === equipmentId)).toHaveLength(1);
    });

    it('a stale version conflicts; a second publish closes the open Binding; earlier, equal and unchanged publishes are refused', async () => {
      await ensureGlobalRules();
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const first = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000'), { expectedVersion: '0' });
      expect(first.outcome).toBe('ok');
      // Stale: the author saw no Binding.
      expect((await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-02-01T00:00:00.000', ['PM1']), { expectedVersion: '0' })).outcome).toBe('conflict');
      // Order: not after the latest.
      for (const at of ['2026-01-01T00:00:00.000', '2025-12-31T23:59:59.999']) {
        const refused = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, at, ['PM1']), { expectedVersion: '1' });
        expect(refused.fieldErrors).toEqual([{ path: ['effectiveFrom'], code: 'not_after_latest' }]);
      }
      // Same mapping hash and Layout Revision as the latest.
      const same = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-02-01T00:00:00.000'), { expectedVersion: '1' });
      expect(same.fieldErrors).toEqual([{ path: ['mapping'], code: 'same-as-latest' }]);
      // A real change closes the open Binding at the new effectiveFrom.
      const second = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-02-01T00:00:00.000', ['PM1']), { expectedVersion: '1' });
      expect(second).toMatchObject({ outcome: 'ok', version: '2' });
      const bindings = (await read('eqv.bindings', { equipmentId })).data.document.bindings as { effectiveFrom: string; effectiveTo?: string }[];
      expect(bindings.map((b) => [b.effectiveFrom, b.effectiveTo])).toEqual([
        ['2026-01-01T00:00:00.000', '2026-02-01T00:00:00.000'],
        ['2026-02-01T00:00:00.000', undefined],
      ]);
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(2);
    });

    it('re-publishing a known hash reuses the Mapping Version and keeps the first Baseline (immutable)', async () => {
      await ensureGlobalRules();
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const both = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000'), { expectedVersion: '0' });
      const baselines = async () => (await sql('select id, document from eqv.baseline_inventory where workspace_id = $1 and equipment_id = $2 order by id', [WORKSPACE_ID, equipmentId])).rows;
      const before = await baselines();
      expect((await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-02-01T00:00:00.000', ['PM1']), { expectedVersion: '1' })).outcome).toBe('ok');
      // Back to the first alias set: same hash as the first publish, a later effectiveFrom, a different Baseline window.
      const back = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-03-01T00:00:00.000', ['PM1', 'PM2'], '2026-01-03T00:00:00.000'), { expectedVersion: '2' });
      expect(back).toMatchObject({ outcome: 'ok', version: '3' });
      expect(back.data.mappingHash).toBe(both.data.mappingHash);
      expect(await count('mapping_version', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(2);
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(3);
      const after = await baselines();
      expect(after).toHaveLength(2);
      expect(after.find((r) => r.id === before[0].id)).toEqual(before[0]);
    });

    it('issues store nothing: unknown Layout Revision, an unknown window, truncated or offset wall-clock', async () => {
      await ensureGlobalRules();
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const base = await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000');
      const bad: [Record<string, unknown>, { path: string[]; code: string }][] = [
        [{ ...base, layoutRevision: `sha256:${'b'.repeat(64)}` }, { path: ['layoutRevision'], code: 'not_found' }],
        [{ ...base, windowHash: 'b'.repeat(64) }, { path: ['windowHash'], code: 'not_active' }],
        [{ ...base, windowHash: 'xyz' }, { path: ['windowHash'], code: 'invalid' }],
        [{ ...base, effectiveFrom: '2026-01-01T00:00:00' }, { path: ['effectiveFrom'], code: 'fraction-missing' }],
        [{ ...base, effectiveFrom: '2026-01-01T00:00:00.000123' }, { path: ['effectiveFrom'], code: 'fraction-too-long' }],
        [{ ...base, effectiveFrom: '2026-01-01T00:00:00.000Z' }, { path: ['effectiveFrom'], code: 'offset' }],
        [{ ...base, effectiveFrom: '2026-02-30T00:00:00.000' }, { path: ['effectiveFrom'], code: 'impossible' }],
      ];
      for (const [input, expected] of bad) expect((await act('eqv.publishMapping', input, { expectedVersion: '0' })).fieldErrors, expected.code).toEqual([expected]);
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect(await count('mapping_version', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
    });

    it('a rule that targets a missing component is a core issue: nothing is stored, audit included', async () => {
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const doc = { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId }, rules: [{ id: 'ghost', match: { exact: ['GHOST'] }, target: { componentId: 'no-such-component' }, certainty: 'assumed' }] };
      expect((await act('eqv.saveAliasRules', { level: 'equipment', equipmentId, document: doc }, { expectedVersion: '0' })).outcome).toBe('ok');
      const answer = await act('eqv.publishMapping', await publishInput(equipmentId, layoutId, revision, '2026-01-01T00:00:00.000', ['GHOST']), { expectedVersion: '0' });
      expect(answer.outcome).toBe('invalid');
      expect(answer.fieldErrors?.[0]?.code).toBe('unknown-target');
      expect(await count('binding', 'workspace_id = $1 and equipment_id = $2', [WORKSPACE_ID, equipmentId])).toBe(0);
      expect((await auditRows('eqv_binding')).filter((r) => r.detail.equipmentId === equipmentId)).toHaveLength(0);
    });

    it('a publish needs an already published Layout Revision (a draft is never published here) and a visible equipment', async () => {
      const equipmentId = await newEquipment();
      const draftOnly = `${TAG}-draft${seq++}`;
      layoutIds.push(draftOnly);
      await act('eqv.saveDraft', { layoutId: draftOnly, document: layoutFixture(draftOnly) }, { expectedVersion: '0' });
      const refused = await act('eqv.publishMapping', await publishInput(equipmentId, draftOnly, `sha256:${'c'.repeat(64)}`, '2026-01-01T00:00:00.000'), { expectedVersion: '0' });
      expect(refused.fieldErrors).toEqual([{ path: ['layoutRevision'], code: 'not_found' }]);
      const hidden = await newEquipment(hiddenModelId);
      const [layoutId, revision] = await publishedRevision();
      expect((await act('eqv.publishMapping', await publishInput(hidden, layoutId, revision, '2026-01-01T00:00:00.000'), { expectedVersion: '0' })).outcome).toBe('not_found');
      expect((await act('eqv.publishMapping', { equipmentId: `eq-synth-${TAG}-none`, layoutId, layoutRevision: revision, windowHash: 'a'.repeat(64), effectiveFrom: '2026-01-01T00:00:00.000' }, { expectedVersion: '0' })).outcome).toBe('not_found');
    });
  });

  describe('immutability by grant', () => {
    it('platform_app cannot update or delete Mapping Versions, Baselines or Bindings beyond effective_to', async () => {
      const run = (text: string) => dbHandle.pool.query(text);
      await expect(run(`update eqv.mapping_version set layout_id = layout_id`)).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.mapping_version`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.baseline_inventory set document = document`)).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.binding`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.binding set effective_from = effective_from`)).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.alias_rules set level = level`)).rejects.toThrow(/permission denied/);
    });

    it('a Binding row refuses a truncated wall-clock and an end before its start', async () => {
      const equipmentId = await newEquipment();
      const [layoutId, revision] = await publishedRevision();
      const mappingHash = `sha256:${'d'.repeat(64)}`;
      await sql(
        `insert into eqv.mapping_version (workspace_id, equipment_id, layout_id, layout_revision, hash, document, published_by) values ($1,$2,$3,$4,$5,'{}'::jsonb,$6)`,
        [WORKSPACE_ID, equipmentId, layoutId, revision, mappingHash, admin.id],
      );
      const insert = (from: string, to: string | null) =>
        sql(`insert into eqv.binding (workspace_id, equipment_id, layout_id, layout_revision, mapping_hash, effective_from, effective_to, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [
          WORKSPACE_ID, equipmentId, layoutId, revision, mappingHash, from, to, admin.id,
        ]);
      await expect(insert('2026-01-01T00:00:00', null)).rejects.toThrow(/binding_effective_from_check/);
      await expect(insert('2026-01-01T00:00:00.000', '2026-01-01T00:00:00.000')).rejects.toThrow(/binding_effective_to_check/);
      await expect(insert('2026-01-01T00:00:00.000', null)).resolves.toBeDefined();
      await expect(insert('2026-01-01T00:00:00.000', null)).rejects.toThrow(/binding_workspace_equipment_from_uq/);
    });
  });
});
