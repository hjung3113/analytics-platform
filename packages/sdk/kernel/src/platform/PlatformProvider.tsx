import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortCache } from '../scope/selection-port-cache';
import { createBrowserLocation, type PlatformLocation } from '../context/location';
import { createPaletteFocus, useFocusGate } from '../context/paletteFocus';
import { createPageNavigation } from '../context/pageNavigation';
import type { MenuEntry, Registry } from '../registry/registry';
import { stripReturnToFromUrl } from '../links/return-to';
import { createRefreshEpochs } from '../query/refresh-epochs';
import { createQueryClient, invalidateEndpoints, removeOtherGenerations, startQueryEngine, type QueryEngine } from '../query/query-engine';
import type { EquipmentAxisDescriptor, ModuleScopedId, Permission, PlatformAdapter, QueryHistoryStore, SavedViewStore, SpaceDef, SpaceId } from '@ap/contracts';
import type { PlatformSlots, Recent, Toast, ToastOptions } from './types';
import { decodeFavorites, decodeRecent, decodeScopeId, readPreference, writePreference } from './preferences';
import { AppContext, OverlayContext, RecentContext, ToastsContext, type AppValue, type OverlayState, type UsageNavTrail } from './contexts';
import { MainScreenProvider } from './MainScreenProvider';
import { createSupportRegistry } from '../saved-view/useSavedViewSupport';

const NO_EQUIPMENT_AXES: readonly EquipmentAxisDescriptor[] = [];
const NO_SLOTS: PlatformSlots = {};
const browserLocation = createBrowserLocation();

function counterStore(adapter: PlatformAdapter) {
  let n = 0;
  return { subscribe: (listener: () => void) => adapter.subscribe(() => { n++; listener(); }), get: () => n };
}

