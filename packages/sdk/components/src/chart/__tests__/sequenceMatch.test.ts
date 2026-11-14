import { describe, expect, it } from 'vitest';
import { findRepeatedSequences, findSequenceMatches, itemsInRange, SEQUENCE_MAX_LENGTH, sequenceSteps, type SequenceLane } from '../sequenceMatch';

type Item = { id: string; s: string; start: number; end: number };
/** A lane from a step string: one item per letter, one time unit each (times differ per lane on purpose). */
function lane(id: string, steps: string, offset = 0, width = 1): SequenceLane<Item> {
  return { id, items: [...steps].map((s, i) => ({ id: `${id}${i}`, s, start: offset + i * width, end: offset + (i + 1) * width })) };
}
const symbol = (item: Item) => item.s;
const ids = (items: readonly Item[]) => items.map(i => i.id).join(' ');

describe('findSequenceMatches (#1861)', () => {
  it('finds the same order in every lane regardless of time', () => {
    const lanes = [lane('a', 'XABCY'), lane('b', 'ABCABC', 1000, 60)];
    const found = findSequenceMatches(lanes, ['A', 'B', 'C'], { symbol });
    expect(found.map(m => [m.laneId, m.from, m.to])).toEqual([['a', 1, 3], ['b', 0, 2], ['b', 3, 5]]);
    expect(ids(found[1].items)).toBe('b0 b1 b2');
  });
  it('does not overlap occurrences within a lane, earliest first', () => {
    expect(findSequenceMatches([lane('a', 'AAAA')], ['A', 'A'], { symbol }).map(m => m.from)).toEqual([0, 2]);
  });
  it('matches exactly: no gaps, and an empty pattern or one longer than the lane matches nothing', () => {
    expect(findSequenceMatches([lane('a', 'ABXC')], ['A', 'B', 'C'], { symbol })).toEqual([]);
    expect(findSequenceMatches([lane('a', 'AB')], ['A', 'B', 'C'], { symbol })).toEqual([]);
    expect(findSequenceMatches([lane('a', 'ABC')], [], { symbol })).toEqual([]);
  });
  it('with collapseRuns, a run of equal steps is one step and the match covers the whole runs', () => {
    const lanes = [lane('a', 'AABBBC'), lane('b', 'ABC')];
    expect(findSequenceMatches(lanes, ['A', 'B', 'C'], { symbol })).toHaveLength(1);
    const found = findSequenceMatches(lanes, ['A', 'A', 'B', 'C'], { symbol, collapseRuns: true });
    expect(found.map(m => [m.laneId, m.from, m.to])).toEqual([['a', 0, 5], ['b', 0, 2]]);
  });
});

describe('pattern helpers (#1861)', () => {
  it('itemsInRange keeps items wholly inside the range, either order', () => {
    const { items } = lane('a', 'ABCD', 0, 10);
    expect(ids(itemsInRange(items, [10, 30], i => [i.start, i.end]))).toBe('a1 a2');
    expect(ids(itemsInRange(items, [30, 10], i => [i.start, i.end]))).toBe('a1 a2');
  });
  it('sequenceSteps turns items into a pattern, collapsing runs on request', () => {
    const { items } = lane('a', 'AABC');
    expect(sequenceSteps(items, { symbol })).toEqual(['A', 'A', 'B', 'C']);
    expect(sequenceSteps(items, { symbol, collapseRuns: true })).toEqual(['A', 'B', 'C']);
  });
  it('a brushed range on one lane finds the same order elsewhere', () => {
    const lanes = [lane('a', 'XABCY', 0, 10), lane('b', 'QABCABC', 500, 3)];
    const pattern = sequenceSteps(itemsInRange(lanes[0].items, [10, 40], i => [i.start, i.end]), { symbol });
    expect(findSequenceMatches(lanes, pattern, { symbol }).map(m => `${m.laneId}${m.from}`)).toEqual(['a1', 'b1', 'b4']);
  });
});

