import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_RANGE_TO, USERS, classifyMetricInit, type MetricInit, type RoleId, type User } from '../mock/world';
import { getScenario, setScenario, subscribeScenario, validateScope, type Scenario } from '../mock/server';
import { MENUS, matchRoute, menuById, pathFor, type MenuEntry, safeReturnTo } from './registry';
import { useI18n } from './i18n';
import { buildQuery, ContractError, emptyGlobal, type GlobalContext, incompleteMetricPair, isAppRelativePath, type Pair, type ParsedQuery, parseQuery, type Permission, shift } from '@ap/contracts';

export type ScopeState = { scopeId: string | null; status: 'none' | 'validating' | 'valid' | 'forbidden' | 'unknown_scope'; grantedRooms: string[] };
export type Recent = { menuId: string; url: string; at: number };
export type Toast = { id: number; text: string; tone: 'info' | 'warning' | 'danger' };
export type LinkOptions = { params?: Record<string, string>; page?: Record<string, string>; global?: Partial<GlobalContext>; returnTo?: boolean };

type Platform = {
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
  returnTarget: () => string;
  user: User;
  role: RoleId;
  setRole: (role: RoleId) => void;
  can: (permission: Permission) => boolean;
  visibleMenus: MenuEntry[];
  scope: ScopeState;
  lastScope: string | null;
  favorites: string[];
  toggleFavorite: (menuId: string) => void;
  recent: Recent[];
  usage: Record<string, number>;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  defaultRangeTo: string;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

const PlatformContext = createContext<Platform | null>(null);

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory-only */ }
}

