import { operatorRoute, routeHere, routeSearch } from './operator-route';
import type { TargetOf } from './links';

/**
 * Admin route tables (#764 s, #595 4f): the feature screens' `/admin/…` → the platform admin menus and back. `selected` is the platform `focus` (06 §13). On
 * Analytics Areas the screen's own filter (`managedSystem`, a uuid only) is the page key `system`, not the carried `managedSystem` scope (plan F1).
 * `returnTo` and `platformReturn` are never mapped, so a link carrying either stays unlinked. `operatorHostLinks` (`operator-links.ts`) spreads `adminOperatorTargets`.
 */
export const managedSystemsRoute = operatorRoute({
  screenPath: '/admin/managed-systems',
  screenFixed: {},
  menuId: 'managed-systems',
  keys: {},
});

export const analyticsAreasRoute = operatorRoute({
  screenPath: '/admin/analytics-areas',
  screenFixed: {},
  menuId: 'analytics-areas',
  keys: { managedSystem: 'system', includeArchived: 'includeArchived', selected: 'focus' },
});

export const permissionRequestsRoute = operatorRoute({
  screenPath: '/admin/permissions/requests',
  screenFixed: {},
  menuId: 'permission-request-review',
  keys: { tab: 'tab', selected: 'focus' },
});

export const permissionGrantsRoute = operatorRoute({
  screenPath: '/admin/permissions/grants',
  screenFixed: {},
  menuId: 'permission-grants',
  keys: { tab: 'tab', selected: 'focus' },
});

/** `/admin/settings`; its `#coverage` section is the page key `section` (the only fragment the table accepts). */
export const settingsRoute = operatorRoute({
  screenPath: '/admin/settings',
  screenFixed: {},
  menuId: 'settings',
  keys: {},
  hash: { fragment: 'coverage', key: 'section' },
});

/** Module-level hooks: `FeatureBridge` memoizes its seam on their identities. */
export const useManagedSystemsSearch = routeSearch(managedSystemsRoute);
export const useManagedSystemsHere = routeHere(managedSystemsRoute);
export const useAnalyticsAreasSearch = routeSearch(analyticsAreasRoute);
export const useAnalyticsAreasHere = routeHere(analyticsAreasRoute);
export const usePermissionRequestsSearch = routeSearch(permissionRequestsRoute);
export const usePermissionRequestsHere = routeHere(permissionRequestsRoute);
export const usePermissionGrantsSearch = routeSearch(permissionGrantsRoute);
export const usePermissionGrantsHere = routeHere(permissionGrantsRoute);
export const useSettingsSearch = routeSearch(settingsRoute);
export const useSettingsHere = routeHere(settingsRoute);

/** The five Admin targets for `operatorHostLinks` (spreads this). */
export const adminOperatorTargets: TargetOf[] = [
  managedSystemsRoute.target,
  analyticsAreasRoute.target,
  permissionRequestsRoute.target,
  permissionGrantsRoute.target,
  settingsRoute.target,
];
