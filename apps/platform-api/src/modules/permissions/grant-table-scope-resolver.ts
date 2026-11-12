import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { permissionGrants } from '../../db/schema/permission.js';
import type { ScopeResolver } from '../menu-dispatch/index.js';
import type { ScopeCatalog } from './scope-catalog.js';

/** One uncached read per call; DB failures propagate to the dispatch boundary's forbidden outcome. */
export function createGrantTableScopeResolver({ db, catalog }: { db: Db; catalog: ScopeCatalog }): ScopeResolver {
  return {
    async resolve(actor, signal) {
      signal?.throwIfAborted();
      const rows = await db.select({ kind: permissionGrants.scopeKind, site: permissionGrants.scopeSite, room: permissionGrants.scopeRoom })
        .from(permissionGrants)
        .where(and(
          eq(permissionGrants.workspaceId, actor.workspace_id),
          eq(permissionGrants.actorId, actor.actor_id),
          eq(permissionGrants.capability, 'scope.read'),
          inArray(permissionGrants.scopeKind, ['site', 'site_room']),
          isNull(permissionGrants.revokedAt),
          isNull(permissionGrants.supersededAt),
          or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, sql`now()`)),
        ));
      signal?.throwIfAborted();
      const granted = new Map<string, Set<string>>();
      for (const row of rows) {
        if (row.site === null || !catalog.hasSite(row.site)) continue;
        const rooms = row.kind === 'site' ? catalog.roomsOf(row.site)
          : row.kind === 'site_room' && row.room !== null && catalog.hasRoom(row.site, row.room) ? [row.room] : [];
        const selected = granted.get(row.site) ?? new Set<string>();
        for (const room of rooms) selected.add(room);
        granted.set(row.site, selected);
      }
      return catalog.sites.flatMap(({ site, rooms }) => {
        const selected = granted.get(site);
        const allowed = rooms.filter(room => selected?.has(room));
        return allowed.length ? [{ site, rooms: allowed }] : [];
      });
    },
  };
}
