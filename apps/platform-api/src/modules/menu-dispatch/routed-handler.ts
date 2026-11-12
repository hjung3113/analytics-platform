import type { DeclaredEndpoint, DeclarationBundle, Routing, Call } from './declarations-file.js';
import type { Connector, ConnectorFactories, ConnectorLeg, RoutingLog } from './connectors/types.js';
import { TargetJudgmentTimeout } from './connectors/types.js';
import type { TargetSecrets } from './bundle/secrets.js';
import { callBindings } from './bundle/calls.js';
import { bindingValue, resolveBindings, sameBinding } from './binding-values.js';
import { allowedRooms, effectiveValueMap, mapValue, selectRoutes } from './routing.js';
import { enforceRowScope, pointerValue, rowInScope } from './scope-check.js';
import { MenuUpstreamError } from './forwarder.js';
import type { EndpointHandlerArgs, EndpointResult } from './types.js';

export interface RoutedDependencies {
  connectorFactories: ConnectorFactories;
  targetSecrets?: Readonly<Record<string, TargetSecrets>>;
  timeoutMs: number;
  log?: (entry: RoutingLog) => void;
}
const noData = (outcome: 'error' | 'empty' | 'forbidden' | 'timeout'): EndpointResult => ({ outcome, data: null, assessments: [], trust: null });

