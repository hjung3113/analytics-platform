import { describe, expect, it } from 'vitest';
import { MENUS, registry } from './menus';
import { pathFor } from '@ap/kernel';

const { matchRoute } = registry;
import { buildQuery, ContractError, emptyGlobal, incompleteMetricPair, parseQuery, shift } from '@ap/contracts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

const cause = (search: string) => { try { parseQuery(search); } catch (e) { if (e instanceof ContractError) return { code: e.code, field: e.field, raw: e.raw }; } return null; };

describe('ContractError structured cause (#397)', () => {
  it.each([
    ['?from=garbage&to=2026-09-26T09:00:00', 'invalid_time', 'from', 'garbage'],
    ['?from=2026-09-25T09:00:00&to=2026-09-26T25:00:00', 'invalid_time', 'to', '2026-09-26T25:00:00'],
    ['?scopeId=%20', 'invalid_id', 'scopeId', ' '],
    ['?scopeId=', 'invalid_id', 'scopeId', ''],
    ['?v=2', 'unsupported_version', 'v', '2'],
    ['?v=abc', 'invalid_version', 'v', 'abc'],
    ['?equipmentIds=%20', 'invalid_id', 'selectedEquipmentIds', ' '],
    ['?roomNames=A&roomNames=%20', 'invalid_id', 'roomNames', ' '],
    ['?lotIds=%20', 'invalid_id', 'lotIds', ' '],
    ['?ppid=%20', 'invalid_id', 'ppid', ' '],
    ['?metricId=%20', 'invalid_id', 'metricId', ' '],
    ['?metricId=m&metricVersion=%20', 'invalid_id', 'metricVersion', ' '],
    ['?equipmentGroup=%7B%22axis%22%3A%22team%22%2C%22id%22%3A1%7D', 'invalid_condition', 'equipmentGroup', '{"axis":"team","id":1}'],
    ['?equipmentGroup=nope', 'invalid_condition', 'equipmentGroup', 'nope'],
    ['?lotSelection=all', 'invalid_set', 'lotSelection', 'all'],
  ])('%s', (search, c, field, raw) => {
    expect(cause(search)).toEqual({ code: c, field, raw });
  });
  it.each([
    ['?from=garbage', 'partial_period'],
    ['?from=2026-09-26T09:00:00&to=2026-09-26T09:00:00', 'invalid_period'],
    ['?equipmentSelection=none&selectedEquipmentIds=A', 'invalid_set'],
    ['?equipmentIds=A&selectedEquipmentIds=B', 'alias_conflict'],
    ['?metricVersion=3', 'metric_pair'],
    ['?scopeId=A&scopeId=B', 'duplicate_singleton'],
  ])('%s blames no single value', (search, c) => {
    expect(cause(search)).toEqual({ code: c, field: undefined, raw: undefined });
  });
  it('keeps the English diagnostic message', () => {
    expect(() => parseQuery('?from=garbage&to=2026-09-26T09:00:00')).toThrow('from: use YYYY-MM-DDTHH:mm:ss (no Z/offset/fraction)');
  });
});

