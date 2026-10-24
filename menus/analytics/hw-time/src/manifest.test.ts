import { describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { HW_TIME_CONTEXT, hwTime } from './endpoints';

describe('manifest', () => {
  it('declares the steps menu first in its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(3);
    const menu = manifests[0];
    expect(menu.id).toBe('hw-time-steps');
    expect(menu.primary).toBe(true);
    expect(menu.label).toEqual({ ko: 'HW Time 단계별', en: 'HW Time by level' });
    expect(menu.pageType).toBe('analysis');
    expect(menu.group).toBe('hwTime');
    expect(menu.permission).toBe(menuPermission('analytics:view'));
    expect(menu.requiresScope).toBe(true);
    expect(menu.component).toBeDefined();
    expect(menu.pageKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'sort', 'align', 'minmax']);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'trend']);
    expect(menu.drill?.levels.map(level => level.key)).toEqual(['drillModule', 'drillMotion']);
    const spaces: SpaceDef[] = [{ id: spaceId('analytics'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: groupId('hwTime'), label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('analytics') }];
    const registry = createRegistry({ spaces, groups, menus: manifests, permissions: [menuPermission('analytics:view')] });
    expect(registry.menuById('hw-time-steps').path).toBe('/hw-time/steps');
    expect(registry.spaceOf(menu)?.id).toBe('analytics');
  });

  it('declares every endpoint against the steps menu and the analytics Context', () => {
    for (const endpoint of [hwTime.levelRows, hwTime.trend, hwTime.tableRows, hwTime.exportRows]) expect(endpoint.menuId).toBe(manifests[0].id);
    expect(hwTime.levelRows.context).toEqual(HW_TIME_CONTEXT);
    expect(manifests[0].context).toEqual(contextCapabilities(HW_TIME_CONTEXT));
    expect(manifests[0].features).toEqual({ ...NO_FEATURES, board: true });
  });
});
