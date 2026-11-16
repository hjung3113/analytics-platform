import { describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { HW_TIME_CONTEXT, hwTime } from './endpoints';

describe('manifest', () => {
  it('declares one linked-panel menu and passes createRegistry', () => {
    // The four menus it replaced are retired in the app assembly (#2330), not hidden entries here.
    expect(manifests.map(menu => menu.id)).toEqual(['hw-time']);
    const menu = manifests.find(menu => menu.id === 'hw-time')!;
    expect(menu.id).toBe('hw-time');
    expect(menu.primary).toBe(true);
    expect(menu.label).toEqual({ ko: 'HW Time', en: 'HW Time' });
    expect(menu.pageType).toBe('analysis');
    expect(menu.group).toBe('hwTime');
    expect(menu.permission).toBe(menuPermission('analytics:view'));
    expect(menu.requiresScope).toBe(true);
    expect(menu.component).toBeDefined();
    expect(menu.pageKeys).toEqual(expect.arrayContaining(['moduleType', 'module', 'motion', 'split', 'drillModule', 'drillMotion', 'row', 'sort', 'align', 'page', 'focus']));
    expect(menu.navViews).toBeUndefined();
    expect(menu.carrySet).toBeUndefined();
    for (const entry of manifests) {
      expect(entry.pageKeys).toEqual(menu.pageKeys);
      expect(entry.pageKeys).not.toEqual(expect.arrayContaining(['view']));
      expect(entry.pageKeys).toEqual(expect.arrayContaining(['trend', 'pins', 'barsSort', 'barsGroup', 'barsMinMax']));
      expect(entry.pageKeys).not.toEqual(expect.arrayContaining(['minmax']));
    }
    expect(menu.contextResetKeys).toEqual(['date', 'moduleType', 'drillMotion', 'drillModule', 'row', 'page', 'focus', 'trend']);
    expect(menu.drill?.levels.map(level => level.key)).toEqual(['moduleType', 'drillMotion', 'drillModule']);
    expect(menu.drill?.resetKeys).toContain('trend');
    expect(menu.repeatedPageKeys).toContain('pins');
    expect(menu.hiddenPageKeys).toEqual(expect.arrayContaining(['pins', 'trend', 'barsSort', 'barsGroup', 'barsMinMax']));
    const spaces: SpaceDef[] = [{ id: spaceId('mars'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: groupId('hwTime'), label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('mars') }];
    const registry = createRegistry({  spaces, groups, menus: manifests, permissions: [menuPermission('analytics:view')] });
    expect(registry.menuById('hw-time').path).toBe('/mars/hw-time');
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
