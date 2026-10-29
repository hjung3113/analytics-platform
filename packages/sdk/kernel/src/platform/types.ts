import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import type { PageFocus, PageNavigation } from '../context/pageNavigation';
import type { PlatformLocation } from '../context/location';
import type { MetricInit } from '../registry/metric-init';
import { CONTEXT_LABELS, type MenuEntry, type Registry, type RouteMatch } from '../registry/registry';
import type { QueryHistory } from '../query/query-history';
import type { QueryDraft, QueryMissing } from '../query/query-draft';
import type { RefreshEpochs } from '../query/refresh-epochs';
import type { ContextKey, ContractError, EquipmentAxisDescriptor, GlobalContext, ModuleScopedId, Pair, Permission, PlatformAdapter, QueryHistoryStore, SavedViewStore, Session, SessionUser, SpaceDef, SpaceId, Text, UsageVia } from '@ap/contracts';

export type ScopeState = { scopeId: string | null; status: 'none' | 'validating' | 'valid' | 'forbidden' | 'unknown_scope' | 'error'; validatedFor: Session | null; grantedRooms: string[] };
export type Recent = { menuId: string; url: string; at: number };
export type ToastAction = { label: string; onAction: () => void };
export type Toast = { id: number; text: string; tone: 'info' | 'warning' | 'danger'; detail?: string; action?: ToastAction };
export type ToastOptions = { action?: ToastAction; durationMs?: number };
/** The undo window: an action toast without `durationMs` stays until dismissed (06 Toast), so an undo passes this essential time limit (#946 Q8). */
export const UNDO_WINDOW_MS = 8000;
/**
 * Feature entry the shell draws for one space (ADR-0028, ADR-0072 decision 5). The app supplies the icon; `key` is only a React key,
 * the shell never branches on it. It opens a registered menu in the same tab through the Context Link helper (ADR-0081 decision 7, #760):
 * only `page` and `returnTo` are carried, never the global Context. The shell draws it only while `resolveLink(...).allowed`.
 */
export type FeatureEntry = { key: string; label: Text; menuId: string; page?: Record<string, string>; icon: LucideIcon };
/**
 * Space-scoped feature entries from the app's Managed System mapping (ADR-0045).
 * `entriesFor` returns null for a space without a mapping; an absent slot draws no block.
 */
export type FeatureSlot = {
  entriesFor: (spaceId: SpaceId) => readonly FeatureEntry[] | null;
  /** Block gate: the shell draws the feature block only while the user holds it (ADR-0081 decision 8). Absent = the block is not gated. */
  permission?: Permission;
};
/** A business system that is announced but cannot be entered yet. Display only — not in the Registry, no permission, no menu (ADR-0042). */
export type PlannedSpace = { id: string; label: Text; /** Optional second line in the switcher row; same non-blank ko/en rule as SpaceDef.subtitle. */ subtitle?: Text; icon: LucideIcon };
/**
 * The rail bell and the platform-menu unread badge (ADR-0070 decision 4, 15 §3.2, #652). Components, so the shell never imports a menu.
 * `UnreadCount` calls `children(count)` at one stable position on every render; `null` draws no badge (unknown, failed, no notification
 * server, session ended). `Recent` is the popover body. Absent slot → no bell and no badge.
 */
export type NotificationsSlot = { menuId: string; UnreadCount: ComponentType<{ children: (count: number | null) => ReactNode }>; Recent: ComponentType };
/** One frozen Context item shown as a removable chip in the VOC drawer (ADR-0070 decision 5). `id` is stable per kind: `menu`, `page:<key>`, `period`, `global:<key>`. */
export type VocComposeContextItem = { id: string; label: string; value: string };
/**
 * The Context frozen when the VOC drawer opened, minus the chips the user removed. `href` is the absolute URL of that screen rebuilt
 * from the kept items only (06 §8: a removed chip leaves the attached address too); null when there was no main screen (board) or the user removed the `menu` chip. `spaceId`/`menuId` describe the frozen screen for defaults only (e.g. the Managed System); they ignore chip removal and are never attached.
 * `carried` is the frozen screen's values of its carry set's page keys (empty when it has no set), including keys whose chips were removed; defaults only, never attached.
 */
