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
  it('matches exactly: no gaps, and an empty pattern matches nothing', () => {
    expect(findSequenceMatches([lane('a', 'ABXC')], ['A', 'B', 'C'], { symbol })).toEqual([]);
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
    expect(findRepeatedSequences([lane('a', 'AABBCxABBBC')], { symbol }).map(r => r.steps.join(''))).not.toContain('ABC');
    expect(findRepeatedSequences([lane('a', 'AABBCxABBBC')], { symbol, collapseRuns: true }).map(r => r.matches.map(m => [m.from, m.to]))).toEqual([[[0, 4], [6, 10]]]);
  });
  it('indexes at most maxLength steps: a longer repeat comes back as maxLength pieces', () => {
    const long = 'ABCDEFGHIJ';
    const found = findRepeatedSequences([lane('a', `${long}x${long}`)], { symbol, maxLength: 4 });
    expect(found.every(r => r.steps.length === 4)).toBe(true);
    expect(found[0].steps.join('')).toBe('ABCD');
    expect(SEQUENCE_MAX_LENGTH).toBe(32);
  });
});
