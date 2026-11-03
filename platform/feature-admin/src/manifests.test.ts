// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { groupId, menuPermissions, spaceId, carrySetId } from '@ap/contracts';
import { UserCog } from 'lucide-react';
import { analyticsAreasRoute, managedSystemsRoute, settingsRoute } from '@ap/feature-bridge';
import { manifests } from './index';
import { harnessMenus } from './test-support';

const byId = (id: string) => manifests.find(entry => entry.id === id)!;
const IDS = ['managed-systems', 'analytics-areas', 'settings'];

describe('흐름 설정 manifests', () => {
  it('declares the three screens in order, 시스템 first and primary, all in flowSettings', () => {
    expect(manifests.map(entry => entry.id)).toEqual(IDS);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['managed-systems']);
    expect(manifests.every(entry => entry.group === 'flowSettings')).toBe(true);
    expect(manifests.map(entry => entry.path)).toEqual([
      '/flow/managed-systems', '/flow/analytics-areas', '/flow/settings',
    ]);
    expect(manifests.map(entry => entry.label.ko)).toEqual(['시스템', '분석 영역', '흐름 정책']);
  });

  it('gives every menu its own icon and hides none', () => {
    expect(new Set(manifests.map(entry => entry.icon)).size).toBe(manifests.length);
    expect(manifests.some(entry => entry.navHidden)).toBe(false);
  });

  it.each([
    ['managed-systems', managedSystemsRoute],
    ['analytics-areas', analyticsAreasRoute],
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

  it('never aliases the 운영 콘솔 /admin paths', () => {
    for (const entry of manifests) {
      expect(entry.path).not.toMatch(/^\/admin/);
      expect(entry.aliases ?? []).toEqual([]);
    }
  });

  it('shows the section to a holder of console:access and not to a features:access-only user', () => {
    const registry = createRegistry({
      carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
      spaces: [{ id: spaceId('flow'), label: { ko: 'Feature', en: 'Feature' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', homeMenuId: 'feature-home-stub' }],
      groups: [{ id: groupId('flowSettings'), label: { ko: '설정', en: 'Settings' }, icon: UserCog, space: spaceId('flow') }],
      menus: harnessMenus,
    });
    const visible = (permissions: string[]) => registry.menus.filter(menu => !menu.navHidden && permissions.includes(menu.permission)).map(menu => menu.id);
    expect(visible(['platform:view', 'features:access'])).toEqual([]);
    expect(visible(['platform:view', 'features:access', 'console:access'])).toEqual(IDS);
  });
});
