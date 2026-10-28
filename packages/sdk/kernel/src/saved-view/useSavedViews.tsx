import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { validateSavedView, type JsonValue, type Result, type SavedViewDraft, type SavedViewEntry, type SavedViewListItem, type SavedViewSupport } from '@ap/contracts';
import { useHostPlatform } from '../platform/platform';
import { AppContext } from '../platform/contexts';
import { captureApplied, viewState, type ViewState } from './capture';
import { comparableApplied, restoreSavedView, savedStateOf, unsupportedOf, type RestoreFailure, type Unsupported } from './restore';

export type SelectOutcome = { ok: true; unsupported: readonly Unsupported[] } | { ok: false; reason: RestoreFailure | 'unavailable' | 'denied' };
export type SaveInput = { name: string; kind: 'condition-set' | 'menu-view'; chartOptions?: Record<string, JsonValue>; layout?: JsonValue; panels?: unknown };
export type SavedViews = {
  /** `disabled`: no store injected, the menu does not declare `features.savedView`, or it registered no support. */
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  support: SavedViewSupport | null;
  /** Views of this menu and condition sets (reusable across menus), as the store lists them; denied ones carry only their reason. */
  menuViews: readonly SavedViewListItem[];
  conditionSets: readonly SavedViewListItem[];
  defaultId: string | null;
  selected: SavedViewEntry | null;
  state: ViewState;
  /** Context the last restore left out (06 §6.4); cleared with the selection. */
  unsupported: readonly Unsupported[];
  select: (id: string) => Promise<SelectOutcome>;
  clearSelection: () => void;
  /** 새 뷰로 저장: stores the APPLIED conditions (never the draft) as a new view and selects it. */
  saveAs: (input: SaveInput) => Promise<Result<SavedViewEntry>>;
  /** 현재 뷰에 저장: overwrites the selected view with the applied conditions at its version; a conflict leaves everything as it is. */
  saveToSelected: () => Promise<Result<SavedViewEntry>>;
  /** 저장본으로 되돌리기: re-applies the selected view's saved copy. */
  revertToSaved: () => Promise<SelectOutcome>;
  remove: (id: string) => Promise<Result<null>>;
  setDefault: (id: string | null) => Promise<Result<null>>;
  refresh: () => void;
};

const MAX_DEFAULT_RETRIES = 3;
const NO_ITEMS: readonly SavedViewListItem[] = [];
const NO_UNSUPPORTED: readonly Unsupported[] = [];
const OFF: Result<never> = { ok: false, reason: 'unavailable' };
const OFF_STATE: ViewState = { modified: false, unsaved: false, unapplied: false };
const selectionKey = (userId: string, menuId: string) => `platform:saved-view:selected:${userId}:${menuId}`;

