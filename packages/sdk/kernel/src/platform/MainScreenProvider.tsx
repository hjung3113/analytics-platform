import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { hasDotSegment, isAppPath } from '../context/location';
import { readHiddenState, sameHidden, splitHidden, validateHidden, withHiddenState } from '../context/hiddenState';
import { stripDetailExpansion } from '../links/detail-expansion';
import { isImplementedMenu, routeParamNames, withPagePreset } from '../registry/registry';
import { incompleteMetricPair, menuPermissions, isAppRelativePath, type Pair, type ParsedQuery, parseQuery, RETURN_TO_KEY, type SpaceId } from '@ap/contracts';
import { readSpaceLast, sameParams, writeSpaceLast } from './preferences';
import { MainBoundContext, ScreenContext, type AppValue, type CommitOptions, type MainBound, type ScreenSource } from './contexts';
import { useScreenState } from './useScreenState';
import { createMyMenuPick, MyMenuPickContext, type MyMenuPick, type OpenMyMenu } from '../saved-view/my-menus';
import { ScreenSavedViews } from '../saved-view/useSavedViews';
import { createOriginHistory, originPosition, recordOrigin, type OriginRecord } from './return-origin';
import { readHistoryIdx, readHistorySeg, withHistoryIdx } from './navigationGuard';

type MainCommitOptions = CommitOptions & { myMenuPick?: MyMenuPick };

const editableTarget = 'input, textarea, select, [role="textbox"], [role="combobox"]';
const openOverlay = 'dialog[open], [role="dialog"]:not([aria-modal="false"]):not([data-state="closed"]), [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';
// `data-floating-window` marks a shown floating frame (window or fill), title bar included. The frame's mode attribute name is a
// lazy-chunk marker (tooling/scripts/check-lazy-chunks.mjs), so this start-up module must not spell it.
const boardOrWindow = '[data-pane-id], [data-board-host], [data-floating-window]';

function isAnalysisUndo(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.shiftKey || event.altKey
    || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return false;
  const focused = document.activeElement;
  if ((event.target instanceof Element && event.target.closest(boardOrWindow)) || focused?.closest(boardOrWindow)) return false;
  if (focused instanceof HTMLElement && (focused.isContentEditable || focused.closest(`${editableTarget}, [role="dialog"], dialog[open]`))) return false;
  return !Array.from(document.querySelectorAll(openOverlay)).some(node => !node.closest('[hidden], [aria-hidden="true"]'));
}

