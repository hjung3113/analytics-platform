import { createPortCache, type PortCache } from './selection-port-cache';
import type { LucideIcon } from 'lucide-react';
import { createBrowserLocation, hasDotSegment, type PlatformLocation } from './location';
import { use, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { createPaletteFocus, useFocusGate, type PaletteSession } from './paletteFocus';
import { createPageNavigation, type PageFocus, type PageNavigation } from './pageNavigation';
import { classifyMetricInit, type MetricInit } from './metric-init';
import { CONTEXT_LABELS, isBoardPath, pathFor, routeParamNames, type MenuEntry, type Registry } from './registry';
import { useI18n } from './i18n';
import { dropResetKeys, paneHref } from './paneContext';
import { appliedQueryPolicy, createDraftStore, useScreenDraft, type DraftStore } from './draft-state';
import type { QueryHistory } from './query-history';
import type { QueryHistoryStore } from '@ap/contracts';
import type { QueryDraft, QueryMissing } from './query-draft';
import { createRefreshEpochs, type RefreshEpochs } from './refresh-epochs';
import { buildQuery, clientCorrelationId, ContractError, emptyGlobal, type EquipmentAxisDescriptor, type ContextKey, type GlobalContext, incompleteMetricPair, type ModuleScopedId, isAppRelativePath, type Pair, type ParsedQuery, parseQuery, type Permission, type PlatformAdapter, sameGlobal, type Session, type SessionUser, shift, type SpaceDef, type SpaceId, type Text, type UsageEvent, type UsageVia } from '@ap/contracts';

const NO_EQUIPMENT_AXES: readonly EquipmentAxisDescriptor[] = [];

export type ScopeState = { scopeId: string | null; status: 'none' | 'validating' | 'valid' | 'forbidden' | 'unknown_scope' | 'error'; validatedFor: Session | null; grantedRooms: string[] };
export type Recent = { menuId: string; url: string; at: number };
export type Toast = { id: number; text: string; tone: 'info' | 'warning' | 'danger'; detail?: string };
/** FeedbackOps entry the shell draws for one space. The shell picks the icon from `id` (ADR-0028). */
export type FeedbackOpsEntryId = 'voc-create' | 'voc' | 'task' | 'survey';
/** `href: null` draws the entry as a disabled link (15 §8: the FeedbackOps address is missing or invalid). */
export type FeedbackOpsEntry = { id: FeedbackOpsEntryId; label: Text; href: string | null };
/**
 * Space-scoped FeedbackOps links from the app's Managed System mapping (ADR-0027, ADR-0045).
 * `entriesFor` returns null for a space without a mapping; an absent slot draws neither the block nor the rail link.
 * `platformReturn` is the absolute URL of the page the shell is drawing, for FeedbackOps' way back (FO ADR-0071).
 */
export type FeedbackOpsSlot = {
  entriesFor: (spaceId: SpaceId, platformReturn?: string) => readonly FeedbackOpsEntry[] | null;
  /** Rail link to FeedbackOps overall; the shell draws it only while the user holds `permission`. */
  overall: { href: string; permission: Permission } | null;
};
/** A business system that is announced but cannot be entered yet. Display only — not in the Registry, no permission, no menu (ADR-0042). */
export type PlannedSpace = { id: string; label: Text; /** Optional second line in the switcher row; same non-blank ko/en rule as SpaceDef.subtitle. */ subtitle?: Text; icon: LucideIcon };
/**
 * The rail bell and the platform-menu unread badge (ADR-0070 decision 4, 15 §3.2, #652). Components, so the shell never imports a menu.
 * `UnreadCount` calls `children(count)` at one stable position on every render; `null` draws no badge (unknown, failed, no notification
 * server, session ended). `Recent` is the popover body. Absent slot → no bell and no badge.
 */
export type NotificationsSlot = { menuId: string; UnreadCount: ComponentType<{ children: (count: number | null) => ReactNode }>; Recent: ComponentType };
/**
 * Shell slots (docs/06 §8) the app fills at composition time, so platform components never import the shell.
 * contextBar: rendered by PlatformPage above page content. topBarTools: extra controls at the bottom of the app rail (today the mock dev tools).
 * feedbackOps: space-scoped entries and the overall link (ADR-0027, ADR-0028).
 * plannedSpaces: the system switcher's not-yet-available rows (ADR-0042, 15 §3.2).
 * boardEntry: the `분석 보드에 열기…` item `PlatformPage` appends to a board menu's `⋯` menu (docs/16 §6); components never import the shell.
 * notifications: the rail bell and the platform-menu unread badge (ADR-0070 decision 4, #652).
 */
export type PlatformSlots = { contextBar?: ReactNode; topBarTools?: ReactNode; feedbackOps?: FeedbackOpsSlot; plannedSpaces?: readonly PlannedSpace[]; boardEntry?: ReactNode; notifications?: NotificationsSlot };
export type LinkOptions = { params?: Record<string, string>; page?: Record<string, string>; global?: Partial<GlobalContext>; returnTo?: boolean };
export type LinkResolution = {
  href: string;
  /** False when the signed-in user lacks the target's permission or, for a space menu, space entry. A global utility menu is permission only. Display only — never a permission proof. */
  allowed: boolean;
  /** Requested page keys the target menu does not register; they are not in `href`. */
  droppedPageKeys: string[];
};


type Platform = {
  queryDraft: QueryDraft;
  queryHistory: QueryHistory;
  queryHistoryStore?: QueryHistoryStore;
  queryPolicy: { ready: boolean; idle: boolean; missing: readonly QueryMissing[] };
  equipmentAxes: readonly EquipmentAxisDescriptor[];
  registry: Registry;
  /** For platform layers (shell) that query the server directly; pages go through their own api seam. */
  adapter: PlatformAdapter;
  location: PlatformLocation;
  absoluteUrl: (url: string) => string;
  url: string;
  pathname: string;
  route: { menu: MenuEntry; params: Record<string, string> } | null;
  /**
   * The platform-owned screen the main screen shows instead of a Registry route (`'board'` on `/board`, docs/16 §7), else null.
   * On it `route` and `contractError` are null, the main Context is empty, and nothing is recorded as a visit, a resume URL or a menu usage event. Read-only; always null in a pane.
   */
  platformScreen: 'board' | null;
  contractError: ContractError | null;
  metricInit: MetricInit;
  global: GlobalContext;
  page: Pair[];
  extras: Pair[];
  pageParam: (key: string) => string | null;
  pageNavigation: PageNavigation;
  navigate: (url: string, options?: { replace?: boolean; focus?: PageFocus; via?: UsageVia }) => boolean;
  setGlobal: (patch: Partial<GlobalContext>, options?: { replace?: boolean; silent?: boolean }) => void;
  setPage: (patch: Record<string, string | null>, options?: { replace?: boolean; focus?: PageFocus }) => void;
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
  /** Accepted `returnTo`: that menu's label and its leading drill values. Otherwise an openable parent (or home), an empty trail and no reverted Context. Accepted origins report changed global Context keys. `href` equals `returnTarget()` (06 §22, ADR-0025). */
  returnOrigin: () => ReturnOrigin;
  session: Session;
  user: SessionUser;
  /** Bumps whenever the adapter announces a change; part of every query identity. */
  revision: number;
  /** App-wide refresh counters per endpoint: a write bumps what it invalidates and mounted queries refetch (ADR-0054). */
  refreshEpochs: RefreshEpochs;
  can: (permission: Permission | ModuleScopedId) => boolean;
  /** Menu permission ∧ space entry, independent of URL generation and route parameters. */
  canOpen: (menuId: string) => boolean;
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
  /** Last screen, then openable home, then first openable sidebar menu (06 §9.1). */
  spaceEntry: (spaceId: SpaceId) => { menuId: string; href: string; resumed: boolean } | null;
  /** No-op when spaceId is the current space or has no entry; else push spaceEntry. */
  switchSpace: (spaceId: SpaceId) => void;
  scope: ScopeState;
  /** Re-runs Scope validation for the requested scope after an `error` (no automatic retry in the Kernel, #167). */
  retryScope: () => void;
  lastScope: string | null;
  favorites: string[];
  toggleFavorite: (menuId: string) => void;
  recent: Recent[];
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone'], detail?: string) => void;
  dismissToast: (id: number) => void;
  defaultRangeTo: string;
  slots: PlatformSlots;
  paletteSession: PaletteSession | null;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** The business-system switcher takes part in the same arrival-focus gate as the palette (ADR-0032). */
  switcherSession: PaletteSession | null;
  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
  /** `'main'` for the URL-bound screen, `'pane'` inside a `PaneScreenProvider` (ADR-0049). Read-only. */
  screenMode: 'main' | 'pane';
  /** The pane's id in a pane, null on the main screen. */
  paneId: string | null;
  /** The pane's caption (`칸 N · 메뉴`) the board passes to its `PaneScreenProvider`; null on the main screen. Read-only. */
  paneLabel: string | null;
};

/** Context items named by return notifications, separate from menu capabilities. */
export type ReturnContextKey = ContextKey | 'scope';
export const RETURN_CONTEXT_LABELS: Record<ReturnContextKey, Text> = {
  ...CONTEXT_LABELS,
  scope: { ko: 'Scope', en: 'Scope' },
};

/** Where a destination's return control goes, including the origin menu name and drill trail (06 §22, ADR-0025). */
export type ReturnOrigin = {
  href: string;
  menuLabel: Text;
  trail: { label: Text; value: string }[];
  revertedContext: ReturnContextKey[];
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

/** A stored preference must pass `decode`: bad JSON or a value `decode` rejects (undefined) reads as `fallback`. Never throws. */
function readPreference<T>(key: string, decode: (value: unknown) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return decode(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePreference(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory-only */ }
}
/** String entries only; a non-list is rejected. */
function decodeFavorites(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
}
/** Well-formed entries only; a stored URL must stay app-relative because the shell navigates to it. */
function decodeRecent(value: unknown): Recent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is Recent => {
    if (entry === null || typeof entry !== 'object') return false;
    const r = entry as Record<string, unknown>;
    return typeof r.menuId === 'string' && typeof r.url === 'string' && isAppRelativePath(r.url)
      && typeof r.at === 'number' && Number.isFinite(r.at);
  });
}
function decodeScopeId(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : undefined;
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

function sameParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

function writeSpaceLast(userId: string, spaceId: string, url: string) {
  try {
    const next = readSpaceLast(userId);
    next[spaceId] = url;
    sessionStorage.setItem(spaceLastKey(userId), JSON.stringify(next));
  } catch { /* memory-only */ }
}

const browserLocation = createBrowserLocation();

function counterStore(adapter: PlatformAdapter) {
  let n = 0;
  return { subscribe: (listener: () => void) => adapter.subscribe(() => { n++; listener(); }), get: () => n };
}

/** Fallback tab-session id when sessionStorage is unavailable (privacy mode, tests). One per JS runtime. */
let fallbackUsageSession: string | null = null;

/** Fields of the screen state: what a menu page reads about the screen it is shown on (the main screen or one board pane). */
type ScreenFields = 'queryHistory' | 'queryDraft' | 'queryPolicy' | 'url' | 'pathname' | 'route' | 'platformScreen' | 'contractError' | 'metricInit' | 'global' | 'page' | 'extras' | 'pageParam' | 'pageNavigation' | 'navigate' | 'setGlobal' | 'setPage' | 'resetContext' | 'linkTo' | 'resolveLink' | 'reportError' | 'returnTarget' | 'returnOrigin' | 'scope' | 'retryScope' | 'currentSpace';
/** Shell navigation state that always follows the main screen, even when read from inside a pane (ADR-0049). */
type MainBoundFields = 'visibleMenus' | 'sidebarSpace' | 'spaceResume' | 'spaceEntry' | 'switchSpace';
type ScreenState = Pick<Platform, ScreenFields | 'screenMode' | 'paneId' | 'paneLabel'>;
type MainBound = Pick<Platform, MainBoundFields>;
type AppState = Omit<Platform, ScreenFields | MainBoundFields | 'screenMode' | 'paneId' | 'paneLabel'>;
/** App-internal handles the screen layers need; never part of the public `usePlatform()` value. */
type AppInternal = {
  selectionPortCache: PortCache;
  currentRevision: () => number;
  enters: (menu: MenuEntry) => boolean;
  usageSessionId: string;
  userIdRef: { readonly current: string };
  /** Main-screen navigation trail for usage `entry` (#605): the last navigation's `via` and the menu of the screen shown before. Never persisted. */
  usageNav: { current: UsageNavTrail };
  mainNavigation: ReturnType<typeof createPageNavigation>;
  initialUrl: string;
  recordVisit: (menuId: string, url: string) => void;
  rememberScope: (scopeId: string) => void;
};
type UsageNavTrail = { user: string; via: UsageVia | null; seen: boolean; prev: string | null };
type AppValue = { pub: AppState; internal: AppInternal };

const AppContext = createContext<AppValue | null>(null);
const MainBoundContext = createContext<MainBound | null>(null);
const ScreenContext = createContext<ScreenState | null>(null);
// A pane gets its own context object: React re-renders every ScreenContext reader under the main provider when the main
// screen changes, even below a nested provider of the same context, so a shared object would wake all panes (C3).
const PaneScreenContext = createContext<ScreenState | null>(null);

type CommitOptions = { focus?: PageFocus; materialize?: boolean };
/** What the screen state hook needs from its owner: where the URL lives and how a write or a navigation lands. */
type ScreenSource = {
  draftStore?: DraftStore;
  mode: 'main' | 'pane';
  paneId: string | null;
  paneLabel?: string | null;
  /** The screen's address: the browser URL for the main screen, the pane's virtual path plus its own query. */
  url: string;
  navigation: ReturnType<typeof createPageNavigation>;
  /** Writes this screen's own address (history for main, `onChange` for a pane). Stable identity. False when nothing was written. */
  commit: (next: string, how: 'push' | 'replace', options?: CommitOptions) => boolean;
  /** Imperative navigation to any app-relative href. Stable identity. */
  go: (href: string, options?: { replace?: boolean; focus?: PageFocus }) => boolean;
  /** A pane reads the sidebar space from the main screen; the main screen derives its own. */
  sidebarSpace?: SpaceDef | null;
  /** Main only: remember a Scope the server confirmed. */
  onScopeValid?: (scopeId: string) => void;
  /** False for a second reader of a pane that another provider already counts (the board's Context bar): it sends no usage events. */
  countsUsage?: boolean;
};

/**
 * Consumes the pending navigation mark at the real entry (inside the stay's timer, so StrictMode's fake mount never
 * takes it) and moves the trail to this menu. Unmarked, the tab's first entry is `direct` with no previous menu; a new session
 * user starts the trail over so a previous user's menu never travels (docs/05, ADR-0020).
 */
function takeNavigation(trail: UsageNavTrail, userId: string, menuId: string): { via: UsageVia; fromMenuId: string | null } {
  if (trail.user !== userId) Object.assign(trail, { user: userId, via: null, seen: false, prev: null });
  // A pending mark wins; with none, the tab's first entry is `direct` (opened, reloaded, typed) and a later one `link`.
  const taken = { via: trail.via ?? (trail.seen ? 'link' : 'direct'), fromMenuId: trail.prev };
  Object.assign(trail, { via: null, seen: true, prev: menuId });
  return taken;
}

function makeStayId(): string {
  try { return crypto.randomUUID(); } catch { return `stay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}

/**
 * Everything derived from one screen's address (06 §6.4): route, Context, page state, writes, links, Scope and the
 * usage stay. The main screen feeds it the browser URL; a board pane feeds it its own `PaneScreen` (ADR-0049), so
 * the same rules run per screen.
 */
function useScreenState(app: AppValue, source: ScreenSource): { screen: ScreenState; sidebarSpace: SpaceDef | null } {
  const { registry, adapter, session, user, can, canOpen, toast, accessibleSpaces, defaultRangeTo, equipmentAxes } = app.pub;
  const { enters, usageSessionId, userIdRef, usageNav } = app.internal;
  const { matchRoute, menuById, safeReturnTo } = registry;
  const { url, navigation: pageNavigation, commit, go, mode, paneId } = source;
  const paneLabel = source.paneLabel ?? null;
  const { lang } = useI18n();
  const userId = user.id;

  const pathname = url.split('?')[0] || '/';
  const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const outsideDeployment = url === '';

  const platformScreen = mode === 'main' && !outsideDeployment && isBoardPath(pathname) ? 'board' : null;
  const route = useMemo(() => outsideDeployment || platformScreen !== null ? null : matchRoute(pathname), [matchRoute, pathname, outsideDeployment, platformScreen]);
  const { parsed, contractError } = useMemo((): { parsed: ParsedQuery | null; contractError: ContractError | null } => {
    // The board owns its own query (`?sheet=`), not the Context codec: the main Context there is empty.
    if (platformScreen !== null) return { parsed: null, contractError: null };
    try {
      const parsed = parseQuery(search, route?.menu.pageKeys ?? []);
      for (const axisId of Object.keys(parsed.global.condition ?? {})) {
        const axis = equipmentAxes.find(a => a.id === axisId);
        if (!axis) throw new ContractError('invalid_condition', 'Unknown equipment axis', 'equipmentGroup', new URLSearchParams(search).get('equipmentGroup') ?? '');
        if (parsed.global.membershipBasis === 'asOf' && !axis.membershipHistory) throw new ContractError('membership_basis_unsupported', 'Axis has no membership history');
      }
      return { parsed, contractError: null };
    } catch (e) {
      if (e instanceof ContractError) return { parsed: null, contractError: e };
      throw e;
    }
  }, [search, route, platformScreen, equipmentAxes]);
  const global = parsed?.global ?? emptyGlobal;
  const pairError = contractError ? null : incompleteMetricPair(route?.menu ?? null, global.metricId, global.metricVersion);
  const routeContractError = contractError ?? pairError;
  const metricInit = classifyMetricInit(adapter.publishedMetrics(), route?.menu.initializesMetric === true, global.metricId, global.metricVersion);
  const page = parsed?.page ?? [];
  const extras = parsed?.extras ?? [];

  // Only the main screen's navigation marks how the next entry was reached; a pane that leaves hands over to the main one (onLeave).
  const navigate = useCallback((next: string, options?: { replace?: boolean; focus?: PageFocus; via?: UsageVia }) => {
    const trail = usageNav.current;
    const before = trail.via;
    if (mode === 'main') trail.via = options?.via ?? null;
    const moved = go(next, options);
    if (mode === 'main' && !moved) trail.via = before;
    return moved;
  }, [go, mode, usageNav]);

  // A deliberate global-Context change drops the manifest's contextResetKeys (e.g. the result-set page index)
  // from the page pairs in the SAME navigation — one history entry, so Back returns to the pre-change URL
  // exactly (06 §6.4). History traversal (popstate, navigate) and no-op setGlobal calls never drop anything.
  const dropContextResetKeys = useCallback((pairs: Pair[], next: GlobalContext): Pair[] => dropResetKeys(route?.menu, pairs, global, next), [route, global]);

  // Writers commit this screen's own address; they are not cross-menu navigation (a pane keeps writing to itself
  // even after its menu lost permission or board support).
  const write = useCallback((next: string, options?: { replace?: boolean; focus?: PageFocus }) => {
    commit(next, options?.replace ? 'replace' : 'push', { focus: options?.focus });
  }, [commit]);

  const setGlobal = useCallback((patch: Partial<GlobalContext>, options?: { replace?: boolean; silent?: boolean }) => {
    let next: GlobalContext = { ...global, ...patch };
    if ('scopeId' in patch && patch.scopeId !== global.scopeId) {
      // Site is a DB boundary (ADR-0004): site-bound sets are cleared explicitly, never re-mapped.
      const had = global.lineNames !== null || global.prcGroups !== null || global.membershipBasis !== null || global.roomNames !== null || global.condition !== null || global.selection !== null || global.lotIds !== null || global.recipeIds !== null || global.ppid !== null;
      next = { ...next, roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null, lotIds: null, recipeIds: null, ppid: null };
      if (had && !options?.silent) toast(lang === 'ko' ? 'Scope 변경: room_name·Line·PRC 그룹·설비 조건·선택·Lot·Recipe를 초기화했습니다 (Site 경계).' : 'Scope changed: room_name, Line, PRC groups, condition, selection, Lot and Recipe were cleared (site boundary).', 'warning');
    }
    write(pathname + buildQuery(next, dropContextResetKeys(page, next), extras), options);
  }, [global, page, extras, pathname, write, toast, lang, dropContextResetKeys]);

  const setPage = useCallback((patch: Record<string, string | null>, options?: { replace?: boolean; focus?: PageFocus }) => {
    const keys = Object.keys(patch);
    const kept = page.filter(([k]) => !keys.includes(k));
    const added = Object.entries(patch).filter((e): e is [string, string] => e[1] !== null && e[1] !== '');
    write(pathname + buildQuery(global, [...kept, ...added], extras), options);
  }, [global, page, extras, pathname, write]);

  // Reset clears analysis Context but keeps the requested Scope (a separate header control).
  const resetContext = useCallback(() => {
    const next: GlobalContext = { ...emptyGlobal, scopeId: global.scopeId };
    write(pathname + buildQuery(next, dropContextResetKeys(page, next), extras));
  }, [pathname, write, global, page, extras, dropContextResetKeys]);

  // Context Link helper (§22/§6.4): every registered global is preserved regardless of target support;
  // page-owned state and unregistered extras are never copied implicitly. Changing the site applies the same
  // site boundary as setGlobal (ADR-0004) to the values carried over from the current URL — values the caller
  // passes explicitly are meant for the destination and stay. `allowed` is a display hint (permission, plus
  // space entry for a space menu — a global utility menu is permission only, 06 §9.1); the server re-checks on arrival.
  const resolveLink = useCallback((menuId: string, options: LinkOptions = {}): LinkResolution => {
    const target = menuById(menuId);
    const carried: GlobalContext = options.global && 'scopeId' in options.global && options.global.scopeId !== global.scopeId
      ? { ...global, roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null, lotIds: null, recipeIds: null, ppid: null }
      : global;
    const g = { ...carried, ...options.global };
    const requested = Object.entries(options.page ?? {});
    const pagePairs: Pair[] = requested.filter(([k]) => target.pageKeys.includes(k));
    if (options.returnTo && target.pageKeys.includes('returnTo')) pagePairs.push(['returnTo', url]);
    return {
      href: pathFor(target, options.params) + buildQuery(g, pagePairs),
      allowed: canOpen(menuId),
      droppedPageKeys: requested.map(([k]) => k).filter(k => !target.pageKeys.includes(k)),
    };
  }, [global, url, menuById, canOpen]);
  const linkTo = useCallback((menuId: string, options: LinkOptions = {}) => resolveLink(menuId, options).href, [resolveLink]);

  const currentSpace = useMemo(() => (route ? registry.spaceOf(route.menu) : null), [registry, route]);
  const ownSidebarSpace = source.sidebarSpace;
  const sidebarSpace = useMemo((): SpaceDef | null => {
    if (ownSidebarSpace !== undefined) return ownSidebarSpace;
    if (registry.spaces.length === 0) throw new Error('registry declares no spaces');
    if (currentSpace !== null && accessibleSpaces.some(s => s.id === currentSpace.id)) return currentSpace;
    return accessibleSpaces[0] ?? null;
  }, [ownSidebarSpace, currentSpace, accessibleSpaces, registry]);

  // Scope is re-validated on every change of requested scope or session (§6.2); URL is never proof.
  // A pane validates its own requested Scope: panes never share or merge Scopes.
  const [scope, setScope] = useState<ScopeState>(() => {
    try {
      const id = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '').get('scopeId');
      if (id) return { scopeId: id, status: 'validating', validatedFor: session, grantedRooms: [] };
    } catch { /* keep none */ }
    return { scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] };
  });
  const [scopeRetry, setScopeRetry] = useState(0);
  const retryScope = useCallback(() => setScopeRetry(n => n + 1), []);
  const onScopeValid = source.onScopeValid;
  useEffect(() => {
    const scopeId = global.scopeId;
    if (!scopeId) { setScope({ scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] }); return; }
    const controller = new AbortController();
    setScope({ scopeId, status: 'validating', validatedFor: session, grantedRooms: [] });
    adapter.validateScope(scopeId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setScope({ scopeId, status: result.status, validatedFor: session, grantedRooms: result.grantedRooms });
      if (result.status === 'valid') onScopeValid?.(scopeId);
    }).catch(() => {
      // Only the Kernel's own abort means superseded; any other rejection (even an adapter-internal AbortError) is `error` until retry (#167).
      if (controller.signal.aborted) return;
      setScope({ scopeId, status: 'error', validatedFor: session, grantedRooms: [] });
    });
    return () => controller.abort();
  }, [global.scopeId, session, adapter, scopeRetry, onScopeValid]);

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

  // Materialize the default period for time-applying menus (§6.3/§6.4: absolute from/to written into the address)
  // and the server-confirmed metric version in ONE replace computed from the same parsed snapshot. The initial Δ
  // (24h here) is an Open decision; this prototype uses the 1-day preset as a Candidate. A pane's `onChange` is a
  // controlled callback that may not echo at once, so the same input/output proposal is made only once; a changed
  // input (or nothing left to do) re-arms it.
  const proposed = useRef<string | null>(null);
  useEffect(() => {
    if (!route || routeContractError) return;
    let next = global;
    if (route.menu.query?.mode !== 'apply' && route.menu.context.time === 'apply' && global.from === null) next = { ...next, from: shift(defaultRangeTo, -24), to: defaultRangeTo };
    if (metricInit.phase === 'confirm') next = { ...next, metricVersion: metricInit.metricVersion };
    if (next === global) { proposed.current = null; return; }
    const target = pathname + buildQuery(next, page, extras);
    const key = `${url}\0${target}`;
    if (proposed.current === key) return;
    proposed.current = key;
    commit(target, 'replace', { materialize: true });
  }, [route, routeContractError, global, metricInit, page, extras, pathname, url, commit, defaultRangeTo]);

  useLayoutEffect(() => {
    // A platform screen takes its own arrival focus; "no route" must not cancel the request for it.
    if (platformScreen !== null) return;
    if (!route || routeContractError || !can(route.menu.permission) || !enters(route.menu) || metricInit.phase === 'blocked') pageNavigation.cancel();
  }, [route, routeContractError, can, enters, metricInit.phase, pageNavigation, platformScreen]);

  // Usage events (docs/05 메뉴 활용률 계측): one `entry` per admitted stay and a `dwell` on leave, sent
  // fire-and-forget through the adapter — no await, no abort signal, failures are silent, navigation never
  // blocks. Admission is `${userId}\0${menu.id}\0${pathname}` (a pane adds its paneId, so two panes with the same
  // menu each count) and requires the menu gate; a space menu also
  // needs space entry, while a global utility menu does not (06 §9.1). Query-only changes (setGlobal/setPage,
  // default-period replace) never re-admit. `path` is the manifest route pattern, never the concrete pathname,
  // search or Context values. A pane's events carry `source: 'board'` and one opaque `stayId` per stay (ADR-0049).
  const lastAdmitted = useRef<string | null>(null);
  const countsUsage = source.countsUsage !== false;
  useEffect(() => {
    if (!countsUsage || !route || routeContractError || !can(route.menu.permission) || !enters(route.menu)) {
      // The main screen is not a menu now (board, contract error, no access): the next entry's `fromMenuId` is null.
      if (mode === 'main' && countsUsage) usageNav.current.prev = null;
      return;
    }
    const admitKey = `${userId}\0${paneId ?? ''}\0${route.menu.id}\0${pathname}`;
    if (lastAdmitted.current === admitKey) return;
    lastAdmitted.current = admitKey;
    const admitUser = userId;
    const menu = route.menu;
    const spaceId = registry.spaceOf(menu)?.id ?? null;
    const provenance = mode === 'pane' ? { source: 'board' as const, stayId: makeStayId() } : {};
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
      record({ name: 'dwell', menuId: menu.id, spaceId, path: menu.path, at: Date.now(), sessionId: usageSessionId, dwellMs: Math.max(0, Date.now() - enteredAt), enteredAt, ...provenance });
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') sendDwell(); };
    // setTimeout(0) keeps StrictMode's fake first mount silent: its cleanup clears the timer, so neither an
    // entry nor a dwell is emitted for a stay that never really started. If the session user changed before
    // it fired, the old user's stay never started either.
    const timer = setTimeout(() => {
      if (userIdRef.current !== admitUser) return;
      enteredAt = Date.now();
      record({ name: 'entry', menuId: menu.id, spaceId, path: menu.path, at: enteredAt, sessionId: usageSessionId, ...provenance, ...(mode === 'main' ? takeNavigation(usageNav.current, admitUser, menu.id) : {}) });
      document.addEventListener('visibilitychange', onHidden);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHidden);
      lastAdmitted.current = null;
      sendDwell();
    };
  }, [countsUsage, route, routeContractError, pathname, userId, can, enters, registry, adapter, usageSessionId, userIdRef, usageNav, paneId, mode]);

  const pageParam = useCallback((key: string) => page.find(([k]) => k === key)?.[1] ?? null, [page]);
  const resolveReturnOrigin = useCallback((): ReturnOrigin => {
    const safe = safeReturnTo(pageParam('returnTo'));
    if (safe) {
      const q = safe.indexOf('?');
      const path = q === -1 ? safe : safe.slice(0, q);
      const search = q === -1 ? '' : safe.slice(q);
      const matched = matchRoute(path);
      if (matched && canOpen(matched.menu.id)) {
        const starting = parseQuery(search, matched.menu.pageKeys).global;
        const fields: Record<ReturnContextKey, (keyof GlobalContext)[]> = {
          scope: ['scopeId'],
          time: ['from', 'to'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups', 'membershipBasis'], condition: ['condition', 'membershipBasis'], selection: ['selection'],
          lot: ['lotIds'], ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
        };
        const revertedContext = (Object.keys(fields) as ReturnContextKey[]).filter(key => {
          const pick = (context: GlobalContext): GlobalContext => ({ ...emptyGlobal, ...Object.fromEntries(fields[key].map(field => [field, context[field]])) });
          return !sameGlobal(pick(global), pick(starting));
        });
        return { href: safe, menuLabel: matched.menu.label, trail: consecutiveDrillTrail(matched.menu, search), revertedContext };
      }
    }
    if (route?.menu.parent && canOpen(route.menu.parent)) {
      return { href: linkTo(route.menu.parent), menuLabel: menuById(route.menu.parent).label, trail: [], revertedContext: [] };
    }
    const platformHome = matchRoute('/')?.menu;
    const spaceHome = sidebarSpace ? menuById(sidebarSpace.homeMenuId) : null;
    const home = platformHome && canOpen(platformHome.id) ? platformHome
      : spaceHome && canOpen(spaceHome.id) ? spaceHome : null;
    if (home) return { href: linkTo(home.id), menuLabel: home.label, trail: [], revertedContext: [] };
    // Emergency exception-prevention fallback only; '/' is not guaranteed to be a valid or accessible home.
    return { href: '/', menuLabel: { ko: '홈', en: 'Home' }, trail: [], revertedContext: [] };
  }, [pageParam, safeReturnTo, matchRoute, route, linkTo, menuById, sidebarSpace, canOpen, global]);
  const returnTarget = useCallback(() => resolveReturnOrigin().href, [resolveReturnOrigin]);
  const returnOrigin = useCallback((): ReturnOrigin => resolveReturnOrigin(), [resolveReturnOrigin]);

  const reportError = useCallback((error: unknown): string => {
    pageNavigation.cancel();
    const correlationId = clientCorrelationId();
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
  }, [adapter, registry, route, pageNavigation]);

  const queryPolicy = { ...appliedQueryPolicy(route?.menu ?? null, global, page, routeContractError !== null || metricInit.phase !== 'skip'),
    ready: route?.menu.query?.mode !== 'apply' || !route.menu.requiresScope || (scopeView.status === 'valid' && scopeView.scopeId === global.scopeId && scopeView.validatedFor === session) };
  const { queryDraft, queryHistory } = useScreenDraft({ store: source.draftStore, menu: route?.menu ?? null, identity: `${route?.menu.id ?? ''}\0${pathname}`, session, url,
    global, page, extras, defaultRangeTo, scope: scopeView, adapter, axes: equipmentAxes, invalid: routeContractError !== null,
    commit, setGlobal, setPage, history: app.pub.queryHistoryStore, revision: app.pub.revision, currentRevision: app.internal.currentRevision, allowed: route !== null && app.pub.canOpen(route.menu.id) });
  const screen: ScreenState = { queryDraft, queryHistory, queryPolicy,
    url, pathname, route, platformScreen, pageNavigation, contractError: routeContractError, metricInit, global, page, extras, pageParam, navigate, setGlobal, setPage, resetContext, linkTo, resolveLink, reportError, returnTarget, returnOrigin,
    currentSpace, scope: scopeView, retryScope, screenMode: mode, paneId, paneLabel,
  };
  return { screen, sidebarSpace };
}

export function PlatformProvider({ adapter, registry, location = browserLocation, slots = {}, equipmentAxes = NO_EQUIPMENT_AXES, queryHistory, children }: { queryHistory?: QueryHistoryStore; equipmentAxes?: readonly EquipmentAxisDescriptor[]; location?: PlatformLocation; adapter: PlatformAdapter; registry: Registry; slots?: PlatformSlots; children: ReactNode }) {
  const { menuById } = registry;
  // Bound here so class-based adapters keep their receiver when React calls these.
  const sessionStore = useMemo(() => ({ subscribe: (l: () => void) => adapter.subscribe(l), get: () => adapter.session() }), [adapter]);
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const revisions = useMemo(() => counterStore(adapter), [adapter]);
  const revision = useSyncExternalStore(revisions.subscribe, revisions.get);
  const [refreshEpochs] = useState(createRefreshEpochs);
  const selectionPortCache = useMemo(() => createPortCache(), [adapter, session, revision]);
  const user = session.user;
  const userId = user.id;
  const [initialUrl] = useState(() => location.read() ?? '');
  const [{ pageNavigation, paletteFocus, switcherFocus }] = useState(() => {
    const paletteFocus = createPaletteFocus({ cancel: () => pageNavigation.cancel(), notify: () => pageNavigation.notify() });
    // Reopening the switcher must not cancel an arrival that is still resolving: it keeps its title focus.
    const switcherFocus = createPaletteFocus({ cancel: () => {}, notify: () => pageNavigation.notify() });
    const pageNavigation = createPageNavigation(initialUrl, () => paletteFocus.isBlocked() || switcherFocus.isBlocked());
    return { pageNavigation, paletteFocus, switcherFocus };
  });
  const [favorites, setFavorites] = useState<string[]>(() => readPreference(`platform:favorites:${userId}`, decodeFavorites, []));
  const [recent, setRecent] = useState<Recent[]>(() => readPreference(`platform:recent:${userId}`, decodeRecent, []));
  const [lastScope, setLastScope] = useState<string | null>(() => readPreference(`platform:lastScope:${userId}`, decodeScopeId, null));
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
  const toast = useCallback((text: string, tone: Toast['tone'] = 'info', detail?: string) => {
    const id = toastId.current++;
    setToasts(list => [...list.slice(-3), { id, text, tone, ...(detail === undefined ? {} : { detail }) }]);
    setTimeout(() => { if (mounted.current) setToasts(list => list.filter(t => t.id !== id)); }, 5000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);

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

  const recordVisit = useCallback((menuId: string, url: string) => {
    setRecent(list => {
      const next = [{ menuId, url, at: Date.now() }, ...list.filter(r => r.menuId !== menuId)].slice(0, 12);
      writePreference(`platform:recent:${userId}`, next);
      return next;
    });
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

  const pub: AppState = {
    registry, adapter, location, absoluteUrl, equipmentAxes, queryHistoryStore: queryHistory,
    session, user, revision, refreshEpochs, can, canOpen, globalMenus, menusInSpace, accessibleSpaces, lastScope, favorites, toggleFavorite, recent,
    toasts, toast, dismissToast, defaultRangeTo, slots, paletteOpen, setPaletteOpen, paletteSession, switcherOpen, setSwitcherOpen, switcherSession,
  };
  const value: AppValue = { pub, internal: { currentRevision: revisions.get, selectionPortCache, enters, usageSessionId, userIdRef, usageNav, mainNavigation: pageNavigation, initialUrl, recordVisit, rememberScope } };
  return <AppContext.Provider value={value}><MainScreenProvider app={value}>{children}</MainScreenProvider></AppContext.Provider>;
}

/** The main screen: the browser URL, history, and the shell navigation that follows it. */
function MainScreenProvider({ app, children }: { app: AppValue; children: ReactNode }) {
  const { location, registry, can, canOpen, accessibleSpaces, menusInSpace, user } = app.pub;
  const { enters, mainNavigation: pageNavigation, initialUrl, recordVisit, rememberScope } = app.internal;
  const { matchRoute } = registry;
  const userId = user.id;
  const [url, setUrl] = useState(initialUrl);

  const commit = useCallback((next: string, how: 'push' | 'replace', options: CommitOptions = {}) => {
    if (!isAppRelativePath(next) || next === (location.read() ?? '')) { if (!options.materialize) pageNavigation.cancel(); return false; }
    if (options.materialize) pageNavigation.materialize(next);
    else pageNavigation.advance(next, options.focus);
    if (how === 'replace') location.replace(next); else location.push(next);
    setUrl(location.read() ?? '');
    if (how === 'push') document.getElementById('platform-main')?.scrollTo({ top: 0 });
    return true;
  }, [pageNavigation, location]);
  const go = useCallback((next: string, options?: { replace?: boolean; focus?: PageFocus }) => commit(next, options?.replace ? 'replace' : 'push', { focus: options?.focus }), [commit]);

  const source: ScreenSource = { mode: 'main', paneId: null, paneLabel: null, url, navigation: pageNavigation, commit, go, onScopeValid: rememberScope };
  const { screen, sidebarSpace } = useScreenState(app, source);
  const { pathname, route, contractError, resolveLink, navigate, currentSpace } = screen;

  useEffect(() => {
    const onPop = () => {
      const next = location.read() ?? '';
      // Back/Forward across menus arrives like a link (06 §26): the title takes focus and a carried
      // `focus=` does not claim the detail panel (ADR-0032). Same-screen history keeps the close-button claim.
      pageNavigation.advance(next, next.split('?')[0] !== pathname ? 'page' : undefined);
      app.internal.usageNav.current.via = 'history';
      setUrl(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [pageNavigation, location, pathname, app.internal.usageNav]);

  // Recent visits (the main screen's own history; a pane never writes them).
  useEffect(() => {
    if (!route || contractError || !can(route.menu.permission)) return;
    if (!enters(route.menu)) return;
    const space = registry.spaceOf(route.menu);
    if (space !== null) writeSpaceLast(userId, space.id, url);
    recordVisit(route.menu.id, url);
  }, [url, route, contractError, userId, can, enters, registry, recordVisit]);

  const visibleMenus = useMemo(() => (sidebarSpace === null ? [] : menusInSpace(sidebarSpace.id)), [menusInSpace, sidebarSpace]);
  // Read at call time. Stored globals are not restored: resolveLink carries the current global and the menu's page keys only.
  const spaceResume = useCallback((spaceId: SpaceId): { menuId: string; href: string } | null => {
    const stored = readSpaceLast(userId)[spaceId];
    if (typeof stored !== 'string' || !isAppRelativePath(stored)) return null;
    const q = stored.indexOf('?');
    const path = q === -1 ? stored : stored.slice(0, q);
    const search = q === -1 ? '' : stored.slice(q);
    // A stored `..` (including `%2e%2e`) matches a param route, then the browser normalizes it to a different path.
    if (hasDotSegment(path)) return null;
    const matched = matchRoute(path);
    if (!matched) return null;
    if (registry.spaceOf(matched.menu)?.id !== spaceId) return null;
    if (!canOpen(matched.menu.id)) return null;
    let parsed: ParsedQuery;
    try { parsed = parseQuery(search, matched.menu.pageKeys); } catch { return null; }
    if (incompleteMetricPair(matched.menu, parsed.global.metricId, parsed.global.metricVersion)) return null;
    const page: Record<string, string> = {};
    for (const [key, value] of parsed.page) page[key] = value;
    const href = resolveLink(matched.menu.id, { params: matched.params, page }).href;
    let normalized: string;
    try { normalized = new URL(href, 'http://x').pathname; } catch { return null; }
    const again = matchRoute(normalized);
    if (!again || again.menu.id !== matched.menu.id || !sameParams(again.params, matched.params)) return null;
    return { menuId: matched.menu.id, href };
  }, [userId, matchRoute, registry, canOpen, resolveLink]);
  const spaceEntry = useCallback((spaceId: SpaceId): { menuId: string; href: string; resumed: boolean } | null => {
    const space = accessibleSpaces.find(s => s.id === spaceId);
    if (!space) return null;
    const resume = spaceResume(spaceId);
    if (resume) return { ...resume, resumed: true };
    if (canOpen(space.homeMenuId)) return { menuId: space.homeMenuId, href: resolveLink(space.homeMenuId).href, resumed: false };
    for (const group of registry.groups) {
      if (group.space !== spaceId) continue;
      const menu = registry.menus.find(m => m.group === group.id && !m.navHidden && routeParamNames(m.path).length === 0 && canOpen(m.id));
      if (menu) return { menuId: menu.id, href: resolveLink(menu.id).href, resumed: false };
    }
    return null;
  }, [accessibleSpaces, spaceResume, canOpen, resolveLink, registry]);
  // Reselecting the current space never sends the user home; targets without an entry keep the URL.
  const switchSpace = useCallback((spaceId: SpaceId) => {
    if (currentSpace?.id === spaceId) return;
    const entry = spaceEntry(spaceId);
    if (entry) navigate(entry.href, { focus: 'page', via: 'switcher' });
  }, [currentSpace, spaceEntry, navigate]);

  // Stable while the five members are: an unrelated main Scope update must not re-render every pane consumer.
  const mainBound = useMemo<MainBound>(() => ({ visibleMenus, sidebarSpace, spaceResume, spaceEntry, switchSpace }), [visibleMenus, sidebarSpace, spaceResume, spaceEntry, switchSpace]);
  return <MainBoundContext.Provider value={mainBound}><ScreenContext.Provider value={screen}>{children}</ScreenContext.Provider></MainBoundContext.Provider>;
}

/** One analysis-board pane's screen (ADR-0049). `query` is `buildQuery(global, page, extras)` of that pane, with its leading `?` (or empty). */
export type PaneScreen = { menuId: string; params: Record<string, string>; query: string };

const PaneDraftContext = createContext<ReadonlyMap<string, DraftStore> | null>(null);

/** Owns drafts for the listed logical panes, across body/editor mounts. Remove a pane to release its draft. */
export function PaneQueryDraftProvider({ screens, children }: { screens: Readonly<Record<string, PaneScreen | null>>; children: ReactNode }) {
  const app = useContext(AppContext);
  if (!app) throw new Error('PaneQueryDraftProvider outside PlatformProvider');
  const session = app.pub.session;
  const identity = JSON.stringify(Object.entries(screens).map(([id, screen]) => [id, screen?.menuId, screen?.params]));
  const [owned, setOwned] = useState(() => ({ identity, session, stores: new Map(Object.entries(screens).filter(([, screen]) => screen !== null).map(([id]) => [id, createDraftStore()])) }));
  let stores = owned.stores;
  if (owned.identity !== identity || owned.session !== session) {
    stores = new Map(Object.entries(screens).filter(([, screen]) => screen !== null).map(([id, screen]) => {
      const oldIdentity = JSON.parse(owned.identity) as [string, string, Record<string, string>][];
      const old = oldIdentity.find(([key]) => key === id);
      const same = owned.session === session && old?.[1] === screen?.menuId && JSON.stringify(old?.[2]) === JSON.stringify(screen?.params);
      return [id, same ? owned.stores.get(id) ?? createDraftStore() : createDraftStore()];
    }));
    setOwned({ identity, session, stores });
  }
  return <PaneDraftContext.Provider value={stores}>{children}</PaneDraftContext.Provider>;
}

/**
 * Gives its subtree a screen of its own: `usePlatform()` there reads this pane's route, Context, page state, Scope and links, while
 * app-wide state and the shell (outside the pane) keep following the main screen. Preconditions (the caller owns them, #497):
 * `screen.menuId` is a registered menu and `screen.params` holds every route param, so that `pathFor(menu, params)` matches the same
 * menu and params again — validate saved screens before mounting. A denied or board-disabled registered menu is not an input
 * failure: it renders the pane-local gates. A malformed `query` is a contract error shown inside the pane, never thrown.
 * Writes (`setGlobal`, `setPage`, `resetContext`, drill, the default-period and metric-version materialization) call
 * `onChange(next, how)` with the pane's own next screen and never touch the URL. `onChange` is a controlled callback: it may
 * apply `next` later and its identity may change every render. Navigation (`navigate`, `PlatformLink`, return links) to another
 * menu with `features.board` that the user can open is `onChange(..., 'push')`; any other destination is `onLeave(href)`.
 */
export function PaneScreenProvider({ paneId, paneLabel, screen, onChange, onLeave, countUsage = true, children }: {
  paneId: string; /** Caption for a detail panel opened from this pane (`칸 2 · 메뉴`); read back as `usePlatform().paneLabel`. */ paneLabel?: string; screen: PaneScreen; onChange: (next: PaneScreen, how: 'push' | 'replace') => void; onLeave: (href: string) => void;
  /** Default true. The board's Context bar mounts a second, controlled provider for the selected pane; it passes false so that stay is counted once. */
  countUsage?: boolean; children: ReactNode;
}) {
  const app = useContext(AppContext);
  const main = useContext(MainBoundContext);
  const draftStores = useContext(PaneDraftContext);
  if (!app || !main) throw new Error('PaneScreenProvider outside PlatformProvider');
  const { registry, canOpen } = app.pub;
  const url = paneHref(registry, screen);
  const [navigation] = useState(() => createPageNavigation(url));
  const latest = useRef({ onChange, onLeave });
  useLayoutEffect(() => { latest.current = { onChange, onLeave }; });
  // Routing identity and current address come from the rendered screen, not from a layout-effect ref: a descendant layout
  // effect runs before this provider's, so a ref would still hold the previous menu/params. Params are keyed by content.
  const menuId = screen.menuId;
  const paramsKey = JSON.stringify(Object.entries(screen.params));
  const params = useMemo<Record<string, string>>(() => Object.fromEntries(JSON.parse(paramsKey) as [string, string][]), [paramsKey]);

  const commit = useCallback((next: string, how: 'push' | 'replace', options: CommitOptions = {}) => {
    if (next === url) { if (!options.materialize) navigation.cancel(); return false; }
    if (options.materialize) navigation.materialize(next);
    else navigation.advance(next, options.focus);
    const q = next.indexOf('?');
    latest.current.onChange({ menuId, params, query: q === -1 ? '' : next.slice(q) }, how);
    return true;
  }, [navigation, url, menuId, params]);
  const { matchRoute } = registry;
  const go = useCallback((href: string, options?: { replace?: boolean; focus?: PageFocus }) => {
    if (!isAppRelativePath(href) || href === url) { navigation.cancel(); return false; }
    const how = options?.replace ? 'replace' : 'push';
    const q = href.indexOf('?');
    const path = q === -1 ? href : href.slice(0, q);
    // Staying on this pane's own route is a write to the pane, whatever the menu's board support.
    if (path === url.split('?')[0]) return commit(href, how, { focus: options?.focus });
    const matched = hasDotSegment(path) ? null : matchRoute(path);
    if (matched && matched.menu.features.board === true && canOpen(matched.menu.id)) {
      navigation.advance(href, options?.focus);
      latest.current.onChange({ menuId: matched.menu.id, params: matched.params, query: q === -1 ? '' : href.slice(q) }, how);
    } else latest.current.onLeave(href);
    return true;
  }, [navigation, url, commit, matchRoute, canOpen]);

  useEffect(() => app.internal.selectionPortCache.retain(`pane:${paneId}`), [app.internal.selectionPortCache, paneId]);
  const source: ScreenSource = { draftStore: draftStores?.get(paneId), mode: 'pane', paneId, paneLabel, url, navigation, commit, go, sidebarSpace: main.sidebarSpace, countsUsage: countUsage };
  const state = useScreenState(app, source);
  return <PaneScreenContext.Provider value={state.screen}>{children}</PaneScreenContext.Provider>;
}

function useMerged(): Platform | null {
  const app = useContext(AppContext);
  const main = useContext(MainBoundContext);
  const paneScreen = useContext(PaneScreenContext);
  // `use` reads the main screen only outside a pane, so a pane reader has no dependency on it.
  const screen = paneScreen ?? use(ScreenContext);
  return useMemo(() => (app && main && screen ? { ...app.pub, ...main, ...screen } : null), [app, main, screen]);
}

export function usePlatform(): Platform {
  const value = useMerged();
  if (!value) throw new Error('usePlatform outside PlatformProvider');
  return value;
}

/** Provider value, or null where there is no provider. Always a hook call — never try/catch. */
export function usePlatformOptional(): Platform | null {
  return useMerged();
}

/** Anchor that navigates through the kernel (keeps modifier-click/open-in-new-tab behavior). */
export function PlatformLink({ href, children, className, onNavigate, via, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: () => void; /** How this link is reported in the usage entry it leads to (default `link`). */ via?: UsageVia }) {
  const { navigate, location, pathname } = usePlatform();
  return <a href={location.href(href)} className={className} {...rest} onClick={e => {
    rest.onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const focus = href.split('?')[0] !== pathname ? { focus: 'page' as const } : undefined;
    if (navigate(href, via ? { ...focus, via } : focus)) onNavigate?.();
  }}>{children}</a>;
}

/** App-supplied axes; an omitted prop deliberately supports no Condition axes. */
export function useEquipmentAxes(): readonly EquipmentAxisDescriptor[] {
  const app = useContext(AppContext);
  if (!app) throw new Error('useEquipmentAxes outside PlatformProvider');
  return app.pub.equipmentAxes;
}

/** Internal screen request store; intentionally absent from the SDK index. */
export function useSelectionPortCache(): PortCache {
  const app = useContext(AppContext);
  if (!app) throw new Error('Selection ports outside PlatformProvider');
  return app.internal.selectionPortCache;
}
