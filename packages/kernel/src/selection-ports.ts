import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { parseDateTime, type AxisOption, type AxisOptionsInput, type Condition, type EquipmentSummary, type IdSet, type MembershipPeriod, type SelectionResolution } from '@ap/contracts';
import { usePlatform, useSelectionPortCache } from './platform';
import { idlePage, type PortFailure, type PortPageState, type PortStatus } from './selection-port-cache';

export type { PortFailure, PortStatus } from './selection-port-cache';
export type PortContext = { scopeId: string; roomNames: IdSet; lineNames: IdSet; prcGroups: IdSet; condition: Condition | null; membershipBasis: 'asOf' | null; period: MembershipPeriod | null };
export type AxisOptionsParams = { axisId: string; query?: string; parents?: AxisOptionsInput['parents']; pageSize?: number; enabled?: boolean; context?: PortContext };
export type EquipmentSearchParams = { query?: string; pageSize?: number; enabled?: boolean; context?: PortContext };
export type PortPageResult<T> = PortPageState<T> & { retry: () => void; loadMore: () => void };
export type ResolvedSelectionParams = { enabled?: boolean; scopeId?: string };
export type ResolvedSelectionResult = { status: PortStatus; byId: ReadonlyMap<string, 'ok' | 'forbidden' | 'not_found'>; summaries: ReadonlyMap<string, EquipmentSummary>; error: PortFailure | null; retry: () => void };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return [...new Set(value)].sort();
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]));
  return value;
}
const noop = () => {};
const denied: PortFailure = { code: 'scope_forbidden', message: 'Override Scope must match the validated screen Scope', retryable: false };
const invalid: PortFailure = { code: 'invalid_input', message: 'Invalid metadata request context', retryable: false };
const validIds = (value: unknown) => value === null || (Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim()));
function contextError(context: PortContext, axes: ReturnType<typeof usePlatform>['equipmentAxes'], options = false): PortFailure | null {
  if (![context.roomNames, context.lineNames, context.prcGroups].every(validIds) || ![null, 'asOf'].includes(context.membershipBasis)) return invalid;
  if (context.condition !== null) {
    if (typeof context.condition !== 'object' || Array.isArray(context.condition) || !Object.keys(context.condition).length) return invalid;
    for (const [id, values] of Object.entries(context.condition)) {
      const axis = axes.find(axis => axis.id === id);
      if (!axis || !Array.isArray(values) || !values.length || !validIds(values)) return invalid;
      if (context.membershipBasis === 'asOf' && !axis.membershipHistory) return { code: 'membership_basis_unsupported', message: 'Axis has no membership history', retryable: false };
    }
  }
  if (context.period !== null) {
    try { if (parseDateTime(context.period.from, 'from') >= parseDateTime(context.period.to, 'to')) throw new Error(); }
    catch { return { code: 'invalid_period', message: 'Invalid wall-clock period', retryable: false }; }
  }
  if (!options && context.membershipBasis === 'asOf' && context.condition === null && context.prcGroups === null) return invalid;
  return null;
}
function effective(platform: ReturnType<typeof usePlatform>, override?: PortContext): PortContext {
  const g = platform.global;
  return override ?? { scopeId: g.scopeId ?? '', roomNames: g.roomNames, lineNames: g.lineNames, prcGroups: g.prcGroups, condition: g.condition, membershipBasis: g.membershipBasis, period: g.from && g.to ? { from: g.from, to: g.to } : null };
}
function gate(platform: ReturnType<typeof usePlatform>, scopeId: string, enabled = true): 'idle' | PortFailure | null {
  if (!enabled) return 'idle';
  if (scopeId && scopeId !== platform.global.scopeId) return denied;
  if (!scopeId || platform.contractError || platform.scope.status !== 'valid' || platform.scope.scopeId !== scopeId || platform.scope.validatedFor !== platform.session) return 'idle';
  return null;
}
function usePortPage<T>(port: string, input: unknown, enabled: boolean, error: PortFailure | null, send: (cursor: string | null, signal: AbortSignal) => Promise<{ items: T[]; nextCursor: string | null; total?: number }>, itemId: (item: T) => string): PortPageResult<T> {
  const { paneId } = usePlatform();
  const cache = useSelectionPortCache();
  const owner = paneId === null ? 'main' : `pane:${paneId}`;
  const key = JSON.stringify([port, canonical(input)]);
  // Parsing the canonical key gives effects stable closures without render-time ref writes.
  const work = useMemo(() => ({ send, itemId, active: false }), [cache, owner, key]);
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled || error) return noop;
    work.active = true;
    const unsubscribe = cache.ensure(owner, key, work.send, work.itemId).subscribe(listener);
    return () => { work.active = false; unsubscribe(); };
  }, [cache, owner, key, enabled, error, work]);
  const snapshot = useCallback(() => enabled && !error ? cache.read<T>(owner, key)?.snapshot() ?? idlePage : idlePage, [cache, owner, key, enabled, error]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (enabled && !error) cache.ensure(owner, key, work.send, work.itemId).start();
  }, [cache, owner, key, enabled, error, work]);
  const retry = useCallback(() => { if (work.active && enabled && !error) cache.read<T>(owner, key)?.retry(); }, [cache, owner, key, enabled, error, work]);
  const loadMore = useCallback(() => { if (work.active && enabled && !error) cache.read<T>(owner, key)?.loadMore(); }, [cache, owner, key, enabled, error, work]);
  return { ...(error ? { ...idlePage, status: 'error' as const, error } : state), retry, loadMore };
}

