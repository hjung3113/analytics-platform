import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hasDotSegment } from '../context/location';
import { createPageNavigation, type PageFocus } from '../context/pageNavigation';
import { paneHref } from '../context/paneContext';
import { createDraftStore, type DraftStore } from '../query/draft-state';
import { isAppRelativePath } from '@ap/contracts';
import { AppContext, MainBoundContext, PaneScreenContext, type CommitOptions, type ScreenSource } from './contexts';
import { useScreenState } from './useScreenState';

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
