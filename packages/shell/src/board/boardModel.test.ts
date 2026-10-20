import { describe, expect, it } from 'vitest';
import type { PaneScreen } from '@ap/kernel';
import { defaultArrangement, getArrangement, setArrangement, MAX_SHEETS, addSheet, atFirstPanes, droppedPaneCount, freshBoard, moveSheet, nextSheetName, normalizeBoard, paneCount, parseBoard, removeSheet, renameSheet, restoreLayout, restorePane, restoreSheet, selectPane, setLayout, setPane, type Board, type LayoutChange } from './boardModel';

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
    const restored = restoreSheet(result.board, result.removed)!;
    expect(restored.sheets.map(s => s.id)).toEqual([only.id]);
    expect(restored.activeSheetId).toBe(only.id);
  });

  it('undo of a delete keeps edits made meanwhile to other sheets', () => {
    const board = two();
    const [a, b] = board.sheets;
    const result = removeSheet(board, a.id, '시트')!;
    const edited = renameSheet(result.board, b.id, '다른 이름');
    const restored = restoreSheet(edited, result.removed)!;
    expect(restored.sheets.map(s => s.name)).toEqual(['시트 1', '다른 이름']);
  });

  it('undo of deleting the last sheet restores nothing once the replacement sheet was renamed or edited', () => {
    const board = freshBoard('시트');
    const result = removeSheet(board, board.sheets[0].id, '시트')!;
    const blank = result.board.sheets[0];
    expect(restoreSheet(renameSheet(result.board, blank.id, '새 비교'), result.removed)).toBeNull();
    expect(restoreSheet(setPane(result.board, blank.id, 0, screen('a')), result.removed)).toBeNull();
    expect(restoreSheet(setLayout(result.board, blank.id, '1x2'), result.removed)).toBeNull();
  });

  it('undo of a delete never writes a 21st sheet (20 → delete → add → undo)', () => {
    let board = freshBoard('시트');
    for (let i = 1; i < MAX_SHEETS; i++) board = addSheet(board, '시트');
    const result = removeSheet(board, board.sheets[3].id, '시트')!;
    const refilled = addSheet(result.board, '시트');
    expect(refilled.sheets).toHaveLength(MAX_SHEETS);
    expect(restoreSheet(refilled, result.removed)).toBeNull();
    const restored = restoreSheet(result.board, result.removed)!;
    expect(restored.sheets).toHaveLength(MAX_SHEETS);
    expect(parseBoard(JSON.parse(JSON.stringify(restored)))).not.toBeNull();
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

  const shrink = (board: Board, id: string, layout: '1x2' | '1x1' = '1x2'): { after: Board; change: LayoutChange } => {
    const after = setLayout(board, id, layout);
    return { after, change: { sheetId: id, before: board.sheets[0], after: after.sheets[0], layout } };
  };

  it('undo of a shrink brings back the layout, the dropped panes and the selection when the sheet is as the shrink left it', () => {
    const { board, id } = base();
    const selected = selectPane(board, id, 3);
    const { after, change } = shrink(selected, id);
    const restored = restoreLayout(after, change)!;
    expect(restored.sheets[0].layout).toBe('2x2');
    expect(restored.sheets[0].panes.map(p => p?.menuId)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(restored.sheets[0].selected).toBe(3);
  });

  it('undo of a shrink restores nothing if the sheet was edited, re-expanded or its selection moved on meanwhile', () => {
    const { board, id } = base();
    const { after, change } = shrink(board, id);
    expect(restoreLayout(setPane(after, id, 0, screen('edited')), change)).toBeNull();
    const regrown = setPane(setLayout(after, id, '2x2'), id, 3, screen('new'));
    expect(restoreLayout(regrown, change)).toBeNull();
    expect(restoreLayout(setLayout(after, id, '2x2'), change)).toBeNull();
    // Selecting another pane is not an edit of the content, and the user's selection stays.
    const moved = restoreLayout(selectPane(after, id, 1), change)!;
    expect(moved.sheets[0].layout).toBe('2x2');
    expect(moved.sheets[0].selected).toBe(1);
  });

  it('undo of a 1×1 shrink after growing back to 2×2 and selecting pane 4 restores nothing, so the selection stays inside the panes', () => {
    const { board, id } = base();
    const { after, change } = shrink(board, id, '1x1');
    const regrown = selectPane(setLayout(after, id, '2x2'), id, 3);
    const restored = restoreLayout(regrown, change);
    expect(restored).toBeNull();
    expect(regrown.sheets[0].panes).toHaveLength(4);
  });

  it('undo of a shrink touches only its own sheet', () => {
    const { board, id } = base();
    const more = addSheet(board, '시트');
    const other = more.sheets[1];
    const { after, change } = shrink(more, id);
    const restored = restoreLayout(after, change)!;
    expect(restored.sheets[1]).toBe(other);
    expect(restoreLayout({ ...after, sheets: after.sheets.filter(s => s.id !== id) }, change)).toBeNull();
  });

  it('undo of a clear restores only a slot that is still there and still empty', () => {
    const { board, id } = base();
    const cleared = setPane(board, id, 1, null);
    expect(restorePane(cleared, id, 1, screen('m1'))!.sheets[0].panes[1]?.menuId).toBe('m1');
    expect(restorePane(setPane(cleared, id, 1, screen('new')), id, 1, screen('m1'))).toBeNull();
    expect(restorePane(setLayout(cleared, id, '1x1'), id, 1, screen('m1'))).toBeNull();
  });
});

describe('normalizeBoard', () => {
  it('returns a valid board as is', () => {
    const board = two();
    expect(normalizeBoard(board)).toBe(board);
  });

  it('repairs pane counts, a selection out of range, an unknown active sheet and more than 20 sheets', () => {
    const board = two();
    const [a, b] = board.sheets;
    const broken: Board = { ...board, activeSheetId: 'gone', sheets: [{ ...a, layout: '2x2', panes: [null], selected: 5 }, { ...b, panes: [null, null, null], selected: -1 }] };
    const fixed = normalizeBoard(broken)!;
    expect(fixed.sheets[0].panes).toHaveLength(4);
    expect(fixed.sheets[0].selected).toBe(0);
    expect(fixed.sheets[1].panes).toHaveLength(1);
    expect(fixed.sheets[1].selected).toBe(0);
    expect(fixed.activeSheetId).toBe(a.id);
    expect(parseBoard(JSON.parse(JSON.stringify(fixed)))).not.toBeNull();
    const crowded: Board = { ...board, sheets: Array.from({ length: MAX_SHEETS + 3 }, (_, i) => ({ ...a, id: `x${i}` })), activeSheetId: 'x0' };
    expect(normalizeBoard(crowded)!.sheets).toHaveLength(MAX_SHEETS);
  });

  it('has no board to repair when no sheet is left', () => {
    expect(normalizeBoard({ ...two(), sheets: [] })).toBeNull();
  });
});

describe('atFirstPanes', () => {
  it('selects the first pane of every sheet and keeps an already-first board as is', () => {
    const start = two();
    const [a] = start.sheets;
    const picked = selectPane(setLayout(start, a.id, '2x2'), a.id, 3);
    expect(picked.sheets[0].selected).toBe(3);
    expect(atFirstPanes(picked).sheets.map(s => s.selected)).toEqual([0, 0]);
    expect(atFirstPanes(start)).toBe(start);
  });
});

describe('per-layout arrangement', () => {
  const custom = { columns: [60, 40], rows: [[30, 70], [65, 35]], collapsed: [0] };
  it('round-trips independent layouts and preserves them through unrelated edits and layout undo', () => {
    const start = freshBoard('시트');
    const id = start.sheets[0].id;
    const wide = setArrangement(setLayout(start, id, '2x2'), id, '2x2', custom);
    const small = setLayout(wide, id, '1x2');
    const later = setArrangement(small, id, '1x2', { columns: [55, 45], rows: [[100], [100]], collapsed: [] });
    const change: LayoutChange = { sheetId: id, before: wide.sheets[0], after: small.sheets[0], layout: '1x2' };
    const restored = restoreLayout(later, change)!;
    expect(getArrangement(restored.sheets[0])).toEqual(custom);
    expect(restored.sheets[0].arrangement?.['1x2']?.columns).toEqual([55, 45]);
    const edited = renameSheet(selectPane(setPane(restored, id, 0, screen('a')), id, 1), id, 'edited');
    expect(parseBoard(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
    expect(atFirstPanes(edited).sheets[0].arrangement).toEqual(restored.sheets[0].arrangement);
    expect(addSheet(edited, '시트').sheets[1].arrangement).toBeUndefined();
  });
  it.each([
    { columns: [0, 100] }, { columns: [NaN, 50] }, { columns: [Infinity, 1] }, { columns: ['50', 50] },
    { columns: [20, 20] }, { columns: [100] }, { rows: [[50, 50]] }, { rows: [[100], [50, 50]] },
    { collapsed: [0, 2] }, { collapsed: [1, 3] }, { collapsed: [0, 0] }, { collapsed: [-1] },
    { collapsed: [4] }, { collapsed: [0.5] }, { rows: [[-10, 110], [50, 50]] },
  ])('drops only an invalid layout entry: %j', invalid => {
    const board = freshBoard('시트');
    const raw = { ...board, sheets: [{ ...board.sheets[0], arrangement: {
      '2x2': { ...custom, ...invalid }, '1x2': { columns: [70, 30], rows: [[100], [100]], collapsed: [] }, bogus: custom,
    } }] };
    expect(parseBoard(raw)?.sheets[0].arrangement).toEqual({ '1x2': { columns: [70, 30], rows: [[100], [100]], collapsed: [] } });
  });
  it('canonicalizes defaults and rejects impossible logical-column collapse in 1×2', () => {
    const board = freshBoard('시트');
    const id = board.sheets[0].id;
    expect(setArrangement(board, id, '2x2', defaultArrangement('2x2')).sheets[0].arrangement).toBeUndefined();
    const raw = { ...board, sheets: [{ ...board.sheets[0], arrangement: { '1x2': { columns: [50, 50], rows: [[100], [100]], collapsed: [0] } } }] };
    expect(parseBoard(raw)).toEqual(board);
    expect(parseBoard({ ...board, sheets: [{ ...board.sheets[0], arrangement: 'bad' }] })).toEqual(board);
    expect(getArrangement(board.sheets[0])).toEqual(defaultArrangement('1x1'));
  });
  it('makes last-sheet delete undo stale after an arrangement edit alone', () => {
    const start = freshBoard('시트');
    const removed = removeSheet(start, start.sheets[0].id, '시트')!;
    const edited = setArrangement(removed.board, removed.board.sheets[0].id, '2x2', custom);
    expect(restoreSheet(edited, removed.removed)).toBeNull();
  });
});
