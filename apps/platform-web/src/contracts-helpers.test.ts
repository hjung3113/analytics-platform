import { describe, expect, it } from 'vitest';
import { NO_FEATURES, filterRows, groupPage, validateFilters, type ColumnFilter, type ColumnFilterSpec, RETURN_TO_KEY, carriesReturnTo, compareAuditEvents, contextCapabilities, isRecord, withoutReturnTo, type AuditEvent, type Capability, type ContextKey } from '@ap/contracts';

// #673: shared @ap/contracts helpers — the manifest defaults every menu index and the gen-menu scaffold share (06 §5), `isRecord`, and the `returnTo` rule (#851).
const ALL_UNSUPPORTED: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

describe('contextCapabilities', () => {
  it('marks every Context key unsupported by default, Line/PRC included (#552)', () => {
    expect(contextCapabilities()).toEqual(ALL_UNSUPPORTED);
    expect(Object.keys(contextCapabilities())).toEqual(Object.keys(ALL_UNSUPPORTED));
  });

  it('overrides only the declared keys and keeps the key order', () => {
    const context = contextCapabilities({ metric: 'apply', time: 'reference', lot: 'unsupported' });
    expect(context).toEqual({ ...ALL_UNSUPPORTED, metric: 'apply', time: 'reference' });
    expect(Object.keys(context)).toEqual(Object.keys(ALL_UNSUPPORTED));
  });

  it('returns a new object per call', () => {
    const a = contextCapabilities();
    const b = contextCapabilities();
    expect(a).not.toBe(b);
    a.time = 'apply';
    expect(b.time).toBe('unsupported');
    expect(contextCapabilities().time).toBe('unsupported');
  });
});

describe('NO_FEATURES', () => {
  it('turns every feature flag off and leaves board absent', () => {
    expect(NO_FEATURES).toEqual({ export: false, savedView: false, annotate: false, compare: false });
    expect('board' in NO_FEATURES).toBe(false);
  });

  it('spreads into a manifest features record that turns one flag on', () => {
    expect({ ...NO_FEATURES, export: true, board: true }).toEqual({ export: true, savedView: false, annotate: false, compare: false, board: true });
  });
});

describe('isRecord', () => {
  it('accepts non-null, non-array objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord(new Date(0))).toBe(true); // no prototype check
  });

  it.each([null, undefined, [], [1], 'x', 1, true, () => {}])('rejects %s', value => {
    expect(isRecord(value)).toBe(false);
  });
});

describe('returnTo is navigation state (#851, ADR-0081 UX-10)', () => {
  it('names the page key once', () => {
    expect(RETURN_TO_KEY).toBe('returnTo');
  });

  it('withoutReturnTo drops every returnTo pair and keeps the rest in order', () => {
    const pairs: [string, string][] = [['tab', 'a'], ['returnTo', '/x'], ['focus', 'f'], ['returnTo', '/y']];
    expect(withoutReturnTo(pairs)).toEqual([['tab', 'a'], ['focus', 'f']]);
    expect(pairs).toHaveLength(4);
  });

  it('carriesReturnTo is true only for a carry set that lists returnTo', () => {
    expect(carriesReturnTo({ pageKeys: ['managedSystem', 'returnTo'] })).toBe(true);
    expect(carriesReturnTo({ pageKeys: ['managedSystem'] })).toBe(false);
    expect(carriesReturnTo({ pageKeys: [] })).toBe(false);
    expect(carriesReturnTo(null)).toBe(false);
    expect(carriesReturnTo(undefined)).toBe(false);
  });
});

