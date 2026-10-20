import { useCallback, useState } from 'react';
import { atFirstPanes, freshBoard, parseBoard, type Board } from './boardModel';

const storageKey = (userId: string) => `platform:board:${userId}`;

function load(userId: string, prefix: string): Board {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? parseBoard(JSON.parse(raw)) : null;
    if (parsed) return atFirstPanes(parsed);
  } catch { /* unreadable or unavailable: start fresh below */ }
  return freshBoard(prefix);
}

function save(userId: string, board: Board) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(board)); } catch { /* memory-only */ }
}

/** The stored board for code outside the board screen (`분석 보드에 열기…`): read and write through the same functions the hook uses. */
export const readStoredBoard = load;
export const writeStoredBoard = save;

/**
 * The signed-in user's board (docs/16 §7). Reads once per user and swaps in the same render the user changes. A missing, malformed or
 * newer-version value yields a fresh board that is NOT written back until the user edits, so a value this build cannot read survives.
 */
export function useBoardStore(userId: string, prefix: string): { board: Board; update: (change: (board: Board) => Board) => void } {
  const [state, setState] = useState(() => ({ userId, board: load(userId, prefix) }));
  if (state.userId !== userId) setState({ userId, board: load(userId, prefix) });
  const update = useCallback((change: (board: Board) => Board) => {
    setState(previous => {
      if (previous.userId !== userId) return previous;
      const next = change(previous.board);
      if (next === previous.board) return previous;
      save(userId, next);
      return { ...previous, board: next };
    });
  }, [userId]);
  return { board: state.board, update };
}