describe('URL contract (§6.1–6.4)', () => {
  it('round-trips the full global context with canonical ordering', () => {
    const g = { ...emptyGlobal, scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', roomNames: ['PHOTO', 'ETCH'], condition: { maker: ['AMX'], model: ['XP8'] }, selection: ['B', 'A', 'A'], metricId: 'cycle_time', metricVersion: 'v3' };
    const q = buildQuery(g);
    const back = parseQuery(q).global;
    expect(back.roomNames).toEqual(['ETCH', 'PHOTO']);
    expect(back.selection).toEqual(['A', 'B']);
    expect(buildQuery(back)).toBe(q);
  });
  it('distinguishes absent, explicit empty and selected sets', () => {
    expect(parseQuery('?v=1').global.selection).toBeNull();
    expect(parseQuery('?equipmentSelection=none').global.selection).toEqual([]);
    expect(code(() => parseQuery('?equipmentSelection=none&selectedEquipmentIds=A'))).toBe('invalid_set');
    expect(code(() => parseQuery('?selectedEquipmentIds='))).toBe('invalid_id');
  });
  it('accepts the equipmentIds alias but rejects both at once', () => {
    expect(parseQuery('?equipmentIds=A').global.selection).toEqual(['A']);
    expect(code(() => parseQuery('?equipmentIds=A&selectedEquipmentIds=B'))).toBe('alias_conflict');
  });
  it('enforces the time contract: pair, naive seconds, from < to', () => {
    expect(code(() => parseQuery('?from=2026-09-25T09:00:00'))).toBe('partial_period');
    expect(code(() => parseQuery('?from=2026-09-25T09:00:00Z&to=2026-09-26T09:00:00'))).toBe('invalid_time');
    expect(code(() => parseQuery('?from=2026-09-25T09:00:00.5&to=2026-09-26T09:00:00'))).toBe('invalid_time');
    expect(code(() => parseQuery('?from=2026-02-30T00:00:00&to=2026-03-01T00:00:00'))).toBe('invalid_time');
    expect(code(() => parseQuery('?from=2026-09-26T09:00:00&to=2026-09-26T09:00:00'))).toBe('invalid_period');
    expect(shift('2026-09-26T09:00:00', -168)).toBe('2026-09-19T09:00:00');
  });
  it('rejects unsupported versions and duplicated singletons without guessing', () => {
    expect(code(() => parseQuery('?v=2'))).toBe('unsupported_version');
    expect(code(() => parseQuery('?v=abc'))).toBe('invalid_version');
    expect(code(() => parseQuery('?scopeId=MEM&scopeId=MEM'))).toBe('duplicate_singleton');
  });
  it('rejects version-without-id and gates id-only by route', () => {
    expect(code(() => parseQuery('?metricVersion=v3'))).toBe('metric_pair');
    const idOnly = parseQuery('?metricId=cycle_time').global;
    expect(idOnly.metricId).toBe('cycle_time');
    expect(idOnly.metricVersion).toBeNull();
    const menu = (id: string) => MENUS.find(m => m.id === id)!;
    expect(incompleteMetricPair(menu('equipment-master'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('metric-catalog'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('productivity-overview'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('execution-detail'), 'cycle_time', null)?.code).toBe('metric_pair_incomplete');
    expect(incompleteMetricPair(menu('cycle-time'), 'cycle_time', null)).toBeNull();
    expect(incompleteMetricPair(menu('metric-detail'), 'cycle_time', null)).toBeNull();
    expect(incompleteMetricPair(menu('equipment-master'), 'cycle_time', '4')).toBeNull();
    expect(incompleteMetricPair(menu('equipment-master'), null, null)).toBeNull();
    expect(MENUS.filter(m => m.initializesMetric).map(m => m.id).sort()).toEqual(['cycle-time', 'metric-detail']);
  });
  it('rejects extra fields in a v1 Condition tag', () => {
    expect(code(() => parseQuery(`?equipmentGroup=${encodeURIComponent('{"axis":"stgroup","id":"S","maker":"X"}')}`))).toBe('invalid_condition');
    expect(parseQuery(`?equipmentGroup=${encodeURIComponent('{"axis":"team","id":"분임조 A1"}')}`).global.condition).toEqual({ team: ['분임조 A1'] });
  });
  it('separates registered page keys from unregistered extras', () => {
    const r = parseQuery('?v=1&granularity=day&utm=x', ['granularity']);
    expect(r.page).toEqual([['granularity', 'day']]);
    expect(r.extras).toEqual([['utm', 'x']]);
  });
  it('treats the literal page key like any registered key (06 §6.1)', () => {
    expect(parseQuery('?v=1&page=2', ['page']).page).toEqual([['page', '2']]);
    expect(code(() => parseQuery('?page=2&page=3', ['page']))).toBe('duplicate_page_key');
    expect(parseQuery('?page=2', ['granularity']).extras).toEqual([['page', '2']]);
  });
  it('rejects a repeated registered page key and still keeps repeated extras', () => {
    expect(code(() => parseQuery('?granularity=hour&granularity=day', ['granularity']))).toBe('duplicate_page_key');
    expect(code(() => parseQuery('?granularity=hour&granularity=hour', ['granularity']))).toBe('duplicate_page_key');
    expect(parseQuery('?granularity=week', ['granularity']).page).toEqual([['granularity', 'week']]);
    expect(parseQuery('?utm=a&utm=b', ['granularity']).extras).toEqual([['utm', 'a'], ['utm', 'b']]);
  });
});

describe('Menu Registry', () => {
  it('matches parameterized destination routes and encodes IDs as one segment', () => {
    const detail = MENUS.find(m => m.id === 'equipment-detail')!;
    const path = pathFor(detail, { equipmentId: 'MEM/ETCH 01' });
    expect(path).toBe('/equipment/MEM%2FETCH%2001');
    expect(matchRoute(path)).toMatchObject({ menu: { id: 'equipment-detail' }, params: { equipmentId: 'MEM/ETCH 01' } });
  });
  it('declares exactly one primary destination per group', () => {
    const groups = new Set(MENUS.map(m => m.group));
    for (const g of groups) expect(MENUS.filter(m => m.group === g && m.primary)).toHaveLength(1);
  });

  // #50: the audit screen's page keys are the nine filter keys, the log is not bound to Scope or a
  // period (no contextResetKeys), and the menu sits in the operations space behind console:access.
  it('declares the admin-audit page keys, unsupported context and the operations space', () => {
    const audit = MENUS.find(m => m.id === 'admin-audit')!;
    expect(audit.permission).toBe('console:access');
    expect(audit.requiresScope).toBe(false);
    expect(audit.context).toEqual({
      time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
      lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
    });
    expect(audit.pageKeys).toEqual(['type', 'actor', 'action', 'source', 'fromAt', 'toAt', 'targetId', 'sort', 'page']);
    expect(audit.contextResetKeys).toBeUndefined();
    expect(registry.spaceOf(audit)?.id).toBe('operations');
  });

  it('declares returnTo on metric-detail so cross-menu links can offer the way back', () => {
    expect(MENUS.find(m => m.id === 'metric-detail')!.pageKeys).toContain('returnTo');
  });
});

describe('app-injected multi-axis Condition (#552)', () => {
  const query = (value: unknown, tail = '') => `?equipmentGroup=${encodeURIComponent(JSON.stringify(value))}${tail}`;
  it.each([
    [{ axis: 'stgroup', id: 'A' }, { stgroup: ['A'] }],
    [{ axis: 'team', id: 'T' }, { team: ['T'] }],
    [{ axis: 'makerModel', maker: 'X', model: 'Y' }, { maker: ['X'], model: ['Y'] }],
  ])('migrates v1 %j losslessly', (legacy, expected) => {
    expect(parseQuery(query(legacy)).global.condition).toEqual(expected);
  });
  it.each([
    [{ axis: 'alpha', id: 'a1' }, { alpha: ['a1'] }],
    [{ axis: 'composite', first: 'F', second: 'S' }, { first: ['F'], second: ['S'] }],
  ])('decodes v1 using only structure: %j', (legacy, expected) => {
    expect(parseQuery(query(legacy)).global.condition).toEqual(expected);
  });
  it.each([
    { axis: 'alpha' }, { axis: 'alpha', id: 'a1', other: 'x' },
    { axis: 'alpha', first: ['F'] }, { axis: 'alpha', id: '' },
  ])('rejects malformed v1 tag %j', value => {
    expect(cause(query(value))).toEqual({ code: 'invalid_condition', field: 'equipmentGroup', raw: JSON.stringify(value) });
  });
  it('normalizes axis order, unique values and empty map without changing Selection', () => {
    const g = parseQuery(query({ z: ['B', 'A', 'A'], a: ['X'] }, '&selectedEquipmentIds=E')).global;
    expect(new URLSearchParams(buildQuery(g)).get('equipmentGroup')).toBe('{"a":["X"],"z":["A","B"]}');
    expect(parseQuery(buildQuery(g)).global).toEqual(g);
    expect(g.selection).toEqual(['E']);
    expect(parseQuery(query({})).global.condition).toBeNull();
    expect(new URLSearchParams(buildQuery({ ...emptyGlobal, condition: {} })).has('equipmentGroup')).toBe(false);
  });
  it('serializes numeric axis IDs in code-point order', () => {
    const g = parseQuery(query({ '2': ['B'], '10': ['A'] })).global;
    expect(new URLSearchParams(buildQuery(g)).get('equipmentGroup')).toBe('{"10":["A"],"2":["B"]}');
  });
  it.each([null, [], { a: null }, { a: [] }, { a: [''] }, { a: [' '] }, { a: [1] }, { '': ['A'] }, { axis: ['A'] }, { a: 'A' }])('rejects malformed Condition %j', value => {
    expect(cause(query(value))).toEqual({ code: 'invalid_condition', field: 'equipmentGroup', raw: JSON.stringify(value) });
  });
  it.each([
    ['?membershipBasis=asOf', 'membership_basis_pair'],
    ['?membershipBasis=current', 'invalid_membership_basis'],
    ['?prcGroups=P&membershipBasis=asOf&membershipBasis=asOf', 'duplicate_singleton'],
  ])('rejects invalid basis %s', (search, expected) => expect(code(() => parseQuery(search))).toBe(expected));
  it('accepts basis with PRC alone and omits orphaned basis on write', () => {
    expect(parseQuery('?prcGroups=P&membershipBasis=asOf').global.membershipBasis).toBe('asOf');
    expect(new URLSearchParams(buildQuery({ ...emptyGlobal, membershipBasis: 'asOf' })).has('membershipBasis')).toBe(false);
  });
  it.each([
    ['lineNames', 'lineSelection'], ['prcGroups', 'prcGroupSelection'],
  ])('%s distinguishes absence, empty and sorted IDs', (field, marker) => {
    expect(parseQuery('').global).toHaveProperty(field, null);
    expect(parseQuery(`?${marker}=none`).global).toHaveProperty(field, []);
    const g = parseQuery(`?${field}=B&${field}=A&${field}=B`).global;
    expect(g).toHaveProperty(field, ['A', 'B']);
    expect(parseQuery(buildQuery(g)).global).toEqual(g);
    expect(code(() => parseQuery(`?${field}=A&${marker}=none`))).toBe('invalid_set');
  });
});
