import { describe, expect, it } from 'vitest';
import type { AccessPrincipal, Permission } from '@ap/contracts';
import { House, Wrench } from 'lucide-react';
import { createRegistry, type MenuEntry } from '@ap/kernel';
import { grantTotals, menusForPermissions } from './access-rows';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false } as const;
const menu = (over: Partial<MenuEntry> & Pick<MenuEntry, 'id' | 'permission'>): MenuEntry => ({
  group: 'admin', label: { ko: over.id!, en: over.id! }, description: { ko: '', en: '' }, path: `/${over.id}`,
  icon: House, requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  ...over,
});

const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'roles' }],
  groups: [
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
    { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: Wrench, space: 'operations' },
  ],
  menus: [
    menu({ id: 'roles', permission: 'console:access', path: '/admin/roles', primary: true }),
    menu({ id: 'audit', permission: 'console:access', path: '/admin/audit' }),
    // Declared for a permission the engineer holds, but its space still gates entry on console:access.
    menu({ id: 'equipment-master', permission: 'equipment:view', path: '/equipment/master', group: 'equipment', primary: true }),
    // Declared for a permission nobody in these fixtures holds: never joins.
    menu({ id: 'equipment-condition', permission: 'analytics:view', path: '/equipment/condition', group: 'equipment' }),
  ],
});

const principal = (permissions: Permission[], sites: AccessPrincipal['sites']): AccessPrincipal => ({
  id: 'p1', name: 'P 1', title: { ko: 'p', en: 'p' }, role: 'p1', permissions, sites,
});

describe('grantTotals (#49 Room grants column)', () => {
  it('sums granted rooms and known rooms across sites, zeros included', () => {
    const p = principal([], [
      { id: 'ICH', label: 'ICH', grantedRooms: ['PH-101', 'ET-102', 'CVD-201'], totalRooms: 4 },
      { id: 'CJU', label: 'CJU', grantedRooms: ['PH-301'], totalRooms: 3 },
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
  });

  it('joins nothing for permissions no menu declares', () => {
    expect(menusForPermissions(registry, ['platform:view', 'voc:view'])).toEqual([]);
  });
});
