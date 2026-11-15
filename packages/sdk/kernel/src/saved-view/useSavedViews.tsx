import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildQuery, validateSavedView, type JsonValue, type Pair, type Result, type SavedViewDraft, type SavedViewEntry, type SavedViewListItem, type SavedViewStore, type SavedViewSupport } from '@ap/contracts';
import { useHostPlatform } from '../platform/platform';
import { AppContext } from '../platform/contexts';
import { captureApplied, viewState, type ViewState } from './capture';
import { comparableApplied, excludedByScope, overwritePatch, restoreSavedView, savedInOtherScope, savedStateOf, siteBoundDropped, unsupportedOf, type RestoreFailure, type Unsupported } from './restore';

/** `held` awaits the leave decision; `cancelled` was superseded. Both are silent and preserve the current selection. */
export type SelectOutcome = { ok: true; unsupported: readonly Unsupported[]; /** Context keys a view saved in another Scope did not apply here (#2175). */ excludedByScope: readonly string[] } | { ok: false; reason: RestoreFailure | 'unavailable' | 'denied' | 'held' | 'cancelled' };
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
  /**
   * The Context keys (as the user reads them) the selected view does not apply because it was saved in another Scope (#2175), and that Scope's id. Derived from the selected view
   * and the CURRENT Scope, so a Scope switch, a reload and a fresh pick agree. Separate from `unsupported` (what this menu cannot restore): two reasons, two lists.
   */
  scopeExcluded: { savedScopeId: string; keys: readonly string[] } | null;
  /**
   * Set when `saveToSelected` would replace Site-bound values saved in another Scope with this Scope's (#2175): the shell asks before saving. `keys` are the stored Site-bound
   * Context keys that would be removed. Null for a same-Scope save, an old view (no recorded Scope) and a view with no Site-bound values.
   */
  crossScopeSave: { savedScopeId: string; keys: readonly string[] } | null;
  select: (id: string) => Promise<SelectOutcome>;
  clearSelection: () => void;
  /** 새 뷰로 저장: stores the APPLIED conditions (never the draft) as a new view and selects it. */
  saveAs: (input: SaveInput) => Promise<Result<SavedViewEntry>>;
  /** 현재 뷰에 저장: overwrites the selected view with the applied conditions at its version, keeping what this menu does not support and an unchanged relative period (`overwritePatch`); a conflict keeps the selection and the applied conditions and rereads the view list, so the next call goes at the store's current version. */
  saveToSelected: () => Promise<Result<SavedViewEntry>>;
  /** 저장본으로 되돌리기: re-applies the selected view's saved copy. */
  revertToSaved: () => Promise<SelectOutcome>;
  remove: (id: string) => Promise<Result<null>>;
  setDefault: (id: string | null) => Promise<Result<null>>;
  /**
   * The shell's only write path for sharing, approval, migration and groups; same signatures as the store port, so a caller cannot send what the port would not take.
   * A call that was never sent (no enabled screen, a callback kept from an older store/session/revision/Scope/menu or an unmounted screen) or whose store call threw
   * returns `unavailable`. A store call that completed returns its Result unchanged, also when the generation changed meanwhile: the write happened, and reporting
   * it as unavailable would make a retry create a second group or share a stale version. Late results of an older generation refresh and select nothing.
   * These are not selection intents: they neither count as the user's latest pick nor discard one in flight.
   *
   * `update`: raw patch at an `expectedVersion` (migration, rename): unlike `saveToSelected` it does not capture the applied conditions.
   * On ok the view list refreshes; when the returned view is the selected one it shows the returned version until the list answers (a newer version is kept).
   * A current `conflict` refreshes the view list too (nothing else changes); `forbidden`, `unavailable` and `invalid` do not.
   */
  update: SavedViewStore['update'];
  /** On ok: same refresh and selected-view version rule as `update`. */
  setVisibility: SavedViewStore['setVisibility'];
  /** On ok: same refresh and selected-view version rule as `update`. */
  requestOfficial: SavedViewStore['requestOfficial'];
  /** On ok: same refresh and selected-view version rule as `update`. */
  decide: SavedViewStore['decide'];
  /** On ok: same refresh and selected-view version rule as `update`. */
  revoke: SavedViewStore['revoke'];
  /** Groups are not views: no view-list refresh (the share picker merges the groups it made). */
  createGroup: SavedViewStore['createGroup'];
  /** Groups are not views: no view-list refresh. */
  updateGroup: SavedViewStore['updateGroup'];
  refresh: () => void;
};

