import { useCallback, useSyncExternalStore } from 'react';
import type { Board } from './boardModel';
import { browserStorage, loadBoard, saveBoard, type StorageNotice } from './boardStore';

/**
 * The board session store (docs/16 §7): one module-level store of the signed-in users' boards, the only path that reads or writes the stored
 * board. The board screen and `분석 보드에 열기…` both go through it, so a board held in memory is never overwritten by a stale copy. It holds
 * the board document only; what is on screen is not part of it. A user's session lives while someone subscribes to it (or for one call of
 * `updateBoardSession`); the next one reads the stored value again.
 */
type Session = { board: Board; notice: StorageNotice | null; readOnly: boolean; unsaved: boolean };
export type BoardUpdate = (change: (board: Board) => Board, options?: { save?: boolean }) => void;

const sessions = new Map<string, Session>();
const subscribers = new Map<string, Set<() => void>>();

const open = (userId: string, prefix: string): Session => {
  let session = sessions.get(userId);
  if (!session) { session = { ...loadBoard(browserStorage, userId, prefix), unsaved: false }; sessions.set(userId, session); }
  return session;
};
const emit = (userId: string) => { for (const listener of Array.from(subscribers.get(userId) ?? [])) listener(); };
const subscribe = (userId: string, listener: () => void) => {
  let set = subscribers.get(userId);
  if (!set) { set = new Set(); subscribers.set(userId, set); }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) { subscribers.delete(userId); sessions.delete(userId); }
  };
};

/** The session after `change`. `save: false` changes the board in memory only (the moves of a splitter drag, #823); the next saving update writes the whole board. */
function apply(userId: string, prefix: string, change: (board: Board) => Board, save: boolean): Session {
  const previous = open(userId, prefix);
  const next = change(previous.board);
  // A saving update that changes nothing still writes a board held in memory by `save: false`.
  if (next === previous.board && !(save && previous.unsaved)) return previous;
  let session: Session;
  if (!save) session = { ...previous, board: next, unsaved: true };
  // A newer build may have written since the load: that refusal latches this session read-only, with the notice.
  else if (!previous.readOnly && !saveBoard(browserStorage, userId, next)) session = { ...previous, board: next, notice: 'newer', readOnly: true, unsaved: false };
  else session = { ...previous, board: next, unsaved: false };
  sessions.set(userId, session);
  if (!subscribers.has(userId)) sessions.delete(userId);
  emit(userId);
  return session;
}

/** The signed-in user's board, shared by every caller; a new user is read in the same render the user changes. `storageNotice` says why a stored value was not used. */
export function useBoardSession(userId: string, prefix: string): { board: Board; update: BoardUpdate; storageNotice: StorageNotice | null } {
  const session = useSyncExternalStore(useCallback((listener: () => void) => subscribe(userId, listener), [userId]), () => open(userId, prefix));
  const update = useCallback<BoardUpdate>((change, { save = true } = {}) => { apply(userId, prefix, change, save); }, [userId, prefix]);
  return { board: session.board, update, storageNotice: session.notice };
}

/** For code outside the board screen: the user's board and whether this session may write it. */
export const readBoardSession = (userId: string, prefix: string): { board: Board; readOnly: boolean; notice: StorageNotice | null } => {
  const live = sessions.get(userId);
  if (live) return live;
  return loadBoard(browserStorage, userId, prefix);
};

/** Runs `change` against the one session and returns it afterwards (`readOnly` true: nothing was written). */
export const updateBoardSession = (userId: string, prefix: string, change: (board: Board) => Board, { save = true }: { save?: boolean } = {}): { board: Board; readOnly: boolean; notice: StorageNotice | null } =>
  apply(userId, prefix, change, save);

/**
 * Takes the stored value into a live session, so a change another tab made is seen before a confirm judges its target (`분석 보드에 열기…`).
 * A session holding unsaved moves keeps them; with no live session the next read loads from storage anyway.
 */
export function reloadBoardSession(userId: string, prefix: string): void {
  const live = sessions.get(userId);
  if (!live || live.unsaved) return;
  sessions.set(userId, { ...loadBoard(browserStorage, userId, prefix), unsaved: false });
  emit(userId);
}

export function resetBoardSessionsForTests(): void { sessions.clear(); subscribers.clear(); }
