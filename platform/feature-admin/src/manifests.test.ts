// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { groupId, spaceId } from '@ap/contracts';
import { UserCog } from 'lucide-react';
import { analyticsAreasRoute, managedSystemsRoute, permissionGrantsRoute, permissionRequestsRoute, settingsRoute } from '@ap/feature-bridge';
import { manifests } from './index';
import { harnessMenus } from './test-support';

const byId = (id: string) => manifests.find(entry => entry.id === id)!;
const IDS = ['fo-managed-systems', 'fo-analytics-areas', 'fo-permission-requests', 'fo-permission-grants', 'fo-settings'];

describe('관리자 manifests', () => {
  it('declares the five screens in order, Managed System first and primary, all in foAdmin', () => {
    expect(manifests.map(entry => entry.id)).toEqual(IDS);
    expect(manifests.filter(entry => entry.primary).map(entry => entry.id)).toEqual(['fo-managed-systems']);
    expect(manifests.every(entry => entry.group === 'foAdmin')).toBe(true);
    expect(manifests.map(entry => entry.path)).toEqual([
      '/feedbackops/managed-systems', '/feedbackops/analytics-areas', '/feedbackops/permission-requests', '/feedbackops/permission-grants', '/feedbackops/settings',
    ]);
    expect(manifests.map(entry => entry.label.ko)).toEqual(['Managed System', 'Analytics Area', '권한 요청 검토', '부여 목록', 'FeedbackOps 설정']);
  });

  it('gives every menu its own icon and hides none', () => {
    expect(new Set(manifests.map(entry => entry.icon)).size).toBe(manifests.length);
    expect(manifests.some(entry => entry.navHidden)).toBe(false);
  });

  it.each([
    ['fo-managed-systems', managedSystemsRoute],
    ['fo-analytics-areas', analyticsAreasRoute],
    ['fo-permission-requests', permissionRequestsRoute],
    ['fo-permission-grants', permissionGrantsRoute],
    ['fo-settings', settingsRoute],
  ])('%s declares its route table page keys plus the two keys the space carries', (id, route) => {
    // `managedSystem` (ignored by these screens) and `returnTo` are carried by the FO space, not route-table keys.
    const menu = byId(id);
    expect([...menu.pageKeys!].sort()).toEqual([...route.pageKeys, 'managedSystem', 'returnTo'].sort());
    expect(menu).toMatchObject({ requiresScope: false, pageType: 'management' });
    expect(menu.navViews).toBeUndefined();
  });

  it('requires console:access (the workspace-admin rule), never feedbackops:access alone', () => {
    for (const entry of manifests) expect(entry.permission).toBe('console:access');
  });

  it('never aliases the operations /admin paths', () => {
    for (const entry of manifests) {
      expect(entry.path).not.toMatch(/^\/admin/);
      expect(entry.aliases ?? []).toEqual([]);
    }
  });

  it('shows the section to a holder of console:access and not to a feedbackops:access-only user', () => {
    const registry = createRegistry({
      spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'feedbackops:access', carriedPageKeys: ['managedSystem', 'returnTo'], homeMenuId: 'fo-home-stub' }],
      groups: [{ id: groupId('foAdmin'), label: { ko: '관리자', en: 'Admin' }, icon: UserCog, space: spaceId('feedbackops') }],
      menus: harnessMenus,
    });
    const visible = (permissions: string[]) => registry.menus.filter(menu => !menu.navHidden && permissions.includes(menu.permission)).map(menu => menu.id);
    expect(visible(['platform:view', 'feedbackops:access'])).toEqual([]);
    expect(visible(['platform:view', 'feedbackops:access', 'console:access'])).toEqual(IDS);
  });
});
