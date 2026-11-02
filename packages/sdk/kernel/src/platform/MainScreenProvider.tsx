import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hasDotSegment } from '../context/location';
import { readHiddenState, sameHidden, splitHidden, validateHidden, withHiddenState } from '../context/hiddenState';
import type { PageFocus } from '../context/pageNavigation';
import { routeParamNames } from '../registry/registry';
import { incompleteMetricPair, menuPermissions, isAppRelativePath, type Pair, type ParsedQuery, parseQuery, RETURN_TO_KEY, type SpaceId } from '@ap/contracts';
import { readSpaceLast, sameParams, writeSpaceLast } from './preferences';
import { MainBoundContext, ScreenContext, type AppValue, type CommitOptions, type MainBound, type ScreenSource } from './contexts';
import { useScreenState } from './useScreenState';

/** The main screen: the browser URL, history, and the shell navigation that follows it. */
export const MainScreenProvider = memo(function MainScreenProvider({ app, children }: { app: AppValue; children: ReactNode }) {
  const { location, registry, can, canOpen, accessibleSpaces, menusInSpace, user } = app.pub;
  const { enters, mainNavigation: pageNavigation, initialUrl, recordVisit, rememberScope, spaceIdMigrations } = app.internal;
  const { matchRoute } = registry;
  const userId = user.id;
  // Hidden page keys (ADR-0105): `url` is the visible address; the hidden pairs ride in the history entry's state and are mirrored here.
  const menuFor = useCallback((href: string) => matchRoute(href.split('?')[0])?.menu, [matchRoute]);
  const hiddenKeysFor = useCallback((href: string): readonly string[] => menuFor(href)?.hiddenPageKeys ?? [], [menuFor]);
  // An address that still carries hidden keys (share link, load, Back to an old entry) is split; otherwise the entry's own state decides.
  const arrive = useCallback((raw: string, fromState: Pair[]): { url: string; hidden: Pair[]; rewrite: boolean } => {
    const keys = hiddenKeysFor(raw);
    if (keys.length === 0) return { url: raw, hidden: [], rewrite: false };
    const split = splitHidden(raw, keys);
    if (split.hidden.length > 0) return { url: split.url, hidden: split.hidden, rewrite: true };
    return { url: raw, hidden: fromState.filter(([key]) => keys.includes(key)), rewrite: false };
  }, [hiddenKeysFor]);
  const [{ arrival, url, hidden }, setView] = useState(() => {
    const arrival = arrive(initialUrl, readHiddenState(location.readState?.()));
    return { arrival, url: arrival.url, hidden: arrival.hidden };
  });
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  // The newest arrival record: a commit or a traversal that lands before the rewrite below runs replaces it, which cancels that rewrite.
  const latestArrival = useRef(arrival);
  // The one rewrite of the arrival address: same history entry, no new entry (replace), the fragment stays.
  useEffect(() => {
    if (!arrival.rewrite || latestArrival.current !== arrival) return;
    pageNavigation.redirect(arrival.url);
    location.replace(arrival.url, { keepFragment: true, state: withHiddenState(location.readState?.(), arrival.hidden) });
  }, [arrival, location, pageNavigation]);

  const commit = useCallback((next: string, how: 'push' | 'replace', options: CommitOptions = {}) => {
    if (options.redirect) { // a write that landed before this effect ran keeps its query: only the path is ours
      const current = location.read() ?? '';
      const q = current.indexOf('?');
      next = next.split('?')[0] + (q === -1 ? '' : current.slice(q));
    }
    // A redirect destination was built by pathFor and checked by the caller (same menu, same params); its query is the address's own and already
    // passed the URL reader, so the return-link guard (which also rejects a decoded `#` or `:`) does not apply to it.
    const allowed = options.redirect ? next.startsWith('/') && !next.startsWith('//') && !/[#\\\u0000-\u001F\u007F]/.test(next.split('?')[0]) : isAppRelativePath(next);
    // Hidden keys of the destination leave the address and travel in the entry's state; an alias redirect keeps the hidden pairs of the entry it replaces.
    const keys = hiddenKeysFor(next);
    const split = splitHidden(next, keys);
    // A return trip restores the hidden pairs the origin held, checked against what the destination declares (F1).
    const nextHidden = options.redirect ? hiddenRef.current : split.hidden.length > 0 || !options.restoreHidden ? split.hidden : validateHidden(options.restoreHidden, menuFor(next));
    if (!allowed || (split.url === (location.read() ?? '') && sameHidden(nextHidden, hiddenRef.current))) { if (!options.materialize) pageNavigation.cancel(); return false; }
    if (options.redirect) pageNavigation.redirect(split.url);
    else if (options.materialize) pageNavigation.materialize(split.url);
    else pageNavigation.advance(split.url, options.focus);
    // The URL state carries pathname + search only; a kernel rewrite of the same arrival keeps the fragment in the same history write.
    // A menu that declares no hidden keys writes no state, exactly as before.
    const declares = keys.length > 0;
    if (how === 'replace') location.replace(split.url, { keepFragment: options.redirect || options.materialize, ...(declares ? { state: withHiddenState(location.readState?.(), nextHidden) } : {}) });
    else if (declares) location.push(split.url, withHiddenState(null, nextHidden)); else location.push(split.url);
    hiddenRef.current = nextHidden;
    const committed = { url: split.url, hidden: nextHidden, rewrite: false };
    latestArrival.current = committed;
    setView({ arrival: committed, url: location.read() ?? '', hidden: nextHidden });
    if (how === 'push') document.getElementById('platform-main')?.scrollTo({ top: 0 });
    return true;
  }, [pageNavigation, location, hiddenKeysFor, menuFor]);
  const go = useCallback((next: string, options?: { replace?: boolean; focus?: PageFocus; restoreHidden?: readonly Pair[] }) => commit(next, options?.replace ? 'replace' : 'push', { focus: options?.focus, restoreHidden: options?.restoreHidden }), [commit]);

  const source: ScreenSource = { mode: 'main', paneId: null, paneLabel: null, url, hidden, navigation: pageNavigation, commit, go, onScopeValid: rememberScope };
  const { screen, sidebarSpace, resolveEntryLink } = useScreenState(app, source);
  const { pathname, route, contractError, navigate, currentSpace } = screen;

  useEffect(() => {
    const onPop = () => {
      const raw = location.read() ?? '';
      const arrived = arrive(raw, readHiddenState(location.readState?.()));
      const next = arrived.url;
      // An old entry that still carries hidden keys in its address is tidied in place (same entry).
      if (arrived.rewrite) location.replace(next, { keepFragment: true, state: withHiddenState(location.readState?.(), arrived.hidden) });
      // Back/Forward across menus arrives like a link (06 §26): the title takes focus and a carried
      // `focus=` does not claim the detail panel (ADR-0032). Same-screen history keeps the close-button claim.
      pageNavigation.advance(next, next.split('?')[0] !== pathname ? 'page' : undefined);
      app.internal.usageNav.current.via = 'history';
      hiddenRef.current = arrived.hidden;
      const traversed = { url: next, hidden: arrived.hidden, rewrite: false };
      latestArrival.current = traversed;
      setView({ arrival: traversed, url: next, hidden: arrived.hidden });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [pageNavigation, location, pathname, app.internal.usageNav, arrive]);

  // Recent visits (the main screen's own history; a pane never writes them).
  useEffect(() => {
    if (!route || route.viaAlias || contractError || !menuPermissions(route.menu).every(can)) return;
    if (!enters(route.menu)) return;
    const space = registry.spaceOf(route.menu);
    if (space !== null) writeSpaceLast(userId, space.id, url, spaceIdMigrations);
    recordVisit(route.menu.id, url);
  }, [url, route, contractError, userId, can, enters, registry, recordVisit, spaceIdMigrations]);

  const visibleMenus = useMemo(() => (sidebarSpace === null ? [] : menusInSpace(sidebarSpace.id)), [menusInSpace, sidebarSpace]);
  // Read at call time. Stored globals are not restored. Entries start clean: they carry the current global but never the current carry-set page state, and only the target's own stored page values come back.
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
    try { parsed = parseQuery(search, matched.menu.pageKeys, { repeated: matched.menu.repeatedPageKeys }); } catch { return null; }
    if (incompleteMetricPair(matched.menu, parsed.global.metricId, parsed.global.metricVersion)) return null;
    // Every pair of a repeated key stays, in order (a record would keep only the last).
    const page: Record<string, string | string[]> = {};
    for (const [key, value] of parsed.page) {
      if (key === RETURN_TO_KEY) continue;
      const seen = page[key];
      page[key] = seen === undefined ? (matched.menu.repeatedPageKeys?.includes(key) ? [value] : value) : [...(Array.isArray(seen) ? seen : [seen]), value];
    }
    const href = resolveEntryLink(matched.menu.id, { params: matched.params, page }).href;
    let normalized: string;
    try { normalized = new URL(href, 'http://x').pathname; } catch { return null; }
    const again = matchRoute(normalized);
    if (!again || again.menu.id !== matched.menu.id || !sameParams(again.params, matched.params)) return null;
    return { menuId: matched.menu.id, href };
  }, [userId, matchRoute, registry, canOpen, resolveEntryLink, spaceIdMigrations]);
  const spaceEntry = useCallback((spaceId: SpaceId): { menuId: string; href: string; resumed: boolean } | null => {
    const space = accessibleSpaces.find(s => s.id === spaceId);
    if (!space) return null;
    const resume = spaceResume(spaceId);
    if (resume) return { ...resume, resumed: true };
    if (canOpen(space.homeMenuId)) return { menuId: space.homeMenuId, href: resolveEntryLink(space.homeMenuId).href, resumed: false };
    for (const group of registry.groups) {
      if (group.space !== spaceId) continue;
      const menu = registry.menus.find(m => m.group === group.id && !m.navHidden && routeParamNames(m.path).length === 0 && canOpen(m.id));
      if (menu) return { menuId: menu.id, href: resolveEntryLink(menu.id).href, resumed: false };
    }
    return null;
  }, [accessibleSpaces, spaceResume, canOpen, resolveEntryLink, registry]);
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
