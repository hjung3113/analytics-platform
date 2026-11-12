import { afterEach, describe, expect, it, vi } from 'vitest';

import { declaredContribution } from '../declared-endpoints.js';
import type { DeclarationBundle, Routing } from '../declarations-file.js';
import type { Connector, ConnectorFactories, ConnectorLeg } from '../connectors/types.js';
import { TargetJudgmentTimeout } from '../connectors/types.js';
import { allowedRooms, selectRoutes } from '../routing.js';
import { resolveBindings, validateParamValues } from '../binding-values.js';
import { MenuUpstreamError } from '../forwarder.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { createMenuDispatchRegistry } from '../registry.js';
import type { EndpointHandlerArgs } from '../types.js';
import type { CheckService } from '../../permissions/check-service.js';
import { routedBundle } from './bundle-fixtures.js';
import { menuSnapshotFor } from '../../../test-support/menu-snapshot.js';

const actor = { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' } as EndpointHandlerArgs['actor'];
const args = (context: Record<string, unknown> = { scopeId: 'SITE-A' }): EndpointHandlerArgs => ({ actor, context, scopes: [{ site: 'SITE-A', rooms: ['RA1', 'RA2'] }, { site: 'SITE-B', rooms: ['RB1'] }], params: { q: 'synthetic' }, correlationId: 'syn-cid', sessionVersion: async () => 'syn-sv' });
const owner = (): Routing => ({ routes: [{ sites: ['SITE-A', 'SITE-B'], targets: ['tgt-1'] }], call: { statement: 'SELECT :rooms, :site, :q', params: { rooms: 'scope.rooms', site: 'scope.site', q: 'params.q' } }, scopeCheck: { mode: 'verify-rows', siteField: '/site', roomField: '/room' }, unroutedRooms: 'error' });
function runtime(routing = owner(), connector?: Connector, over: Record<string, unknown> = {}) {
  const logs: unknown[] = [];
  const calls: ConnectorLeg[] = [];
  const fake: Connector = connector ?? { async *query(leg) { calls.push(leg); yield { site: leg.site, room: leg.rooms[0], value: '7' }; } };
  const bundle = { ...routedBundle(), endpoints: [{ ...routedBundle().endpoints[0], context: {}, kinds: ['collection'], ...over }], endpointOwners: { 'syn.rows': routing } } as unknown as DeclarationBundle;
  const factories: ConnectorFactories = { sql: () => fake };
  const contribution = declaredContribution({ bundle, snapshot: menuSnapshotFor(bundle), checkService: { checkCapability: async () => ({ allow: true }) } as unknown as CheckService, connectorFactories: factories, timeoutMs: 27000, log: (entry) => logs.push(entry) });
  const endpoint = contribution.endpoints?.[0];
  if (!endpoint) throw new Error('endpoint missing');
  return { endpoint, bundle, calls, logs };
}
afterEach(() => vi.useRealTimers());

describe('allowed rooms R', () => {
  it.each([
    ['apply', ['RA2'], ['RA2']], ['apply', null, ['RA1', 'RA2']], [undefined, undefined, ['RA1', 'RA2']], ['apply', [], []],
  ])('%s / %j is finite and restricted to the request site', (mode, rooms, expected) => {
    expect(allowedRooms(mode === 'apply', args({ scopeId: 'SITE-A', roomNames: rooms }))).toEqual(expected);
  });
});

it.each(['SITE-A', 'SITE-B'])('routes N sites to one target carrying only %s', async (site) => {
  const { endpoint, calls } = runtime();
  const result = await endpoint.handle(args({ scopeId: site }));
  expect(result.outcome).toBe('ok');
  expect(calls[0]).toMatchObject({ site, rooms: site === 'SITE-A' ? ['RA1', 'RA2'] : ['RB1'], bindings: { params: { site, q: 'synthetic' } } });
  expect(result.assessments).toEqual([{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }]);
});

it('narrows each selected leg to R intersect route rooms', () => {
  const routing = owner();
  routing.routes = [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }, { sites: ['SITE-A'], rooms: ['RA2'], targets: ['tgt-2'] }];
  expect(selectRoutes(routing, 'SITE-A', ['RA1', 'RA2'])).toEqual({ ok: true, legs: [
    { route: routing.routes[0], targetId: 'tgt-1', rooms: ['RA1'] }, { route: routing.routes[1], targetId: 'tgt-2', rooms: ['RA2'] },
  ] });
  expect(selectRoutes(routing, 'SITE-A', ['RA2'])).toEqual({ ok: true, legs: [{ route: routing.routes[1], targetId: 'tgt-2', rooms: ['RA2'] }] });
});
it.each([
  ['SITE-Z', ['RA1'], 'error', 'error'], ['SITE-A', ['RA3'], 'error', 'error'], ['SITE-A', ['RA3'], 'skip', 'empty'], ['SITE-A', [], 'error', 'empty'],
])('handles missing scope/rooms %s %j %s', async (site, rooms, policy, outcome) => {
  const routing = owner(); routing.routes = [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }]; routing.unroutedRooms = policy as 'skip' | 'error';
  const { endpoint, calls } = runtime(routing, undefined, { context: { roomNames: 'apply' } });
  expect((await endpoint.handle(args({ scopeId: site, roomNames: rooms }))).outcome).toBe(outcome);
  expect(calls).toEqual([]);
});
it('skip retains only covered rooms', () => {
  const routing = owner(); routing.unroutedRooms = 'skip'; routing.routes = [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }];
  expect(selectRoutes(routing, 'SITE-A', ['RA1', 'RA2'])).toMatchObject({ ok: true, legs: [{ rooms: ['RA1'] }] });
});
it('maps outgoing values and inversely verifies incoming values before projection', async () => {
  const routing = owner(); routing.routes[0] = { sites: ['SITE-A'], targets: ['tgt-1'], valueMap: { site: { 'SITE-A': 'syn-a' }, room: { RA1: 'syn-1', RA2: 'syn-2' } } };
  routing.call = { statement: 'SELECT :site, :rooms', params: { site: 'scope.site', rooms: 'scope.rooms' }, response: { fields: { value: { from: '/value', type: 'number' } } } };
  const { endpoint, calls } = runtime(routing);
  expect((await endpoint.handle(args())).data).toEqual([{ value: 7 }]);
  expect(calls[0]).toMatchObject({ site: 'syn-a', rooms: ['syn-1', 'syn-2'], bindings: { params: { rooms: ['syn-1', 'syn-2'], site: 'syn-a' } } });
});
it('refuses an unmapped outgoing room without any connector call', async () => {
  const routing = owner(); routing.routes[0] = { sites: ['SITE-A'], targets: ['tgt-1'], valueMap: { room: { RA1: 'syn-1' } } };
  const { endpoint, calls } = runtime(routing);
  expect(await endpoint.handle(args())).toMatchObject({ outcome: 'error', data: null }); expect(calls).toEqual([]);
});

