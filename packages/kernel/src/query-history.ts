import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { buildQuery, compareHistoryText, compareQueryHistory, emptyGlobal, parseQuery, type GlobalContext, type Pair, type QueryHistoryEntry, type QueryHistoryKey, type QueryHistoryStore, type Session } from '@ap/contracts';
import { usePlatform } from './platform';
import type { DraftStore, DraftInputs, DraftValues } from './draft-state';

export type QueryHistoryRow = { id: string; lastAppliedAt: number; count: number } & (
  { status: 'ready'; candidate: { global: GlobalContext; page: Pair[] } } |
  { status: 'loading' | 'unavailable'; reason: 'checking' | 'invalid' | 'permission' }
);
export type QueryHistory = {
  entries: readonly QueryHistoryRow[];
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  restore: (entry: QueryHistoryRow) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  /** Opening the control validates the displayed selection union, once per logical screen. */
  open: () => void;
};
export function useQueryHistory(): QueryHistory { return usePlatform().queryHistory; }

// Store ports remain swappable; an app-local bus refreshes screens after accepted mutations.
const changes = new WeakMap<QueryHistoryStore, Set<(key: QueryHistoryKey) => void>>();
export function historyChanged(port: QueryHistoryStore, key: QueryHistoryKey) { changes.get(port)?.forEach(listener => listener(key)); }
type Tag = { port: QueryHistoryStore | undefined; session: Session; revision: number; identity: string; scope: string; axes: DraftInputs['axes']; allowed: boolean };
type HistorySnapshot = { tag: Tag | null; status: QueryHistory['status']; raw: readonly QueryHistoryEntry[]; rows: readonly QueryHistoryRow[]; opened: boolean; checking: boolean };
export function createHistoryState() {
  let state: HistorySnapshot = { tag: null, status: 'disabled', raw: [], rows: [], opened: false, checking: false };
  const listeners = new Set<() => void>();
  let owners = 0;
  return {
    active: () => owners > 0,
    retain() { owners++; return () => { owners--; if (!owners) state = { ...state, tag: null }; }; },
    get: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    put(next: HistorySnapshot) { state = next; listeners.forEach(listener => listener()); },
  };
}
function sameTag(a: Tag | null, b: Tag) {
  return a !== null && a.port === b.port && a.session === b.session && a.revision === b.revision && a.identity === b.identity && a.scope === b.scope && a.axes === b.axes && a.allowed === b.allowed;
}
export function canonicalHistoryQuery(values: DraftValues, pageKeys: readonly string[]): string {
  const normalized = parseQuery(buildQuery(values.global, values.page.filter(([key]) => key !== 'returnTo' && pageKeys.includes(key))), pageKeys);
  const page = normalized.page.sort(([ak, av], [bk, bv]) => compareHistoryText(ak, bk) || compareHistoryText(av, bv));
  return buildQuery(normalized.global, page);
}
function historyEmpty(input: DraftInputs): boolean {
  if (input.invalid) return false;
  try {
    const parsed = parseQuery(input.url.includes('?') ? input.url.slice(input.url.indexOf('?')) : '', input.menu?.pageKeys);
    return parsed.page.length === 0 && Object.keys(emptyGlobal).every(key => key === 'scopeId' || parsed.global[key as keyof GlobalContext] === null);
  } catch { return false; }
}
function candidate(input: DraftInputs, entry: QueryHistoryEntry, normalize: (values: DraftValues) => DraftValues): DraftValues | null {
  try {
    if (entry.schemaVersion !== 1) return null;
    const parsed = parseQuery(entry.query, input.menu?.pageKeys);
    if (new URLSearchParams(entry.query).has('returnTo') || parsed.extras.length || parsed.global.scopeId !== input.global.scopeId || (parsed.global.metricId !== null && parsed.global.metricVersion === null)) return null;
    // History is a complete applied condition, never an incomplete or silently materialized candidate.
    if (parsed.global.from === null || parsed.global.to === null) return null;
    const normalized = normalize(parsed);
    if (canonicalHistoryQuery(normalized, input.menu?.pageKeys ?? []) !== canonicalHistoryQuery(parsed, input.menu?.pageKeys ?? [])) return null;
    return normalized;
  } catch { return null; }
}
function base(entry: Pick<QueryHistoryEntry, 'id' | 'lastAppliedAt' | 'count'>) { return { id: entry.id, lastAppliedAt: entry.lastAppliedAt, count: entry.count }; }

