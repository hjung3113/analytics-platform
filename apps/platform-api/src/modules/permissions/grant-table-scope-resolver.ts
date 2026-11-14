import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { permissionGrants } from '../../db/schema/permission.js';
import type { ScopeResolver } from '../menu-dispatch/index.js';
import type { ScopeCatalog } from './scope-catalog.js';

export interface SiteScopeGrantRow { actorId: string; kind: string; site: string | null; room: string | null }

/** Every active `scope.read` site/room grant of the given actors in one read: not revoked, not superseded, not expired. */
export async function readActiveSiteScopeGrants(db: Db, workspaceId: string, actorIds: readonly string[]): Promise<SiteScopeGrantRow[]> {
  if (actorIds.length === 0) return [];
  return db.select({ actorId: permissionGrants.actorId, kind: permissionGrants.scopeKind, site: permissionGrants.scopeSite, room: permissionGrants.scopeRoom })
    .from(permissionGrants)
    .where(and(
      eq(permissionGrants.workspaceId, workspaceId),
      inArray(permissionGrants.actorId, [...actorIds]),
      eq(permissionGrants.capability, 'scope.read'),
      inArray(permissionGrants.scopeKind, ['site', 'site_room']),
      isNull(permissionGrants.revokedAt),
      isNull(permissionGrants.supersededAt),
      or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, sql`now()`)),
    ));
}

/**
 * The one room-decision rule (ADR-0154): a `site` grant opens every catalog room of the site, a `site_room` grant
 * its one room; values outside the catalog are dropped. Returns, per catalog site, its granted rooms in catalog order.
 */
export function grantedRoomsBySite(catalog: ScopeCatalog, rows: readonly Omit<SiteScopeGrantRow, 'actorId'>[]): Map<string, string[]> {
  const granted = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.site === null || !catalog.hasSite(row.site)) continue;
    const rooms = row.kind === 'site' ? catalog.roomsOf(row.site)
      : row.kind === 'site_room' && row.room !== null && catalog.hasRoom(row.site, row.room) ? [row.room] : [];
    const selected = granted.get(row.site) ?? new Set<string>();
    for (const room of rooms) selected.add(room);
    granted.set(row.site, selected);
  }
  return new Map(catalog.sites.map(({ site, rooms }) => {
    const selected = granted.get(site);
    return [site, rooms.filter(room => selected?.has(room))];
  }));
}

/** One uncached read per call (the API-token `scope.read` rule is judged before any resolver, `resolveRequestScopes`); DB failures propagate to the dispatch boundary's forbidden outcome. */
export function createGrantTableScopeResolver({ db, catalog }: { db: Db; catalog: ScopeCatalog }): ScopeResolver {
  return {
    async resolve(actor, signal) {
      signal?.throwIfAborted();
      const rows = await readActiveSiteScopeGrants(db, actor.workspace_id, [actor.actor_id]);
      signal?.throwIfAborted();
      return [...grantedRoomsBySite(catalog, rows)].flatMap(([site, rooms]) => rooms.length ? [{ site, rooms }] : []);
    },
  };
}

/** Deployment-wide count only: stale grants are not fatal and never disclose recipients or names. */
export async function countOutOfCatalogScopeGrants(db: Db, catalog: ScopeCatalog): Promise<number> {
  const rows = await db.select({ kind: permissionGrants.scopeKind, site: permissionGrants.scopeSite, room: permissionGrants.scopeRoom })
    .from(permissionGrants).where(and(
      eq(permissionGrants.capability, 'scope.read'),
      inArray(permissionGrants.scopeKind, ['site', 'site_room']),
      isNull(permissionGrants.revokedAt), isNull(permissionGrants.supersededAt),
      or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, sql`now()`)),
    ));
  return rows.filter(row => row.site === null || !catalog.hasSite(row.site) ||
    (row.kind === 'site_room' && (row.room === null || !catalog.hasRoom(row.site, row.room)))).length;
}