export type VocComposeContext = { items: readonly VocComposeContextItem[]; href: string | null; spaceId: SpaceId | null; menuId: string | null; carried: Readonly<Record<string, string>> };
export type VocComposeProps = {
  context: VocComposeContext;
  /** Called once after the VOC was created; the shell closes the drawer and drops the draft. */
  onSubmitted: (result: { vocId: string; displayId: string }) => void;
  /** The content's own cancel action; the shell runs the same close path as its close button (confirm when dirty). */
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
};
/** The rail `VOC 등록` drawer body (ADR-0070 decisions 4–5, 06 §8). Absent slot → no rail button. */
export type VocComposeSlot = { Compose: ComponentType<VocComposeProps> };
/** The home `내 할 일` section (ADR-0070 decision 8, 15 §3.2): a component the app fills from another menu package, so one menu never imports another. It renders nothing when it has nothing to show. Absent slot → no section. The only slot a menu reads (`MenuPlatform.homeTodo`); the shell never reads it. */
export type HomeTodoSlot = { Todo: ComponentType };
/**
 * Slots the app fills at composition time (shell slots, plus `homeTodo`, which the home menu reads through `MenuPlatform`), so platform components never import the shell.
 * contextBar: rendered by PlatformPage above page content. topBarTools: extra controls at the bottom of the app rail (today the mock dev tools).
 * features: space-scoped in-shell entries (ADR-0028, ADR-0045).
 * plannedSpaces: the system switcher's not-yet-available rows (ADR-0042, 15 §3.2).
 * boardEntry: the `분석 보드에 열기…` item `PlatformPage` appends to a board menu's `⋯` menu (docs/16 §6); components never import the shell.
 * scopeControl: a space's own sidebar list-scope control in place of the analytics `ScopeSelector` (ADR-0081 decision 4, 06 §8); `For` returns null for spaces and current menus that keep the default.
 * The three sidebar slots (`scopeControl`, `navCounts`, `spaceNavSection`) resolve by the space and the current route's menu (`null` off a route), so a consumer can decline a menu by its own declaration before any of its subtree mounts (#1099c).
 * notifications: the rail bell and the platform-menu unread badge (ADR-0070 decision 4, #652).
 * vocCompose: the body of the rail `VOC 등록` docked drawer; the shell owns position, frozen Context chips, draft and close rules (ADR-0070 decision 5, #655).
 * navCounts: per-menu and per-`navViews` count badges in a space's sidebar (06 §8, #761).
 * spaceNavSection: a space's own sidebar section between the primary menu and favorites (06 §8, #761).
 * homeTodo: the home `내 할 일` section; the home menu reads it through `MenuPlatform.homeTodo`, the shell never does (ADR-0070 decision 8, ADR-0076, #657).
 */
export type ScopeControlSlot = { For: (spaceId: SpaceId, menu: MenuEntry | null) => ComponentType<{ collapsed: boolean }> | null };
/**
 * Per-menu sidebar counts for one space (06 §8 `navCounts`, #761). `For` returns a module-level component (same stability rule as `scopeControl`:
 * the shell renders it once around the menu list, so its identity must not change between renders) or null for a space without counts.
 * It calls `children(counts)` at one stable position; keys are `menuId` for a row and `` `${menuId}/${viewId}` `` for a `navViews` item;
 * `null` (unknown, failed) or an absent key draws no badge.
 */
export type NavCountsSlot = { For: (spaceId: SpaceId, menu: MenuEntry | null) => ComponentType<{ children: (counts: Readonly<Record<string, number>> | null) => ReactNode }> | null };
/**
 * A space's own sidebar section after the primary menu and before favorites (06 §8 `spaceNavSection`, #761). The shell owns the expanded-only
 * rendering, the `<section aria-label>` landmark and the heading; `Body` takes no props and reads `usePlatform().route` to pick its surface.
 * `Body` must be module-level (stable identity), like `scopeControl`'s component.
 */