export function useScreenHistory(input: DraftInputs, store: DraftStore, normalize: (values: DraftValues) => DraftValues, replace: (values: DraftValues) => void): QueryHistory {
  const history = store.history;
  const snapshot = useSyncExternalStore(history.subscribe, history.get);
  useLayoutEffect(() => history.retain(), [history]);
  const scopeKey = JSON.stringify(input.global.scopeId);
  const tag = useMemo<Tag>(() => ({ port: input.history, session: input.session, revision: input.revision, identity: input.identity, scope: scopeKey, axes: input.axes, allowed: input.allowed }), [input.history, input.session, input.revision, input.identity, scopeKey, input.axes, input.allowed]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tag` is the deliberate trigger: a new set (and an abort of the old checks) whenever the history identity changes
  const checks = useMemo(() => new Set<AbortController>(), [tag]);
  useLayoutEffect(() => () => { checks.forEach(controller => controller.abort()); checks.clear(); }, [checks]);
  const enabled = input.menu?.query?.mode === 'apply' && input.history !== undefined;
  const key: QueryHistoryKey = { userId: input.session.user.id, menuId: input.menu?.id ?? '', scopeId: input.global.scopeId };
  const current = () => history.active() && sameTag(history.get().tag, tag) && input.adapter.session() === input.session && input.currentRevision() === input.revision && store.get()?.identity === input.identity && store.get()?.session === input.session;
  const authorizedScope = () => input.allowed && (!(input.menu?.requiresScope || key.scopeId !== null) || (input.scope.status === 'valid' && input.scope.scopeId === key.scopeId && input.scope.validatedFor === input.session));
  const validate = async (entries: readonly QueryHistoryEntry[]): Promise<QueryHistoryRow[]> => {
    if (!entries.length) return [];
    const candidates = entries.map(entry => candidate(input, entry, normalize));
    if (!authorizedScope()) return entries.map(entry => ({ ...base(entry), status: input.scope.status === 'validating' ? 'loading' : 'unavailable', reason: input.scope.status === 'validating' ? 'checking' : 'permission' }));
    const controller = new AbortController();
    checks.add(controller);
    try {
      let rooms = new Set<string>();
      if (key.scopeId !== null) {
        try {
          const result = await input.adapter.validateScope(key.scopeId, controller.signal);
          if (result.status !== 'valid') return entries.map(entry => ({ ...base(entry), status: 'unavailable', reason: 'permission' }));
          rooms = new Set(result.grantedRooms);
        } catch { return entries.map(entry => ({ ...base(entry), status: 'unavailable', reason: 'permission' })); }
      }
      if (controller.signal.aborted || !current()) return entries.map(entry => ({ ...base(entry), status: 'unavailable', reason: 'permission' }));
      const allowed = candidates.map(value => value !== null && (value.global.roomNames ?? []).every(room => rooms.has(room)));
      const ids = [...new Set(candidates.flatMap((value, index) => allowed[index] ? value?.global.selection ?? [] : []))];
      let resolved: Map<string, string> | null = new Map();
      if (ids.length) {
        try {
          if (key.scopeId === null) resolved = null;
          else {
            const result = await input.adapter.resolveSelection({ scopeId: key.scopeId, ids }, controller.signal);
            resolved = new Map(result.items.map(item => [item.id, item.status]));
          }
        } catch { resolved = null; }
      }
      return entries.map((entry, index) => {
        const value = candidates[index];
        if (!value) return { ...base(entry), status: 'unavailable', reason: 'invalid' };
        if (!allowed[index] || !(value.global.selection ?? []).every(id => resolved?.get(id) === 'ok')) return { ...base(entry), status: 'unavailable', reason: 'permission' };
        return { ...base(entry), status: 'ready', candidate: value };
      });
    } finally { checks.delete(controller); }
  };
  const fail = () => { if (current()) history.put({ ...history.get(), status: 'unavailable', rows: [] }); };
  const load = () => {
    if (!input.history || !current()) return;
    const token = { ...history.get(), status: 'loading' as const, rows: [], raw: [] };
    history.put(token);
    void Promise.resolve().then(() => input.history!.list(key)).then(async entries => {
      if (!current() || history.get() !== token) return;
      const raw = [...entries].sort(compareQueryHistory).slice(0, 10);
      const checking: QueryHistoryRow[] = raw.map(entry => ({ ...base(entry), status: 'loading', reason: 'checking' }));
      const pending = { ...token, status: 'ready' as const, raw, rows: checking, checking: true };
      history.put(pending);
      // Revisit checks only the newest; opening checks every displayed entry in one batch.
      const rows = await validate(pending.opened ? raw : historyEmpty(input) ? raw.slice(0, 1) : []);
      if (!current() || history.get() !== pending) return;
      history.put({ ...pending, rows: [...rows, ...checking.slice(rows.length)], checking: false });
    }).catch(fail);
  };
  useLayoutEffect(() => {
    if (!enabled) return;
    const view = history.get();
    if (sameTag(view.tag, tag)) {
      if (view.status === 'ready' && !view.checking && view.rows[0]?.status === 'loading' && authorizedScope() && (view.opened || historyEmpty(input))) load();
      return;
    }
    history.put({ tag, status: enabled ? 'loading' : 'disabled', raw: [], rows: [], opened: false, checking: false });
    if (enabled) load();
  });
  useLayoutEffect(() => {
    const port = input.history;
    if (!port || !enabled) return;
    let listeners = changes.get(port);
    if (!listeners) { listeners = new Set(); changes.set(port, listeners); }
    const listener = (changed: QueryHistoryKey) => { if (JSON.stringify(changed) === JSON.stringify(key) && current()) load(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  });
  const visible = sameTag(snapshot.tag, tag) ? snapshot : null;
  useLayoutEffect(() => {
    const state = store.get(); const view = history.get();
    if (!enabled || !current() || !state || state.historyInitialized || view.status !== 'ready' || view.rows[0]?.status === 'loading' || !authorizedScope()) return;
    store.put({ ...state, historyInitialized: true });
    if (state.editRevision !== 0 || !historyEmpty(input) || !view.rows.length) return;
    const row = view.rows[0];
    if (row.status === 'ready') replace(row.candidate);
  });
  return {
    status: enabled ? visible?.status ?? 'loading' : 'disabled',
    entries: enabled ? (visible?.rows ?? []).map(row => {
      if (row.status !== 'ready') return row;
      if (!authorizedScope()) return { ...base(row), status: 'loading' as const, reason: 'checking' as const };
      return row;
    }) : [],
    open() {
      if (!current() || !enabled || history.get().opened) return;
      history.put({ ...history.get(), opened: true }); load();
    },
    async restore(row) {
      if (!current() || !authorizedScope()) return false;
      const source = history.get(); const index = source.rows.indexOf(row);
      if (index < 0 || row.status !== 'ready') return false;
      const revision = store.get()?.editRevision;
      const addressGeneration = store.get()?.addressGeneration;
      const checked = await validate([source.raw[index]]);
      if (!current() || history.get() !== source || store.get()?.editRevision !== revision || store.get()?.addressGeneration !== addressGeneration) return false;
      if (checked[0]?.status !== 'ready') { history.put({ ...source, rows: source.rows.map((old, i) => i === index ? checked[0] : old) }); return false; }
      replace(checked[0].candidate); return true;
    },
    async remove(id) {
      if (!current() || !input.history) return;
      try { await input.history.remove(key, id); if (current()) historyChanged(input.history, key); } catch { fail(); }
    },
    async clear() {
      if (!current() || !input.history) return;
      try { await input.history.clear(key); if (current()) historyChanged(input.history, key); } catch { fail(); }
    },
  };
}
