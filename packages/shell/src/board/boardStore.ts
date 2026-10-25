import { useCallback, useState } from 'react';
import { isRecord } from '@ap/contracts';
import { migrateV1 } from './boardMigrate';
import { atFirstPanes, freshBoard, parseBoardV2, type Board } from './boardModel';

const v2Key = (userId: string) => `platform:board:v2:${userId}`;
const v1Key = (userId: string) => `platform:board:${userId}`;
const v1BackupKey = (userId: string) => `platform:board:v1-backup:${userId}`;
const corruptBackupKey = (userId: string, version: 'v1' | 'v2') => `platform:board:corrupt-backup:${version}:${userId}`;

/** `newer`: the stored board was saved by a newer build, so this session never writes it. `corrupt`: a stored value could not be read and was kept aside. */
export type StorageNotice = 'newer' | 'corrupt';
export type LoadedBoard = { board: Board; notice: StorageNotice | null; readOnly: boolean };

/** The two `Storage` methods the board needs. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;
/** Resolves `localStorage` on each call, inside the callers' try blocks: touching it can throw where storage is blocked. */
const browserStorage: KeyValueStore = { getItem: key => localStorage.getItem(key), setItem: (key, value) => { localStorage.setItem(key, value); } };

const parseJson = (raw: string): { value: unknown } | null => {
  try { return { value: JSON.parse(raw) as unknown }; } catch { return null; }
};
const isNewer = (value: unknown) => isRecord(value) && typeof value.v === 'number' && value.v > 2;

/** Copies an unreadable value aside, once; the original key is never touched. */
function quarantine(storage: KeyValueStore, key: string, raw: string) {
  try { if (storage.getItem(key) === null) storage.setItem(key, raw); } catch { /* the original stays where it is */ }
}

/**
 * Reads the signed-in user's board: the V2 key, else the V1 key migrated in memory (nothing is written until the first edit; the V1 key is
 * never written or deleted). A corrupt value is copied to its backup key and reading falls through; a value from a newer build opens a fresh
 * board that this session never writes.
 */
export function loadBoard(storage: KeyValueStore, userId: string, prefix: string): LoadedBoard {
  let notice: StorageNotice | null = null;
  try {
    const rawV2 = storage.getItem(v2Key(userId));
    if (rawV2 !== null) {
      const json = parseJson(rawV2);
      if (json && isNewer(json.value)) return { board: freshBoard(prefix), notice: 'newer', readOnly: true };
      const parsed = json && parseBoardV2(json.value);
      if (parsed) return { board: atFirstPanes(parsed), notice, readOnly: false };
      quarantine(storage, corruptBackupKey(userId, 'v2'), rawV2);
      notice = 'corrupt';
    }
    const rawV1 = storage.getItem(v1Key(userId));
    if (rawV1 !== null) {
      const json = parseJson(rawV1);
      const migrated = json && migrateV1(json.value);
      if (migrated) return { board: atFirstPanes(migrated), notice, readOnly: false };
      quarantine(storage, corruptBackupKey(userId, 'v1'), rawV1);
      notice = 'corrupt';
    }
  } catch { /* storage unavailable: start fresh below */ }
  return { board: freshBoard(prefix), notice, readOnly: false };
}

/**
 * Writes the board as V2. False — nothing written — while the stored V2 value is from a newer build. The first write over a V1 board copies
 * the untouched V1 value to its backup key once.
 */
export function saveBoard(storage: KeyValueStore, userId: string, board: Board): boolean {
  try {
    const rawV2 = storage.getItem(v2Key(userId));
    const json = rawV2 === null ? null : parseJson(rawV2);
    if (json && isNewer(json.value)) return false;
    const rawV1 = storage.getItem(v1Key(userId));
    if (rawV1 !== null && storage.getItem(v1BackupKey(userId)) === null && (rawV2 === null || !parseBoardV2(json?.value))) storage.setItem(v1BackupKey(userId), rawV1);
    storage.setItem(v2Key(userId), JSON.stringify(board));
  } catch { /* memory-only */ }
  return true;
}

/** The stored board for code outside the board screen (`분석 보드에 열기…`): read and write through the same functions the hook uses. */
export const readStoredBoard = (userId: string, prefix: string): LoadedBoard => loadBoard(browserStorage, userId, prefix);
export const writeStoredBoard = (userId: string, board: Board): boolean => saveBoard(browserStorage, userId, board);

/**
 * The signed-in user's board (docs/16 §7). Reads once per user and swaps in the same render the user changes. A missing, unreadable or
 * newer-version value yields a fresh board that is NOT written back until the user edits (never, for a newer one), so a value this build
 * cannot read survives. `storageNotice` says why a stored value was not used.
 */
export function useBoardStore(userId: string, prefix: string): { board: Board; update: (change: (board: Board) => Board, options?: { save?: boolean }) => void; storageNotice: StorageNotice | null } {
  const [state, setState] = useState<{ userId: string; unsaved?: boolean } & LoadedBoard>(() => ({ userId, ...loadBoard(browserStorage, userId, prefix) }));
  if (state.userId !== userId) setState({ userId, ...loadBoard(browserStorage, userId, prefix) });
  // `save: false` changes the board in memory only (the moves of a splitter drag, #823); the next saving update writes the whole board.
  const update = useCallback((change: (board: Board) => Board, { save = true }: { save?: boolean } = {}) => {
    setState(previous => {
      if (previous.userId !== userId) return previous;
      const changed = change(previous.board);
      // A saving update that changes nothing still writes a board held in memory by `save: false`.
      if (changed === previous.board && !(save && previous.unsaved)) return previous;
      const next = changed;
      if (!save) return { ...previous, board: next, unsaved: true };
      // A newer build may have written since the load: that refusal latches this session read-only, with the notice.
      if (!previous.readOnly && !saveBoard(browserStorage, userId, next)) return { ...previous, board: next, notice: 'newer', readOnly: true, unsaved: false };
      return { ...previous, board: next, unsaved: false };
    });
  }, [userId]);
  return { board: state.board, update, storageNotice: state.notice };
}
