/** Fixtures shared by the 관리자 page tests. */
import { UserCog } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import type { MenuEntry } from '@ap/kernel';
import { manifests } from './index';

/**
 * The kernel requires the space's home menu to hold the space permission (`features:access`); the real home is the dashboard in another package, so the harness uses this hidden stand-in
 * and the five admin menus (`console:access`) are the only visible ones.
 */
export const homeStub: MenuEntry = { ...manifests[0]!, id: 'fo-home-stub', primary: false, navHidden: true, permission: 'features:access', additionalPermissions: undefined, path: '/operations/home-stub' };
export const harnessMenus: MenuEntry[] = [homeStub, ...manifests];

/** The session holds `console:access` too (an admin); the section's visibility for other holders is the manifests test's. */
export const { registry, mountAt } = createFeatureMenuHarness({
  manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'featureAdmin', label: { ko: '관리자', en: 'Admin' }, icon: UserCog },
  permissions: ['platform:view', 'features:access', 'console:access'],
});

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([
  import('./pages/FoManagedSystems'), import('./pages/FoAnalyticsAreas'), import('./pages/FoPermissionRequests'), import('./pages/FoPermissionGrants'), import('./pages/FoSettings'),
]);
