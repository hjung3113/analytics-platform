import { createContext } from 'react';
import type { PaletteSession } from '../context/paletteFocus';
import type { PageFocus, createPageNavigation } from '../context/pageNavigation';
import type { PortCache } from '../scope/selection-port-cache';
import type { MenuEntry } from '../registry/registry';
import type { DraftStore } from '../query/draft-state';
import type { QueryEngine } from '../query/query-engine';
import type { Pair, SpaceDef, UsageVia } from '@ap/contracts';
import type { SupportRegistry } from '../saved-view/useSavedViewSupport';
import type { HostPlatform, Recent, Toast } from './types';

/** Fields of the screen state: what a menu page reads about the screen it is shown on (the main screen or one board pane). */
export type ScreenFields = 'queryHistory' | 'queryDraft' | 'queryPolicy' | 'url' | 'pathname' | 'route' | 'platformScreen' | 'contractError' | 'metricInit' | 'global' | 'page' | 'extras' | 'pageParam' | 'pageParams' | 'pageNavigation' | 'navigate' | 'setGlobal' | 'setPage' | 'resetContext' | 'linkTo' | 'resolveLink' | 'reportError' | 'returnTarget' | 'returnOrigin' | 'scope' | 'retryScope' | 'currentSpace';
/** Shell navigation state that always follows the main screen, even when read from inside a pane (ADR-0049). */
export type MainBoundFields = 'visibleMenus' | 'sidebarSpace' | 'spaceResume' | 'spaceEntry' | 'switchSpace';
export type ScreenState = Pick<HostPlatform, ScreenFields | 'screenMode' | 'paneId' | 'paneLabel'>;
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
  userIdRef: { readonly current: string };
  /** Main-screen navigation trail for usage `entry` (#605): the last navigation's `via` and the menu of the screen shown before. Never persisted. */
  usageNav: { current: UsageNavTrail };
  mainNavigation: ReturnType<typeof createPageNavigation>;
  initialUrl: string;
  recordVisit: (menuId: string, url: string) => void;
  rememberScope: (scopeId: string) => void;
  /** Former space id → current id for the per-space resume store (`PlatformProvider.spaceIdMigrations`). */
  spaceIdMigrations: Readonly<Record<string, string>> | undefined;
};
export type UsageNavTrail = { user: string; via: UsageVia | null; seen: boolean; prev: string | null };
export type AppValue = { pub: AppState; internal: AppInternal };

export const AppContext = createContext<AppValue | null>(null);
export const MainBoundContext = createContext<MainBound | null>(null);
export const ScreenContext = createContext<ScreenState | null>(null);
// A pane gets its own context object: React re-renders every ScreenContext reader under the main provider when the main
// screen changes, even below a nested provider of the same context, so a shared object would wake all panes (C3).
export const PaneScreenContext = createContext<ScreenState | null>(null);

// Shell state that changes often lives in contexts of its own, one per concern, so a toast, an overlay or a visit wakes only its readers
// and never a menu, a chart or a table behind `usePlatform()` (ADR-0076 supplement, #824).
export type OverlayState = { paletteOpen: boolean; paletteSession: PaletteSession | null; switcherOpen: boolean; switcherSession: PaletteSession | null };
export const ToastsContext = createContext<readonly Toast[] | null>(null);
export const OverlayContext = createContext<OverlayState | null>(null);
export const RecentContext = createContext<readonly Recent[] | null>(null);

/** `redirect`: replace an alias address by its canonical one (ADR-0093) — the same arrival, so a pending focus request and the address-bar hash survive. */
export type CommitOptions = { focus?: PageFocus; materialize?: boolean; redirect?: boolean };
/** What the screen state hook needs from its owner: where the URL lives and how a write or a navigation lands. */
export type ScreenSource = {
  draftStore?: DraftStore;
  mode: 'main' | 'pane';
  paneId: string | null;
  paneLabel?: string | null;
  /** The screen's address: the browser URL for the main screen, the pane's virtual path plus its own query. */
  url: string;
  /** Main only: the hidden page pairs of the entry (`hiddenPageKeys`, ADR-0105). They are page state like the pairs in `url` but are not part of the address. A pane has none: its query holds every key. */
  hidden?: readonly Pair[];
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
export function takeNavigation(trail: UsageNavTrail, userId: string, menuId: string): { via: UsageVia; fromMenuId: string | null } {
  if (trail.user !== userId) Object.assign(trail, { user: userId, via: null, seen: false, prev: null });
  // A pending mark wins; with none, the tab's first entry is `direct` (opened, reloaded, typed) and a later one `link`.
  const taken = { via: trail.via ?? (trail.seen ? 'link' : 'direct'), fromMenuId: trail.prev };
  Object.assign(trail, { via: null, seen: true, prev: menuId });
  return taken;
}

export function makeStayId(): string {
  try { return crypto.randomUUID(); } catch { return `stay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}
