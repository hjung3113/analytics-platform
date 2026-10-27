import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { BOARD_PATH, useHostPlatform } from '@ap/kernel/host';
import { useHomeHref } from '../HomeLink';

/**
 * What the board looks like right now (docs/16 §4, ADR-0087): one module-level store per signed-in user, beside the board session (the document).
 * Only `live` (the board is open: maximized, a window or minimized), the last ordinary path to go back to, and the last sheet shown (for the chip) live here.
 * Window state (893d2, ADR-0091): `floating` (shown as a window), `lastMode` (the visible mode a minimize restores to) and the window's `geometry` (this run only).
 * Whether it is maximized is not stored: the address is the source — on `/board` it is maximized; anywhere else a live board is a window when `floating`, else minimized.
 * Small on purpose: the start-up chunk (shell, rail, chip) imports it, so it must not reach the board engine (`pnpm check:lazy-chunks`).
 */
export type BoardWindowGeometry = { x: number; y: number; width: number; height: number };
type Presentation = {
  live: boolean;
  floating: boolean;
  lastMode: 'maximized' | 'floating';
  geometry: BoardWindowGeometry | null;
  /** The window is shown in its narrow replacement (`fill`): the rail must not call it a window. Set by the host that measures. */
  windowFill: boolean;
  returnHref: string | null;
  lastSheetId: string | null;
  lastSheetName: string | null;
  /** The last status sentence for the chip's live region; `n` makes the same sentence announce again. */
  announcement: { text: string; n: number } | null;
};
const EMPTY: Presentation = { live: false, floating: false, lastMode: 'maximized', geometry: null, windowFill: false, returnHref: null, lastSheetId: null, lastSheetName: null, announcement: null };

const states = new Map<string, Presentation>();
const listeners = new Set<() => void>();
// Not part of the snapshot: read once by whoever takes them, so they never re-render anything.
const focusBefore = new Map<string, HTMLElement>();
const chipFocus = new Set<string>();
const displayFocus = new Map<string, 'window' | 'maximized'>();
const windowFocus = new Map<string, () => void>();

const read = (userId: string): Presentation => states.get(userId) ?? EMPTY;
const write = (userId: string, patch: Partial<Presentation>) => {
  const previous = read(userId);
  if ((Object.keys(patch) as (keyof Presentation)[]).every(key => previous[key] === patch[key])) return;
  states.set(userId, { ...previous, ...patch });
  for (const listener of Array.from(listeners)) listener();
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The board surface tells the store which sheet it shows, for the chip's label (a copy, so the chip never reads the board document). */
export const rememberSheet = (userId: string, id: string, name: string) => { write(userId, { lastSheetId: id, lastSheetName: name }); };
/** The board host tells the store whether the window is currently shown as `fill`. */
export const rememberWindowFill = (userId: string, fill: boolean) => { write(userId, { windowFill: fill }); };
/** The element holding focus inside the visible board; restoring puts focus back on it. */
export const rememberFocus = (userId: string, element: HTMLElement) => { focusBefore.set(userId, element); };
export const recallFocus = (userId: string): HTMLElement | null => focusBefore.get(userId) ?? null;
/** True once after the board was minimized with its own button: the chip takes focus when it appears. */
export const takeChipFocus = (userId: string): boolean => chipFocus.delete(userId);

/** Set by `창으로 보기` and window `최대화`: the display they lead to takes focus once it is on screen (their button unmounts, and focus would fall to `body`). */
export const takeDisplayFocus = (userId: string, display: 'window' | 'maximized'): boolean => displayFocus.get(userId) === display && displayFocus.delete(userId);

/** The window frame registers how to focus its title bar, for the rail button of a window that is already on screen. */
export const registerWindowFocus = (userId: string, focus: () => void): (() => void) => {
  windowFocus.set(userId, focus);
  return () => { if (windowFocus.get(userId) === focus) windowFocus.delete(userId); };
};

/** A user who is no longer the signed-in one keeps no live board, return path, chip label or remembered focus behind (893c2): the next sign-in starts closed. */
const forget = (userId: string) => {
  const had = states.delete(userId);
  focusBefore.delete(userId);
  chipFocus.delete(userId);
  displayFocus.delete(userId);
  if (had) for (const listener of Array.from(listeners)) listener();
};

export function resetBoardPresentationForTests(): void { states.clear(); focusBefore.clear(); chipFocus.clear(); displayFocus.clear(); windowFocus.clear(); listeners.clear(); }

/** A query key as the Kernel reads it: percent-decoded, so `%66ocus` is `focus`; a malformed escape keeps its raw spelling. */
const keyOf = (part: string): string => {
  const raw = part.split('=')[0];
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return raw; }
};

/**
 * The address a minimize or close goes back to must not reopen a detail the user did not ask for: it drops the `focus` key (the detail-opening query,
 * docs/06 §6.4) and keeps the screen, its other keys and the hash. Recording and using the address both pass through here (docs/16 §4).
 */
export const withoutDetailKey = (href: string): string => {
  const hashAt = href.indexOf('#');
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const queryAt = base.indexOf('?');
  if (queryAt === -1) return href;
  const kept = base.slice(queryAt + 1).split('&').filter(part => part !== '' && keyOf(part) !== 'focus');
  return `${base.slice(0, queryAt)}${kept.length > 0 ? `?${kept.join('&')}` : ''}${hash}`;
};

const sheetHref = (id: string | null) => (id === null ? BOARD_PATH : `${BOARD_PATH}?sheet=${encodeURIComponent(id)}`);

