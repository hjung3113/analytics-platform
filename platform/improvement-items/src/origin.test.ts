import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { snapshotOrigin, originLinkOptions, suggestedTargets, originContextTooLarge, parseOriginPage } from './origin';

describe('saved analysis origin', () => {
  it('freezes only declared page keys, preserving repeated values and excluding returnTo', () => {
    const origin = snapshotOrigin({ id: 'analysis', pageKeys: ['drillEquipment', 'filter', 'returnTo'] }, { ...emptyGlobal, selection: ['EQ-1'] }, [['drillEquipment', 'EQ-2'], ['filter', 'a'], ['filter', 'b'], ['variant', 'a'], ['returnTo', '/elsewhere']]);
    expect(origin.context.page).toEqual({ drillEquipment: 'EQ-2', filter: ['a', 'b'] });
    expect(origin.context.selection).toEqual(['EQ-1']);
    expect(originLinkOptions(origin)).toMatchObject({ page: { drillEquipment: 'EQ-2', filter: ['a', 'b'] }, global: { selection: ['EQ-1'], recipeIds: null } });
  });
  it('suggests the equipment or process the menu declared without changing Selection, otherwise the selected equipment', () => {
    const origin = { menuId: 'analysis', context: { selection: ['EQ-1'], page: { drillEquipment: 'EQ-2', room: 'PHOTO' } } };
    expect(suggestedTargets(origin, { equipment: 'drillEquipment' })).toEqual([{ kind: 'equipment', externalKey: 'EQ-2', displayName: 'EQ-2' }]);
    expect(suggestedTargets({ menuId: 'analysis', context: { page: { room: 'PHOTO' } } }, { process: 'room' })).toEqual([{ kind: 'process', externalKey: 'PHOTO', displayName: 'PHOTO' }]);
    // The feature knows no menu key names: an undeclared drillEquipment is not read.
    expect(suggestedTargets(origin)).toEqual([{ kind: 'equipment', externalKey: 'EQ-1', displayName: 'EQ-1' }]);
    expect(origin.context.selection).toEqual(['EQ-1']);
    expect(suggestedTargets({ menuId: 'analysis', context: { selection: ['EQ-1', 'EQ-3'] } })).toEqual([{ kind: 'equipment', externalKey: 'EQ-1', displayName: 'EQ-1' }, { kind: 'equipment', externalKey: 'EQ-3', displayName: 'EQ-3' }]);
    expect(suggestedTargets(null)).toEqual([]);
  });
  it('restores a legacy origin without page keys and clears ambient Context', () => {
    expect(originLinkOptions({ menuId: 'analysis', context: { from: '2026-11-01T00:00:00' } })).toMatchObject({ page: {}, global: { from: '2026-11-01T00:00:00', selection: null, metricId: null } });
  });
});


describe('origin snapshot byte boundary (#1408 round 2)', () => {
  it.each(['x', '한'])('measures UTF-8 JSON bytes at 8192 and 8193, using %s', token => {
    const overhead = new TextEncoder().encode(JSON.stringify({ q: '' })).length;
    const bytes = new TextEncoder().encode(token).length;
    const count = Math.floor((8192 - overhead) / bytes);
    const padding = 'x'.repeat(8192 - overhead - count * bytes);
    const context = { q: token.repeat(count) + padding };
    expect(new TextEncoder().encode(JSON.stringify(context))).toHaveLength(8192);
    expect(originContextTooLarge({ menuId: 'source', context })).toBe(false);
    expect(originContextTooLarge({ menuId: 'source', context: { q: context.q + 'x' } })).toBe(true);
  });
});

describe('separate origin page input', () => {
  it('decodes repeated page values and preserves the source focus independently', () => {
    expect(parseOriginPage(JSON.stringify({ focus: 'EQ-1', tab: 'validity', filter: ['a', 'b'] }))).toEqual([['focus', 'EQ-1'], ['tab', 'validity'], ['filter', 'a'], ['filter', 'b']]);
  });
  it.each(['{', '[]', 'null', '{"focus":42}', '{"filter":["a",42]}'])('rejects malformed input %s without truncating it', value => {
    expect(parseOriginPage(value)).toBeNull();
  });
});
