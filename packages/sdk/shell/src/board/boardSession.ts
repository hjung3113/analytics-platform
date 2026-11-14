import { useCallback, useSyncExternalStore } from 'react';
import type { Board } from './boardModel';
import { boardStorageKey, browserStorage, loadBoard, readStoredRaw, saveBoardOutcome, type KeyValueStore, type StorageNotice } from './boardStore';

/**
 * The board session store (docs/16 §7): one module-level store of the signed-in users' boards, the only path that reads or writes the stored
 * board. The board screen and `분석 보드에 열기…` both go through it, so a board held in memory is never overwritten by a stale copy. It holds
 * the board document only; what is on screen is not part of it. A user's session lives while someone subscribes to it (plus the tick after the last one leaves) or for one call of
 * `updateBoardSession`; a failed write retains its unsaved board until a later successful save.
 */
/** `raw`: the stored text this session last read or wrote (`undefined` when storage could not be read), so a save can tell that another tab wrote since. */
type Session = { board: Board; notice: StorageNotice | null; readOnly: boolean; unsaved: boolean; raw: string | null | undefined };
export type BoardUpdate = (change: (board: Board) => Board, options?: { save?: boolean }) => void;

const sessions = new Map<string, Session>();
const subscribers = new Map<string, Set<() => void>>();
/** One `storage` listener per user with subscribers: another tab's save is taken into the live session (#2019). */
const storageListeners = new Map<string, (event: StorageEvent) => void>();

/** Reads the stored text before the board, so a write in between shows as a difference at the next save rather than being missed. */
const read = (userId: string, prefix: string, enter?: (board: Board) => Board): Omit<Session, 'unsaved'> & { unavailable: boolean } => {
  const raw = readStoredRaw(browserStorage, userId);
  // The one read serves both the decoding and the baseline: a second read that fails cannot pass for an empty document.
  const once: KeyValueStore = raw === undefined ? browserStorage : { getItem: key => (key === boardStorageKey(userId) ? raw : browserStorage.getItem(key)), setItem: browserStorage.setItem };
  const { board, notice, readOnly, unavailable } = loadBoard(once, userId, prefix, enter);
  return { board, notice, readOnly, raw, unavailable: raw === undefined || unavailable === true };
};
const load = (userId: string, prefix: string, enter?: (board: Board) => Board): Omit<Session, 'unsaved'> => {
  const { unavailable: _unavailable, ...session } = read(userId, prefix, enter);
  return session;
};
const open = (userId: string, prefix: string): Session => {
  let session = sessions.get(userId);
  if (!session) { session = { ...load(userId, prefix), unsaved: false }; sessions.set(userId, session); }
  return session;
};
/** Has another tab written the stored board since this session last read or wrote it? Unknown (storage unreadable) counts as no. */
const storedChanged = (userId: string, session: Session) => {
  if (session.raw === undefined) return false;
  const now = readStoredRaw(browserStorage, userId);
  return now !== undefined && now !== session.raw;
};
/** The live session with the stored document taken in: selected panes and the active sheet stay as on screen (`keepingLive`). */
const merged = (userId: string, prefix: string, live: Session): Session => {
  const { unavailable, ...stored } = read(userId, prefix, board => board);
  // Storage cannot be read now: the live board is the newest this tab has, so it stays (only a NEW session falls back to a fresh board).
  if (unavailable) return live;
  return { ...stored, board: stored.readOnly ? stored.board : keepingLive(stored.board, live.board), unsaved: false };
};
const listenToStorage = (userId: string, prefix: string) => {
  if (typeof window === 'undefined' || storageListeners.has(userId)) return;
  const listener = (event: StorageEvent) => {
    if (event.key !== null && event.key !== boardStorageKey(userId)) return;
    try { if (event.storageArea !== null && event.storageArea !== localStorage) return; } catch { return; }
    reloadBoardSession(userId, prefix);
  };
  storageListeners.set(userId, listener);
  window.addEventListener('storage', listener);
};
const stopListening = (userId: string) => {
  const listener = storageListeners.get(userId);
  if (!listener) return;
  storageListeners.delete(userId);
  window.removeEventListener('storage', listener);
};
/** Keep unsaved failed writes across readers; otherwise the next lone reader reloads storage. */
const dropIfAlone = (userId: string) => { if (!subscribers.has(userId) && sessions.get(userId)?.notice !== 'failed') sessions.delete(userId); };
/** The last subscriber leaving drops a durably saved session one microtask later, so a re-subscribe in the same tick (StrictMode's effect replay, a board swapped within one commit) keeps the unsaved moves and the read-only latch. */
let generation = 0;
const dropAfterTick = (userId: string) => {
  const queued = generation;
  queueMicrotask(() => { if (queued === generation) dropIfAlone(userId); });
};
const emit = (userId: string) => { for (const listener of Array.from(subscribers.get(userId) ?? [])) listener(); };
const subscribe = (userId: string, prefix: string, listener: () => void) => {
  let set = subscribers.get(userId);
  if (!set) { set = new Set(); subscribers.set(userId, set); }
  set.add(listener);
  listenToStorage(userId, prefix);
  return () => {
    set.delete(listener);
    if (set.size === 0) { subscribers.delete(userId); stopListening(userId); dropAfterTick(userId); }
  };
};

