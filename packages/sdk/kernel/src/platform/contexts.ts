import { createContext } from 'react';
import type { PaletteSession } from '../context/paletteFocus';
import type { PageFocus, createPageNavigation } from '../context/pageNavigation';
import type { PortCache } from '../scope/selection-port-cache';
import type { MenuEntry } from '../registry/registry';
import type { DraftStore } from '../query/draft-state';
import type { QueryEngine } from '../query/query-engine';
import { PANE_USAGE_VIAS, type MainUsageVia, type Pair, type SpaceDef } from '@ap/contracts';
import type { SupportRegistry } from '../saved-view/useSavedViewSupport';
import type { createViewSlotStore } from '../saved-view/table-slots';
import type { HostPlatform, Recent, Toast } from './types';
import type { SessionDraftStore } from './sessionDraft';
import type { CarriedSelection, CarryProof, OriginRecord } from './return-origin';
import type { NavigationGuard } from './navigationGuard';
import type { createAnalysisSelectionAvailability } from '../context/analysisSelectionAvailability';

/** Fields of the screen state: what a menu page reads about the screen it is shown on (the main screen or one board pane). */
export type ScreenFields = 'detailExpanded' | 'setDetailExpanded' | 'queryHistory' | 'queryDraft' | 'queryPolicy' | 'url' | 'appliedUrl' | 'pathname' | 'route' | 'platformScreen' | 'contractError' | 'metricInit' | 'global' | 'page' | 'extras' | 'pageParam' | 'pageParams' | 'pageNavigation' | 'navigate' | 'setGlobal' | 'setPage' | 'resetContext' | 'linkTo' | 'resolveLink' | 'objectLinks' | 'resolveSelectionLink' | 'objectSelectionLinks' | 'reportError' | 'reportShellError' | 'returnTarget' | 'returnOrigin' | 'scope' | 'scopeGeneration' | 'retryScope' | 'currentSpace';
/** Shell navigation state that always follows the main screen, even when read from inside a pane (ADR-0049). */
export type MainBoundFields = 'visibleMenus' | 'sidebarSpace' | 'spaceResume' | 'spaceEntry' | 'switchSpace';
export type ScreenState = Pick<HostPlatform, ScreenFields | 'screenMode' | 'paneId' | 'paneLabel'> & {
  setPage: (patch: Parameters<HostPlatform['setPage']>[0], options?: PageWriteOptions) => void;
  /** Event-time page values for kernel writers. Null means the source screen was left. */
  pageParamsNow: (key: string) => string[] | null;
  returnCarry?: CarriedSelection;
  analysisSelectionAvailability: ReturnType<typeof createAnalysisSelectionAvailability>;
};
export type PageWriteOptions = NonNullable<Parameters<HostPlatform['setPage']>[1]> & { run?: CommitOptions['run'] };
export type MainBound = Pick<HostPlatform, MainBoundFields>;
export type AppState = Omit<HostPlatform, ScreenFields | MainBoundFields | 'screenMode' | 'paneId' | 'paneLabel'>;
/** App-internal handles the screen layers need; never part of the public `usePlatform()` value. */
export type AppInternal = {
  selectionPortCache: PortCache;
  /** The Kernel's own query client and session generation (ADR-0086); never on `HostPlatform`. */
  queryEngine: QueryEngine;
  currentRevision: () => number;
  enters: (menu: MenuEntry) => boolean;
  usageSessionId: string;
  /** Saved View support the screens declare (`useSavedViewSupport`), read by the host hook `useSavedViews`. */
  savedViewSupports: SupportRegistry;
  savedViewSlots: ReturnType<typeof createViewSlotStore>;
  userIdRef: { readonly current: string };
  /** Main-screen navigation trail for usage `entry` (#605): the last navigation's `via` and the menu of the screen shown before. Never persisted. A board pane keeps its own trail in `useScreenState` (`PaneUsageTrail`). */
  usageNav: { current: UsageNavTrail };
  mainNavigation: ReturnType<typeof createPageNavigation>;
  /** Unsaved-edit guards and the pending leave request (ADR-0115). */
  guard: NavigationGuard;
  sessionDrafts: SessionDraftStore;
  initialUrl: string;
  recordVisit: (menuId: string, url: string) => void;
  rememberScope: (scopeId: string) => void;
  /** Former space id → current id for the per-space resume store (`PlatformProvider.spaceIdMigrations`). */
  spaceIdMigrations: Readonly<Record<string, string>> | undefined;
};
export type UsageNavTrail = { user: string; via: MainUsageVia | null; seen: boolean; prev: string | null };
export type AppValue = { pub: AppState; internal: AppInternal };

export const AppContext = createContext<AppValue | null>(null);
export const MainBoundContext = createContext<MainBound | null>(null);
export const ScreenContext = createContext<ScreenState | null>(null);
// A pane gets its own context object: React re-renders every ScreenContext reader under the main provider when the main
// screen changes, even below a nested provider of the same context, so a shared object would wake all panes (C3).
export const PaneScreenContext = createContext<ScreenState | null>(null);
export const LentPanelPlatformContext = createContext<HostPlatform | null>(null);
/** Inside a lent panel: the receiving platform and the source output keys it may write, each to one receiver key (#2763). */
export type LentPanelOutputs = { receiver: HostPlatform; writerId: string; keys: ReadonlyMap<string, string> };
export const LentPanelOutputsContext = createContext<LentPanelOutputs | null>(null);

