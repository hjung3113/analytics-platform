import { describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { HW_TIME_CONTEXT, hwTime } from './endpoints';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual([]);
    expect(menu.pageType).toBe('overview');
    expect(menu.group).toBe('hwTime');
    expect(menu.permission).toBe(menuPermission('analytics:view'));
    expect(menu.requiresScope).toBe(true);
    expect(menu.component).toBeUndefined();
    const spaces: SpaceDef[] = [{ id: spaceId('analytics'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: groupId('hwTime'), label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('analytics') }];
    const registry = createRegistry({ spaces, groups, menus: manifests, permissions: [menuPermission('analytics:view')] });
    expect(registry.menuById('hw-time').path).toBe('/hw-time');
    expect(registry.spaceOf(menu)?.id).toBe('analytics');
  });

  it('declares every endpoint against its planned menu and the analytics Context', () => {
    expect(hwTime.levelRows.menuId).toBe(manifests[0].id);
    expect(hwTime.trend.menuId).toBe(manifests[0].id);
    expect(hwTime.tableRows.menuId).toBe(manifests[0].id);
    expect(hwTime.exportRows.menuId).toBe(manifests[0].id);
    expect(hwTime.levelRows.context).toEqual(HW_TIME_CONTEXT);
    expect(manifests[0].context).toEqual(contextCapabilities(HW_TIME_CONTEXT));
    expect(manifests[0].features).toEqual(NO_FEATURES);
    expect(manifests[0].group).toBe(groupId('hwTime'));
  });
});