it.each([
  [{ type: 'string' }, 3], [{ type: 'string', maxLength: 2 }, 'long'], [{ type: 'string', enum: ['a'] }, 'b'],
  [{ type: 'number' }, '1'], [{ type: 'number' }, Infinity], [{ type: 'number', enum: [1] }, 2],
  [{ type: 'boolean' }, 'true'], [{ type: 'boolean', enum: [true] }, false],
  [{ type: 'string[]' }, 'a'], [{ type: 'string[]' }, [1]], [{ type: 'string[]', maxItems: 1 }, ['a', 'b']],
  [{ type: 'string[]', maxLength: 1 }, ['long']], [{ type: 'string[]', enum: ['a'] }, ['b']], [{ type: 'string' }, undefined],
])('refuses param value %j / %j with a fixed message', (type, value) => {
  expect(validateParamValues({ q: type } as Parameters<typeof validateParamValues>[0], { q: value })).toEqual({ ok: false, message: 'Invalid declared endpoint params' });
});
it('judges typed params before authorization/connector calls', () => {
  const { endpoint } = runtime();
  const registry = createMenuDispatchRegistry([{ endpoints: [endpoint] }], { scopeResolver: { resolve: async () => [] } });
  expect(judgeQueryShape({ endpoint: 'syn.rows', context: { scopeId: 'SITE-A' }, params: { q: 1 } }, registry)).toMatchObject({ ok: false });
});

