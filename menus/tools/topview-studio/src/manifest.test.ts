import { describe, expect, it } from 'vitest';
import { spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { PAGE_KEYS, manifests } from './index';
import { EQV_STUDIO_MENU_ID, STUDIO_VIEW_PERMISSION, studioActionSpecs, studioReadSpecs } from './endpoints';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0]!;
    expect(menu).toMatchObject({ id: 'eqv-studio', primary: true, group: 'topviewStudio', path: '/tools/eqv-studio', requiresScope: false, pageType: 'catalog', permission: 'eqv-studio:view' });
    expect(menu.pageKeys).toEqual(['layout', 'revision', 'template']);
    expect(PAGE_KEYS).toEqual(menu.pageKeys);
    for (const key of ['time', 'roomNames', 'condition', 'selection'] as const) expect(menu.context[key]).toBe('unsupported');
    const spaces: SpaceDef[] = [{ id: spaceId('tools'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('tools') }];
    const registry = createRegistry({ spaces, groups, menus: manifests, permissions: [STUDIO_VIEW_PERMISSION] });
    expect(registry.menuById('eqv-studio').path).toBe('/tools/eqv-studio');
    expect(registry.spaceOf(menu)?.id).toBe('tools');
  });

  it('owns the nine declarations on its menu id', () => {
    for (const spec of [...studioReadSpecs, ...studioActionSpecs]) {
      expect(spec.menuId).toBe(EQV_STUDIO_MENU_ID);
      expect(spec.id.startsWith('eqv.')).toBe(true);
    }
  });
});
