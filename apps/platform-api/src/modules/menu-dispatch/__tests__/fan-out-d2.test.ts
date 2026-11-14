import { assessmentSchema } from '@ap/contract-schemas';
import { afterEach, expect, it, vi } from 'vitest';

import { declaredContribution } from '../declared-endpoints.js';
import type { DeclarationBundle, Routing } from '../declarations-file.js';
import type { Connector, RoutingLog } from '../connectors/types.js';
import { TargetJudgmentTimeout } from '../connectors/types.js';
import { MenuUpstreamError } from '../forwarder.js';
import { runQuery } from '../query.js';
import { defined } from '../../../test-support/defined.js';
import { stubCheckService } from '../../../test-support/platform-route-stubs.js';
import { menuSnapshotFor } from '../../../test-support/menu-snapshot.js';

const actor = { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' } as const;
function runtime(connector: Connector, options: { paged?: boolean; single?: boolean; max?: number; keyed?: boolean } = {}) {
  const { paged = false, single = false, max = 4, keyed = false } = options;
  const call = { statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' as const } };
  const owner: Routing = {
    routes: [{ sites: ['SITE-A'], targets: single ? ['syn-1'] : ['syn-1', 'syn-2'] }], call,
    scopeCheck: keyed ? { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' } : { mode: 'verify-rows', roomField: '/room' },
    unroutedRooms: 'error', merge: { sort: [{ field: 'value', direction: 'asc' }, { field: 'id', direction: 'asc', unique: true }], ...(paged ? { maxWindow: max } : { partial: 'coverage' }) },
  };
  const bundle: DeclarationBundle = {
    endpoints: [{ id: 'syn.rows', menuId: 'syn', permission: 'syn:view', paramKeys: [...(paged ? ['page', 'pageSize', 'sorting'] : []), ...(keyed ? ['q'] : [])], ...(keyed ? { paramTypes: { q: { type: 'string' as const } } } : {}), requiresScope: true, context: {}, ...(paged ? {} : { limits: { maxRows: max } }), kinds: ['coverage', 'collection'], mergeTimeDomain: false }],
    actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }], endpointOwners: { 'syn.rows': owner },
    targets: Object.fromEntries(['syn-1', 'syn-2'].map((id) => [id, { kind: 'sql' as const, dialect: 'postgres' as const, connectionFile: '/syn/secret' }])),
  };
  const logs: RoutingLog[] = [];
  const endpoint = defined(declaredContribution({ bundle, snapshot: menuSnapshotFor(bundle), checkService: stubCheckService(true), connectorFactories: { sql: () => connector }, log: (entry) => logs.push(entry) }).endpoints?.[0]);
  const run = (params: Record<string, unknown> = {}) => runQuery({ ok: true, declaration: endpoint, context: { scopeId: 'SITE-A' }, params, scopeResolver: { resolve: async () => [{ site: 'SITE-A', rooms: ['R1'] }] } }, actor, 'syn-cid');
  return { run, logs, bundle };
}
const healthy: Connector = { async *query(leg) { yield { room: 'R1', value: 1, id: leg.targetId === 'syn-1' ? 2 : 1 }; } };
afterEach(() => vi.useRealTimers());
it('partial all-success carries exactly one clear coverage with an ISO instant observation', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T00:30:45Z'));
  const { run } = runtime(healthy);
  const result = await run();
  expect(assessmentSchema.safeParse(result.assessments?.[0]).success).toBe(true);
  expect(result).toMatchObject({ outcome: 'ok', assessments: [
    { kind: 'coverage', state: 'clear', statusSource: 'upstream-routing', observedAt: '2026-11-12T00:30:45.000Z' },
    { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
  ] });
});
it.each(['transport', 'judgment', 'deadline'] as const)('partial %s failure returns surviving rows and count only, including logs', async (failure) => {
  const { run, logs } = runtime({ async *query(leg) {
    if (leg.targetId === 'syn-2') {
      if (failure === 'judgment') throw new TargetJudgmentTimeout();
      if (failure === 'deadline') throw new MenuUpstreamError('timeout');
      throw new Error('syn-private-failure https://syn-private.test syn-2');
    }
    yield { room: 'R1', value: 1, id: 2 };
  } });
  const result = await run();
  expect(result).toMatchObject({ outcome: 'ok', data: [{ room: 'R1', value: 1, id: 2 }], assessments: [
    { kind: 'coverage', state: 'confirmed', statusSource: 'upstream-routing', detail: '1' },
    { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
  ] });
  expect(result.assessments).toHaveLength(2);
  for (const text of ['syn-1', 'syn-2', 'syn-private-failure', 'https://syn-private.test']) expect(JSON.stringify(result)).not.toContain(text);
  // ADR-0153 3.5: one routing log per leg (ids only); never row values or failure text.
  expect(logs.map((entry) => entry.targetId).sort()).toEqual(['syn-1', 'syn-2']);
  for (const entry of logs) expect(Object.keys(entry).sort()).toEqual(['actorId', 'correlationId', 'endpointId', 'targetId']);
  for (const text of ['syn-private-failure', 'https://syn-private.test']) expect(JSON.stringify(logs)).not.toContain(text);
});
it('partial failure with an empty successful leg is empty with confirmed coverage', async () => {
  const { run } = runtime({ query(leg) {
    return { [Symbol.asyncIterator]: () => ({ next: async () => { if (leg.targetId === 'syn-2') throw new MenuUpstreamError('unavailable'); return { done: true, value: undefined }; } }) };
  } });
  expect(await run()).toMatchObject({ outcome: 'empty', data: [], assessments: [{ kind: 'coverage', state: 'confirmed', detail: '1' }, { kind: 'collection', state: 'unknown' }] });
});
it.each([
  ['transport', 'deadline', 'unavailable'], ['deadline', 'transport', 'unavailable'],
  ['judgment', 'deadline', 'timeout'], ['deadline', 'judgment', 'timeout'],
  ['judgment', 'judgment', 'judgment'],
] as const)('all failed partial ranks %s and %s as %s', async (a, b, expected) => {
  const { run } = runtime({ query(leg) { return { [Symbol.asyncIterator]: () => ({ next: async () => {
    const kind = leg.targetId === 'syn-1' ? a : b;
    if (kind === 'judgment') throw new TargetJudgmentTimeout();
    throw new MenuUpstreamError(kind === 'transport' ? 'unavailable' : 'timeout');
  } }) }; } });
  if (expected === 'judgment') expect(await run()).toMatchObject({ outcome: 'timeout', data: null });
  else await expect(run()).rejects.toEqual(new MenuUpstreamError(expected));
});
it('Scope violation is fatal even when partial coverage is enabled', async () => {
  const { run, logs } = runtime({ async *query(leg) { yield { room: leg.targetId === 'syn-2' ? 'syn-outside' : 'R1', id: leg.targetId, value: 1 }; } });
  await expect(run()).rejects.toEqual(new MenuUpstreamError('unavailable'));
  expect(JSON.stringify(logs)).not.toContain('syn-outside');
});
it('resolve-keys refusal is fatal even when partial coverage is enabled', async () => {
  const { run } = runtime({ async *query(leg) {
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') { yield { site: 'SITE-A', room: 'R2' }; return; }
    yield { id: 1, value: 1 };
  } }, { keyed: true, single: true });
  expect(await run({ q: 'syn-key' })).toMatchObject({ outcome: 'forbidden', data: null });
});
it('partial overflow remains too_large even with a failed sibling', async () => {
  const { run } = runtime({ async *query(leg) {
    if (leg.targetId === 'syn-2') throw new MenuUpstreamError('unavailable');
    for (let id = 0; id < 8; id++) yield { room: 'R1', value: 1, id };
  } }, { max: 2 });
  expect(await run()).toMatchObject({ outcome: 'too_large', data: null });
});
it('single-target partial success carries clear coverage', async () => {
  expect(await runtime(healthy, { single: true }).run()).toMatchObject({ outcome: 'ok', assessments: [{ kind: 'coverage', state: 'clear' }, { kind: 'collection', state: 'unknown' }] });
});
it.each([false, true])('core pages merged rows with stable tie-break and full total (single=%s)', async (single) => {
  let reversed = false;
  const { run, logs } = runtime({ async *query(leg, options) {
    expect(options.rowCap).toBe(single ? 5 : 3);
    expect(leg.call).toEqual({ statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' } });
    expect(leg.bindings).toEqual({ params: { rooms: ['R1'] } });
    const ids = single ? [4, 2, 3, 1] : leg.targetId === 'syn-1' ? [4, 2] : [3, 1];
    for (const id of reversed ? [...ids].reverse() : ids) yield { room: 'R1', value: 1, id };
  } }, { paged: true, single, max: single ? 4 : 2 });
  const page0 = await run({ page: 0, pageSize: 2, sorting: [{ id: 'value', desc: true }] });
  reversed = true;
  const page1 = await run({ page: 1, pageSize: 2, sorting: [{ id: 'value', desc: true }] });
  expect(page0).toMatchObject({ outcome: 'ok', data: { rows: [{ id: 1 }, { id: 2 }], total: 4 } });
  expect(page1).toMatchObject({ outcome: 'ok', data: { rows: [{ id: 3 }, { id: 4 }], total: 4 } });
  expect(await run({ page: 2, pageSize: 2, sorting: [] })).toMatchObject({ outcome: 'empty', data: { rows: [], total: 4 } });
  for (const entry of logs) expect(Object.keys(entry).sort()).toEqual(['actorId', 'correlationId', 'endpointId', 'targetId']);
  expect(logs.length).toBeGreaterThan(0);
});
it('request sorting applies all allowlisted keys, keeping the declared unique key last', async () => {
  const { run } = runtime({ async *query(leg) {
    for (const id of leg.targetId === 'syn-1' ? [1, 4] : [2, 3]) yield { room: 'R1', id, value: id % 2 };
  } }, { paged: true });
  expect(await run({ page: 0, pageSize: 4, sorting: [{ id: 'value', desc: true }, { id: 'id', desc: true }] })).toMatchObject({ data: { rows: [{ id: 3 }, { id: 1 }, { id: 4 }, { id: 2 }], total: 4 } });
});
it.each([
  { page: -1, pageSize: 2 }, { page: 0.5, pageSize: 2 }, { page: 0, pageSize: 0 }, { page: 0, pageSize: 1.5 },
  { page: Number.MAX_SAFE_INTEGER, pageSize: 2 }, { page: 0, pageSize: 2, sorting: [{ id: 'syn-private', desc: false }] },
  { page: 0, pageSize: 2, sorting: [{ id: 'value', desc: 'desc' }] }, { page: 0, pageSize: 2, sorting: {} },
])('refuses invalid core paging or sorting before calling targets: %j', async (params) => {
  const query = vi.fn(healthy.query);
  const { run } = runtime({ query }, { paged: true });
  expect(await run(params)).toMatchObject({ outcome: 'error', data: null });
  expect(query).not.toHaveBeenCalled();
});
it.each([false, true])('paged per-leg maxWindow overflow is too_large (single=%s)', async (single) => {
  let pulled = 0;
  const { run } = runtime({ async *query(leg, options) {
    expect(options.rowCap).toBe(3);
    if (leg.targetId === 'syn-2') return;
    for (let id = 0; id < 10; id++) { pulled++; yield { room: 'R1', id, value: 1 }; }
  } }, { paged: true, single, max: 2 });
  expect(await run({ page: 0, pageSize: 2 })).toMatchObject({ outcome: 'too_large', data: null });
  expect(pulled).toBe(3);
});
