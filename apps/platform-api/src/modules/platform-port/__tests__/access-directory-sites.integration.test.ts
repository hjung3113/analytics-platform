// #2015 — the access directory reports each member's site/room grants from `permission.permission_grants`
// (`SiteGrant` per catalog site, zero-grant sites included, catalog order). Route-level against a real
// Postgres (throwaway DB only); every assertion is scoped to the actors this suite created.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { insertScopePermissionRow } from '../../../test-support/permissions-fixtures.js';
import { parseScopeCatalog } from '../../permissions/scope-catalog.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-2015-sites');

// Catalog order deliberately differs from alphabetical room order (RA2 before RA1).
const catalog = parseScopeCatalog([
  { site: 'SITE-A', label: 'Site A', rooms: ['RA2', 'RA1'] },
  { site: 'SITE-B', label: 'Site B', rooms: ['RB1'] },
  { site: 'SITE-C', label: 'Site C', rooms: ['RC1', 'RC2', 'RC3'] },
]);

type SiteGrant = { id: string; label: string; grantedRooms: string[]; totalRooms: number };
type Row = { id: string; sites: SiteGrant[] };
type Envelope = { outcome: string; data: { items: Row[]; total: number } | null };
type Person = { id: string; cookie: string };

describe.skipIf(!runIntegration)('access directory site grants (#2015)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let plainApp: FastifyInstance;
  const actorIds: string[] = [];
  let n = 0;
  let admin: Person;
  let wide: Person; // whole SITE-A, one SITE-C room, plus out-of-catalog values
  let narrow: Person; // one active room; revoked, expired and superseded grants
  let none: Person;

  async function newPerson(roleLevel: 'admin' | 'user'): Promise<Person> {
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `${PREFIX}-${roleLevel}-${n++}`,
      roleLevel,
      displayName: `${PREFIX} ${n}`,
    });
    actorIds.push(id);
    const cookie = randomUUID();
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, id, WORKSPACE_ID],
    );
    return { id, cookie };
  }
  const grant = (actorId: string, kind: 'site' | 'site_room', site: string, room: string | null = null) =>
    insertScopePermissionRow(migrateHandle, { table: 'permission_grants', workspaceId: WORKSPACE_ID, actorId, kind, site, room });

  const list = async (server: FastifyInstance, query: Record<string, unknown>): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let page = 1; ; page++) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/platform/access-directory/search',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
        payload: { pageSize: 100, page, ...query },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<Envelope>();
      expect(body.outcome).toBe('ok');
      const items = body.data?.items ?? [];
      rows.push(...items);
      if (items.length === 0 || rows.length >= (body.data?.total ?? 0)) break;
    }
    const mine = new Set(actorIds);
    return rows.filter((r) => mine.has(r.id));
  };
  const sitesOf = (rows: Row[], who: Person) => rows.find((r) => r.id === who.id)?.sites;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, scopeCatalog: catalog });
    await app.ready();
    plainApp = await buildServer({ config: loadConfig(), dbHandle });
    await plainApp.ready();

    admin = await newPerson('admin');
    wide = await newPerson('user');
    narrow = await newPerson('user');
    none = await newPerson('user');

    await grant(wide.id, 'site', 'SITE-A');
    await grant(wide.id, 'site_room', 'SITE-C', 'RC2');
    await grant(wide.id, 'site_room', 'SITE-C', 'RC9'); // room outside the catalog: dropped
    await grant(wide.id, 'site', 'SITE-Z'); // site outside the catalog: dropped

    await grant(narrow.id, 'site_room', 'SITE-B', 'RB1');
    const revoked = await grant(narrow.id, 'site', 'SITE-A');
    const expired = await grant(narrow.id, 'site', 'SITE-C');
    const superseded = await grant(narrow.id, 'site_room', 'SITE-C', 'RC1');
    await migrateHandle.pool.query(
      `update permission.permission_grants set revoked_at = now(), revoked_by_actor_id = $2, revoked_reason = 'fixture' where id = $1`,
      [revoked, admin.id],
    );
    await migrateHandle.pool.query(
      `update permission.permission_grants set granted_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1`,
      [expired],
    );
    await migrateHandle.pool.query('update permission.permission_grants set superseded_at = now() where id = $1', [superseded]);
  }, 120_000); // two server builds

  afterAll(async () => {
    if (migrateHandle && actorIds.length) {
      await migrateHandle.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
      await migrateHandle.pool.query('delete from permission.permission_grants where actor_id = any($1::uuid[])', [actorIds]);
      await migrateHandle.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
      await migrateHandle.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    }
    await app?.close();
    await plainApp?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('one SiteGrant per catalog site in catalog order, zero-grant sites included, out-of-catalog values dropped', async () => {
    const rows = await list(app, {});
    expect(sitesOf(rows, wide)).toEqual([
      { id: 'SITE-A', label: 'Site A', grantedRooms: ['RA2', 'RA1'], totalRooms: 2 },
      { id: 'SITE-B', label: 'Site B', grantedRooms: [], totalRooms: 1 },
      { id: 'SITE-C', label: 'Site C', grantedRooms: ['RC2'], totalRooms: 3 },
    ]);
  });

  it('revoked, expired and superseded grants are excluded', async () => {
    const rows = await list(app, {});
    expect(sitesOf(rows, narrow)).toEqual([
      { id: 'SITE-A', label: 'Site A', grantedRooms: [], totalRooms: 2 },
      { id: 'SITE-B', label: 'Site B', grantedRooms: ['RB1'], totalRooms: 1 },
      { id: 'SITE-C', label: 'Site C', grantedRooms: [], totalRooms: 3 },
    ]);
    expect(sitesOf(rows, none)?.every((s) => s.grantedRooms.length === 0)).toBe(true);
    expect(sitesOf(rows, none)).toHaveLength(3);
  });

  it.each([
    [false, () => [[admin, none].map((p) => p.id).sort(), narrow.id, wide.id].flat()],
    [true, () => [wide.id, narrow.id, [admin, none].map((p) => p.id).sort()].flat()],
  ])('grantCount sort compares granted room counts (desc %s, id ascending tie-break)', async (desc, expected) => {
    const rows = await list(app, { sort: { field: 'grantCount', desc } });
    expect(rows.map((r) => r.id)).toEqual(expected());
  });

  it('a deployment without a catalog keeps sites []', async () => {
    const rows = await list(plainApp, {});
    expect(rows).toHaveLength(actorIds.length);
    for (const row of rows) expect(row.sites).toEqual([]);
  });
});
