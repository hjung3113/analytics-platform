import { describe, expect, it } from 'vitest';
import { buildQuery, emptyGlobal, parseQuery, type MenuMeta } from '@ap/contracts';
import { decodePageConditions, encodePageConditions, derivePageConditionExtension } from '../page-conditions';

const label = { ko: '조건', en: 'Condition' };
const menu: Pick<MenuMeta, 'pageConditions'> = { pageConditions: { categories: [
  { id: 'choice', label, kind: { type: 'select', key: 'choice', options: { static: [{ value: 'a', label: { ko: '가', en: 'A' } }] } } },
  { id: 'many', label, kind: { type: 'multi', key: 'many', options: { static: [] } } },
  { id: 'search', label, kind: { type: 'search', key: 'q' } },
  { id: 'range', label, kind: { type: 'range', key: 'r' } },
  { id: 'date', label, kind: { type: 'date', from: 'start', to: 'end' } },
  { id: 'groups', label, kind: { type: 'groupedChecks', source: 'groups', lists: [{ id: 'one', key: 'one', label }, { id: 'two', key: 'two', label }] } },
  { id: 'tree', label, kind: { type: 'tree', source: 'tree', key: 'nodes', value: 'nodes' } },
] } };

describe('page condition codec', () => {
  it('round-trips every kind, keeps list order, escapes reserved values and keeps unknown ids', () => {
    const values = { choice: ['a'], many: ['unknown', '~none', '~value'], q: ['text'], r: { min: null, max: 4 }, start: ['2026-11-01T00:00:00'], end: ['2026-11-02T00:00:00'], one: [], two: ['b'], nodes: ['parent'] };
    const pairs = encodePageConditions(menu, values);
    expect(pairs).toContainEqual(['many', '~~none']);
    expect(pairs).toContainEqual(['one', '~none']);
    expect(decodePageConditions(menu, pairs)).toEqual({ values, issues: [] });
  });
  it.each([
    [['r', '5..2']], [['r', 'x..2']], [['r', '..']], [['r', 'Infinity..2']],
    [['start', '2026-02-30T00:00:00']], [['start', '2026-11-01T00:00:00Z']],
    [['choice', 'a'], ['choice', 'b']], [['many', '~none'], ['many', 'a']], [['many', '~bad']], [['many', '']],
    [['start', '2026-11-02T00:00:00'], ['end', '2026-11-01T00:00:00']],
  ].map(pairs => ({ pairs })))('rejects malformed pairs $pairs without repairing', ({ pairs }) => {
    const result = decodePageConditions(menu, pairs as [string, string][]);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.values).toEqual({});
  });
  it('represents absence separately from explicit empty selection', () => {
    expect(decodePageConditions(menu, []).values).toEqual({});
    expect(decodePageConditions(menu, [['many', '~none']]).values).toEqual({ many: [] });
  });
  it('refuses count and encoded length caps without truncating', () => {
    expect(() => encodePageConditions(menu, { many: Array.from({ length: 51 }, (_, i) => String(i)) })).toThrow(/too-many-values/);
    expect(() => encodePageConditions(menu, { q: ['한'.repeat(300)] })).toThrow(/too-long/);
    expect(encodePageConditions(menu, { many: Array.from({ length: 50 }, (_, i) => String(i)) })).toHaveLength(50);
  });
  it('derives draft, applied and candidate history independently; owns declared keys only', () => {
    const legacy = { pageSummary: [{ key: 'custom', label: 'Custom', value: 'kept' }, { key: 'choice', label: 'stale', value: 'stale' }], appliedPageSummary: [], issues: [{ key: 'choice', label: 'stale', reason: 'stale' }], historyPageSummary: () => [{ key: 'custom', label: 'Custom', value: 'history' }] };
    const result = derivePageConditionExtension({ menu, draft: [['choice', 'a']], applied: [['choice', 'other']], lang: 'en', extension: legacy });
    expect(result.pageSummary).toEqual([{ key: 'choice', label: 'Condition', value: 'A' }, legacy.pageSummary[0]]);
    expect(result.appliedPageSummary).toEqual([{ key: 'choice', label: 'Condition', value: 'other' }]);
    expect(result.issues).toEqual([]);
    expect(result.historyPageSummary?.(emptyGlobal, [['choice', 'a']])).toEqual([{ key: 'choice', label: 'Condition', value: 'A' }, { key: 'custom', label: 'Custom', value: 'history' }]);
  });
  it('leaves an undeclared menu and its URL byte-identical', () => {
    const page: [string, string][] = [['q', '~none']];
    const before = buildQuery(emptyGlobal, page);
    expect(decodePageConditions({}, page)).toEqual({ values: {}, issues: [] });
    expect(buildQuery(emptyGlobal, parseQuery(before, ['q']).page)).toBe(before);
  });
});

it('uses candidate metadata independently for draft, applied and history summaries', () => {
  const dynamic = { pageConditions: { categories: [{ id: 'choice', label, kind: { type: 'select' as const, key: 'choice', options: { endpoint: 'options' } } }] } };
  const options = (name: string) => ({ choice: [{ value: 'a', label: { ko: name, en: name } }] });
  const result = derivePageConditionExtension({ menu: dynamic, lang: 'en', draft: [['choice', 'a']], applied: [['choice', 'a']], options: options('Draft'), appliedOptions: options('Applied'), historyOptions: () => options('History') });
  expect(result.pageSummary[0].value).toBe('Draft');
  expect(result.appliedPageSummary?.[0].value).toBe('Applied');
  expect(result.historyPageSummary?.(emptyGlobal, [['choice', 'a']])[0].value).toBe('History');
  const unloaded = derivePageConditionExtension({ menu: dynamic, lang: 'en', draft: [['choice', 'a']], applied: [['choice', 'a']], options: options('Draft') });
  expect(unloaded.appliedPageSummary?.[0].value).toBe('a');
  expect(unloaded.historyPageSummary?.(emptyGlobal, [['choice', 'a']])[0].value).toBe('a');
});

