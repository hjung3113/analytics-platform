// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { groupId, menuPermissions, spaceId, carrySetId } from '@ap/contracts';
import { KeyRound } from 'lucide-react';
import { permissionGrantsRoute, permissionRequestsRoute } from '@ap/feature-bridge';
import { manifests } from './index';
import { harnessMenus } from './test-support';

const byId = (id: string) => manifests.find(entry => entry.id === id)!;
const IDS = ['permission-request-review', 'permission-grants', 'service-tokens'];

describe('권한 manifests', () => {
  it('declares the three screens in order, 권한 요청 검토 the sole primary, all in access under the 운영 콘솔 paths', () => {
    expect(manifests.map(entry => entry.id)).toEqual(IDS);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['permission-request-review']);
    expect(manifests.every(entry => entry.group === 'access')).toBe(true);
    expect(manifests.map(entry => entry.path)).toEqual(['/operations/permission-request-review', '/operations/permission-grants', '/operations/service-tokens']);
    expect(manifests.map(entry => entry.label.ko)).toEqual(['권한 요청 검토', '부여 목록', '서비스 토큰']);
  });

  it('service tokens declares only restorable list filters, with no secret or issuance state', () => {
    expect(byId('service-tokens').pageKeys).toEqual(['noExpiry', 'kind']);
  });

  it('gives every menu its own icon and hides none', () => {
    expect(new Set(manifests.map(entry => entry.icon)).size).toBe(manifests.length);
    expect(manifests.some(entry => entry.navHidden)).toBe(false);
  });

  it.each([
    ['permission-request-review', permissionRequestsRoute],
    ['permission-grants', permissionGrantsRoute],
  ])('%s declares its route table page keys plus the two keys the space carries', (id, route) => {
    // `managedSystem` (ignored by these screens) and `returnTo` are carried by the screen space, not route-table keys.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'managedSystem', 'returnTo'].sort());
    expect(menu).toMatchObject({ requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
    expect(menu.carrySet).toBe(carrySetId('features'));
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
      groups: [{ id: groupId('access'), label: { ko: '권한', en: 'Access' }, icon: KeyRound, space: spaceId('operations') }],
      menus: harnessMenus,
    });
    const visible = (permissions: string[]) => registry.menus.filter(menu => !menu.navHidden && permissions.includes(menu.permission)).map(menu => menu.id);
    expect(visible(['platform:view', 'features:access'])).toEqual([]);
    expect(visible(['platform:view', 'features:access', 'console:access'])).toEqual(IDS);
  });
});
