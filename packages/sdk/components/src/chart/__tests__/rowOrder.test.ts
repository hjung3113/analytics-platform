import { describe, expect, it } from 'vitest';
import { orderRows, type OrderableRow } from '../rowOrder';

// Two equipments × two modules; EQ-B's group total (3+9=12) beats EQ-A's (5+4=9).
const row = (eq: string, mod: string, total: number | null): OrderableRow => ({ category: `${eq}.${mod}`, levels: [eq, mod], total });
const ROWS = [row('EQ-A', 'PM1', 5), row('EQ-A', 'PM2', 4), row('EQ-B', 'PM1', 3), row('EQ-B', 'PM2', 9)];
const cats = (rows: readonly OrderableRow[]) => rows.map(r => r.category);

describe('orderRows (#2394)', () => {
  it('keeps the input order by default and does not change the input', () => {
    const input = [...ROWS];
    expect(cats(orderRows(input).rows)).toEqual(cats(ROWS));
    expect(input).toEqual(ROWS);
    expect(orderRows(ROWS).groups).toBeUndefined();
  });

  it('keeps non-adjacent rows of one group where they are under original (no swap)', () => {
    const split = [row('EQ-A', 'PM1', 1), row('EQ-B', 'PM1', 2), row('EQ-A', 'PM2', 3)];
    expect(cats(orderRows(split).rows)).toEqual(['EQ-A.PM1', 'EQ-B.PM1', 'EQ-A.PM2']);
    expect(cats(orderRows(split, { levelLabels: ['설비', 'Module'] }).rows)).toEqual(['EQ-A.PM1', 'EQ-B.PM1', 'EQ-A.PM2']);
  });

  it('orders groups by their summed total and rows inside each group, groups staying contiguous', () => {
    expect(cats(orderRows(ROWS, { sort: 'total-desc' }).rows)).toEqual(['EQ-B.PM2', 'EQ-B.PM1', 'EQ-A.PM1', 'EQ-A.PM2']);
    expect(cats(orderRows(ROWS, { sort: 'total-asc' }).rows)).toEqual(['EQ-A.PM2', 'EQ-A.PM1', 'EQ-B.PM1', 'EQ-B.PM2']);
  });

  it('keeps the input order inside a group when asked', () => {
    expect(cats(orderRows(ROWS, { sort: 'total-desc', sortWithinGroups: false }).rows)).toEqual(['EQ-B.PM1', 'EQ-B.PM2', 'EQ-A.PM1', 'EQ-A.PM2']);
  });

  it('swaps the levels: the inner key groups the rows, in first-appearance order under original', () => {
    const { rows, groups } = orderRows(ROWS, { swap: true, levelLabels: ['설비', 'Module'] });
    expect(cats(rows)).toEqual(['EQ-A.PM1', 'EQ-B.PM1', 'EQ-A.PM2', 'EQ-B.PM2']);
    expect(groups!.header).toBe('Module');
    expect(groups!.byCategory.get('EQ-B.PM1')).toEqual({ group: 'PM1', label: 'EQ-B' });
  });

  it('swaps and sorts together (PM2 group 13 > PM1 group 8)', () => {
    expect(cats(orderRows(ROWS, { swap: true, sort: 'total-desc' }).rows)).toEqual(['EQ-B.PM2', 'EQ-A.PM2', 'EQ-A.PM1', 'EQ-B.PM1']);
  });

  it('gives Frame row groups for the declared levels', () => {
    const { groups } = orderRows(ROWS, { levelLabels: ['설비', 'Module'] });
    expect(groups!.header).toBe('설비');
    expect(groups!.byCategory.get('EQ-A.PM2')).toEqual({ group: 'EQ-A', label: 'PM2' });
  });

  it('puts unmeasured rows and all-unmeasured groups last in both directions, ties stable', () => {
    const rows = [row('EQ-N', 'PM1', null), row('EQ-T', 'PM1', 2), row('EQ-T', 'PM2', null), row('EQ-U', 'PM1', 2)];
    for (const sort of ['total-desc', 'total-asc'] as const)
      expect(cats(orderRows(rows, { sort }).rows)).toEqual(['EQ-T.PM1', 'EQ-T.PM2', 'EQ-U.PM1', 'EQ-N.PM1']);
  });

  it('ignores a non-finite total in the group sum', () => {
    const rows = [row('EQ-A', 'PM1', Number.NaN), row('EQ-A', 'PM2', 1), row('EQ-B', 'PM1', 2)];
    expect(cats(orderRows(rows, { sort: 'total-desc', sortWithinGroups: false }).rows)).toEqual(['EQ-B.PM1', 'EQ-A.PM1', 'EQ-A.PM2']);
    // Inside a group a non-finite total sorts like an unmeasured one: last.
    expect(cats(orderRows(rows, { sort: 'total-desc' }).rows)).toEqual(['EQ-B.PM1', 'EQ-A.PM2', 'EQ-A.PM1']);
  });
});