/** Final contract projection. Driver-specific precision/time handling belongs in the connector. */
export function projectRow(row: unknown, call: Call): unknown {
  const fields = 'response' in call ? call.response?.fields : undefined;
  if (!fields) return row;
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => {
    const source = pointerValue(row, field.from);
    let value = source;
    if (source === undefined) throw new MenuUpstreamError('unavailable');
    if (source !== null) {
      if (field.type === 'number') {
        if (!['string', 'number', 'bigint'].includes(typeof source) || (typeof source === 'string' && !source.trim())) throw new MenuUpstreamError('unavailable');
        const number = Number(source);
        if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number))) throw new MenuUpstreamError('unavailable');
        value = number;
      } else if (field.type === 'string') {
        if (!['string', 'number', 'bigint', 'boolean'].includes(typeof source)) throw new MenuUpstreamError('unavailable');
        value = String(source);
      } else if (field.type === 'wallclock') {
        const match = typeof source === 'string' ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(source) : null;
        if (!match) throw new MenuUpstreamError('unavailable');
        const wall = `${match[1]}T${match[2]}`;
        const date = new Date(`${wall}Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== wall) throw new MenuUpstreamError('unavailable');
        value = wall;
      }
    }
    return [name, value];
  }));
}

/** Race each pull against cancellation, including drivers that have not yielded a first row. */
async function readRows(connector: Connector, leg: ConnectorLeg, signal: AbortSignal, deadlineAt: number, rowCap: number, consume: (row: unknown) => void): Promise<void> {
  const local = new AbortController();
  const combined = AbortSignal.any([signal, local.signal]);
  combined.throwIfAborted();
  if (deadlineAt <= Date.now()) throw new MenuUpstreamError('timeout');
  if (deadlineAt - Date.now() <= 2000) throw new TargetJudgmentTimeout();
  const iterator = connector.query(leg, { signal: combined, deadlineMs: Math.max(0, deadlineAt - Date.now() - 2000), rowCap })[Symbol.asyncIterator]();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new MenuUpstreamError('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    for (let read = 0; read < rowCap; read++) {
      const item = await Promise.race([iterator.next(), aborted]);
      signal.throwIfAborted();
      if (deadlineAt <= Date.now()) throw new MenuUpstreamError('timeout');
      if (item.done) return;
      consume(item.value);
    }
  } finally {
    local.abort();
    signal.removeEventListener('abort', onAbort);
    // Abort reaches the driver before return. A stuck driver must not hold the core past its deadline.
    void Promise.resolve(iterator.return?.()).catch(() => {});
  }
}

export async function handleRouted(endpoint: DeclaredEndpoint, owner: Routing, bundle: DeclarationBundle, deps: RoutedDependencies, args: EndpointHandlerArgs): Promise<EndpointResult> {
  const site = endpoint.requiresScope ? args.context.scopeId as string : null;
  const rooms = allowedRooms(endpoint.context.roomNames === 'apply', args);
  const selected = selectRoutes(owner, site, rooms);
  if (!selected.ok) return noData('error');
  if (selected.legs.length === 0) return noData('empty');
  // A request spanning room shards is not partially answered before node d1.
  if (selected.legs.length !== 1) return noData('error');
  const chosen = selected.legs[0];
  if (!chosen) return noData('error');
  const target = bundle.targets?.[chosen.targetId];
  const factory = target && deps.connectorFactories[target.kind];
  if (!target || !factory) throw new MenuUpstreamError('unavailable');
  const map = effectiveValueMap(target.valueMap, chosen.route.valueMap);
  const mappedSite = site === null ? null : mapValue(site, map.site);
  const mappedRooms = chosen.rooms.map((room) => mapValue(room, map.room));
  if (mappedSite === undefined || mappedRooms.some((room) => room === undefined)) return noData('error');
  const outgoingRooms = mappedRooms as string[];
  const call = chosen.route.call ?? owner.call;
  const deadlineAt = (args.arrivedAtMs ?? Date.now()) + deps.timeoutMs;
  const controller = new AbortController();
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new MenuUpstreamError('timeout');
  const timer = setTimeout(() => controller.abort(), remaining);
  const signal = AbortSignal.any([controller.signal, ...(args.signal ? [args.signal] : [])]);
  const rowCap = (endpoint.limits?.maxRows ?? 0) + 1;
  try {
    deps.log?.({ actorId: args.actor.actor_id, correlationId: args.correlationId, endpointId: endpoint.id, targetId: chosen.targetId });
    const connector = factory(target, deps.targetSecrets?.[chosen.targetId]);
    const leg = (legCall: Call, override?: Parameters<typeof resolveBindings>[4]): ConnectorLeg => ({ targetId: chosen.targetId, call: legCall, site: mappedSite, rooms: outgoingRooms, bindings: resolveBindings(legCall, args, mappedSite, outgoingRooms, override) });
    if (owner.scopeCheck?.mode === 'resolve-keys') {
      const check = owner.scopeCheck;
      const keys = bindingValue(check.keys, args, mappedSite, outgoingRooms);
      const aggregate = typeof check.keys !== 'string' && Array.isArray(check.keys.const) && check.keys.const.length === 0;
      if (!aggregate) {
        if (!callBindings(check.lookup).some((binding) => sameBinding(binding, check.keys))) return noData('forbidden');
        const list = Array.isArray(keys) ? keys : [keys];
        if (!list.length || list.some((key) => typeof key !== 'string' && typeof key !== 'number')) return noData('forbidden');
        for (const key of new Set(list)) {
          const resolved: unknown[] = [];
          await readRows(connector, leg(check.lookup, { binding: check.keys, value: Array.isArray(keys) ? [key] : key }), signal, deadlineAt, 2, (row) => resolved.push(row));
          if (resolved.length !== 1 || !rowInScope(resolved[0], check, site, rooms, map)) return noData('forbidden');
        }
      }
    }
    let rowsRead = 0;
    const rows: unknown[] = [];
    await readRows(connector, leg(call), signal, deadlineAt, rowCap, (row) => {
      rowsRead++;
      if (enforceRowScope(row, owner.scopeCheck, site, chosen.rooms, map)) rows.push(projectRow(row, call));
    });
    return { outcome: rows.length ? 'ok' : 'empty', data: rows, rowsRead, assessments: (endpoint.kinds ?? []).filter((kind) => kind !== 'coverage').map((kind) => ({ kind, state: 'unknown', reason: 'source_unavailable' })), trust: null };
  } catch (error) {
    if (controller.signal.aborted) throw new MenuUpstreamError('timeout');
    if (signal.aborted) throw new MenuUpstreamError('unavailable');
    if (error instanceof TargetJudgmentTimeout) return noData('timeout');
    if (error instanceof MenuUpstreamError) throw new MenuUpstreamError(error.kind);
    throw new MenuUpstreamError('unavailable');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
