import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { addSheet, freshBoard, renameSheet, selectedIndex, selectPane, setLayout } from './boardModel';
import { readBoardSession, reloadBoardSession, updateBoardSession, useBoardSession } from './boardSession';

const V2 = (id: string) => `platform:board:v2:${id}`;
const CORRUPT_V2 = 'platform:board:corrupt-backup:v2:u1';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the board session store (docs/16 §7)', () => {
  it('two subscribers of one user see the same board, and one update shows in the other at once', () => {
    const a = renderHook(() => useBoardSession('u1', '시트'));
    const b = renderHook(() => useBoardSession('u1', '시트'));
    expect(a.result.current.board).toBe(b.result.current.board);
    act(() => { a.result.current.update(board => addSheet(board, '시트')); });
    expect(b.result.current.board.sheets).toHaveLength(2);
    expect(b.result.current.board).toBe(a.result.current.board);
    a.unmount(); b.unmount();
  });

  it('shows the previous user no board after the user changes, in the same render', () => {
    const seed = freshBoard('시트');
    localStorage.setItem(V2('u1'), JSON.stringify(renameSheet(seed, seed.sheets[0].id, 'mine')));
    const rendered: { user: string; names: string[] }[] = [];
    const { result, rerender } = renderHook(({ id }) => { const r = useBoardSession(id, '시트'); rendered.push({ user: id, names: r.board.sheets.map(s => s.name) }); return r; }, { initialProps: { id: 'u1' } });
    rerender({ id: 'u2' });
    expect(rendered.filter(r => r.user === 'u2').every(r => !r.names.includes('mine'))).toBe(true);
    expect(result.current.board.sheets.map(s => s.name)).toEqual(['시트 1']);
    act(() => { result.current.update(board => addSheet(board, '시트')); });
    expect(localStorage.getItem(V2('u1'))).toContain('mine');
    expect(JSON.parse(localStorage.getItem(V2('u2'))!).sheets).toHaveLength(2);
  });

  it('save: false keeps the change in memory; the next saving update writes the whole board', () => {
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    act(() => { result.current.update(board => addSheet(board, '시트'), { save: false }); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(localStorage.getItem(V2('u1'))).toBeNull();
    act(() => { result.current.update(board => board); });
    expect(JSON.parse(localStorage.getItem(V2('u1'))!).sheets).toHaveLength(2);
  });

  it('a newer stored value latches the session read-only and is never written', () => {
    const newer = JSON.stringify({ v: 3 });
    localStorage.setItem(V2('u1'), newer);
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    expect(result.current.storageNotice).toBe('newer');
    expect(readBoardSession('u1', '시트').readOnly).toBe(true);
    act(() => { result.current.update(board => addSheet(board, '시트')); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(localStorage.getItem(V2('u1'))).toBe(newer);
  });

  it('an unreadable value is copied aside and the original stays', () => {
    localStorage.setItem(V2('u1'), '{nope');
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    expect(result.current.storageNotice).toBe('corrupt');
    expect(localStorage.getItem(CORRUPT_V2)).toBe('{nope');
    expect(localStorage.getItem(V2('u1'))).toBe('{nope');
  });

  it('reloadBoardSession takes in another tab\'s write, but keeps unsaved moves', () => {
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    const other = addSheet(freshBoard('시트'), '시트');
    localStorage.setItem(V2('u1'), JSON.stringify(other));
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(result.current.board.sheets).toHaveLength(2);
    act(() => { result.current.update(board => addSheet(board, '시트'), { save: false }); });
    localStorage.setItem(V2('u1'), JSON.stringify(freshBoard('시트')));
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(result.current.board.sheets).toHaveLength(3);
  });

  it('updateBoardSession with nobody subscribed reads, writes and leaves no session behind', () => {
    const after = updateBoardSession('u1', '시트', board => addSheet(board, '시트'));
    expect(after.board.sheets).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(V2('u1'))!).sheets).toHaveLength(2);
    localStorage.setItem(V2('u1'), JSON.stringify(freshBoard('시트')));
    expect(readBoardSession('u1', '시트').board.sheets).toHaveLength(1);
  });

  const twoPanes = () => { const seed = freshBoard('시트'); return setLayout(seed, seed.sheets[0].id, '1x2'); };

  it('reloadBoardSession keeps the selected pane and the active sheet of a live board (no first-entry reset)', () => {
    const first = twoPanes();
    localStorage.setItem(V2('u1'), JSON.stringify(first));
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    const sheetId = first.sheets[0].id;
    act(() => { result.current.update(board => selectPane(board, sheetId, 1)); });
    expect(selectedIndex(result.current.board.sheets[0])).toBe(1);
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(selectedIndex(result.current.board.sheets[0])).toBe(1);
    // Another tab saved the sheet with pane 1 selected: the board on screen keeps its own pane 2.
    localStorage.setItem(V2('u1'), JSON.stringify(addSheet(first, '시트')));
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(selectedIndex(result.current.board.sheets[0])).toBe(1);
    expect(result.current.board.activeSheetId).toBe(sheetId);
  });

  it('a read-only session keeps its board, notice and refusal to write across reloadBoardSession', () => {
    const newer = JSON.stringify({ v: 3 });
    localStorage.setItem(V2('u1'), newer);
    const { result } = renderHook(() => useBoardSession('u1', '시트'));
    act(() => { result.current.update(board => addSheet(board, '시트')); });
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(result.current.storageNotice).toBe('newer');
    const compatible = JSON.stringify(freshBoard('시트'));
    localStorage.setItem(V2('u1'), compatible);
    act(() => { reloadBoardSession('u1', '시트'); });
    expect(result.current.board.sheets).toHaveLength(2);
    expect(result.current.storageNotice).toBe('newer');
    expect(readBoardSession('u1', '시트')).toMatchObject({ readOnly: true, notice: 'newer' });
    act(() => { result.current.update(board => addSheet(board, '시트')); });
    expect(localStorage.getItem(V2('u1'))).toBe(compatible);
  });

  it('an update that changes nothing, with nobody subscribed, leaves no session behind', () => {
    updateBoardSession('u1', '시트', board => board);
    localStorage.setItem(V2('u1'), JSON.stringify(addSheet(freshBoard('시트'), '시트')));
    expect(readBoardSession('u1', '시트').board.sheets).toHaveLength(2);
    expect(updateBoardSession('u1', '시트', board => board).board.sheets).toHaveLength(2);
  });
});
