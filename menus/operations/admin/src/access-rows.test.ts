import { describe, expect, it } from 'vitest';
import { House, Wrench } from 'lucide-react';
import { createRegistry, type MenuEntry, type ModuleMenuEntry, type PlatformMenuEntry } from '@ap/kernel';
import { grantTotals, menusForPermissions } from './access-rows';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission, spaceId, type AccessPrincipal, type Permission } from '@ap/contracts';

const none = contextCapabilities();
const spaceSubtitle = 'Access projection fixture subtitle';
const menu = (over: Partial<PlatformMenuEntry> & Pick<PlatformMenuEntry, 'id' | 'permission'>): MenuEntry => ({
  group: groupId('admin'), label: { ko: over.id!, en: over.id! }, description: { ko: '', en: '' }, path: `/${over.id}`,
  icon: House, requiresScope: false, pageType: 'management', context: none, features: NO_FEATURES, pageKeys: [],
  ...over,
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view'), menuPermission('equipment:view')],
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, subtitle: { ko: spaceSubtitle, en: 'Access projection fixture subtitle' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'roles' }],
  groups: [
    { id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') },
    { id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Wrench, space: spaceId('operations') },
  ],
  menus: [
    menu({ id: 'roles', permission: 'console:access', path: '/admin/roles', primary: true }),
    menu({ id: 'audit', permission: 'console:access', path: '/admin/audit' }),
    // Declared for a permission the engineer holds, but its space still gates entry on console:access.
    menu({ id: 'equipment-master', permission: menuPermission('equipment:view'), path: '/equipment/master', group: groupId('equipment'), primary: true }),
    // Declared for a permission nobody in these fixtures holds: never joins.
    menu({ id: 'equipment-condition', permission: menuPermission('analytics:view'), path: '/equipment/condition', group: groupId('equipment') }),
  ],
});

const principal = (permissions: Permission[], sites: AccessPrincipal['sites']): AccessPrincipal => ({
  id: 'p1', name: 'P 1', title: { ko: 'p', en: 'p' }, role: 'p1', permissions, sites,
});

describe('grantTotals (#49 Room grants column)', () => {
  it('sums granted rooms and known rooms across sites, zeros included', () => {
    const p = principal([], [
      { id: 'MEM', label: 'MEM', grantedRooms: ['PHOTO', 'ETCH', 'CVD'], totalRooms: 4 },
      { id: 'FDRY', label: 'FDRY', grantedRooms: ['PHOTO'], totalRooms: 3 },
      { id: 'XIA', label: 'XIA', grantedRooms: [], totalRooms: 2 },
    ]);
    expect(grantTotals(p)).toEqual({ granted: 4, total: 9 });
  });

  it('is 0/0 for a principal with no site rows', () => {
    expect(grantTotals(principal([], []))).toEqual({ granted: 0, total: 0 });
  });
});

describe('menusForPermissions (#49 drawer join)', () => {
  it('joins only menus whose permission the principal holds, sorted by menu id', () => {
    const joined = menusForPermissions(registry, ['equipment:view', 'platform:view']);
    expect(joined.map(m => m.id)).toEqual(['equipment-master']);
    expect(joined[0].permission).toBe('equipment:view');
  });

  it('marks a held menu space-gated when its space demands a permission the principal lacks', () => {
    const engineer = menusForPermissions(registry, ['equipment:view']);
    expect(engineer[0].spaceGated).toBe(true);
    // The same menu for a console holder is not gated: the space permission is held too.
    const admin = menusForPermissions(registry, ['equipment:view', 'console:access']);
    expect(admin[0].spaceGated).toBe(false);
    expect(admin[0].spaceLabel).toEqual({ ko: '운영 콘솔', en: 'Operations console' });
    expect(JSON.stringify(admin[0].spaceLabel)).not.toContain(spaceSubtitle);
  });

  it('does not space-gate a global utility menu and labels it 전역', () => {
    const globalRegistry = createRegistry({
      permissions: [menuPermission('analytics:view'), menuPermission('equipment:view')],
      spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'roles' }],
      groups: [
        { id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') },
        { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
      ],
      menus: [
        menu({ id: 'roles', permission: 'console:access', path: '/admin/roles', primary: true }),
        menu({ id: 'notices', permission: 'notice:view', path: '/notices', group: groupId('noticeVoc'), primary: true, label: { ko: '공지', en: 'Notices' } }),
      ],
    });
    expect(menusForPermissions(globalRegistry, ['notice:view'])).toEqual([{
      id: 'notices', label: { ko: '공지', en: 'Notices' }, path: '/notices', permission: 'notice:view',
      spaceGated: false, spaceId: null, spaceLabel: { ko: '전역', en: 'Global' },
    }]);
  });

  it('joins nothing for permissions no menu declares', () => {
    expect(menusForPermissions(registry, ['platform:view', 'voc:view'])).toEqual([]);
  });
});

const moduleMenu = (): ModuleMenuEntry => ({
  id: 'fx-home', module: 'fx', group: 'fx:main', permission: 'fx:view', label: { ko: '모듈', en: 'Module' }, description: { ko: '', en: '' }, path: '/fx', icon: House,
  requiresScope: false, context: none, pageType: 'management', features: NO_FEATURES, pageKeys: [], primary: true, moduleScreen: () => null,
});
const moduleRegistry = () => createRegistry({
  permissions: [menuPermission('analytics:view'), menuPermission('equipment:view')],
  spaces: [{ id: spaceId('operations'), label: { ko: '운영', en: 'Ops' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'fx-home' }],
  groups: [{ id: 'fx:main', module: 'fx', label: { ko: '모듈', en: 'Module' }, icon: House, space: spaceId('operations') }],
  menus: [moduleMenu()],
});

describe('menusForPermissions module menu (ADR-0053)', () => {
  it('returns no platform row for a session that holds only a module permission', () => {
    const platform = createRegistry({
      permissions: [menuPermission('analytics:view'), menuPermission('equipment:view')],
      spaces: [{ id: spaceId('operations'), label: { ko: '운영', en: 'Ops' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'p' }],
      groups: [{ id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') }],
      menus: [{ ...moduleMenu(), id: 'p', group: groupId('admin'), module: undefined, permission: 'console:access', moduleScreen: undefined }],
    });

    expect(menusForPermissions(platform, ['fx:view'])).toEqual([]);
  });

  it('joins a module menu by its module-prefixed permission', () => {
    const joined = menusForPermissions(moduleRegistry(), ['fx:view', 'platform:view']);

    expect(joined).toMatchObject([{ id: 'fx-home', permission: 'fx:view', spaceGated: false }]);
  });
});
