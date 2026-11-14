import { describe, expect, it } from 'vitest';
import { sortAndPage, sortRows } from '@ap/contracts';

// @ap/contracts has no test script; its paging helpers are the mock server's half of a PageQuery, so they are tested here (#173 review N-P3-7).
type Row = { id: string; v: number | null };
const rows: Row[] = [{ id: 'a', v: 2 }, { id: 'b', v: null }, { id: 'c', v: 1 }, { id: 'd', v: 2 }];

describe('sortRows', () => {
  it('sorts by the first key without slicing: stable ties, nulls last, desc reverses', () => {
    expect(sortRows(rows, [{ id: 'v', desc: false }]).map(r => r.id)).toEqual(['c', 'a', 'd', 'b']);
    expect(sortRows(rows, [{ id: 'v', desc: true }]).map(r => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortRows(rows, []).map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('orders text naturally: digit runs as numbers, case ignored, ties stable, desc reverses (#2218)', () => {
    const names = ['EQ-10', 'EQ-2', 'eq-3', 'EQ-1', 'Eq-2'].map((name, at) => ({ id: String(at), name }));
    expect(sortRows(names, [{ id: 'name', desc: false }]).map(r => r.name)).toEqual(['EQ-1', 'EQ-2', 'Eq-2', 'eq-3', 'EQ-10']);
    expect(sortRows(names, [{ id: 'name', desc: true }]).map(r => r.name)).toEqual(['EQ-10', 'eq-3', 'EQ-2', 'Eq-2', 'EQ-1']);
    expect(sortRows([{ name: 'b' }, { name: null }, { name: 'A' }], [{ id: 'name', desc: false }]).map(r => r.name)).toEqual(['A', 'b', null]);
  });
  it('does not mutate its input', () => {
    sortRows(rows, [{ id: 'v', desc: true }]);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('is the order sortAndPage pages through: concatenated pages equal the full sort', () => {
    const sorting = [{ id: 'v', desc: true }];
    const pages = [0, 1].flatMap(page => sortAndPage(rows, { page, pageSize: 2, sorting }).rows);
    expect(pages).toEqual(sortRows(rows, sorting));
    expect(sortAndPage(rows, { page: 1, pageSize: 3, sorting }).total).toBe(4);
  });
});
