import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { snapshotOrigin, originLinkOptions, suggestedTargets } from './origin';

describe('saved analysis origin', () => {
  it('freezes only declared page keys, preserving repeated values and excluding returnTo', () => {
    const origin = snapshotOrigin({ id: 'analysis', pageKeys: ['drillEquipment', 'filter', 'returnTo'] }, { ...emptyGlobal, selection: ['EQ-1'] }, [['drillEquipment', 'EQ-2'], ['filter', 'a'], ['filter', 'b'], ['variant', 'a'], ['returnTo', '/elsewhere']]);
    expect(origin.context.page).toEqual({ drillEquipment: 'EQ-2', filter: ['a', 'b'] });
    expect(origin.context.selection).toEqual(['EQ-1']);
    expect(originLinkOptions(origin)).toMatchObject({ page: { drillEquipment: 'EQ-2', filter: ['a', 'b'] }, global: { selection: ['EQ-1'], recipeIds: null } });
  });
  it('suggests the drilled equipment without changing Selection, otherwise suggests selected equipment', () => {
    const origin = { menuId: 'analysis', context: { selection: ['EQ-1'], page: { drillEquipment: 'EQ-2' } } };
    expect(suggestedTargets(origin)).toEqual([{ kind: 'equipment', externalKey: 'EQ-2', displayName: 'EQ-2' }]);
    expect(origin.context.selection).toEqual(['EQ-1']);
    expect(suggestedTargets({ menuId: 'analysis', context: { selection: ['EQ-1', 'EQ-3'] } })).toEqual([{ kind: 'equipment', externalKey: 'EQ-1', displayName: 'EQ-1' }, { kind: 'equipment', externalKey: 'EQ-3', displayName: 'EQ-3' }]);
    expect(suggestedTargets(null)).toEqual([]);
  });
  it('restores a legacy origin without page keys and clears ambient Context', () => {
    expect(originLinkOptions({ menuId: 'analysis', context: { from: '2026-11-01T00:00:00' } })).toMatchObject({ page: {}, global: { from: '2026-11-01T00:00:00', selection: null, metricId: null } });
  });
});
