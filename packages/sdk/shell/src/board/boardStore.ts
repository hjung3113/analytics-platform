import { isRecord } from '@ap/contracts';
import { migrateV1 } from './boardMigrate';
import { asStored, boardVersionFor, freshBoard, parseBoard, type Board } from './boardModel';

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
export const browserStorage: KeyValueStore = { getItem: key => localStorage.getItem(key), setItem: (key, value) => { localStorage.setItem(key, value); } };

const parseJson = (raw: string): { value: unknown } | null => {
  try { return { value: JSON.parse(raw) as unknown }; } catch { return null; }
};
/** The newest board version this build reads (`v:3`, ADR-0089). A build before it read `v>2` as newer, so it opens a `v:3` value read-only instead of quarantining it. */
const NEWEST_VERSION = 3;
const isNewer = (value: unknown) => isRecord(value) && typeof value.v === 'number' && value.v > NEWEST_VERSION;

/** Copies an unreadable value aside, once; the original key is never touched. */
function quarantine(storage: KeyValueStore, key: string, raw: string) {
  try { if (storage.getItem(key) === null) storage.setItem(key, raw); } catch { /* the original stays where it is */ }
}

/**
 * Reads the signed-in user's board: the V2 key, else the V1 key migrated in memory (nothing is written until the first edit; the V1 key is
 * never written or deleted). A corrupt value is copied to its backup key and reading falls through; a value from a newer build opens a fresh
 * board that this session never writes. `enter` is the first-entry normalization (the stored selection and active tabs are kept; a selection that disagrees with its group's active tab follows the tab); a refresh of a live board passes its own.
 */
export function loadBoard(storage: KeyValueStore, userId: string, prefix: string, enter: (board: Board) => Board = asStored): LoadedBoard {
  let notice: StorageNotice | null = null;
  try {
    const rawV2 = storage.getItem(v2Key(userId));
    if (rawV2 !== null) {
      const json = parseJson(rawV2);
      if (json && isNewer(json.value)) return { board: freshBoard(prefix), notice: 'newer', readOnly: true };
      const parsed = json && parseBoard(json.value);
      if (parsed) return { board: enter(parsed), notice, readOnly: false };
      quarantine(storage, corruptBackupKey(userId, 'v2'), rawV2);
      notice = 'corrupt';
    }
    const rawV1 = storage.getItem(v1Key(userId));
    if (rawV1 !== null) {
      const json = parseJson(rawV1);
      const migrated = json && migrateV1(json.value);
      if (migrated) return { board: enter(migrated), notice, readOnly: false };
      quarantine(storage, corruptBackupKey(userId, 'v1'), rawV1);
      notice = 'corrupt';
    }
  } catch { /* storage unavailable: start fresh below */ }
  return { board: freshBoard(prefix), notice, readOnly: false };
}

/**
 * Writes the board under the V2 key, stamped `v:3` while some sheet holds more than four panes and `v:2` otherwise (so closing back to four
 * panes is the rollback path for older builds). False — nothing written — while the stored value is from a newer build. The first write over a V1 board copies
 * the untouched V1 value to its backup key once.
 */
export function saveBoard(storage: KeyValueStore, userId: string, board: Board): boolean {
  try {
    const rawV2 = storage.getItem(v2Key(userId));
    const json = rawV2 === null ? null : parseJson(rawV2);
    if (json && isNewer(json.value)) return false;
    const rawV1 = storage.getItem(v1Key(userId));
    if (rawV1 !== null && storage.getItem(v1BackupKey(userId)) === null && (rawV2 === null || !parseBoard(json?.value))) storage.setItem(v1BackupKey(userId), rawV1);
    storage.setItem(v2Key(userId), JSON.stringify({ ...board, v: boardVersionFor(board.sheets) }));
  } catch { /* memory-only */ }
  return true;
}

/** The stored board for code outside the board screen (`분석 보드에 열기…`): read and write through the same functions the hook uses. */
export const readStoredBoard = (userId: string, prefix: string): LoadedBoard => loadBoard(browserStorage, userId, prefix);
export const writeStoredBoard = (userId: string, board: Board): boolean => saveBoard(browserStorage, userId, board);
