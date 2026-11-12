import type { ScopeResolver } from '../menu-dispatch/index.js';
import type { ScopeCatalog } from '../permissions/index.js';
import type { CheckService } from '../permissions/check-service.js';
import type { PlatformPermissionResolver } from './permissions.js';
import { sessionVersionOf } from './session-version.js';
import { titleFor } from './titles.js';
import { platformActorOf, type LoadedSession } from './transport.js';

type ScopeOption = { id: string; label: string; grantedRooms: number; totalRooms: number };
type RequestableScope = { id: string; label: string; totalRooms: number };

interface SessionSnapshotDeps {
  permissions: PlatformPermissionResolver;
  checkService: CheckService;
  scopeCatalog?: ScopeCatalog;
  scopeResolver?: ScopeResolver;
  scopeWarning?: () => void;
}

/**
 * Shared session and version for bootstrap, polling and dispatch identity tokens (`sv`). The public session carries
 * only per-site room counts, so the version also hashes the effective granted rooms (server-private, ADR-0154
 * decision 5): replacing one granted room by another at the same count still changes it. Room names reach only the
 * opaque SHA-256, never a response body.
 */
export function createSessionState(deps: SessionSnapshotDeps) {
  return async (loaded: LoadedSession) => {
    // Enumerating permissions is descriptive: unrelated denied capabilities are not attempted calls.
    const permissions = await deps.permissions.resolve(deps.checkService, platformActorOf(loaded), { auditTokenDenials: false });
    // `grantKey` (server-private) is the effective granted set, sorted; it feeds only the version hash.
    const scopeState = await (async (): Promise<{ scopes: ScopeOption[]; requestableScopes?: RequestableScope[]; grantKey?: string[] }> => {
      if (!deps.scopeCatalog || !deps.scopeResolver) return { scopes: [] };
      try {
        const grants = await deps.scopeResolver.resolve(platformActorOf(loaded));
        const held = deps.scopeCatalog.sites.map(({ site, label, rooms }) => ({
          site, label, totalRooms: rooms.length,
          rooms: rooms.filter(room => grants.some(grant => grant.site === site && grant.rooms.includes(room))),
        }));
        const sites = held.map(({ site, label, totalRooms, rooms }) => ({ id: site, label, totalRooms, grantedRooms: rooms.length }));
        return {
          scopes: sites.filter(site => site.grantedRooms > 0),
          requestableScopes: sites.filter(site => site.grantedRooms === 0).map(({ id, label, totalRooms }) => ({ id, label, totalRooms })),
          grantKey: held.flatMap(({ site, rooms }) => rooms.map(room => JSON.stringify([site, room]))).sort(),
        };
      } catch {
        deps.scopeWarning?.();
        return { scopes: [] };
      }
    })();
    const { grantKey, ...publicScopeState } = scopeState;
    const session = {
      user: {
        id: loaded.actor.id,
        name: loaded.actor.displayName,
        title: titleFor(loaded.actor.roleLevel),
        permissions,
      },
      ...publicScopeState,
    };
    return { session, version: sessionVersionOf(grantKey ? { session, grants: grantKey } : session) };
  };
}

/** The public session alone (no version); see `createSessionState`. */
export function createSessionSnapshot(deps: SessionSnapshotDeps) {
  const state = createSessionState(deps);
  return async (loaded: LoadedSession) => (await state(loaded)).session;
}
