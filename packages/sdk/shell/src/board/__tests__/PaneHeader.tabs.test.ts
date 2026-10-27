import { describe, expect, it } from 'vitest';
import { compactTabCount, tabRoom, type TabFloor } from '../PaneHeader';

const tab = (active = false): TabFloor => ({ full: 136, badge: 46, active });
/** The room of the strip must reach `need` for the head to show its chips; `compactTabCount` is the least shrinking that gets there. */
const fitsFor = (need: number) => (room: number) => room >= need;

describe('compactTabCount: background tabs shrink from the back, one at a time (docs/16 §4 ②)', () => {
  const floors = [tab(true), tab(), tab(), tab(), tab()]; // 136 + 4 × 136 = 680 at full width
  it.each([
    { name: 'the head already fits: nothing shrinks', width: 680 + 100, need: 100, count: 0 },
    { name: 'exactly fits without shrinking', width: 680 + 100, need: 780 - 680, count: 0 },
    { name: 'one tab short: one tab shrinks', width: 680 + 100 - 1, need: 100, count: 1 },
    { name: 'exactly fits after two tabs shrink', width: 680 - 180 + 100, need: 100, count: 2 },
    { name: 'one short of that: three tabs shrink', width: 680 - 180 + 100 - 1, need: 100, count: 3 },
    { name: 'all four shrunk fits exactly', width: 680 - 360 + 100, need: 100, count: 4 },
    { name: 'not even all of them is enough: all shrink and the next steps take over', width: 680 - 360 + 99, need: 100, count: 4 },
  ])('$name', ({ width, need, count }) => {
    expect(compactTabCount(floors, width, fitsFor(need))).toBe(count);
  });

  it('never shrinks the active tab, wherever it is', () => {
    const middle = [tab(), tab(true), tab()];
    expect(compactTabCount(middle, 0, fitsFor(0))).toBe(2);
    // The two background tabs are taken from the back: the last one first, the first one next.
    expect(tabRoom(middle, 1000, 1)).toBe(1000 - (136 + 136 + 46));
    expect(tabRoom(middle, 1000, 2)).toBe(1000 - (46 + 136 + 46));
    expect(tabRoom(middle, 1000, 9)).toBe(1000 - (46 + 136 + 46));
  });

  it('a single tab has nothing to shrink', () => {
    expect(compactTabCount([tab(true)], 10, fitsFor(1000))).toBe(0);
  });

  it('is deterministic and monotone: the same strip gives the same count, and a wider strip never shrinks more', () => {
    const counts = Array.from({ length: 40 }, (_, n) => compactTabCount(floors, 400 + n * 10, fitsFor(100)));
    expect(Array.from({ length: 40 }, (_, n) => compactTabCount(floors, 400 + n * 10, fitsFor(100)))).toEqual(counts);
    for (let n = 1; n < counts.length; n++) expect(counts[n]).toBeLessThanOrEqual(counts[n - 1]!);
  });

  it('judges again after each step with the measured floors: a tab that needs less lets fewer tabs shrink', () => {
    const slim = [tab(true), { full: 100, badge: 46, active: false }, { full: 100, badge: 46, active: false }];
    expect(compactTabCount(slim, 336 + 100, fitsFor(100))).toBe(0);
    expect(compactTabCount(slim, 335 + 100, fitsFor(100))).toBe(1);
  });
});
