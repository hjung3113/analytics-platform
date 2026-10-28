import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasDotSegment } from '../context/location';
import type { PageFocus } from '../context/pageNavigation';
import { routeParamNames } from '../registry/registry';
import { incompleteMetricPair, menuPermissions, isAppRelativePath, type ParsedQuery, parseQuery, type SpaceId } from '@ap/contracts';
import { readSpaceLast, sameParams, writeSpaceLast } from './preferences';
import { MainBoundContext, ScreenContext, type AppValue, type CommitOptions, type MainBound, type ScreenSource } from './contexts';
import { useScreenState } from './useScreenState';

/** The main screen: the browser URL, history, and the shell navigation that follows it. */
export const MainScreenProvider = memo(function MainScreenProvider({ app, children }: { app: AppValue; children: ReactNode }) {
  const { location, registry, can, canOpen, accessibleSpaces, menusInSpace, user } = app.pub;
  const { enters, mainNavigation: pageNavigation, initialUrl, recordVisit, rememberScope, spaceIdMigrations } = app.internal;
  const { matchRoute } = registry;
  const userId = user.id;
  const [url, setUrl] = useState(initialUrl);

  const commit = useCallback((next: string, how: 'push' | 'replace', options: CommitOptions = {}) => {
    if (options.redirect) { // a write that landed before this effect ran keeps its query: only the path is ours
      const current = location.read() ?? '';
      const q = current.indexOf('?');
      next = next.split('?')[0] + (q === -1 ? '' : current.slice(q));
    }
    // A redirect destination was built by pathFor and checked by the caller (same menu, same params); its query is the address's own and already
    // passed the URL reader, so the return-link guard (which also rejects a decoded `#` or `:`) does not apply to it.
    const allowed = options.redirect ? next.startsWith('/') && !next.startsWith('//') && !/[#\\\u0000-\u001F\u007F]/.test(next.split('?')[0]) : isAppRelativePath(next);
    if (!allowed || next === (location.read() ?? '')) { if (!options.materialize) pageNavigation.cancel(); return false; }
    if (options.redirect) pageNavigation.redirect(next);
    else if (options.materialize) pageNavigation.materialize(next);
    else pageNavigation.advance(next, options.focus);
    // The URL state carries pathname + search only; a kernel rewrite of the same arrival keeps the fragment in the same history write.
    if (how === 'replace') location.replace(next, { keepFragment: options.redirect || options.materialize }); else location.push(next);
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
    if (!route || route.viaAlias || contractError || !menuPermissions(route.menu).every(can)) return;
    if (!enters(route.menu)) return;
    const space = registry.spaceOf(route.menu);
    if (space !== null) writeSpaceLast(userId, space.id, url, spaceIdMigrations);
    recordVisit(route.menu.id, url);
  }, [url, route, contractError, userId, can, enters, registry, recordVisit, spaceIdMigrations]);

  const visibleMenus = useMemo(() => (sidebarSpace === null ? [] : menusInSpace(sidebarSpace.id)), [menusInSpace, sidebarSpace]);
  // Read at call time. Stored globals are not restored: resolveLink carries the current global and the menu's page keys only.
  const spaceResume = useCallback((spaceId: SpaceId): { menuId: string; href: string } | null => {
    const stored = readSpaceLast(userId, spaceIdMigrations)[spaceId];
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
  }, [userId, matchRoute, registry, canOpen, resolveLink, spaceIdMigrations]);
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
});
