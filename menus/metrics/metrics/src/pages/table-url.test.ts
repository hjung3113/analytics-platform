import { describe, expect, it } from 'vitest';
import { encodeTableSort, parsePageIndex, parseTableSort } from '@ap/components';
import { sortColumns } from '../endpoints';

// metric-catalog 06 §6.1 page keys: sort/page are wire format owned by the page.
// The allow-list must stay exactly the catalog's table columns (06 §2 metric-catalog row),
// so a synthetic column (_select) or a renamed id can never become a legal sort value.

describe('metric-catalog sort allow-list', () => {
  it('is exactly the catalog table columns in table order', () => {
    expect(sortColumns).toEqual([
      'metricId', 'nameSort', 'domain', 'grain', 'numerator', 'denominator', 'publishedPointer', 'status', 'owner', 'updatedAt',
    ]);
    expect(new Set(sortColumns).size).toBe(sortColumns.length);
    expect(sortColumns).not.toContain('_select');
  });

  it('accepts every column id through parseTableSort and round-trips encodeTableSort', () => {
    for (const id of sortColumns) {
      const parsed = parseTableSort(`${id}:desc`, sortColumns);
      if (!parsed.ok) throw new Error(`column ${id} must be a legal sort value`);
      expect(encodeTableSort(parsed.sorting)).toBe(`${id}:desc`);
    }
  });

  it('rejects unknown columns and malformed values with no silent fallback', () => {
    expect(parseTableSort('status:desc', sortColumns)).toEqual({ ok: true, sorting: [{ id: 'status', desc: true }] });
    expect(parseTableSort('status:asc', sortColumns)).toEqual({ ok: true, sorting: [{ id: 'status', desc: false }] });
    expect(parseTableSort('_select:asc', sortColumns)).toEqual({ ok: false });
    expect(parseTableSort('version:asc', sortColumns)).toEqual({ ok: false });
    expect(parseTableSort('nope:asc', sortColumns)).toEqual({ ok: false });
    expect(parseTableSort('status:up', sortColumns)).toEqual({ ok: false });
    expect(parseTableSort('status:asc:extra', sortColumns)).toEqual({ ok: false });
    expect(parseTableSort(null, sortColumns)).toEqual({ ok: true, sorting: [] });
  });
});

describe('metric-catalog page index codec', () => {
  it('treats an absent key (null or empty) as page 1', () => {
    expect(parsePageIndex(null)).toEqual({ ok: true, page: 1 });
    expect(parsePageIndex('')).toEqual({ ok: true, page: 1 });
  });

  it('accepts 1-based decimal pages', () => {
    expect(parsePageIndex('1')).toEqual({ ok: true, page: 1 });
    expect(parsePageIndex('2')).toEqual({ ok: true, page: 2 });
  });

  it('rejects 0, leading zeros, signs, fractions, non-digits, unsafe integers', () => {
    for (const raw of ['0', '01', '-1', '+1', '1.5', 'foo', '9'.repeat(40)]) {
      expect(parsePageIndex(raw)).toEqual({ ok: false });
    }
  });
});