const MAX_DEFAULT_RETRIES = 3;
const NO_ITEMS: readonly SavedViewListItem[] = [];
const NO_UNSUPPORTED: readonly Unsupported[] = [];
const NO_KEYS: readonly string[] = [];
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
/** The arrived address is rebuilt as the visible pairs, then the hidden ones (ADR-0105); the expected one must be in that order too. */
function arrivalHref(next: { global: ReturnType<typeof useHostPlatform>['global']; page: readonly (readonly [string, string])[] }, from: Pick<ReturnType<typeof useHostPlatform>, 'route' | 'pathname' | 'extras'>): string {
  const hidden = from.route?.menu.hiddenPageKeys ?? [];
  const pairs = next.page.map(([key, value]): Pair => [key, value]);
  return from.pathname + buildQuery(next.global, [...pairs.filter(([key]) => !hidden.includes(key)), ...pairs.filter(([key]) => hidden.includes(key))], from.extras);
}

export function useSavedViews(): SavedViews {
  const host = useHostPlatform();
  const app = useContext(AppContext);
  const registry = app?.internal.savedViewSupports;
  const guard = app?.internal.guard;
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
  const state = useMemo(() => support === undefined ? OFF_STATE : viewState({ applied: selected ? comparableApplied(selected.view, captureApplied(applied, support)) : captureApplied(applied, support), saved: selected ? savedStateOf(selected.view, support, anchor, host.global.scopeId) : null, draftDirty: host.queryDraft.dirty }), [support, applied, selected, anchor, host.global.scopeId, host.queryDraft.dirty]);
  // Derived from the saved copy, so a selection recovered after a reload lists the same Context as right after the pick.
  const unsupported = useMemo(() => selected && support ? unsupportedOf(selected.view, support, anchor) : NO_UNSUPPORTED, [selected, support, anchor]);
  const currentScope = host.global.scopeId;
  const scopeExcluded = useMemo(() => {
    if (!selected || !support || selected.view.savedScopeId === undefined) return null;
    const keys = excludedByScope(selected.view, support, currentScope);
    return keys.length === 0 ? null : { savedScopeId: selected.view.savedScopeId, keys };
  }, [selected, support, currentScope]);
  const crossScopeSave = useMemo(() => {
    if (!selected || selected.view.savedScopeId === undefined || !savedInOtherScope(selected.view, currentScope)) return null;
    const stored = siteBoundDropped(selected.view, currentScope);
    return stored.length === 0 ? null : { savedScopeId: selected.view.savedScopeId, keys: [...new Set(stored)] as readonly string[] };
  }, [selected, currentScope]);

  // Latest values for async callbacks. `intent` numbers the user's latest restore/pick/save: a result that arrives after a newer one, a changed address or generation, or the screen's unmount is dropped.
  const live = useRef({ gen, host, selectedId, selectedVersion: selected?.view.version ?? null });
  useEffect(() => { live.current = { gen, host, selectedId, selectedVersion: selected?.view.version ?? null }; });
  // A default whose read was overtaken by a newer generation or a moved address (scope check done, the Kernel completing the address) was never judged: the entry is armed again.
  // Capped per entry: every retry needs a new discard, and the cap ends a generation or address that keeps changing.
  const entered = useRef<object | null>(null);
  const [rearmed, setRearmed] = useState(0);
  const retries = useRef<{ entry: object; n: number }>({ entry: entryGen, n: 0 });
  const intent = useRef(0);
  const heldRequest = useRef<ReturnType<NonNullable<typeof guard>['getRequest']>>(null);
  const [arrivingSelection, setArrivingSelection] = useState<{ gen: object; mine: number; href: string; entry: SavedViewEntry } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const stale = (at: object) => !alive.current || live.current.gen !== at;
  const clearSelection = useCallback(() => { intent.current += 1; setSelected(null); }, [setSelected]);
  const differs = (view: SavedViewEntry['view'], support: SavedViewSupport) => viewState({ applied: comparableApplied(view, captureApplied(applied, support)), saved: savedStateOf(view, support, anchor, host.global.scopeId), draftDirty: [] }).modified;

  // The guard's replay runs before the address commits. Select only once that exact applied state has arrived.
  useEffect(() => {
    if (!arrivingSelection) return;
    const arrival = arrivingSelection;
    setArrivingSelection(null);
    if (arrival.gen !== gen || arrival.mine !== intent.current || !alive.current) return;
    if (host.pathname + buildQuery(host.global, host.page, host.extras) !== arrival.href) return;
    setFresh({ gen, entry: arrival.entry });
    setSelected(arrival.entry.view.id);
  }, [arrivingSelection, gen, host.pathname, host.global, host.page, host.extras, setSelected]);

  const apply = useCallback(async (id: string, source: 'selected' | 'default'): Promise<SelectOutcome> => {
    if (!enabled || !support || blocked || stale(gen)) return { ok: false, reason: 'unavailable' };
    const at = gen;
    const mine = ++intent.current;
    if (heldRequest.current && guard?.getRequest() === heldRequest.current) guard.dropRequest();
    heldRequest.current = null;
    const startUrl = live.current.host.appliedUrl;
    // Always asks the store: a restore is judged on the view's current capabilities, never on an earlier list answer or the cached copy.
    let found: SavedViewListItem | null;
    try { found = await store.get(id); } catch { found = null; }
    if (stale(at) || intent.current !== mine || live.current.host.appliedUrl !== startUrl) {
      // Only a default that nobody replaced (no newer intent) and that is still on screen is retried; the restore rule refuses it if the address now carries explicit Context.
      if (source === 'default' && alive.current && intent.current === mine) {
        if (retries.current.entry !== entryGen) retries.current = { entry: entryGen, n: 0 };
        if (retries.current.n < MAX_DEFAULT_RETRIES) { retries.current.n += 1; entered.current = null; setRearmed(n => n + 1); }
      }
      return { ok: false, reason: source === 'selected' ? 'cancelled' : 'unavailable' };
    }
    const fail = (reason: Exclude<SelectOutcome, { ok: true }>['reason']): SelectOutcome => { clearSelection(); return { ok: false, reason }; };
    if (!found) return fail('unavailable');
    if (found.denied || !found.capabilities.canView) return fail('denied');
    // A relative period needs the server anchor; without one it is not restorable (absolute views still are).
    if (found.view.context.relativePeriod && anchor === null) return fail('unavailable');
    const current = live.current.host;
    const result = restoreSavedView({ view: found.view, support, current: { global: current.global, page: current.page }, extras: current.extras, pathname: current.pathname, anchor, source });
    if (!result.ok) return fail(result.reason);
    if (!result.applied) return { ok: true, unsupported: NO_UNSUPPORTED, excludedByScope: NO_KEYS };
    // One write: a default replaces the bare entry so Back leaves the app; a picked view is a normal push.
    // The address omits hidden page keys (ADR-0105), so "already here" also compares the full applied state.
    // With no hidden pair the address is the whole state; with some, only the full rebuilt query can equal the target.
    const sameAddress = (current.appliedUrl === current.url && result.href === current.url) || result.href === current.pathname + buildQuery(current.global, current.page, current.extras);
    if (!sameAddress) {
      const before = guard?.getRequest();
      let held = false;
      const moved = current.navigate(result.href, { replace: source === 'default', run: () => {
        if (stale(at) || intent.current !== mine || live.current.host.appliedUrl !== startUrl) return false;
        // The arrived address is rebuilt as the visible pairs, then the hidden ones (ADR-0105); the expected one must be in that order too.
        if (held) setArrivingSelection({ gen: at, mine, href: arrivalHref(result.next, current), entry: found });
        return true;
      } });
      if (!moved) {
        const request = guard?.getRequest();
        if (request) {
          held = true;
          if (request !== before) heldRequest.current = request;
          return { ok: false, reason: 'held' };
        }
        return fail('unavailable');
      }
    }
    setFresh({ gen: at, entry: found });
    setSelected(id);
    return { ok: true, unsupported: result.unsupported, excludedByScope: result.excludedByScope };
  }, [enabled, support, blocked, gen, entryGen, store, anchor, clearSelection, setSelected, guard]);
  const validated = useRef<object | null>(null);

  // Entering a screen: a selection that no longer matches the address is dropped (the address wins), then the personal default fills a bare route once.
  useEffect(() => {
    if (!enabled || !support || blocked || loaded?.status !== 'ready') return;
    const arriving = entered.current !== entryGen;
    // A reread in the same generation (after a write, a conflict included) that no longer lists the selected view readably drops its id, as a revalidation does.
    if (!arriving && validated.current === gen) { if (selectedId !== null && selected === null) clearSelection(); return; }
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
  // Fed by the Kernel's accepted-traversal signal, not the raw popstate: a Back the unsaved-edit guard cancelled (ADR-0115) is no arrival.
  const traversed = useRef(false);
  useEffect(() => guard?.onTraversal(() => { traversed.current = true; }), [guard]);
  useEffect(() => {
    if (!traversed.current) return;
    traversed.current = false;
    if (selected && support && differs(selected.view, support)) clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `differs` is rebuilt every render from `applied`/`anchor`, both listed
  }, [host.appliedUrl, selected, support, applied, anchor, clearSelection]);

  const select = useCallback((id: string) => apply(id, 'selected'), [apply]);
  const saveAs = useCallback(async (input: SaveInput): Promise<Result<SavedViewEntry>> => {
    if (!enabled || !support) return OFF;
    const captured = captureApplied(applied, support);
    // The Scope the content is saved in (#2175); with no current Scope nothing is recorded and the view reads as an old one.
    const scopeStamp = applied.global.scopeId !== null ? { savedScopeId: applied.global.scopeId } : {};
    const draft = input.kind === 'condition-set'
      ? { schemaVersion: 1, kind: 'condition-set', name: input.name, context: captured.context, ...scopeStamp }
      : { schemaVersion: 1, kind: 'menu-view', name: input.name, menuId: support.menuId, menuSchemaVersion: support.menuSchemaVersion, context: captured.context, ...scopeStamp, page: captured.page, chartOptions: input.chartOptions ?? {}, layout: input.layout ?? null, panels: input.panels ?? null };
    const checked = validateSavedView(draft);
    if (!checked.ok) return checked;
    // Latest action wins: a save that finishes after another pick or save, or on another address, does not take the selection back.
    const at = gen;
    if (stale(at)) return OFF;
    const mine = ++intent.current;
    const startUrl = live.current.host.appliedUrl;
    let result: Result<SavedViewEntry>;
    try { result = await store.save(checked.value as SavedViewDraft); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.host.appliedUrl === startUrl) { setFresh({ gen: at, entry: result.value }); setSelected(result.value.view.id); }
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
    const patch = overwritePatch(selected.view, captureApplied(applied, support), support, anchor, applied.global.scopeId);
    let result: Result<SavedViewEntry>;
    try { result = await store.update(selected.view.id, patch, { expectedVersion: selected.view.version }); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.selectedId === result.value.view.id) setFresh({ gen: at, entry: result.value });
      refresh();
    }
    // A write refused for its version rereads the list (06 §21.2): the selection and the applied conditions stay, and the next save goes at the version the store now holds.
    if (!result.ok && result.reason === 'conflict' && !stale(at)) refresh();
    return result;
  }, [enabled, support, selected, applied, anchor, store, gen, refresh]);
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
  // Store writes of the shell: sent only from the current generation; the Result of a completed call is returned unchanged, `after` runs only for a current ok.
  // A view write (`after` given) answered `conflict` in the current generation rereads the list, as `saveToSelected` does; group writes do not touch views.
  const write = useCallback(async <T,>(send: (store: SavedViewStore) => Promise<Result<T>>, after?: (value: T, at: object) => void): Promise<Result<T>> => {
    const at = gen;
    if (!enabled || stale(at)) return OFF;
    let result: Result<T>;
    try { result = await send(store); } catch { return OFF; }
    if (result.ok && !stale(at)) after?.(result.value, at);
    else if (after && !result.ok && result.reason === 'conflict' && !stale(at)) refresh();
    return result;
  }, [enabled, store, gen, refresh]);
  // A written view that is still the selected one is the new snapshot, unless a newer version is already shown; picks and the selection stay untouched.
  const viewWritten = useCallback((entry: SavedViewEntry, at: object) => {
    if (live.current.selectedId === entry.view.id && !((live.current.selectedVersion ?? 0) > entry.view.version)) setFresh(previous => previous?.gen === at && previous.entry.view.id === entry.view.id && previous.entry.view.version > entry.view.version ? previous : { gen: at, entry });
    refresh();
  }, [refresh]);
  const update = useCallback<SavedViewStore['update']>((id, patch, opts) => write(s => s.update(id, patch, opts), viewWritten), [write, viewWritten]);
  const setVisibility = useCallback<SavedViewStore['setVisibility']>((id, visibility, opts) => write(s => s.setVisibility(id, visibility, opts), viewWritten), [write, viewWritten]);
  const requestOfficial = useCallback<SavedViewStore['requestOfficial']>((id, opts) => write(s => s.requestOfficial(id, opts), viewWritten), [write, viewWritten]);
  const decide = useCallback<SavedViewStore['decide']>((id, decision, note, opts) => write(s => s.decide(id, decision, note, opts), viewWritten), [write, viewWritten]);
  const revoke = useCallback<SavedViewStore['revoke']>((id, opts) => write(s => s.revoke(id, opts), viewWritten), [write, viewWritten]);
  const createGroup = useCallback<SavedViewStore['createGroup']>(input => write(s => s.createGroup(input)), [write]);
  const updateGroup = useCallback<SavedViewStore['updateGroup']>((id, patch) => write(s => s.updateGroup(id, patch)), [write]);

  return useMemo((): SavedViews => ({
    status, support: support ?? null, menuViews, conditionSets, defaultId, selected, state, unsupported, scopeExcluded, crossScopeSave,
    select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, update, setVisibility, requestOfficial, decide, revoke, createGroup, updateGroup, refresh,
  }), [status, support, menuViews, conditionSets, defaultId, selected, state, unsupported, scopeExcluded, crossScopeSave, select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, update, setVisibility, requestOfficial, decide, revoke, createGroup, updateGroup, refresh]);
}
const NOOP_SUBSCRIBE = () => () => {};
