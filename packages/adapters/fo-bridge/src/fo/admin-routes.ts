import { operatorRoute, routeHere, routeSearch } from './operator-route';
import type { TargetOf } from './links';

/**
 * Admin route tables (#764 s, #595 4f): FeedbackOps' `/admin/…` → the platform admin menus and back. `selected` is the platform `focus` (06 §13). On
 * Analytics Areas the screen's own filter (`managedSystem`, a uuid only) is the page key `system`, not the carried `managedSystem` scope (plan F1).
 * `returnTo` and `platformReturn` are never mapped, so a link carrying either stays unlinked. `operatorHostLinks` (`operator-links.ts`) spreads `adminOperatorTargets`.
 */
export const managedSystemsRoute = operatorRoute({
  foPath: '/admin/managed-systems',
  foFixed: {},
  menuId: 'fo-managed-systems',
  keys: {},
});

export const analyticsAreasRoute = operatorRoute({
  foPath: '/admin/analytics-areas',
  foFixed: {},
  menuId: 'fo-analytics-areas',
  keys: { managedSystem: 'system', includeArchived: 'includeArchived', selected: 'focus' },
});

export const permissionRequestsRoute = operatorRoute({
  foPath: '/admin/permissions/requests',
  foFixed: {},
  menuId: 'fo-permission-requests',
  keys: { tab: 'tab', selected: 'focus' },
});

export const permissionGrantsRoute = operatorRoute({
  foPath: '/admin/permissions/grants',
  foFixed: {},
  menuId: 'fo-permission-grants',
  keys: { tab: 'tab', selected: 'focus' },
});

/** `/admin/settings`; its `#coverage` section is the page key `section` (the only fragment the table accepts). */
export const settingsRoute = operatorRoute({
  foPath: '/admin/settings',
  foFixed: {},
  menuId: 'fo-settings',
  keys: {},
  hash: { fragment: 'coverage', key: 'section' },
});

/** Module-level hooks: `FoBridge` memoizes its seam on their identities. */
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
