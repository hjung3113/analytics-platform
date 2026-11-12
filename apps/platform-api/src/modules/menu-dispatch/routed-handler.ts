import type { DeclaredEndpoint, DeclarationBundle, Routing, Call } from './declarations-file.js';
import type { Connector, ConnectorFactories, ConnectorLeg, RoutingLog } from './connectors/types.js';
import { TargetJudgmentTimeout } from './connectors/types.js';
import type { TargetSecrets } from './bundle/secrets.js';
import { callBindings } from './bundle/calls.js';
import { routeCall } from './bundle/routing.js';
import { bindingValue, resolveBindings, sameBinding } from './binding-values.js';
import type { SelectedLeg } from './routing.js';
import { mergeRows } from './merge.js';
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

class SiblingCancellation extends Error {}

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
    onAbort = () => reject(signal.reason instanceof SiblingCancellation ? signal.reason : new MenuUpstreamError(signal.reason instanceof MenuUpstreamError ? signal.reason.kind : 'timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    for (let read = 0; read < rowCap; read++) {
      const next = Promise.resolve(iterator.next()).catch((error: unknown) => {
        // Some drivers reject their pull synchronously from an abort listener. That is cancellation,
        // not a newly observed transport failure that can outrank the original target judgment.
        if (signal.aborted && signal.reason instanceof SiblingCancellation) throw signal.reason;
        throw error;
      });
      const item = await Promise.race([next, aborted]);
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
  if (selected.legs.length === 1) {
    const chosen = selected.legs[0];
    if (!chosen) return noData('error');
    return handleLeg(endpoint, owner, bundle, deps, args, chosen);
  }
  const deadlineAtMs = args.deadlineAtMs ?? (args.arrivedAtMs ?? Date.now()) + deps.timeoutMs;
  const core = new AbortController();
  const siblings = new AbortController();
  const remaining = deadlineAtMs - Date.now();
  if (remaining <= 0) throw new MenuUpstreamError('timeout');
  const timer = setTimeout(() => core.abort(new MenuUpstreamError('timeout')), remaining);
  const signal = AbortSignal.any([core.signal, siblings.signal, ...(args.signal ? [args.signal] : [])]);
  const cancelSiblings = () => siblings.abort(new SiblingCancellation());
  let overflow = false;
  try {
    const settled = await Promise.allSettled(selected.legs.map(async (chosen) => {
      try {
        const result = await handleLeg(endpoint, owner, bundle, deps, { ...args, deadlineAtMs, signal }, chosen, () => { overflow = true; cancelSiblings(); });
        if (result.outcome !== 'ok' && result.outcome !== 'empty') cancelSiblings();
        return result;
      } catch (error) {
        cancelSiblings();
        throw error;
      }
    }));
    // Cancellation is not a target failure. Rank observed failures only after every leg settles.
    const failures = settled.flatMap((item) => item.status === 'rejected' && !(item.reason instanceof SiblingCancellation)
      ? [item.reason instanceof MenuUpstreamError ? item.reason.kind : 'unavailable'] : []);
    if (failures.includes('unavailable')) throw new MenuUpstreamError('unavailable');
    if (failures.includes('timeout') || core.signal.aborted) throw new MenuUpstreamError('timeout');
    const results = settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []);
    const refused = results.find((result) => result.outcome === 'error' || result.outcome === 'forbidden');
    if (refused) return noData(refused.outcome === 'forbidden' ? 'forbidden' : 'error');
    if (results.some((result) => result.outcome === 'timeout')) return noData('timeout');
    // Hand the overflow marker to query.ts; it alone owns the too_large judgment.
    const legs = results.map((result) => Array.isArray(result.data) ? result.data : []);
    const count = legs.reduce((total, rows) => total + rows.length, 0);
    if (overflow || count > (endpoint.limits?.maxRows ?? 0)) return { outcome: 'ok', data: [], rowsRead: (endpoint.limits?.maxRows ?? 0) + 1 };
    const rows = mergeRows(legs, owner.merge?.sort);
    return { outcome: rows.length ? 'ok' : 'empty', data: rows, rowsRead: rows.length, assessments: results[0]?.assessments ?? [], trust: null };
  } finally {
    clearTimeout(timer);
    cancelSiblings();
  }
}

async function handleLeg(endpoint: DeclaredEndpoint, owner: Routing, bundle: DeclarationBundle, deps: RoutedDependencies, args: EndpointHandlerArgs, chosen: SelectedLeg, onOverflow?: () => void): Promise<EndpointResult> {
  const site = endpoint.requiresScope ? args.context.scopeId as string : null;
  const target = bundle.targets?.[chosen.targetId];
  const factory = target && deps.connectorFactories[target.kind];
  if (!target || !factory) throw new MenuUpstreamError('unavailable');
  const map = effectiveValueMap(target.valueMap, chosen.route.valueMap);
  const mappedSite = site === null ? null : mapValue(site, map.site);
  const mappedRooms = chosen.rooms.map((room) => mapValue(room, map.room));
  if (mappedSite === undefined || mappedRooms.some((room) => room === undefined)) return noData('error');
  const outgoingRooms = mappedRooms as string[];
  const call = routeCall(owner, chosen.route);
  const deadlineAt = args.deadlineAtMs ?? (args.arrivedAtMs ?? Date.now()) + deps.timeoutMs;
  const controller = new AbortController();
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new MenuUpstreamError('timeout');
  const timer = args.deadlineAtMs === undefined ? setTimeout(() => controller.abort(), remaining) : undefined;
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
          if (resolved.length !== 1 || !rowInScope(resolved[0], check, site, chosen.rooms, map)) return noData('forbidden');
        }
      }
    }
    let rowsRead = 0;
    const rows: unknown[] = [];
    await readRows(connector, leg(call), signal, deadlineAt, rowCap, (row) => {
      rowsRead++;
      if (!endpoint.requiresScope || enforceRowScope(row, owner.scopeCheck, site, chosen.rooms, map)) rows.push(projectRow(row, call));
      if (rowsRead === rowCap) onOverflow?.();
    });
    return { outcome: rows.length ? 'ok' : 'empty', data: rows, rowsRead, assessments: (endpoint.kinds ?? []).filter((kind) => kind !== 'coverage').map((kind) => ({ kind, state: 'unknown', reason: 'source_unavailable' })), trust: null };
  } catch (error) {
    if (onOverflow) {
      if (error instanceof SiblingCancellation) throw error;
      if (error instanceof TargetJudgmentTimeout) return noData('timeout');
      if (error instanceof MenuUpstreamError) throw new MenuUpstreamError(error.kind);
    }
    if (controller.signal.aborted) throw new MenuUpstreamError('timeout');
    if (signal.aborted) throw new MenuUpstreamError(signal.reason instanceof MenuUpstreamError ? signal.reason.kind : 'unavailable');
    if (error instanceof TargetJudgmentTimeout) return noData('timeout');
    if (error instanceof MenuUpstreamError) throw new MenuUpstreamError(error.kind);
    throw new MenuUpstreamError('unavailable');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
