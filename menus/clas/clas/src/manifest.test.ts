import { describe, expect, it } from 'vitest';
import type { SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';
import { operationTimeEndpoint } from './endpoints';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual(['eqp']);
    expect(menu.pageType).toBe('analysis');
    expect(menu.group).toBe('clas');
    const spaces: SpaceDef[] = [{ id: 'clas', label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: 'clas' }];
    const registry = createRegistry({ spaces, groups, menus: manifests });
    expect(registry.menuById('operation-time').path).toBe('/clas/operation-time');
    expect(registry.spaceOf(menu)?.id).toBe('clas');
  });

  it('owns the operation-time endpoint with the same permission and Scope rule (#126)', () => {
    expect(operationTimeEndpoint.menuId).toBe(manifests[0].id);
    expect(operationTimeEndpoint.id.startsWith('clas.')).toBe(true);
    expect(operationTimeEndpoint.permission).toBe(manifests[0].permission);
    expect(operationTimeEndpoint.requiresScope).toBe(manifests[0].requiresScope);
  });

  it('declares board support so its screen can sit in a board pane (docs/16 §6)', () => {
    expect(manifests[0].features.board).toBe(true);
  });
});
