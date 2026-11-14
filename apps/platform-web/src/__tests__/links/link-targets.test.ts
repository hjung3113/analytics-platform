import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { declarations, registry } from '../../menus';

// 06 §22, ADR-0158 (#1903): the sample assembly registers every declared link target; an assembly without one lists it instead of failing.
describe('assembled registry: declared link targets', () => {
  it('the sample assembly misses no declared link target', () => {
    expect(registry.missingLinkTargets).toEqual([]);
  });

  it('the consumers that verify the contract declare their optional targets', () => {
    const declared = Object.fromEntries(registry.menus.filter(menu => menu.linkTargets !== undefined).map(menu => [menu.id, menu.linkTargets]));
    expect(declared).toMatchObject({
      'equipment-detail': { optional: ['eqv:topview'] },
      'log-knowledge-model': { optional: ['eqv-studio'] },
      'admin-audit': { optional: ['equipment-detail', 'metric-detail'] },
    });
  });

  it('an assembly that drops a declarer\'s optional target still builds and lists it', () => {
    // Keep only the audit menu's own group so its two sample destinations are absent.
    const audit = registry.menus.find(menu => menu.id === 'admin-audit')!;
    const menus = declarations.menus.filter(menu => menu.group === audit.group);
    const groups = declarations.groups.filter(group => group.id === audit.group);
    const spaces = declarations.spaces.filter(space => groups.some(group => group.space === space.id));
    const partial = createRegistry({ ...declarations, spaces, groups, menus, platformHomeMenuId: undefined });
    expect(partial.missingLinkTargets).toEqual([
      { menuId: 'admin-audit', target: 'equipment-detail', level: 'optional' },
      { menuId: 'admin-audit', target: 'metric-detail', level: 'optional' },
    ]);
  });
});
