import { createContext, use, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { buildQuery, validateSavedView, type JsonValue, type MenuView, type MenuViewPanels, type Pair, type Result, type SavedViewDraft, type SavedViewEntry, type SavedViewListItem, type SavedViewStore, type SavedViewSupport, type TableViewState } from '@ap/contracts';
import { useI18n, type Text } from '../i18n';
import { useHostPlatform } from '../platform/hooks';
import { AppContext, LentPanelPlatformContext, PaneScreenContext, ScreenContext } from '../platform/contexts';
import type { LeaveRequest } from '../platform/navigationGuard';
import { pathFor } from '../registry/registry';
import { captureApplied, viewState, type ViewState } from './capture';
import { comparableApplied, excludedByScope, contextKeysOf, heldSetsDropped, overwritePatch, panelsInScope, restoreSavedView, savedInOtherScope, savedStateOf, siteBoundDropped, unsupportedOf, type RestoreFailure, type Unsupported } from './restore';
import { PANELS_SLOT, useMainScreenPanelSlots, type SavedViewPanelsOutcome } from './useSavedViewPanels';
import { resolveSavedViewSupport } from './useSavedViewSupport';
import { collectSaveBlocks } from './table-slots';

/** `held` awaits the leave decision; `cancelled` was superseded. Both are silent and preserve the current selection. */
export type SelectOutcome = { ok: true; unsupported: readonly Unsupported[]; /** Context keys, and held-set panel input keys (#2862), a view saved in another Scope did not apply here (#2175); each key once. */ excludedByScope: readonly string[] } | { ok: false; reason: RestoreFailure | 'unavailable' | 'denied' | 'held' | 'cancelled' };
export type SaveInput = { name: string; kind: 'condition-set' | 'menu-view'; chartOptions?: Record<string, JsonValue>; layout?: JsonValue; panels?: MenuViewPanels | null };
type SaveResult = Result<SavedViewEntry> | { ok: false; reason: 'blocked' };
export type SavedViews = {
  /** `disabled`: no store injected, the menu does not declare `features.savedView`, or no support is available. */
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  support: SavedViewSupport | null;
  /** Views of this menu and condition sets (reusable across menus), as the store lists them; denied ones carry only their reason. */
  menuViews: readonly SavedViewListItem[];
  conditionSets: readonly SavedViewListItem[];
  defaultId: string | null;
  selected: RestorableEntry | null;
  state: ViewState;
  /** Context the last restore left out (06 §6.4); cleared with the selection. */
  unsupported: readonly Unsupported[];
  /**
   * What the selected view does not apply because it was saved in another Scope (#2175), and that Scope's id. `keys`: the Context keys (as the user reads them) and the input
   * keys of held panel sets (#2862), each once; `panelKeys`: which of them are panel input keys, so the shell names them as declared. Derived from the selected view and the
   * CURRENT Scope, so a Scope switch, a reload and a fresh pick agree. Separate from `unsupported` (what this menu cannot restore): two reasons, two lists.
   */
  scopeExcluded: { savedScopeId: string; keys: readonly string[]; panelKeys?: readonly string[] } | null;
  /**
   * Set when `saveToSelected` would replace Site-bound values or held panel sets saved in another Scope (#2175, #2862): the shell asks before saving. `keys` are the stored
   * Context keys and panel input keys that would be removed, each once; `panelKeys` the panel ones (saved as the screen's panel inputs now are). Null for a same-Scope save,
   * an old view (no recorded Scope) and a view with nothing Scope-bound.
   */
  crossScopeSave: { savedScopeId: string; keys: readonly string[]; panelKeys?: readonly string[] } | null;
  /** Reasons from the current screen's slots that prevent saving the applied conditions. */
  saveBlocked: readonly (string | Text)[];
  select: (id: string) => Promise<SelectOutcome>;
  clearSelection: () => void;
  /** 새 뷰로 저장: stores the APPLIED conditions (never the draft) as a new view and selects it. */
  saveAs: (input: SaveInput) => Promise<SaveResult>;
  /** 현재 뷰에 저장: overwrites the selected view with the applied conditions at its version, keeping what this menu does not support and an unchanged relative period (`overwritePatch`); a conflict keeps the selection and the applied conditions and rereads the view list, so the next call goes at the store's current version. */
  saveToSelected: () => Promise<SaveResult>;
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
const AUTO_APPLY_DEFAULT_WAIT_MS = 3000;
const NO_ITEMS: readonly SavedViewListItem[] = [];
type RestorableEntry = SavedViewEntry & { view: Exclude<SavedViewEntry['view'], { kind: 'custom-group' }> };
/** The panels a view hands to the screen in `scopeId`: in another Scope its held sets follow instead (#2862). */
function savedPanelsSlot(view: MenuView, scopeId: string | null): Record<string, SavedViewPanelsOutcome> {
  return { [PANELS_SLOT]: view.panelsUnreadable ? 'unreadable' : panelsInScope(view, scopeId).panels };
}
const NO_UNSUPPORTED: readonly Unsupported[] = [];
const NO_KEYS: readonly string[] = [];
const OFF: Result<never> = { ok: false, reason: 'unavailable' };
const SAVE_BLOCKED = { ok: false, reason: 'blocked' } as const;
const NO_SAVE_BLOCKS: SavedViews['saveBlocked'] = [];
const OFF_STATE: ViewState = { modified: false, unsaved: false, unapplied: false };
const selectionKey = (userId: string, menuId: string, paneId: string | null) => paneId === null
  ? `platform:saved-view:selected:${userId}:${menuId}`
  : `platform:saved-view:pane-selected:${JSON.stringify([userId, menuId, paneId])}`;

// The main screen and each pane keep separate selections in the tab's sessionStorage (06 §21.3, `savedViewToken` stays reserved).
const memory = new Map<string, string>();
function readSelected(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
function writeSelected(key: string, id: string | null) {
  try { if (id === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, id); } catch { if (id === null) memory.delete(key); else memory.set(key, id); }
}
const entryOf = (item: SavedViewListItem | null | undefined): RestorableEntry | null => (item && !item.denied && item.view.kind !== 'custom-group' ? item as RestorableEntry : null);

/** The arrived address is rebuilt as the visible pairs, then the hidden ones (ADR-0105); the expected one must be in that order too. */
function arrivalHref(next: { global: ReturnType<typeof useHostPlatform>['global']; page: readonly (readonly [string, string])[] }, from: Pick<ReturnType<typeof useHostPlatform>, 'route' | 'pathname' | 'extras'>): string {
  const hidden = from.route?.menu.hiddenPageKeys ?? [];
  const pairs = next.page.map(([key, value]): Pair => [key, value]);
  return from.pathname + buildQuery(next.global, [...pairs.filter(([key]) => !hidden.includes(key)), ...pairs.filter(([key]) => hidden.includes(key))], from.extras);
}

/** A new object for each eligible first-address decision. Only the owning screen can release its fallback. */
export type InitialSavedView = { settle: () => void; materialize: (href: string) => boolean };
type InitialWork = { initial: InitialSavedView; gen: object; mine: number } & (
  { phase: 'reading' | 'accepted' | 'settled' } | { phase: 'held'; request: LeaveRequest }
);
const isDecisionResolved = (work: InitialWork | null, target: InitialSavedView, at?: object) =>
  work !== null && work.initial === target && (at === undefined || work.gen === at) && (work.phase === 'accepted' || work.phase === 'settled');
const ScreenSavedViewsContext = createContext<{ views: SavedViews; requestLists: () => () => void } | null>(null);
const ScreenLoadingContext = createContext<((loading: boolean) => void) | null>(null);

/** Place in a screen's Suspense fallback when its Saved View support is registered by the page. */
export function ScreenContentLoading() {
  const setLoading = useContext(ScreenLoadingContext);
  const lent = useContext(LentPanelPlatformContext) !== null;
  useLayoutEffect(() => {
    if (!setLoading || lent) return;
    setLoading(true);
    return () => setLoading(false);
  }, [setLoading, lent]);
  return null;
}

export function ScreenSavedViews({ initial, children }: { initial: InitialSavedView | null; children: ReactNode }) {
  const host = useHostPlatform();
  const ownsViews = host.route?.menu.query?.mode === 'apply' && host.route.menu.query.autoApplyDefault === true && host.route.menu.features.savedView && host.savedViewStore !== undefined
    && host.canOpen(host.route.menu.id);
  const [controls, setControls] = useState(0);
  const requestLists = useCallback(() => {
    setControls(count => count + 1);
    return () => setControls(count => count - 1);
  }, []);
  const [waitingForContent, setWaitingForContent] = useState(false);
  const loadingNow = useRef(false);
  const setLoading = useCallback((loading: boolean) => {
    loadingNow.current = loading;
    setWaitingForContent(loading);
  }, []);
  const views = useSavedViewController(host, ownsViews ? 'owner' : 'inactive', initial, {
    readLists: controls > 0, waitingForContent, loadingNow,
  });
  const value = useMemo(() => ownsViews ? { views, requestLists } : null, [ownsViews, views, requestLists]);
  return <ScreenLoadingContext.Provider value={ownsViews ? setLoading : null}>
    <ScreenSavedViewsContext.Provider value={value}>{children}</ScreenSavedViewsContext.Provider>
  </ScreenLoadingContext.Provider>;
}

/**
 * Host hook of the Saved View selector (`@ap/kernel/host`, shell): list/save/restore over the injected store, the selected view of this tab and the
 * three change states. Inactive without a store, a `features.savedView` menu and its Saved View support.
 */
export function useSavedViews(): SavedViews {
  const host = useHostPlatform();
  const owner = useContext(ScreenSavedViewsContext);
  const lent = useContext(LentPanelPlatformContext) !== null;
  const owned = host.screenMode === 'main' && !lent ? owner : null;
  const requestLists = owned?.requestLists;
  useLayoutEffect(() => requestLists?.(), [requestLists]);
  const paneWithoutPicker = host.screenMode === 'pane' && host.route?.menu.query?.mode === 'apply' && host.route.menu.query.autoApplyDefault === true;
  const views = useSavedViewController(host, lent || owned || paneWithoutPicker ? 'inactive' : 'legacy', null);
  return owned?.views ?? views;
}

function useSavedViewController(
  host: ReturnType<typeof useHostPlatform>,
  mode: 'owner' | 'legacy' | 'inactive',
  initial: InitialSavedView | null,
  { readLists = mode === 'legacy', waitingForContent = false, loadingNow }: {
    readLists?: boolean; waitingForContent?: boolean; loadingNow?: { readonly current: boolean };
  } = {},
): SavedViews {
  const { t } = useI18n();
  const app = useContext(AppContext);
  const pane = useContext(PaneScreenContext);
  const screen = pane ?? (mode === 'inactive' ? null : use(ScreenContext));
  const explicitEntry = screen?.explicitSavedViewEntry;
  const registry = mode === 'inactive' ? undefined : app?.internal.savedViewSupports;
  const guard = app?.internal.guard;
  const store = host.savedViewStore;
  const route = host.route;
  const menu = route?.menu ?? null;
  const menuId = menu?.id ?? '';
  const userId = host.user.id;
  const slots = useMemo(() => app?.internal.savedViewSlots.screen(JSON.stringify([menuId, host.global.scopeId])), [app?.internal.savedViewSlots, menuId, host.global.scopeId]);
  const slotRevision = useSyncExternalStore(slots?.subscribe ?? NOOP_SUBSCRIBE, slots?.snapshot ?? ZERO_SNAPSHOT);
  const panelSlots = useMainScreenPanelSlots(host);
  const panelRevision = useSyncExternalStore(panelSlots?.subscribe ?? NOOP_SUBSCRIBE, panelSlots?.snapshot ?? ZERO_SNAPSHOT);
  const support = useSyncExternalStore(registry?.subscribe ?? NOOP_SUBSCRIBE, () => (mode === 'inactive' ? undefined : resolveSavedViewSupport(menu, registry)));
  const enabled = mode !== 'inactive' && store !== undefined && menu?.features.savedView === true && support !== undefined;
  // An address the contract rejects (06 §6.4) is neither rewritten by a default nor replaced by a pick: the error and the original address stay.
  const blocked = host.contractError !== null;
  const identity = `${userId}\0${menuId}`;
  // One generation per store, session, permission revision, Scope state, menu and menu declaration: everything read or started in an older one is hidden or dropped (kernel guidance, 06 §21.2).
  const { session, revision, paneId } = host;
  const saveBlocked = enabled && paneId === null ? collectSaveBlocks(panelSlots, slots) : NO_SAVE_BLOCKS;
  const scopeKey = `${host.scope.scopeId}\0${host.scope.status}`;
  const entryPath = mode === 'owner' && route ? pathFor(route.menu, route.params) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs are triggers only: a new generation object whenever any of them changes
  const gen = useMemo(() => ({}), [store, session, revision, scopeKey, identity, enabled, support, paneId, entryPath]);
  useEffect(() => () => {
    slots?.select(null);
    panelSlots?.select(null);
  }, [slots, panelSlots, gen]);
  // The entry of a screen is not a security read: a revalidation (new `gen`) keeps a selection that is still allowed, only a real arrival re-judges it against the address.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs are triggers only
  const entryGen = useMemo(() => ({}), [identity, enabled, paneId, entryPath]);

  const key = mode === 'inactive' ? null : selectionKey(userId, menuId, paneId);
  const [selection, setSelection] = useState(() => ({ key, id: key === null ? null : readSelected(key) }));
  if (selection.key !== key) setSelection({ key, id: key === null ? null : readSelected(key) });
  const selectedId = selection.key === key ? selection.id : null;
  const setSelected = useCallback((id: string | null) => {
    slots?.select(id);
    panelSlots?.select(id);
    if (key !== null) writeSelected(key, id);
    setSelection({ key, id });
  }, [key, slots, panelSlots]);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  const defaultRead = useRef<{ gen: object; tick: number; result: Promise<string | null> } | null>(null);
  const readDefault = useCallback(() => {
    if (!store) return Promise.resolve(null);
    if (mode !== 'owner') return store.getDefaultId({ userId, menuId });
    if (defaultRead.current?.gen !== gen || defaultRead.current.tick !== tick) {
      defaultRead.current = { gen, tick, result: store.getDefaultId({ userId, menuId }) };
    }
    return defaultRead.current.result;
  }, [store, userId, menuId, mode, gen, tick]);
  // The view the last restore or save was accepted with: it is the selected view's snapshot until the next list answer replaces it.
  const [fresh, setFresh] = useState<{ gen: object; entry: SavedViewEntry } | null>(null);
  const [data, setData] = useState<{ gen: object; tick: number; status: 'ready' | 'unavailable'; menuViews: readonly SavedViewListItem[]; conditionSets: readonly SavedViewListItem[]; defaultId: string | null } | null>(null);
  const loaded = enabled && data !== null && data.gen === gen ? data : null;
  const status = !enabled ? 'disabled' : loaded?.status ?? 'loading';
  const menuViews = loaded?.menuViews ?? NO_ITEMS;
  const conditionSets = loaded?.conditionSets ?? NO_ITEMS;
  const defaultId = loaded?.defaultId ?? null;

  const anchor = mode === 'inactive' ? null : host.adapter.defaultRangeTo();
  const find = useCallback((id: string | null) => id === null ? null : entryOf([...menuViews, ...conditionSets].find(item => (item.denied ? item.id : item.view.id) === id)), [menuViews, conditionSets]);
  const selected = selectedId !== null && fresh?.gen === gen && fresh.entry.view.id === selectedId ? entryOf(fresh.entry) : find(selectedId);
  const applied = useMemo(() => ({ global: host.global, page: host.page }), [host.global, host.page]);
  const selectedMenuView = selected?.view.kind === 'menu-view' ? selected.view : undefined;
  const slotModified = useMemo(() => {
    if (slotRevision < 0 || panelRevision < 0 || !selectedMenuView) return false;
    // Panels of another menu schema are never handed to the screen, so they are not compared either (R2862C C8).
    return slots?.differs('tables', selectedMenuView.tables) === true
      || (panelSlots !== undefined && selectedMenuView.menuSchemaVersion === support?.menuSchemaVersion
        && panelSlots.differs(PANELS_SLOT, savedPanelsSlot(selectedMenuView, host.global.scopeId)));
  }, [slots, slotRevision, panelSlots, panelRevision, selectedMenuView, host.global.scopeId, support]);
  const state = useMemo(() => support === undefined ? OFF_STATE : viewState({ applied: selected ? comparableApplied(selected.view, captureApplied(applied, support)) : captureApplied(applied, support), saved: selected ? savedStateOf(selected.view, support, anchor, host.global.scopeId) : null, draftDirty: host.queryDraft.dirty, slotModified }), [support, applied, selected, anchor, host.global.scopeId, host.queryDraft.dirty, slotModified]);
  // Derived from the saved copy, so a selection recovered after a reload lists the same Context as right after the pick.
  const unsupported = useMemo(() => selected && support ? unsupportedOf(selected.view, support, anchor) : NO_UNSUPPORTED, [selected, support, anchor]);
  const currentScope = host.global.scopeId;
  const scopeExcluded = useMemo(() => {
    if (!selected || !support || selected.view.savedScopeId === undefined) return null;
    const keys = excludedByScope(selected.view, support, currentScope);
    const panelKeys = heldSetsDropped(selected.view, currentScope, support);
    return keys.length === 0 ? null : { savedScopeId: selected.view.savedScopeId, keys, ...(panelKeys.length ? { panelKeys } : {}) };
  }, [selected, support, currentScope]);
  const crossScopeSave = useMemo(() => {
    if (!selected || selected.view.savedScopeId === undefined || !savedInOtherScope(selected.view, currentScope)) return null;
    const panelKeys = heldSetsDropped(selected.view, currentScope);
    const keys = [...new Set([...contextKeysOf(siteBoundDropped(selected.view, currentScope)), ...panelKeys])];
    return keys.length === 0 ? null : { savedScopeId: selected.view.savedScopeId, keys: keys as readonly string[], ...(panelKeys.length ? { panelKeys } : {}) };
  }, [selected, currentScope]);

  // Latest values for async callbacks. `intent` numbers the user's latest restore/pick/save: a result that arrives after a newer one, a changed address or generation, or the screen's unmount is dropped.
  const live = useRef({ gen, host, initial, explicitEntry, t, selectedId, selectedVersion: selected?.view.version ?? null });
  const initialWork = useRef<InitialWork | null>(null);
  const expiredInitial = useRef<InitialSavedView | null>(null);
  const deadlineTimer = useRef<{ initial: InitialSavedView; id: ReturnType<typeof setTimeout> } | null>(null);
  const intent = useRef(0);
  const clearDeadlineTimer = useCallback((target?: InitialSavedView) => {
    const active = deadlineTimer.current;
    if (!active || (target !== undefined && active.initial !== target)) return;
    clearTimeout(active.id);
    deadlineTimer.current = null;
  }, []);
  const acceptDecision = useCallback((decision: InitialSavedView, at: object, mine: number) => {
    initialWork.current = { initial: decision, gen: at, mine, phase: 'accepted' };
    clearDeadlineTimer(decision);
  }, [clearDeadlineTimer]);
  const settleDecision = useCallback((decision: InitialSavedView, at: object, mine: number) => {
    initialWork.current = { initial: decision, gen: at, mine, phase: 'settled' };
    clearDeadlineTimer(decision);
    decision.settle();
  }, [clearDeadlineTimer]);
  const retireNoWrite = useCallback((resolvedDefaultId: string | null) => {
    if (mode !== 'owner' || resolvedDefaultId !== null || !alive.current) return;
    const currentInitial = live.current.initial;
    if (!currentInitial || live.current.gen !== gen || expiredInitial.current === currentInitial) return;
    if (initialWork.current?.initial === currentInitial && initialWork.current.gen === gen) return;
    settleDecision(currentInitial, gen, intent.current);
  }, [mode, gen, settleDecision]);
  useEffect(() => {
    if (!enabled || !readLists) return;
    let cancelled = false;
    Promise.all([store.list({ userId, menuId }), store.list({ userId, menuId: null }), readDefault()])
      .then(([menuViews, conditionSets, resolvedDefaultId]) => {
        if (cancelled) return;
        retireNoWrite(resolvedDefaultId);
        setData({ gen, tick, status: 'ready', menuViews: menuViews.filter(item => item.denied || item.view.kind === 'menu-view'), conditionSets: conditionSets.filter(item => item.denied || item.view.kind === 'condition-set'), defaultId: resolvedDefaultId });
        setFresh(null);
      })
      .catch(() => {
        if (cancelled) return;
        retireNoWrite(null);
        setData({ gen, tick, status: 'unavailable', menuViews: NO_ITEMS, conditionSets: NO_ITEMS, defaultId: null });
      });
    return () => { cancelled = true; };
  }, [enabled, readLists, store, userId, menuId, gen, tick, readDefault, retireNoWrite]);
  useEffect(() => {
    if (!initial || !enabled || expiredInitial.current === initial || isDecisionResolved(initialWork.current, initial)) return;
    const timeout = setTimeout(() => {
      if (deadlineTimer.current?.id === timeout) deadlineTimer.current = null;
      const unresolved = () => {
        if (!alive.current) return false;
        const current = live.current;
        return current.initial === initial && expiredInitial.current !== initial && !isDecisionResolved(initialWork.current, initial);
      };
      if (!unresolved()) return;
      expiredInitial.current = initial;
      initialWork.current = { initial, gen: live.current.gen, mine: intent.current, phase: 'settled' };
      initial.settle();
      if (!alive.current) return;
      const latest = live.current;
      if (latest.initial !== initial || initialWork.current?.initial !== initial || initialWork.current.phase !== 'settled') return;
      latest.host.toast(latest.t(latest.host.defaultRangeTo === null ? 'defaultViewTimeoutWithoutPeriod' : 'defaultViewTimeoutWithPeriod'), 'warning');
    }, AUTO_APPLY_DEFAULT_WAIT_MS);
    deadlineTimer.current = { initial, id: timeout };
    return () => {
      clearTimeout(timeout);
      if (deadlineTimer.current?.id === timeout) deadlineTimer.current = null;
    };
  }, [initial, enabled]);
  useLayoutEffect(() => {
    live.current = { gen, host, initial, explicitEntry, t, selectedId, selectedVersion: selected?.view.version ?? null };
    const work = initialWork.current;
    if (work && (work.initial !== initial || (work.gen !== gen && work.phase !== 'accepted' && work.phase !== 'settled'))) initialWork.current = null;
  });
  // A default whose read was overtaken by a newer generation or a moved address (scope check done, the Kernel completing the address) was never judged: the entry is armed again.
  // Capped per entry: every retry needs a new discard, and the cap ends a generation or address that keeps changing.
  const entered = useRef<object | null>(null);
  const [rearmed, setRearmed] = useState(0);
  const retries = useRef<{ entry: object; n: number }>({ entry: entryGen, n: 0 });
  const heldRequest = useRef<ReturnType<NonNullable<typeof guard>['getRequest']>>(null);
  const pendingLeave = useSyncExternalStore(mode === 'owner' && guard ? guard.subscribe : NOOP_SUBSCRIBE, guard?.getRequest ?? NO_LEAVE_REQUEST);
  useEffect(() => {
    const work = initialWork.current;
    if (work?.phase === 'held' && work.request !== pendingLeave) {
      initialWork.current = null;
      if (work.initial === initial && work.gen === gen) setRearmed(n => n + 1);
    }
  }, [initial, gen, pendingLeave]);
  const [arrivingSelection, setArrivingSelection] = useState<{ gen: object; mine: number; href: string; entry: SavedViewEntry } | null>(null);
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; initialWork.current = null; clearDeadlineTimer(); }; }, [clearDeadlineTimer]);
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

  const currentRevision = app?.internal.currentRevision;
  const apply = useCallback(async (id: string, source: 'selected' | 'default'): Promise<SelectOutcome> => {
    if (!enabled || !support || blocked || stale(gen)) return { ok: false, reason: 'unavailable' };
    const at = gen;
    const mine = ++intent.current;
    const decision = live.current.initial;
    const work = initialWork.current;
    const ownsDecision = decision !== null && expiredInitial.current !== decision && !isDecisionResolved(work, decision, at);
    if (ownsDecision) initialWork.current = { initial: decision, gen: at, mine, phase: 'reading' };
    if (heldRequest.current && guard?.getRequest() === heldRequest.current) guard.dropRequest();
    heldRequest.current = null;
    const startUrl = live.current.host.appliedUrl;
    const currentAddress = () => !stale(at) && live.current.host.appliedUrl === startUrl && (mode !== 'owner' || currentRevision?.() === revision);
    const currentDecision = () => live.current.initial === decision && expiredInitial.current !== decision && initialWork.current?.mine === mine;
    const stillCurrent = () => currentAddress() && (!ownsDecision || currentDecision()) && ((ownsDecision && source === 'default') || intent.current === mine);
    const unchanged = () => {
      if (!ownsDecision) return;
      if (source === 'default') settleDecision(decision, at, mine);
      else { initialWork.current = null; setRearmed(n => n + 1); }
    };
    // Always asks the store: a restore is judged on the view's current capabilities, never on an earlier list answer or the cached copy.
    let found: SavedViewListItem | null;
    try { found = await store.get(id); } catch { found = null; }
    if (!stillCurrent()) {
      // A pick superseded by a selection-only action can still leave this entry bare.
      if (source === 'selected' && ownsDecision && currentAddress() && currentDecision()) unchanged();
      // Only a default that nobody replaced (no newer intent) and that is still on screen is retried; the restore rule refuses it if the address now carries explicit Context.
      if (mode === 'legacy' && source === 'default' && alive.current && intent.current === mine) {
        if (retries.current.entry !== entryGen) retries.current = { entry: entryGen, n: 0 };
        if (retries.current.n < MAX_DEFAULT_RETRIES) { retries.current.n += 1; entered.current = null; setRearmed(n => n + 1); }
      }
      return { ok: false, reason: source === 'selected' ? 'cancelled' : 'unavailable' };
    }
    const fail = (reason: Exclude<SelectOutcome, { ok: true }>['reason']): SelectOutcome => { clearSelection(); unchanged(); return { ok: false, reason }; };
    if (!found) return fail('unavailable');
    if (found.denied || !found.capabilities.canView) return fail('denied');
    if (found.view.kind === 'custom-group') return fail('wrong-menu');
    // A relative period needs the server anchor; without one it is not restorable (absolute views still are).
    if (found.view.context.relativePeriod && anchor === null) return fail('unavailable');
    const current = live.current.host;
    const result = restoreSavedView({ view: found.view, support, current: { global: current.global, page: current.page }, extras: current.extras, pathname: current.pathname, anchor, source, explicitEntry: live.current.explicitEntry });
    if (!result.ok) return fail(result.reason);
    if (!result.applied) { unchanged(); return { ok: true, unsupported: NO_UNSUPPORTED, excludedByScope: NO_KEYS }; }
    // One write: a default replaces the bare entry so Back leaves the app; a picked view is a normal push.
    // The address omits hidden page keys (ADR-0105), so "already here" also compares the full applied state.
    // With no hidden pair the address is the whole state; with some, only the full rebuilt query can equal the target.
    const sameAddress = (current.appliedUrl === current.url && result.href === current.url) || result.href === current.pathname + buildQuery(current.global, current.page, current.extras);
    const applySlots = () => {
      const view = found.view;
      const tables = view.kind === 'menu-view' ? { tables: view.tables } : {};
      if (source === 'default') slots?.restore(id, tables); else slots?.apply(id, tables);
      if (!panelSlots) return;
      const panels = view.kind === 'menu-view' ? { [PANELS_SLOT]: savedPanelsSlot(view, current.global.scopeId) } : {};
      if (source === 'default') panelSlots.restore(id, panels); else panelSlots.apply(id, panels);
    };
    if (sameAddress) applySlots();
    if (!sameAddress && ownsDecision && source === 'default') {
      if (!stillCurrent()) return { ok: false, reason: 'unavailable' };
      if (!decision.materialize(result.href)) return fail('unavailable');
      applySlots();
      acceptDecision(decision, at, mine);
    } else if (!sameAddress) {
      const before = guard?.getRequest();
      let held = false;
      const moved = current.navigate(result.href, { replace: source === 'default', run: () => {
        if (!stillCurrent()) return false;
        applySlots();
        if (ownsDecision) acceptDecision(decision, at, mine);
        // The arrived address is rebuilt as the visible pairs, then the hidden ones (ADR-0105); the expected one must be in that order too.
        if (held) setArrivingSelection({ gen: at, mine, href: arrivalHref(result.next, current), entry: found });
        return true;
      } });
      if (!moved) {
        const request = guard?.getRequest();
        if (request) {
          held = true;
          if (request !== before) heldRequest.current = request;
          if (ownsDecision) initialWork.current = { initial: decision, gen: at, mine, phase: 'held', request };
          return { ok: false, reason: 'held' };
        }
        return fail('unavailable');
      }
    }
    setFresh({ gen: at, entry: found });
    setSelected(id);
    if (sameAddress) unchanged();
    return { ok: true, unsupported: result.unsupported, excludedByScope: result.excludedByScope };
  }, [enabled, support, blocked, gen, entryGen, store, anchor, clearSelection, setSelected, guard, mode, currentRevision, revision, slots, panelSlots, acceptDecision, settleDecision]);
  useEffect(() => {
    if (!initial) return;
    const alreadyDeciding = () => initialWork.current?.initial === initial && initialWork.current.gen === gen;
    if (alreadyDeciding()) return;
    if (!enabled) {
      // Read the committed fallback and support: their layout effects may have run since this render.
      if (waitingForContent || loadingNow?.current || resolveSavedViewSupport(menu, registry) !== undefined) return;
      settleDecision(initial, gen, intent.current);
      return;
    }
    const finish = (id: string | null) => {
      if (!alive.current || expiredInitial.current === initial || live.current.initial !== initial || live.current.gen !== gen || alreadyDeciding()) return;
      if (id === null) settleDecision(initial, gen, intent.current);
      else void apply(id, 'default');
    };
    if (readLists) {
      if (loaded?.tick === tick) finish(loaded.defaultId);
      return;
    }
    let cancelled = false;
    void readDefault().then(
      id => { if (!cancelled) finish(id); },
      // If the background lookup is unavailable, continue with the ordinary period fallback.
      () => { if (!cancelled) finish(null); },
    );
    return () => { cancelled = true; };
  }, [initial, gen, enabled, waitingForContent, loadingNow, loaded, tick, registry, menu, apply, rearmed, readLists, readDefault, settleDecision]);

  // Entering a screen: a selection that no longer matches the address is dropped (the address wins), then the personal default fills a bare route once.
  const panelScope = useRef(host.global.scopeId);
  useEffect(() => {
    if (!enabled || !support || blocked || loaded?.status !== 'ready') return;
    const arriving = entered.current !== entryGen;
    entered.current = entryGen;
    const scopeChanged = panelScope.current !== host.global.scopeId;
    panelScope.current = host.global.scopeId;
    const restorePanels = (view: RestorableEntry['view']) => {
      if (view.kind !== 'menu-view' || view.menuSchemaVersion !== support.menuSchemaVersion) return;
      // Re-entry still tracks the restored view id in the table slots, without supplying table values.
      slots?.restore(view.id, {});
      panelSlots?.restore(view.id, { [PANELS_SLOT]: savedPanelsSlot(view, host.global.scopeId) });
    };
    // Revalidated in the same screen: a selection the store no longer allows is dropped, an edited one stays.
    if (!arriving) {
      if (selectedId !== null && selected === null) clearSelection();
      // A Scope switch with the view still selected: the new Scope's screen gets the view's panels as they apply there, never the previous Scope's held sets (#2862 R2862C C1).
      else if (scopeChanged && selected !== null) restorePanels(selected.view);
      return;
    }
    const mismatch = selected !== null && differs(selected.view, support);
    if (selectedId !== null && (selected === null || mismatch)) clearSelection();
    else if (selected !== null) {
      // A reload keeps the selection through the address; the screen's panels come only from the view, so hand them over once.
      restorePanels(selected.view);
      return;
    }
    if (mode === 'legacy' && !explicitEntry && loaded.defaultId !== null) void apply(loaded.defaultId, 'default');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `differs` is rebuilt every render from `applied`/`anchor`, both listed
  }, [enabled, support, blocked, loaded, entryGen, rearmed, selected, selectedId, applied, anchor, apply, clearSelection, mode, explicitEntry, slots, panelSlots, host.global.scopeId]);
  // Back/Forward is an address arrival too: the arrived address wins over the selected view.
  // Fed by the Kernel's accepted-traversal signal, not the raw popstate: a Back the unsaved-edit guard cancelled (ADR-0115) is no arrival.
  const traversed = useRef(false);
  useEffect(() => { if (mode !== 'inactive') return guard?.onTraversal(() => { traversed.current = true; }); }, [guard, mode]);
  useEffect(() => {
    if (!traversed.current) return;
    traversed.current = false;
    if (selected && support && differs(selected.view, support)) clearSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `differs` is rebuilt every render from `applied`/`anchor`, both listed
  }, [host.appliedUrl, selected, support, applied, anchor, clearSelection]);

  const select = useCallback((id: string) => apply(id, 'selected'), [apply]);
  const saveAs = useCallback(async (input: SaveInput): Promise<SaveResult> => {
    if (!enabled || !support) return OFF;
    const at = gen;
    if (stale(at)) return OFF;
    if (paneId === null && collectSaveBlocks(panelSlots, slots).length > 0) return SAVE_BLOCKED;
    const captured = captureApplied(applied, support);
    const tables = { ...(selected?.view.kind === 'menu-view' ? selected.view.tables : undefined), ...slots?.capture<TableViewState>('tables') };
    // The Scope the content is saved in (#2175); with no current Scope nothing is recorded and the view reads as an old one.
    const scopeStamp = applied.global.scopeId !== null ? { savedScopeId: applied.global.scopeId } : {};
    const panels = panelSlots?.capture<MenuViewPanels | null>(PANELS_SLOT)[PANELS_SLOT];
    const draft = input.kind === 'condition-set'
      ? { schemaVersion: 1, kind: 'condition-set', name: input.name, context: captured.context, ...scopeStamp }
      : { schemaVersion: 1, kind: 'menu-view', name: input.name, menuId: support.menuId, menuSchemaVersion: support.menuSchemaVersion, context: captured.context, ...scopeStamp, page: captured.page, chartOptions: input.chartOptions ?? {}, layout: input.layout ?? null, panels: panels === undefined ? input.panels ?? null : panels, tables };
    const checked = validateSavedView(draft);
    if (!checked.ok) return checked;
    // Latest action wins: a save that finishes after another pick or save, or on another address, does not take the selection back.
    const mine = ++intent.current;
    const startUrl = live.current.host.appliedUrl;
    let result: Result<SavedViewEntry>;
    try { result = await store.save(checked.value as SavedViewDraft); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.host.appliedUrl === startUrl) { setFresh({ gen: at, entry: result.value }); setSelected(result.value.view.id); }
      refresh();
    }
    return result;
  }, [enabled, support, applied, store, gen, setSelected, refresh, slots, panelSlots, selected, paneId]);
  const saveToSelected = useCallback(async (): Promise<SaveResult> => {
    if (!enabled || !support || !selected) return OFF;
    const at = gen;
    if (stale(at)) return OFF;
    if (paneId === null && collectSaveBlocks(panelSlots, slots).length > 0) return SAVE_BLOCKED;
    ++intent.current;
    const mine = intent.current;
    const patch = overwritePatch(selected.view, captureApplied(applied, support), support, anchor, applied.global.scopeId, slots?.capture<TableViewState>('tables'));
    const panels = panelSlots?.capture<MenuViewPanels | null>(PANELS_SLOT)[PANELS_SLOT];
    // With no screen panels to capture the stored panels stay, except held sets saved in another Scope: they are saved as following here (#2862 R2862C C2).
    const inScope = selected.view.kind === 'menu-view' && !selected.view.panelsUnreadable ? panelsInScope(selected.view, applied.global.scopeId) : null;
    const panelsPatch = selected.view.kind !== 'menu-view' ? {} : panels !== undefined ? { panels } : inScope?.keys.length ? { panels: inScope.panels } : {};
    let result: Result<SavedViewEntry>;
    try { result = await store.update(selected.view.id, { ...patch, ...panelsPatch }, { expectedVersion: selected.view.version }); } catch { return OFF; }
    if (result.ok && !stale(at)) {
      if (intent.current === mine && live.current.selectedId === result.value.view.id) setFresh({ gen: at, entry: result.value });
      refresh();
    }
    // A write refused for its version rereads the list (06 §21.2): the selection and the applied conditions stay, and the next save goes at the version the store now holds.
    if (!result.ok && result.reason === 'conflict' && !stale(at)) refresh();
    return result;
  }, [enabled, support, selected, applied, anchor, store, gen, refresh, slots, panelSlots, paneId]);
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
    status, support: support ?? null, menuViews, conditionSets, defaultId, selected, state, unsupported, scopeExcluded, crossScopeSave, saveBlocked,
    select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, update, setVisibility, requestOfficial, decide, revoke, createGroup, updateGroup, refresh,
  }), [status, support, menuViews, conditionSets, defaultId, selected, state, unsupported, scopeExcluded, crossScopeSave, saveBlocked, select, clearSelection, saveAs, saveToSelected, revertToSaved, remove, setDefault, update, setVisibility, requestOfficial, decide, revoke, createGroup, updateGroup, refresh]);
}
const NOOP_SUBSCRIBE = () => () => {};
const ZERO_SNAPSHOT = () => 0;
const NO_LEAVE_REQUEST = () => null;
