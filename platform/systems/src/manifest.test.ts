// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { menuPermissions, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';

describe('시스템 manifest (#1289 node j)', () => {
  it('is the only menu of its group, primary, under the 운영 콘솔 path, and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0]!;
    expect(menu).toMatchObject({ id: 'systems', primary: true, group: 'systems', path: '/operations/systems', pageType: 'catalog', requiresScope: false, label: { ko: '시스템', en: 'Systems' } });
    expect(menu.pageKeys).toEqual([]);
    expect(menu.aliases ?? []).toEqual([]);
    const spaces: SpaceDef[] = [{ id: spaceId('operations'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('operations') }];
    const registry = createRegistry({ spaces, groups, menus: manifests });
    expect(registry.menuById('systems').path).toBe('/operations/systems');
    expect(registry.spaceOf(menu)?.id).toBe('operations');
  });

  it('requires console:access alone: the link grants no permission and features:access does not open it', () => {
    expect(menuPermissions(manifests[0]!)).toEqual(['console:access']);
  });
});
