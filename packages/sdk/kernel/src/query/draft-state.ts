import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildQuery, emptyGlobal, incompleteMetricPair, missingRequiredContext, parseQuery, sameGlobal, shift, type EquipmentAxisDescriptor, type GlobalContext, type Pair, type PlatformAdapter, type Session } from '@ap/contracts';
import { createHistoryState, useScreenHistory, canonicalHistoryQuery, historyChanged } from './query-history';
import { queryHistoryId, type QueryHistoryStore, type QueryHistoryKey, type QueryHistoryEntry } from '@ap/contracts';
import { classifyMetricInit } from '../registry/metric-init';
import { CONTEXT_LABELS, type MenuEntry } from '../registry/registry';
import { dropResetKeys } from '../context/paneContext';
import type { QueryDraft, QueryMissing } from './query-draft';
import type { ScopeState } from '../platform/platform';
import { shallowEqual, useStable } from '../stable';

export type DraftValues = QueryDraft['draft'];
type Values = DraftValues;
type RecordEvent = { port: QueryHistoryStore; key: QueryHistoryKey; entry: QueryHistoryEntry };
type Snapshot = { identity: string; session: Session; address: string; addressGeneration: number; draft: Values; editRevision: number; historyInitialized: boolean; pageBasis?: GlobalContext; lastRestoreRevision?: number; pending: { source: string; target: string; dispatching: boolean; editRevision: number; record?: RecordEvent } | null };
export function createDraftStore() {
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  return {
    history: createHistoryState(),
    get: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    put: (next: Snapshot) => { if (snapshot !== next) { snapshot = next; listeners.forEach(fn => fn()); } },
  };
}
export type DraftStore = ReturnType<typeof createDraftStore>;

export type DraftInputs = {
  history?: QueryHistoryStore; revision: number; currentRevision: () => number; allowed: boolean;
  store?: DraftStore; menu: MenuEntry | null; identity: string; session: Session; url: string;
  global: GlobalContext; page: Pair[]; extras: Pair[]; defaultRangeTo: string | null; scope: ScopeState;
  adapter: PlatformAdapter; axes: readonly EquipmentAxisDescriptor[]; invalid: boolean;
  commit: (next: string, how: 'push') => boolean;
  setGlobal: QueryDraft['setDraftGlobal']; setPage: QueryDraft['setDraftPage'];
};
function defaults(input: DraftInputs): Values {
  return { global: { ...emptyGlobal, scopeId: input.global.scopeId, ...(input.menu?.context.time === 'apply' && input.defaultRangeTo !== null ? { from: shift(input.defaultRangeTo, -24), to: input.defaultRangeTo } : {}) }, page: [] };
}
function initial(input: DraftInputs): Values {
  return input.global.from === null && input.global.to === null && !input.invalid
    ? { global: { ...input.global, from: defaults(input).global.from, to: defaults(input).global.to }, page: input.page }
    : { global: input.global, page: input.page };
}
function reconcile(state: Snapshot | null, input: DraftInputs): Snapshot {
  if (!state || state.identity !== input.identity || state.session !== input.session) return { identity: input.identity, session: input.session, address: input.url, addressGeneration: (state?.addressGeneration ?? -1) + 1, draft: initial(input), editRevision: 0, historyInitialized: false, pageBasis: undefined, pending: null };
  if (state.pending && state.pending.target === input.url) {
    const restoredAfterClick = (state.lastRestoreRevision ?? -1) > state.pending.editRevision;
    return { ...state, address: input.url, addressGeneration: state.addressGeneration + 1, pageBasis: restoredAfterClick ? state.pageBasis : input.global, pending: null };
  }
  if (state.pending?.source === input.url || state.address === input.url) return state;
  return { ...state, address: input.url, addressGeneration: (state?.addressGeneration ?? -1) + 1, draft: initial(input), editRevision: 0, historyInitialized: false, pageBasis: undefined, lastRestoreRevision: undefined, pending: null };
}
export function queryMissing(menu: MenuEntry | null, global: GlobalContext, page: Pair[]): QueryMissing[] {
  return [
    ...missingRequiredContext(menu?.query?.required?.context ?? [], global).map(key => ({ key, label: key === 'roomNames' ? { ko: '공정', en: 'Process' } : CONTEXT_LABELS[key] })),
    ...(menu?.query?.required?.page ?? []).filter(({ key }) => !page.some(([k, value]) => k === key && value !== '')).map(item => ({ ...item })),
  ];
}
export function appliedQueryPolicy(menu: MenuEntry | null, global: GlobalContext, page: Pair[], invalid: boolean) {
  const missing = queryMissing(menu, global, page);
  return { idle: menu?.query?.mode === 'apply' && (invalid || missingRequiredContext(['time'], global).length > 0 || missing.length > 0), missing };
}

