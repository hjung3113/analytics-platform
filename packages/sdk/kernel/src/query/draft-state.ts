import { decodePageConditions, PageConditionError } from './page-conditions';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildQuery, calendarPeriod, CUSTOM_GROUP_AXIS, emptyGlobal, incompleteMetricPair, missingRequiredContext, pageConditionKeys, parseQuery, sameGlobal, shift, type EquipmentAxisDescriptor, type GlobalContext, type Pair, type PlatformAdapter, type Session } from '@ap/contracts';
import { createHistoryState, useScreenHistory, canonicalHistoryQuery, historyChanged } from './query-history';
import { queryHistoryId, type QueryHistoryStore, type QueryHistoryKey, type QueryHistoryEntry } from '@ap/contracts';
import { classifyMetricInit } from '../registry/metric-init';
import { menuAnalysisSelections } from '../registry/analysis-selections';
import { CONTEXT_LABELS, CUSTOM_GROUP_LABELS, type MenuEntry } from '../registry/registry';
import { dropResetKeys } from '../context/paneContext';
import { firstDrillProblem, hasDrillBasis } from '../context/drillReset';
import { parseAnalysisSelection } from '../context/analysisSelectionCodec';
import type { QueryDraft, QueryMissing } from './query-draft';
import type { ScopeState } from '../platform/platform';
import type { HostPlatform } from '../platform/types';
import { shallowEqual, useStable } from '../stable';

export type DraftValues = QueryDraft['draft'];
type Values = DraftValues;
type RecordEvent = { port: QueryHistoryStore; key: QueryHistoryKey; entry: QueryHistoryEntry };
type Snapshot = { identity: string; session: Session; address: string; addressGeneration: number; appliedRevision?: number; draft: Values; editRevision: number; historyInitialized: boolean; pageBasis?: GlobalContext; lastRestoreRevision?: number; pending: { target: string; dispatching: boolean; editRevision: number; record?: RecordEvent } | null };
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
  extraContextReset?: Pick<MenuEntry, 'contextResetKeys'>;
  adapter: PlatformAdapter; axes: readonly EquipmentAxisDescriptor[]; can: HostPlatform['can']; invalid: boolean; badDrillFormat: boolean;
  commit: (next: string, how: 'push') => boolean;
  setGlobal: QueryDraft['setDraftGlobal']; setPage: QueryDraft['setDraftPage'];
};
export function defaultQueryPeriod(menu: MenuEntry | null, anchor: string | null) {
  if (menu?.context.time !== 'apply' || anchor === null) return null;
  return menu.defaultPeriodHours === undefined ? calendarPeriod(anchor, 'yesterday') : { from: shift(anchor, -menu.defaultPeriodHours), to: anchor };
}

function defaults(input: DraftInputs): Values {
  return { global: { ...emptyGlobal, scopeId: input.global.scopeId, ...defaultQueryPeriod(input.menu, input.defaultRangeTo) }, page: [] };
}
function initial(input: DraftInputs): Values {
  const period = input.global.from === null && input.global.to === null && !input.invalid ? defaultQueryPeriod(input.menu, input.defaultRangeTo) : null;
  return { global: period ? { ...input.global, ...period } : input.global, page: input.page };
}
function reconcile(state: Snapshot | null, input: DraftInputs): Snapshot {
  if (!state || state.identity !== input.identity || state.session !== input.session) return { identity: input.identity, session: input.session, address: input.url, addressGeneration: (state?.addressGeneration ?? -1) + 1, draft: initial(input), editRevision: 0, historyInitialized: false, pageBasis: undefined, pending: null };
  if (state.pending && state.pending.target === input.url) {
    if (state.address === input.url) return state;
    const restoredAfterClick = (state.lastRestoreRevision ?? -1) > state.pending.editRevision;
    return { ...state, address: input.url, addressGeneration: state.addressGeneration + 1, appliedRevision: state.addressGeneration + 1, pageBasis: restoredAfterClick ? state.pageBasis : input.global };
  }
  if (state.address === input.url) return state;
  return { ...state, address: input.url, addressGeneration: state.addressGeneration + 1, draft: initial(input), editRevision: 0, historyInitialized: false, pageBasis: undefined, lastRestoreRevision: undefined, pending: null };
}
export function queryMissingRequired(menu: MenuEntry | null, global: GlobalContext, page: Pair[]): QueryMissing[] {
  const required = menu?.query?.mode === 'apply' ? menu.query.required : undefined;
  const channels = required?.page?.length && menu ? menuAnalysisSelections(menu) : undefined;
  return [
    ...missingRequiredContext(required?.context ?? [], global).map(key => ({ key, label: CONTEXT_LABELS[key] })),
    ...(required?.page ?? []).filter(({ key }) => {
      const channel = channels?.get(key);
      if (!channel) return !page.some(([k, value]) => k === key && value !== '');
      return parseAnalysisSelection(channel.shape, page.filter(([k]) => k === key).map(([, value]) => value)) === null;
    }).map(item => ({ ...item })),
  ];
}
function queryMissing(menu: MenuEntry | null, global: GlobalContext, page: Pair[]): QueryMissing[] {
  return [
    ...queryMissingRequired(menu, global, page),
    ...(global.membershipBasis === 'asOf' && global.condition?.[CUSTOM_GROUP_AXIS]?.length
      ? [{ key: 'customGroupMembershipBasis', label: CUSTOM_GROUP_LABELS.many }]
      : []),
  ];
}
export function appliedQueryPolicy(menu: MenuEntry | null, global: GlobalContext, page: Pair[], invalid: boolean) {
  const missing = queryMissing(menu, global, page);
  const invalidConditions = decodePageConditions(menu ?? {}, page).issues.length > 0;
  // Malformed declared conditions are refused in every query mode (kernel §6.4: reject, never repair); the other checks are Apply-only.
  const applyBlocked = menu?.query?.mode === 'apply' && (invalid || missingRequiredContext(['time'], global).length > 0 || missing.length > 0);
  return { idle: applyBlocked || invalidConditions, missing };
}