describe('compareAuditEvents', () => {
  const event = (id: string, at: string): AuditEvent => ({ id, at, actor: 'u', action: 'update', source: 'user', target: { type: 'equipment', id: 'e1', scopeId: null } });

  it('puts the later instant first and breaks an equal instant by id ascending, across Z and +09:00 (ADR-0085)', () => {
    // 11:00+09:00 equals 02:00Z, so 'b' ties with 'a' (id ascending) and sits after 'c' (03:00Z); a string compare would put it first.
    const events = [event('b', '2026-09-26T11:00:00+09:00'), event('c', '2026-09-26T03:00:00Z'), event('a', '2026-09-26T02:00:00.000Z'), event('d', '2026-09-26T01:30:00Z')];
    expect([...events].sort(compareAuditEvents).map(e => e.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('filterRows (column filters, ADR-0104)', () => {
  type R = { name: string | null; n: number | null; d: string | null; s: string };
  const rows: R[] = [
    { name: 'Alpha', n: 1, d: '2026-01-05T09:00:00', s: 'a' },
    { name: 'beta', n: 5, d: '2026-01-06', s: 'b' },
    { name: 'GAMMA', n: 10, d: '2026-01-07T23:59:59', s: 'c' },
    { name: null, n: null, d: null, s: 'a' },
  ];
  const ids = (f: ColumnFilter[] | undefined) => filterRows(rows, f).map(r => r.name);

  it('empty or absent filters keep every row (a copy)', () => {
    expect(filterRows(rows, undefined)).toEqual(rows);
    expect(filterRows(rows, [])).toEqual(rows);
    expect(filterRows(rows, [])).not.toBe(rows);
  });
  it('text contains/equals are case-insensitive', () => {
    expect(ids([{ id: 'name', op: 'contains', value: 'AL' }])).toEqual(['Alpha']);
    expect(ids([{ id: 'name', op: 'equals', value: 'BETA' }])).toEqual(['beta']);
    expect(ids([{ id: 'name', op: 'equals', value: 'bet' }])).toEqual([]);
  });
  it('number eq/gte/lte and inclusive between', () => {
    expect(ids([{ id: 'n', op: 'eq', value: 5 }])).toEqual(['beta']);
    expect(ids([{ id: 'n', op: 'gte', value: 5 }])).toEqual(['beta', 'GAMMA']);
    expect(ids([{ id: 'n', op: 'lte', value: 5 }])).toEqual(['Alpha', 'beta']);
    expect(ids([{ id: 'n', op: 'between', value: [1, 5] }])).toEqual(['Alpha', 'beta']);
  });
  it('date between: from inclusive, to exclusive, wall-clock strings, open ends', () => {
    expect(ids([{ id: 'd', op: 'between', value: { from: '2026-01-06', to: '2026-01-07' } }])).toEqual(['beta']);
    expect(ids([{ id: 'd', op: 'between', value: { from: '2026-01-05', to: '2026-01-06' } }])).toEqual(['Alpha']);
    expect(ids([{ id: 'd', op: 'between', value: { from: '2026-01-06' } }])).toEqual(['beta', 'GAMMA']);
    expect(ids([{ id: 'd', op: 'between', value: { to: '2026-01-06' } }])).toEqual(['Alpha']);
  });
  it('enum in matches listed values', () => {
    expect(ids([{ id: 's', op: 'in', value: ['b', 'c'] }])).toEqual(['beta', 'GAMMA']);
    expect(ids([{ id: 's', op: 'in', value: [] }])).toEqual([]);
  });
  it('filters AND together; a missing value matches nothing', () => {
    expect(ids([{ id: 's', op: 'in', value: ['a'] }, { id: 'n', op: 'gte', value: 0 }])).toEqual(['Alpha']);
  });
});

describe('filterRows vocabulary (ADR-0105)', () => {
  type R = { id: string; name: string | null; n: number | null; d: string | null; s: string | null; at: string | null };
  const rows: R[] = [
    { id: 'r1', name: 'Alpha', n: 1, d: '2026-01-05T09:00:00', s: 'a', at: '2026-01-05T00:30:00Z' },
    { id: 'r2', name: 'beta', n: 5, d: '2026-01-06', s: 'b', at: '2026-01-05T09:30:00+09:00' },
    { id: 'r3', name: 'GAMMA', n: 10, d: '2026-01-07T23:59:59', s: 'c', at: '2026-01-06T00:00:00Z' },
    { id: 'r4', name: null, n: null, d: null, s: null, at: null },
    { id: 'r5', name: '', n: 0, d: '', s: 'a', at: '' },
  ];
  const ids = (f: ColumnFilter[], specs?: Record<string, ColumnFilterSpec>) => filterRows(rows, f, undefined, specs ? { specs } : undefined).map(r => r.id);

  it.each<[ColumnFilter, string[]]>([
    [{ id: 'name', op: 'contains', value: 'AL' }, ['r1']],
    [{ id: 'name', op: 'notContains', value: 'a' }, []],
    [{ id: 'name', op: 'notContains', value: 'alp' }, ['r2', 'r3']],
    [{ id: 'name', op: 'startsWith', value: 'be' }, ['r2']],
    [{ id: 'name', op: 'endsWith', value: 'MA' }, ['r3']],
    [{ id: 'name', op: 'equals', value: 'BETA' }, ['r2']],
    [{ id: 'name', op: 'notEquals', value: 'beta' }, ['r1', 'r3']],
    [{ id: 'name', op: 'isEmpty' }, ['r4', 'r5']],
    [{ id: 'name', op: 'isNotEmpty' }, ['r1', 'r2', 'r3']],
  ])('text %j', (filter, expected) => expect(ids([filter])).toEqual(expected));

  it.each<[ColumnFilter, string[]]>([
    [{ id: 'n', op: 'eq', value: 0 }, ['r5']],
    [{ id: 'n', op: 'neq', value: 5 }, ['r1', 'r3', 'r5']],
    [{ id: 'n', op: 'gt', value: 5 }, ['r3']],
    [{ id: 'n', op: 'gte', value: 5 }, ['r2', 'r3']],
    [{ id: 'n', op: 'lt', value: 5 }, ['r1', 'r5']],
    [{ id: 'n', op: 'lte', value: 5 }, ['r1', 'r2', 'r5']],
    [{ id: 'n', op: 'between', value: [1, 5] }, ['r1', 'r2']],
    [{ id: 'n', op: 'isEmpty' }, ['r4']],
    [{ id: 'n', op: 'isNotEmpty' }, ['r1', 'r2', 'r3', 'r5']],
  ])('number %j (null excluded from every comparison, 0 is a value)', (filter, expected) => expect(ids([filter])).toEqual(expected));

  it.each<[ColumnFilter, string[]]>([
    [{ id: 'd', op: 'between', value: { from: '2026-01-06', to: '2026-01-07' } }, ['r2']],
    [{ id: 'd', op: 'before', value: '2026-01-06' }, ['r1']],
    [{ id: 'd', op: 'before', value: '2026-01-07' }, ['r1', 'r2']],
    [{ id: 'd', op: 'after', value: '2026-01-05' }, ['r2', 'r3']],
    [{ id: 'd', op: 'after', value: '2026-01-07' }, []],
    [{ id: 'd', op: 'isEmpty' }, ['r4', 'r5']],
    [{ id: 'd', op: 'isNotEmpty' }, ['r1', 'r2', 'r3']],
  ])('date %j (wall-clock; before is < day, after is >= next day)', (filter, expected) => expect(ids([filter])).toEqual(expected));

  it('date after crosses month and leap-year ends', () => {
    const r = [{ d: '2028-03-01T00:00:00' }, { d: '2028-02-29T23:00:00' }];
    expect(filterRows(r, [{ id: 'd', op: 'after', value: '2028-02-29' }]).length).toBe(1);
  });

  it.each<[ColumnFilter, string[]]>([
    [{ id: 's', op: 'in', value: ['a', 'c'] }, ['r1', 'r3', 'r5']],
    [{ id: 's', op: 'notIn', value: ['a'] }, ['r2', 'r3']],
    [{ id: 's', op: 'isEmpty' }, ['r4']],
    [{ id: 's', op: 'isNotEmpty' }, ['r1', 'r2', 'r3', 'r5']],
  ])('enum %j (negation excludes blank)', (filter, expected) => expect(ids([filter])).toEqual(expected));

  it('text caseSensitive from the spec compares exactly', () => {
    const specs: Record<string, ColumnFilterSpec> = { name: { kind: 'text', caseSensitive: true } };
    expect(ids([{ id: 'name', op: 'equals', value: 'BETA' }], specs)).toEqual([]);
    expect(ids([{ id: 'name', op: 'equals', value: 'beta' }], specs)).toEqual(['r2']);
    expect(ids([{ id: 'name', op: 'contains', value: 'Al' }], specs)).toEqual(['r1']);
    expect(ids([{ id: 'name', op: 'notContains', value: 'al' }], specs)).toEqual(['r1', 'r2', 'r3']);
  });

  it('instant between is half-open over real instants, not strings', () => {
    const specs: Record<string, ColumnFilterSpec> = { at: { kind: 'instant' } };
    // r2 (09:30+09:00) and r1 are the same instant, 00:30Z; as strings they would sort apart.
    expect(ids([{ id: 'at', op: 'between', value: { from: '2026-01-05T00:30:00Z', to: '2026-01-06T00:00:00Z' } }], specs)).toEqual(['r1', 'r2']);
    expect(ids([{ id: 'at', op: 'between', value: { to: '2026-01-05T00:30:00Z' } }], specs)).toEqual([]);
    expect(ids([{ id: 'at', op: 'isEmpty' }], specs)).toEqual(['r4']);
  });

  it('blank is "" only for text: with a non-text spec "" is a value', () => {
    expect(ids([{ id: 'd', op: 'isEmpty' }], { d: { kind: 'date' } })).toEqual(['r4']);
  });
});

describe('validateFilters (ADR-0105)', () => {
  const specs: Record<string, ColumnFilterSpec> = {
    name: { kind: 'text', ops: ['contains', 'equals'] },
    n: { kind: 'number' },
    d: { kind: 'date' },
    at: { kind: 'instant' },
    s: { kind: 'enum', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    one: { kind: 'enum', options: [{ value: 'a', label: 'A' }], multiple: false },
    targetId: { kind: 'text', requires: ['targetType'] },
    targetType: { kind: 'enum', options: [{ value: 't', label: 'T' }], multiple: false },
  };
  const reason = (f: ColumnFilter[]) => { const r = validateFilters(f, specs); return r.ok ? 'ok' : r.reason; };

  it('accepts a valid mixed set and the empty set', () => {
    expect(validateFilters([], specs)).toEqual({ ok: true });
    expect(reason([{ id: 'name', op: 'contains', value: 'x' }, { id: 'n', op: 'between', value: [1, 2] }, { id: 'd', op: 'after', value: '2026-02-28' }, { id: 's', op: 'notIn', value: ['a'] }, { id: 'at', op: 'between', value: { from: '2026-01-01T00:00:00+09:00' } }])).toBe('ok');
  });
  it('returns the offending filter', () => {
    const bad: ColumnFilter = { id: 'nope', op: 'isEmpty' };
    expect(validateFilters([{ id: 'n', op: 'eq', value: 1 }, bad], specs)).toEqual({ ok: false, reason: 'undeclared-field', filter: bad });
  });
  it.each<[string, ColumnFilter[], string]>([
    ['undeclared field', [{ id: 'zzz', op: 'eq', value: 1 }], 'undeclared-field'],
    ['prototype key is not a field', [{ id: 'constructor', op: 'isEmpty' }], 'undeclared-field'],
    ['colon in id', [{ id: 'a:b', op: 'isEmpty' }], 'invalid-id'],
    ['two conditions on one field', [{ id: 'n', op: 'eq', value: 1 }, { id: 'n', op: 'gt', value: 0 }], 'duplicate-field'],
    ['op outside spec.ops', [{ id: 'name', op: 'startsWith', value: 'x' }], 'op-not-allowed'],
    ['op of another kind', [{ id: 'n', op: 'contains', value: 'x' }], 'op-not-allowed'],
    ['instant has no before', [{ id: 'at', op: 'before', value: '2026-01-01' }], 'op-not-allowed'],
    ['number value is a string', [{ id: 'n', op: 'eq', value: '1' as never }], 'bad-value'],
    ['number is NaN', [{ id: 'n', op: 'gt', value: Number.NaN }], 'bad-value'],
    ['between tuple length', [{ id: 'n', op: 'between', value: [1] as never }], 'bad-value'],
    ['date is not a calendar day', [{ id: 'd', op: 'before', value: '2026-02-30' }], 'bad-value'],
    ['date range empty', [{ id: 'd', op: 'between', value: {} }], 'bad-value'],
    ['date range with a date-time', [{ id: 'd', op: 'between', value: { from: '2026-01-01T00:00:00' } }], 'bad-value'],
    ['instant without offset', [{ id: 'at', op: 'between', value: { from: '2026-01-01T00:00:00' } }], 'bad-value'],
    ['isEmpty with a value', [{ id: 'n', op: 'isEmpty', value: 1 } as unknown as ColumnFilter], 'bad-value'],
    ['in with an empty list', [{ id: 's', op: 'in', value: [] }], 'bad-value'],
    ['multiple:false with two values', [{ id: 'one', op: 'in', value: ['a', 'a'] }], 'multiple-not-allowed'],
    ['requires unmet', [{ id: 'targetId', op: 'equals', value: 'x' }], 'requires-unmet'],
  ])('rejects %s', (_label, filters, expected) => expect(reason(filters)).toBe(expected));
  it('requires met', () => {
    expect(reason([{ id: 'targetId', op: 'contains', value: 'x' }, { id: 'targetType', op: 'in', value: ['t'] }])).toBe('ok');
  });
});

describe('groupPage (row groups, ADR-0104)', () => {
  type R = { id: string; line: string | null; qty: number | null; cost: number; at: number };
  const rows: R[] = [
    { id: 'r1', line: 'B', qty: 2, cost: 10, at: 3 },
    { id: 'r2', line: 'A', qty: 5, cost: 20, at: 1 },
    { id: 'r3', line: null, qty: 7, cost: 30, at: 2 },
    { id: 'r4', line: 'A', qty: null, cost: 40, at: 2 },
    { id: 'r5', line: 'B', qty: 3, cost: 50, at: 1 },
    { id: 'r6', line: 'A', qty: 1, cost: 60, at: 2 },
  ];
  it('orders by group key (empty last), then by ALL sorting keys', () => {
    const out = groupPage(rows, { groupBy: 'line', sorting: [{ id: 'at', desc: false }, { id: 'cost', desc: true }] });
    expect(out.rows.map(r => r.id)).toEqual(['r2', 'r6', 'r4', 'r5', 'r1', 'r3']);
    expect(out.groups.map(g => g.key)).toEqual(['A', 'B', '']);
  });
  it('a null or empty key is the "" group labelled (값 없음)', () => {
    const out = groupPage([...rows, { id: 'r7', line: '', qty: 1, cost: 1, at: 1 }], { groupBy: 'line', sorting: [] });
    const empty = out.groups.find(g => g.key === '');
    expect(empty).toMatchObject({ label: '(값 없음)', count: 2 });
  });
  it('sums only the declared columns; no declared column gives no subtotals; a group without numbers gets null', () => {
    const out = groupPage(rows, { groupBy: 'line', sorting: [], subtotalColumns: ['qty'] });
    expect(out.groups.map(g => g.subtotals)).toEqual([{ qty: 6 }, { qty: 5 }, { qty: 7 }]);
    expect(groupPage(rows, { groupBy: 'line', sorting: [] }).groups.every(g => g.subtotals === undefined)).toBe(true);
    expect(groupPage([{ id: 'x', line: 'Z', qty: null, cost: 1, at: 1 }], { groupBy: 'line', sorting: [], subtotalColumns: ['qty'] }).groups[0].subtotals).toEqual({ qty: null });
  });
  it('groups describe the whole set while rows are a page slice, limited to groups on the page', () => {
    const out = groupPage(rows, { groupBy: 'line', sorting: [{ id: 'cost', desc: false }], subtotalColumns: ['cost'], page: 1, pageSize: 4 });
    expect(out.total).toBe(6);
    expect(out.rows.map(r => r.id)).toEqual(['r5', 'r3']);
    // page 1 holds the tail of B (continuing from page 0) and the empty group; A is not on this page
    expect(out.groups).toEqual([
      { key: 'B', label: 'B', count: 2, subtotals: { cost: 60 }, continued: true },
      { key: '', label: '(값 없음)', count: 1, subtotals: { cost: 30 } },
    ]);
  });
  it('continued is server-owned: a group starting exactly at the page boundary is not continued; a true continuation (also by direct entry to a later page) is', () => {
    const big: R[] = [
      ...[1, 2, 3, 4].map(i => ({ id: `a${i}`, line: 'A', qty: i, cost: i, at: i })),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: `b${i}`, line: 'B', qty: i, cost: i, at: i })),
    ];
    const opts = { groupBy: 'line', sorting: [{ id: 'at', desc: false }], pageSize: 4 };
    const p0 = groupPage(big, { ...opts, page: 0 });
    const p1 = groupPage(big, { ...opts, page: 1 }); // B starts exactly here although count 8 > 4 rows on the page
    const p2 = groupPage(big, { ...opts, page: 2 }); // direct entry: B started on page 1
    expect(p0.groups.map(g => g.continued)).toEqual([undefined]);
    expect(p1.groups).toMatchObject([{ key: 'B', count: 8 }]);
    expect(p1.groups[0].continued).toBeUndefined();
    expect(p2.groups).toMatchObject([{ key: 'B', count: 8, continued: true }]);
    expect(groupPage(big, { groupBy: 'line', sorting: [] }).groups.some(g => g.continued)).toBe(false); // no page slice
  });
  it('a page that starts inside the empty bucket marks it continued', () => {
    const e: R[] = [
      { id: 'a1', line: 'A', qty: 1, cost: 1, at: 1 },
      ...[2, 3, 4, 5].map(i => ({ id: `e${i}`, line: '', qty: i, cost: i, at: i })),
    ];
    const out = groupPage(e, { groupBy: 'line', sorting: [{ id: 'at', desc: false }], page: 1, pageSize: 2 });
    expect(out.groups).toMatchObject([{ key: '', count: 4, continued: true }]);
  });
  it('null, undefined and empty keys are one bucket: all sorting keys apply inside it and it sorts last', () => {
    type M = { id: string; line: string | null | undefined; at: number; cost: number };
    const mixed: M[] = [
      { id: 'n1', line: null, at: 3, cost: 1 }, { id: 'a1', line: 'A', at: 9, cost: 1 }, { id: 'e1', line: '', at: 1, cost: 2 },
      { id: 'u1', line: undefined, at: 2, cost: 1 }, { id: 'e2', line: '', at: 2, cost: 5 }, { id: 'n2', line: null, at: 1, cost: 1 },
    ];
    const out = groupPage(mixed, { groupBy: 'line', sorting: [{ id: 'at', desc: false }, { id: 'cost', desc: true }] });
    // bucket '' ordered by at asc then cost desc (ties at=1: e1 cost 2 before n2 cost 1; at=2: e2 cost 5 before u1 cost 1)
    expect(out.rows.map(r => r.id)).toEqual(['a1', 'e1', 'n2', 'e2', 'u1', 'n1']);
    expect(out.groups.map(g => [g.key, g.count])).toEqual([['A', 1], ['', 5]]);
    const desc = groupPage(mixed, { groupBy: 'line', sorting: [{ id: 'at', desc: true }] });
    expect(desc.rows.map(r => r.id).slice(1)).toEqual(['n1', 'u1', 'e2', 'e1', 'n2']); // stable among ties
  });
});
