import { describe, expect, it } from 'vitest';
import { spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { ONBOARDING_PAGE_KEYS, PAGE_KEYS, manifests } from './index';
import { EQV_ONBOARDING_MENU_ID, EQV_READ_PERMISSION, EQV_STUDIO_MENU_ID, STUDIO_VIEW_PERMISSION, onboardingActionSpecs, onboardingReadSpecs, studioActionSpecs, studioReadSpecs } from './endpoints';

describe('manifest', () => {
  it('Layouts stays the primary of the two menus of its group and passes createRegistry', () => {
    expect(manifests.map(m => m.id)).toEqual(['eqv-studio', 'eqv-onboarding']);
    const menu = manifests[0]!;
    expect(menu).toMatchObject({ id: 'eqv-studio', primary: true, group: 'topviewStudio', path: '/tools/eqv-studio', requiresScope: false, pageType: 'catalog', permission: 'eqv-studio:view' });
    expect(menu.pageKeys).toEqual(['layout', 'revision', 'template']);
    expect(PAGE_KEYS).toEqual(menu.pageKeys);
    for (const key of ['time', 'roomNames', 'condition', 'selection'] as const) expect(menu.context[key]).toBe('unsupported');
    const spaces: SpaceDef[] = [{ id: spaceId('tools'), label: { ko: '공간', en: 'Space' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: spaceId('tools') }];
    const registry = createRegistry({ spaces, groups, menus: manifests, permissions: [STUDIO_VIEW_PERMISSION] });
    expect(registry.menuById('eqv-studio').path).toBe('/tools/eqv-studio');
    expect(registry.menuById('eqv-onboarding').path).toBe('/tools/eqv-onboarding');
    expect(registry.spaceOf(menu)?.id).toBe('tools');
  });

  it('owns the nine declarations on its menu id', () => {
    for (const spec of [...studioReadSpecs, ...studioActionSpecs]) {
      expect(spec.menuId).toBe(EQV_STUDIO_MENU_ID);
      expect(spec.id.startsWith('eqv.')).toBe(true);
    }
  });

  it('설비 온보딩: Management page beside Layouts, entered with eqv-studio:view, page keys equipment/step/window only', () => {
    const menu = manifests.find(m => m.id === 'eqv-onboarding')!;
    expect(menu).toMatchObject({ group: 'topviewStudio', path: '/tools/eqv-onboarding', pageType: 'management', permission: 'eqv-studio:view', requiresScope: false });
    expect(menu.primary).toBeFalsy();
    expect(menu.pageKeys).toEqual(['equipment', 'step', 'window']);
    expect(ONBOARDING_PAGE_KEYS).toEqual(menu.pageKeys);
  });

  it('owns the onboarding declarations on eqv-onboarding; reads declare eqv:view; writes invalidate reads of the same menu', () => {
    for (const spec of onboardingReadSpecs) expect({ menuId: spec.menuId, permission: spec.permission }, spec.id).toEqual({ menuId: EQV_ONBOARDING_MENU_ID, permission: EQV_READ_PERMISSION });
    for (const spec of onboardingActionSpecs) {
      expect(spec.menuId, spec.id).toBe(EQV_ONBOARDING_MENU_ID);
      for (const read of spec.invalidates) expect(read.menuId, `${spec.id} → ${read.id}`).toBe(EQV_ONBOARDING_MENU_ID);
    }
    expect(new Set([...onboardingReadSpecs, ...onboardingActionSpecs].map(s => s.id)).size).toBe(onboardingReadSpecs.length + onboardingActionSpecs.length);
  });
});
