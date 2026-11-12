import type { ScopeResolver } from '../menu-dispatch/scope-resolver.js';
import type { ScopeCatalog } from '../permissions/scope-catalog.js';
import type { CheckService } from '../permissions/check-service.js';
import type { PlatformPermissionResolver } from './permissions.js';
import { titleFor } from './titles.js';
import { platformActorOf, type LoadedSession } from './transport.js';

/** Shared snapshot for bootstrap, polling and dispatch identity tokens. */
export function createSessionSnapshot(deps: {
  permissions: PlatformPermissionResolver;
  checkService: CheckService;
  scopeCatalog?: ScopeCatalog;
  scopeResolver?: ScopeResolver;
  scopeWarning?: () => void;
}) {
  return async (loaded: LoadedSession) => {
    // Enumerating permissions is descriptive: unrelated denied capabilities are not attempted calls.
    const permissions = await deps.permissions.resolve(deps.checkService, platformActorOf(loaded), { auditTokenDenials: false });
    const scopeState = await (async () => {
      if (!deps.scopeCatalog || !deps.scopeResolver) return { scopes: [] };
      try {
        const grants = await deps.scopeResolver.resolve(platformActorOf(loaded));
        const sites = deps.scopeCatalog.sites.map(({ site, label, rooms }) => ({
          id: site, label, totalRooms: rooms.length,
          grantedRooms: rooms.filter(room => grants.some(grant => grant.site === site && grant.rooms.includes(room))).length,
        }));
        return {
          scopes: sites.filter(site => site.grantedRooms > 0),
          requestableScopes: sites.filter(site => site.grantedRooms === 0).map(({ id, label, totalRooms }) => ({ id, label, totalRooms })),
        };
      } catch {
        deps.scopeWarning?.();
        return { scopes: [] };
      }
    })();
    return {
      user: {
        id: loaded.actor.id,
        name: loaded.actor.displayName,
        title: titleFor(loaded.actor.roleLevel),
        permissions,
      },
      ...scopeState,
    };
  };
}
