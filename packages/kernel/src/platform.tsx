import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { classifyMetricInit, type MetricInit } from './metric-init';
import { pathFor, type MenuEntry, type Registry } from './registry';
import { useI18n } from './i18n';
import { buildQuery, ContractError, emptyGlobal, type GlobalContext, incompleteMetricPair, isAppRelativePath, type Pair, type ParsedQuery, parseQuery, type Permission, type PlatformAdapter, sameGlobal, type Session, type SessionUser, shift, type SpaceDef, type SpaceId, type Text, type UsageEvent } from '@ap/contracts';

export type ScopeState = { scopeId: string | null; status: 'none' | 'validating' | 'valid' | 'forbidden' | 'unknown_scope' | 'error'; validatedFor: Session | null; grantedRooms: string[] };
export type Recent = { menuId: string; url: string; at: number };
export type Toast = { id: number; text: string; tone: 'info' | 'warning' | 'danger' };
/** FeedbackOps entry the shell draws for one space. The shell picks the icon from `id` (ADR-0028). */
export type FeedbackOpsEntryId = 'voc-create' | 'voc' | 'task' | 'survey';
export type FeedbackOpsEntry = { id: FeedbackOpsEntryId; label: Text; href: string };
/**
 * Space-scoped FeedbackOps links. Absent until the app supplies a Managed System mapping
 * (ADR-0027, ADR-0028, #81, #251) — the shell then draws neither the block nor the rail link.
 */
export type FeedbackOpsSlot = {
  entriesFor: (spaceId: SpaceId) => readonly FeedbackOpsEntry[] | null;
  overall: { href: string } | null;
};
/**
 * Shell slots (docs/06 §8) the app fills at composition time, so platform components never import the shell.
 * contextBar: rendered by PlatformPage above page content. topBarTools: extra controls at the bottom of the app rail (today the mock dev tools).
 * feedbackOps: space-scoped entries and the overall link (ADR-0027, ADR-0028).
 */
export type PlatformSlots = { contextBar?: ReactNode; topBarTools?: ReactNode; feedbackOps?: FeedbackOpsSlot };
export type LinkOptions = { params?: Record<string, string>; page?: Record<string, string>; global?: Partial<GlobalContext>; returnTo?: boolean };
export type LinkResolution = {
  href: string;
  /** False when the signed-in user lacks the target's permission or, for a space menu, space entry. A global utility menu is permission only. Display only — never a permission proof. */
  allowed: boolean;
  /** Requested page keys the target menu does not register; they are not in `href`. */
  droppedPageKeys: string[];
};