it.each(['verify-rows', 'drop-rows'] as const)('%s never returns or logs a rejected source row', async (mode) => {
  const routing = owner(); routing.scopeCheck = { mode, siteField: '/site', roomField: '/room' };
  const { endpoint, logs } = runtime(routing, { async *query() { yield { site: 'SITE-A', room: 'RA1', value: 1 }; yield { site: 'SITE-B', room: 'RA1', secret: 'syn-private-row' }; } });
  if (mode === 'verify-rows') await expect(endpoint.handle(args())).rejects.toMatchObject({ httpStatus: 502 });
  else expect((await endpoint.handle(args())).data).toEqual([{ site: 'SITE-A', room: 'RA1', value: 1 }]);
  expect(JSON.stringify(logs)).not.toContain('syn-private-row');
  expect(logs).toEqual([{ actorId: 'syn-actor', correlationId: 'syn-cid', endpointId: 'syn.rows', targetId: 'tgt-1' }]);
});
it.each(['RA3', 'unmapped'])('verify-rows refuses a room outside the leg: %s', async (room) => {
  const { endpoint } = runtime(owner(), { async *query() { yield { site: 'SITE-A', room, secret: 'syn-private-row' }; } });
  await expect(endpoint.handle(args())).rejects.toEqual(new MenuUpstreamError('unavailable'));
});

it.each(['pass', 'unresolved', 'other-room', 'other-site', 'aggregate'] as const)('resolve-keys %s', async (variant) => {
  const routing = owner();
  routing.scopeCheck = { mode: 'resolve-keys', keys: variant === 'aggregate' ? { const: [] } : 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' };
  const calls: ConnectorLeg[] = [];
  const { endpoint } = runtime(routing, { async *query(leg) {
    calls.push(leg);
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') {
      if (variant !== 'unresolved') yield { site: variant === 'other-site' ? 'SITE-B' : 'SITE-A', room: variant === 'other-room' ? 'RA3' : 'RA1' };
    } else yield { value: 7 };
  } });
  const result = await endpoint.handle(args());
  expect(result.outcome).toBe(['pass', 'aggregate'].includes(variant) ? 'ok' : 'forbidden');
  expect(calls).toHaveLength(variant === 'pass' ? 2 : 1);
  if (variant === 'aggregate') expect(calls[0]?.bindings).toMatchObject({ params: { rooms: ['RA1', 'RA2'] } });
});

it('stops after maxRows + 1 rows read and aborts even when drop-rows discards every row', async () => {
  let pulled = 0; let cancelled = false;
  const routing = owner(); routing.scopeCheck = { mode: 'drop-rows', siteField: '/site', roomField: '/room' };
  const { endpoint } = runtime(routing, { async *query(_leg, { signal, rowCap }) {
    expect(rowCap).toBe(3);
    try { for (let i = 0; i < 100; i++) { pulled++; yield { site: 'SITE-Z', room: 'syn-out' }; } }
    finally { cancelled = signal.aborted; }
  } }, { limits: { maxRows: 2 } });
  const result = await runQuery({ ok: true, declaration: endpoint, context: { scopeId: 'SITE-A' }, params: { q: 'a' }, scopeResolver: { resolve: async () => [{ site: 'SITE-A', rooms: ['RA1'] }] } }, actor, 'syn-cid');
  expect(result).toMatchObject({ outcome: 'too_large', data: null }); expect(pulled).toBe(3); expect(cancelled).toBe(true);
});
it('budgets from arrival, including time spent before handle', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const { endpoint } = runtime(owner(), { async *query(_leg, options) { expect(options.deadlineMs).toBe(24000); yield { site: 'SITE-A', room: 'RA1' }; } });
  await endpoint.handle({ ...args(), arrivedAtMs: 9000 });
});
it.each(['judgment', 'transport', 'deadline', 'unsafe'] as const)('sanitizes %s failure', async (kind) => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const { endpoint } = runtime(owner(), { query() {
    if (kind === 'judgment') throw new TargetJudgmentTimeout();
    if (kind === 'transport') throw new MenuUpstreamError('unavailable');
    if (kind === 'unsafe') throw new Error('syn-private-driver');
    return { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) };
  } });
  const request = endpoint.handle({ ...args(), arrivedAtMs: 9000 });
  if (kind === 'judgment') expect(await request).toMatchObject({ outcome: 'timeout', data: null });
  else {
    const assertion = expect(request).rejects.toEqual(new MenuUpstreamError(kind === 'deadline' ? 'timeout' : 'unavailable'));
    if (kind === 'deadline') await vi.advanceTimersByTimeAsync(26000);
    await assertion;
  }
});