/** Fallback tab-session id when sessionStorage is unavailable (privacy mode, tests). One per JS runtime. */
let fallbackUsageSession: string | null = null;
export function PlatformProvider({ adapter, registry, location = browserLocation, slots = NO_SLOTS, equipmentAxes = NO_EQUIPMENT_AXES, queryHistory, savedViews, spaceIdMigrations, children }: { spaceIdMigrations?: Readonly<Record<string, string>>; queryHistory?: QueryHistoryStore; savedViews?: SavedViewStore; equipmentAxes?: readonly EquipmentAxisDescriptor[]; location?: PlatformLocation; adapter: PlatformAdapter; registry: Registry; slots?: PlatformSlots; children: ReactNode }) {
  const { menuById } = registry;
  // The Registry never sees `equipmentAxes`, so a Condition preset naming an unknown axis surfaces here (06 §6.4, ADR-0083).
  for (const menu of registry.menus) {
    for (const preset of menu.conditionPresets ?? []) {
      const unknown = preset.axes.find(axisId => !equipmentAxes.some(axis => axis.id === axisId));
      if (unknown !== undefined) throw new Error(`Menu "${menu.id}" condition preset "${preset.id}" names axis "${unknown}", which equipmentAxes does not declare`);
    }
  }
  // Bound here so class-based adapters keep their receiver when React calls these.
  const sessionStore = useMemo(() => ({ subscribe: (l: () => void) => adapter.subscribe(l), get: () => adapter.session() }), [adapter]);
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const revisions = useMemo(() => counterStore(adapter), [adapter]);
  const revision = useSyncExternalStore(revisions.subscribe, revisions.get);
  // Created together: the store hears the engine from its first bump (a descendant's mount effect may bump before any Provider effect).
  const [{ refreshEpochs, queryClient }] = useState(() => {
    const queryClient = createQueryClient();
    return { queryClient, refreshEpochs: createRefreshEpochs(ids => invalidateEndpoints(queryClient, ids)) };
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `adapter`, `session` and `revision` are deliberate triggers: the cache is dropped and rebuilt when the server side changes
  const selectionPortCache = useMemo(() => createPortCache(), [adapter, session, revision]);
  const user = session.user;
  const userId = user.id;
  // `adapterEpoch` counts adapter swaps (ADR-0071 §5: the generation includes the adapter), adjusted during render so the new key is used at once.
  const [adapterEpoch, setAdapterEpoch] = useState({ adapter, epoch: 0 });
  let epoch = adapterEpoch.epoch;
  if (adapterEpoch.adapter !== adapter) {
    epoch++;
    setAdapterEpoch({ adapter, epoch });
  }
  const gen = `${epoch}:${revision}:${userId}`;
  const queryEngine = useMemo((): QueryEngine => ({ client: queryClient, gen }), [queryClient, gen]);
  useLayoutEffect(() => { removeOtherGenerations(queryClient, gen); }, [queryClient, gen]);
  useEffect(() => startQueryEngine(queryClient), [queryClient]);
  const [initialUrl] = useState(() => location.read() ?? '');
  const [{ pageNavigation, paletteFocus, switcherFocus }] = useState(() => {
    const paletteFocus = createPaletteFocus({ cancel: () => pageNavigation.cancel(), notify: () => pageNavigation.notify() });
    // Reopening the switcher must not cancel an arrival that is still resolving: it keeps its title focus.
    const switcherFocus = createPaletteFocus({ cancel: () => {}, notify: () => pageNavigation.notify() });
    const pageNavigation = createPageNavigation(initialUrl, () => paletteFocus.isBlocked() || switcherFocus.isBlocked(), registry.canonicalHref);
    return { pageNavigation, paletteFocus, switcherFocus };
  });
  const [favorites, setFavorites] = useState<string[]>(() => readPreference(`platform:favorites:${userId}`, decodeFavorites, []));
  const [recent, setRecent] = useState<Recent[]>(() => readPreference(`platform:recent:${userId}`, decodeRecent, []));
  const [lastScope, setLastScope] = useState<string | null>(() => readPreference(`platform:lastScope:${userId}`, decodeScopeId, null));
  // Tab-scoped usage session id (docs/05): sessionStorage, never localStorage — tabs must not share it.
  const [savedViewSupports] = useState(createSupportRegistry);
  const [usageSessionId] = useState(() => {
    try {
      const existing = sessionStorage.getItem('platform:usageSession');
      if (existing) return existing;
      const next = crypto.randomUUID();
      sessionStorage.setItem('platform:usageSession', next);
      return next;
    } catch {
      fallbackUsageSession ??= `usage-${Math.random().toString(36).slice(2)}`;
      return fallbackUsageSession;
    }
  });
  // Per-user state is swapped in the same render the session changes, so no frame shows another user's lists.
  const [loadedFor, setLoadedFor] = useState(userId);
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setFavorites(readPreference(`platform:favorites:${userId}`, decodeFavorites, []));
    setRecent(readPreference(`platform:recent:${userId}`, decodeRecent, []));
    setLastScope(readPreference(`platform:lastScope:${userId}`, decodeScopeId, null));
  }
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { open: paletteOpen, session: paletteSession, setOpen: setPaletteOpen } = useFocusGate(paletteFocus, session);
  const { open: switcherOpen, session: switcherSession, setOpen: setSwitcherOpen } = useFocusGate(switcherFocus, session);
  const toastId = useRef(1);

  // An auto-dismiss timer can outlive the provider (an unmount, a torn-down test DOM); it must not set state then.
  // A mounted flag, not clearTimeout in the cleanup: StrictMode's fake unmount would cancel the dismissal of a
  // toast raised during mount, and that toast would never close.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const durations = useRef(new Map<number, number>());
  const armToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    // An action toast without an explicit durationMs has no timer (Infinity): it stays until acted on or dismissed (06 Toast).
    if (!Number.isFinite(durations.current.get(id))) return;
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      durations.current.delete(id);
      if (mounted.current) setToasts(list => list.filter(t => t.id !== id));
    }, durations.current.get(id)));
  }, []);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', detail?: string, options?: ToastOptions) => {
    const id = toastId.current++;
    // Live ids are the duration keys (set here, deleted on expiry/dismiss); the cap drops all but the newest three.
    for (const old of [...durations.current.keys()].slice(0, -3)) {
      clearTimeout(timers.current.get(old));
      timers.current.delete(old);
      durations.current.delete(old);
    }
    setToasts(list => [...list.slice(-3), { id, text, tone, ...(detail === undefined ? {} : { detail }), ...(options?.action ? { action: options.action } : {}) }]);
    // An action toast stays by default: the user has to reach and read it first (06 Toast paragraph).
    durations.current.set(id, options?.durationMs ?? (options?.action ? Infinity : 5000));
    armToast(id);
    return id;
  }, [armToast]);
  const dismissToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    durations.current.delete(id);
    setToasts(list => list.filter(t => t.id !== id));
  }, []);
  const holdToast = useCallback((id: number, held: boolean) => {
    if (held) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    else if (durations.current.has(id)) armToast(id);
  }, [armToast]);

  const can = useCallback((p: Permission | ModuleScopedId) => user.permissions.includes(p), [user]);
  // Space entry gate (06 §9.1): a space without permission is open to every signed-in user.
  const canEnter = useCallback((space: SpaceDef) => !space.permission || can(space.permission), [can]);
  // A global utility menu skips space entry; a space menu still has to pass it.
  const enters = useCallback((menu: MenuEntry) => {
    const space = registry.spaceOf(menu);
    return space === null || canEnter(space);
  }, [registry, canEnter]);
  const canOpen = useCallback((menuId: string) => {
    const menu = menuById(menuId);
    return can(menu.permission) && enters(menu);
  }, [menuById, can, enters]);

  // Permission-visible menus grouped by their space; membership lives on the group, never the menu.
  const spaceMenus = useMemo(() => {
    const map = new Map<SpaceId, MenuEntry[]>();
    for (const space of registry.spaces) map.set(space.id, []);
    for (const m of registry.menus) {
      if (!can(m.permission)) continue;
      const space = registry.spaceOf(m);
      if (space === null) continue;
      const list = map.get(space.id);
      if (list) list.push(m);
    }
    return map;
  }, [registry, can]);
  const menusInSpace = useCallback((spaceId: SpaceId) => {
    const space = registry.spaces.find(s => s.id === spaceId);
    return space !== undefined && canEnter(space) ? spaceMenus.get(spaceId) ?? [] : [];
  }, [registry, canEnter, spaceMenus]);
  const accessibleSpaces = useMemo(
    () => registry.spaces.filter(s => canEnter(s) && (spaceMenus.get(s.id)?.length ?? 0) > 0),
    [registry, canEnter, spaceMenus],
  );
  const globalMenus = useMemo(
    () => registry.menus.filter(m => registry.spaceOf(m) === null && can(m.permission)),
    [registry, can],
  );

  const toggleFavorite = useCallback((menuId: string) => {
    setFavorites(list => {
      const next = list.includes(menuId) ? list.filter(id => id !== menuId) : [...list, menuId];
      writePreference(`platform:favorites:${userId}`, next);
      return next;
    });
  }, [userId]);

  // `readRecent` reads this ref: it follows the state in a layout effect and at once in `recordVisit` (never written during render).
  const recentRef = useRef(recent);
  useLayoutEffect(() => { recentRef.current = recent; }, [recent]);
  const readRecent = useCallback((): readonly Recent[] => recentRef.current, []);
  const recordVisit = useCallback((menuId: string, url: string) => {
    const next = [{ menuId, url: stripReturnToFromUrl(url), at: Date.now() }, ...recentRef.current.filter(r => r.menuId !== menuId)].slice(0, 12);
    recentRef.current = next;
    writePreference(`platform:recent:${userId}`, next);
    setRecent(next);
  }, [userId]);
  const rememberScope = useCallback((scopeId: string) => { setLastScope(scopeId); writePreference(`platform:lastScope:${userId}`, scopeId); }, [userId]);
  // Latest session user id, readable from a usage effect's cleanup at call time: a role switch
  // re-renders before the previous effect's cleanup runs, so the closure's own userId is stale there.
  const userIdRef = useRef(userId);
  const usageNav = useRef<UsageNavTrail>({ user: userId, via: null, seen: false, prev: null });
  // A layout effect: it must be current before the previous usage effect's passive cleanup reads it on a role switch.
  useLayoutEffect(() => {
    userIdRef.current = userId;
    // The identity boundary: a new session user starts the navigation trail over before any of their marks arrive.
    if (usageNav.current.user !== userId) usageNav.current = { user: userId, via: null, seen: false, prev: null };
  });

  const absoluteUrl = useCallback((next: string) => location.absoluteUrl(next), [location]);
  const defaultRangeTo = adapter.defaultRangeTo();

  const homeTodo = slots.homeTodo ?? null;
  const value = useMemo((): AppValue => ({
    pub: {
      registry, adapter, location, absoluteUrl, equipmentAxes, queryHistoryStore: queryHistory, savedViewStore: savedViews,
      session, user, revision, refreshEpochs, can, canOpen, globalMenus, menusInSpace, accessibleSpaces, lastScope, favorites, toggleFavorite, readRecent,
      toast, dismissToast, holdToast, defaultRangeTo, slots, homeTodo, setPaletteOpen, setSwitcherOpen,
    },
    internal: { currentRevision: revisions.get, selectionPortCache, queryEngine, enters, usageSessionId, savedViewSupports, userIdRef, usageNav, mainNavigation: pageNavigation, initialUrl, recordVisit, rememberScope, spaceIdMigrations },
  }), [registry, adapter, location, absoluteUrl, equipmentAxes, queryHistory, savedViews, session, user, revision, refreshEpochs, can, canOpen, globalMenus, menusInSpace, accessibleSpaces, lastScope, favorites, toggleFavorite, readRecent,
    toast, dismissToast, holdToast, defaultRangeTo, slots, homeTodo, setPaletteOpen, setSwitcherOpen, revisions, selectionPortCache, queryEngine, enters, usageSessionId, savedViewSupports, userIdRef, usageNav, pageNavigation, initialUrl, recordVisit, rememberScope, spaceIdMigrations]);
  const overlay = useMemo((): OverlayState => ({ paletteOpen, paletteSession, switcherOpen, switcherSession }), [paletteOpen, paletteSession, switcherOpen, switcherSession]);
  return (
    <AppContext.Provider value={value}>
      <ToastsContext.Provider value={toasts}>
        <OverlayContext.Provider value={overlay}>
          <RecentContext.Provider value={recent}>
            <MainScreenProvider app={value}>{children}</MainScreenProvider>
          </RecentContext.Provider>
        </OverlayContext.Provider>
      </ToastsContext.Provider>
    </AppContext.Provider>
  );
}
