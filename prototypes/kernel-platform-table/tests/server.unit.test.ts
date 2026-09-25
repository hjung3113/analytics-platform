import { describe, expect, it } from 'vitest';
import { queryFixture } from '../src/fixture/server';
describe('Node-only paged synthetic server', () => {
  it('returns only 250 of 2000 rows with disjoint next page', () => {
    const first = queryFixture(new URLSearchParams());
    const next = queryFixture(new URLSearchParams('page=1'));
    expect(first.total).toBe(2000); expect(first.rows).toHaveLength(250);
    expect(next.rows).toHaveLength(250); expect(next.rows.some(row => first.rows.some(a => a.id === row.id))).toBe(false);
  });
  it('filters before slicing, with exact total', () => {
    const result = queryFixture(new URLSearchParams('category=C&page=1'));
    expect(result.total).toBe(500); expect(result.rows).toHaveLength(250);
    expect(result.rows.every(row => row.category === 'C')).toBe(true);
  });
  it('sorts across the entire filtered result before pagination', () => {
    const a = queryFixture(new URLSearchParams('category=A&sort=numericValue&desc=true'));
    const b = queryFixture(new URLSearchParams('category=A&sort=numericValue&desc=true&page=1'));
    const values = [...a.rows, ...b.rows].map(row => row.numericValue);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(500);
  });
  it('rejects oversized pages and unsupported filter/sort', () => {
    for (const query of ['pageSize=2000', 'page=-1', 'page=0.5', 'sort=unknown', 'category=unknown']) expect(() => queryFixture(new URLSearchParams(query))).toThrow('Invalid fixture query');
  });
  it('returns empty beyond the final page', () => expect(queryFixture(new URLSearchParams('page=8')).rows).toEqual([]));
});