/**
 * For the main screen's outlet: keeps the store in step with the address. Arriving at `/board` (typed, Back/Forward, a link) opens the board;
 * every ordinary path that can be opened again is remembered as the place a minimize goes back to. Returns whether the board is mounted.
 */
export function useBoardPresentationSync(): { mounted: boolean; maximized: boolean; floating: boolean } {
  const { user, platformScreen, url, registry } = useHostPlatform();
  const state = useSyncExternalStore(subscribe, () => read(user.id));
  const maximized = platformScreen === 'board';
  // The mounted board of the previous user unmounts with this render (`mounted` is read per user); its stored state goes with it.
  const signedIn = useRef(user.id);
  useLayoutEffect(() => {
    if (signedIn.current !== user.id) { forget(signedIn.current); signedIn.current = user.id; }
  }, [user.id]);
  // Arriving at `/board` (Back/Forward, typed) ends a window; the window → maximized and maximized → window transitions write `floating` themselves,
  // so only the rising edge of the address clears it (a sync running between the replace and the write must not erase the new window).
  const wasMaximized = useRef(maximized);
  useLayoutEffect(() => {
    const arrived = maximized && !wasMaximized.current;
    wasMaximized.current = maximized;
    if (maximized) write(user.id, { live: true, lastMode: 'maximized', ...(arrived ? { floating: false } : {}) });
    else if (registry.safeReturnTo(url) !== null) write(user.id, { returnHref: withoutDetailKey(url) });
  }, [maximized, url, user.id, registry]);
  // `lastMode` is always the last visible mode, so an automatic minimize (the address moved) restores to what was on screen.
  useLayoutEffect(() => {
    if (!maximized && state.live && state.floating) write(user.id, { lastMode: 'floating' });
  }, [maximized, state.live, state.floating, user.id]);
  const floating = state.live && state.floating && !maximized;
  return { mounted: state.live || maximized, maximized, floating };
}

/** The board's presentation and its transitions. Every address change is a `replace`, so the history holds one entry however often the board comes and goes. */
export function useBoardPresentation() {
  const { user, platformScreen, navigate, registry, canOpen } = useHostPlatform();
  const state = useSyncExternalStore(subscribe, () => read(user.id));
  const home = useHomeHref();
  const maximized = state.live && platformScreen === 'board';
  const floating = state.live && state.floating && platformScreen !== 'board';
  const minimized = state.live && platformScreen !== 'board' && !floating;
  const announce = (text: string) => { write(user.id, { announcement: { text, n: (read(user.id).announcement?.n ?? 0) + 1 } }); };

  /** Where leaving the board goes: the last ordinary path while it can still be opened, else the platform home. */
  const leaveHref = (): string => {
    const stored = read(user.id).returnHref === null ? null : withoutDetailKey(read(user.id).returnHref!);
    const menu = stored !== null && registry.safeReturnTo(stored) !== null ? registry.matchRoute(stored.split('?')[0])?.menu : undefined;
    return stored !== null && menu !== undefined && canOpen(menu.id) ? stored : home ?? '/';
  };
  return {
    live: state.live, maximized, floating, minimized, geometry: state.geometry, windowFill: state.windowFill, sheetId: state.lastSheetId, sheetName: state.lastSheetName, announcement: state.announcement,
    /** Closed → open: arrives like any page (title focus). */
    open: () => { navigate(sheetHref(read(user.id).lastSheetId), { replace: true, focus: 'page', via: 'sidebar' }); },
    /** Minimized → the mode it was minimized from: a window needs no address change; maximized is a display change, not an arrival (the board puts focus back itself). */
    restore: (text: string) => {
      announce(text);
      if (read(user.id).lastMode === 'floating') write(user.id, { floating: true });
      else navigate(sheetHref(read(user.id).lastSheetId), { replace: true });
    },
    /** The board's own button: a window just stops being shown (no address change); a maximized board leaves for the last ordinary path. Focus goes to the chip. */
    minimize: (text: string) => {
      chipFocus.add(user.id); announce(text);
      if (floating) { write(user.id, { floating: false, lastMode: 'floating' }); return; }
      write(user.id, { lastMode: 'maximized' });
      navigate(leaveHref(), { replace: true });
    },
    /** Maximized → window: back to the last ordinary path (replace), then the window shows; the stored geometry (or the default) places it. */
    toWindow: (text: string) => { displayFocus.set(user.id, 'window'); announce(text); navigate(leaveHref(), { replace: true }); write(user.id, { floating: true, lastMode: 'floating' }); },
    /** Window → maximized: the background path is already in `returnHref`; the address becomes `/board?sheet=`. */
    maximize: (text: string) => { displayFocus.set(user.id, 'maximized'); announce(text); navigate(sheetHref(read(user.id).lastSheetId), { replace: true }); write(user.id, { floating: false, lastMode: 'maximized' }); },
    /** The window's position and size, written only by the user's own gestures. */
    setGeometry: (geometry: BoardWindowGeometry) => { write(user.id, { geometry }); },
    /** The rail button of a window already on screen: focus its title bar (the frame registered how). */
    focusWindow: () => { windowFocus.get(user.id)?.(); },
    /** Ends the live board (the stored sheets stay) and leaves `/board` so it does not open again at once. A window's background address stays. */
    close: (text: string) => { announce(text); if (platformScreen === 'board') navigate(leaveHref(), { replace: true }); write(user.id, { live: false, floating: false }); },
  };
}
