import { describe, expect, it } from 'vitest';
import { lazy } from 'react';
import { House } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import { createRegistry, type MenuEntry } from '@ap/kernel';
import { formatCapabilities, toRegistryRow } from './registry-rows';

const unsupported: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const menu = (over: Partial<MenuEntry>): MenuEntry => ({
  id: 'x', group: 'admin', label: { ko: '기본', en: 'Default' }, description: { ko: '', en: '' }, path: '/x', icon: House,
  permission: 'platform:view', requiresScope: false, context: unsupported, pageType: 'management', features: noFeatures, pageKeys: [], ...over,
});

// One menu with a component, one without (planned) — covers both status branches.
const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: [
    menu({ id: 'admin-roles', primary: true, label: { ko: '권한/역할 관리', en: 'Roles & access' }, path: '/admin/roles', permission: 'console:access',
      pageKeys: ['sort', 'page', 'focus'], context: { ...unsupported, time: 'apply' }, component: lazy(async () => ({ default: () => null })) }),
    menu({ id: 'admin-audit', label: { ko: '변경 감사', en: 'Audit trail' }, path: '/admin/audit', permission: 'console:access',
      pageKeys: ['q'], contextResetKeys: ['q'], context: { ...unsupported, time: 'apply', lot: 'reference' } }),
  ],
});

describe('formatCapabilities', () => {
  it('formats supported keys in fixed order and omits unsupported ones', () => {
    const context: Record<ContextKey, Capability> = { ...unsupported, time: 'apply', lot: 'reference' };
    expect(formatCapabilities(context)).toBe('time:apply, lot:reference');
    // Fixed order even when the declaration order differs; unsupported keys never appear.
    const scrambled: Record<ContextKey, Capability> = { ...unsupported, metric: 'apply', lot: 'reference' };
    expect(formatCapabilities(scrambled)).toBe('lot:reference, metric:apply');
  });

  it('renders an empty cell when every key is unsupported', () => {
    expect(formatCapabilities(unsupported)).toBe('');
  });
});

describe('toRegistryRow', () => {
  it('equals the registry values for every menu, including status from the component', () => {
    for (const menu of registry.menus) {
      const row = toRegistryRow(menu, registry);
      expect(row).toEqual({
        id: menu.id,
        spaceId: registry.spaceOf(menu).id,
        groupId: menu.group,
        path: menu.path,
        permission: menu.permission,
        capabilities: formatCapabilities(menu.context),
        pageKeys: menu.pageKeys.join(', '),
        contextResetKeys: (menu.contextResetKeys ?? []).join(', '),
        status: menu.component ? 'implemented' : 'planned',
      });
    }
  });

  it('marks the component-less menu planned and joins its declared keys', () => {
    const audit = registry.menuById('admin-audit');
    const row = toRegistryRow(audit, registry);
    expect(row.status).toBe('planned');
    expect(row.pageKeys).toBe('q');
    expect(row.contextResetKeys).toBe('q');
    expect(row.capabilities).toBe('time:apply, lot:reference');
  });

  it('marks the menu with a component implemented and contextResetKeys empty when undeclared', () => {
    const row = toRegistryRow(registry.menuById('admin-roles'), registry);
    expect(row.status).toBe('implemented');
    expect(row.pageKeys).toBe('sort, page, focus');
    expect(row.contextResetKeys).toBe('');
  });
});
