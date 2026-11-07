// #1328 a — improvement item schema invariants (migration 0093), the number counter and the three reads, against a
// real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). App as platform_app,
// fixtures as platform_migrate. The real `buildServer` over `app.inject`.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { allocateImprovementItemNo } from '../repositories/item-number.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IMP${randomUUID().slice(0, 6).toUpperCase()}`;

interface Answer {
  outcome: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  message?: string;
}

describe.skipIf(!runIntegration)('improvement items schema and reads (#1328 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let cookie = '';
  let actorId = '';
  let otherActorId = '';
  let other = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const ids: Record<string, string> = {};
  let nextNo = 90_000;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);

  /** Inserts one item as platform_migrate; `cols` override the minimal valid row. */
  const insertItem = async (cols: Record<string, unknown> = {}, workspace = WORKSPACE_ID): Promise<string> => {
    const row: Record<string, unknown> = {
      workspace_id: workspace,
      item_no: (nextNo += 1),
      problem: `schema case ${TAG.toLowerCase()}`,
      created_by: actorId,
      updated_by: actorId,
      // Migration 0094 enforces origin-or-target at commit, so the minimal valid row carries an origin.
      origin_menu_id: 'schema-test',
      origin_context: '{}',
      ...cols,
    };
    const keys = Object.keys(row);
    const res = await sql(
      `insert into improvement.item (${keys.join(',')}) values (${keys.map((_, n) => `$${n + 1}`).join(',')}) returning id`,
      Object.values(row),
    );
    return res.rows[0].id as string;
  };
  const insertTarget = (item: string, kind: string, key: string, name = key, workspace = WORKSPACE_ID) =>
    sql(
      `insert into improvement.item_target (workspace_id,item_id,kind,external_key,display_name_snapshot) values ($1,$2,$3,$4,$5)`,
      [workspace, item, kind, key, name],
    );
  const insertEvent = (item: string, type: string, at: string, extra: { workspace?: string; changes?: string; reason?: string } = {}) =>
    sql(
      `insert into improvement.item_event (workspace_id,item_id,actor_id,event_type,occurred_at,changes,reason) values ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [extra.workspace ?? WORKSPACE_ID, item, actorId, type, at, extra.changes ?? '{}', extra.reason ?? null],
    );

  const query = (endpoint: string, params: Record<string, unknown>, who: string | null = cookie) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...(who ? { cookie: `${SESSION_COOKIE_NAME}=${who}` } : {}) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
  const read = async (endpoint: string, params: Record<string, unknown> = {}): Promise<Answer> => {
    const res = await query(endpoint, params);
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  };
  const flt = (id: string, op: string, value?: unknown[]) => (value === undefined ? { id, op } : { id, op, value });
  const list = (filters: unknown[] = [], extra: Record<string, unknown> = {}) =>
    read('improvement.items', { q: TAG, filters, ...extra });
  const problems = (a: Answer) => (a.data.rows as { problem: string }[]).map((r) => r.problem);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const externalId = `${TAG}-admin`;
    actorId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' })).id;
    otherActorId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId: `${TAG}-dev`, roleLevel: 'developer' })).id;
    actorIds.push(actorId, otherActorId);
    cookie = await loginAs(app, externalId);
    other = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(other);

    // Read fixtures: numbers come from the real allocator.
    const fixture = async (key: string, cols: Record<string, unknown>) => {
      ids[key] = await insertItem({ item_no: await allocateImprovementItemNo(dbHandle.db, WORKSPACE_ID), ...cols });
    };
    await fixture('a1', {
      problem: `${TAG} alpha wafer`,
      assignee_id: actorId,
      quest_id: 'Q-1',
      quest_title_snapshot: 'Quest one',
      origin_menu_id: 'mars-trend',
      origin_context: JSON.stringify({ metric: 'yield', equipment: 'EQ-1' }),
      created_at: '2026-01-01T00:00:00Z',
    });
    await fixture('a2', {
      problem: `${TAG} beta 100%_wide`,
      status: 'in_progress',
      action: 'recalibrate the chamber',
      created_at: '2026-01-02T00:00:00Z',
    });
    await fixture('a3', {
      problem: `${TAG} gamma`,
      status: 'done',
      action: 'swap the filter',
      action_date: '2026-02-03',
      assignee_id: otherActorId,
      quest_id: 'Q-2',
      quest_title_snapshot: 'Quest two',
      created_at: '2026-01-03T00:00:00Z',
    });
    await fixture('a4', {
      problem: `${TAG} delta`,
      status: 'verified',
      action: 'tighten the recipe',
      action_date: '2026-02-04',
      effect_result: 'effective',
      effect_note: 'yield recovered',
      effect_compare_link: '/mars/compare?from=2026-02-04',
      created_at: '2026-01-03T00:00:00Z',
    });
    await fixture('a5', {
      problem: `${TAG} epsilon`,
      status: 'dropped',
      drop_reason: 'duplicate of alpha',
      created_at: '2026-01-04T00:00:00Z',
    });
    ids.foreign = await insertItem(
      { item_no: await allocateImprovementItemNo(dbHandle.db, other), problem: `${TAG} foreign` },
      other,
    );
    await insertTarget(ids.a1 as string, 'equipment', 'EQ-1', 'Etcher 1');
    await insertTarget(ids.a2 as string, 'equipment', 'EQ-1', 'Etcher 1');
    await insertTarget(ids.a2 as string, 'process', 'CVD', 'Deposition');
    await insertTarget(ids.foreign as string, 'equipment', 'EQ-1', 'Etcher 1', other);
    await insertEvent(ids.a1 as string, 'created', '2026-03-01T00:00:00Z');
    await insertEvent(ids.a1 as string, 'updated', '2026-03-02T00:00:00Z', { changes: '{"before":{"action":null},"after":{"action":"x"}}', reason: 'why' });
    await insertEvent(ids.a1 as string, 'assigned', '2026-03-02T00:00:00Z');
    await insertEvent(ids.a1 as string, 'status_changed', '2026-03-03T00:00:00Z');
    await insertEvent(ids.foreign as string, 'created', '2026-03-01T00:00:00Z', { workspace: other });
  }, 60_000);

  afterAll(async () => {
    const mine = 'item_id in (select id from improvement.item where created_by = any($1))';
    await sql(`delete from improvement.item_event where ${mine}`, [actorIds]);
    await sql(`delete from improvement.item_target where ${mine}`, [actorIds]);
    await sql('delete from improvement.item where created_by = any($1)', [actorIds]);
    await sql('delete from improvement.item_counter where workspace_id = any($1)', [workspaceIds]);
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
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('schema invariants (migrations 0093, 0099)', () => {
    const FULL = { action: 'did it', action_date: '2026-02-03' };
    it.each([
      ['done without action_date', { status: 'done', action: 'x' }, 'improvement_item_action_date_required_check'],
      ['verified without effect_result', { status: 'verified', ...FULL }, 'improvement_item_verified_effect_check'],
      ['verified without action_date', { status: 'verified', action: 'x', effect_result: 'effective' }, 'improvement_item_action_date_required_check'],
      ['verified without action', { status: 'verified', action_date: '2026-02-03', effect_result: 'effective' }, 'improvement_item_action_required_check'],
      ['done with a blank action', { status: 'done', action: '  ', action_date: '2026-02-03' }, 'improvement_item_action_required_check'],
      ['dropped without drop_reason', { status: 'dropped' }, 'improvement_item_dropped_reason_check'],
      ['dropped with a blank drop_reason', { status: 'dropped', drop_reason: ' ' }, 'improvement_item_dropped_reason_check'],
      ['in_progress without action', { status: 'in_progress' }, 'improvement_item_action_required_check'],
      ['a quest id without a title', { quest_id: 'Q-9' }, 'improvement_item_quest_pair_check'],
      ['a quest title without an id', { quest_title_snapshot: 'T' }, 'improvement_item_quest_pair_check'],
      ['an origin menu without a context', { origin_menu_id: 'm', origin_context: null }, 'improvement_item_origin_pair_check'],
      ['an origin context without a menu', { origin_menu_id: null, origin_context: '{}' }, 'improvement_item_origin_pair_check'],
      ['an origin context that is not an object', { origin_menu_id: 'm', origin_context: '[1]' }, 'improvement_item_origin_context_check'],
      ['an effect note without a result', { effect_note: 'n' }, 'improvement_item_effect_detail_check'],
      ['a compare link without a result', { effect_compare_link: '/a' }, 'improvement_item_effect_detail_check'],
      ['an absolute compare link', { effect_result: 'effective', effect_compare_link: 'https://evil.example/x' }, 'improvement_item_effect_compare_link_check'],
      ['a protocol-relative compare link', { effect_result: 'effective', effect_compare_link: '//evil.example/x' }, 'improvement_item_effect_compare_link_check'],
      ['a compare link with a backslash', { effect_result: 'effective', effect_compare_link: '/\\evil.example' }, 'improvement_item_effect_compare_link_check'],
      ['a compare link with a tab that would fold into //', { effect_result: 'effective', effect_compare_link: '/\t/evil.example' }, 'improvement_item_effect_compare_link_check'],
      ['a compare link with a newline', { effect_result: 'effective', effect_compare_link: '/a\nb' }, 'improvement_item_effect_compare_link_check'],
      ['a compare link with DEL', { effect_result: 'effective', effect_compare_link: '/a\u007fb' }, 'improvement_item_effect_compare_link_check'],
      ['a compare link over 2000', { effect_result: 'effective', effect_compare_link: `/${'a'.repeat(2000)}` }, 'improvement_item_effect_compare_link_check'],
      ['an unknown status', { status: 'closed' }, 'improvement_item_status_check'],
      ['an unknown effect result', { effect_result: 'great' }, 'improvement_item_effect_result_check'],
      ['a blank problem', { problem: '   ' }, 'improvement_item_problem_check'],
      ['a problem over 500', { problem: 'p'.repeat(501) }, 'improvement_item_problem_check'],
      ['an action over 2000', { action: 'a'.repeat(2001) }, 'improvement_item_action_check'],
      ['an effect note over 2000', { effect_result: 'effective', effect_note: 'n'.repeat(2001) }, 'improvement_item_effect_note_check'],
      ['a drop reason over 2000', { status: 'dropped', drop_reason: 'r'.repeat(2001) }, 'improvement_item_drop_reason_check'],
      ['a quest id over 200', { quest_id: 'q'.repeat(201), quest_title_snapshot: 't' }, 'improvement_item_quest_text_check'],
      ['an origin menu over 200', { origin_menu_id: 'm'.repeat(201), origin_context: '{}' }, 'improvement_item_origin_menu_check'],
      ['item number 0', { item_no: 0 }, 'improvement_item_item_no_check'],
      ['row_version 0', { row_version: 0 }, 'improvement_item_row_version_check'],
    ])('refuses %s', async (_name, cols, constraint) => {
      await expect(insertItem(cols)).rejects.toMatchObject({ constraint });
    });

    it('accepts every legal status shape, a reopened row that keeps its effect data, and a relative link', async () => {
      await expect(insertItem({ status: 'open' })).resolves.toBeTruthy();
      await expect(insertItem({ status: 'in_progress', action: 'x' })).resolves.toBeTruthy();
      await expect(insertItem({ status: 'done', ...FULL })).resolves.toBeTruthy();
      await expect(
        insertItem({ status: 'verified', ...FULL, effect_result: 'inconclusive', effect_note: 'n', effect_compare_link: '/mars?a=1' }),
      ).resolves.toBeTruthy();
      await expect(insertItem({ status: 'dropped', drop_reason: 'duplicate' })).resolves.toBeTruthy();
      await expect(
        insertItem({ status: 'in_progress', action: 'x', effect_result: 'ineffective', effect_note: 'kept', drop_reason: 'kept' }),
      ).resolves.toBeTruthy();
      await expect(insertItem({ quest_id: 'Q-9', quest_title_snapshot: 'T', origin_menu_id: 'm', origin_context: '{}' })).resolves.toBeTruthy();
    });

    it('keeps action_date a calendar day', async () => {
      const id = await insertItem({ status: 'done', action: 'x', action_date: '2026-02-03' });
      const res = await sql(`select action_date::text as d from improvement.item where id = $1`, [id]);
      expect(res.rows[0].d).toBe('2026-02-03');
    });

    it('refuses a duplicate number inside a workspace but allows it across workspaces', async () => {
      const no = 77_001;
      await insertItem({ item_no: no });
      await expect(insertItem({ item_no: no })).rejects.toMatchObject({ constraint: 'improvement_item_workspace_item_no_uq' });
      await expect(insertItem({ item_no: no }, other)).resolves.toBeTruthy();
    });

    it.each([
      ['an unknown target kind', { kind: 'line', key: 'L1' }, 'improvement_item_target_kind_check'],
      ['a blank external key', { kind: 'equipment', key: '  ' }, 'improvement_item_target_key_check'],
      ['an external key over 200', { kind: 'equipment', key: 'k'.repeat(201) }, 'improvement_item_target_key_check'],
      ['a display name over 200', { kind: 'equipment', key: 'K', name: 'n'.repeat(201) }, 'improvement_item_target_name_check'],
    ])('refuses a target with %s', async (_name, t, constraint) => {
      await expect(insertTarget(ids.a3 as string, t.kind, t.key, (t as { name?: string }).name ?? 'n')).rejects.toMatchObject({ constraint });
    });

    it('refuses the same target twice on one item', async () => {
      await expect(insertTarget(ids.a1 as string, 'equipment', 'EQ-1')).rejects.toMatchObject({
        constraint: 'improvement_item_target_item_kind_key_uq',
      });
    });

    it.each([
      ['an unknown event type', 'rewound', '{}', 'improvement_item_event_type_check'],
      ['changes that are not an object', 'updated', '[1]', 'improvement_item_event_changes_check'],
    ])('refuses an event with %s', async (_name, type, changes, constraint) => {
      await expect(insertEvent(ids.a3 as string, type, '2026-03-01T00:00:00Z', { changes })).rejects.toMatchObject({ constraint });
    });

    it('refuses an event reason over 2000', async () => {
      await expect(
        insertEvent(ids.a3 as string, 'updated', '2026-03-01T00:00:00Z', { reason: 'r'.repeat(2001) }),
      ).rejects.toMatchObject({ constraint: 'improvement_item_event_reason_check' });
    });

    it('refuses a target or an event whose item is in another workspace (composite foreign keys)', async () => {
      await expect(insertTarget(ids.a3 as string, 'equipment', 'XW', 'x', other)).rejects.toMatchObject({
        constraint: 'improvement_item_target_item_fk',
      });
      await expect(insertEvent(ids.a3 as string, 'created', '2026-03-01T00:00:00Z', { workspace: other })).rejects.toMatchObject({
        constraint: 'improvement_item_event_item_fk',
      });
    });

    it('refuses to delete an item that has targets or events (ON DELETE RESTRICT)', async () => {
      await expect(sql('delete from improvement.item where id = $1', [ids.a1])).rejects.toMatchObject({ code: '23503' });
    });

    it('numbers events in a strictly increasing seq the caller cannot choose', async () => {
      const res = await sql('select seq from improvement.item_event where item_id = $1 order by seq', [ids.a1]);
      const seqs = res.rows.map((r) => Number(r.seq));
      expect(seqs.length).toBe(4);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(new Set(seqs).size).toBe(4);
      await expect(
        sql(`insert into improvement.item_event (seq,workspace_id,item_id,actor_id,event_type) values (1,$1,$2,$3,'created')`, [WORKSPACE_ID, ids.a1, actorId]),
      ).rejects.toMatchObject({ code: '428C9' });
    });
  });

  describe('platform_app grants', () => {
    it('can read the three data tables and the counter', async () => {
      for (const table of ['item', 'item_target', 'item_event', 'item_counter']) {
        await expect(appSql(`select count(*) from improvement.${table}`)).resolves.toBeTruthy();
      }
    });

    // Node b (0094) grants INSERT and the column-limited writes; what stays refused is below (and in improvement-items-writes).
    it.each([
      ['delete from improvement.item where workspace_id = $1'],
      ['update improvement.item_target set external_key = $2 where workspace_id = $1'],
      ['update improvement.item_event set reason = $2 where workspace_id = $1'],
      ['delete from improvement.item_event where workspace_id = $1'],
      ['delete from improvement.item_counter where workspace_id = $1'],
    ])('refuses writes with a permission error: %s', async (statement) => {
      const params = statement.includes('$3') ? [WORKSPACE_ID, 'x', actorId] : statement.includes('$2') ? [WORKSPACE_ID, 'x'] : [WORKSPACE_ID];
      await expect(appSql(statement, params)).rejects.toMatchObject({ code: '42501' });
    });

    it('can move last_item_no on the counter and nothing else', async () => {
      const fresh = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-grant`])).rows[0].id as string;
      workspaceIds.push(fresh);
      await allocateImprovementItemNo(dbHandle.db, fresh);
      await expect(appSql('update improvement.item_counter set last_item_no = last_item_no + 1 where workspace_id = $1', [fresh])).resolves.toMatchObject({ rowCount: 1 });
      await expect(appSql('update improvement.item_counter set workspace_id = $2 where workspace_id = $1', [fresh, WORKSPACE_ID])).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('item number allocation', () => {
    const workspace = async (name: string) => {
      const id = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-${name}`])).rows[0].id as string;
      workspaceIds.push(id);
      return id;
    };

    it('gives 12 parallel allocations distinct consecutive numbers, including the first of a workspace', async () => {
      const fresh = await workspace('alloc');
      const numbers = await Promise.all(
        Array.from({ length: 12 }, () => dbHandle.db.transaction((tx) => allocateImprovementItemNo(tx, fresh))),
      );
      expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, n) => n + 1));
      expect(await allocateImprovementItemNo(dbHandle.db, fresh)).toBe(13);
    });

    it('a rolled-back allocation leaves no gap', async () => {
      const fresh = await workspace('alloc2');
      await expect(
        dbHandle.db.transaction(async (tx) => {
          await allocateImprovementItemNo(tx, fresh);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await allocateImprovementItemNo(dbHandle.db, fresh)).toBe(1);
    });

    it('counts each workspace on its own', async () => {
      const a = await workspace('alloc3');
      const b = await workspace('alloc4');
      expect(await allocateImprovementItemNo(dbHandle.db, a)).toBe(1);
      expect(await allocateImprovementItemNo(dbHandle.db, a)).toBe(2);
      expect(await allocateImprovementItemNo(dbHandle.db, b)).toBe(1);
    });
  });

  describe('improvement.items', () => {
    // The schema-invariant tests above insert valid scratch items into this workspace; the list assertions count only the read fixtures.
    beforeAll(async () => {
      const keep = Object.values(ids);
      const scratch = `select id from improvement.item where workspace_id = $1 and id <> all($2::uuid[])`;
      await sql(`delete from improvement.item_event where workspace_id = $1 and item_id in (${scratch})`, [WORKSPACE_ID, keep]);
      await sql(`delete from improvement.item_target where workspace_id = $1 and item_id in (${scratch})`, [WORKSPACE_ID, keep]);
      await sql(`delete from improvement.item where workspace_id = $1 and id <> all($2::uuid[])`, [WORKSPACE_ID, keep]);
    });

    it('lists the workspace newest first, with the item number as the tie-break, and never another workspace', async () => {
      const all = await list();
      expect(all.outcome).toBe('ok');
      expect(problems(all)).not.toContain(`${TAG} foreign`);
      expect(all.data.total).toBe(5);
      // a3 and a4 share created_at: the higher item number comes first.
      expect(problems(all)).toEqual([
        `${TAG} epsilon`,
        `${TAG} delta`,
        `${TAG} gamma`,
        `${TAG} beta 100%_wide`,
        `${TAG} alpha wafer`,
      ]);
    });

    it('sorts by item number ascending when asked, keeping the order total', async () => {
      const asc = await list([], { sorting: [{ id: 'itemNo', desc: false }] });
      const nos = (asc.data.rows as { itemNo: number }[]).map((r) => r.itemNo);
      expect(nos).toEqual([...nos].sort((a, b) => a - b));
    });

    it('returns the full row: assignee name, quest, origin, targets, effect and version', async () => {
      const all = await list();
      const a1 = (all.data.rows as any[]).find((r) => r.id === ids.a1); // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON
      expect(a1).toMatchObject({
        status: 'open',
        assignee: { id: actorId },
        quest: { id: 'Q-1', titleSnapshot: 'Quest one' },
        origin: { menuId: 'mars-trend', context: { metric: 'yield', equipment: 'EQ-1' } },
        targets: [{ kind: 'equipment', externalKey: 'EQ-1', displayName: 'Etcher 1' }],
        version: '1',
        effectResult: null,
      });
      expect(a1.assignee.displayName).not.toBe('');
      const a4 = (all.data.rows as any[]).find((r) => r.id === ids.a4); // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON
      expect(a4).toMatchObject({ actionDate: '2026-02-04', effectResult: 'effective', effectCompareLink: '/mars/compare?from=2026-02-04', assignee: null, quest: null, origin: { menuId: 'schema-test', context: {} } });
    });

    it('filters by status (in and notIn)', async () => {
      expect(problems(await list([flt('status', 'in', ['open', 'done'])])).sort()).toEqual([`${TAG} alpha wafer`, `${TAG} gamma`].sort());
      expect((await list([flt('status', 'notIn', ['open', 'done', 'dropped'])])).data.total).toBe(2);
    });

    it('filters by assignee: uuid, me, notIn, isEmpty and isNotEmpty', async () => {
      expect(problems(await list([flt('assignee', 'in', [otherActorId])]))).toEqual([`${TAG} gamma`]);
      expect(problems(await list([flt('assignee', 'in', ['me'])]))).toEqual([`${TAG} alpha wafer`]);
      expect(problems(await list([flt('assignee', 'notIn', ['me'])]))).toEqual([`${TAG} gamma`]);
      expect((await list([flt('assignee', 'isEmpty')])).data.total).toBe(3);
      expect((await list([flt('assignee', 'isNotEmpty')])).data.total).toBe(2);
    });

    it('resolves me to the signed-in actor, not to a param', async () => {
      const dev = await loginAs(app, `${TAG}-dev`);
      const res = await query('improvement.items', { q: TAG, filters: [flt('assignee', 'in', ['me'])] }, dev);
      expect(problems(res.json<Answer>())).toEqual([`${TAG} gamma`]);
    });

    it('filters by questId, questLinked and origin', async () => {
      expect(problems(await list([flt('questId', 'in', ['Q-2'])]))).toEqual([`${TAG} gamma`]);
      expect(problems(await list([flt('questId', 'notIn', ['Q-2'])]))).toEqual([`${TAG} alpha wafer`]);
      expect((await list([flt('questLinked', 'in', ['true'])])).data.total).toBe(2);
      expect((await list([flt('questLinked', 'in', ['false'])])).data.total).toBe(3);
      expect(problems(await list([flt('origin', 'in', ['mars-trend'])]))).toEqual([`${TAG} alpha wafer`]);
      expect((await list([flt('origin', 'in', ['nothing'])])).data.total).toBe(0);
    });

    it('filters by target kind and key together, and refuses one without the other', async () => {
      expect(problems(await list([], { targetKind: 'equipment', targetKey: 'EQ-1' })).sort()).toEqual(
        [`${TAG} alpha wafer`, `${TAG} beta 100%_wide`].sort(),
      );
      expect(problems(await list([], { targetKind: 'process', targetKey: 'CVD' }))).toEqual([`${TAG} beta 100%_wide`]);
      expect((await list([], { targetKind: 'process', targetKey: 'EQ-1' })).data.total).toBe(0);
      expect((await read('improvement.items', { q: TAG, targetKind: 'process' })).outcome).toBe('error');
    });

    it('searches problem and action, treating LIKE wildcards as text', async () => {
      expect(problems(await read('improvement.items', { q: `${TAG} gamma` }))).toEqual([`${TAG} gamma`]);
      expect(problems(await read('improvement.items', { q: 'recalibrate the chamber' }))).toEqual([`${TAG} beta 100%_wide`]);
      expect(problems(await read('improvement.items', { q: `${TAG} beta 100%_` }))).toEqual([`${TAG} beta 100%_wide`]);
      expect((await read('improvement.items', { q: `${TAG} %` })).data.total).toBe(0);
    });

    it('combines filters with AND and keeps the total across pages', async () => {
      expect(problems(await list([flt('status', 'in', ['open', 'in_progress']), flt('questLinked', 'in', ['false'])]))).toEqual([`${TAG} beta 100%_wide`]);
      const first = await list([], { pageSize: 2, page: 0 });
      const last = await list([], { pageSize: 2, page: 2 });
      const beyond = await list([], { pageSize: 2, page: 3 });
      expect([first.data.total, first.data.rows.length, last.data.rows.length, beyond.data.rows.length]).toEqual([5, 2, 1, 0]);
      expect(beyond.data.total).toBe(5);
      const seen = [...first.data.rows, ...(await list([], { pageSize: 2, page: 1 })).data.rows, ...last.data.rows].map((r: { id: string }) => r.id);
      expect(new Set(seen).size).toBe(5);
    });

    it.each([
      ['an unknown filter field', { filters: [flt('problem', 'in', ['x'])] }],
      ['an unknown status', { filters: [flt('status', 'in', ['closed'])] }],
      ['a page size over the cap', { pageSize: 201 }],
      ['a sort by a hidden column', { sorting: [{ id: 'problem', desc: true }] }],
      ['a target kind outside the list', { targetKind: 'line', targetKey: 'L1' }],
    ])('answers %s with an error outcome, not ok', async (_name, params) => {
      const res = await query('improvement.items', params);
      expect(res.statusCode).toBe(200);
      expect(res.json<Answer>().outcome).toBe('error');
    });

    it('answers 401 without a session', async () => {
      expect((await query('improvement.items', {}, null)).statusCode).toBe(401);
    });
  });

  describe('improvement.itemDetail', () => {
    it('reads one item with its targets by id and by number, IM-<n> included', async () => {
      const byId = await read('improvement.itemDetail', { itemId: ids.a2 });
      expect(byId.outcome).toBe('ok');
      expect(byId.data).toMatchObject({
        id: ids.a2,
        problem: `${TAG} beta 100%_wide`,
        action: 'recalibrate the chamber',
        targets: [
          { kind: 'equipment', externalKey: 'EQ-1' },
          { kind: 'process', externalKey: 'CVD', displayName: 'Deposition' },
        ],
      });
      const no = byId.data.itemNo as number;
      expect((await read('improvement.itemDetail', { itemNo: no })).data.id).toBe(ids.a2);
      expect((await read('improvement.itemDetail', { itemNo: `IM-${no}` })).data.id).toBe(ids.a2);
    });

    it('answers ok with null for an unknown id, and for another workspace\'s item by id or number', async () => {
      expect(await read('improvement.itemDetail', { itemId: randomUUID() })).toMatchObject({ outcome: 'ok', data: null });
      expect(await read('improvement.itemDetail', { itemId: ids.foreign })).toMatchObject({ outcome: 'ok', data: null });
      const foreignNo = (await sql('select item_no from improvement.item where id = $1', [ids.foreign])).rows[0].item_no as number;
      const mine = (await sql('select 1 from improvement.item where workspace_id = $1 and item_no = $2', [WORKSPACE_ID, foreignNo])).rowCount;
      if (mine === 0) expect(await read('improvement.itemDetail', { itemNo: foreignNo })).toMatchObject({ outcome: 'ok', data: null });
    });

    it.each([
      ['both itemId and itemNo', () => ({ itemId: ids.a1, itemNo: 1 })],
      ['neither', () => ({})],
      ['a bad number', () => ({ itemNo: 'KI-3' })],
      ['a bad id', () => ({ itemId: 'nope' })],
    ])('answers %s with an error outcome', async (_name, params) => {
      expect((await read('improvement.itemDetail', params())).outcome).toBe('error');
    });
  });

  describe('improvement.itemEvents', () => {
    const events = (extra: Record<string, unknown> = {}) => read('improvement.itemEvents', { itemId: ids.a1, ...extra });
    const types = (a: Answer) => (a.data.rows as { eventType: string }[]).map((r) => r.eventType);

    it('lists newest first by default, ties broken by seq, and carries the change and the actor name', async () => {
      const res = await events();
      expect(types(res)).toEqual(['status_changed', 'assigned', 'updated', 'created']);
      expect(res.data.total).toBe(4);
      const updated = (res.data.rows as any[]).find((r) => r.eventType === 'updated'); // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON
      expect(updated).toMatchObject({ changes: { before: { action: null }, after: { action: 'x' } }, reason: 'why', actor: { id: actorId } });
      expect(updated.actor.displayName).not.toBe('');
    });

    it('reverses with order asc', async () => {
      expect(types(await events({ order: 'asc' }))).toEqual(['created', 'updated', 'assigned', 'status_changed']);
    });

    it('pages and keeps the total', async () => {
      const second = await events({ pageSize: 3, page: 1 });
      expect(types(second)).toEqual(['created']);
      expect(second.data.total).toBe(4);
    });

    it('is empty for an item of another workspace and an error for bad params', async () => {
      expect((await read('improvement.itemEvents', { itemId: ids.foreign })).data).toEqual({ rows: [], total: 0 });
      expect((await events({ order: 'sideways' })).outcome).toBe('error');
      expect((await read('improvement.itemEvents', {})).outcome).toBe('error');
    });
  });
});