it('keeps valid categories and raw pairs while reporting a malformed category', () => {
  const pairs: [string, string][] = [['choice', 'a'], ['r', '4..2']];
  const snapshot = JSON.stringify(pairs);
  const result = decodePageConditions(menu, pairs);
  expect(result.values).toEqual({ choice: ['a'] });
  expect(result.issues).toEqual([{ key: 'r', categoryId: 'range', reason: 'invalid-range' }]);
  expect(JSON.stringify(pairs)).toBe(snapshot);
  const extension = derivePageConditionExtension({ menu, lang: 'en', draft: pairs, applied: [['choice', 'a']] });
  expect(extension.issues).toEqual([{ key: 'r', label: 'Condition', reason: 'invalid-range' }]);
});

it('counts all grouped lists together and enforces the menu-wide encoded budget', () => {
  const many = Array.from({ length: 26 }, (_, index) => String(index));
  expect(() => encodePageConditions(menu, { one: many, two: many })).toThrow(/too-many-values/);
  expect(() => encodePageConditions(menu, { choice: ['a'.repeat(1300)], q: ['b'.repeat(1300)] })).toThrow(/too-long/);
});

it.each(['1..', '-2.5..4', '1e2..200', '..-1'])('round-trips the numeric meaning of range %s', raw => {
  const result = decodePageConditions(menu, [['r', raw]]);
  expect(result.issues).toEqual([]);
  expect(decodePageConditions(menu, encodePageConditions(menu, result.values))).toEqual(result);
});

it('treats unusual declared page keys as data without inheriting object properties', () => {
  const unusual = { pageConditions: { categories: [{ id: 'query', label, kind: { type: 'search' as const, key: '__proto__' } }, { id: 'other', label, kind: { type: 'search' as const, key: 'constructor' } }] } };
  const values = Object.fromEntries([['__proto__', ['literal']]]);
  const decoded = decodePageConditions(unusual, [['__proto__', 'literal']]);
  expect(Object.hasOwn(decoded.values, '__proto__')).toBe(true);
  expect(decoded.values['__proto__']).toEqual(['literal']);
  expect(encodePageConditions(unusual, values)).toEqual([['__proto__', 'literal']]);
  expect(derivePageConditionExtension({ menu: unusual, lang: 'en', draft: [], applied: [] }).pageSummary).toEqual([]);
});


it('matches a handwritten all-kind fixture summary in declaration order', () => {
  const result = derivePageConditionExtension({ menu, lang: 'en', draft: [['choice', 'a'], ['many', 'b'], ['many', 'c'], ['q', 'find'], ['r', '1..4'], ['start', '2026-11-01T00:00:00'], ['end', '2026-11-02T00:00:00'], ['one', 'first'], ['two', 'second'], ['nodes', 'parent']], applied: [] });
  expect(result.pageSummary).toEqual([
    { key: 'choice', label: 'Condition', value: 'A' },
    { key: 'many', label: 'Condition', value: 'b, c' },
    { key: 'q', label: 'Condition', value: 'find' },
    { key: 'r', label: 'Condition', value: '1..4' },
    { key: 'start', label: 'Condition', value: '2026-11-01T00:00:00' },
    { key: 'end', label: 'Condition', value: '2026-11-02T00:00:00' },
    { key: 'one', label: 'Condition', value: 'first' },
    { key: 'two', label: 'Condition', value: 'second' },
    { key: 'nodes', label: 'Condition', value: 'parent' },
  ]);
});


it('accepts the exact encoded budget and refuses one extra character', () => {
  const maximum = 'a'.repeat(2397); // q= plus the final & cost three encoded characters.
  expect(encodePageConditions(menu, { q: [maximum] })).toEqual([['q', maximum]]);
  expect(() => encodePageConditions(menu, { q: [maximum + 'a'] })).toThrow(/too-long/);
});

it('reads option metadata from own entries only, so ids such as constructor keep the raw value', () => {
  const dynamic = { pageConditions: { categories: ['constructor', 'toString'].map(id => ({ id, label, kind: { type: 'select' as const, key: id, options: { endpoint: 'options' } } })) } };
  const result = derivePageConditionExtension({ menu: dynamic, lang: 'en', draft: [['constructor', 'a'], ['toString', 'b']], applied: [], options: {} });
  expect(result.pageSummary.map(item => item.value)).toEqual(['a', 'b']);
});

it('passes the legacy extension through untouched when no category is declared', () => {
  const legacy = { pageSummary: [{ key: 'custom', label: 'Custom', value: 'kept' }], issues: [] };
  const result = derivePageConditionExtension({ menu: {}, lang: 'en', draft: [], applied: [], extension: legacy });
  expect(result.pageSummary).toEqual(legacy.pageSummary);
  expect(result.appliedPageSummary).toBeUndefined();
  expect(result.historyPageSummary).toBeUndefined();
});
