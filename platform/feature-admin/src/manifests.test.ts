// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { groupId, menuPermissions, spaceId, carrySetId } from '@ap/contracts';
import { UserCog } from 'lucide-react';
import { analyticsAreasRoute, managedSystemsRoute, permissionGrantsRoute, permissionRequestsRoute, settingsRoute } from '@ap/feature-bridge';
import { manifests } from './index';
import { harnessMenus } from './test-support';

const byId = (id: string) => manifests.find(entry => entry.id === id)!;
const IDS = ['managed-systems', 'analytics-areas', 'permission-request-review', 'permission-grants', 'settings'];

describe('관리자 manifests', () => {
  it('declares the five screens in order, Managed System first and primary, all in featureAdmin', () => {
    expect(manifests.map(entry => entry.id)).toEqual(IDS);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['managed-systems']);
    expect(manifests.every(entry => entry.group === 'featureAdmin')).toBe(true);
    expect(manifests.map(entry => entry.path)).toEqual([
      '/operations/managed-systems', '/operations/analytics-areas', '/operations/permission-request-review', '/operations/permission-grants', '/operations/settings',
    ]);
    expect(manifests.map(entry => entry.label.ko)).toEqual(['Managed System', 'Analytics Area', '권한 요청 검토', '부여 목록', '기능 설정']);
  });

  it('gives every menu its own icon and hides none', () => {
    expect(new Set(manifests.map(entry => entry.icon)).size).toBe(manifests.length);
    expect(manifests.some(entry => entry.navHidden)).toBe(false);
  });

  it.each([
    ['managed-systems', managedSystemsRoute],
    ['analytics-areas', analyticsAreasRoute],
    ['permission-request-review', permissionRequestsRoute],
    ['permission-grants', permissionGrantsRoute],
    ['settings', settingsRoute],
  ])('%s declares its route table page keys plus the two keys the space carries', (id, route) => {
    // `managedSystem` (ignored by these screens) and `returnTo` are carried by the screen space, not route-table keys.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'managedSystem', 'returnTo'].sort());
    expect(menu).toMatchObject({ requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('requires console:access (the workspace-admin rule), never features:access alone', () => {
    for (const entry of manifests) expect(entry.permission).toBe('console:access');
  });

  it('needs features:access AND console:access, so removing the space gate keeps the effective access', () => {
    for (const entry of manifests) expect(menuPermissions(entry)).toEqual(['console:access', 'features:access']);
  });

  it('never aliases the operations /admin paths', () => {
    for (const entry of manifests) {
      expect(entry.path).not.toMatch(/^\/admin/);
      expect(entry.aliases ?? []).toEqual([]);
    }
  });

  it('shows the section to a holder of console:access and not to a features:access-only user', () => {
    const registry = createRegistry({
      carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
      spaces: [{ id: spaceId('operations'), label: { ko: 'Feature', en: 'Feature' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', homeMenuId: 'feature-home-stub' }],
      groups: [{ id: groupId('featureAdmin'), label: { ko: '관리자', en: 'Admin' }, icon: UserCog, space: spaceId('operations') }],
      menus: harnessMenus,
    });
    const visible = (permissions: string[]) => registry.menus.filter(menu => !menu.navHidden && permissions.includes(menu.permission)).map(menu => menu.id);
    expect(visible(['platform:view', 'features:access'])).toEqual([]);
    expect(visible(['platform:view', 'features:access', 'console:access'])).toEqual(IDS);
  });
});
