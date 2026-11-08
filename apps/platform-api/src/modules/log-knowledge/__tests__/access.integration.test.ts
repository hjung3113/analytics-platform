// #1504 S-a — object access (ADR-0124) through the real `buildServer` over `app.inject`, against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`, app as platform_app, fixtures and cleanup as platform_migrate). Needs migration
// 0112 (`access_mode`, `object_access_rule`). Two admins differ only in the rules that name them: Admin has no read bypass.
// Hidden = the answer of a random id that does not exist, byte for byte; counts and lists carry visible rows only.

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
import { allocateItemNo } from '../repositories/item-number.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `OAC${randomUUID().slice(0, 6).toUpperCase()}`;

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
  message?: string;
}
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log knowledge object access (#1504 S-a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let viewer: Person; // an Admin: writes everything, sees only what the rules let them see
  let manager: Person; // an Admin holding knowledge.access.manage by role
  let plain: Person; // a developer without the capability
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const ids = {} as Record<'vendor' | 'open' | 'closed' | 'swOpen' | 'swClosed' | 'iOpen' | 'iRestricted' | 'iDeny' | 'iSw' | 'iClosed' | 'iClosedDirect', string>;
  const createdItems: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const missing = () => randomUUID();

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = viewer): Promise<Answer> {
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
    const who = opts.who ?? viewer;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logKnowledge.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }

  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  const catalog = (table: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: WORKSPACE_ID, code, code_key: toCodeKey(code), name: code, created_by: viewer.id, updated_by: viewer.id, ...extra };
    return one(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols));
  };
  const software = (model: string, label: string, mode = 'internal') =>
    one(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, access_mode, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$6,$6) returning id`,
      [WORKSPACE_ID, model, label, toCodeKey(label), mode, viewer.id],
    );
  const item = async (owner: { model?: string; software?: string }, title: string, mode = 'internal') => {
    const no = await allocateItemNo(dbHandle.db, WORKSPACE_ID);
    const id = await one(
      `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, owner_software_id, latest_revision_no, publication_state, access_mode, created_by, updated_by)
       values ($1,$2,$3,$4,1,'published',$5,$6,$6) returning id`,
      [WORKSPACE_ID, no, owner.model ?? null, owner.software ?? null, mode, viewer.id],
    );
    createdItems.push(id);
    await sql(`insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by) values ($1,$2,1,$3,'anomaly','obs',$4)`, [WORKSPACE_ID, id, title, viewer.id]);
    return id;
  };
  const rule = (kind: 'model' | 'software' | 'item', target: string, effect: 'allow' | 'deny', extra: { validUntil?: string; revoked?: boolean; grantee?: string } = {}) =>
    one(
      `insert into knowledge.object_access_rule (workspace_id, target_kind, target_id, grantee_id, effect, valid_until, created_by, revoked_at, revoked_by)
       values ($1,$2,$3,$4,$5,$6,$7, $8::timestamptz, $9::uuid) returning rule_id as id`,
      [WORKSPACE_ID, kind, target, extra.grantee ?? viewer.id, effect, extra.validUntil ?? null, manager.id, extra.revoked ? new Date().toISOString() : null, extra.revoked ? manager.id : null],
    );
  const setMode = (table: string, id: string, mode: 'internal' | 'restricted') => sql(`update knowledge.${table} set access_mode = $2 where id = $1`, [id, mode]);
  const clearRules = () => sql('delete from knowledge.object_access_rule where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
  const titles = (a: Answer) => (a.data.rows as { title: string }[]).map((r) => r.title);

  /**
   * Model tree (all under one vendor): `open` (internal) holds internal item `iOpen`, a restricted item `iRestricted`, an item
   * `iDeny` the viewer is denied and a SW `swOpen`; `closed` (restricted, no rule) holds SW `swClosed` and its item `iClosed`.
   */
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    viewer = await person('admin');
    manager = await person('admin');
    plain = await person('developer');
    ids.vendor = await catalog('vendor', `${TAG}-v`);
    ids.open = await catalog('equipment_model', `${TAG}-open`, { vendor_id: ids.vendor });
    ids.closed = await catalog('equipment_model', `${TAG}-closed`, { vendor_id: ids.vendor, access_mode: 'restricted' });
    ids.swOpen = await software(ids.open, `${TAG}-sw-open`);
    ids.swClosed = await software(ids.closed, `${TAG}-sw-closed`);
    ids.iOpen = await item({ model: ids.open }, `${TAG} open item`);
    ids.iRestricted = await item({ model: ids.open }, `${TAG} restricted item`, 'restricted');
    ids.iDeny = await item({ model: ids.open }, `${TAG} denied item`);
    ids.iSw = await item({ software: ids.swOpen }, `${TAG} sw item`);
    ids.iClosed = await item({ software: ids.swClosed }, `${TAG} closed item`);
    ids.iClosedDirect = await item({ model: ids.closed }, `${TAG} closed direct item`);
  });

  beforeEach(async () => {
    await clearRules();
    await sql('update knowledge.equipment_model set access_mode = $2 where id = $1', [ids.closed, 'restricted']);
    await sql('update knowledge.equipment_model set access_mode = $2 where id = $1', [ids.open, 'internal']);
    await sql('update knowledge.software_version set access_mode = $2 where id = any($1)', [[ids.swOpen, ids.swClosed], 'internal']);
    await sql('update knowledge.knowledge_item set access_mode = $2 where id = any($1)', [createdItems, 'internal']);
    await sql('update knowledge.knowledge_item set access_mode = $2 where id = $1', [ids.iRestricted, 'restricted']);
    await sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

  afterAll(async () => {
    await clearRules();
    await sql('delete from core.idempotency_keys where actor_id = any($1)', [actorIds]);
    // draft_review and draft_revision refuse DELETE for every role: lift their triggers inside the cleanup transaction.
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table knowledge.draft_review disable trigger draft_review_append_only');
      await client.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft_review where reviewer_actor_id = any($1)', [actorIds]);
      await client.query('delete from knowledge.draft_revision where author_actor_id = any($1)', [actorIds]);
      await client.query('alter table knowledge.draft_review enable trigger draft_review_append_only');
      await client.query('alter table knowledge.draft_revision enable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from knowledge.item_link where source_item_id = any($1) or target_item_id = any($1)', [createdItems]);
    for (const table of ['item_assessment_event', 'item_revision_evidence', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id = any($1)`, [createdItems]);
    }
    await sql('delete from knowledge.knowledge_item where id = any($1)', [createdItems]);
    await sql('delete from knowledge.item_counter where workspace_id = any($1)', [[WORKSPACE_ID]]).catch(() => undefined);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = $1 and created_by = any($2)`, [WORKSPACE_ID, actorIds]);
    }
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['permission.permission_denies', 'actor_id'],
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

  const listTitles = async (who: Person = viewer) => titles(await read('logKnowledge.items', { q: TAG, pageSize: 100 }, who)).sort();
  const T = (s: string) => `${TAG} ${s}`;

  describe('the rule over a chain, through the item list', () => {
    it('shows internal items, hides a restricted item, a denied item and everything under a restricted model', async () => {
      await rule('item', ids.iDeny, 'deny');
      expect(await listTitles()).toEqual([T('open item'), T('sw item')].sort());
    });

    it('an allow rule shows a restricted item; the next request after a revoke hides it again', async () => {
      const allow = await rule('item', ids.iRestricted, 'allow');
      expect(await listTitles()).toContain(T('restricted item'));
      await sql('update knowledge.object_access_rule set revoked_at = now(), revoked_by = $2 where rule_id = $1', [allow, manager.id]);
      expect(await listTitles()).not.toContain(T('restricted item'));
    });

    it('an expired allow and a revoked allow do not count; an expired deny does not hide', async () => {
      await rule('item', ids.iRestricted, 'allow', { validUntil: '2020-01-01T00:00:00Z' });
      await rule('item', ids.iRestricted, 'allow', { revoked: true });
      await rule('item', ids.iOpen, 'deny', { validUntil: '2020-01-01T00:00:00Z' });
      const seen = await listTitles();
      expect(seen).not.toContain(T('restricted item'));
      expect(seen).toContain(T('open item'));
    });

    it('a restricted model hides its SW and items; an allow on the SW or the item does not lift it, an allow on the model does', async () => {
      await rule('software', ids.swClosed, 'allow');
      await rule('item', ids.iClosed, 'allow');
      await rule('item', ids.iClosedDirect, 'allow');
      expect(await listTitles()).not.toContain(T('closed item'));
      await rule('model', ids.closed, 'allow');
      const seen = await listTitles();
      expect(seen).toContain(T('closed item'));
      expect(seen).toContain(T('closed direct item'));
    });

    it('a deny on the model beats its allow and hides the whole subtree', async () => {
      await rule('model', ids.open, 'allow');
      await rule('model', ids.open, 'deny');
      expect(await listTitles()).toEqual([]);
    });

    it('Admin has no read bypass, a service-like second admin sees the same as the first, and a rule names one actor only', async () => {
      await rule('model', ids.closed, 'allow', { grantee: manager.id });
      expect(await listTitles(manager)).toContain(T('closed item'));
      expect(await listTitles(viewer)).not.toContain(T('closed item'));
    });
  });

  describe('a hidden object answers like one that does not exist', () => {
    const same = async (endpoint: string, hidden: Record<string, unknown>, absent: Record<string, unknown>) => {
      const a = await read(endpoint, hidden);
      const b = await read(endpoint, absent);
      expect({ ...a, correlationId: undefined }).toEqual({ ...b, correlationId: undefined });
      return a;
    };

    it('itemDetail (any revision) and the item-level hiding', async () => {
      const gone = await same('logKnowledge.itemDetail', { itemId: ids.iClosed }, { itemId: missing() });
      expect(gone.data).toBeNull();
      await same('logKnowledge.itemDetail', { itemId: ids.iClosed, revisionNo: 1 }, { itemId: missing(), revisionNo: 1 });
      await same('logKnowledge.itemDetail', { itemId: ids.iRestricted }, { itemId: missing() });
      expect(JSON.stringify(gone)).not.toContain(T('closed item'));
    });

    it('modelProfile, modelSpec (with a SW version), modelSpecRevisions, specChanges, specSubjectItems', async () => {
      await same('logKnowledge.modelProfile', { modelId: ids.closed }, { modelId: missing() });
      await same('logKnowledge.modelSpec', { modelId: ids.closed }, { modelId: missing() });
      await same('logKnowledge.modelSpec', { modelId: ids.closed, softwareId: ids.swClosed }, { modelId: missing(), softwareId: missing() });
      await same('logKnowledge.modelSpecRevisions', { modelId: ids.closed }, { modelId: missing() });
      await same('logKnowledge.specChanges', { modelId: ids.closed }, { modelId: missing() });
      await same('logKnowledge.specSubjectItems', { modelId: ids.closed, targetKey: 'any' }, { modelId: missing(), targetKey: 'any' });
    });

    it('a hidden SW version of a visible model: modelSpec with that softwareId answers null', async () => {
      await setMode('software_version', ids.swOpen, 'restricted');
      await same('logKnowledge.modelSpec', { modelId: ids.open, softwareId: ids.swOpen }, { modelId: ids.open, softwareId: missing() });
    });

    it('conceptSuggestions for a hidden model is the empty answer of an unknown model', async () => {
      await same('logKnowledge.conceptSuggestions', { modelId: ids.closed }, { modelId: missing() });
      await same('logKnowledge.conceptMappings', { modelId: ids.closed }, { modelId: missing() });
    });
  });

  describe('lists, counts and totals carry visible rows only', () => {
    it('models and software lists, explore counts, profile counts and the vendor / SW counts', async () => {
      const models = await read('logKnowledge.models', { q: TAG, pageSize: 100 });
      expect(models.data.rows.map((r: { name: string }) => r.name)).toEqual([`${TAG}-open`]);
      expect(models.data.total).toBe(1);
      const explore = await read('logKnowledge.exploreModels', { q: TAG, pageSize: 100 });
      expect(explore.data.total).toBe(1);
      // open model: 3 visible direct items are iOpen + iDeny, minus the restricted one → count follows the rule, not the table.
      await rule('item', ids.iDeny, 'deny');
      const after = await read('logKnowledge.exploreModels', { q: TAG, pageSize: 100 });
      expect(after.data.rows[0].modelItemCount).toBe(1);
      const profile = await read('logKnowledge.modelProfile', { modelId: ids.open });
      expect(profile.data.modelItems.total).toBe(1);
      expect(profile.data.softwareVersions.map((s: { itemCount: number }) => s.itemCount)).toEqual([1]);
      const sw = await read('logKnowledge.softwareVersions', { q: TAG, pageSize: 100 });
      expect(sw.data.rows.map((r: { id: string }) => r.id)).toEqual([ids.swOpen]);
      const vendors = await read('logKnowledge.vendors', { q: `${TAG}-v`, pageSize: 100 });
      expect(vendors.data.rows[0].modelCount).toBe(1);
    });

    it('the item list total matches the visible rows and no filter reveals a hidden one', async () => {
      const page = await read('logKnowledge.items', { q: TAG, pageSize: 100 });
      expect(page.data.total).toBe(page.data.rows.length);
      const byOwner = await read('logKnowledge.items', { filters: [{ id: 'ownerModelId', op: 'in', value: [ids.closed] }], pageSize: 100 });
      expect(byOwner.data).toEqual({ total: 0, rows: [] });
    });
  });

  describe('writes to a hidden object are refused like a missing one', () => {
    it('itemRevise / itemSetArchived / itemAssess of a hidden item = the answer for a random id', async () => {
      const body = { typeCode: 'anomaly', title: T('x'), observation: 'o', changeNote: 'n', evidence: [] };
      const hidden = await act('itemRevise', { id: ids.iClosed, ...body }, { expectedVersion: '1' });
      const absent = await act('itemRevise', { id: missing(), ...body }, { expectedVersion: '1' });
      expect({ ...hidden, correlationId: undefined }).toEqual({ ...absent, correlationId: undefined });
      expect(hidden.outcome).toBe('not_found');
      const archive = await act('itemSetArchived', { id: ids.iClosed, archived: true }, { expectedVersion: '1' });
      expect(archive.outcome).toBe('not_found');
      const row = (await sql('select publication_state, row_version from knowledge.knowledge_item where id = $1', [ids.iClosed])).rows[0] as Row;
      expect(row).toEqual({ publication_state: 'published', row_version: 1 });
    });

    it('itemCreate under a hidden model or SW version = ownerXxxId: not_found, like a missing owner', async () => {
      const body = { typeCode: 'anomaly', title: T('new'), observation: 'o' };
      const hidden = await act('itemCreate', { ownerModelId: ids.closed, ...body });
      const absent = await act('itemCreate', { ownerModelId: missing(), ...body });
      expect(hidden.outcome).toBe('invalid');
      expect(hidden.fieldErrors).toEqual(absent.fieldErrors);
      const sw = await act('itemCreate', { ownerSoftwareId: ids.swClosed, ...body });
      expect(sw.fieldErrors).toEqual([{ path: ['ownerSoftwareId'], code: 'not_found' }]);
      const count = (await sql(`select count(*)::int as n from knowledge.knowledge_item_revision where title = $1`, [T('new')])).rows[0].n;
      expect(count).toBe(0);
    });

    it('modelUpdate / modelSetActive / softwareUpdate of a hidden model or SW = not_found', async () => {
      const a = await act('modelSetActive', { id: ids.closed, active: false }, { expectedVersion: '1' });
      const b = await act('modelSetActive', { id: missing(), active: false }, { expectedVersion: '1' });
      expect(a.outcome).toBe('not_found');
      expect({ ...a, correlationId: undefined }).toEqual({ ...b, correlationId: undefined });
      const sw = await act('softwareSetActive', { id: ids.swClosed, active: false }, { expectedVersion: '1' });
      expect(sw.outcome).toBe('not_found');
      expect((await sql('select active from knowledge.equipment_model where id = $1', [ids.closed])).rows[0].active).toBe(true);
    });

    it('a SW create under a hidden model is parent not_found; a spec draft of a hidden model is not_found', async () => {
      const sw = await act('softwareCreate', { modelId: ids.closed, versionLabel: `${TAG}-new`, name: '' });
      expect(sw.fieldErrors).toEqual([{ path: ['modelId'], code: 'not_found' }]);
      const draft = await act('specDraftCreate', { modelId: ids.closed, sourceDocRef: { kind: 'paste' } });
      const absent = await act('specDraftCreate', { modelId: missing(), sourceDocRef: { kind: 'paste' } });
      expect(draft.fieldErrors).toEqual(absent.fieldErrors);
    });
  });

  describe('drafts of a hidden owner', () => {
    it('are not in the queue, not readable and not writable, even for their author, and come back with the access', async () => {
      const proposal = { ownerModelId: ids.open, typeCode: 'anomaly', title: T('draft'), observation: 'o' };
      const made = await act('draftCreate', { proposalType: 'create', proposal });
      expect(made.outcome).toBe('ok');
      const draftId = made.data.id as string;
      expect((await read('logKnowledge.drafts', { q: T('draft') })).data.total).toBe(1);
      await setMode('equipment_model', ids.open, 'restricted');
      const queue = await read('logKnowledge.drafts', { q: T('draft') });
      expect(queue.data).toEqual({ total: 0, rows: [] });
      const detail = await read('logKnowledge.draftDetail', { draftId });
      expect(detail.data).toBeNull();
      expect({ ...detail, correlationId: undefined }).toEqual({
        ...(await read('logKnowledge.draftDetail', { draftId: missing() })),
        correlationId: undefined,
      });
      const submit = await act('draftSubmit', { id: draftId }, { expectedVersion: String(made.version) });
      expect(submit.outcome).toBe('not_found');
      await setMode('equipment_model', ids.open, 'internal');
      expect((await read('logKnowledge.drafts', { q: T('draft') })).data.total).toBe(1);
    });
  });

  describe('managing access (knowledge.access.manage)', () => {
    it('accessModeSet restricts a model: version bump, audit row without names, and the viewer loses it on the next request', async () => {
      const before = await read('logKnowledge.accessRules', { targetKind: 'model', targetId: ids.open }, manager);
      expect(before.data.target).toMatchObject({ accessMode: 'internal' });
      const done = await act('accessModeSet', { targetKind: 'model', targetId: ids.open, mode: 'restricted' }, { who: manager, expectedVersion: before.data.target.version });
      expect(done.outcome).toBe('ok');
      expect(await listTitles()).toEqual([]);
      const audit = (await sql(`select event_type, subject_type, detail from core.audit_log where subject_id = $1 and event_type = 'knowledge.access.mode_changed'`, [ids.open])).rows as Row[];
      expect(audit).toHaveLength(1);
      expect(audit[0]?.detail).toEqual({ targetKind: 'model', targetId: ids.open, from: 'internal', to: 'restricted' });
      const stale = await act('accessModeSet', { targetKind: 'model', targetId: ids.open, mode: 'internal' }, { who: manager, expectedVersion: before.data.target.version });
      expect(stale.outcome).toBe('conflict');
    });

    it('the manager reaches a target they cannot see, and may grant themselves access (audited)', async () => {
      const read1 = await read('logKnowledge.accessRules', { targetKind: 'model', targetId: ids.closed }, manager);
      expect(read1.data.target.accessMode).toBe('restricted');
      expect(await listTitles(manager)).not.toContain(T('closed item'));
      const add = await act('accessRuleAdd', { targetKind: 'model', targetId: ids.closed, granteeId: manager.id, effect: 'allow' }, { who: manager });
      expect(add.outcome).toBe('ok');
      expect(await listTitles(manager)).toContain(T('closed item'));
      const audit = (await sql(`select detail from core.audit_log where subject_id = $1`, [add.data.ruleId])).rows as { detail: Row }[];
      expect(audit[0]?.detail).toMatchObject({ granteeId: manager.id, effect: 'allow', expires: false });
    });

    it('accessRuleAdd refuses an unknown target / grantee, a past expiry and a duplicate; accessRuleRevoke is idempotent and audited once', async () => {
      const base = { targetKind: 'item', targetId: ids.iRestricted, granteeId: viewer.id, effect: 'allow' };
      expect((await act('accessRuleAdd', { ...base, targetId: missing() }, { who: manager })).fieldErrors).toEqual([{ path: ['targetId'], code: 'not_found' }]);
      expect((await act('accessRuleAdd', { ...base, granteeId: missing() }, { who: manager })).fieldErrors).toEqual([{ path: ['granteeId'], code: 'not_found' }]);
      expect((await act('accessRuleAdd', { ...base, validUntil: '2020-01-01T00:00:00Z' }, { who: manager })).fieldErrors).toEqual([{ path: ['validUntil'], code: 'past' }]);
      const added = await act('accessRuleAdd', base, { who: manager });
      expect(added.outcome).toBe('ok');
      expect((await act('accessRuleAdd', base, { who: manager })).fieldErrors).toEqual([{ path: ['granteeId'], code: 'duplicate' }]);
      expect(await listTitles()).toContain(T('restricted item'));
      const ruleId = added.data.ruleId as string;
      expect((await act('accessRuleRevoke', { ruleId }, { who: manager })).outcome).toBe('ok');
      expect((await act('accessRuleRevoke', { ruleId }, { who: manager })).outcome).toBe('ok');
      expect(await listTitles()).not.toContain(T('restricted item'));
      const events = (await sql(`select event_type from core.audit_log where subject_id = $1 order by created_at`, [ruleId])).rows.map((r: Row) => r.event_type);
      expect(events).toEqual(['knowledge.access.rule_added', 'knowledge.access.rule_revoked']);
      const listed = await read('logKnowledge.accessRules', { targetKind: 'item', targetId: ids.iRestricted }, manager);
      expect(listed.data.rows[0]).toMatchObject({ ruleId, state: 'revoked', granteeKind: 'actor' });
    });

    it('without the capability every access action and the rules read are refused, and no row or mode changes', async () => {
      const set = await act('accessModeSet', { targetKind: 'model', targetId: ids.open, mode: 'restricted' }, { who: plain, expectedVersion: '1' });
      expect(set.outcome).toBe('forbidden');
      const add = await act('accessRuleAdd', { targetKind: 'model', targetId: ids.open, granteeId: plain.id, effect: 'deny' }, { who: plain });
      expect(add.outcome).toBe('forbidden');
      expect((await act('accessRuleRevoke', { ruleId: missing() }, { who: plain })).outcome).toBe('forbidden');
      const rules = await read('logKnowledge.accessRules', { targetKind: 'model', targetId: ids.open }, plain);
      expect(rules.outcome).not.toBe('ok');
      expect((await sql('select access_mode from knowledge.equipment_model where id = $1', [ids.open])).rows[0].access_mode).toBe('internal');
      expect((await sql('select count(*)::int as n from knowledge.object_access_rule where target_id = $1', [ids.open])).rows[0].n).toBe(0);
    });

    it('rejects a malformed input with field errors and a team grantee kind is not an input', async () => {
      const bad = await act('accessRuleAdd', { targetKind: 'vendor', targetId: 'x', granteeId: viewer.id, effect: 'maybe' }, { who: manager });
      expect(bad.outcome).toBe('invalid');
      expect(bad.fieldErrors?.map((e) => `${e.path.join('.')}:${e.code}`).sort()).toEqual(['effect:malformed', 'targetId:malformed', 'targetKind:malformed']);
      const team = await act('accessRuleAdd', { targetKind: 'model', targetId: ids.open, granteeId: viewer.id, effect: 'allow', granteeKind: 'team' }, { who: manager });
      expect(team.outcome).not.toBe('ok');
    });
  });

  describe('SQL agrees with the pure rule', () => {
    it('every chain combination of a restricted / allowed / denied model, SW and item gives the pure answer', async () => {
      const { chainVisible } = await import('../domain/access-visibility.js');
      const now = new Date();
      const states = ['internal', 'restricted', 'allowed', 'denied'] as const;
      const levelOf = (s: (typeof states)[number]) => ({
        mode: s === 'internal' || s === 'denied' ? ('internal' as const) : ('restricted' as const),
        rules: s === 'allowed' ? [{ effect: 'allow' as const, validUntil: null, revokedAt: null }] : s === 'denied' ? [{ effect: 'deny' as const, validUntil: null, revokedAt: null }] : [],
      });
      const m = await catalog('equipment_model', `${TAG}-combo`, { vendor_id: ids.vendor });
      const s = await software(m, `${TAG}-combo-sw`);
      const i = await item({ software: s }, `${TAG} combo item`);
      for (const ms of states) for (const ss of states) for (const is of states) {
        await clearRules();
        for (const [kind, id, state, table] of [['model', m, ms, 'equipment_model'], ['software', s, ss, 'software_version'], ['item', i, is, 'knowledge_item']] as const) {
          await setMode(table, id, levelOf(state).mode);
          if (state === 'allowed') await rule(kind, id, 'allow');
          if (state === 'denied') await rule(kind, id, 'deny');
        }
        const expected = chainVisible([levelOf(ms), levelOf(ss), levelOf(is)], now);
        const seen = (await listTitles()).includes(T('combo item'));
        expect(seen, `${ms}/${ss}/${is}`).toBe(expected);
      }
    });
  });
});
