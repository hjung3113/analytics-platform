import { afterEach, expect, it, vi } from 'vitest';

import { stubCheckService } from '../../../test-support/platform-route-stubs.js';
import { defined } from '../../../test-support/defined.js';
import { declaredContribution } from '../declared-endpoints.js';
import type { DeclarationBundle, Routing } from '../declarations-file.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { enforceRowScope } from '../scope-check.js';
import { MenuUpstreamError } from '../forwarder.js';
import { handleRouted } from '../routed-handler.js';

const actor = { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' } as const;
const owner = (): Routing => ({ routes: [{ sites: ['SITE-A'], targets: ['syn-target'] }], call: { statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' } }, scopeCheck: { mode: 'verify-rows', roomField: '/room' }, unroutedRooms: 'error' });
const bundle = (routing = owner()): DeclarationBundle => ({
  endpoints: [{ id: 'syn.rows', menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: {}, limits: { maxRows: 2 }, mergeTimeDomain: false }],
  actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
  endpointOwners: { 'syn.rows': routing },
  targets: { 'syn-target': { kind: 'sql', dialect: 'postgres', connectionFile: '/syn/secret' } },
});
const scopes = [{ site: 'SITE-A', rooms: ['RA1'] }];
afterEach(() => vi.useRealTimers());

it.each(['missing check', 'aggregate without rooms', 'missing maxRows', 'non-injective map'] as const)('programmatic assembly refuses %s before connector construction', (variant) => {
  const routing = owner();
  let input = bundle(routing);
  let message = 'requiresScope core-answered endpoint needs scopeCheck';
  if (variant === 'missing check') {
    const { scopeCheck: _check, ...withoutCheck } = routing;
    input = bundle(withoutCheck);
  }
  if (variant === 'aggregate without rooms') {
    routing.scopeCheck = { mode: 'resolve-keys', keys: { const: [] }, lookup: { statement: 'SELECT 1', params: {} }, siteField: '/site', roomField: '/room' };
    routing.call = { statement: 'SELECT 1', params: {} };
    message = 'resolve-keys without keys must bind scope.rooms in the main call';
  }
  if (variant === 'missing maxRows') {
    input = { ...input, endpoints: input.endpoints.map(({ limits: _limits, ...row }) => row) };
    message = 'non-paged core-answered endpoint needs limits.maxRows';
  }
  if (variant === 'non-injective map') {
    routing.routes[0] = { sites: ['SITE-A'], targets: ['syn-target'], valueMap: { room: { RA1: 'same', RA2: 'same' } } };
    message = 'valueMap must be injective';
  }
  const factory = vi.fn();
  expect(() => createMenuDispatchRegistry([declaredContribution({ bundle: input, checkService: stubCheckService(true), connectorFactories: { sql: factory } })], { scopeResolver: { resolve: async () => scopes } })).toThrow(message);
  expect(factory).not.toHaveBeenCalled();
});

it('row Scope enforcement refuses an absent check without exposing the row', () => {
  expect(() => enforceRowScope({ secret: 'syn-private-row' }, undefined, 'SITE-A', ['RA1'], {})).toThrow(new MenuUpstreamError('unavailable'));
});

it('scope-free routed endpoint returns rows without a Scope check', async () => {
  const routing: Routing = { routes: [{ targets: ['syn-target'] }], call: { statement: 'SELECT 1', params: {} }, unroutedRooms: 'error' };
  const source = bundle(routing);
  const input = { ...source, endpoints: source.endpoints.map((endpoint) => ({ ...endpoint, requiresScope: false })) };
  const rows = [{ value: 'syn-public-row' }];
  const contribution = declaredContribution({ bundle: input, checkService: stubCheckService(true), connectorFactories: { sql: () => ({ async *query() { yield* rows; } }) } });
  const shape = judgeQueryShape({ endpoint: 'syn.rows', context: {}, params: {} }, createMenuDispatchRegistry([contribution]));
  if (!shape.ok) throw new Error(shape.message);
  await expect(runQuery(shape, actor, 'syn-cid')).resolves.toMatchObject({ outcome: 'ok', data: rows });
});

it('scoped routed endpoint without a check still refuses rows when bypassing validation', async () => {
  const { scopeCheck: _check, ...routing } = owner();
  const input = bundle(routing);
  await expect(handleRouted(defined(input.endpoints[0]), routing, input, {
    timeoutMs: 27000,
    connectorFactories: { sql: () => ({ async *query() { yield { secret: 'syn-private-row' }; } }) },
  }, { actor, context: { scopeId: 'SITE-A' }, scopes, params: {}, correlationId: 'syn-cid', sessionVersion: async () => 'syn-sv' })).rejects.toThrow(new MenuUpstreamError('unavailable'));
});

it('legacy resolver rejection stays forbidden when the caller aborts with an upstream timeout', async () => {
  const source = bundle();
  const input = { ...source, endpoints: source.endpoints.map(({ limits: _limits, ...endpoint }) => endpoint), endpointOwners: { 'syn.rows': '/syn/rows' } };
  const forward = vi.fn();
  const contribution = declaredContribution({ bundle: input, checkService: stubCheckService(true), forwarder: { forward } });
  const controller = new AbortController();
  const registry = createMenuDispatchRegistry([contribution], { scopeResolver: { resolve: async () => {
    controller.abort(new MenuUpstreamError('timeout'));
    throw new Error('syn-resolver-rejection');
  } } });
  const shape = judgeQueryShape({ endpoint: 'syn.rows', context: { scopeId: 'SITE-A' }, params: {} }, registry);
  if (!shape.ok) throw new Error(shape.message);
  await expect(runQuery(shape, actor, 'syn-cid', controller.signal)).resolves.toMatchObject({ outcome: 'forbidden', data: null });
  expect(forward).not.toHaveBeenCalled();
});

it.each(['authorization', 'Scope resolver'] as const)('arrival deadline races pending %s and cancels Scope without connector calls', async (phase) => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const factory = vi.fn();
  const contribution = declaredContribution({ bundle: bundle(), checkService: stubCheckService(true), connectorFactories: { sql: factory }, timeoutMs: 3000 });
  const declaration = defined(contribution.endpoints?.[0]);
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let resolverSignal: AbortSignal | undefined;
  const registry = createMenuDispatchRegistry([{ ...contribution, endpoints: [{ ...declaration, authorize: phase === 'authorization' ? async () => { entered(); await held; return true; } : declaration.authorize }] }], {
    scopeResolver: { resolve: async (_actor, signal) => { resolverSignal = signal; entered(); await held; return scopes; } },
  });
  const shape = judgeQueryShape({ endpoint: 'syn.rows', context: { scopeId: 'SITE-A' }, params: {} }, registry);
  if (!shape.ok) throw new Error(shape.message);
  let result: unknown;
  const request = runQuery(shape, actor, 'syn-cid', undefined, async () => 'syn-sv', 9000).then((value) => { result = value; }, (error: unknown) => { result = error; });
  await started;
  try {
    await vi.advanceTimersByTimeAsync(1999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toMatchObject({ httpStatus: 504, code: 'upstream.timeout' });
    if (phase === 'Scope resolver') expect(resolverSignal?.aborted).toBe(true);
    expect(factory).not.toHaveBeenCalled();
  } finally {
    release(); await request;
  }
  expect(factory).not.toHaveBeenCalled();
});