/** The session after `change`. `save: false` changes the board in memory only (the moves of a splitter drag, #823); the next saving update writes the whole board. */
function apply(userId: string, prefix: string, change: (board: Board) => Board, save: boolean): Session {
  let previous = open(userId, prefix);
  // Another tab saved since this session read or wrote (#2019): the change goes on top of the stored document, never a stale copy over it.
  // Unsaved moves and a read-only latch keep the session as it is (the `reloadBoardSession` rules).
  let reloaded = false;
  // A newer build's write latches read-only as before, over the board on screen (nothing is written).
  if (save && !previous.unsaved && !previous.readOnly && storedChanged(userId, previous)) {
    const fresh = merged(userId, prefix, previous);
    previous = fresh.readOnly ? { ...fresh, board: previous.board } : fresh;
    reloaded = true;
  }
  const next = change(previous.board);
  // A saving update that changes nothing still writes a board held in memory by `save: false`.
  if (next === previous.board && !(save && previous.unsaved)) {
    if (reloaded) { sessions.set(userId, previous); dropIfAlone(userId); emit(userId); return previous; }
    dropIfAlone(userId); return previous;
  }
  let session: Session;
  if (!save) session = { ...previous, board: next, unsaved: true };
  // A newer build may have written since the load: that refusal latches this session read-only, with the notice.
  else if (!previous.readOnly) {
    const outcome = saveBoardOutcome(browserStorage, userId, next);
    session = outcome === 'saved'
      ? { ...previous, board: next, notice: previous.notice === 'failed' ? null : previous.notice, unsaved: false, raw: readStoredRaw(browserStorage, userId) }
      : { ...previous, board: next, notice: outcome, readOnly: outcome === 'newer', unsaved: outcome === 'failed' };
  } else session = { ...previous, board: next, unsaved: false };
  sessions.set(userId, session);
  dropIfAlone(userId);
  emit(userId);
  return session;
}

/** The signed-in user's board, shared by every caller; a new user is read in the same render the user changes. `storageNotice` says why a stored value was not used. */
export function useBoardSession(userId: string, prefix: string): { board: Board; update: BoardUpdate; storageNotice: StorageNotice | null } {
  const session = useSyncExternalStore(useCallback((listener: () => void) => subscribe(userId, prefix, listener), [userId, prefix]), () => open(userId, prefix));
  const update = useCallback<BoardUpdate>((change, { save = true } = {}) => { apply(userId, prefix, change, save); }, [userId, prefix]);
  return { board: session.board, update, storageNotice: session.notice };
}

/** For code outside the board screen: the user's board and whether this session may write it. */
export const readBoardSession = (userId: string, prefix: string): { board: Board; readOnly: boolean; notice: StorageNotice | null; unsaved: boolean } => {
  const live = sessions.get(userId);
  if (live) return live;
  return { ...load(userId, prefix), unsaved: false };
};

/** Runs `change` against the one session and returns it afterwards (`readOnly` true: nothing was written). */
export const updateBoardSession = (userId: string, prefix: string, change: (board: Board) => Board, { save = true }: { save?: boolean } = {}): { board: Board; readOnly: boolean; notice: StorageNotice | null } =>
  apply(userId, prefix, change, save);

/** The stored board with the live board's selected panes and active sheet kept where their ids are still there; the first-entry reset is for a new session only. */
const keepingLive = (stored: Board, live: Board): Board => {
  const sheets = stored.sheets.map(sheet => {
    const was = live.sheets.find(s => s.id === sheet.id);
    return was && was.selectedPaneId !== sheet.selectedPaneId && sheet.panes.some(p => p.id === was.selectedPaneId) ? { ...sheet, selectedPaneId: was.selectedPaneId } : sheet;
  });
  return { ...stored, activeSheetId: stored.sheets.some(s => s.id === live.activeSheetId) ? live.activeSheetId : stored.activeSheetId, sheets };
};

/**
 * Takes the stored value into a live session, so a change another tab made is seen before a confirm judges its target (`분석 보드에 열기…`) and
 * whenever another tab saves while this session has subscribers (its `storage` event, #2019). A session holding unsaved moves keeps them, and
 * a read-only one stays as it is (its latch and notice last the session). The selected panes and the active sheet stay as they are on screen;
 * only the stored document is taken in. Nothing is written. With no live session the next read loads from storage anyway.
 */
export function reloadBoardSession(userId: string, prefix: string): void {
  const live = sessions.get(userId);
  if (!live) return;
  if (live.unsaved || live.readOnly) { dropIfAlone(userId); return; }
  const next = merged(userId, prefix, live);
  if (next !== live) { sessions.set(userId, next); emit(userId); }
  dropIfAlone(userId);
}

export function resetBoardSessionsForTests(): void {
  generation += 1; sessions.clear(); subscribers.clear();
  for (const userId of Array.from(storageListeners.keys())) stopListening(userId);
}

/** Drops the sessions nobody subscribes to now, instead of waiting for the tick: a test that cleans up and mounts again in one tick starts from its stored value. */
export function dropIdleBoardSessionsForTests(): void { for (const userId of Array.from(sessions.keys())) if (!subscribers.has(userId)) sessions.delete(userId); }
