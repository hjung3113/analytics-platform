import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { parseScopeCatalog } from '../../permissions/scope-catalog.js';

const workspace = process.env.WORKSPACE_ID ?? '';
const tag = `MASK${randomUUID()}`;
const target = { kind: 'equipment', externalKey: 'PRIVATE-EQ', displayName: 'PRIVATE-NAME' };
const origin = (site: string) => ({ menuId: 'cycle-time', context: { scopeId: site, selection: ['PRIVATE-EQ'], roomNames: ['PRIVATE-ROOM'], page: { drillEquipment: 'PRIVATE-EQ' } } });
type Item = { id: string; restricted?: boolean; origin: { context: object } | null; targets: typeof target[]; effectCompareLink: string | null; problem: string };
describe.skipIf(!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATE || !workspace)('improvement Scope masking (#2076)', () => {
  let app: FastifyInstance, db: DbHandle, migrate: DbHandle;
  let actorId = '', cookie = '', csrf = '';
  const ids: string[] = [];
  const query = async (endpoint: string, params: object) => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: `improvement.${endpoint}`, context: {}, params } });
    expect(res.statusCode).toBe(200);
    return res.json<{ outcome: string; data: Item & { rows: Item[]; total: number } }>();
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(process.env.DATABASE_URL ?? ''); migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    app = await buildServer({ config: loadConfig(), dbHandle: db, scopeCatalog: parseScopeCatalog([{ site: 'A', label: 'A', rooms: ['PRIVATE-ROOM'] }, { site: 'B', label: 'B', rooms: ['PRIVATE-ROOM'] }]) });
    await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: workspace, externalId: tag, roleLevel: 'admin' })).id;
    await migrate.pool.query(`insert into permission.permission_grants (workspace_id,actor_id,capability,scope_kind,scope_site,granted_by_actor_id) values ($1,$2,'scope.read','site','A',$2)`, [workspace, actorId]);
    cookie = await loginAs(app, tag);
    csrf = (await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } })).json<{ csrfToken: string }>().csrfToken;
    for (const site of ['A', 'B', 'missing', 'no-origin']) {
      const created = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-csrf-token': csrf }, payload: { action: 'improvement.itemCreate', context: {}, input: { problem: `${tag} ${site}`, ...(site === 'no-origin' ? {} : { origin: site === 'missing' ? { menuId: 'cycle-time', context: {} } : origin(site) }), targets: [target, { kind: 'process', externalKey: 'PRIVATE-ROOM', displayName: 'PRIVATE-ROOM' }] }, idempotencyKey: randomUUID() } });
      expect(created.json().outcome, created.body).toBe('ok');
      ids.push(created.json<{ data: { itemId: string } }>().data.itemId);
    }
  });
  afterAll(async () => {
    if (migrate && actorId) {
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        for (const table of ['item_event', 'item_target', 'item']) await client.query(`delete from improvement.${table} where workspace_id=$1 and ${table === 'item' ? 'id' : 'item_id'} = any($2::uuid[])`, [workspace, ids]);
        await client.query('commit');
      } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
      await migrate.pool.query('delete from permission.permission_grants where actor_id=$1', [actorId]);
      await migrate.pool.query('delete from core.audit_log where actor_id=$1', [actorId]);
      await migrate.pool.query('delete from core.idempotency_keys where actor_id=$1', [actorId]);
      await migrate.pool.query('delete from core.sessions where actor_id=$1', [actorId]);
      await migrate.pool.query('delete from core.actors where id=$1', [actorId]);
    }
    await app?.close(); await db?.close(); await migrate?.close();
  });
  it('masks comparison URLs and historical snapshots without mutating stored links', async () => {
    for (const index of [0, 1]) {
      const itemId = ids[index];
      const link = `/mars/cycle-time?scopeId=${index === 0 ? 'A' : 'B'}&selection=PRIVATE-EQ&roomNames=PRIVATE-ROOM`;
      let version = '1';
      for (const input of [{ status: 'in_progress', action: 'repair' }, { status: 'done', actionDate: '2026-11-14' }, { status: 'verified', effect: { result: 'effective', compareLink: link } }]) {
        const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-csrf-token': csrf }, payload: { action: 'improvement.itemSetStatus', context: {}, input: { itemId, ...input }, expectedVersion: version, idempotencyKey: randomUUID() } });
        expect(res.json().outcome, res.body).toBe('ok');
        version = res.json<{ version: string }>().version;
      }
      expect((await query('itemDetail', { itemId })).data.effectCompareLink).toBe(index === 0 ? link : null);
      // Status event changes carry no origin: even a currently granted item cannot prove a historical link's Site.
      expect(JSON.stringify((await query('itemEvents', { itemId })).data)).not.toContain(link);
      expect((await migrate.pool.query('select effect_compare_link from improvement.item where id=$1', [itemId])).rows[0].effect_compare_link).toBe(link);
    }
  });
  it('lists all rows, shows Site A and hides Site B and missing Sites, including home count reads', async () => {
    const res = await query('items', { q: tag });
    expect(res.outcome).toBe('ok'); expect(res.data.total).toBe(4);
    for (const row of res.data.rows) {
      if (row.id === ids[0]) expect(row.targets[0]).toEqual(target);
      else { expect(row.restricted).toBe(true); expect(row.targets.every(t => t.externalKey === '' && t.displayName === '')).toBe(true); expect(row.origin?.context ?? {}).toEqual({}); }
    }
    expect((await query('items', { q: tag, pageSize: 1 })).data.total).toBe(4);
  });
  it.each([0, 1, 2, 3])('detail and event snapshots obey Scope for fixture %s; stored writes remain intact', async index => {
    const id = ids[index];
    const row = (await query('itemDetail', { itemId: id })).data;
    expect(row.restricted).toBe(index === 0 ? undefined : true);
    const history = await query('itemEvents', { itemId: id });
    if (index !== 0) { expect(JSON.stringify(history.data)).not.toContain('PRIVATE-'); expect(row.targets[0]?.externalKey).toBe(''); }
    else { expect(row.targets[0]).toEqual(target); expect(JSON.stringify(history.data)).toContain('PRIVATE-EQ'); }
    const stored = await migrate.pool.query('select external_key from improvement.item_target where item_id=$1 order by kind', [id]);
    expect(stored.rows[0].external_key).toBe('PRIVATE-EQ');
    expect((await migrate.pool.query("select 1 from core.audit_log where actor_id=$1 and event_type='improvement.item.created'", [actorId])).rowCount).toBe(4);
  });
  it.each([0, 1])('masks updated target-only and origin snapshots for fixture %s', async index => {
    const itemId = ids[index];
    const detail = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'improvement.itemDetail', context: {}, params: { itemId } } });
    let version = detail.json<{ data: { version: string } }>().data.version;
    for (const patch of [{ targets: [{ ...target, externalKey: 'PRIVATE-UPDATED' }] }, { origin: origin(index === 0 ? 'B' : 'A') }]) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-csrf-token': csrf }, payload: { action: 'improvement.itemUpdate', context: {}, input: { itemId, ...patch }, expectedVersion: version, idempotencyKey: randomUUID() } });
      expect(res.json().outcome, res.body).toBe('ok');
      version = res.json<{ version: string }>().version;
    }
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: 'improvement.itemEvents', context: {}, params: { itemId } } });
    expect(res.statusCode).toBe(200);
    const updates = res.json<{ data: { rows: { eventType: string; changes: { before: Record<string, unknown>; after: Record<string, unknown> } }[] } }>().data.rows.filter(row => row.eventType === 'updated');
    expect(updates).toHaveLength(2);
    for (const event of updates) {
      for (const [key, snapshot] of Object.entries(event.changes)) {
        if ('targets' in snapshot) {
          expect(snapshot).toMatchObject({ restricted: true, targets: expect.arrayContaining([{ kind: 'equipment', externalKey: '', displayName: '' }]) });
          expect(JSON.stringify(snapshot)).not.toContain('PRIVATE-');
        } else {
          const visible = (index === 0) === (key === 'before');
          expect(snapshot.origin).toEqual(visible ? origin('A') : { menuId: 'cycle-time', context: {}, restricted: true });
        }
      }
    }
  });
});
