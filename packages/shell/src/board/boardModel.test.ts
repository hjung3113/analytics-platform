import { describe, expect, it } from 'vitest';
import type { PaneScreen } from '@ap/kernel';
import { MAX_SHEETS, addSheet, droppedPaneCount, freshBoard, moveSheet, nextSheetName, paneCount, parseBoard, removeSheet, renameSheet, restoreLayout, restorePane, restoreSheet, selectPane, setLayout, setPane, type Board, type LayoutChange } from './boardModel';

const screen = (menuId: string): PaneScreen => ({ menuId, params: {}, query: '' });
const two = (): Board => addSheet(freshBoard('시트'), '시트');

describe('parseBoard', () => {
  it('round-trips a board through JSON', () => {
    const start = two();
    const board = setPane(setLayout(start, start.sheets[0].id, '1x2'), start.sheets[0].id, 1, { menuId: 'a', params: { id: 'x y' }, query: '?tab=2' });
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
  });

  it.each([
    ['non-object', 'x'],
    ['newer version', { ...freshBoard('시트'), v: 2 }],
    ['no sheets', { ...freshBoard('시트'), sheets: [] }],
    ['unknown active sheet', { ...freshBoard('시트'), activeSheetId: 'nope' }],
    ['unknown layout', { ...freshBoard('시트'), sheets: [{ ...freshBoard('시트').sheets[0], layout: '3x3' }] }],
    ['pane count off', { ...freshBoard('시트'), sheets: [{ ...freshBoard('시트').sheets[0], layout: '1x2' }] }],
    ['selected out of range', { ...freshBoard('시트'), sheets: [{ ...freshBoard('시트').sheets[0], selected: 3 }] }],
    ['bad pane', { ...freshBoard('시트'), sheets: [{ ...freshBoard('시트').sheets[0], panes: [{ menuId: 1, params: {}, query: '' }] }] }],
    ['query without ?', { ...freshBoard('시트'), sheets: [{ ...freshBoard('시트').sheets[0], panes: [{ menuId: 'a', params: {}, query: 'x=1' }] }] }],
  ])('rejects %s', (_name, value) => {
    expect(parseBoard(value)).toBeNull();
  });

  it('rejects duplicate sheet ids and more than 20 sheets', () => {
    const board = freshBoard('시트');
    expect(parseBoard({ ...board, sheets: [board.sheets[0], board.sheets[0]] })).toBeNull();
    let full = board;
    for (let i = 1; i < MAX_SHEETS; i++) full = addSheet(full, '시트');
    expect(parseBoard(full)).not.toBeNull();
    expect(parseBoard({ ...full, sheets: [...full.sheets, { ...full.sheets[0], id: 'extra' }] })).toBeNull();
  });
});

describe('sheets', () => {
  it('names new sheets with the smallest unused number and caps at 20', () => {
    let board = freshBoard('시트');
    board = addSheet(board, '시트');
    expect(board.sheets.map(s => s.name)).toEqual(['시트 1', '시트 2']);
    expect(nextSheetName(board.sheets.slice(1), '시트')).toBe('시트 1');
    for (let i = 0; i < 30; i++) board = addSheet(board, '시트');
    expect(board.sheets).toHaveLength(MAX_SHEETS);
  });

  it('rename ignores blank names; move clamps; reorder keeps ids', () => {
    const board = two();
    const [a, b] = board.sheets;
    expect(renameSheet(board, a.id, '  ')).toBe(board);
    expect(renameSheet(board, a.id, ' 비교 ').sheets[0].name).toBe('비교');
    expect(moveSheet(board, a.id, 5).sheets.map(s => s.id)).toEqual([b.id, a.id]);
    expect(moveSheet(board, a.id, 0)).toBe(board);
  });

  it('removing the last sheet leaves one empty sheet; undo brings the old one back and drops the untouched blank', () => {
    const board = setPane(freshBoard('시트'), freshBoard('시트').sheets[0].id, 0, screen('a'));
    const only = board.sheets[0];
    const result = removeSheet(board, only.id, '시트')!;
    expect(result.board.sheets).toHaveLength(1);
    expect(result.board.sheets[0].id).not.toBe(only.id);
    expect(result.board.sheets[0].panes).toEqual([null]);
    const restored = restoreSheet(result.board, result.removed);
    expect(restored.sheets.map(s => s.id)).toEqual([only.id]);
    expect(restored.activeSheetId).toBe(only.id);
  });

  it('undo of a delete keeps edits made meanwhile to other sheets', () => {
    const board = two();
    const [a, b] = board.sheets;
    const result = removeSheet(board, a.id, '시트')!;
    const edited = renameSheet(result.board, b.id, '다른 이름');
    const restored = restoreSheet(edited, result.removed);
    expect(restored.sheets.map(s => s.name)).toEqual(['시트 1', '다른 이름']);
  });
});

describe('panes and layouts', () => {
  const base = (): { board: Board; id: string } => {
    let board = freshBoard('시트');
    const id = board.sheets[0].id;
    board = setLayout(board, id, '2x2');
    for (let i = 0; i < 4; i++) board = setPane(board, id, i, screen(`m${i}`));
    return { board, id };
  };

  it('counts panes per layout and keeps the array length in step', () => {
    expect(paneCount('2x2')).toBe(4);
    const { board, id } = base();
    expect(setLayout(board, id, '1x2').sheets[0].panes).toHaveLength(2);
  });

  it('shrinking drops the overflow panes and moves a selection that fell off to pane 1', () => {
    const { board, id } = base();
    const selected = selectPane(board, id, 3);
    const shrunk = setLayout(selected, id, '1x2');
    expect(shrunk.sheets[0].panes.map(p => p?.menuId)).toEqual(['m0', 'm1']);
    expect(shrunk.sheets[0].selected).toBe(0);
    expect(droppedPaneCount(board.sheets[0], '1x2')).toBe(2);
    expect(droppedPaneCount(setPane(setPane(board, id, 2, null), id, 3, null).sheets[0], '1x2')).toBe(0);
  });

  it('undo of a shrink restores the dropped panes only; panes that stayed keep their later edits', () => {
    const { board, id } = base();
    const change: LayoutChange = { sheetId: id, before: selectPane(board, id, 3).sheets[0], layout: '1x2' };
    const after = setPane(setLayout(selectPane(board, id, 3), id, '1x2'), id, 0, screen('edited'));
    const restored = restoreLayout(after, change);
    expect(restored.sheets[0].layout).toBe('2x2');
    expect(restored.sheets[0].panes.map(p => p?.menuId)).toEqual(['edited', 'm1', 'm2', 'm3']);
    expect(restored.sheets[0].selected).toBe(3);
  });

  it('undo of a shrink touches only its own sheet', () => {
    const { board, id } = base();
    const more = addSheet(board, '시트');
    const other = more.sheets[1];
    const change: LayoutChange = { sheetId: id, before: board.sheets[0], layout: '1x2' };
    const restored = restoreLayout(setLayout(more, id, '1x2'), change);
    expect(restored.sheets[1]).toBe(other);
  });

  it('undo of a clear never overwrites a screen placed in the slot since', () => {
    const { board, id } = base();
    const cleared = setPane(board, id, 1, null);
    expect(restorePane(cleared, id, 1, screen('m1')).sheets[0].panes[1]?.menuId).toBe('m1');
    const replaced = setPane(cleared, id, 1, screen('new'));
    expect(restorePane(replaced, id, 1, screen('m1')).sheets[0].panes[1]?.menuId).toBe('new');
  });
});