// The selected view id lives per tab (sessionStorage), never in the address (06 §21.3, `savedViewToken` stays reserved).
const memory = new Map<string, string>();
function readSelected(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
function writeSelected(key: string, id: string | null) {
  try { if (id === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, id); } catch { if (id === null) memory.delete(key); else memory.set(key, id); }
}
const entryOf = (item: SavedViewListItem | null | undefined): SavedViewEntry | null => (item && !item.denied ? item : null);

/**
 * Host hook of the Saved View selector (`@ap/kernel/host`, shell): list/save/restore over the injected store, the selected view of this tab and the
 * three change states. Inactive without a store, a `features.savedView` menu and its registered support.
 */
export function useSavedViews(): SavedViews {
  const host = useHostPlatform();
  const registry = useContext(AppContext)?.internal.savedViewSupports;
  const store = host.savedViewStore;
  const menu = host.route?.menu ?? null;
  const menuId = menu?.id ?? '';
  const userId = host.user.id;
  const support = useSyncExternalStore(registry?.subscribe ?? NOOP_SUBSCRIBE, () => registry?.get(menuId));
  const enabled = store !== undefined && menu?.features.savedView === true && support !== undefined;
  // An address the contract rejects (06 §6.4) is neither rewritten by a default nor replaced by a pick: the error and the original address stay.
  const blocked = host.contractError !== null;
  const key = selectionKey(userId, menuId);
  const identity = `${userId}\0${menuId}`;
  // One generation per store, session, permission revision, Scope state, menu and menu declaration: everything read or started in an older one is hidden or dropped (kernel guidance, 06 §21.2).
  const { session, revision } = host;
  const scopeKey = `${host.scope.scopeId}\0${host.scope.status}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs are triggers only: a new generation object whenever any of them changes
  const gen = useMemo(() => ({}), [store, session, revision, scopeKey, identity, enabled, support]);
  // The entry of a screen is not a security read: a revalidation (new `gen`) keeps a selection that is still allowed, only a real arrival re-judges it against the address.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs are triggers only
  const entryGen = useMemo(() => ({}), [identity, enabled]);

  const [selection, setSelection] = useState(() => ({ key, id: readSelected(key) }));
  if (selection.key !== key) setSelection({ key, id: readSelected(key) });
  const selectedId = selection.key === key ? selection.id : readSelected(key);
  const setSelected = useCallback((id: string | null) => { writeSelected(key, id); setSelection({ key, id }); }, [key]);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  // The view the last restore or save was accepted with: it is the selected view's snapshot until the next list answer replaces it.
  const [fresh, setFresh] = useState<{ gen: object; entry: SavedViewEntry } | null>(null);
  const [data, setData] = useState<{ gen: object; tick: number; status: 'ready' | 'unavailable'; menuViews: readonly SavedViewListItem[]; conditionSets: readonly SavedViewListItem[]; defaultId: string | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([store.list({ userId, menuId }), store.list({ userId, menuId: null }), store.getDefaultId({ userId, menuId })])
      .then(([menuViews, conditionSets, defaultId]) => { if (!cancelled) { setData({ gen, tick, status: 'ready', menuViews, conditionSets, defaultId }); setFresh(null); } })
      .catch(() => { if (!cancelled) setData({ gen, tick, status: 'unavailable', menuViews: NO_ITEMS, conditionSets: NO_ITEMS, defaultId: null }); });
    return () => { cancelled = true; };
  }, [enabled, store, userId, menuId, gen, tick]);
  const loaded = enabled && data !== null && data.gen === gen ? data : null;
  const status = !enabled ? 'disabled' : loaded?.status ?? 'loading';
  const menuViews = loaded?.menuViews ?? NO_ITEMS;
  const conditionSets = loaded?.conditionSets ?? NO_ITEMS;
  const defaultId = loaded?.defaultId ?? null;

  const anchor = host.adapter.defaultRangeTo();
  const find = useCallback((id: string | null) => id === null ? null : entryOf([...menuViews, ...conditionSets].find(item => (item.denied ? item.id : item.view.id) === id)), [menuViews, conditionSets]);
  const selected = selectedId !== null && fresh?.gen === gen && fresh.entry.view.id === selectedId ? fresh.entry : find(selectedId);
  const applied = useMemo(() => ({ global: host.global, page: host.page }), [host.global, host.page]);
  const state = useMemo(() => support === undefined ? OFF_STATE : viewState({ applied: selected ? comparableApplied(selected.view, captureApplied(applied, support)) : captureApplied(applied, support), saved: selected ? savedStateOf(selected.view, support, anchor) : null, draftDirty: host.queryDraft.dirty }), [support, applied, selected, anchor, host.queryDraft.dirty]);
  // Derived from the saved copy, so a selection recovered after a reload lists the same Context as right after the pick.
  const unsupported = useMemo(() => selected && support ? unsupportedOf(selected.view, support, anchor) : NO_UNSUPPORTED, [selected, support, anchor]);

  // Latest values for async callbacks. `intent` numbers the user's latest restore/pick/save: a result that arrives after a newer one, a changed address or generation, or the screen's unmount is dropped.
  const live = useRef({ gen, host, selectedId });
  useEffect(() => { live.current = { gen, host, selectedId }; });
  // A default whose read was overtaken by a newer generation or a moved address (scope check done, the Kernel completing the address) was never judged: the entry is armed again.
  // Capped per entry: every retry needs a new discard, and the cap ends a generation or address that keeps changing.
  const entered = useRef<object | null>(null);
  const [rearmed, setRearmed] = useState(0);
  const retries = useRef<{ entry: object; n: number }>({ entry: entryGen, n: 0 });
  const intent = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const stale = (at: object) => !alive.current || live.current.gen !== at;
  const clearSelection = useCallback(() => { intent.current += 1; setSelected(null); }, [setSelected]);
  const differs = (view: SavedViewEntry['view'], support: SavedViewSupport) => viewState({ applied: comparableApplied(view, captureApplied(applied, support)), saved: savedStateOf(view, support, anchor), draftDirty: [] }).modified;

  const apply = useCallback(async (id: string, source: 'selected' | 'default'): Promise<SelectOutcome> => {
    if (!enabled || !support || blocked || stale(gen)) return { ok: false, reason: 'unavailable' };
    const at = gen;
    const mine = ++intent.current;
    const startUrl = live.current.host.url;
    // Always asks the store: a restore is judged on the view's current capabilities, never on an earlier list answer or the cached copy.
    let found: SavedViewListItem | null;
    try { found = await store.get(id); } catch { found = null; }
    if (stale(at) || intent.current !== mine || live.current.host.url !== startUrl) {
      // Only a default that nobody replaced (no newer intent) and that is still on screen is retried; the restore rule refuses it if the address now carries explicit Context.
      if (source === 'default' && alive.current && intent.current === mine) {
        if (retries.current.entry !== entryGen) retries.current = { entry: entryGen, n: 0 };
        if (retries.current.n < MAX_DEFAULT_RETRIES) { retries.current.n += 1; entered.current = null; setRearmed(n => n + 1); }
      }
      return { ok: false, reason: 'unavailable' };
    }
    const fail = (reason: Exclude<SelectOutcome, { ok: true }>['reason']): SelectOutcome => { clearSelection(); return { ok: false, reason }; };
    if (!found) return fail('unavailable');
    if (found.denied || !found.capabilities.canView) return fail('denied');
    // A relative period needs the server anchor; without one it is not restorable (absolute views still are).
    if (found.view.context.relativePeriod && anchor === null) return fail('unavailable');
    const current = live.current.host;
    const result = restoreSavedView({ view: found.view, support, current: { global: current.global, page: current.page }, extras: current.extras, pathname: current.pathname, anchor, source });
    if (!result.ok) return fail(result.reason);
    if (!result.applied) return { ok: true, unsupported: NO_UNSUPPORTED };
    // One write: a default replaces the bare entry so Back leaves the app; a picked view is a normal push.
    if (result.href !== current.url && !current.navigate(result.href, { replace: source === 'default' })) return fail('unavailable');
    setFresh({ gen: at, entry: found });
    setSelected(id);
    return { ok: true, unsupported: result.unsupported };
  }, [enabled, support, blocked, gen, entryGen, store, anchor, clearSelection, setSelected]);
  const validated = useRef<object | null>(null);

  // Entering a screen: a selection that no longer matches the address is dropped (the address wins), then the personal default fills a bare route once.
  useEffect(() => {
    if (!enabled || !support || blocked || loaded?.status !== 'ready') return;
    const arriving = entered.current !== entryGen;
    if (!arriving && validated.current === gen) return;
    entered.current = entryGen;
    validated.current = gen;
    // Revalidated in the same screen: a selection the store no longer allows is dropped, an edited one stays.
    if (!arriving) { if (selectedId !== null && selected === null) clearSelection(); return; }
    const mismatch = selected !== null && differs(selected.view, support);
    if (selectedId !== null && (selected === null || mismatch)) clearSelection();
    else if (selected !== null) return;
    if (loaded.defaultId !== null) void apply(loaded.defaultId, 'default');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `differs` is rebuilt every render from `applied`/`anchor`, both listed
  }, [enabled, support, blocked, loaded, gen, entryGen, rearmed, selected, selectedId, applied, anchor, apply, clearSelection]);
  // Back/Forward is an address arrival too: the arrived address wins over the selected view.
  const traversed = useRef(false);
  useEffect(() => {
    const onPop = () => { traversed.current = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (!traversed.current) return;
    traversed.current = false;
    if (selected && support && differs(selected.view, support)) clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `differs` is rebuilt every render from `applied`/`anchor`, both listed
  }, [host.url, selected, support, applied, anchor, clearSelection]);

  const select = useCallback((id: string) => apply(id, 'selected'), [apply]);
  const saveAs = useCallback(async (input: SaveInput): Promise<Result<SavedViewEntry>> => {
    if (!enabled || !support) return OFF;
    const captured = captureApplied(applied, support);
    const draft = input.kind === 'condition-set'
      ? { schemaVersion: 1, kind: 'condition-set', name: input.name, context: captured.context }
      : { schemaVersion: 1, kind: 'menu-view', name: input.name, menuId: support.menuId, menuSchemaVersion: support.menuSchemaVersion, context: captured.context, page: captured.page, chartOptions: input.chartOptions ?? {}, layout: input.layout ?? null, panels: input.panels ?? null };
    const checked = validateSavedView(draft);
    if (!checked.ok) return checked;
    // Latest action wins: a save that finishes after another pick or save, or on another address, does not take the selection back.
    const at = gen;
    if (stale(at)) return OFF;
    const mine = ++intent.current;
    const startUrl = live.current.host.url;
    let result: Result<SavedViewEntry>;
    try { result = await store.save(checked.value as SavedViewDraft); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.host.url === startUrl) { setFresh({ gen: at, entry: result.value }); setSelected(result.value.view.id); }
      refresh();
    }
    return result;
  }, [enabled, support, applied, store, gen, setSelected, refresh]);
  const saveToSelected = useCallback(async (): Promise<Result<SavedViewEntry>> => {
    if (!enabled || !support || !selected) return OFF;
    const at = gen;
    if (stale(at)) return OFF;
    ++intent.current;
    const mine = intent.current;
    const captured = captureApplied(applied, support);
    const patch = selected.view.kind === 'menu-view' ? { context: captured.context, page: captured.page } : { context: captured.context };
    let result: Result<SavedViewEntry>;
    try { result = await store.update(selected.view.id, patch, { expectedVersion: selected.view.version }); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.selectedId === result.value.view.id) setFresh({ gen: at, entry: result.value });
      refresh();
    }
    return result;
  }, [enabled, support, selected, applied, store, gen, refresh]);
  const revertToSaved = useCallback(async (): Promise<SelectOutcome> => selected ? apply(selected.view.id, 'selected') : { ok: false, reason: 'unavailable' }, [selected, apply]);
  const remove = useCallback(async (id: string): Promise<Result<null>> => {
    const at = gen;
    if (!enabled || stale(at)) return OFF;
    let result: Result<null>;
    try { result = await store.remove(id); } catch { return OFF; }
    if (result.ok && !stale(at)) { if (live.current.selectedId === id) clearSelection(); refresh(); }
    return result;
  }, [enabled, store, gen, clearSelection, refresh]);
  const setDefault = useCallback(async (id: string | null): Promise<Result<null>> => {
    const at = gen;
    if (!enabled || stale(at)) return OFF;
    let result: Result<null>;
    try { result = await store.setDefault({ userId, menuId }, id); } catch { return OFF; }
    if (result.ok && !stale(at)) refresh();
    return result;
  }, [enabled, store, gen, userId, menuId, refresh]);

  return useMemo((): SavedViews => ({
    status, support: support ?? null, menuViews, conditionSets, defaultId, selected, state, unsupported,
    select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, refresh,
  }), [status, support, menuViews, conditionSets, defaultId, selected, state, unsupported, select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, refresh]);
}
const NOOP_SUBSCRIBE = () => () => {};
