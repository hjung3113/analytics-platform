import { describe, expect, it } from 'vitest';
import { defaultArrangement, type BoardLayout } from './boardModel';
import { effectiveTracks, drawnColumns } from './layout';

describe('effective board tracks', () => {
  it.each(['1x1', '1x2', '2x1', '2x2'] as BoardLayout[])('fits %s and exposes its pixel minimum bounds', layout => {
    const result = effectiveTracks(layout, defaultArrangement(layout), 1000, 600);
    expect(result.widths.reduce((a, b) => a + b, 0) + (result.widths.length - 1) * 12).toBe(1000);
    for (const column of result.heights) expect(column.reduce((a, b) => a + b, 0) + (column.length - 1) * 12).toBe(600);
    expect(result.columnBounds.min).toBe(result.widths.length === 2 ? 340 / 988 * 100 : 100);
  });
  it('clamps extremes without modifying saved ratios and restores them when space returns', () => {
    const arrangement = { columns: [10, 90], rows: [[1, 99], [99, 1]], collapsed: [] };
    const small = effectiveTracks('2x2', arrangement, 692, 300);
    expect(small.widths).toEqual([340, 340]);
    expect(small.heights).toEqual([[162, 162], [162, 162]]);
    expect(small.height).toBe(336);
    expect(small.rowBounds[0]).toEqual({ min: 50, max: 50 });
    expect(effectiveTracks('2x2', arrangement, 4012, 2000).widths).toEqual([400, 3600]);
    expect(arrangement.columns).toEqual([10, 90]);
  });
  it('gives a collapsed pane only its header and grows only the same-column neighbor', () => {
    const arrangement = defaultArrangement('2x2');
    arrangement.collapsed = [0];
    const result = effectiveTracks('2x2', arrangement, 1000, 600);
    expect(result.heights).toEqual([[42, 546], [294, 294]]);
    expect(result.rowBounds[0]).toEqual({ min: 42 / 588 * 100, max: 42 / 588 * 100 });
  });
  it('stacks at the existing equal-share 692px threshold regardless of unequal stored ratios', () => {
    expect(drawnColumns(2, 692)).toBe(2);
    expect(drawnColumns(2, 691)).toBe(1);
  });
});
