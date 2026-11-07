import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { manifests } from './index';
import { actionSpecs, endpointSpecs, MANAGE_PERMISSION } from './endpoints';
describe('improvement menu and endpoint mirror', () => {
  it('registers a direct global list and hidden detail with URL state', () => {
    const menu = manifests[0]!;
    const registry = createRegistry({ spaces: [], menus: manifests, groups: [{ id: menu.group, label: menu.label, icon: menu.icon, space: null }], permissions: [MANAGE_PERMISSION] });
    expect(registry.spaceOf(menu)).toBeNull();
    expect(menu.permission).toBe('platform:view');
    expect(menu.pageKeys).toEqual(['view', 'q', 'filter', 'page', 'sort', 'focus', 'origin', 'originPage']);
    expect(menu.hiddenPageKeys).toEqual(['filter', 'originPage']);
    expect(manifests[1]).toMatchObject({ path: '/improvement-items/:itemId', parent: 'improvement-items', navHidden: true });
  });
  it('mirrors the 3 reads and 6 writes with separate read and manage rights', () => {
    expect(endpointSpecs.map(s => [s.id, Object.keys(s.paramKeys)])).toEqual([
      ['improvement.items', ['q', 'page', 'pageSize', 'sorting', 'filters', 'targetKind', 'targetKey']], ['improvement.itemDetail', ['itemId', 'itemNo']], ['improvement.itemEvents', ['itemId', 'page', 'pageSize', 'order']],
    ]);
    expect(actionSpecs.map(s => [s.id, s.concurrency, Object.keys(s.inputKeys)])).toEqual([
      ['improvement.itemCreate', 'none', ['problem', 'action', 'actionDate', 'assigneeId', 'questId', 'questTitle', 'origin', 'targets']], ['improvement.itemUpdate', 'version', ['itemId', 'problem', 'action', 'actionDate', 'origin', 'targets']], ['improvement.itemSetStatus', 'version', ['itemId', 'status', 'action', 'actionDate', 'effect', 'reason']], ['improvement.itemReopen', 'version', ['itemId', 'reason']], ['improvement.itemAssign', 'version', ['itemId', 'assigneeId']], ['improvement.itemLinkQuest', 'version', ['itemId', 'questId', 'questTitle']],
    ]);
    for (const spec of endpointSpecs) expect(spec).toMatchObject({ menuId: 'improvement-items', permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false });
    for (const spec of actionSpecs) { expect(spec.permission).toBe(MANAGE_PERMISSION); expect(spec.invalidates).toEqual(endpointSpecs); }
  });
});