// Shell state that changes often lives in contexts of its own, one per concern, so a toast, an overlay or a visit wakes only its readers
// and never a menu, a chart or a table behind `usePlatform()` (ADR-0076 supplement, #824).
export type OverlayState = { paletteOpen: boolean; paletteSession: PaletteSession | null; switcherOpen: boolean; switcherSession: PaletteSession | null };
export const ToastsContext = createContext<readonly Toast[] | null>(null);
export const OverlayContext = createContext<OverlayState | null>(null);
export const RecentContext = createContext<readonly Recent[] | null>(null);

/** `redirect`: replace an alias address by its canonical one (ADR-0093) — the same arrival, so a pending focus request and the address-bar hash survive. */
export type AddressTransition = { from: string; to: string };
export type ScreenNavigationOptions = NonNullable<Parameters<HostPlatform['navigate']>[1]> & {
  restoreHidden?: readonly Pair[];
};
/** `redirect`: replace an alias address by its canonical one (ADR-0093) — the same arrival, so a pending focus request and the address-bar hash survive. */
export type CommitOptions = { carryProof?: CarryProof; skipOrigin?: boolean; analysisSelection?: boolean; preserveSelectionUndo?: boolean; focus?: PageFocus; materialize?: boolean; redirect?: boolean; /** With `redirect`: a retired menu's page preset (#2330), added for the keys the kept query does not hold. */ redirectPage?: Readonly<Record<string, string>>; /** Hidden pairs restored for the destination (a return trip, F1): validated against the destination's declared hidden keys. */ restoreHidden?: readonly Pair[]; /** Internal: replay of a move the person confirmed leaving; skips the unsaved-edit guard (ADR-0115). */ bypassGuard?: boolean; /** Host only: this `replace` is held by the unsaved-edit guard like a push (board open, #2061). */ guard?: boolean; /** Host only: runs once the move is certain (after any confirmed leave, just before the write); `false` cancels it. Replayed with the confirmed move (#2061). */ run?: (address: AddressTransition) => boolean };
export type ScreenAddress = {
  /** The browser URL for the main screen, or the pane's virtual path and query. */
  url: string;
  /** Main only: page pairs carried in the history entry, outside the browser URL (ADR-0105). */
  hidden?: readonly Pair[];
};

/** What the screen state hook needs from its owner: where the URL lives and how a write or a navigation lands. */
export type ScreenSource = ScreenAddress & {
  origin?: OriginRecord;
  mintCarry?: (href: string, carried: CarriedSelection, scopeId: string | null) => CarryProof;
  draftStore?: DraftStore;
  availability?: ScreenState['analysisSelectionAvailability'];
  mode: 'main' | 'pane';
  paneId: string | null;
  paneLabel?: string | null;
  /** Event-time write base, including any pane proposal since the rendered address. */
  readAddress: () => ScreenAddress | null;
  navigation: ReturnType<typeof createPageNavigation>;
  /** Writes this screen's own address (history for main, `onChange` for a pane). Stable identity. False when nothing was written. */
  commit: (next: string, how: 'push' | 'replace', options?: CommitOptions) => boolean;
  /** Imperative navigation to any app-relative href. Stable identity. */
  go: (href: string, options?: ScreenNavigationOptions) => boolean;
  /** A pane reads the sidebar space from the main screen; the main screen derives its own. */
  sidebarSpace?: SpaceDef | null;
  /** Main only: remember a Scope the server confirmed. */
  onScopeValid?: (scopeId: string) => void;
  /** False for a pane whose stay is already counted by its host. */
  countsUsage?: boolean;
};

/**
 * Consumes the pending navigation mark at the real entry (inside the stay's timer, so StrictMode's fake mount never
 * takes it) and moves the trail to this menu. Unmarked, the tab's first entry is `direct` with no previous menu; a new session
 * user starts the trail over so a previous user's menu never travels (docs/05, ADR-0020).
 */
export function takeNavigation(trail: UsageNavTrail, userId: string, menuId: string): { via: MainUsageVia; fromMenuId: string | null } {
  if (trail.user !== userId) Object.assign(trail, { user: userId, via: null, seen: false, prev: null });
  // A pending mark wins; with none, the tab's first entry is `direct` (opened, reloaded, typed) and a later one `link`.
  // A pane value that slipped past the types (a cast) is dropped: the server rejects a main entry carrying one.
  const marked = trail.via && !(PANE_USAGE_VIAS as readonly string[]).includes(trail.via) ? trail.via : null;
  const taken = { via: marked ?? (trail.seen ? 'link' : 'direct'), fromMenuId: trail.prev };
  Object.assign(trail, { via: null, seen: true, prev: menuId });
  return taken;
}

/**
 * Pane counterpart of `takeNavigation`: the first admitted screen of a pane is `paneOpen` (no previous menu), every later one
 * `paneReplace` with the menu the same pane showed right before. A new session user starts the trail over. Never persisted or shared.
 */
export type PaneUsageTrail = { user: string; seen: boolean; prev: string | null };
export function takePaneNavigation(trail: PaneUsageTrail, userId: string, menuId: string): { via: 'paneOpen' | 'paneReplace'; fromMenuId: string | null } {
  if (trail.user !== userId) Object.assign(trail, { user: userId, seen: false, prev: null });
  const taken = trail.seen ? { via: 'paneReplace' as const, fromMenuId: trail.prev } : { via: 'paneOpen' as const, fromMenuId: null };
  Object.assign(trail, { seen: true, prev: menuId });
  return taken;
}

export function makeStayId(): string {
  try { return crypto.randomUUID(); } catch { return `stay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}
