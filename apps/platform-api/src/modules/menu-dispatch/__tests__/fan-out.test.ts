import { afterEach, expect, it, vi } from 'vitest';

import { declaredContribution } from '../declared-endpoints.js';
import type { DeclarationBundle, Routing } from '../declarations-file.js';
import type { Connector, ConnectorQueryOptions, RoutingLog } from '../connectors/types.js';
import { TargetJudgmentTimeout } from '../connectors/types.js';
import { MenuUpstreamError } from '../forwarder.js';
import { runQuery } from '../query.js';
import type { EndpointHandlerArgs } from '../types.js';
import { defined } from '../../../test-support/defined.js';
import { stubCheckService } from '../../../test-support/platform-route-stubs.js';

const actor = { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' } as const;
const args = (): EndpointHandlerArgs => ({ actor, context: { scopeId: 'SITE-A' }, params: {}, scopes: [{ site: 'SITE-A', rooms: ['R1', 'R2'] }], correlationId: 'syn-cid', sessionVersion: async () => 'syn-version' });
function runtime(connector: Connector, maxRows = 4, sort = true) {
  const owner: Routing = {
    routes: [{ sites: ['SITE-A'], rooms: ['R1'], targets: ['syn-1'] }, { sites: ['SITE-A'], rooms: ['R2'], targets: ['syn-2'] }],
    call: { statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' }, response: { fields: { id: { from: '/id', type: 'number' } } } },
    scopeCheck: { mode: 'verify-rows', roomField: '/room' }, unroutedRooms: 'error',
    ...(sort ? { merge: { sort: [{ field: 'id', direction: 'asc', unique: true }] } } : {}),
  };
  const bundle: DeclarationBundle = {
    endpoints: [{ id: 'syn.rows', menuId: 'syn', permission: 'syn:view', paramKeys: [], requiresScope: true, context: {}, limits: { maxRows }, mergeTimeDomain: false }],
    actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }], endpointOwners: { 'syn.rows': owner },
    targets: Object.fromEntries(['syn-1', 'syn-2'].map((id) => [id, { kind: 'sql' as const, dialect: 'postgres' as const, connectionFile: '/syn/secret' }])),
  };
  const logs: RoutingLog[] = [];
  const endpoint = defined(declaredContribution({ bundle, checkService: stubCheckService(true), connectorFactories: { sql: () => connector }, log: (entry) => logs.push(entry) }).endpoints?.[0]);
  return { endpoint, logs, bundle, owner, run: () => runQuery({ ok: true, declaration: endpoint, context: args().context, params: {}, scopeResolver: { resolve: async () => args().scopes } }, actor, 'syn-cid') };
}
afterEach(() => vi.useRealTimers());
it('merges room shards through per-leg bindings, Scope checks and projection, and logs each leg', async () => {
  const { endpoint, logs } = runtime({ async *query(leg) {
    expect(leg.bindings.params?.rooms).toEqual(leg.rooms);
    yield { room: leg.rooms[0], id: leg.targetId === 'syn-1' ? '2' : '1', secret: 'syn-private-row' };
  } });
  expect((await endpoint.handle(args())).data).toEqual([{ id: 1 }, { id: 2 }]);
  expect(logs).toEqual(['syn-1', 'syn-2'].map((targetId) => ({ actorId: actor.actor_id, correlationId: 'syn-cid', endpointId: 'syn.rows', targetId })));
});
it('aborts and returns a pending sibling iterator on 502 without data', async () => {
  vi.useFakeTimers();
  let options: ConnectorQueryOptions | undefined;
  let release: () => void = () => {};
  const pending = new Promise<IteratorResult<unknown>>((resolve) => { release = () => resolve({ done: true, value: undefined }); });
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
  const { endpoint } = runtime({ query(leg, opts) {
    if (leg.targetId === 'syn-1') return { [Symbol.asyncIterator]: () => ({ next: async () => { throw new MenuUpstreamError('unavailable'); } }) };
    options = opts;
    return { [Symbol.asyncIterator]: () => ({ next: () => pending, return: returned }) };
  } });
  const response = endpoint.handle(args()).then((result) => result, (error: unknown) => error);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(options?.signal.aborted).toBe(true);
    expect(returned).toHaveBeenCalledOnce();
  } finally {
    release();
    expect(await response).toEqual(new MenuUpstreamError('unavailable'));
  }
});
it.each([
  ['judgment', 'transport', 'unavailable'], ['transport', 'judgment', 'unavailable'],
  ['judgment', 'core', 'timeout'], ['core', 'judgment', 'timeout'],
  ['core', 'transport', 'unavailable'], ['transport', 'core', 'unavailable'],
] as const)('ranks %s and %s deterministically', async (first, second, expected) => {
  const { endpoint } = runtime({ query(leg) {
    const failure = leg.targetId === 'syn-1' ? first : second;
    return { [Symbol.asyncIterator]: () => ({ next: async () => {
      if (failure === 'judgment') throw new TargetJudgmentTimeout();
      throw new MenuUpstreamError(failure === 'core' ? 'timeout' : 'unavailable');
    } }) };
  } });
  await expect(endpoint.handle(args())).rejects.toEqual(new MenuUpstreamError(expected));
});
it('a judgment timeout alone stays a data-free timeout', async () => {
  const { endpoint } = runtime({ async *query(leg) {
    if (leg.targetId === 'syn-1') throw new TargetJudgmentTimeout();
    yield { room: 'R2', id: 2 };
  } });
  expect(await endpoint.handle(args())).toMatchObject({ outcome: 'timeout', data: null });
});
it('overflow stops at maxRows + 1, aborts its sibling and lets query judge too_large', async () => {
  let pulled = 0; let sibling: AbortSignal | undefined;
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
  const { run } = runtime({ query(leg, options) {
    expect(options.rowCap).toBe(3);
    if (leg.targetId === 'syn-1') return { async *[Symbol.asyncIterator]() { for (let id = 0; id < 10; id++) { pulled++; yield { room: 'R1', id }; } } };
    sibling = options.signal;
    return { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<unknown>>(() => {}), return: returned }) };
  } }, 2);
  expect(await run()).toMatchObject({ outcome: 'too_large', data: null });
  expect(pulled).toBe(3); expect(sibling?.aborted).toBe(true); expect(returned).toHaveBeenCalledOnce();
});
it('merged count above maxRows is judged too_large', async () => {
  const { run } = runtime({ async *query(leg) { for (let i = 0; i < 2; i++) yield { room: leg.rooms[0], id: (leg.targetId === 'syn-1' ? 0 : 2) + i }; } }, 3);
  expect(await run()).toMatchObject({ outcome: 'too_large', data: null });
});
it('uses one arrival deadline even when the first connector consumes time synchronously', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const budgets: number[] = [];
  const { endpoint } = runtime({ query(leg, options) {
    budgets.push(options.deadlineMs);
    if (leg.targetId === 'syn-1') vi.setSystemTime(11000);
    return { async *[Symbol.asyncIterator]() { yield { room: leg.rooms[0], id: leg.targetId === 'syn-1' ? 1 : 2 }; } };
  } });
  await endpoint.handle({ ...args(), arrivedAtMs: 9000 });
  expect(budgets).toEqual([24000, 23000]);
});
it('shared core deadline cancels every pending leg', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const signals: AbortSignal[] = [];
  const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
  const { endpoint } = runtime({ query(_leg, options) {
    signals.push(options.signal);
    return { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<unknown>>(() => {}), return: returned }) };
  } });
  const promise = expect(endpoint.handle({ ...args(), arrivedAtMs: 10000 })).rejects.toEqual(new MenuUpstreamError('timeout'));
  await vi.advanceTimersByTimeAsync(27000); await promise;
  expect(signals).toHaveLength(2); expect(signals.every((signal) => signal.aborted)).toBe(true); expect(returned).toHaveBeenCalledTimes(2);
});
it('duplicate tie-break values fail the handler without exposing values', async () => {
  const { endpoint } = runtime({ async *query(leg) { yield { room: leg.rooms[0], id: 7 }; } });
  await expect(endpoint.handle(args())).rejects.toEqual(new MenuUpstreamError('unavailable'));
});
it('does not rank a driver rejection caused by sibling cancellation as a fresh transport failure', async () => {
  const { endpoint } = runtime({ query(leg, options) {
    if (leg.targetId === 'syn-1') return { [Symbol.asyncIterator]: () => ({ next: async () => { throw new TargetJudgmentTimeout(); } }) };
    const pending = new Promise<IteratorResult<unknown>>((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('syn-driver-cancelled')), { once: true });
    });
    return { [Symbol.asyncIterator]: () => ({ next: () => pending, return: async () => ({ done: true, value: undefined }) }) };
  } });
  expect(await endpoint.handle(args())).toMatchObject({ outcome: 'timeout', data: null });
});
function keyedRuntime(connector: Connector) {
  const owner: Routing = {
    routes: [{ sites: ['SITE-A'], rooms: ['R1'], targets: ['syn-1'] }, { sites: ['SITE-A'], rooms: ['R2'], targets: ['syn-2'] }],
    call: { statement: 'SELECT :key AS main', params: { key: 'params.q' }, response: { fields: { id: { from: '/id', type: 'number' } } } },
    scopeCheck: { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' }, unroutedRooms: 'error',
  };
  const bundle: DeclarationBundle = {
    endpoints: [{ id: 'syn.rows', menuId: 'syn', permission: 'syn:view', paramKeys: ['q'], paramTypes: { q: { type: 'string' } }, requiresScope: true, context: {}, limits: { maxRows: 4 }, mergeTimeDomain: false }],
    actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }], endpointOwners: { 'syn.rows': owner },
    targets: Object.fromEntries(['syn-1', 'syn-2'].map((id) => [id, { kind: 'sql' as const, dialect: 'postgres' as const, connectionFile: '/syn/secret' }])),
  } as DeclarationBundle;
  return defined(declaredContribution({ bundle, checkService: stubCheckService(true), connectorFactories: { sql: () => connector } }).endpoints?.[0]);
}
it('resolve-keys judges each fan-out leg against its own rooms, not the request rooms', async () => {
  const mains: string[] = [];
  const endpoint = keyedRuntime({ async *query(leg) {
    // The lookup resolves the key to R2: inside the request rooms, outside leg syn-1's shard (R1).
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') { yield { site: 'SITE-A', room: 'R2' }; return; }
    mains.push(leg.targetId);
    yield { id: 1 };
  } });
  expect(await endpoint.handle({ ...args(), params: { q: 'syn-key' } })).toMatchObject({ outcome: 'forbidden', data: null });
  expect(mains).not.toContain('syn-1');
});
it('resolve-keys answers from every leg when each lookup resolves inside its own shard', async () => {
  const endpoint = keyedRuntime({ async *query(leg) {
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') { yield { site: 'SITE-A', room: leg.rooms[0] }; return; }
    yield { id: leg.targetId === 'syn-1' ? 1 : 2 };
  } });
  const answer = await endpoint.handle({ ...args(), params: { q: 'syn-key' } });
  expect(answer).toMatchObject({ outcome: 'ok' }); expect((answer as { data: unknown[] }).data).toHaveLength(2);
});