function currentUrl() { return window.location.pathname + window.location.search; }

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState(currentUrl);
  const [role, setRoleState] = useState<RoleId>(() => read<RoleId>('platform:role', 'engineer'));
  const [favorites, setFavorites] = useState<string[]>(() => read(`platform:favorites:${role}`, [] as string[]));
  const [recent, setRecent] = useState<Recent[]>(() => read(`platform:recent:${role}`, [] as Recent[]));
  const [usage, setUsage] = useState<Record<string, number>>(() => read('platform:usage', {} as Record<string, number>));
  const [lastScope, setLastScope] = useState<string | null>(() => read<string | null>(`platform:lastScope:${role}`, null));
  const [scope, setScope] = useState<ScopeState>(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('scopeId');
      if (id) return { scopeId: id, status: 'validating', grantedRooms: [] };
    } catch { /* keep none */ }
    return { scopeId: null, status: 'none', grantedRooms: [] };
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const scenario = useSyncExternalStore(subscribeScenario, getScenario);
  const toastId = useRef(1);
  const { lang } = useI18n();

  useEffect(() => {
    const onPop = () => setUrl(currentUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const pathname = url.split('?')[0] || '/';
  const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const route = useMemo(() => matchRoute(pathname), [pathname]);
  const { parsed, contractError } = useMemo((): { parsed: ParsedQuery | null; contractError: ContractError | null } => {
    try { return { parsed: parseQuery(search, route?.menu.pageKeys ?? []), contractError: null }; } catch (e) {
      if (e instanceof ContractError) return { parsed: null, contractError: e };
      throw e;
    }
  }, [search, route]);
  const global = parsed?.global ?? emptyGlobal;
  const pairError = contractError ? null : incompleteMetricPair(route?.menu ?? null, global.metricId, global.metricVersion);
  const routeContractError = contractError ?? pairError;
  const metricInit = classifyMetricInit(route?.menu.initializesMetric === true, global.metricId, global.metricVersion);
  const page = parsed?.page ?? [];
  const extras = parsed?.extras ?? [];

  const navigate = useCallback((next: string, options?: { replace?: boolean }) => {
    if (!isAppRelativePath(next)) return;
    if (next === currentUrl()) return;
    if (options?.replace) window.history.replaceState(null, '', next); else window.history.pushState(null, '', next);
    setUrl(currentUrl());
    if (!options?.replace) document.getElementById('platform-main')?.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = toastId.current++;
    setToasts(list => [...list.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);

  const setGlobal = useCallback((patch: Partial<GlobalContext>, options?: { replace?: boolean; silent?: boolean }) => {
    let next: GlobalContext = { ...global, ...patch };
    if ('scopeId' in patch && patch.scopeId !== global.scopeId) {
      // Site is a DB boundary (ADR-0004): site-bound sets are cleared explicitly, never re-mapped.
      const had = global.roomNames !== null || global.condition !== null || global.selection !== null || global.lotIds !== null || global.recipeIds !== null || global.ppid !== null;
      next = { ...next, roomNames: null, condition: null, selection: null, lotIds: null, recipeIds: null, ppid: null };
      if (had && !options?.silent) toast(lang === 'ko' ? 'Scope 변경: room_name·설비 조건·선택·Lot·Recipe를 초기화했습니다 (Site 경계).' : 'Scope changed: room_name, condition, selection, Lot and Recipe were cleared (site boundary).', 'warning');
    }
    navigate(pathname + buildQuery(next, page, extras), options);
  }, [global, page, extras, pathname, navigate, toast, lang]);

  const setPage = useCallback((patch: Record<string, string | null>, options?: { replace?: boolean }) => {
    const keys = Object.keys(patch);
    const kept = page.filter(([k]) => !keys.includes(k));
    const added = Object.entries(patch).filter((e): e is [string, string] => e[1] !== null && e[1] !== '');
    navigate(pathname + buildQuery(global, [...kept, ...added], extras), options);
  }, [global, page, extras, pathname, navigate]);

  // Reset clears analysis Context but keeps the requested Scope (a separate header control).
  const resetContext = useCallback(
    () => navigate(pathname + buildQuery({ ...emptyGlobal, scopeId: global.scopeId }, page, extras)),
    [pathname, navigate, global.scopeId, page, extras],
  );

  // Context Link helper (§22/§6.4): every registered global is preserved regardless of target support;
  // page-owned state and unregistered extras are never copied implicitly.
  const linkTo = useCallback((menuId: string, options: LinkOptions = {}) => {
    const target = menuById(menuId);
    const g = { ...global, ...options.global };
    const pagePairs: Pair[] = Object.entries(options.page ?? {}).filter(([k]) => target.pageKeys.includes(k));
    if (options.returnTo && target.pageKeys.includes('returnTo')) pagePairs.push(['returnTo', url]);
    return pathFor(target, options.params) + buildQuery(g, pagePairs);
  }, [global, url]);

  const user = USERS[role];
  const can = useCallback((p: Permission) => user.permissions.includes(p), [user]);
  const visibleMenus = useMemo(() => MENUS.filter(m => can(m.permission)), [can]);

  const setRole = useCallback((next: RoleId) => {
    setRoleState(next);
    write('platform:role', next);
    setFavorites(read(`platform:favorites:${next}`, []));
    setRecent(read(`platform:recent:${next}`, []));
    setLastScope(read(`platform:lastScope:${next}`, null));
    toast(lang === 'ko' ? `역할 전환: ${USERS[next].title.ko} — 권한·Scope를 다시 검증합니다.` : `Role switched: ${USERS[next].title.en} — permissions and scope re-validated.`, 'info');
  }, [toast, lang]);

  const toggleFavorite = useCallback((menuId: string) => {
    setFavorites(list => {
      const next = list.includes(menuId) ? list.filter(id => id !== menuId) : [...list, menuId];
      write(`platform:favorites:${role}`, next);
      return next;
    });
  }, [role]);

  // Scope is re-validated on every change of requested scope or identity (§6.2); URL is never proof.
  useEffect(() => {
    const scopeId = global.scopeId;
    if (!scopeId) { setScope({ scopeId: null, status: 'none', grantedRooms: [] }); return; }
    const controller = new AbortController();
    setScope({ scopeId, status: 'validating', grantedRooms: [] });
    validateScope(role, scopeId, controller.signal).then(result => {
      setScope({ scopeId, status: result.status, grantedRooms: result.grantedRooms });
      if (result.status === 'valid') { setLastScope(scopeId); write(`platform:lastScope:${role}`, scopeId); }
    }).catch(() => { /* superseded */ });
    return () => controller.abort();
  }, [global.scopeId, role]);

  // Materialize the default period once for time-applying menus (§6.3/§6.4): absolute from/to written into the URL.
  // The initial Δ (24h here) is an Open decision; this prototype uses the 1-day preset as a Candidate.
  useEffect(() => {
    if (!route || routeContractError || route.menu.context.time !== 'apply' || global.from !== null) return;
    navigate(pathname + buildQuery({ ...global, from: shift(DEFAULT_RANGE_TO, -24), to: DEFAULT_RANGE_TO }, page, extras), { replace: true });
  }, [route, routeContractError, global, page, extras, pathname, navigate]);

  useEffect(() => {
    if (!route || routeContractError || metricInit.phase !== 'confirm') return;
    navigate(pathname + buildQuery({ ...global, metricVersion: metricInit.metricVersion }, page, extras), { replace: true });
  }, [route, routeContractError, metricInit, global, page, extras, pathname, navigate]);

  // Recent visits + usage instrumentation (kernel observability of its own registry).
  useEffect(() => {
    if (!route || routeContractError || !can(route.menu.permission)) return;
    const menuId = route.menu.id;
    setRecent(list => {
      const next = [{ menuId, url, at: Date.now() }, ...list.filter(r => r.menuId !== menuId)].slice(0, 12);
      write(`platform:recent:${role}`, next);
      return next;
    });
  }, [url, route, routeContractError, role, can]);
  const lastCounted = useRef<string | null>(null);
  useEffect(() => {
    if (!route || lastCounted.current === route.menu.id + pathname) return;
    lastCounted.current = route.menu.id + pathname;
    setUsage(u => { const next = { ...u, [route.menu.id]: (u[route.menu.id] ?? 0) + 1 }; write('platform:usage', next); return next; });
  }, [route, pathname]);

  const pageParam = useCallback((key: string) => page.find(([k]) => k === key)?.[1] ?? null, [page]);
  const returnTarget = useCallback(() => {
    const safe = safeReturnTo(pageParam('returnTo'));
    if (safe) return safe;
    return linkTo(route?.menu.parent ?? 'home');
  }, [pageParam, route, linkTo]);

  const value: Platform = {
    url, pathname, route, contractError: routeContractError, metricInit, global, page, extras, pageParam, navigate, setGlobal, setPage, resetContext, linkTo, returnTarget,
    user, role, setRole, can, visibleMenus, scope, lastScope, favorites, toggleFavorite, recent, usage,
    toasts, toast, dismissToast, scenario, setScenario, defaultRangeTo: DEFAULT_RANGE_TO, paletteOpen, setPaletteOpen,
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
