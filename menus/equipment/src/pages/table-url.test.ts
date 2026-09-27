import { describe, expect, it } from 'vitest';
import { encodeTableSort, parsePageIndex, parseTableSort } from '@ap/components';
import { fields, sortFields } from './data';

// equipment-master 06 §6.1 page keys: sort/page are wire format owned by the page.
// The allow-list must stay exactly the data.ts field keys, so a hand-edited list or a
// synthetic column (_select/_action) can never become a legal sort value.

describe('equipment-master sort allow-list', () => {
  it('is exactly the data.ts field keys — never the synthetic _select/_action columns', () => {
    expect(sortFields).toEqual(fields.map(f => f.key));
    expect(sortFields).not.toContain('_select');
    expect(sortFields).not.toContain('_action');
    expect(sortFields).toContain('status');
    expect(new Set(sortFields).size).toBe(sortFields.length);
  });

  it('accepts every field key through parseTableSort and round-trips encodeTableSort', () => {
    for (const key of sortFields) {
      const parsed = parseTableSort(`${key}:desc`, sortFields);
      if (!parsed.ok) throw new Error(`field ${key} must be a legal sort value`);
      expect(encodeTableSort(parsed.sorting)).toBe(`${key}:desc`);
    }
  });

  it('rejects unknown columns and malformed values with no silent fallback', () => {
    expect(parseTableSort('status:desc', sortFields)).toEqual({ ok: true, sorting: [{ id: 'status', desc: true }] });
    expect(parseTableSort('status:asc', sortFields)).toEqual({ ok: true, sorting: [{ id: 'status', desc: false }] });
    expect(parseTableSort('_select:asc', sortFields)).toEqual({ ok: false });
    expect(parseTableSort('nope:asc', sortFields)).toEqual({ ok: false });
    expect(parseTableSort('status:up', sortFields)).toEqual({ ok: false });
    expect(parseTableSort('status:asc:extra', sortFields)).toEqual({ ok: false });
    expect(parseTableSort(null, sortFields)).toEqual({ ok: true, sorting: [] });
  });
});

describe('equipment-master page index codec', () => {
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
