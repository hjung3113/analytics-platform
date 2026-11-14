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
const tag = `ROOMMASK${randomUUID()}`;
const target = { kind: 'equipment', externalKey: 'PRIVATE-EQ', displayName: 'PRIVATE-NAME' };

type Item = { id: string; restricted?: boolean; origin: { context: object } | null; targets: typeof target[]; effectCompareLink: string | null; problem: string };
describe.skipIf(!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATE || !workspace)('improvement room Scope masking (#2076 FIX2)', () => {
  let app: FastifyInstance, db: DbHandle, migrate: DbHandle;
  let actorId = '', cookie = '';
  const ids: string[] = [];
  const query = async (endpoint: string, params: object) => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: `improvement.${endpoint}`, context: {}, params } });
    expect(res.statusCode).toBe(200);
    return res.json<{ outcome: string; data: Item & { rows: Item[]; total: number } }>();
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(process.env.DATABASE_URL ?? ''); migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    app = await buildServer({ config: loadConfig(), dbHandle: db, scopeCatalog: parseScopeCatalog([{ site: 'A', label: 'A', rooms: ['PHOTO', 'ETCH'] }, { site: 'B', label: 'B', rooms: ['PHOTO', 'ETCH'] }]) });
    await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: workspace, externalId: tag, roleLevel: 'user' })).id;
    await migrate.pool.query(`insert into permission.permission_grants (workspace_id,actor_id,capability,scope_kind,scope_site,scope_room,granted_by_actor_id) values ($1,$2,'scope.read','site_room','A','PHOTO',$2)`, [workspace, actorId]);
    cookie = await loginAs(app, tag);
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
  it.each([
    [['PHOTO'], ['PHOTO'], false, false],
    [['ETCH'], ['PHOTO'], true, true],
    [['PHOTO', 'ETCH'], ['PHOTO'], true, true],
    [undefined, undefined, false, false],
    [[], [], false, false],
    [['PHOTO'], ['ETCH'], false, true],
    [['PHOTO'], ['PHOTO', 'ETCH'], false, true],
  ])('projects origin rooms %j and link rooms %j for a PHOTO-only reader', async (rooms, linkRooms, restricted, linkRestricted) => {
    const id = randomUUID(); ids.push(id);
    const context = { scopeId: 'A', ...(rooms ? { roomNames: rooms } : {}), selection: ['PRIVATE-EQ'] };
    const link = `/mars/cycle-time?scopeId=A${(linkRooms ?? []).map(room => `&roomNames=${room}`).join('')}&selection=PRIVATE-EQ`;
    const snapshot = { origin: { menuId: 'cycle-time', context }, targets: [target], effect: { compareLink: link }, effectCompareLink: link };
    await migrate.pool.query(`insert into improvement.item (id,workspace_id,item_no,problem,origin_menu_id,origin_context,effect_result,effect_compare_link,created_by,updated_by) values ($1,$2,$3,$4,'cycle-time',$5,'effective',$6,$7,$7)`, [id, workspace, 900000 + ids.length, tag, context, link, actorId]);
    await migrate.pool.query(`insert into improvement.item_target (workspace_id,item_id,kind,external_key,display_name_snapshot) values ($1,$2,'equipment','PRIVATE-EQ','PRIVATE-NAME')`, [workspace, id]);
    await migrate.pool.query(`insert into improvement.item_event (workspace_id,item_id,actor_id,event_type,changes) values ($1,$2,$3,'updated',$4)`, [workspace, id, actorId, { before: snapshot, after: snapshot }]);
    const detail = (await query('itemDetail', { itemId: id })).data;
    const listed = (await query('items', { q: tag })).data.rows.find(row => row.id === id);
    for (const row of [detail, listed]) {
      expect(row).toMatchObject({ targets: [{ externalKey: restricted ? '' : 'PRIVATE-EQ' }], effectCompareLink: linkRestricted ? null : link });
      expect(row?.restricted).toBe(restricted ? true : undefined);
      expect(row?.origin?.context).toEqual(restricted ? {} : context);
    }
    const history = JSON.stringify((await query('itemEvents', { itemId: id })).data);
    expect(history.includes('PRIVATE-EQ')).toBe(!restricted);
    expect(history.includes(link)).toBe(!linkRestricted);
  });
});
