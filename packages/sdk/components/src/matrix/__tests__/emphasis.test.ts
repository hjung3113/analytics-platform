import { describe, expect, it } from 'vitest';
import type { MatrixColumn, MatrixNode } from '@ap/contracts';
import { matchesEmphasis, sameValueRule } from '../emphasis';

describe('matrix emphasis', () => {
  it.each([
    [1, true], [3, true], [2, true], [0, false], [4, false], [null, false], ['2', false],
  ])('inclusive numeric range for %s', (value, expected) => {
    expect(matchesEmphasis(value, { kind: 'range', min: 1, max: 3 })).toBe(expected);
  });
  it('supports one-sided ranges and typed value sets, excluding blanks', () => {
    expect(matchesEmphasis(5, { kind: 'range', min: 5 })).toBe(true);
    expect(matchesEmphasis(-2, { kind: 'range', max: 0 })).toBe(true);
    expect(matchesEmphasis('1', { kind: 'values', values: [1] })).toBe(false);
    expect(matchesEmphasis('a', { kind: 'values', values: [1, 'a'] })).toBe(true);
    expect(matchesEmphasis(null, { kind: 'values', values: [] })).toBe(false);
  });
  it('makes a same-value rule or refuses a blank cell', () => {
    const node: MatrixNode = { id: 'a', label: 'A', level: 0, kind: 'leaf', hasChildren: false, expanded: false };
    const column: MatrixColumn = { id: 'x', label: 'X' };
    expect(sameValueRule(node, column, () => 0)).toEqual({ row: 'a', match: { kind: 'values', values: [0] } });
    expect(sameValueRule(node, column, () => null)).toBeNull();
  });
});
