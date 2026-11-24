import { describe, expect, it } from 'vitest';
import { buildQuery, contextCapabilities, groupId, parseQuery, menuPermission, NO_FEATURES, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { HW_TIME_CONTEXT, hwTime } from './endpoints';

describe('manifest', () => {
  it('declares moduleMotions as the writer of the repeated equipment selection consumed by the raw table, and trend as the date range output', () => {
    const menu = manifests[0]!;
    expect(menu.pageKeys).toContain('motionEquipment');
    expect(menu.repeatedPageKeys).toContain('motionEquipment');
    expect(menu.contextResetKeys).toContain('motionEquipment');
    expect(menu.panels?.flatMap(panel => panel.outputs.filter(output => output.selection).map(output => [panel.id, output.key, output.selection])))
      .toEqual([
        ['trend', 'trendRange', { dimension: 'date', shape: 'range', label: { ko: '날짜', en: 'Date' } }],
        ['moduleMotions', 'motionEquipment', { dimension: 'equipmentId', shape: 'set', label: { ko: '설비', en: 'Equipment' } }],
      ]);
    expect(menu.panels?.find(panel => panel.id === 'table')?.queryInputs.page).toContainEqual({ key: 'motionEquipment', selection: 'filter' });
  });

  it('keeps lent equipment labels out of the URL: not a page key, dropped by applied parsing and the share query (#2490)', () => {
    const menu = manifests.find(entry => entry.id === 'hw-time')!;
    expect(menu.pageKeys).not.toContain('equipmentLabels');
    expect(menu.hiddenPageKeys ?? []).not.toContain('equipmentLabels');
    // The shell parses applied page pairs over declared keys and shares only those pairs (shareLink.ts).
    const parsed = parseQuery('?v=1&scopeId=MEM&moduleType=LK&equipmentLabels=x', menu.pageKeys, { repeated: menu.repeatedPageKeys });
    expect(parsed.page.map(([key]) => key)).toEqual(['moduleType']);
    const shared = new URLSearchParams(buildQuery(parsed.global, parsed.page));
    expect(shared.get('scopeId')).toBe('MEM');
    expect(shared.has('equipmentLabels')).toBe(false);
  });

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
    expect(menu.contextResetKeys).toEqual(['date', 'moduleType', 'drillMotion', 'drillModule', 'row', 'page', 'focus', 'trend', 'motionEquipment', 'trendRange']);
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

it('applies PRC groups in HW Time and preserves them in Saved Views', () => {
  const menu = manifests.find(entry => entry.id === 'hw-time')!;
  expect(menu.context.prcGroup).toBe('apply');
  expect(menu.savedViewSupport?.contextKeys).toContain('prcGroup');
  for (const endpoint of Object.values(hwTime)) expect(endpoint.context.prcGroup).toBe('apply');
});