/** Reads preserved global values from the nearest screen; a complete override never merges with that screen. */
export function useAxisOptions(params: AxisOptionsParams): PortPageResult<AxisOption> {
  const platform = usePlatform();
  const context = effective(platform, params.context);
  const readiness = gate(platform, context.scopeId, params.enabled);
  let error = readiness !== 'idle' ? readiness ?? contextError(context, platform.equipmentAxes, true) : null;
  const axis = platform.equipmentAxes.find(a => a.id === params.axisId);
  const globalOption = params.axisId === 'lineNames' || params.axisId === 'prcGroups';
  if (readiness === null && !axis && !globalOption) error = { code: 'unknown_axis', message: 'Unsupported axis', retryable: false };
  const input: AxisOptionsInput = { scopeId: context.scopeId, axisId: params.axisId, query: params.query ?? '', parents: params.parents ?? {}, membershipBasis: context.membershipBasis, period: context.membershipBasis === 'asOf' ? context.period : null, limit: params.pageSize ?? 50 };
  // Options have no Condition/PRC pairing requirement; eligibility concerns target and supplied parents.
  if (readiness === null && context.membershipBasis === 'asOf' && [params.axisId, ...Object.keys(params.parents ?? {})].some(id => id !== 'prcGroups' && !platform.equipmentAxes.find(a => a.id === id)?.membershipHistory)) error = { code: 'membership_basis_unsupported', message: 'Axis has no membership history', retryable: false };
  const ready = readiness !== 'idle' && (readiness !== null || !(context.membershipBasis === 'asOf' && !context.period));
  return usePortPage('options', input, ready, ready ? error : null, (cursor, signal) => platform.adapter.listAxisOptions({ ...input, cursor }, signal), item => item.id);
}
export function useEquipmentSearch(params: EquipmentSearchParams = {}): PortPageResult<EquipmentSummary> {
  const platform = usePlatform();
  const context = effective(platform, params.context);
  const readiness = gate(platform, context.scopeId, params.enabled);
  const error = readiness !== 'idle' ? readiness ?? contextError(context, platform.equipmentAxes) : null;
  const input = { ...context, period: context.membershipBasis === 'asOf' ? context.period : null, query: params.query ?? '', limit: params.pageSize ?? 50 };
  const ready = readiness !== 'idle' && (readiness !== null || !(context.membershipBasis === 'asOf' && !context.period));
  return usePortPage('search', input, ready, ready ? error : null, (cursor, signal) => platform.adapter.searchEquipment({ ...input, cursor }, signal), item => item.equipmentId);
}
export function useResolvedSelection(ids: readonly string[], params: ResolvedSelectionParams = {}): ResolvedSelectionResult {
  const platform = usePlatform();
  const input = { scopeId: params.scopeId ?? platform.global.scopeId ?? '', ids: [...new Set(ids)] };
  const readiness = gate(platform, input.scopeId, params.enabled);
  const error = readiness !== 'idle' ? readiness ?? (ids.some(id => typeof id !== 'string' || !id.trim()) ? invalid : null) : null;
  const result = usePortPage<SelectionResolution>('resolve', input, readiness !== 'idle', error, async (_cursor, signal) => ({ ...await platform.adapter.resolveSelection(input, signal), nextCursor: null }), item => item.id);
  const byId = new Map<string, 'ok' | 'forbidden' | 'not_found'>();
  const summaries = new Map<string, EquipmentSummary>();
  const items = new Map(result.items.map(item => [item.id, item]));
  for (const id of input.ids) {
    const item = items.get(id);
    if (item) { byId.set(id, item.status); if (item.status === 'ok') summaries.set(id, item.summary); }
  }
  return { status: result.status, byId, summaries, error: result.error, retry: result.retry };
}
