import { describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { HW_TIME_CONTEXT, hwTime } from './endpoints';
import { HW_TIME_CARRY_SET } from './test-support';

describe('manifest', () => {
  it('declares one primary menu with four Views and hidden compatibility entries and passes createRegistry', () => {
    expect(manifests).toHaveLength(5);
    const menu = manifests.find(menu => menu.id === 'hw-time')!;
    expect(menu.id).toBe('hw-time');
    expect(menu.primary).toBe(true);
    expect(menu.label).toEqual({ ko: 'HW Time', en: 'HW Time' });
    expect(menu.pageType).toBe('analysis');
    expect(menu.group).toBe('hwTime');
    expect(menu.permission).toBe(menuPermission('analytics:view'));
    expect(menu.requiresScope).toBe(true);
    expect(menu.component).toBeDefined();
    expect(menu.pageKeys).toEqual(expect.arrayContaining(['view', 'moduleType', 'module', 'motion', 'split', 'drillModule', 'drillMotion', 'trend', 'sort', 'align', 'minmax']));
    expect(menu.navViews?.map(view => view.id)).toEqual(['overview', 'steps', 'compare', 'table']);
    expect(manifests.filter(menu => menu.id !== 'hw-time').every(menu => menu.navHidden)).toBe(true);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'row', 'page', 'focus']);
    expect(menu.drill?.levels.map(level => level.key)).toEqual(['drillModule', 'drillMotion']);
    const spaces: SpaceDef[] = [{ id: spaceId('mars'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: groupId('hwTime'), label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('mars') }];
    const registry = createRegistry({ carrySets: [HW_TIME_CARRY_SET], spaces, groups, menus: manifests, permissions: [menuPermission('analytics:view')] });
    expect(registry.menuById('hw-time-steps').path).toBe('/mars/hw-time-steps');
    expect(registry.menuById('hw-time-steps').aliases).toEqual(['/hw-time/steps']);
    expect(registry.spaceOf(menu)?.id).toBe('mars');
  });

  it('declares every endpoint against the unified menu and the analytics Context', () => {
    const menu = manifests.find(menu => menu.id === 'hw-time')!;
    for (const endpoint of [hwTime.levelRows, hwTime.trend, hwTime.tableRows, hwTime.exportRows]) expect(endpoint.menuId).toBe(menu.id);
    expect(hwTime.levelRows.context).toEqual(HW_TIME_CONTEXT);
    expect(menu.context).toEqual(contextCapabilities(HW_TIME_CONTEXT));
    expect(menu.features).toEqual({ ...NO_FEATURES, board: true, export: true });
  });
});
