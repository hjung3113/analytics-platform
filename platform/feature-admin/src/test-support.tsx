/** Fixtures shared by the 흐름 설정 page tests. */
import { UserCog } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import type { MenuEntry } from '@ap/kernel';
import { manifests } from './index';

/**
 * The kernel requires the space's home menu to hold the space permission (`features:access`); the real home is the dashboard in another package, so the harness uses this hidden stand-in
 * and the three admin menus (`console:access`) are the only visible ones.
 */
export const homeStub: MenuEntry = { ...manifests[0]!, id: 'feature-home-stub', primary: false, navHidden: true, permission: 'features:access', additionalPermissions: undefined, path: '/flow/home-stub' };
export const harnessMenus: MenuEntry[] = [homeStub, ...manifests];

/** The session holds `console:access` too (an admin); the section's visibility for other holders is the manifests test's. */
export const { registry, mountAt } = createFeatureMenuHarness({
  manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'flowSettings', label: { ko: '설정', en: 'Settings' }, icon: UserCog },
  permissions: ['platform:view', 'features:access', 'console:access'],
});

/**
 * Loads the lazy page modules (and the feature screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([
  import('./pages/FeatureManagedSystems'), import('./pages/FeatureAnalyticsAreas'), import('./pages/FeatureSettings'),
]);