describe('findRepeatedSequences (#1861)', () => {
  it('keeps only maximal repeats: shorter pieces with the same occurrences are dropped', () => {
    const found = findRepeatedSequences([lane('a', 'ABCDxABCDy')], { symbol });
    expect(found.map(r => r.steps.join(''))).toEqual(['ABCD']);
    expect(found[0].matches.map(m => [m.from, m.to])).toEqual([[0, 3], [5, 8]]);
  });
  it('keeps a shorter repeat that occurs more often than the longer one', () => {
    const found = findRepeatedSequences([lane('a', 'ABCDxABCDyABCq')], { symbol });
    expect(found.map(r => `${r.steps.join('')}×${r.matches.length}`)).toEqual(['ABCD×2', 'ABC×3']);
  });
  it('counts across lanes, honours minLength and minCount, and sorts longest then most frequent', () => {
    const lanes = [lane('a', 'ABqCDE'), lane('b', 'ABrCDE'), lane('c', 'ABs')];
    expect(findRepeatedSequences(lanes, { symbol }).map(r => r.steps.join(''))).toEqual(['CDE']);
    const two = findRepeatedSequences(lanes, { symbol, minLength: 2 });
    expect(two.map(r => `${r.steps.join('')}×${r.matches.length}`)).toEqual(['CDE×2', 'AB×3']);
    expect(findRepeatedSequences(lanes, { symbol, minLength: 2, minCount: 3 }).map(r => r.steps.join(''))).toEqual(['AB']);
  });
  it('treats symbols as opaque strings', () => {
    const odd = { id: 'o', items: ['a,b', 'c', 'a', 'b,c', 'a,b', 'c'].map((s, i) => ({ id: `o${i}`, s, start: i, end: i + 1 })) };
    expect(findRepeatedSequences([odd], { symbol, minLength: 2 }).map(r => r.steps)).toEqual([['a,b', 'c']]);
  });
  it('collapses runs before indexing when asked', () => {
    expect(findRepeatedSequences([lane('a', 'AABBCxABBBC')], { symbol }).map(r => r.steps.join(''))).toEqual(['ABB', 'BBC']);
    expect(findRepeatedSequences([lane('a', 'AABBCxABBBC')], { symbol, collapseRuns: true }).map(r => r.matches.map(m => [m.from, m.to]))).toEqual([[[0, 4], [6, 10]]]);
  });
  it('reports at most maxLength steps: a longer repeat comes back as every maxLength-step window of it', () => {
    const long = 'ABCDEFGHIJ';
    const found = findRepeatedSequences([lane('a', `${long}x${long}`)], { symbol, maxLength: 4 });
    expect(found.map(r => r.steps.join(''))).toEqual(['ABCD', 'BCDE', 'CDEF', 'DEFG', 'EFGH', 'FGHI', 'GHIJ']);
    expect(SEQUENCE_MAX_LENGTH).toBe(32);
  });
  it('keeps a repeat whose occurrences lie in two different longer repeats (one sequence must hold them all)', () => {
    const found = findRepeatedSequences([lane('a', 'AABAABAAABA'), lane('b', 'BBAAABABA'), lane('c', 'AABAAABAAB')], { symbol });
    const aabaa = found.find(r => r.steps.join('') === 'AABAA');
    expect(aabaa?.matches.map(m => `${m.laneId}${m.from}`)).toEqual(['a0', 'c0']);
  });
  it('counts a self-overlapping repeat apart, and keeps its matches apart', () => {
    const found = findRepeatedSequences([lane('a', 'ABABABAB')], { symbol, minLength: 2 });
    expect(found.map(r => `${r.steps.join('')}×${r.matches.length}`)).toEqual(['ABAB×2', 'AB×4', 'BA×3']);
    for (const r of found) r.matches.forEach((m, i) => { if (i > 0) expect(m.from).toBeGreaterThan(r.matches[i - 1].to); });
    expect(findRepeatedSequences([lane('a', 'AAAAAA')], { symbol }).map(r => `${r.steps.join('')}×${r.matches.length}`)).toEqual(['AAA×2']);
  });
  it('breaks ties by first occurrence across lanes', () => {
    const found = findRepeatedSequences([lane('a', 'XYZxXYZ'), lane('b', 'PQRpPQR')], { symbol }).map(r => r.steps.join(''));
    expect(found).toEqual(['XYZ', 'PQR']);
  });
  it('clamps options and treats non-finite ones as the default', () => {
    const lanes = [lane('a', 'ABxAB')];
    expect(findRepeatedSequences(lanes, { symbol, minLength: 0, minCount: 1 }).map(r => r.steps.join(''))).toEqual(['AB']);
    expect(findRepeatedSequences(lanes, { symbol, minLength: 2, maxLength: 1 }).map(r => r.steps.join(''))).toEqual(['AB']);
    expect(findRepeatedSequences([lane('a', 'ABCxABC')], { symbol, minLength: Number.NaN, maxLength: Infinity, minCount: Infinity }).map(r => r.steps.join(''))).toEqual(['ABC']);
  });
  it('matches a brute-force reading of the documented rule on random lanes', () => {
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 60; round++) {
      const lanes = Array.from({ length: 3 }, (_, l) => lane(`l${l}`, Array.from({ length: 6 + Math.floor(rnd() * 8) }, () => 'AB'[Math.floor(rnd() * 2)]).join('')));
      const got = findRepeatedSequences(lanes, { symbol, minLength: 2, maxLength: 6 }).map(r => `${r.steps.join('')}:${r.matches.map(m => `${m.laneId}.${m.from}`).join(',')}`);
      expect(got).toEqual(bruteForce(lanes, 2, 6));
    }
  });
});

/** Every window, counted apart greedily; maximal by one longer same-count window set holding each occurrence; same sort. */
function bruteForce(lanes: SequenceLane<Item>[], minLength: number, maxLength: number): string[] {
  const groups = new Map<string, { laneIndex: number; laneId: string; from: number }[]>();
  lanes.forEach((l, laneIndex) => {
    const s = l.items.map(i => i.s).join('');
    for (let len = minLength; len <= maxLength; len++) for (let i = 0; i + len <= s.length; i++) {
      const key = s.slice(i, i + len); const list = groups.get(key) ?? [];
      const last = list.filter(o => o.laneId === l.id).at(-1);
      if (!last || last.from + len <= i) list.push({ laneIndex, laneId: l.id, from: i });
      groups.set(key, list);
    }
  });
  const order = (o: { laneIndex: number; from: number }) => o.laneIndex * 1000 + o.from;
  const all = [...groups].filter(([, o]) => o.length >= 2)
    .sort(([a, x], [b, y]) => b.length - a.length || y.length - x.length || order(x[0]) - order(y[0]));
  const kept: typeof all = [];
  for (const [key, occ] of all) {
    const covered = kept.some(([k2, o2]) => k2.length > key.length && o2.length === occ.length
      && occ.every(o => o2.some(p => p.laneId === o.laneId && p.from <= o.from && o.from + key.length <= p.from + k2.length)));
    if (!covered) kept.push([key, occ]);
  }
  return kept.map(([key, occ]) => `${key}:${occ.map(o => `${o.laneId}.${o.from}`).join(',')}`);
}