it('uses target valueMap and route axis overrides consistently', async () => {
  const routing = owner();
  routing.routes[0] = { sites: ['SITE-A'], targets: ['tgt-1'], valueMap: { room: { RA1: 'route-1', RA2: 'route-2' } } };
  const { bundle } = runtime();
  const modified = { ...bundle, targets: { 'tgt-1': { kind: 'sql' as const, dialect: 'postgres' as const, connectionFile: '/syn/secret', valueMap: { site: { 'SITE-A': 'mapped-a' }, room: { RA1: 'target-1', RA2: 'target-2' } } } }, endpointOwners: { 'syn.rows': routing } };
  const endpoints = declaredContribution({ bundle: modified, snapshot: menuSnapshotFor(modified), checkService: {} as CheckService, connectorFactories: { sql: () => ({ async *query(leg) {
    expect(leg).toMatchObject({ site: 'mapped-a', rooms: ['route-1', 'route-2'] }); yield { site: 'mapped-a', room: 'route-1' };
  } }) } }).endpoints;
  expect((await endpoints?.[0]?.handle(args()))?.outcome).toBe('ok');
});
it('rejects a source value absent from the inverse map', async () => {
  const routing = owner(); routing.routes[0] = { sites: ['SITE-A'], targets: ['tgt-1'], valueMap: { room: { RA1: 'mapped-1', RA2: 'mapped-2' } } };
  const { endpoint } = runtime(routing, { async *query() { yield { site: 'SITE-A', room: 'RA1' }; } });
  await expect(endpoint.handle(args())).rejects.toEqual(new MenuUpstreamError('unavailable'));
});
it('answers a request spanning room shards from every owning target, each with only its rooms', async () => {
  const routing = owner(); routing.routes = [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }, { sites: ['SITE-A'], rooms: ['RA2'], targets: ['tgt-2'] }];
  const { bundle } = runtime();
  const legs: { targetId: string; rooms: readonly string[] }[] = [];
  const factory = vi.fn(() => ({ async *query(leg: { targetId: string; rooms: readonly string[] }) { legs.push({ targetId: leg.targetId, rooms: leg.rooms }); yield { site: 'SITE-A', room: leg.rooms[0] }; } }));
  const contribution = declaredContribution({ bundle: { ...bundle, endpointOwners: { 'syn.rows': routing }, targets: { ...bundle.targets, 'tgt-2': { kind: 'sql', dialect: 'postgres', connectionFile: '/syn/second-secret' } } }, snapshot: menuSnapshotFor(bundle), checkService: {} as CheckService, connectorFactories: { sql: factory } });
  const endpoint = contribution.endpoints?.[0];
  if (!endpoint) throw new Error('endpoint missing');
  const answer = await endpoint.handle(args());
  expect(answer).toMatchObject({ outcome: 'ok' }); expect((answer as { data: unknown[] }).data).toHaveLength(2);
  expect(legs.sort((a, b) => a.targetId.localeCompare(b.targetId))).toEqual([{ targetId: 'tgt-1', rooms: ['RA1'] }, { targetId: 'tgt-2', rooms: ['RA2'] }]);
});
it('counts authorized overflow at the core row judgment too', async () => {
  let pulled = 0;
  const { endpoint } = runtime(owner(), { async *query() { for (let i = 0; i < 50; i++) { pulled++; yield { site: 'SITE-A', room: 'RA1' }; } } }, { limits: { maxRows: 2 } });
  const result = await runQuery({ ok: true, declaration: endpoint, context: { scopeId: 'SITE-A' }, params: { q: 'a' }, scopeResolver: { resolve: async () => [{ site: 'SITE-A', rooms: ['RA1'] }] } }, actor, 'syn-cid');
  expect(result).toMatchObject({ outcome: 'too_large', data: null }); expect(pulled).toBe(3);
});
it('uses the arrival budget after a slow Scope resolution and does not call when judgment time is gone', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const { endpoint, calls } = runtime();
  const result = await runQuery({ ok: true, declaration: endpoint, context: { scopeId: 'SITE-A' }, params: { q: 'a' }, scopeResolver: { resolve: async () => { vi.setSystemTime(36000); return [{ site: 'SITE-A', rooms: ['RA1'] }]; } } }, actor, 'syn-cid', undefined, async () => 'sv', 10000);
  expect(result).toMatchObject({ outcome: 'timeout', data: null }); expect(calls).toEqual([]);
});
it('an already exhausted core deadline fails 504 before calling', async () => {
  const { endpoint, calls } = runtime();
  await expect(endpoint.handle({ ...args(), arrivedAtMs: Date.now() - 30000 })).rejects.toMatchObject({ httpStatus: 504 }); expect(calls).toEqual([]);
});
it.each([
  ['number', 'Infinity', null], ['number', '9007199254740993', null], ['number', '7.25', 7.25],
  ['string', 7, '7'], ['wallclock', '2026-11-01 12:34:56.123', '2026-11-01T12:34:56'],
  ['wallclock', '2026-02-30T00:00:00', null], ['wallclock', '2026-11-01T12:34:56Z', null],
] as const)('projects %s safely from %s', async (type, source, expected) => {
  const routing = owner(); routing.call = { statement: 'SELECT :rooms, :site', params: { rooms: 'scope.rooms', site: 'scope.site' }, response: { fields: { value: { from: '/a~1b/~0value', type } } } };
  const { endpoint } = runtime(routing, { async *query() { yield { site: 'SITE-A', room: 'RA1', 'a/b': { '~value': source } }; } });
  if (expected === null) await expect(endpoint.handle(args())).rejects.toEqual(new MenuUpstreamError('unavailable'));
  else expect((await endpoint.handle(args())).data).toEqual([{ value: expected }]);
});
it('resolves every array key separately, preserving the lookup binding shape', async () => {
  const routing = owner(); routing.scopeCheck = { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' };
  const seen: unknown[] = [];
  const { endpoint } = runtime(routing, { async *query(leg) {
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') {
      seen.push(leg.bindings.params?.key);
      if (JSON.stringify(leg.bindings.params?.key) === '["syn-1"]') yield { site: 'SITE-A', room: 'RA1' };
    } else throw new Error('main must never run');
  } }, { paramTypes: { q: { type: 'string[]' } } });
  expect(await endpoint.handle({ ...args(), params: { q: ['syn-1', 'syn-2'] } })).toMatchObject({ outcome: 'forbidden', data: null }); expect(seen).toEqual([['syn-1'], ['syn-2']]);
});
it('dynamic empty keys are forbidden, never treated as aggregate', async () => {
  const routing = owner(); routing.scopeCheck = { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' };
  const { endpoint, calls } = runtime(routing);
  expect(await endpoint.handle({ ...args(), params: { q: [] } })).toMatchObject({ outcome: 'forbidden', data: null }); expect(calls).toEqual([]);
});
it('cancels a pending driver when the caller abandons the request', async () => {
  const aborted = new AbortController(); let driverSignal: AbortSignal | undefined;
  const { endpoint } = runtime(owner(), { query(_leg, { signal }) { driverSignal = signal; return { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }; } });
  const result = endpoint.handle({ ...args(), signal: aborted.signal });
  aborted.abort(); await expect(result).rejects.toEqual(new MenuUpstreamError('unavailable')); expect(driverSignal?.aborted).toBe(true);
});
it('lookup cannot silently ignore the keys binding', async () => {
  const routing = owner(); routing.scopeCheck = { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT 1', params: {} }, siteField: '/site', roomField: '/room' };
  const { endpoint, calls } = runtime(routing);
  expect(await endpoint.handle(args())).toMatchObject({ outcome: 'forbidden', data: null }); expect(calls).toEqual([]);
});
it('a constant-key lookup resolves each declared key through the same binding', async () => {
  const routing = owner(); routing.scopeCheck = { mode: 'resolve-keys', keys: { const: ['syn-1'] }, lookup: { statement: 'SELECT :key', params: { key: { const: ['syn-1'] } } }, siteField: '/site', roomField: '/room' };
  const { endpoint } = runtime(routing, { async *query(leg) {
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') expect(leg.bindings.params?.key).toEqual(['syn-1']);
    yield { site: 'SITE-A', room: 'RA1' };
  } });
  expect((await endpoint.handle(args())).outcome).toBe('ok');
});
it('resolves context and constant bindings without interpreting expressions', () => {
  expect(resolveBindings({ mode: 'mapped', method: 'POST', path: '/rows/{q}', pathParams: { q: 'params.q' }, query: { rooms: 'scope.rooms' }, body: { at: 'context.from', site: 'scope.site', fixed: { const: { enabled: true } } }, response: {} }, { ...args(), context: { from: '2026-11-01T00:00:00' } }, 'mapped-site', ['mapped-room'])).toEqual({ pathParams: { q: 'synthetic' }, query: { rooms: ['mapped-room'] }, body: { at: '2026-11-01T00:00:00', site: 'mapped-site', fixed: { enabled: true } } });
  expect(resolveBindings({ procedure: 'syn.rows', args: { rooms: 'scope.rooms' } }, args(), 'SITE-A', ['RA1'])).toEqual({ args: { rooms: ['RA1'] } });
});
it.each([
  [{ type: 'string', maxLength: 2, enum: ['a'] }, 'a'], [{ type: 'number', enum: [1] }, 1], [{ type: 'boolean' }, true], [{ type: 'string[]', maxItems: 2, maxLength: 2, enum: ['a', 'b'] }, ['a', 'b']],
])('accepts a correctly typed bounded param %j', (type, value) => {
  expect(validateParamValues({ q: type } as Parameters<typeof validateParamValues>[0], { q: value })).toEqual({ ok: true });
});
it('a synchronous slow pull cannot escape the core deadline', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const { endpoint } = runtime(owner(), { async *query() { vi.setSystemTime(38000); yield { site: 'SITE-A', room: 'RA1' }; } });
  await expect(endpoint.handle({ ...args(), arrivedAtMs: 10000 })).rejects.toEqual(new MenuUpstreamError('timeout'));
});
it('preserves an existing capped handler empty result with data null', async () => {
  const { endpoint } = runtime();
  const result = await runQuery({ ok: true, declaration: { ...endpoint, handle: async () => ({ outcome: 'empty', data: null }) }, context: { scopeId: 'SITE-A' }, params: { q: 'a' }, scopeResolver: { resolve: async () => [{ site: 'SITE-A', rooms: ['RA1'] }] } }, actor, 'syn-cid');
  expect(result).toMatchObject({ outcome: 'empty', data: null });
});
it('resolve-keys with skip: a key resolving to a skipped room is forbidden and the main call never runs', async () => {
  // `unroutedRooms: 'skip'` declares that this endpoint's data lives only in routed rooms; a key in RA2 cannot be read from RA1's target.
  const routing = owner(); routing.unroutedRooms = 'skip'; routing.routes = [{ sites: ['SITE-A'], rooms: ['RA1'], targets: ['tgt-1'] }];
  routing.scopeCheck = { mode: 'resolve-keys', keys: 'params.q', lookup: { statement: 'SELECT :key', params: { key: 'params.q' } }, siteField: '/site', roomField: '/room' };
  let mainCalls = 0;
  const { endpoint } = runtime(routing, { async *query(leg) {
    if ('statement' in leg.call && leg.call.statement === 'SELECT :key') { yield { site: 'SITE-A', room: 'RA2' }; return; }
    mainCalls++; yield { value: 1 };
  } });
  expect(await endpoint.handle(args())).toMatchObject({ outcome: 'forbidden', data: null }); expect(mainCalls).toBe(0);
});