export type SpaceNavSectionSlot = { For: (spaceId: SpaceId, menu: MenuEntry | null) => { label: Text; Body: ComponentType } | null };
export type PlatformSlots = { scopeControl?: ScopeControlSlot; contextBar?: ReactNode; topBarTools?: ReactNode; features?: FeatureSlot; plannedSpaces?: readonly PlannedSpace[]; boardEntry?: ReactNode; notifications?: NotificationsSlot; vocCompose?: VocComposeSlot; homeTodo?: HomeTodoSlot; navCounts?: NavCountsSlot; spaceNavSection?: SpaceNavSectionSlot };
export type LinkOptions = { params?: Record<string, string>; page?: Record<string, string | null>; global?: Partial<GlobalContext>; returnTo?: boolean };
export type LinkResolution = {
  href: string;
  /** False when the signed-in user lacks the target's permission or, for a space menu, space entry. A global utility menu is permission only. Display only — never a permission proof. */
  allowed: boolean;
  /** Requested page keys the target menu does not register; they are not in `href`. */
  droppedPageKeys: string[];
};

/**
 * The full platform value the shell, the platform components and the app read through `useHostPlatform()` (`@ap/kernel/host`, ADR-0076).
 * Menus see the narrow `MenuPlatform` of the same runtime value, so a change to a shell-only field never breaks a menu.
 */
export type HostPlatform = {
  queryDraft: QueryDraft;
  queryHistory: QueryHistory;
  queryHistoryStore?: QueryHistoryStore;
  /** Host-only (never on `MenuPlatform`, ADR-0076). Not the feature-bridge `savedViewsSlot`, which is a sidebar slot. */
  savedViewStore?: SavedViewStore;
  queryPolicy: { ready: boolean; idle: boolean; missing: readonly QueryMissing[] };
  equipmentAxes: readonly EquipmentAxisDescriptor[];
  registry: Registry;
  /** The server port. Menus read it for the console and audit ports and the session-bound generation of the my-activity bridge; the query hooks are the usual route. */
  adapter: PlatformAdapter;
  location: PlatformLocation;
  absoluteUrl: (url: string) => string;
  url: string;
  pathname: string;
  route: RouteMatch | null;
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
  /** Latest recent visits at call time (a stable function, ADR-0076 supplement #824). Read it in an event handler; render with `useRecentVisits()`. */
  readRecent: () => readonly Recent[];
  toast: (text: string, tone?: Toast['tone'], detail?: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
  /** Pauses (`true`) or restarts (`false`) a toast's auto-dismiss while focus or the pointer is inside it. */
  holdToast: (id: number, held: boolean) => void;
  defaultRangeTo: string | null;
  slots: PlatformSlots;
  /** = `slots.homeTodo ?? null`, raised for menus (ADR-0076). */
  homeTodo: HomeTodoSlot | null;
  setPaletteOpen: (open: boolean) => void;
  /** The business-system switcher takes part in the same arrival-focus gate as the palette (ADR-0032). Open state and sessions: `useOverlayState()`. */
  setSwitcherOpen: (open: boolean) => void;
  /** `'main'` for the URL-bound screen, `'pane'` inside a `PaneScreenProvider` (ADR-0049). Read-only. */
  screenMode: 'main' | 'pane';
  /** The pane's id in a pane, null on the main screen. */
  paneId: string | null;
  /** The pane's caption (`칸 N · 메뉴`) the board passes to its `PaneScreenProvider`; null on the main screen. Read-only. */
  paneLabel: string | null;
};

/**
 * What a menu page sees through `usePlatform()` (ADR-0076): the same runtime value as `HostPlatform`, narrowed to the menu contract.
 * A field a menu needs that is missing here moves up from `HostPlatform`; a menu never imports `@ap/kernel/host`.
 */
export type MenuPlatform = Pick<HostPlatform, 'route' | 'url' | 'pathname' | 'absoluteUrl' | 'location' | 'global' | 'page' | 'pageParam' | 'setGlobal' | 'setPage' | 'resetContext' | 'navigate' | 'linkTo' | 'resolveLink' | 'session' | 'user' | 'revision' | 'can' | 'canOpen' | 'scope' | 'toast' | 'dismissToast' | 'registry' | 'adapter' | 'favorites' | 'toggleFavorite' | 'accessibleSpaces' | 'spaceEntry' | 'homeTodo'>;

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
  /** True only when `href` is a `returnTo` that passed `safeReturnTo` and `canOpen`; parent/home fallbacks are false. */
  accepted: boolean;
  /** Space label of the accepted origin menu; null for a fallback or a global-menu origin. */
  spaceLabel: Text | null;
};