/** The main screen: the browser URL, history, and the shell navigation that follows it. */
export const MainScreenProvider = memo(function MainScreenProvider({ app, children }: { app: AppValue; children: ReactNode }) {
  const { location, registry, can, canOpen, accessibleSpaces, menusInSpace, user, isCurrentGeneration } = app.pub;
  const { enters, mainNavigation: pageNavigation, guard, usageNav, initialUrl, recordVisit, rememberScope, spaceIdMigrations } = app.internal;
  const { matchRoute } = registry;
  const userId = user.id;
  // Hidden page keys (ADR-0105): `url` is the visible address; the hidden pairs ride in the history entry's state and are mirrored here.
  const menuFor = useCallback((href: string) => {
    const [path = ''] = href.split('?');
    return matchRoute(path)?.menu;
  }, [matchRoute]);
  const hiddenKeysFor = useCallback((href: string): readonly string[] => menuFor(href)?.hiddenPageKeys ?? [], [menuFor]);
  // An address that still carries hidden keys (share link, load, Back to an old entry) is split; otherwise the entry's own state decides.
  const arrive = useCallback((raw: string, fromState: Pair[]): { url: string; hidden: Pair[]; rewrite: boolean } => {
    const keys = hiddenKeysFor(raw);
    if (keys.length === 0) return { url: raw, hidden: [], rewrite: false };
    const split = splitHidden(raw, keys);
    if (split.hidden.length > 0) return { url: split.url, hidden: split.hidden, rewrite: true };
    return { url: raw, hidden: fromState.filter(([key]) => keys.includes(key)), rewrite: false };
  }, [hiddenKeysFor]);
  const originHistory = useMemo(() => createOriginHistory(registry, isCurrentGeneration), [registry, isCurrentGeneration]);
  const [{ arrival, url, hidden, pick: storedPick, myMenuVisit }, setView] = useState(() => {
    const arrival: ReturnType<typeof arrive> & { generation: symbol; origin?: { history: typeof originHistory; record: OriginRecord } }
      = { ...arrive(initialUrl, readHiddenState(location.readState?.())), generation: Symbol() };
    return { arrival, url: arrival.url, hidden: arrival.hidden, pick: undefined as MyMenuPick | undefined, myMenuVisit: 0 };
  });
  // Writes and traversals publish here before React renders. A newer arrival also supersedes a pending rewrite.
  const latestArrival = useRef(arrival);
  const activePick = useRef<MyMenuPick | undefined>(undefined);
  const pick = storedPick?.generation === isCurrentGeneration ? storedPick : undefined;
  const readAddress = useCallback(() => latestArrival.current, []);
  // Unsaved-edit guard (ADR-0115). `idxRef`: this entry's position in the Kernel's own writes (`apIdx`), null where the boundary keeps no state.
  const [bootIdx] = useState(() => readHistoryIdx(location.readState?.()));
  const idxRef = useRef<number | null>(bootIdx);
  // The numbering segment of the entry on screen (null = unnamed). A rebase always names a NEW segment, so no write ever continues an older one (R2-1).
  const segRef = useRef<string | null>(bootIdx === null ? null : readHistorySeg(location.readState?.()));
  // Memory only. Each entry marks a selection-only push whose adjacent predecessor can safely be reached by Back.
  const selectionSteps = useRef(new Map<number, string>());
  const selectionUndoPending = useRef(false);
  const stamping = location.readState !== undefined;
  const commitRef = useRef<((next: string, how: 'push' | 'replace', options?: MainCommitOptions) => boolean) | null>(null);
  // Refusals raised before the reporter is wired (a child's first layout effect runs before this provider's) wait here and are delivered once.
  const reportRef = useRef<((error: unknown) => string) | null>(null);
  const pendingRef = useRef<unknown[]>([]);
  // The one rewrite of the arrival address: same history entry, no new entry (replace), the fragment stays.
  useEffect(() => {
    if (!arrival.rewrite || latestArrival.current !== arrival) return;
    pageNavigation.redirect(arrival.url);
    location.replace(arrival.url, { keepFragment: true, state: withHiddenState(location.readState?.(), arrival.hidden) });
  }, [arrival, location, pageNavigation]);

  const commit = useCallback((next: string, how: 'push' | 'replace', options: MainCommitOptions = {}) => {
    if (options.redirect) { // a write that landed before this effect ran keeps its query: only the path is ours
      const current = location.read() ?? '';
      const q = current.indexOf('?');
      next = next.split('?')[0] + withPagePreset(q === -1 ? '' : current.slice(q), options.redirectPage);
    }
    // One path-only check for every write (#1875): query values are codec-encoded, and the return-link guard (`isAppRelativePath`, which also
    // rejects a decoded `#`, `\`, `//` or `:` anywhere) is for a `returnTo` value, not for the address the Kernel writes.
    if (!isAppPath(next)) {
      if (!options.materialize) pageNavigation.cancel();
      const error = new Error('NavTargetRefused');
      error.name = 'NavTargetRefused';
      if (reportRef.current) reportRef.current(error);
      else pendingRef.current.push(error);
      return false;
    }
    // Hidden keys of the destination leave the address and travel in the entry's state; an alias redirect keeps the hidden pairs of the entry it replaces.
    const keys = hiddenKeysFor(next);
    const split = splitHidden(next, keys);
    // A return trip restores the hidden pairs the origin held, checked against what the destination declares (F1).
    const previousHidden = latestArrival.current.hidden;
    const nextHidden = options.redirect ? previousHidden : split.hidden.length > 0 || !options.restoreHidden ? split.hidden : validateHidden(options.restoreHidden, menuFor(next));
    if (split.url === (location.read() ?? '') && sameHidden(nextHidden, previousHidden)) { if (!options.materialize) pageNavigation.cancel(); return false; }
    const moveBlocked = (how === 'push' || options.guard === true) && !options.redirect && !options.materialize && !options.bypassGuard;
    // Leaving with unsaved edits asks first (ADR-0115). Redirects, arrival materialization, `replace` and the confirmed replay are never held;
    // a host `replace` with `guard` (opening the board, #2061) is held like a push.
    if (moveBlocked) {
      const change = { from: location.read() ?? '', to: split.url };
      if (guard.shouldBlock(change)) {
        if (!guard.pending()) {
          const via = usageNav.current.via;
          guard.request({ change, destination: menuFor(next)?.label ?? null, via, proceed: () => { usageNav.current.via = via; commitRef.current?.(next, how, { ...options, bypassGuard: true }); } });
        }
        pageNavigation.cancel();
        return false;
      }
    }
    // The host's own step (#2061): after any confirmed leave and before the write, so a cancelled leave never runs it; it may still refuse.
    if (options.myMenuPick && (!options.myMenuPick.generation() || !canOpen(options.myMenuPick.menuId))) {
      usageNav.current.via = null;
      pageNavigation.cancel();
      return false;
    }
    if (options.run && !options.run({ from: location.read() ?? '', to: split.url })) { pageNavigation.cancel(); return false; }
    // An accepted write changes the origin the pending request was made from (a replace, a Scope change, a confirmed replay): that request is stale (F3).
    guard.dropRequest();
    if (options.redirect) pageNavigation.redirect(split.url);
    else if (options.materialize) pageNavigation.materialize(split.url);
    else pageNavigation.advance(split.url, options.focus);
    // The URL state carries pathname + search only; a kernel rewrite of the same arrival keeps the fragment in the same history write.
    // A menu that declares no hidden keys writes no state, exactly as before.
    const declares = keys.length > 0;
    // Entries are stamped with their position (`apIdx`) so a Back/Forward can be undone exactly. A replace keeps the stamp it has; a push from an entry the
    // Kernel did not write re-bases: that entry is stamped 0 in a NEW numbering segment (`apSeg`, once any stamp was seen) and the push is 1, so positions
    // before it are never mixed with later ones (F1). No unsaved-edit guard in the app: nothing else changes.
    const hereState = stamping ? location.readState?.() : null;
    const here = stamping ? readHistoryIdx(hereState) : null;
    const hereSeg = here === null ? null : readHistorySeg(hereState);
    // Guard callbacks and run can move the live history. Only the still-accepted entry can prove the departure.
    const departure = location.read() ?? '';
    const accepted = latestArrival.current;
    const sameSegment = hereSeg === segRef.current;
    const sameEntry = departure === accepted.url && here === idxRef.current && sameSegment;
    const from = originHistory.address(accepted.url);
    const prior = accepted.origin?.history === originHistory ? accepted.origin.record : undefined;
    // A display-only replace changes the address of the current step, but its predecessor still undoes the selection.
    const keepStep = how === 'replace' && options.preserveSelectionUndo && here !== null && hereSeg === segRef.current
      && selectionSteps.current.get(here) === location.read();
    if (here === null || hereSeg !== segRef.current || (how === 'replace' && !keepStep)) selectionSteps.current.clear();
    else for (const index of selectionSteps.current.keys()) if (index > here) selectionSteps.current.delete(index);
    const replaceState = declares ? withHiddenState(location.readState?.(), nextHidden) : undefined;
    if (how === 'replace') location.replace(split.url, { keepFragment: options.redirect || options.materialize, ...(here !== null ? { state: withHistoryIdx(replaceState, here, hereSeg) } : declares ? { state: replaceState } : {}) });
    else if (stamping) {
      const base = here ?? 0;
      const seg = here === null ? `s${Math.random().toString(36).slice(2, 10)}` : hereSeg;
      const at = location.read();
      if (here === null && at !== null) location.replace(at, { keepFragment: true, state: withHistoryIdx(location.readState?.(), base, seg) });
      location.push(split.url, withHistoryIdx(declares ? withHiddenState(null, nextHidden) : null, base + 1, seg));
      idxRef.current = base + 1;
      segRef.current = seg;
      if (options.analysisSelection) selectionSteps.current.set(base + 1, split.url);
    } else if (declares) location.push(split.url, withHiddenState(null, nextHidden)); else location.push(split.url);
    const writtenUrl = location.read() ?? '';
    const state = location.readState?.();
    const index = readHistoryIdx(state);
    const segment = readHistorySeg(state);
    const to = originHistory.address(writtenUrl);
    const wroteEntry = index !== null && segment === segRef.current
      && (how === 'push' ? index === (here ?? 0) + 1 : index === here && segment === hereSeg);
    const scopeChanged = (from?.scopeId ?? null) !== (to?.scopeId ?? null);
    const crossedBoundary = here === null || !sameSegment || hereSeg !== segment;
    if (crossedBoundary || scopeChanged) originHistory.entries.clear();
    if (how === 'push' && wroteEntry) originHistory.pruneForward(index);
    const carried = to && !scopeChanged
      ? originHistory.readCarry(options.carryProof, { href: writtenUrl, departure, scopeId: to.scopeId, generation: accepted.generation })
      : {};
    const mint = how === 'push' && !options.redirect && !options.materialize;
    const record = wroteEntry && sameEntry && from && to && !options.skipOrigin && originHistory.isCurrentGeneration()
      ? recordOrigin(registry, departure, from, to, prior, { mint, carried })
      : undefined;
    if (wroteEntry) {
      const position = originPosition(segment, index);
      if (record) originHistory.entries.set(position, { index, url: writtenUrl, record });
      else originHistory.entries.delete(position);
    }
    if (keepStep) selectionSteps.current.set(here, writtenUrl);
    const committed = { url: writtenUrl, hidden: nextHidden, rewrite: false, generation: Symbol(), origin: record ? { history: originHistory, record } : undefined };
    latestArrival.current = committed;
    const presentationOnly = how === 'replace' && sameHidden(nextHidden, previousHidden)
      && stripDetailExpansion(departure) === stripDetailExpansion(writtenUrl);
    const keepsPick = !scopeChanged && (options.materialize || options.redirect || presentationOnly);
    if (options.myMenuPick || !keepsPick) {
      activePick.current = options.myMenuPick;
    }
    const committedPick = activePick.current;
    setView(current => ({ ...current, arrival: committed, url: writtenUrl, hidden: nextHidden, pick: committedPick }));
    if (how === 'push') document.getElementById('platform-main')?.scrollTo({ top: 0 });
    return true;
  }, [pageNavigation, location, hiddenKeysFor, menuFor, guard, usageNav, stamping, registry, originHistory, canOpen]);
  useLayoutEffect(() => { commitRef.current = commit; }, [commit]);
  const go = useCallback<ScreenSource['go']>((next, options) => commit(next, options?.replace ? 'replace' : 'push', {
    focus: options?.focus, restoreHidden: options?.restoreHidden, guard: options?.guard, run: options?.run, carryProof: options?.carryProof,
  }), [commit]);

  const origin = arrival.origin?.history === originHistory ? arrival.origin.record : undefined;
  const mintCarry = useCallback<NonNullable<ScreenSource['mintCarry']>>((href, carried, scopeId) =>
    originHistory.mintCarry({ href, departure: arrival.url, scopeId, generation: arrival.generation }, carried), [originHistory, arrival]);
  const source: ScreenSource = { origin, mintCarry, myMenuVisit, myMenuArrival: pick?.kind === 'arrival', mode: 'main', paneId: null, paneLabel: null, url, hidden, readAddress, navigation: pageNavigation, commit, go, onScopeValid: rememberScope };
  const { screen, sidebarSpace, resolveEntryLink, initialSavedView } = useScreenState(app, source);
  const { pathname, route, contractError, navigate, currentSpace } = screen;
  const openMyMenu = useCallback<OpenMyMenu>((menuId, viewId, href, options) => {
    if (!isCurrentGeneration() || !canOpen(menuId)) return;
    const sameMenu = route?.menu.id === menuId && !route.viaAlias;
    const request: MyMenuPick = createMyMenuPick({
      menuId, viewId, kind: sameMenu ? 'current' : 'arrival', generation: isCurrentGeneration,
      isCurrent: () => activePick.current === request && isCurrentGeneration() && canOpen(menuId),
      ...(sameMenu ? {
        focusOrigin: options?.focusOrigin,
        accept: () => {
          if (!isCurrentGeneration() || !canOpen(menuId)) return;
          usageNav.current.via = 'my-menus';
          setView(current => ({ ...current, myMenuVisit: current.myMenuVisit + 1 }));
        },
      } : { onOutcome: options?.onOutcome }),
    });
    if (sameMenu) {
      activePick.current = request;
      setView(current => ({ ...current, pick: request }));
      return;
    }
    const prior = usageNav.current.via;
    usageNav.current.via = 'my-menus';
    if (!commit(href, 'push', { focus: 'page', myMenuPick: request })) usageNav.current.via = prior;
  }, [route, isCurrentGeneration, canOpen, usageNav, commit]);
  const myMenus = useMemo(() => ({ pick, open: openMyMenu }), [pick, openMyMenu]);
  useLayoutEffect(() => {
    const steps = selectionSteps.current;
    return () => { steps.clear(); selectionUndoPending.current = false; };
  }, [app.pub.session, app.pub.revision, registry, pathname, screen.global.scopeId]);

  useLayoutEffect(() => {
    reportRef.current = screen.reportError;
    for (let error = pendingRef.current.shift(); error !== undefined; error = pendingRef.current.shift()) screen.reportError(error);
  });

  // One stable listener (it reads refs, so a pathname change never re-registers it). `compensatingTo`: the origin to which blocked Back/Forward arrivals are corrected;
  // `replayIdx`: the position a confirmed leave is travelling to (ADR-0115).
  const compensatingTo = useRef<number | null>(null);
  const replayIdx = useRef<number | null>(null);
  useEffect(() => {
    const failOpen = (name: string) => { const error = new Error(name); error.name = name; reportRef.current?.(error); };
    const arrivePop = (newIdx: number | null) => {
      const raw = location.read() ?? '';
      const arrived = arrive(raw, readHiddenState(location.readState?.()));
      const next = arrived.url;
      // An old entry that still carries hidden keys in its address is tidied in place (same entry).
      if (arrived.rewrite) location.replace(next, { keepFragment: true, state: withHiddenState(location.readState?.(), arrived.hidden) });
      // Back/Forward across menus arrives like a link (06 §26): the title takes focus and a carried
      // `focus=` does not claim the detail panel (ADR-0032). Same-screen history keeps the close-button claim.
      pageNavigation.advance(next, next.split('?')[0] !== latestArrival.current.url.split('?')[0] ? 'page' : undefined);
      usageNav.current.via = 'history';
      // An entry without a stamp breaks the numbering: nothing is trusted from before it (F1). A stamped one brings its own segment.
      const segment = newIdx === null ? null : readHistorySeg(location.readState?.());
      if (newIdx === null || segment !== segRef.current) selectionSteps.current.clear();
      if (newIdx === null || segment !== segRef.current
        || (originHistory.address(latestArrival.current.url)?.scopeId ?? null) !== (originHistory.address(next)?.scopeId ?? null)) {
        originHistory.entries.clear();
      }
      const entry = newIdx === null ? undefined : originHistory.entries.get(originPosition(segment, newIdx));
      const origin = entry?.url === next ? { history: originHistory, record: entry.record } : undefined;
      idxRef.current = newIdx;
      segRef.current = segment;
      guard.dropRequest(); // an accepted arrival ends any request made from the entry we left (F3)
      const traversed = { url: next, hidden: arrived.hidden, rewrite: false, generation: Symbol(), origin };
      latestArrival.current = traversed;
      activePick.current = undefined;
      guard.traversed();
      setView(current => ({ ...current, arrival: traversed, url: next, hidden: arrived.hidden, pick: undefined }));
    };
    const onPop = () => {
      selectionUndoPending.current = false;
      const newIdx = readHistoryIdx(location.readState?.());
      const cur = idxRef.current;
      // Positions of different segments are not comparable: such a pop is neither a compensation nor a measurable distance.
      const sameSegment = newIdx !== null && readHistorySeg(location.readState?.()) === segRef.current;
      // Several corrections can coalesce into one pop at the origin; that arrival completes the correction, regardless of call count.
      if (compensatingTo.current !== null && sameSegment && newIdx === compensatingTo.current) { compensatingTo.current = null; return; }
      // The pop of a leave the person confirmed.
      if (replayIdx.current !== null && newIdx === replayIdx.current) { replayIdx.current = null; arrivePop(newIdx); return; }
      const raw = location.read() ?? '';
      const change = { from: latestArrival.current.url, to: raw, hiddenKeys: hiddenKeysFor(raw) };
      if (guard.shouldBlock(change)) {
        if (newIdx !== null && cur !== null && sameSegment && newIdx !== cur && location.go !== undefined) {
          const delta = newIdx - cur;
          // The destination's hidden pairs live in ITS entry state: read them before the compensation moves away (R2-2).
          const destHidden = arrive(raw, readHiddenState(location.readState?.())).hidden;
          const crossMenu = raw.split('?')[0] !== latestArrival.current.url.split('?')[0];
          compensatingTo.current = cur;
          try { location.go(-delta); } catch { compensatingTo.current = null; failOpen('NavGuardHistoryError'); arrivePop(newIdx); return; }
          guard.request({ change, destination: menuFor(raw)?.label ?? null, via: 'history', proceed: () => {
            replayIdx.current = newIdx;
            try { location.go?.(delta); } catch {
              // The replay cannot travel: fail open to the destination (ADR-0115 decision 4). `onDiscard` already ran in `confirm` (before this), so the move
              // must still land or the person would lose edits without arriving; the destination address is pushed instead of travelled to.
              replayIdx.current = null; failOpen('NavGuardHistoryError');
              usageNav.current.via = 'history';
              // Same accepted-arrival as a normal Back: hidden pairs, page focus across menus, and the traversal signal (R2-2..R2-4).
              if (commitRef.current?.(raw, 'push', { bypassGuard: true, skipOrigin: true, restoreHidden: destHidden, focus: crossMenu ? 'page' : undefined })) guard.traversed();
            }
          } });
          return;
        }
        // Cannot put the person back exactly (an entry the Kernel did not stamp, no `go`): the move goes through, never a stuck history.
        failOpen('NavGuardUncompensable');
      }
      arrivePop(newIdx);
    };
    const onUndo = (event: KeyboardEvent) => {
      const idx = idxRef.current;
      if (!location.go || idx === null || selectionUndoPending.current || compensatingTo.current !== null || replayIdx.current !== null || guard.pending()) return;
      const state = location.readState?.();
      if (selectionSteps.current.get(idx) !== location.read() || readHistoryIdx(state) !== idx || readHistorySeg(state) !== segRef.current || !isAnalysisUndo(event)) return;
      event.preventDefault();
      selectionUndoPending.current = true;
      try { location.go(-1); } catch { selectionUndoPending.current = false; failOpen('AnalysisSelectionUndoHistoryError'); }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onUndo);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onUndo);
    };
  }, [pageNavigation, location, usageNav, arrive, guard, menuFor, hiddenKeysFor, originHistory]);

  // Recent visits (the main screen's own history; a pane never writes them).
  useEffect(() => {
    if (!route || route.viaAlias || contractError || !menuPermissions(route.menu).every(can)) return;
    if (!enters(route.menu)) return;
    // A registered menu with no screen yet is a place to look at, not one to come back to: no 이어서, no recent visit (#1944).
    if (!isImplementedMenu(route.menu)) return;
    const space = registry.spaceOf(route.menu);
    if (space !== null) writeSpaceLast(userId, space.id, url, spaceIdMigrations);
    recordVisit(route.menu.id, url);
  }, [url, route, contractError, userId, can, enters, registry, recordVisit, spaceIdMigrations]);

  const visibleMenus = useMemo(() => (sidebarSpace === null ? [] : menusInSpace(sidebarSpace.id)), [menusInSpace, sidebarSpace]);
  // Read at call time. Stored globals are not restored. Entries start clean: they carry the current global but never the current carry-set page state, and only the target's own stored non-carry-set page values come back.
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
    // A space entry ends the flow (06 §22): the last screen comes back, its carry-set keys do not.
    const carried = registry.carrySetOf(matched.menu)?.pageKeys ?? [];
    for (const [key, value] of parsed.page) {
      if (key === RETURN_TO_KEY || carried.includes(key)) continue;
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
    const home = registry.menuById(space.homeMenuId);
    const eligible = registry.menus.filter(menu => registry.spaceOf(menu)?.id === spaceId
      && !menu.navHidden && routeParamNames(menu.path).length === 0 && canOpen(menu.id));
    const homeAllowed = canOpen(home.id);
    const entry = homeAllowed && isImplementedMenu(home)
      ? home
      : eligible.find(isImplementedMenu);
    // A space with only planned pages still has a destination that explains what is coming.
    const destination = entry ?? (homeAllowed ? home : eligible[0]);
    return destination ? { menuId: destination.id, href: resolveEntryLink(destination.id).href, resumed: false } : null;
  }, [accessibleSpaces, spaceResume, canOpen, resolveEntryLink, registry]);
  // Reselecting the current space never sends the user home; targets without an entry keep the URL.
  const switchSpace = useCallback((spaceId: SpaceId) => {
    if (currentSpace?.id === spaceId) return;
    const entry = spaceEntry(spaceId);
    if (entry) navigate(entry.href, { focus: 'page', via: 'switcher' });
  }, [currentSpace, spaceEntry, navigate]);

  // Stable while the five members are: an unrelated main Scope update must not re-render every pane consumer.
  const mainBound = useMemo<MainBound>(() => ({ visibleMenus, sidebarSpace, spaceResume, spaceEntry, switchSpace }), [visibleMenus, sidebarSpace, spaceResume, spaceEntry, switchSpace]);
  return <MainBoundContext.Provider value={mainBound}><ScreenContext.Provider value={screen}>
    <MyMenuPickContext.Provider value={myMenus}><ScreenSavedViews initial={initialSavedView}>{children}</ScreenSavedViews></MyMenuPickContext.Provider>
  </ScreenContext.Provider></MainBoundContext.Provider>;
});
