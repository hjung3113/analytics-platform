import { describe, expect, it } from 'vitest';
import { spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { sampleEndpoint } from './endpoints';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual([]);
    expect(menu.pageType).toBe('catalog');
    expect(menu.group).toBe('systems');
    const spaces: SpaceDef[] = [{ id: spaceId('operations'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('operations') }];
    const registry = createRegistry({ spaces, groups, menus: manifests });
    expect(registry.menuById('systems').path).toBe('/operations/systems');
    expect(registry.spaceOf(menu)?.id).toBe('operations');
  });

  it('owns the sample endpoint (#126)', () => {
    expect(sampleEndpoint.menuId).toBe(manifests[0].id);
    expect(sampleEndpoint.id.startsWith('systems.')).toBe(true);
  });
});
