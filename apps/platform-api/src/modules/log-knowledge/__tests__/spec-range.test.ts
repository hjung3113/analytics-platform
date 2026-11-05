import { describe, expect, it } from 'vitest';

import { appliesAt, compareApplication, rangesOverlap } from '../domain/spec-range.js';

describe('spec change ranges (#1196 c)', () => {
  it.each([
    [{ start: 3, endBefore: null }, 2, false],
    [{ start: 3, endBefore: null }, 3, true],
    [{ start: 3, endBefore: null }, 99, true],
    [{ start: 3, endBefore: 5 }, 4, true],
    [{ start: 3, endBefore: 5 }, 5, false],
    [{ start: 3, endBefore: 3 }, 3, false],
    [{ start: 4, endBefore: 2 }, 3, false],
  ])('%j at %i applies: %s', (range, order, expected) => {
    expect(appliesAt(range, order)).toBe(expected);
  });

  it.each([
    [{ start: 1, endBefore: 3 }, { start: 3, endBefore: 5 }, false],
    [{ start: 1, endBefore: 4 }, { start: 3, endBefore: 5 }, true],
    [{ start: 1, endBefore: null }, { start: 9, endBefore: 10 }, true],
    [{ start: 5, endBefore: null }, { start: 1, endBefore: 5 }, false],
    [{ start: 2, endBefore: null }, { start: 7, endBefore: null }, true],
    [{ start: 3, endBefore: 3 }, { start: 1, endBefore: null }, false],
  ])('%j and %j overlap: %s', (a, b, expected) => {
    expect(rangesOverlap(a, b)).toBe(expected);
    expect(rangesOverlap(b, a)).toBe(expected);
  });

  it('orders by start, then created_at, then id', () => {
    const rows = [
      { start: 2, createdAt: '2026-01-02', id: 'b' },
      { start: 1, createdAt: '2026-01-03', id: 'z' },
      { start: 2, createdAt: '2026-01-01', id: 'c' },
      { start: 2, createdAt: '2026-01-02', id: 'a' },
    ];
    expect([...rows].sort(compareApplication).map((r) => r.id)).toEqual(['z', 'c', 'a', 'b']);
  });
});