function scopeValid(input: DraftInputs, global: GlobalContext) {
  return !input.menu?.requiresScope || (input.scope.status === 'valid' && input.scope.scopeId === global.scopeId && input.scope.validatedFor === input.session);
}

function historyAcknowledgement(input: DraftInputs): 'record' | 'waiting' | 'discard' {
  if (!input.allowed || (input.badDrillFormat && hasDrillBasis(input.menu?.drill))
    || appliedQueryPolicy(input.menu, input.global, input.page, input.invalid).idle) return 'discard';
  if (scopeValid(input, input.global)) return 'record';
  return input.scope.status === 'validating' && input.scope.scopeId === input.global.scopeId
    && input.scope.validatedFor === input.session ? 'waiting' : 'discard';
}

/** Round-trip through the codec, checking the fields the serializer deliberately omits for incomplete pairs. */
function normalize(input: DraftInputs, values: Values, retained?: Values): Values {
  let g = values.global;
  if ((g.from === null) !== (g.to === null)) throw new RangeError('partial_period');
  if (g.metricVersion !== null && g.metricId === null) throw new RangeError('metric_pair');
  const metric = classifyMetricInit(input.adapter.publishedMetrics(), input.menu?.initializesMetric === true, g.metricId, g.metricVersion);
  if (metric.phase === 'blocked') throw new RangeError(metric.reason);
  if (metric.phase === 'confirm') g = { ...g, metricVersion: metric.metricVersion };
  const pairError = incompleteMetricPair(input.menu, g.metricId, g.metricVersion);
  if (pairError) throw pairError;
  const conditions = decodePageConditions(input.menu ?? {}, values.page);
  const retainedIssues = retained ? decodePageConditions(input.menu ?? {}, retained.page).issues : [];
  // Recovery can edit one category while another malformed category stays verbatim. It cannot introduce a new issue or modify an invalid category into another invalid value.
  const newIssues = conditions.issues.filter(issue => {
    if (!retained || !retainedIssues.some(previous => previous.categoryId === issue.categoryId && previous.key === issue.key && previous.reason === issue.reason)) return true;
    const category = input.menu?.pageConditions?.categories.find(item => item.id === issue.categoryId);
    if (!category) return true;
    const keys = pageConditionKeys(category);
    return JSON.stringify(values.page.filter(([key]) => keys.includes(key))) !== JSON.stringify(retained.page.filter(([key]) => keys.includes(key)));
  });
  if (newIssues.length) throw new PageConditionError(newIssues);
  const parsed = parseQuery(buildQuery(g, values.page), input.menu?.pageKeys, { repeated: input.menu?.repeatedPageKeys });
  for (const axisId of Object.keys(parsed.global.condition ?? {})) {
    if (axisId === CUSTOM_GROUP_AXIS) continue;
    const axis = input.axes.find(a => a.id === axisId);
    if (!axis) throw new RangeError('invalid_condition');
    if (parsed.global.membershipBasis === 'asOf' && !axis.membershipHistory) throw new RangeError('membership_basis_unsupported');
  }
  if (g.membershipBasis !== null && parsed.global.membershipBasis === null) throw new RangeError('membership_basis_pair');
  return { global: parsed.global, page: parsed.page.filter(([, value]) => value !== '') };
}
/** Same pairs: keys in any order, but the values of one key in the same order. */
function samePage(a: readonly Pair[], b: readonly Pair[]): boolean {
  const keys = [...new Set([...a, ...b].map(([key]) => key))];
  return keys.every(key => JSON.stringify(a.filter(([k]) => k === key).map(([, v]) => v)) === JSON.stringify(b.filter(([k]) => k === key).map(([, v]) => v)));
}
/** `applied` is the entry draft: the applied values plus the seeded default period, which is not a change (#913). */
function dirtyFields(applied: Values, draft: Values): string[] {
  const normalized = (g: GlobalContext) => parseQuery(buildQuery(g)).global;
  const a = normalized(applied.global); const b = normalized(draft.global);
  const changed = (Object.keys(emptyGlobal) as (keyof GlobalContext)[]).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
  const keys = [...new Set([...applied.page, ...draft.page].map(([key]) => key))];
  const valuesOf = (page: Pair[], key: string) => JSON.stringify(page.filter(([k, v]) => k === key && v !== '').map(([, v]) => v));
  return [...changed, ...keys.filter(key => valuesOf(applied.page, key) !== valuesOf(draft.page, key))];
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
    const next = reconcile(store.get(), input);
    const { pending } = next;
    if (pending?.target !== input.url) { store.put(next); return; }
    const acknowledgement = pending.record ? historyAcknowledgement(input) : 'discard';
    store.put(acknowledgement === 'waiting' ? next : { ...next, pending: null });
    if (pending.record && acknowledgement === 'record') {
      const event = pending.record;
      void Promise.resolve().then(async () => {
        if (input.adapter.session() !== input.session) return;
        await event.port.record(event.key, event.entry);
        historyChanged(event.port, event.key);
      }).catch(() => {
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
  const candidate = (values: Values, retained?: Values) => {
    const next = normalize(input, values, retained);
    return { ...next, page: dropResetKeys(input.menu, next.page, current().pageBasis ?? input.global, next.global) };
  };
  const drill = input.menu?.drill;
  const validDrill = ({ global, page }: Values) => !hasDrillBasis(drill) || firstDrillProblem(drill, page, global, input.can) === null;
  let final = state.draft; let valid = !input.invalid;
  try { final = candidate(state.draft); } catch { valid = false; }
  const missing = queryMissing(input.menu, final.global, final.page);
  const canApply = valid && missing.length === 0 && missingRequiredContext(['time'], final.global).length === 0 && scopeValid(input, final.global) && validDrill(final) && state.pending === null;
  const edit = (values: Values) => {
    const previous = current();
    const next = candidate(values, previous.draft);
    store.put({ ...previous, draft: next, editRevision: previous.editRevision + 1 });
  };
  return {
    mode, draft: state.draft, appliedRevision: state.appliedRevision, dirty: dirtyFields(initial(input), state.draft), missing, canApply, applying: state.pending?.dispatching === true,
    setDraftGlobal(patch) {
      if ('scopeId' in patch && patch.scopeId !== input.global.scopeId) { input.setGlobal({ scopeId: patch.scopeId }); return; }
      edit({ ...current().draft, global: { ...current().draft.global, ...patch } });
    },
    setDraftPage(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (!input.menu?.pageKeys.includes(key)) throw new RangeError(`Undeclared page key ${key}`);
        if (value !== null && typeof value !== 'string' && value.filter(item => item !== '').length > 1 && !input.menu.repeatedPageKeys?.includes(key)) throw new RangeError(`setDraftPage: "${key}" is not a repeated page key`);
      }
      const values = current().draft;
      edit({ ...values, page: [...values.page.filter(([key]) => !Object.hasOwn(patch, key)), ...Object.entries(patch).flatMap(([key, value]): Pair[] => (value === null ? [] : (typeof value === 'string' ? [value] : value).filter(item => item !== '').map(item => [key, item])))] });
    },
    apply() {
      const previous = current();
      if (!active.current || previous.pending || input.invalid) return;
      let next: Values;
      try { next = candidate(previous.draft); } catch { return; }
      if (queryMissing(input.menu, next.global, next.page).length || missingRequiredContext(['time'], next.global).length || !scopeValid(input, next.global) || !validDrill(next)) return;
      if (sameGlobal(input.global, next.global) && samePage(input.page, next.page)) return;
      // Providers echo visible pairs before hidden pairs; acknowledge that order without changing repeated values.
      const hiddenKeys = input.menu?.hiddenPageKeys ?? [];
      const page = [...next.page.filter(([key]) => !hiddenKeys.includes(key)), ...next.page.filter(([key]) => hiddenKeys.includes(key))];
      const extras = dropResetKeys(input.extraContextReset, input.extras, input.global, next.global);
      const target = input.url.split('?')[0] + buildQuery(next.global, page, extras);
      const query = canonicalHistoryQuery(next, input.menu?.pageKeys ?? [], input.menu?.repeatedPageKeys);
      const record: RecordEvent | undefined = input.history && input.menu ? { port: input.history, key: { userId: input.session.user.id, menuId: input.menu.id, scopeId: next.global.scopeId }, entry: { id: queryHistoryId(query), query, schemaVersion: 1, lastAppliedAt: Date.now(), count: 1 } } : undefined;
      const pending = { target, dispatching: true, editRevision: previous.editRevision + 1, record };
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