/** Round-trip through the codec, checking the fields the serializer deliberately omits for incomplete pairs. */
function normalize(input: DraftInputs, values: Values): Values {
  let g = values.global;
  if ((g.from === null) !== (g.to === null)) throw new RangeError('partial_period');
  if (g.metricVersion !== null && g.metricId === null) throw new RangeError('metric_pair');
  const metric = classifyMetricInit(input.adapter.publishedMetrics(), input.menu?.initializesMetric === true, g.metricId, g.metricVersion);
  if (metric.phase === 'blocked') throw new RangeError(metric.reason);
  if (metric.phase === 'confirm') g = { ...g, metricVersion: metric.metricVersion };
  const pairError = incompleteMetricPair(input.menu, g.metricId, g.metricVersion);
  if (pairError) throw pairError;
  const parsed = parseQuery(buildQuery(g, values.page), input.menu?.pageKeys);
  for (const axisId of Object.keys(parsed.global.condition ?? {})) {
    const axis = input.axes.find(a => a.id === axisId);
    if (!axis) throw new RangeError('invalid_condition');
    if (parsed.global.membershipBasis === 'asOf' && !axis.membershipHistory) throw new RangeError('membership_basis_unsupported');
  }
  if (g.membershipBasis !== null && parsed.global.membershipBasis === null) throw new RangeError('membership_basis_pair');
  return { global: parsed.global, page: parsed.page.filter(([, value]) => value !== '') };
}
/** `applied` is the entry draft: the applied values plus the seeded default period, which is not a change (#913). */
function dirtyFields(applied: Values, draft: Values): string[] {
  const normalized = (g: GlobalContext) => parseQuery(buildQuery(g)).global;
  const a = normalized(applied.global); const b = normalized(draft.global);
  const changed = (Object.keys(emptyGlobal) as (keyof GlobalContext)[]).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
  const keys = [...new Set([...applied.page, ...draft.page].map(([key]) => key))];
  return [...changed, ...keys.filter(key => (applied.page.find(([k]) => k === key)?.[1] || null) !== (draft.page.find(([k]) => k === key)?.[1] || null))];
}
export function useScreenDraft(rawInput: DraftInputs) {
  // The screen state rebuilds this object every render; one identity per distinct content keeps `queryDraft` and `queryHistory` stable (#824).
  const input = useStable(rawInput, shallowEqual);
  const [local] = useState(createDraftStore);
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const store = input.store ?? local;
  const snapshot = useSyncExternalStore(store.subscribe, store.get);
  const mode = input.menu?.query?.mode ?? 'live';
  useLayoutEffect(() => {
    if (mode !== 'apply') return;
    const pending = store.get()?.pending;
    store.put(reconcile(store.get(), input));
    if (pending?.target === input.url && pending.record) {
      const event = pending.record;
      void Promise.resolve().then(() => event.port.record(event.key, event.entry)).then(() => historyChanged(event.port, event.key)).catch(() => {
        const view = store.history.get();
        if (view.tag?.session === input.session && view.tag.revision === input.revision && view.tag.identity === input.identity && view.tag.port === event.port) store.history.put({ ...view, status: 'unavailable', rows: [] });
      });
    }
  });
  const replace = useCallback((values: Values) => {
    const previous = reconcile(store.get(), input);
    const next = normalize(input, values);
    store.put({ ...previous, draft: next, pageBasis: next.global, lastRestoreRevision: previous.editRevision + 1, editRevision: previous.editRevision + 1, historyInitialized: true });
  }, [store, input]);
  const normalizeFor = useCallback((values: Values) => normalize(input, values), [input]);
  const queryHistory = useScreenHistory(input, store, normalizeFor, replace);
  const queryDraft = useMemo((): QueryDraft => draftApi(input, store, reconcile(snapshot, input), active), [input, store, snapshot, active]);
  return { queryHistory, queryDraft };
}
function draftApi(input: DraftInputs, store: DraftStore, state: Snapshot, active: { current: boolean }): QueryDraft {
  const mode = input.menu?.query?.mode ?? 'live';
  if (mode === 'live') return { mode, draft: { global: input.global, page: input.page }, dirty: [], setDraftGlobal: input.setGlobal, setDraftPage: input.setPage, apply() {}, revert() {}, reset() {}, missing: [], canApply: true, applying: false };
  const current = () => reconcile(store.get(), input);
  const candidate = (values: Values) => {
    const next = normalize(input, values);
    return { ...next, page: dropResetKeys(input.menu, next.page, current().pageBasis ?? input.global, next.global) };
  };
  const scopeValid = (g: GlobalContext) => !input.menu?.requiresScope || (input.scope.status === 'valid' && input.scope.scopeId === g.scopeId && input.scope.validatedFor === input.session);
  let final = state.draft; let valid = !input.invalid;
  try { final = candidate(state.draft); } catch { valid = false; }
  const missing = queryMissing(input.menu, final.global, final.page);
  const canApply = valid && missing.length === 0 && missingRequiredContext(['time'], final.global).length === 0 && scopeValid(final.global) && state.pending === null;
  const edit = (values: Values) => {
    const previous = current();
    const next = candidate(values);
    store.put({ ...previous, draft: next, editRevision: previous.editRevision + 1 });
  };
  return {
    mode, draft: state.draft, dirty: dirtyFields(initial(input), state.draft), missing, canApply, applying: state.pending?.dispatching === true,
    setDraftGlobal(patch) {
      if ('scopeId' in patch && patch.scopeId !== input.global.scopeId) { input.setGlobal({ scopeId: patch.scopeId }); return; }
      edit({ ...current().draft, global: { ...current().draft.global, ...patch } });
    },
    setDraftPage(patch) {
      for (const key of Object.keys(patch)) if (!input.menu?.pageKeys.includes(key)) throw new RangeError(`Undeclared page key ${key}`);
      const values = current().draft;
      edit({ ...values, page: [...values.page.filter(([key]) => !Object.hasOwn(patch, key)), ...Object.entries(patch).filter((entry): entry is Pair => entry[1] !== null && entry[1] !== '')] });
    },
    apply() {
      const previous = current();
      if (!active.current || previous.pending || input.invalid) return;
      let next: Values;
      try { next = candidate(previous.draft); } catch { return; }
      if (queryMissing(input.menu, next.global, next.page).length || missingRequiredContext(['time'], next.global).length || !scopeValid(next.global)) return;
      if (sameGlobal(input.global, next.global) && JSON.stringify([...input.page].sort()) === JSON.stringify([...next.page].sort())) return;
      const target = input.url.split('?')[0] + buildQuery(next.global, next.page, input.extras);
      const query = canonicalHistoryQuery(next, input.menu?.pageKeys ?? []);
      const record: RecordEvent | undefined = input.history && input.menu ? { port: input.history, key: { userId: input.session.user.id, menuId: input.menu.id, scopeId: next.global.scopeId }, entry: { id: queryHistoryId(query), query, schemaVersion: 1, lastAppliedAt: Date.now(), count: 1 } } : undefined;
      const pending = { source: input.url, target, dispatching: true, editRevision: previous.editRevision + 1, record };
      store.put({ ...previous, draft: next, pending, editRevision: previous.editRevision + 1 });
      try { if (!input.commit(target, 'push')) store.put({ ...previous, draft: next, pending: null }); }
      catch (error) { store.put({ ...previous, pending: null }); throw error; }
      // Address acknowledgement may be arbitrarily delayed. Dispatch itself finishes this turn; keep the
      // proposal only for duplicate suppression and recognizing its echo, not as a request spinner.
      queueMicrotask(() => {
        const latest = store.get();
        if (latest?.pending === pending) store.put({ ...latest, pending: { ...pending, dispatching: false } });
      });
    },
    revert() { const previous = current(); store.put({ ...previous, draft: initial(input), pageBasis: undefined, editRevision: previous.editRevision + 1 }); },
    reset() { const previous = current(); store.put({ ...previous, draft: defaults(input), pageBasis: undefined, editRevision: previous.editRevision + 1 }); },
  };
}
