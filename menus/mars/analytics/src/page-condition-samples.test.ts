import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { groupId } from '@ap/contracts';
import { House } from 'lucide-react';
import { PERMISSION } from './permission';
import { testSpace } from '@ap/kernel/testing';
import { manifests } from './index';
import { PAGE_CONDITION_SAMPLE_SOURCES, withPageConditionSamples } from './page-condition-samples';

describe('removable page-condition samples (#2339)', () => {
  it('leaves the default manifests unchanged and adds only two opt-in sample declarations', () => {
    const samples = withPageConditionSamples(manifests);
    expect(manifests.every(menu => menu.pageConditions === undefined)).toBe(true);
    expect(samples.filter(menu => menu.pageConditions).map(menu => menu.id)).toEqual(['chart-catalog', 'productivity-overview']);
    const space = { ...testSpace(), homeMenuId: 'productivity-overview' };
    const registry = createRegistry({ spaces: [space], groups: [{ id: groupId('analytics'), label: space.label, icon: House, space: space.id }], menus: samples, permissions: [PERMISSION], endpoints: PAGE_CONDITION_SAMPLE_SOURCES });
    expect(registry.menuById('productivity-overview').query?.mode).toBe('apply');
    expect(registry.menuById('chart-catalog').query?.mode).toBeUndefined();
    expect(samples.find(menu => menu.id === 'cycle-time')).toBe(manifests.find(menu => menu.id === 'cycle-time'));
  });
});
