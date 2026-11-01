import { describe, expect, it } from 'vitest';
import {
  FILTER_PARAM_LIMITS, encodeFilterParam, encodeFilterParams, filterParamLimit, parseFilterParams,
  type ColumnFilter, type ColumnFilterSpec,
} from '@ap/contracts';

/** `SHARE_LINK_MAX_LENGTH` of `@ap/shell` (components cannot import shell): pinned here, the share-link test in shell owns the real value. */
const SHARE_LINK_MAX_LENGTH_FOR_TEST = 4000;

const specs: Record<string, ColumnFilterSpec> = {
  name: { kind: 'text' },
  size: { kind: 'number' },
  day: { kind: 'date' },
  at: { kind: 'instant' },
  kind: { kind: 'enum', options: [{ value: 'a', label: 'A' }] },
  one: { kind: 'enum', options: [{ value: 'a', label: 'A' }], multiple: false },
  limited: { kind: 'text', ops: ['equals'] },
  child: { kind: 'text', requires: ['name'] },
};

const HOSTILE = ['a:b', 'x,y', 'a~b', 'back\\slash', '\\~', '~\\', ' leading and trailing ', '한글 제조사:콤마,틸드~', 'a%2Fb', '', '"quoted"', 'a=b&c=d'];

describe('filter URL codec (ADR-0105 §6)', () => {
  it.each(HOSTILE)('round-trips the text value %j for every text op', value => {
    for (const op of ['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals'] as const) {
      const filter: ColumnFilter = { id: 'name', op, value };
      expect(parseFilterParams([encodeFilterParam(filter)], specs)).toEqual({ ok: true, filters: [filter] });
    }
  });

  it('round-trips in/notIn lists whose items hold the separators, spaces, Korean and empty strings', () => {
    for (const op of ['in', 'notIn'] as const) {
      const filter: ColumnFilter = { id: 'kind', op, value: HOSTILE };
      expect(parseFilterParams([encodeFilterParam(filter)], specs)).toEqual({ ok: true, filters: [filter] });
    }
    expect(encodeFilterParam({ id: 'kind', op: 'in', value: ['a~b', 'c\\'] })).toBe('kind:in:a\\~b~c\\\\');
    expect(encodeFilterParam({ id: 'kind', op: 'in', value: ['삼성,SK', 'LG:V2'] })).toBe('kind:in:삼성,SK~LG:V2');
  });

  it.each<[string, ColumnFilter]>([
    ['isEmpty has no value part', { id: 'name', op: 'isEmpty' }],
    ['isNotEmpty has no value part', { id: 'size', op: 'isNotEmpty' }],
    ['number scalar', { id: 'size', op: 'gte', value: -1.5 }],
    ['number exponent', { id: 'size', op: 'lt', value: 1e21 }],
    ['number range', { id: 'size', op: 'between', value: [-2, 1000.25] }],
    ['date before', { id: 'day', op: 'before', value: '2026-01-31' }],
    ['date range both ends', { id: 'day', op: 'between', value: { from: '2026-01-01', to: '2026-02-01' } }],
    ['date range open end', { id: 'day', op: 'between', value: { from: '2026-01-01' } }],
    ['date range open start', { id: 'day', op: 'between', value: { to: '2026-02-01' } }],
    ['instant range', { id: 'at', op: 'between', value: { from: '2026-01-01T00:00:00+09:00', to: '2026-01-02T00:00:00Z' } }],
    ['value with colons after the op', { id: 'name', op: 'equals', value: 'Future.Type:v2' }],
  ])('round-trips %s', (_name, filter) => {
    expect(parseFilterParams([encodeFilterParam(filter)], specs)).toEqual({ ok: true, filters: [filter] });
  });

  it('writes the documented format', () => {
    expect(encodeFilterParams([{ id: 'name', op: 'equals', value: 'Future.Type:v2' }, { id: 'name2', op: 'isEmpty' }])).toEqual(['name:equals:Future.Type:v2', 'name2:isEmpty']);
    expect(encodeFilterParam({ id: 'day', op: 'between', value: { from: '2026-01-01' } })).toBe('day:between:2026-01-01~');
    expect(encodeFilterParam({ id: 'size', op: 'between', value: [1, 2] })).toBe('size:between:1~2');
  });

  it('parses an empty list as no filters and keeps URL order', () => {
    expect(parseFilterParams([], specs)).toEqual({ ok: true, filters: [] });
    const result = parseFilterParams(['size:gt:3', 'name:contains:x'], specs);
    expect(result.ok && result.filters.map(f => f.id)).toEqual(['size', 'name']);
  });

  it('refuses to encode an id that cannot be decoded', () => {
    expect(() => encodeFilterParam({ id: 'a:b', op: 'isEmpty' })).toThrow(RangeError);
    expect(() => encodeFilterParam({ id: '', op: 'isEmpty' })).toThrow(RangeError);
    expect(() => encodeFilterParam({ id: 'size', op: 'eq', value: Number.NaN })).toThrow(RangeError);
  });

  it.each<[string, string[], string]>([
    ['no colon', ['name'], 'malformed'],
    ['no op', ['name:'], 'malformed'],
    ['empty id', [':contains:x'], 'malformed'],
    ['unknown op', ['name:regex:x'], 'malformed'],
    ['op missing its value', ['name:contains'], 'malformed'],
    ['bad escape', ['kind:in:a\\b'], 'malformed'],
    ['trailing escape', ['kind:in:a\\'], 'malformed'],
    ['range with one part', ['day:between:2026-01-01'], 'malformed'],
    ['range with three parts', ['day:between:2026-01-01~2026-02-01~2026-03-01'], 'malformed'],
    ['isEmpty with a value', ['name:isEmpty:x'], 'bad-value'],
    ['isEmpty with a trailing colon', ['name:isEmpty:'], 'bad-value'],
    ['NaN number', ['size:gt:abc'], 'bad-value'],
    ['empty number', ['size:gt:'], 'bad-value'],
    ['Infinity number', ['size:gt:Infinity'], 'bad-value'],
    ['number range half empty', ['size:between:1~'], 'bad-value'],
    ['impossible date', ['day:before:2026-02-30'], 'bad-value'],
    ['empty range', ['day:between:~'], 'bad-value'],
    ['date range with an instant', ['day:between:2026-01-01T00:00:00Z~'], 'bad-value'],
    ['undeclared field', ['nope:contains:x'], 'undeclared-field'],
    ['inherited name is not a field', ['constructor:contains:x'], 'undeclared-field'],
    ['op of another kind', ['name:gt:3'], 'op-not-allowed'],
    ['op outside the spec ops', ['limited:contains:x'], 'op-not-allowed'],
    ['second condition on one field', ['name:contains:a', 'name:equals:b'], 'duplicate-field'],
    ['enum multiple:false with two values', ['one:in:a~b'], 'multiple-not-allowed'],
    ['requires unmet', ['child:contains:x'], 'requires-unmet'],
  ])('rejects %s', (_name, values, reason) => {
    const result = parseFilterParams(values, specs);
    expect(result).toMatchObject({ ok: false, reason });
    expect(values).toContain((result as { value: string }).value);
  });

  it('reports the offending raw value, not the first one', () => {
    expect(parseFilterParams(['name:contains:ok', 'size:gt:abc', 'day:before:2026-02-30'], specs)).toEqual({ ok: false, reason: 'bad-value', value: 'size:gt:abc' });
    expect(parseFilterParams(['child:contains:x', 'name:contains:ok'], specs)).toEqual({ ok: true, filters: [{ id: 'child', op: 'contains', value: 'x' }, { id: 'name', op: 'contains', value: 'ok' }] });
    expect(parseFilterParams(['child:contains:x', 'size:gt:1'], specs)).toEqual({ ok: false, reason: 'requires-unmet', value: 'child:contains:x' });
  });

  describe('caps', () => {
    const wide: Record<string, ColumnFilterSpec> = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, { kind: 'text' } as ColumnFilterSpec]));
    const enumSpecs: Record<string, ColumnFilterSpec> = { kind: { kind: 'enum', options: [] } };

    it('accepts exactly the condition cap and rejects one more', () => {
      const values = Array.from({ length: FILTER_PARAM_LIMITS.conditions }, (_, i) => `f${i}:equals:x`);
      expect(parseFilterParams(values, wide).ok).toBe(true);
      expect(parseFilterParams([...values, 'f30:equals:x'], wide)).toEqual({ ok: false, reason: 'too-many-conditions', value: 'f30:equals:x' });
      expect(filterParamLimit([...values, 'f30:equals:x'])).toBe('too-many-conditions');
    });

    it('accepts exactly the list cap and rejects one more', () => {
      const items = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
      const at = encodeFilterParam({ id: 'kind', op: 'in', value: items(FILTER_PARAM_LIMITS.listValues) });
      expect(parseFilterParams([at], enumSpecs).ok).toBe(true);
      expect(filterParamLimit([at])).toBeNull();
      const over = encodeFilterParam({ id: 'kind', op: 'notIn', value: items(FILTER_PARAM_LIMITS.listValues + 1) });
      expect(parseFilterParams([over], enumSpecs)).toEqual({ ok: false, reason: 'too-many-values', value: over });
      expect(filterParamLimit([over])).toBe('too-many-values');
    });

    it('rejects a link that would be too long even within both counts', () => {
      const long = `f0:equals:${'가'.repeat(300)}`;
      expect(parseFilterParams([long], wide)).toEqual({ ok: false, reason: 'too-long', value: long });
      expect(filterParamLimit([long])).toBe('too-long');
    });

    it('a capped worst realistic link (long Korean values at the encoded budget) stays under the 4000-character share limit', () => {
      // Fill the budget with Korean text, the most expensive realistic characters (9 percent-encoded chars each), over many conditions.
      const values: string[] = [];
      while (filterParamLimit([...values, `f${values.length}:contains:${'제조사명'.repeat(10)}`]) === null) values.push(`f${values.length}:contains:${'제조사명'.repeat(10)}`);
      expect(values.length).toBeGreaterThan(1);
      expect(parseFilterParams(values, wide).ok).toBe(true);
      const query = values.map(value => `filter=${encodeURIComponent(value)}`).join('&');
      const path = '/mars/equipment/master?v=1&from=2026-01-01T00%3A00&to=2026-02-01T00%3A00&scopeId=fab-a1-long-scope&sort=name%3Adesc&page=12&q=' + encodeURIComponent('검색어'.repeat(10));
      expect(`https://platform.example.internal${path}&${query}`.length).toBeLessThan(SHARE_LINK_MAX_LENGTH_FOR_TEST);
    });
  });
});
