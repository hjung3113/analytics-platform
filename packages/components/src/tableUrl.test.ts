import { describe, expect, it } from 'vitest';
import { encodeTableSort, parsePageIndex, parseTableSort } from './PlatformDataTable';

describe('parsePageIndex', () => {
  it('treats null and empty as page 1 (absent key)', () => {
    expect(parsePageIndex(null)).toEqual({ ok: true, page: 1 });
    expect(parsePageIndex('')).toEqual({ ok: true, page: 1 });
  });

  it('accepts 1-based decimal page numbers', () => {
    expect(parsePageIndex('1')).toEqual({ ok: true, page: 1 });
    expect(parsePageIndex('2')).toEqual({ ok: true, page: 2 });
    expect(parsePageIndex(String(Number.MAX_SAFE_INTEGER))).toEqual({ ok: true, page: Number.MAX_SAFE_INTEGER });
  });

  it('rejects 0, leading zeros, signs, fractions, non-digits, unsafe integers', () => {
    expect(parsePageIndex('0')).toEqual({ ok: false });
    expect(parsePageIndex('01')).toEqual({ ok: false });
    expect(parsePageIndex('-1')).toEqual({ ok: false });
    expect(parsePageIndex('+1')).toEqual({ ok: false });
    expect(parsePageIndex('1.5')).toEqual({ ok: false });
    expect(parsePageIndex('foo')).toEqual({ ok: false });
    expect(parsePageIndex(String(Number.MAX_SAFE_INTEGER) + '0')).toEqual({ ok: false });
    expect(parsePageIndex('9'.repeat(40))).toEqual({ ok: false });
  });
});

describe('parseTableSort', () => {
  const allowed = ['status', 'name2_x'];

  it('treats null and empty as unsorted', () => {
    expect(parseTableSort(null, allowed)).toEqual({ ok: true, sorting: [] });
    expect(parseTableSort('', allowed)).toEqual({ ok: true, sorting: [] });
  });

  it('accepts exactly one allowed column with asc|desc', () => {
    expect(parseTableSort('status:asc', allowed)).toEqual({ ok: true, sorting: [{ id: 'status', desc: false }] });
    expect(parseTableSort('status:desc', allowed)).toEqual({ ok: true, sorting: [{ id: 'status', desc: true }] });
    expect(parseTableSort('name2_x:desc', allowed)).toEqual({ ok: true, sorting: [{ id: 'name2_x', desc: true }] });
  });

  it('rejects unknown columns, bad directions, wrong shapes — no silent fallback', () => {
    expect(parseTableSort('nope:asc', allowed)).toEqual({ ok: false });
    expect(parseTableSort('status:up', allowed)).toEqual({ ok: false });
    expect(parseTableSort('a:asc:extra', allowed)).toEqual({ ok: false });
    expect(parseTableSort('status:asc:asc', allowed)).toEqual({ ok: false });
    expect(parseTableSort('1col:asc', allowed)).toEqual({ ok: false });
    expect(parseTableSort('_x:asc', allowed)).toEqual({ ok: false });
    expect(parseTableSort(':asc', allowed)).toEqual({ ok: false });
    expect(parseTableSort('status', allowed)).toEqual({ ok: false });
    expect(parseTableSort('status:ASC', allowed)).toEqual({ ok: false });
    expect(parseTableSort('status:asc', [])).toEqual({ ok: false });
  });
});

describe('encodeTableSort', () => {
  it('returns null when sorting is empty', () => {
    expect(encodeTableSort([])).toBeNull();
  });

  it('encodes the first sorting entry only', () => {
    expect(encodeTableSort([{ id: 'status', desc: true }])).toBe('status:desc');
    expect(encodeTableSort([{ id: 'status', desc: false }])).toBe('status:asc');
    expect(encodeTableSort([{ id: 'status', desc: false }, { id: 'name2_x', desc: true }])).toBe('status:asc');
  });

  it('round-trips with parseTableSort', () => {
    const parsed = parseTableSort('status:desc', ['status']);
    if (!parsed.ok) throw new Error('expected ok');
    expect(encodeTableSort(parsed.sorting)).toBe('status:desc');
  });
});
