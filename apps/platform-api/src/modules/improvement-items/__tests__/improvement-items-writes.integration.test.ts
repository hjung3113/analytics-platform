// #1328 b — the improvement item write actions, the 0094 grants and triggers and the audit projection, through the real
// `buildServer` over `POST /api/v1/menu-action` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs migration 0094.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { AUDIT_ACTION_BY_EVENT_TYPE } from '../../platform-port/audit-actions.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IMW${randomUUID().slice(0, 6).toUpperCase()}`;
const CONSTRAINT = 'improvement.improvement_item_origin_or_target';

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

const ORIGIN = { menuId: 'analysis-workspace', context: { range: 'last-7d' } };
const EQUIPMENT = (key: string) => ({ kind: 'equipment', externalKey: key, displayName: `Equipment ${key}` });

describe.skipIf(!runIntegration)('improvement item writes (#1328 b)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
  let colleague: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignItem = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;
  let rawNo = 70_000;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

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
        action: `improvement.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `improvement.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  /** Creates an item (origin by default) and returns its id and version. */
  async function make(over: Record<string, unknown> = {}, who: Person = admin) {
    const a = await act('itemCreate', { problem: `problem ${TAG} ${n++}`, origin: ORIGIN, ...over }, { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.itemId as string, no: a.data.itemNo as number, version: a.data.version as string };
  }
  /** Moves an item with `itemSetStatus` and returns the new version. */
  async function move(id: string, version: string, status: string, extra: Record<string, unknown> = {}) {
    const a = await act('itemSetStatus', { itemId: id, status, ...extra }, { expectedVersion: version });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.version as string;
  }
  const toInProgress = (id: string, v: string) => move(id, v, 'in_progress', { action: 'replace the filter' });
  const toDone = async (id: string, v: string) => move(id, await toInProgress(id, v), 'done', { actionDate: '2026-11-01' });
  const toVerified = async (id: string, v: string) =>
    move(id, await toDone(id, v), 'verified', { effect: { result: 'effective', note: 'scrap fell', compareLink: '/analysis/compare?a=1' } });

  const itemRow = async (id: string) => (await sql('select *, action_date::text as action_date from improvement.item where id = $1', [id])).rows[0] as Row;
  const events = async (id: string) =>
    (await sql('select event_type, changes, reason, actor_id from improvement.item_event where item_id = $1 order by seq', [id])).rows as {
      event_type: string;
      changes: { before: Row; after: Row };
      reason: string | null;
      actor_id: string;
    }[];
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Row;
    }[];
  const targetKeys = async (id: string) =>
    (await sql('select external_key from improvement.item_target where item_id = $1 order by external_key', [id])).rows.map((r) => r.external_key as string);
  const counter = async () =>
    Number((await sql('select last_item_no from improvement.item_counter where workspace_id = $1', [WORKSPACE_ID])).rows[0]?.last_item_no ?? 0);

  /** Inserts a raw item as platform_app on a client (no origin unless given), for the trigger tests. */
  const rawInsert = (client: { query: (t: string, p?: unknown[]) => Promise<unknown> }, id: string, origin: string | null) =>
    client.query(
      `insert into improvement.item (id, workspace_id, item_no, problem, origin_menu_id, origin_context, created_by, updated_by) values ($1,$2,$3,'raw',$4,$5,$6,$6)`,
      [id, WORKSPACE_ID, (rawNo += 1), origin, origin === null ? null : '{}', admin.id],
    );
  const rawTarget = (client: { query: (t: string, p?: unknown[]) => Promise<unknown> }, id: string) =>
    client.query(`insert into improvement.item_target (workspace_id, item_id, kind, external_key, display_name_snapshot) values ($1,$2,'equipment','raw','Raw')`, [WORKSPACE_ID, id]);

  // The suite sends far more writes than one actor's rate window allows; a 429 would hide the real assertion.
  beforeEach(async () => { await sql('delete from core.rate_limits'); });

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
    colleague = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'improvement.manage', null, $3)`,
      [WORKSPACE_ID, developerGranted.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    foreignItem = (
      await sql(
        `insert into improvement.item (workspace_id, item_no, problem, origin_menu_id, origin_context, created_by, updated_by) values ($1,1,'foreign','m','{}',$2,$2) returning id`,
        [otherWorkspace, foreignActor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const mine = '(select id from improvement.item where created_by = any($1))';
    // One transaction: the deferred origin-or-target trigger (0094) would refuse deleting an origin-less item's last target on its own.
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query(`delete from improvement.item_event where item_id in ${mine}`, [actorIds]);
      await client.query(`delete from improvement.item_target where item_id in ${mine}`, [actorIds]);
      await client.query('delete from improvement.item where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from improvement.item_counter where workspace_id = any($1)', [workspaceIds]);
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

  describe('permissions', () => {
    it('a User and a Developer without the capability are refused; a Developer with the workspace grant and an Admin write; reads stay open', async () => {
      const input = { problem: `perm ${TAG}`, origin: ORIGIN };
      expect((await act('itemCreate', input, { who: user })).outcome).toBe('forbidden');
      expect((await act('itemCreate', input, { who: developer })).outcome).toBe('forbidden');
      expect((await act('itemCreate', input, { who: developerGranted })).outcome).toBe('ok');
      expect((await act('itemCreate', input, { who: admin })).outcome).toBe('ok');
      const a = await read('items', {}, user);
      expect(a.outcome).toBe('ok');
      expect(a.data.total).toBeGreaterThan(0);
    });

    it.each(['itemUpdate', 'itemSetStatus', 'itemReopen', 'itemAssign', 'itemLinkQuest'])('%s refuses a User and a plain Developer before reading the item', async (action) => {
      const item = await make();
      const input = { itemId: item.id, problem: 'x', status: 'dropped', reason: 'x', assigneeId: null, questId: null, questTitle: null };
      const keys: Record<string, string[]> = {
        itemUpdate: ['itemId', 'problem'],
        itemSetStatus: ['itemId', 'status', 'reason'],
        itemReopen: ['itemId', 'reason'],
        itemAssign: ['itemId', 'assigneeId'],
        itemLinkQuest: ['itemId', 'questId', 'questTitle'],
      };
      const body = Object.fromEntries((keys[action] ?? []).map((k) => [k, (input as Row)[k]]));
      for (const who of [user, developer]) {
        expect((await act(action, body, { who, expectedVersion: item.version })).outcome).toBe('forbidden');
      }
      expect((await itemRow(item.id)).row_version).toBe(1);
    });
  });

  describe('itemCreate', () => {
    it('creates an open item with a number, targets, a created event and an audit row', async () => {
      const a = await act('itemCreate', {
        problem: `  Spindle vibrates ${TAG}  `,
        action: 'Replace the bearing',
        actionDate: '2026-10-30',
        assigneeId: colleague.id,
        questId: 'quest-1',
        questTitle: 'Bearing quest',
        origin: ORIGIN,
        targets: [EQUIPMENT('B'), EQUIPMENT('A')],
      });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data).toMatchObject({ version: '1' });
      const id = a.data.itemId as string;
      const row = await itemRow(id);
      expect(row).toMatchObject({
        status: 'open',
        problem: `Spindle vibrates ${TAG}`,
        action: 'Replace the bearing',
        assignee_id: colleague.id,
        quest_id: 'quest-1',
        quest_title_snapshot: 'Bearing quest',
        origin_menu_id: 'analysis-workspace',
        row_version: 1,
        item_no: a.data.itemNo,
        created_by: admin.id,
      });
      expect(await targetKeys(id)).toEqual(['A', 'B']);
      const ev = await events(id);
      expect(ev.map((e) => e.event_type)).toEqual(['created']);
      expect(ev[0]?.changes.before).toEqual({});
      expect(ev[0]?.changes.after).toMatchObject({ problem: `Spindle vibrates ${TAG}`, assigneeId: colleague.id });
      const rows = await audit(id);
      expect(rows.map((r) => [r.event_type, r.subject_type, r.actor_id])).toEqual([['improvement.item.created', 'improvement_item', admin.id]]);
      expect(rows[0]?.detail).toEqual({ itemNo: a.data.itemNo, hasOrigin: true, targetCount: 2, assigned: true, questLinked: true });
      expect(JSON.stringify(rows[0]?.detail)).not.toContain('Spindle');
    });

    it('answers origin:required_or_target for neither, accepts a target alone, and reports duplicate targets by index', async () => {
      const none = await act('itemCreate', { problem: `none ${TAG}` });
      expect(none.outcome).toBe('invalid');
      expect(fe(none)).toEqual(['origin:required_or_target']);
      const targetOnly = await act('itemCreate', { problem: `target ${TAG}`, targets: [EQUIPMENT('T1')] });
      expect(targetOnly.outcome).toBe('ok');
      const dup = await act('itemCreate', { problem: `dup ${TAG}`, targets: [EQUIPMENT('D'), EQUIPMENT('E'), EQUIPMENT('D')] });
      expect(dup.outcome).toBe('invalid');
      expect(fe(dup)).toEqual(['targets.2:duplicate']);
    });

    it.each([
      ['a blank problem', { problem: '   ' }, 'problem:required'],
      ['an overlong problem', { problem: 'x'.repeat(501) }, 'problem:too_long'],
      ['a quest id without a title', { questId: 'q' }, 'questTitle:required'],
      ['a malformed date', { actionDate: '2026-02-30' }, 'actionDate:malformed'],
      ['an unknown target kind', { targets: [{ kind: 'room', externalKey: 'k', displayName: 'n' }] }, 'targets.0.kind:malformed'],
      // #1411: a wrong type is `required` (aligned with log-knowledge), not `malformed`.
      ['a non-string problem', { problem: 5 }, 'problem:required'],
      ['a non-string assignee id', { assigneeId: 5 }, 'assigneeId:required'],
    ])('refuses %s as a field error', async (_name, over, code) => {
      const a = await act('itemCreate', { problem: `v ${TAG}`, origin: ORIGIN, ...over });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toContain(code);
    });

    it('refuses an assignee of another workspace after allocating, leaves no number gap, and keeps the next number consecutive', async () => {
      const before = await counter();
      const a = await act('itemCreate', { problem: `gap ${TAG}`, origin: ORIGIN, assigneeId: foreignActor });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['assigneeId:not_found']);
      expect(await counter()).toBe(before);
      const next = await make();
      expect(next.no).toBe(before + 1);
    });

    it('two parallel creates in one workspace get distinct consecutive numbers', async () => {
      const [a, b] = await Promise.all([make(), make()]);
      expect(a.no).not.toBe(b.no);
      expect(Math.abs(a.no - b.no)).toBe(1);
    });

    it('replays an identical request with the same answer and writes once', async () => {
      const key = randomUUID();
      const input = { problem: `replay ${TAG}`, origin: ORIGIN };
      const first = await act('itemCreate', input, { key });
      const second = await act('itemCreate', input, { key });
      expect(second).toMatchObject({ outcome: 'ok', data: first.data });
      expect((await sql('select count(*)::int as c from improvement.item where problem = $1', [input.problem])).rows[0].c).toBe(1);
    });
  });

  describe('itemUpdate', () => {
    it('edits the text fields, replaces the target set, bumps the version and records before/after of the changed fields only', async () => {
      const item = await make({ action: 'first', targets: [EQUIPMENT('A'), EQUIPMENT('B')] });
      const a = await act(
        'itemUpdate',
        { itemId: item.id, problem: `edited ${TAG}`, action: 'second', actionDate: '2026-11-02', targets: [EQUIPMENT('B'), EQUIPMENT('C')] },
        { expectedVersion: item.version },
      );
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.version).toBe('2');
      expect(await targetKeys(item.id)).toEqual(['B', 'C']);
      expect(await itemRow(item.id)).toMatchObject({ problem: `edited ${TAG}`, action: 'second', row_version: 2, status: 'open', assignee_id: null });
      const ev = (await events(item.id)).at(-1);
      expect(ev?.event_type).toBe('updated');
      expect(Object.keys(ev?.changes.after ?? {}).sort()).toEqual(['action', 'actionDate', 'problem', 'targets']);
      expect(ev?.changes.before).toMatchObject({ action: 'first' });
      expect((await audit(item.id)).at(-1)?.detail).toEqual({
        itemNo: item.no,
        changed: ['problem', 'action', 'actionDate', 'targets'],
        targetCount: 2,
      });
    });

    it('never touches status, assignee, quest or effect', async () => {
      const item = await make({ assigneeId: colleague.id, questId: 'q', questTitle: 'Q' });
      const v = await toVerified(item.id, item.version);
      const before = await itemRow(item.id);
      const a = await act('itemUpdate', { itemId: item.id, problem: `later ${TAG}` }, { expectedVersion: v });
      expect(a.outcome).toBe('ok');
      const after = await itemRow(item.id);
      for (const col of ['status', 'assignee_id', 'quest_id', 'effect_result', 'effect_note', 'effect_compare_link']) {
        expect(after[col], col).toEqual(before[col]);
      }
    });

    it('a save that changes nothing answers ok with the same version, no event and no audit row', async () => {
      const item = await make({ action: 'same', targets: [EQUIPMENT('A')] });
      const a = await act('itemUpdate', { itemId: item.id, action: 'same', targets: [EQUIPMENT('A')] }, { expectedVersion: item.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '1' });
      expect((await itemRow(item.id)).row_version).toBe(1);
      expect((await events(item.id)).map((e) => e.event_type)).toEqual(['created']);
      expect((await audit(item.id)).map((r) => r.event_type)).toEqual(['improvement.item.created']);
    });

    it('a resubmitted equivalent origin is a no-op although JSONB reorders object keys', async () => {
      const item = await make({ origin: { menuId: 'm', context: { b: 2, a: 1, n: { y: 1, x: 2 } } } });
      const a = await act(
        'itemUpdate',
        { itemId: item.id, origin: { menuId: ' m ', context: { a: 1, b: 2, n: { x: 2, y: 1 } } } },
        { expectedVersion: item.version },
      );
      expect(a, JSON.stringify(a)).toMatchObject({ outcome: 'ok', version: '1' });
      expect((await itemRow(item.id)).row_version).toBe(1);
      expect((await events(item.id)).map((e) => e.event_type)).toEqual(['created']);
      expect((await audit(item.id)).map((r) => r.event_type)).toEqual(['improvement.item.created']);
    });

    it('a stale version answers conflict with the current version; a foreign-workspace item is not_found', async () => {
      const item = await make();
      await act('itemUpdate', { itemId: item.id, problem: `one ${TAG}` }, { expectedVersion: item.version });
      const stale = await act('itemUpdate', { itemId: item.id, problem: `two ${TAG}` }, { expectedVersion: item.version });
      expect(stale).toMatchObject({ outcome: 'conflict', version: '2' });
      expect((await act('itemUpdate', { itemId: foreignItem, problem: 'x' }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await itemRow(foreignItem)).problem).toBe('foreign');
    });

    it('reports the cumulative rules and the Q2 last-target rule as field errors, not as constraint errors', async () => {
      const targetOnly = await make({ origin: null, targets: [EQUIPMENT('Z')] });
      const dropTargets = await act('itemUpdate', { itemId: targetOnly.id, targets: [] }, { expectedVersion: targetOnly.version });
      expect(dropTargets.outcome).toBe('invalid');
      expect(fe(dropTargets)).toEqual(['origin:required_or_target']);
      const swapped = await act('itemUpdate', { itemId: targetOnly.id, origin: null, targets: [EQUIPMENT('Y')] }, { expectedVersion: targetOnly.version });
      expect(swapped.outcome).toBe('ok');

      const item = await make();
      const done = await toDone(item.id, item.version);
      const clear = await act('itemUpdate', { itemId: item.id, action: null, actionDate: null }, { expectedVersion: done });
      expect(clear.outcome).toBe('invalid');
      expect(fe(clear).sort()).toEqual(['action:required', 'actionDate:required']);
      const noOrigin = await act('itemUpdate', { itemId: item.id, origin: null }, { expectedVersion: done });
      expect(fe(noOrigin)).toEqual(['origin:required_or_target']);
      expect((await itemRow(item.id)).row_version).toBe(3);
    });

    it('catches a duplicate (kind, externalKey) in targets[] before the lock', async () => {
      const item = await make();
      const a = await act('itemUpdate', { itemId: item.id, targets: [EQUIPMENT('A'), EQUIPMENT('A')] }, { expectedVersion: item.version });
      expect(fe(a)).toEqual(['targets.1:duplicate']);
    });

    it('refuses unsafe origin.context as a field error on create and on update, writing nothing', async () => {
      // `act` asserts the 200 envelope, so an outcome here proves the error is not an HTTP 500.
      const context = (v: Record<string, unknown>) => ({ menuId: 'm', context: v });
      const problem = `unsafe ${TAG}`;
      for (const bad of [
        { nested: { deep: 'bad\u0000' } }, // NUL in a nested string value
        { '\u0000': 1 }, // NUL in an object key
        { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }, // a container on level 9 (cap is 8)
      ]) {
        const a = await act('itemCreate', { problem, origin: context(bad) });
        expect(a.outcome, JSON.stringify(a)).toBe('invalid');
        expect(fe(a)).toEqual(['origin.context:malformed']);
      }
      expect((await sql('select 1 from improvement.item where problem = $1', [problem])).rowCount).toBe(0);

      const item = await make();
      const beforeEvents = (await events(item.id)).map((e) => e.event_type);
      const beforeAudit = (await audit(item.id)).map((r) => r.event_type);
      const up = await act('itemUpdate', { itemId: item.id, origin: context({ bad: { deep: 'x\ud800' } }) }, { expectedVersion: item.version });
      expect(up.outcome, JSON.stringify(up)).toBe('invalid');
      expect(fe(up)).toEqual(['origin.context:malformed']);
      expect((await itemRow(item.id)).row_version).toBe(1);
      expect((await events(item.id)).map((e) => e.event_type)).toEqual(beforeEvents);
      expect((await audit(item.id)).map((r) => r.event_type)).toEqual(beforeAudit);
    });
  });

  describe('itemSetStatus', () => {
    it('walks open → in_progress → done → verified → dropped, writing one status_changed event and audit row each', async () => {
      const item = await make();
      const inProgress = await act('itemSetStatus', { itemId: item.id, status: 'in_progress', action: 'swap filter' }, { expectedVersion: item.version });
      expect(inProgress).toMatchObject({ outcome: 'ok', version: '2' });
      const done = await act('itemSetStatus', { itemId: item.id, status: 'done', actionDate: '2026-11-03' }, { expectedVersion: '2' });
      expect(done.version).toBe('3');
      const verified = await act(
        'itemSetStatus',
        { itemId: item.id, status: 'verified', effect: { result: 'effective', note: 'ok', compareLink: '/analysis/compare?x=1' } },
        { expectedVersion: '3' },
      );
      expect(verified.version).toBe('4');
      expect(await itemRow(item.id)).toMatchObject({ status: 'verified', effect_result: 'effective', effect_note: 'ok', effect_compare_link: '/analysis/compare?x=1', action_date: '2026-11-03' });
      const dropped = await act('itemSetStatus', { itemId: item.id, status: 'dropped', reason: 'line retired' }, { expectedVersion: '4' });
      expect(dropped.version).toBe('5');
      expect(await itemRow(item.id)).toMatchObject({ status: 'dropped', drop_reason: 'line retired', effect_result: 'effective' });
      const ev = (await events(item.id)).slice(1);
      expect(ev.map((e) => [e.event_type, e.changes.before.status, e.changes.after.status])).toEqual([
        ['status_changed', 'open', 'in_progress'],
        ['status_changed', 'in_progress', 'done'],
        ['status_changed', 'done', 'verified'],
        ['status_changed', 'verified', 'dropped'],
      ]);
      expect(ev[0]?.changes.after).toMatchObject({ action: 'swap filter' });
      expect(ev[3]?.reason).toBe('line retired');
      const rows = (await audit(item.id)).slice(1);
      expect(rows.map((r) => r.detail)).toEqual([
        { itemNo: item.no, from: 'open', to: 'in_progress' },
        { itemNo: item.no, from: 'in_progress', to: 'done' },
        { itemNo: item.no, from: 'done', to: 'verified' },
        { itemNo: item.no, from: 'verified', to: 'dropped' },
      ]);
      expect(JSON.stringify(rows)).not.toContain('line retired');
    });

    it.each(['open', 'in_progress', 'done'])('drops from %s, and requires a reason', async (from) => {
      const item = await make({ action: 'a', actionDate: '2026-11-01' });
      let v = item.version;
      if (from === 'in_progress') v = await toInProgress(item.id, v);
      if (from === 'done') v = await toDone(item.id, v);
      const noReason = await act('itemSetStatus', { itemId: item.id, status: 'dropped' }, { expectedVersion: v });
      expect(fe(noReason)).toEqual(['reason:required']);
      expect((await act('itemSetStatus', { itemId: item.id, status: 'dropped', reason: 'no longer needed' }, { expectedVersion: v })).outcome).toBe('ok');
    });

    it('reports the cumulative rules as field errors and leaves the item alone', async () => {
      const item = await make();
      const noAction = await act('itemSetStatus', { itemId: item.id, status: 'in_progress' }, { expectedVersion: item.version });
      expect(fe(noAction)).toEqual(['action:required']);
      const v = await toInProgress(item.id, item.version);
      const noDate = await act('itemSetStatus', { itemId: item.id, status: 'done' }, { expectedVersion: v });
      expect(fe(noDate)).toEqual(['actionDate:required']);
      const v2 = await move(item.id, v, 'done', { actionDate: '2026-11-01' });
      const noEffect = await act('itemSetStatus', { itemId: item.id, status: 'verified' }, { expectedVersion: v2 });
      expect(fe(noEffect)).toEqual(['effect:required']);
      const stray = await act('itemSetStatus', { itemId: item.id, status: 'verified', effect: { result: 'effective' }, reason: 'x' }, { expectedVersion: v2 });
      expect(fe(stray)).toEqual(['reason:not_applicable']);
      expect((await itemRow(item.id)).row_version).toBe(3);
    });

    it.each([
      ['an absolute URL', 'https://evil.example/x'],
      ['a protocol-relative URL', '//evil.example/x'],
      ['a backslash path', '/\\evil'],
      ['a bare word', 'compare'],
      ['a TAB after the slash', '/\t/evil.example/x'],
      ['a CR after the slash', '/\r/evil.example/x'],
      ['a LF after the slash', '/\n/evil.example/x'],
      ['a percent-encoded protocol-relative path', '/%2F%2Fevil.example/x'],
    ])('refuses a compareLink that is %s', async (_name, compareLink) => {
      const item = await make();
      const v = await toDone(item.id, item.version);
      const a = await act('itemSetStatus', { itemId: item.id, status: 'verified', effect: { result: 'effective', compareLink } }, { expectedVersion: v });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['effect.compareLink:malformed']);
    });

    it.each([
      ['open', 'done'],
      ['open', 'verified'],
      ['open', 'open'],
      ['in_progress', 'verified'],
      ['in_progress', 'in_progress'],
      ['done', 'in_progress'],
      ['verified', 'done'],
      ['dropped', 'open'],
      ['dropped', 'in_progress'],
    ])('refuses %s → %s with status:illegal_transition', async (from, to) => {
      const item = await make({ action: 'a', actionDate: '2026-11-01' });
      let v = item.version;
      if (from === 'in_progress') v = await toInProgress(item.id, v);
      if (from === 'done') v = await toDone(item.id, v);
      if (from === 'verified') v = await toVerified(item.id, v);
      if (from === 'dropped') v = await move(item.id, v, 'dropped', { reason: 'x' });
      const a = await act('itemSetStatus', { itemId: item.id, status: to, action: undefined, actionDate: '2026-11-01', effect: { result: 'effective' }, reason: 'x' }, { expectedVersion: v });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['status:illegal_transition']);
      expect((await itemRow(item.id)).status).toBe(from);
    });

    it('a conflict replayed on an illegal pair ends as invalid, never as conflict again', async () => {
      const item = await make();
      const v = await toDone(item.id, item.version);
      await act('itemAssign', { itemId: item.id, assigneeId: colleague.id }, { expectedVersion: v });
      const stale = await act('itemSetStatus', { itemId: item.id, status: 'in_progress' }, { expectedVersion: v });
      expect(stale.outcome).toBe('conflict');
      const retry = await act('itemSetStatus', { itemId: item.id, status: 'in_progress' }, { expectedVersion: stale.version as string });
      expect(retry.outcome).toBe('invalid');
      expect(fe(retry)).toEqual(['status:illegal_transition']);
    });

    it('two parallel moves with the same expected version: exactly one ok and one conflict', async () => {
      const item = await make({ action: 'a' });
      const results = await Promise.all([
        act('itemSetStatus', { itemId: item.id, status: 'in_progress' }, { expectedVersion: item.version }),
        act('itemSetStatus', { itemId: item.id, status: 'dropped', reason: 'race' }, { expectedVersion: item.version }),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await itemRow(item.id)).row_version).toBe(2);
      expect((await events(item.id)).filter((e) => e.event_type === 'status_changed')).toHaveLength(1);
    });

    it('a foreign-workspace item is not_found', async () => {
      const a = await act('itemSetStatus', { itemId: foreignItem, status: 'dropped', reason: 'x' }, { expectedVersion: '1' });
      expect(a.outcome).toBe('not_found');
      expect((await itemRow(foreignItem)).status).toBe('open');
    });
  });

  describe('itemReopen', () => {
    it.each([
      ['done', 'in_progress'],
      ['verified', 'done'],
      ['dropped', 'open'],
    ])('reopens %s to %s, keeps the effect and drop columns, records the reason', async (from, to) => {
      const item = await make();
      let v = item.version;
      if (from === 'done') v = await toDone(item.id, v);
      if (from === 'verified') v = await toVerified(item.id, v);
      if (from === 'dropped') v = await move(item.id, await toVerified(item.id, v), 'dropped', { reason: 'obsolete' });
      const beforeRow = await itemRow(item.id);
      const a = await act('itemReopen', { itemId: item.id, reason: 'came back' }, { expectedVersion: v });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.version).toBe(String(Number(v) + 1));
      const row = await itemRow(item.id);
      expect(row.status).toBe(to);
      for (const col of ['effect_result', 'effect_note', 'effect_compare_link', 'drop_reason', 'action', 'action_date']) {
        expect(row[col], col).toEqual(beforeRow[col]);
      }
      const ev = (await events(item.id)).at(-1);
      expect(ev).toMatchObject({ event_type: 'reopened', reason: 'came back' });
      expect(ev?.changes).toEqual({ before: { status: from }, after: { status: to } });
      expect((await audit(item.id)).at(-1)).toMatchObject({ event_type: 'improvement.item.reopened', detail: { itemNo: item.no, from, to } });
    });

    it('requires a reason and refuses open and in_progress', async () => {
      const item = await make();
      expect(fe(await act('itemReopen', { itemId: item.id, reason: ' ' }, { expectedVersion: item.version }))).toEqual(['reason:required']);
      const open = await act('itemReopen', { itemId: item.id, reason: 'x' }, { expectedVersion: item.version });
      expect(fe(open)).toEqual(['status:illegal_transition']);
      const v = await toInProgress(item.id, item.version);
      expect(fe(await act('itemReopen', { itemId: item.id, reason: 'x' }, { expectedVersion: v }))).toEqual(['status:illegal_transition']);
    });

    it('a reopened item can take the forward moves again (verified → done → verified with a new effect)', async () => {
      const item = await make();
      const v = await toVerified(item.id, item.version);
      const reopened = (await act('itemReopen', { itemId: item.id, reason: 'recheck' }, { expectedVersion: v })).version as string;
      const noNew = await act('itemSetStatus', { itemId: item.id, status: 'verified' }, { expectedVersion: reopened });
      expect(fe(noNew)).toEqual(['effect:required']);
      await move(item.id, reopened, 'verified', { effect: { result: 'ineffective' } });
      expect(await itemRow(item.id)).toMatchObject({ status: 'verified', effect_result: 'ineffective', effect_note: null, effect_compare_link: null });
    });
  });

  describe('itemAssign and itemLinkQuest', () => {
    it('assigns, reassigns and clears, with an assigned event; a no-op does nothing', async () => {
      const item = await make();
      const a = await act('itemAssign', { itemId: item.id, assigneeId: colleague.id }, { expectedVersion: item.version });
      expect(a).toMatchObject({ outcome: 'ok', version: '2' });
      const same = await act('itemAssign', { itemId: item.id, assigneeId: colleague.id }, { expectedVersion: '2' });
      expect(same).toMatchObject({ outcome: 'ok', version: '2' });
      const cleared = await act('itemAssign', { itemId: item.id, assigneeId: null }, { expectedVersion: '2' });
      expect(cleared.version).toBe('3');
      const ev = (await events(item.id)).filter((e) => e.event_type === 'assigned');
      expect(ev.map((e) => e.changes)).toEqual([
        { before: { assigneeId: null }, after: { assigneeId: colleague.id } },
        { before: { assigneeId: colleague.id }, after: { assigneeId: null } },
      ]);
      expect((await audit(item.id)).filter((r) => r.event_type === 'improvement.item.assigned')).toHaveLength(2);
    });

    it('refuses an assignee of another workspace and an unknown actor with assigneeId:not_found', async () => {
      const item = await make();
      for (const assigneeId of [foreignActor, randomUUID()]) {
        const a = await act('itemAssign', { itemId: item.id, assigneeId }, { expectedVersion: item.version });
        expect(a.outcome).toBe('invalid');
        expect(fe(a)).toEqual(['assigneeId:not_found']);
      }
      expect((await itemRow(item.id)).row_version).toBe(1);
    });

    it('links and unlinks a Quest by snapshot, and the pair must come together', async () => {
      const item = await make();
      const linked = await act('itemLinkQuest', { itemId: item.id, questId: 'q-9', questTitle: 'Nine' }, { expectedVersion: item.version });
      expect(linked).toMatchObject({ outcome: 'ok', version: '2' });
      expect(await itemRow(item.id)).toMatchObject({ quest_id: 'q-9', quest_title_snapshot: 'Nine' });
      const half = await act('itemLinkQuest', { itemId: item.id, questId: 'q-9', questTitle: null }, { expectedVersion: '2' });
      expect(half.outcome).toBe('invalid');
      const unlinked = await act('itemLinkQuest', { itemId: item.id, questId: null, questTitle: null }, { expectedVersion: '2' });
      expect(unlinked.version).toBe('3');
      expect(await itemRow(item.id)).toMatchObject({ quest_id: null, quest_title_snapshot: null });
      const ev = (await events(item.id)).filter((e) => e.event_type === 'quest_linked');
      expect(ev).toHaveLength(2);
      expect((await audit(item.id)).at(-1)).toMatchObject({ event_type: 'improvement.item.quest_linked', detail: { itemNo: item.no, questId: null, previousQuestId: 'q-9' } });
    });
  });

  describe('reads after writes (smoke)', () => {
    it('the me assignee filter, the list and the history see the writes', async () => {
      const item = await make({ problem: `smoke ${TAG}` });
      await act('itemAssign', { itemId: item.id, assigneeId: admin.id }, { expectedVersion: item.version });
      const mine = await read('items', { filters: [{ id: 'assignee', op: 'in', value: ['me'] }], pageSize: 100 });
      expect(mine.outcome, JSON.stringify(mine)).toBe('ok');
      expect(mine.data.rows.map((r: { id: string }) => r.id)).toContain(item.id);
      const detail = await read('itemDetail', { itemId: item.id });
      expect(detail.data).toMatchObject({ version: '2', assignee: { id: admin.id } });
      const hist = await read('itemEvents', { itemId: item.id });
      expect(hist.data.rows.map((r: { eventType: string }) => r.eventType).sort()).toEqual(['assigned', 'created']);
    });
  });

  describe('origin-or-target constraint trigger (Q2, 0094)', () => {
    async function inTx(work: (c: { query: (t: string, p?: unknown[]) => Promise<unknown> }) => Promise<void>, pool = dbHandle.pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await work(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    it('refuses an origin-less, target-less insert at COMMIT, and after SET CONSTRAINTS … IMMEDIATE the statement itself succeeded', async () => {
      const id = randomUUID();
      await expect(inTx((c) => rawInsert(c, id, null).then(() => undefined))).rejects.toMatchObject({ code: '23514', constraint: 'improvement_item_origin_or_target' });
      const id2 = randomUUID();
      const client = await dbHandle.pool.connect();
      try {
        await client.query('BEGIN');
        await rawInsert(client, id2, null);
        await expect(client.query(`SET CONSTRAINTS ${CONSTRAINT} IMMEDIATE`)).rejects.toMatchObject({ code: '23514', constraint: 'improvement_item_origin_or_target' });
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
      expect((await sql('select 1 from improvement.item where id = any($1)', [[id, id2]])).rowCount).toBe(0);
    });

    it('refuses deleting the last target of an origin-less item, and accepts it while an origin or another target remains', async () => {
      const id = randomUUID();
      await inTx(async (c) => {
        await rawInsert(c, id, null);
        await rawTarget(c, id);
      });
      await expect(inTx((c) => c.query('delete from improvement.item_target where item_id = $1', [id]).then(() => undefined))).rejects.toMatchObject({ constraint: 'improvement_item_origin_or_target' });
      expect(await targetKeys(id)).toEqual(['raw']);
      const keep = await make({ targets: [EQUIPMENT('K')] });
      await inTx((c) => c.query('delete from improvement.item_target where item_id = $1', [keep.id]).then(() => undefined));
      expect(await targetKeys(keep.id)).toEqual([]);
    });

    it('judges the final state of the transaction, not the stale row of an earlier statement', async () => {
      const id = randomUUID();
      await inTx(async (c) => {
        await rawInsert(c, id, null);
        await rawTarget(c, id);
        await c.query('delete from improvement.item_target where item_id = $1', [id]);
        await c.query(`update improvement.item set origin_menu_id = 'late', origin_context = '{}', row_version = row_version + 1 where id = $1`, [id]);
      });
      expect((await itemRow(id)).origin_menu_id).toBe('late');
    });

    it('skips an item row that no longer exists when the deferred trigger fires', async () => {
      const id = randomUUID();
      await inTx(async (c) => {
        await rawInsert(c, id, null);
        await rawTarget(c, id);
        await c.query('delete from improvement.item_target where item_id = $1', [id]);
        await c.query('delete from improvement.item where id = $1', [id]);
      }, migrate.pool);
      expect((await sql('select 1 from improvement.item where id = $1', [id])).rowCount).toBe(0);
    });
  });

  describe('platform_app walls (0094)', () => {
    it.each([
      ['item_no', 'item_no = item_no + 1'],
      ['workspace_id', `workspace_id = '${randomUUID()}'`],
      ['created_by', `created_by = '${randomUUID()}'`],
    ])('refuses UPDATE of %s', async (_col, set) => {
      const item = await make();
      await expect(appSql(`update improvement.item set ${set}, row_version = row_version + 1 where id = $1`, [item.id])).rejects.toMatchObject({ code: '42501' });
    });

    it.each([
      ['delete from improvement.item where id = $1'],
      ['delete from improvement.item_event where item_id = $1'],
      ["update improvement.item_event set reason = 'x' where item_id = $1"],
      ["update improvement.item_target set display_name_snapshot = 'x' where item_id = $1"],
    ])('refuses %s', async (statement) => {
      const item = await make({ targets: [EQUIPMENT('W')] });
      await expect(appSql(statement, [item.id])).rejects.toMatchObject({ code: '42501' });
    });

    it('the guard trigger refuses an update without the row_version bump, with a jump, and an illegal status pair', async () => {
      const item = await make();
      await expect(appSql(`update improvement.item set problem = 'p' where id = $1`, [item.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('row_version') });
      await expect(appSql(`update improvement.item set problem = 'p', row_version = row_version + 2 where id = $1`, [item.id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql(`update improvement.item set status = 'done', row_version = row_version + 1 where id = $1`, [item.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('cannot move') });
      await expect(appSql(`update improvement.item set problem = 'p', row_version = row_version + 1 where id = $1`, [item.id])).resolves.toMatchObject({ rowCount: 1 });
    });

    it('the guard also stops the migrate role from changing identity columns', async () => {
      const item = await make();
      await expect(sql(`update improvement.item set item_no = item_no + 1000, row_version = row_version + 1 where id = $1`, [item.id])).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('audit projection (0094)', () => {
    it('lists the improvement events with their platform actions, and still lists voc.read_public and knowledge.spec.publish rows', async () => {
      const item = await make();
      await act('itemAssign', { itemId: item.id, assigneeId: colleague.id }, { expectedVersion: item.version });
      const probe = async (capability: string) => {
        const subject = randomUUID();
        await sql(
          `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail) values ($1,$2,'permission_granted','permission_grant',$3,'probe',$4::jsonb)`,
          [WORKSPACE_ID, admin.id, subject, JSON.stringify({ capability })],
        );
        return subject;
      };
      const probes = [await probe('voc.read_public'), await probe('knowledge.spec.publish'), await probe('improvement.manage')];
      const { rows } = await dbHandle.pool.query(
        `select event_type, subject_type, subject_id from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = any($3)`,
        [WORKSPACE_ID, JSON.stringify(AUDIT_ACTION_BY_EVENT_TYPE), [item.id, ...probes]],
      );
      const mine = rows.filter((r) => r.subject_id === item.id);
      expect(new Set(mine.map((r) => r.subject_type))).toEqual(new Set(['improvement_item']));
      expect(new Set(mine.map((r) => r.event_type))).toEqual(new Set(['improvement.item.created', 'improvement.item.assigned']));
      for (const subject of probes) expect(rows.filter((r) => r.subject_id === subject), subject).toHaveLength(1);
    });
  });
});
