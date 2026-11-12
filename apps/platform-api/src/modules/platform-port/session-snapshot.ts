import type { CheckService } from '../permissions/check-service.js';
import type { PlatformPermissionResolver } from './permissions.js';
import { titleFor } from './titles.js';
import { platformActorOf, type LoadedSession } from './transport.js';

/** Shared snapshot for bootstrap, polling and dispatch identity tokens. */
export function createSessionSnapshot(deps: {
  permissions: PlatformPermissionResolver;
  checkService: CheckService;
}) {
  return async (loaded: LoadedSession) => {
    const permissions = await deps.permissions.resolve(deps.checkService, platformActorOf(loaded));
    return {
      user: {
        id: loaded.actor.id,
        name: loaded.actor.displayName,
        title: titleFor(loaded.actor.roleLevel),
        permissions,
      },
      scopes: [],
    };
  };
}
