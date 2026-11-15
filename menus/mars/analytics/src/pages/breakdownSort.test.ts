import { describe, expect, it } from 'vitest';
import { compareBreakdownCells } from './breakdownSort';

describe('compareBreakdownCells (#2077, #2214)', () => {
  it('orders text with numbers naturally', () => {
    expect(['EQ-10', 'EQ-2', 'EQ-1'].sort(compareBreakdownCells)).toEqual(['EQ-1', 'EQ-2', 'EQ-10']);
  });
  it('ignores case and orders numbers by value', () => {
    expect(compareBreakdownCells('photo', 'PHOTO')).toBe(0);
    expect([10, 2, 1].sort(compareBreakdownCells)).toEqual([1, 2, 10]);
  });
});
