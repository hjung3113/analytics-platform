import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageFocus } from '../context/pageNavigation';
import { classifyMetricInit, sameMetricInit } from '../registry/metric-init';
import { sameItems, useStable } from '../stable';
import { isBoardPath, pathFor, type MenuEntry } from '../registry/registry';
import { useI18n } from '../i18n';
import { hasDotSegment } from '../context/location';
import { sameParams } from './preferences';
import { dropResetKeys } from '../context/paneContext';
import { dropDrillResetKeys } from '../context/drillReset';
import { appliedQueryPolicy, useScreenDraft } from '../query/draft-state';
import { buildQuery, carriesReturnTo, clientCorrelationId, ContractError, emptyGlobal, incompleteMetricPair, menuPermissions, type GlobalContext, type Pair, type ParsedQuery, parseQuery, RETURN_TO_KEY, sameGlobal, shift, type SpaceDef, type Text, type UsageEvent, type UsageVia } from '@ap/contracts';
import type { HostPlatform, LinkOptions, LinkResolution, ReturnContextKey, ReturnOrigin, ScopeState } from './types';
import { makeStayId, takeNavigation, type AppValue, type ScreenSource, type ScreenState } from './contexts';

function sameQueryPolicy(a: HostPlatform['queryPolicy'], b: HostPlatform['queryPolicy']): boolean {
  return a.ready === b.ready && a.idle === b.idle && JSON.stringify(a.missing) === JSON.stringify(b.missing);
}
function sameScopeState(a: ScopeState, b: ScopeState): boolean {
  return a.scopeId === b.scopeId && a.status === b.status && a.validatedFor === b.validatedFor && sameItems(a.grantedRooms, b.grantedRooms);
}
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
/**
 * Everything derived from one screen's address (06 §6.4): route, Context, page state, writes, links, Scope and the
 * usage stay. The main screen feeds it the browser URL; a board pane feeds it its own `PaneScreen` (ADR-0049), so
 * the same rules run per screen.
 */
