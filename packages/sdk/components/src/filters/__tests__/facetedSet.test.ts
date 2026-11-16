import { describe, expect, it } from 'vitest';
import { buildFacetedSetIndex, evaluateFacetedSet, outsideFixedIds } from '../facetedSet';

const items = [
  { id: 'one', facets: { color: ['red', 'red'], size: 'S' } },
  { id: 'two', facets: { color: 'blue', size: 'S' } },
  { id: 'three', facets: { color: 'red', size: 'L' } },
];
describe('faceted sets', () => {
  it('ORs values, ANDs facets, excludes own picks from counts and retains zero values', () => {
    const index = buildFacetedSetIndex(items);
    const result = evaluateFacetedSet(index, { color: ['red', 'blue'], size: ['L'] });
    expect(result.matches).toEqual([2]);
    expect([...result.counts.get('color')!]).toEqual([['red', 1], ['blue', 0]]);
    expect([...result.counts.get('size')!]).toEqual([['S', 2], ['L', 1]]);
    expect(outsideFixedIds(index, result.matches, ['one', 'three', 'missing'])).toEqual(['one', 'missing']);
  });
});

it('handles multi-valued and missing facets, unknown picks and an unconstrained rule', () => {
  const index = buildFacetedSetIndex([
    { id: 'a', facets: { tag: ['x', 'y'] } },
    { id: 'b', facets: { tag: ['y'] } },
    { id: 'c', facets: {} },
  ]);
  expect(evaluateFacetedSet(index, {}).matches).toEqual([0, 1, 2]);
  expect(evaluateFacetedSet(index, { tag: ['x', 'y'] }).matches).toEqual([0, 1]);
  const unknown = evaluateFacetedSet(index, { tag: ['gone'] });
  expect(unknown.matches).toEqual([]);
  expect([...unknown.counts.get('tag')!]).toEqual([['x', 1], ['y', 2]]);
  expect(evaluateFacetedSet(index, { other: ['unknown'] }).counts.get('tag')?.get('x')).toBe(0);
});

it('counts 30,000 items with an indexed cross-facet rule', () => {
  const items = Array.from({ length: 30_000 }, (_, i) => ({ id: String(i), facets: { a: String(i % 10), b: String(i % 3), tags: ['all', String(i % 2)] } }));
  const start = performance.now();
  const index = buildFacetedSetIndex(items);
  const indexed = performance.now();
  const result = evaluateFacetedSet(index, { a: ['0', '1'], b: ['0'] });
  const end = performance.now();
  expect(result.matches).toHaveLength(2000);
  expect(result.counts.get('a')?.get('9')).toBe(1000);
  expect(result.counts.get('b')?.get('2')).toBe(2000);
  expect(result.counts.get('tags')?.get('all')).toBe(2000);
  console.info(`30k index=${(indexed - start).toFixed(2)}ms evaluate=${(end - indexed).toFixed(2)}ms`);
});
