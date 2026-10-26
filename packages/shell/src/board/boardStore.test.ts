import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { addSheet, freshBoard, parseBoardV2, renameSheet, screens, setPane, type Board } from './boardModel';
import { useBoardSession as useBoardStore } from './boardSession';
import { loadBoard, readStoredBoard, saveBoard, writeStoredBoard } from './boardStore';
import { legacyBoard, legacySheet, toLegacy, V1_KEY, V2_KEY } from './__fixtures__/legacyBoard';

const V1_BACKUP = 'platform:board:v1-backup:u1';
const CORRUPT_V1 = 'platform:board:corrupt-backup:v1:u1';
const CORRUPT_V2 = 'platform:board:corrupt-backup:v2:u1';
const shot = (menuId: string) => ({ menuId, params: {}, query: '' });

const v1 = () => legacyBoard([legacySheet('mine', { name: '내 시트', layout: '1x2', panes: [shot('a'), null], selected: 1, arrangement: { '1x2': { columns: [65, 35], rows: [[100], [100]], collapsed: [] } } })]);
const v2 = (): Board => { const board = addSheet(freshBoard('시트'), '시트'); return renameSheet(board, board.sheets[0].id, 'x'); };
const keys = (storage: Storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i)!).sort();

describe('loadBoard', () => {
  it('reads a V1-only value as a migrated board, writes nothing, and starts on pane 1', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify(v1());
    storage.setItem(V1_KEY, raw);
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded).toMatchObject({ notice: null, readOnly: false });
    expect(loaded.board.v).toBe(2);
    expect(toLegacy(loaded.board)).toEqual({ ...v1(), sheets: [{ ...v1().sheets[0], selected: 0 }] });
    expect(keys(storage)).toEqual([V1_KEY]);
    expect(storage.getItem(V1_KEY)).toBe(raw);
  });

  it('prefers a valid V2 value and ignores the V1 one', () => {
    const storage = memoryStorage();
    storage.setItem(V1_KEY, JSON.stringify(v1()));
    storage.setItem(V2_KEY, JSON.stringify(v2()));
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded.board.sheets.map(s => s.name)).toEqual(['x', '시트 2']);
    expect(loaded.notice).toBeNull();
    expect(keys(storage)).toEqual([V1_KEY, V2_KEY]);
  });

  it('opens a fresh read-only board with a notice for a value from a newer build, touching nothing', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ v: 4, anything: true });
    storage.setItem(V2_KEY, raw);
    storage.setItem(V1_KEY, JSON.stringify(v1()));
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded).toMatchObject({ notice: 'newer', readOnly: true });
    expect(loaded.board.sheets).toHaveLength(1);
    expect(loaded.board.sheets[0].name).toBe('시트 1');
    expect(keys(storage)).toEqual([V1_KEY, V2_KEY]);
    expect(storage.getItem(V2_KEY)).toBe(raw);
  });

  it.each([
    ['unparseable JSON', '{nope'],
    ['a value that fails validation', JSON.stringify({ ...v2(), activeSheetId: 'nope' })],
  ])('copies a corrupt V2 value (%s) aside and falls through to V1', (_name, raw) => {
    const storage = memoryStorage();
    storage.setItem(V2_KEY, raw);
    storage.setItem(V1_KEY, JSON.stringify(v1()));
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded.notice).toBe('corrupt');
    expect(loaded.board.sheets.map(s => s.name)).toEqual(['내 시트']);
    expect(storage.getItem(CORRUPT_V2)).toBe(raw);
    expect(storage.getItem(V2_KEY)).toBe(raw);
  });

  it('copies a corrupt V1 value aside once and starts fresh when no key yields a board', () => {
    const storage = memoryStorage();
    storage.setItem(V1_KEY, '{nope');
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded).toMatchObject({ notice: 'corrupt', readOnly: false });
    expect(loaded.board.sheets.map(s => s.name)).toEqual(['시트 1']);
    expect(storage.getItem(CORRUPT_V1)).toBe('{nope');
    expect(storage.getItem(V1_KEY)).toBe('{nope');
    expect(storage.getItem(V2_KEY)).toBeNull();
    storage.setItem(V1_KEY, '{other');
    loadBoard(storage, 'u1', '시트');
    expect(storage.getItem(CORRUPT_V1)).toBe('{nope');
  });

  it('reports a corrupt V2 even when V1 is missing, and nothing when both are missing', () => {
    const storage = memoryStorage();
    expect(loadBoard(storage, 'u1', '시트').notice).toBeNull();
    expect(keys(storage)).toEqual([]);
    storage.setItem(V2_KEY, '[]');
    expect(loadBoard(storage, 'u1', '시트')).toMatchObject({ notice: 'corrupt', readOnly: false });
    expect(storage.getItem(CORRUPT_V2)).toBe('[]');
  });

  it('is per user', () => {
    const storage = memoryStorage();
    storage.setItem('platform:board:v2:u2', JSON.stringify(v2()));
    expect(loadBoard(storage, 'u1', '시트').board.sheets.map(s => s.name)).toEqual(['시트 1']);
    expect(loadBoard(storage, 'u2', '시트').board.sheets.map(s => s.name)).toEqual(['x', '시트 2']);
  });
});