export function useScreenState(app: AppValue, source: ScreenSource): { screen: ScreenState; sidebarSpace: SpaceDef | null } {
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
  const route = useMemo(() => {
    if (outsideDeployment || platformScreen !== null) return null;
    const matched = matchRoute(pathname);
    if (!matched?.viaAlias) return matched;
    // The redirect destination must open the same menu with the same decoded params (a dot segment or an empty value would not): otherwise the alias is not a route.
    const destination = pathFor(matched.menu, matched.params);
    if (hasDotSegment(destination)) return null;
    const back = matchRoute(destination);
    return back && !back.viaAlias && back.menu.id === matched.menu.id && sameParams(back.params, matched.params) ? matched : null;
  }, [matchRoute, pathname, outsideDeployment, platformScreen]);
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
  const routeMenu = route?.menu ?? null;
  const routeContractError = useMemo(
    () => contractError ?? incompleteMetricPair(routeMenu, global.metricId, global.metricVersion),
    [contractError, routeMenu, global.metricId, global.metricVersion],
  );
  const metricInit = useStable(classifyMetricInit(adapter.publishedMetrics(), route?.menu.initializesMetric === true, global.metricId, global.metricVersion), sameMetricInit);
  const page = useMemo(() => parsed?.page ?? [], [parsed]);
  const extras = useMemo(() => parsed?.extras ?? [], [parsed]);

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

  // A patch that changes a drill level value also drops the menu's `drill.resetKeys` in the same write (one history entry, 06 §6.4).
  const setPage = useCallback((requested: Record<string, string | null>, options?: { replace?: boolean; focus?: PageFocus }) => {
    const patch = dropDrillResetKeys(route?.menu, page, requested);
    const keys = Object.keys(patch);
    const kept = page.filter(([k]) => !keys.includes(k));
    const added = Object.entries(patch).filter((e): e is [string, string] => e[1] !== null && e[1] !== '');
    write(pathname + buildQuery(global, [...kept, ...added], extras), options);
  }, [global, page, extras, pathname, write, route]);

  // Reset clears analysis Context but keeps the requested Scope (a separate header control).
  const resetContext = useCallback(() => {
    const next: GlobalContext = { ...emptyGlobal, scopeId: global.scopeId };
    write(pathname + buildQuery(next, dropContextResetKeys(page, next), extras));
  }, [pathname, write, global, page, extras, dropContextResetKeys]);

  // Context Link helper (§22/§6.4): every registered global is preserved regardless of target support;
  // page-owned state and unregistered extras are never copied implicitly — the one exception is a space's
  // `carriedPageKeys` between menus of that same space (ADR-0081 decision 4). Changing the site applies the same
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
    const pagePairs: Pair[] = [];
    for (const [k, v] of requested) if (v !== null && target.pageKeys.includes(k)) pagePairs.push([k, v]);
    // Carried keys: same space, space declares them, target declares them; explicit value wins, explicit null omits.
    // A space that carries `returnTo` only carries it: inside that space `options.returnTo` never mints or replaces the origin (#760, ADR-0081 UX-10).
    const targetSpace = registry.spaceOf(target);
    let sameCarryingSpace = false;
    if (route && targetSpace && registry.spaceOf(route.menu)?.id === targetSpace.id) {
      sameCarryingSpace = carriesReturnTo(targetSpace);
      for (const k of targetSpace.carriedPageKeys ?? []) {
        if (!target.pageKeys.includes(k) || options.page?.[k] !== undefined) continue;
        const current = page.find(([pk]) => pk === k);
        if (current) pagePairs.push(current);
      }
    }
    if (options.returnTo && !sameCarryingSpace && target.pageKeys.includes(RETURN_TO_KEY) && !pagePairs.some(([k]) => k === RETURN_TO_KEY)) pagePairs.push([RETURN_TO_KEY, url]);
    return {
      href: pathFor(target, options.params) + buildQuery(g, pagePairs),
      allowed: canOpen(menuId),
      droppedPageKeys: requested.map(([k]) => k).filter(k => !target.pageKeys.includes(k)),
    };
  }, [global, url, menuById, canOpen, page, route, registry]);
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
  const maskedScope: ScopeState = scopeMasked
    ? global.scopeId === null
      ? { scopeId: null, status: 'none', validatedFor: session, grantedRooms: [] }
      : { scopeId: global.scopeId, status: 'validating', validatedFor: session, grantedRooms: [] }
    : scope;
  const scopeView = useStable(maskedScope, sameScopeState);

  // Materialize the default period for time-applying menus (§6.3/§6.4: absolute from/to written into the address)
  // and the server-confirmed metric version in ONE replace computed from the same parsed snapshot. The initial Δ
  // (24h here) is an Open decision; this prototype uses the 1-day preset as a Candidate. A pane's `onChange` is a
  // controlled callback that may not echo at once, so the same input/output proposal is made only once; a changed
  // input (or nothing left to do) re-arms it.
  const proposed = useRef<string | null>(null);
  useEffect(() => {
    // Alias entry (ADR-0093): one replace of the path alone — the search is the current address's, byte for byte. A default period
    // or metric version is materialized afterwards on the canonical address, as for any visit, so no query runs on the alias.
    if (mode === 'main' && route?.viaAlias) { commit(pathFor(route.menu, route.params) + search, 'replace', { redirect: true }); return; }
    if (!route || routeContractError) return;
    let next = global;
    if (route.menu.query?.mode !== 'apply' && route.menu.context.time === 'apply' && global.from === null && defaultRangeTo !== null) next = { ...next, from: shift(defaultRangeTo, -24), to: defaultRangeTo };
    if (metricInit.phase === 'confirm') next = { ...next, metricVersion: metricInit.metricVersion };
    if (next === global) { proposed.current = null; return; }
    const target = pathname + buildQuery(next, page, extras);
    const key = `${url}\0${target}`;
    if (proposed.current === key) return;
    proposed.current = key;
    commit(target, 'replace', { materialize: true });
  }, [mode, search, route, routeContractError, global, metricInit, page, extras, pathname, url, commit, defaultRangeTo]);

  useLayoutEffect(() => {
    // A platform screen takes its own arrival focus; "no route" must not cancel the request for it.
    if (platformScreen !== null) return;
    if (!route || routeContractError || !menuPermissions(route.menu).every(can) || !enters(route.menu) || metricInit.phase === 'blocked') pageNavigation.cancel();
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
    // An alias entry in the main screen is replaced by its canonical address next: it is not a stay, and it keeps the trail.
    if (countsUsage && mode === 'main' && route?.viaAlias) return;
    if (!countsUsage || !route || routeContractError || !menuPermissions(route.menu).every(can) || !enters(route.menu)) {
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
    const safe = safeReturnTo(pageParam(RETURN_TO_KEY));
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
        return { href: safe, menuLabel: matched.menu.label, trail: consecutiveDrillTrail(matched.menu, search), revertedContext, accepted: true, spaceLabel: registry.spaceOf(matched.menu)?.label ?? null };
      }
    }
    if (route?.menu.parent && canOpen(route.menu.parent)) {
      return { href: linkTo(route.menu.parent), menuLabel: menuById(route.menu.parent).label, trail: [], revertedContext: [], accepted: false, spaceLabel: null };
    }
    const platformHome = registry.platformHome;
    const spaceHome = sidebarSpace ? menuById(sidebarSpace.homeMenuId) : null;
    const home = platformHome && canOpen(platformHome.id) ? platformHome
      : spaceHome && canOpen(spaceHome.id) ? spaceHome : null;
    if (home) return { href: linkTo(home.id), menuLabel: home.label, trail: [], revertedContext: [], accepted: false, spaceLabel: null };
    // Emergency exception-prevention fallback only; '/' is not guaranteed to be a valid or accessible home.
    return { href: '/', menuLabel: { ko: '홈', en: 'Home' }, trail: [], revertedContext: [], accepted: false, spaceLabel: null };
  }, [pageParam, safeReturnTo, matchRoute, route, linkTo, menuById, sidebarSpace, canOpen, global, registry]);
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

  const queryPolicy = useStable({ ...appliedQueryPolicy(route?.menu ?? null, global, page, routeContractError !== null || metricInit.phase !== 'skip'),
    ready: route?.menu.query?.mode !== 'apply' || !route.menu.requiresScope || (scopeView.status === 'valid' && scopeView.scopeId === global.scopeId && scopeView.validatedFor === session) }, sameQueryPolicy);
  const { queryDraft, queryHistory } = useScreenDraft({ store: source.draftStore, menu: route?.menu ?? null, identity: `${route?.menu.id ?? ''}\0${pathname}`, session, url,
    global, page, extras, defaultRangeTo, scope: scopeView, adapter, axes: equipmentAxes, invalid: routeContractError !== null,
    commit, setGlobal, setPage, history: app.pub.queryHistoryStore, revision: app.pub.revision, currentRevision: app.internal.currentRevision, allowed: route !== null && app.pub.canOpen(route.menu.id) });
  const screen = useMemo((): ScreenState => ({ queryDraft, queryHistory, queryPolicy,
    url, pathname, route, platformScreen, pageNavigation, contractError: routeContractError, metricInit, global, page, extras, pageParam, navigate, setGlobal, setPage, resetContext, linkTo, resolveLink, reportError, returnTarget, returnOrigin,
    currentSpace, scope: scopeView, retryScope, screenMode: mode, paneId, paneLabel,
  }), [queryDraft, queryHistory, queryPolicy, url, pathname, route, platformScreen, pageNavigation, routeContractError, metricInit, global, page, extras, pageParam, navigate, setGlobal, setPage, resetContext, linkTo, resolveLink, reportError, returnTarget, returnOrigin, currentSpace, scopeView, retryScope, mode, paneId, paneLabel]);
  return { screen, sidebarSpace };
}
