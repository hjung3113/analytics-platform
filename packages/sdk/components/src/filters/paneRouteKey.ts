import type { useHostPlatform } from '@ap/kernel/host';

/** The key both board stores (query bar extensions and statuses) use for one pane's route, so they can never disagree. */
export function paneRouteKey(paneId: string | null, route: ReturnType<typeof useHostPlatform>['route']): string {
  return JSON.stringify([paneId, route?.menu.id, route?.params]);
}