describe('saveBoard', () => {
  it('first write over a V1 board writes V2, leaves the V1 value byte-identical and backs it up once', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify(v1());
    storage.setItem(V1_KEY, raw);
    const board = setPane(loadBoard(storage, 'u1', '시트').board, 'mine', 1, shot('b'));
    expect(saveBoard(storage, 'u1', board)).toBe(true);
    expect(parseBoardV2(JSON.parse(storage.getItem(V2_KEY)!))).toEqual(board);
    expect(storage.getItem(V1_KEY)).toBe(raw);
    expect(storage.getItem(V1_BACKUP)).toBe(raw);
    // A later write does not touch the backup, even if the V1 key changed meanwhile (an old build in another tab).
    storage.setItem(V1_KEY, '{"changed":true}');
    saveBoard(storage, 'u1', setPane(board, 'mine', 0, shot('c')));
    expect(storage.getItem(V1_BACKUP)).toBe(raw);
    expect(storage.getItem(V1_KEY)).toBe('{"changed":true}');
  });

  it('writes no backup when there is no V1 value, and never deletes any key', () => {
    const storage = memoryStorage();
    saveBoard(storage, 'u1', freshBoard('시트'));
    expect(keys(storage)).toEqual([V2_KEY]);
  });

  it('replaces a corrupt V2 value after quarantining it at load, and backs up the V1 it was read from', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify(v1());
    storage.setItem(V1_KEY, raw);
    storage.setItem(V2_KEY, '{nope');
    const board = loadBoard(storage, 'u1', '시트').board;
    saveBoard(storage, 'u1', renameSheet(board, 'mine', '새 이름'));
    expect(storage.getItem(CORRUPT_V2)).toBe('{nope');
    expect(storage.getItem(V1_BACKUP)).toBe(raw);
    expect(parseBoardV2(JSON.parse(storage.getItem(V2_KEY)!))?.sheets[0].name).toBe('새 이름');
  });

  it('refuses to write while the stored V2 value is from a newer build', () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ v: 4 });
    storage.setItem(V2_KEY, raw);
    expect(saveBoard(storage, 'u1', freshBoard('시트'))).toBe(false);
    expect(storage.getItem(V2_KEY)).toBe(raw);
    expect(keys(storage)).toEqual([V2_KEY]);
  });
});

describe('the board hook and the open-in-board entry', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('migrates in memory on read and writes V2 only on the first edit', () => {
    const raw = JSON.stringify(v1());
    localStorage.setItem(V1_KEY, raw);
    const { result } = renderHook(() => useBoardStore('u1', '시트'));
    expect(result.current.storageNotice).toBeNull();
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(parseBoardV2(JSON.parse(localStorage.getItem(V2_KEY)!))?.sheets).toHaveLength(2);
    expect(localStorage.getItem(V1_KEY)).toBe(raw);
    expect(localStorage.getItem(V1_BACKUP)).toBe(raw);
  });

  it('an update with save: false changes the board without writing; the next saving update writes it (#823: splitter drag)', () => {
    const { result } = renderHook(() => useBoardStore('u1', '시트'));
    const written = vi.spyOn(localStorage, 'setItem');
    act(() => { result.current.update(b => addSheet(b, '시트'), { save: false }); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(written).not.toHaveBeenCalled();
    act(() => { result.current.update(b => b); });
    expect(written.mock.calls.filter(([key]) => key === V2_KEY)).toHaveLength(1);
    expect(parseBoardV2(JSON.parse(localStorage.getItem(V2_KEY)!))?.sheets).toHaveLength(2);
  });

  it('keeps edits in memory, never writes V2 and reports the notice for a newer value', () => {
    const raw = JSON.stringify({ v: 4 });
    localStorage.setItem(V2_KEY, raw);
    const { result } = renderHook(() => useBoardStore('u1', '시트'));
    expect(result.current.storageNotice).toBe('newer');
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(localStorage.getItem(V2_KEY)).toBe(raw);
  });

  it('a newer value written by another tab after load makes the session read-only with the notice, even if the value is later replaced', () => {
    const { result } = renderHook(() => useBoardStore('u1', '시트'));
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(result.current.storageNotice).toBeNull();
    const newer = JSON.stringify({ v: 4 });
    localStorage.setItem(V2_KEY, newer);
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(result.current.board.sheets).toHaveLength(3);
    expect(result.current.storageNotice).toBe('newer');
    expect(localStorage.getItem(V2_KEY)).toBe(newer);
    const other = JSON.stringify(v2());
    localStorage.setItem(V2_KEY, other);
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(result.current.board.sheets).toHaveLength(4);
    expect(result.current.storageNotice).toBe('newer');
    expect(localStorage.getItem(V2_KEY)).toBe(other);
  });

  it('reports a corrupt value and writes V2 on the next edit', () => {
    localStorage.setItem(V1_KEY, '{nope');
    const { result } = renderHook(() => useBoardStore('u1', '시트'));
    expect(result.current.storageNotice).toBe('corrupt');
    expect(localStorage.getItem(CORRUPT_V1)).toBe('{nope');
    act(() => { result.current.update(b => addSheet(b, '시트')); });
    expect(parseBoardV2(JSON.parse(localStorage.getItem(V2_KEY)!))?.sheets).toHaveLength(2);
    expect(localStorage.getItem(V1_KEY)).toBe('{nope');
  });

  it('readStoredBoard and writeStoredBoard use the same keys; a write over a newer value reports false', () => {
    localStorage.setItem(V1_KEY, JSON.stringify(v1()));
    expect(screens(readStoredBoard('u1', '시트').board.sheets[0])).toEqual([shot('a'), null]);
    expect(writeStoredBoard('u1', freshBoard('시트'))).toBe(true);
    expect(localStorage.getItem(V1_BACKUP)).not.toBeNull();
    localStorage.setItem(V2_KEY, JSON.stringify({ v: 4 }));
    expect(writeStoredBoard('u1', freshBoard('시트'))).toBe(false);
    expect(localStorage.getItem(V2_KEY)).toBe(JSON.stringify({ v: 4 }));
  });
});
