import { describe, expect, it } from 'vitest';
import { buildQuery, ContractError, emptyGlobal, incompleteMetricPair, parseQuery, shift } from './url';
import { matchRoute, MENUS, pathFor } from './registry';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

describe('URL contract (§6.1–6.4)', () => {
  it('round-trips the full global context with canonical ordering', () => {
    const g = { ...emptyGlobal, scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', roomNames: ['PH-101', 'ET-102'], condition: { axis: 'makerModel' as const, maker: 'AMX', model: 'XP8' }, selection: ['B', 'A', 'A'], metricId: 'cycle_time', metricVersion: 'v3' };
    const q = buildQuery(g);
    const back = parseQuery(q).global;
    expect(back.roomNames).toEqual(['ET-102', 'PH-101']);
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
    expect(code(() => parseQuery('?scopeId=ICH&scopeId=ICH'))).toBe('duplicate_singleton');
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
  it('allows exactly one Condition axis', () => {
    expect(code(() => parseQuery(`?equipmentGroup=${encodeURIComponent('{"axis":"stgroup","id":"S","maker":"X"}')}`))).toBe('invalid_condition');
    expect(parseQuery(`?equipmentGroup=${encodeURIComponent('{"axis":"team","id":"분임조 A1"}')}`).global.condition).toEqual({ axis: 'team', id: '분임조 A1' });
  });
  it('separates registered page keys from unregistered extras', () => {
    const r = parseQuery('?v=1&granularity=day&utm=x', ['granularity']);
    expect(r.page).toEqual([['granularity', 'day']]);
    expect(r.extras).toEqual([['utm', 'x']]);
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
    const path = pathFor(detail, { equipmentId: 'ICH/ETCH 01' });
    expect(path).toBe('/equipment/ICH%2FETCH%2001');
    expect(matchRoute(path)).toMatchObject({ menu: { id: 'equipment-detail' }, params: { equipmentId: 'ICH/ETCH 01' } });
  });
  it('declares exactly one primary destination per group', () => {
    const groups = new Set(MENUS.map(m => m.group));
    for (const g of groups) expect(MENUS.filter(m => m.group === g && m.primary)).toHaveLength(1);
  });
});