type Platform = {
  registry: Registry;
  /** For platform layers (shell) that query the server directly; pages go through their own api seam. */
  adapter: PlatformAdapter;
  url: string;
  pathname: string;
  route: { menu: MenuEntry; params: Record<string, string> } | null;
  contractError: ContractError | null;
  metricInit: MetricInit;
  global: GlobalContext;
  page: Pair[];
  extras: Pair[];
  pageParam: (key: string) => string | null;
  navigate: (url: string, options?: { replace?: boolean }) => void;
  setGlobal: (patch: Partial<GlobalContext>, options?: { replace?: boolean; silent?: boolean }) => void;
  setPage: (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;
  resetContext: () => void;
  linkTo: (menuId: string, options?: LinkOptions) => string;
  /** `linkTo` plus what a menu needs to draw the link honestly: whether the user may open it and which page keys were dropped. */
  resolveLink: (menuId: string, options?: LinkOptions) => LinkResolution;
  /**
   * Reports a render failure the route error boundary contained and returns the correlation id to show
   * (06 §4). Fire-and-forget: a rejected or throwing adapter is swallowed. Only the matched route's
   * identity fields go out — no URL, Context value or stack.
   */
  reportError: (error: unknown) => string;
  returnTarget: () => string;
  /** Accepted `returnTo`: that menu's label and its leading drill values. Otherwise the parent (or home) and an empty trail. `href` equals `returnTarget()` (06 §22, ADR-0025). */
  returnOrigin: () => ReturnOrigin;
  session: Session;
  user: SessionUser;
  /** Bumps whenever the adapter announces a change; part of every query identity. */
  revision: number;
  can: (permission: Permission) => boolean;
  /** Menus of the sidebar space the user may enter: menu permission ∧ space entry (06 §9.1). Empty when sidebarSpace is null. */
  visibleMenus: MenuEntry[];
  /** Permission-granted menus of global utility groups. Includes navHidden, the same inclusion as visibleMenus. */
  globalMenus: MenuEntry[];
  /** Menus of one space with granted permission; [] when the space is unknown or entry is denied. */
  menusInSpace: (spaceId: SpaceId) => MenuEntry[];
  /** Registration order; enterable and with at least one permission-visible menu. Global menus are not included. */
  accessibleSpaces: readonly SpaceDef[];
  /** The matched route's space — even when entry is denied; null on unmatched routes and on global-utility menus. */
  currentSpace: SpaceDef | null;
  /** currentSpace when accessible, else the first accessible space, else null. Throws only when the registry declares no spaces. */
  sidebarSpace: SpaceDef | null;
  /** Last admitted URL in this tab for a space, re-validated on every read. Null when missing or rejected. */
  spaceResume: (spaceId: SpaceId) => { menuId: string; href: string } | null;
  /** No-op when spaceId is the current space or not accessible; else push the resumed URL or the space home. */
  switchSpace: (spaceId: SpaceId) => void;
  scope: ScopeState;
  /** Re-runs Scope validation for the requested scope after an `error` (no automatic retry in the Kernel, #167). */
  retryScope: () => void;
  lastScope: string | null;
  favorites: string[];
  toggleFavorite: (menuId: string) => void;
  recent: Recent[];
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  defaultRangeTo: string;
  slots: PlatformSlots;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

const PlatformContext = createContext<Platform | null>(null);

/** Where a destination's return control goes, including the origin menu name and drill trail (06 §22, ADR-0025). */
export type ReturnOrigin = {
  href: string;
  menuLabel: Text;
  trail: { label: Text; value: string }[];
};

/** Leading drill values on `search`, stopping at the first missing step. A menu without `drill` contributes nothing. */
function consecutiveDrillTrail(menu: MenuEntry, search: string): { label: Text; value: string }[] {
  const levels = menu.drill?.levels ?? [];
  if (levels.length === 0) return [];
  let page: Pair[];
  try { page = parseQuery(search, menu.pageKeys).page; } catch { return []; }
  const values = new Map(page);
  const trail: { label: Text; value: string }[] = [];
  for (const level of levels) {
    const value = values.get(level.key);
    if (value === undefined || value === '') break;
    trail.push({ label: level.label, value });
  }
  return trail;
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory-only */ }
}

function spaceLastKey(userId: string) {
  return `platform:space-last:${userId}`;
}

/** String entries only. Bad JSON or a non-object starts from {}. Never throws. */
function readSpaceLast(userId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(spaceLastKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSpaceLast(userId: string, spaceId: string, url: string) {
  try {
    const next = readSpaceLast(userId);
    next[spaceId] = url;
    sessionStorage.setItem(spaceLastKey(userId), JSON.stringify(next));
  } catch { /* memory-only */ }
}

function currentUrl() { return window.location.pathname + window.location.search; }

function counterStore(adapter: PlatformAdapter) {
  let n = 0;
  return { subscribe: (listener: () => void) => adapter.subscribe(() => { n++; listener(); }), get: () => n };
}

/** Fallback tab-session id when sessionStorage is unavailable (privacy mode, tests). One per JS runtime. */
let fallbackUsageSession: string | null = null;

export function PlatformProvider({ adapter, registry, slots = {}, children }: { adapter: PlatformAdapter; registry: Registry; slots?: PlatformSlots; children: ReactNode }) {
  const { matchRoute, menuById, safeReturnTo } = registry;
  // Bound here so class-based adapters keep their receiver when React calls these.
  const sessionStore = useMemo(() => ({ subscribe: (l: () => void) => adapter.subscribe(l), get: () => adapter.session() }), [adapter]);
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const revisions = useMemo(() => counterStore(adapter), [adapter]);
  const revision = useSyncExternalStore(revisions.subscribe, revisions.get);
  const user = session.user;
  const userId = user.id;
  const [url, setUrl] = useState(currentUrl);
  const [favorites, setFavorites] = useState<string[]>(() => read(`platform:favorites:${userId}`, [] as string[]));
  const [recent, setRecent] = useState<Recent[]>(() => read(`platform:recent:${userId}`, [] as Recent[]));
  const [lastScope, setLastScope] = useState<string | null>(() => read<string | null>(`platform:lastScope:${userId}`, null));
  // Tab-scoped usage session id (docs/05): sessionStorage, never localStorage — tabs must not share it.
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
    setFavorites(read(`platform:favorites:${userId}`, []));
    setRecent(read(`platform:recent:${userId}`, []));
    setLastScope(read(`platform:lastScope:${userId}`, null));
  }
  const [scope, setScope] = useState<ScopeState>(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('scopeId');
      if (id) return { scopeId: id, status: 'validating', validatedFor: session, grantedRooms: [] };
    } catch { /* keep none */ }
    return { scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] };
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toastId = useRef(1);
  const { lang } = useI18n();

  useEffect(() => {
    const onPop = () => setUrl(currentUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const pathname = url.split('?')[0] || '/';
  const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const route = useMemo(() => matchRoute(pathname), [matchRoute, pathname]);
  const { parsed, contractError } = useMemo((): { parsed: ParsedQuery | null; contractError: ContractError | null } => {
    try { return { parsed: parseQuery(search, route?.menu.pageKeys ?? []), contractError: null }; } catch (e) {
      if (e instanceof ContractError) return { parsed: null, contractError: e };
      throw e;
    }
  }, [search, route]);
  const global = parsed?.global ?? emptyGlobal;
  const pairError = contractError ? null : incompleteMetricPair(route?.menu ?? null, global.metricId, global.metricVersion);
  const routeContractError = contractError ?? pairError;
  const metricInit = classifyMetricInit(adapter.publishedMetrics(), route?.menu.initializesMetric === true, global.metricId, global.metricVersion);
  const page = parsed?.page ?? [];
  const extras = parsed?.extras ?? [];

  const navigate = useCallback((next: string, options?: { replace?: boolean }) => {
    if (!isAppRelativePath(next)) return;
    if (next === currentUrl()) return;
    if (options?.replace) window.history.replaceState(null, '', next); else window.history.pushState(null, '', next);
    setUrl(currentUrl());
    if (!options?.replace) document.getElementById('platform-main')?.scrollTo({ top: 0 });
  }, []);

  // An auto-dismiss timer can outlive the provider (an unmount, a torn-down test DOM); it must not set state then.
  // A mounted flag, not clearTimeout in the cleanup: StrictMode's fake unmount would cancel the dismissal of a
  // toast raised during mount, and that toast would never close.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = toastId.current++;
    setToasts(list => [...list.slice(-3), { id, text, tone }]);
    setTimeout(() => { if (mounted.current) setToasts(list => list.filter(t => t.id !== id)); }, 5000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);

  // A deliberate global-Context change drops the manifest's contextResetKeys (e.g. the result-set page index)
  // from the page pairs in the SAME navigation — one history entry, so Back returns to the pre-change URL
  // exactly (06 §6.4). History traversal (popstate, navigate) and no-op setGlobal calls never drop anything.
  const dropContextResetKeys = useCallback((pairs: Pair[], next: GlobalContext): Pair[] => {
    const keys = route?.menu.contextResetKeys;
    if (!keys || keys.length === 0 || sameGlobal(global, next)) return pairs;
    return pairs.filter(([k]) => !keys.includes(k));
  }, [route, global]);

  const setGlobal = useCallback((patch: Partial<GlobalContext>, options?: { replace?: boolean; silent?: boolean }) => {
    let next: GlobalContext = { ...global, ...patch };
    if ('scopeId' in patch && patch.scopeId !== global.scopeId) {
      // Site is a DB boundary (ADR-0004): site-bound sets are cleared explicitly, never re-mapped.
      const had = global.roomNames !== null || global.condition !== null || global.selection !== null || global.lotIds !== null || global.recipeIds !== null || global.ppid !== null;
      next = { ...next, roomNames: null, condition: null, selection: null, lotIds: null, recipeIds: null, ppid: null };
      if (had && !options?.silent) toast(lang === 'ko' ? 'Scope 변경: room_name·설비 조건·선택·Lot·Recipe를 초기화했습니다 (Site 경계).' : 'Scope changed: room_name, condition, selection, Lot and Recipe were cleared (site boundary).', 'warning');
    }
    navigate(pathname + buildQuery(next, dropContextResetKeys(page, next), extras), options);
  }, [global, page, extras, pathname, navigate, toast, lang, dropContextResetKeys]);

  const setPage = useCallback((patch: Record<string, string | null>, options?: { replace?: boolean }) => {
    const keys = Object.keys(patch);
    const kept = page.filter(([k]) => !keys.includes(k));
    const added = Object.entries(patch).filter((e): e is [string, string] => e[1] !== null && e[1] !== '');
    navigate(pathname + buildQuery(global, [...kept, ...added], extras), options);
  }, [global, page, extras, pathname, navigate]);

  // Reset clears analysis Context but keeps the requested Scope (a separate header control).
  const resetContext = useCallback(() => {
    const next: GlobalContext = { ...emptyGlobal, scopeId: global.scopeId };
    navigate(pathname + buildQuery(next, dropContextResetKeys(page, next), extras));
  }, [pathname, navigate, global, page, extras, dropContextResetKeys]);

  const can = useCallback((p: Permission) => user.permissions.includes(p), [user]);
  // Space entry gate (06 §9.1): a space without permission is open to every signed-in user.
  const canEnter = useCallback((space: SpaceDef) => !space.permission || can(space.permission), [can]);
  // A global utility menu skips space entry; a space menu still has to pass it.
  const enters = useCallback((menu: MenuEntry) => {
    const space = registry.spaceOf(menu);
    return space === null || canEnter(space);
  }, [registry, canEnter]);

  // Context Link helper (§22/§6.4): every registered global is preserved regardless of target support;
  // page-owned state and unregistered extras are never copied implicitly. Changing the site applies the same
  // site boundary as setGlobal (ADR-0004) to the values carried over from the current URL — values the caller
  // passes explicitly are meant for the destination and stay. `allowed` is a display hint (permission, plus
  // space entry for a space menu — a global utility menu is permission only, 06 §9.1); the server re-checks on arrival.
  const resolveLink = useCallback((menuId: string, options: LinkOptions = {}): LinkResolution => {
    const target = menuById(menuId);
    const carried: GlobalContext = options.global && 'scopeId' in options.global && options.global.scopeId !== global.scopeId
      ? { ...global, roomNames: null, condition: null, selection: null, lotIds: null, recipeIds: null, ppid: null }
      : global;
    const g = { ...carried, ...options.global };
    const requested = Object.entries(options.page ?? {});
    const pagePairs: Pair[] = requested.filter(([k]) => target.pageKeys.includes(k));
    if (options.returnTo && target.pageKeys.includes('returnTo')) pagePairs.push(['returnTo', url]);
    return {
      href: pathFor(target, options.params) + buildQuery(g, pagePairs),
      allowed: can(target.permission) && enters(target),
      droppedPageKeys: requested.map(([k]) => k).filter(k => !target.pageKeys.includes(k)),
    };
  }, [global, url, menuById, can, enters]);
  const linkTo = useCallback((menuId: string, options: LinkOptions = {}) => resolveLink(menuId, options).href, [resolveLink]);
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
  const currentSpace = useMemo(() => (route ? registry.spaceOf(route.menu) : null), [registry, route]);
  const sidebarSpace = useMemo((): SpaceDef | null => {
    if (registry.spaces.length === 0) throw new Error('registry declares no spaces');
    if (currentSpace !== null && accessibleSpaces.some(s => s.id === currentSpace.id)) return currentSpace;
    return accessibleSpaces[0] ?? null;
  }, [currentSpace, accessibleSpaces, registry]);
  const visibleMenus = useMemo(() => (sidebarSpace === null ? [] : menusInSpace(sidebarSpace.id)), [menusInSpace, sidebarSpace]);
  const globalMenus = useMemo(
    () => registry.menus.filter(m => registry.spaceOf(m) === null && can(m.permission)),
    [registry, can],
  );
  // Read at call time. Stored globals are not restored: resolveLink carries the current global and the menu's page keys only.
  const spaceResume = useCallback((spaceId: SpaceId): { menuId: string; href: string } | null => {
    const stored = readSpaceLast(userId)[spaceId];
    if (typeof stored !== 'string' || !isAppRelativePath(stored)) return null;
    const q = stored.indexOf('?');
    const path = q === -1 ? stored : stored.slice(0, q);
    const search = q === -1 ? '' : stored.slice(q);
    const matched = matchRoute(path);
    if (!matched) return null;
    if (registry.spaceOf(matched.menu)?.id !== spaceId) return null;
    if (!can(matched.menu.permission) || !enters(matched.menu)) return null;
    let parsed: ParsedQuery;
    try { parsed = parseQuery(search, matched.menu.pageKeys); } catch { return null; }
    if (incompleteMetricPair(matched.menu, parsed.global.metricId, parsed.global.metricVersion)) return null;
    const page: Record<string, string> = {};
    for (const [key, value] of parsed.page) page[key] = value;
    return { menuId: matched.menu.id, href: resolveLink(matched.menu.id, { params: matched.params, page }).href };
  }, [userId, matchRoute, registry, can, enters, resolveLink]);
  // Reselecting the current space never sends the user home; non-accessible targets keep the URL.
  const switchSpace = useCallback((spaceId: SpaceId) => {
    if (currentSpace?.id === spaceId) return;
    const target = accessibleSpaces.find(s => s.id === spaceId);
    if (!target) return;
    navigate(spaceResume(spaceId)?.href ?? linkTo(target.homeMenuId));
  }, [currentSpace, accessibleSpaces, spaceResume, linkTo, navigate]);

  const toggleFavorite = useCallback((menuId: string) => {
    setFavorites(list => {
      const next = list.includes(menuId) ? list.filter(id => id !== menuId) : [...list, menuId];
      write(`platform:favorites:${userId}`, next);
      return next;
    });
  }, [userId]);

  const [scopeRetry, setScopeRetry] = useState(0);
  const retryScope = useCallback(() => setScopeRetry(n => n + 1), []);
  // Scope is re-validated on every change of requested scope or session (§6.2); URL is never proof.
  useEffect(() => {
    const scopeId = global.scopeId;
    if (!scopeId) { setScope({ scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] }); return; }
    const controller = new AbortController();
    setScope({ scopeId, status: 'validating', validatedFor: session, grantedRooms: [] });
    adapter.validateScope(scopeId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setScope({ scopeId, status: result.status, validatedFor: session, grantedRooms: result.grantedRooms });
      if (result.status === 'valid') { setLastScope(scopeId); write(`platform:lastScope:${userId}`, scopeId); }
    }).catch(() => {
      // Only the Kernel's own abort means superseded; any other rejection (even an adapter-internal AbortError) is `error` until retry (#167).
      if (controller.signal.aborted) return;
      setScope({ scopeId, status: 'error', validatedFor: session, grantedRooms: [] });
    });
    return () => controller.abort();
  }, [global.scopeId, session, userId, adapter, scopeRetry]);

  // A Scope switch — or a session-only change (role switch, re-login) that leaves the scopeId alone — renders
  // once before the validation effect runs, and in that frame `scope` still describes the previous Scope or the
  // previous session. The mask is exactly the value the effect will set next — never the previous Scope's
  // error/forbidden/unknown_scope/valid, id, or grantedRooms, and never the previous session's `valid` (#183, #186).
  const scopeMasked = scope.scopeId !== global.scopeId || scope.validatedFor !== session;
  const scopeView: ScopeState = scopeMasked
    ? global.scopeId === null
      ? { scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] }
      : { scopeId: global.scopeId, status: 'validating', validatedFor: session, grantedRooms: [] }
    : scope;

  // Materialize the default period once for time-applying menus (§6.3/§6.4): absolute from/to written into the URL.
  // The initial Δ (24h here) is an Open decision; this prototype uses the 1-day preset as a Candidate.
  const defaultRangeTo = adapter.defaultRangeTo();
  useEffect(() => {
    if (!route || routeContractError || route.menu.context.time !== 'apply' || global.from !== null) return;
    navigate(pathname + buildQuery({ ...global, from: shift(defaultRangeTo, -24), to: defaultRangeTo }, page, extras), { replace: true });
  }, [route, routeContractError, global, page, extras, pathname, navigate, defaultRangeTo]);

  useEffect(() => {
    if (!route || routeContractError || metricInit.phase !== 'confirm') return;
    navigate(pathname + buildQuery({ ...global, metricVersion: metricInit.metricVersion }, page, extras), { replace: true });
  }, [route, routeContractError, metricInit, global, page, extras, pathname, navigate]);

  // Recent visits + usage instrumentation (kernel observability of its own registry).
  useEffect(() => {
    if (!route || routeContractError || !can(route.menu.permission)) return;
    if (!enters(route.menu)) return;
    const menuId = route.menu.id;
    const space = registry.spaceOf(route.menu);
    if (space !== null) writeSpaceLast(userId, space.id, url);
    setRecent(list => {
      const next = [{ menuId, url, at: Date.now() }, ...list.filter(r => r.menuId !== menuId)].slice(0, 12);
      write(`platform:recent:${userId}`, next);
      return next;
    });
  }, [url, route, routeContractError, userId, can, enters, registry]);
  // Usage events (docs/05 메뉴 활용률 계측): one `entry` per admitted stay and a `dwell` on leave, sent
  // fire-and-forget through the adapter — no await, no abort signal, failures are silent, navigation never
  // blocks. Admission is `${userId}\0${menu.id}\0${pathname}` and requires the menu gate; a space menu also
  // needs space entry, while a global utility menu does not (06 §9.1). Query-only changes (setGlobal/setPage,
  // default-period replace) never re-admit. `path` is the manifest route pattern, never the concrete pathname,
  // search or Context values.
  // Latest session user id, readable from the usage effect's cleanup at call time: a role switch
  // re-renders before the previous effect's cleanup runs, so the closure's own userId is stale there.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const lastAdmitted = useRef<string | null>(null);
  useEffect(() => {
    if (!route || routeContractError || !can(route.menu.permission) || !enters(route.menu)) return;
    const admitKey = `${userId}\0${route.menu.id}\0${pathname}`;
    if (lastAdmitted.current === admitKey) return;
    lastAdmitted.current = admitKey;
    const admitUser = userId;
    const menu = route.menu;
    const spaceId = registry.spaceOf(menu)?.id ?? null;
    let enteredAt: number | null = null;
    // Fire-and-forget twice over: a rejected promise and a sync throw both die here — telemetry never
    // surfaces an unhandled rejection and never breaks the navigation that triggered it (docs/05).
    const record = (event: UsageEvent) => {
      try {
        void adapter.recordUsage([event]).catch(() => { /* silent */ });
      } catch { /* silent */ }
    };
    const sendDwell = () => {
      if (enteredAt === null) return;
      // Role switch mid-stay: the dwell would be stamped with the *new* session user at the server, so
      // the old stay is dropped rather than billed to the wrong user.
      if (userIdRef.current !== admitUser) return;
      record({ name: 'dwell', menuId: menu.id, spaceId, path: menu.path, at: Date.now(), sessionId: usageSessionId, dwellMs: Math.max(0, Date.now() - enteredAt), enteredAt });
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') sendDwell(); };
    // setTimeout(0) keeps StrictMode's fake first mount silent: its cleanup clears the timer, so neither an
    // entry nor a dwell is emitted for a stay that never really started. If the session user changed before
    // it fired, the old user's stay never started either.
    const timer = setTimeout(() => {
      if (userIdRef.current !== admitUser) return;
      enteredAt = Date.now();
      record({ name: 'entry', menuId: menu.id, spaceId, path: menu.path, at: enteredAt, sessionId: usageSessionId });
      document.addEventListener('visibilitychange', onHidden);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHidden);
      lastAdmitted.current = null;
      sendDwell();
    };
  }, [route, routeContractError, pathname, userId, can, enters, registry, adapter, usageSessionId]);

  const pageParam = useCallback((key: string) => page.find(([k]) => k === key)?.[1] ?? null, [page]);
  const returnTarget = useCallback(() => {
    const safe = safeReturnTo(pageParam('returnTo'));
    if (safe) return safe;
    return linkTo(route?.menu.parent ?? 'home');
  }, [pageParam, route, linkTo, safeReturnTo]);

  const returnOrigin = useCallback((): ReturnOrigin => {
    const href = returnTarget();
    const safe = safeReturnTo(pageParam('returnTo'));
    if (safe) {
      const q = safe.indexOf('?');
      const path = q === -1 ? safe : safe.slice(0, q);
      const search = q === -1 ? '' : safe.slice(q);
      const matched = matchRoute(path);
      if (matched) return { href, menuLabel: matched.menu.label, trail: consecutiveDrillTrail(matched.menu, search) };
    }
    return { href, menuLabel: menuById(route?.menu.parent ?? 'home').label, trail: [] };
  }, [returnTarget, pageParam, safeReturnTo, matchRoute, route, menuById]);

  const reportError = useCallback((error: unknown): string => {
    const correlationId = `client-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
    if (!route) return correlationId;
    try {
      // Only an identifier-shaped Error.name leaves the client; the message is free text and stays out (see ClientErrorReport).
      const rawName = error instanceof Error ? error.name : '';
      const name = typeof rawName === 'string' && /^[A-Za-z_$][\w$]{0,79}$/.test(rawName) ? rawName : 'Error';
      void adapter.reportClientError({
        correlationId, menuId: route.menu.id, spaceId: registry.spaceOf(route.menu)?.id ?? null, path: route.menu.path, name,
      }).catch(() => { /* silent */ });
    } catch { /* silent */ }
    return correlationId;
  }, [adapter, registry, route]);

  const value: Platform = {
    registry, adapter, url, pathname, route, contractError: routeContractError, metricInit, global, page, extras, pageParam, navigate, setGlobal, setPage, resetContext, linkTo, resolveLink, reportError, returnTarget, returnOrigin,
    session, user, revision, can, visibleMenus, globalMenus, menusInSpace, accessibleSpaces, currentSpace, sidebarSpace, spaceResume, switchSpace, scope: scopeView, retryScope, lastScope, favorites, toggleFavorite, recent,
    toasts, toast, dismissToast, defaultRangeTo, slots, paletteOpen, setPaletteOpen,
  };
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): Platform {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform outside PlatformProvider');
  return value;
}

/** Anchor that navigates through the kernel (keeps modifier-click/open-in-new-tab behavior). */
export function PlatformLink({ href, children, className, onNavigate, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void }) {
  const { navigate } = usePlatform();
  return <a href={href} className={className} {...rest} onClick={e => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
    onNavigate?.();
  }}>{children}</a>;
}
