import { describe, expect, it } from 'vitest';
import type { PaneScreen } from '@ap/kernel';
import {
  MAX_SHEETS, addSheet, applyPaneEdits, editPane, freshBoard, goBackPane, normalizeBoard, openScreenInNewSheet, parseBoard, previousOf, restoreLayout,
  revertPaneEdits, setLayout, setPane, type Board, type PaneEdit,
} from './boardModel';

const screen = (menuId: string, query = ''): PaneScreen => ({ menuId, params: {}, query });
const base = (): { board: Board; id: string } => {
  const start = freshBoard('시트');
  const id = start.sheets[0].id;
  return { board: setPane(setLayout(start, id, '1x2'), id, 0, screen('a')), id };
};
const sheetOf = (board: Board, id: string) => board.sheets.find(s => s.id === id)!;

describe('이전 화면 (previous)', () => {
  it('a push to another menu stores the screen it leaves, one step only; goBackPane restores it and forgets it', () => {
    const { board, id } = base();
    const pushed = editPane(board, id, 0, screen('b'), 'push');
    expect(previousOf(sheetOf(pushed, id), 0)).toEqual(screen('a'));
    const again = editPane(pushed, id, 0, screen('c'), 'push');
    expect(previousOf(sheetOf(again, id), 0)).toEqual(screen('b'));
    const back = goBackPane(again, id, 0);
    expect(sheetOf(back, id).panes[0]).toEqual(screen('b'));
    expect(previousOf(sheetOf(back, id), 0)).toBeNull();
    expect(goBackPane(back, id, 0)).toBe(back);
  });

  it.each([
    ['a replace to another menu', 'c', 'replace'],
    ['a push inside the same menu', 'b', 'push'],
  ] as const)('%s leaves previous alone', (_name, menuId, how) => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    const next = editPane(withPrevious, id, 0, screen(menuId, '?x=1'), how);
    expect(previousOf(sheetOf(next, id), 0)).toEqual(screen('a'));
    expect(previousOf(sheetOf(editPane(board, id, 0, screen('a', '?x=1'), 'push'), id), 0)).toBeNull();
    expect(previousOf(sheetOf(editPane(board, id, 0, screen('b'), 'replace'), id), 0)).toBeNull();
  });

  it('is cleared when the pane is cleared or given a whole new screen', () => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    expect(previousOf(sheetOf(setPane(withPrevious, id, 0, null), id), 0)).toBeNull();
    expect(previousOf(sheetOf(setPane(withPrevious, id, 0, screen('c')), id), 0)).toBeNull();
    const fresh = applyPaneEdits(withPrevious, id, [{ index: 0, before: screen('b'), after: screen('b', '?x=1'), fresh: true }]);
    expect(previousOf(sheetOf(fresh, id), 0)).toBeNull();
    const contextOnly = applyPaneEdits(withPrevious, id, [{ index: 0, before: screen('b'), after: screen('b', '?x=1') }]);
    expect(previousOf(sheetOf(contextOnly, id), 0)).toEqual(screen('a'));
  });

  it('is stored, parses back, and a board stored without it (or with a malformed one) still parses', () => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    expect(parseBoard(JSON.parse(JSON.stringify(withPrevious)))).toEqual(withPrevious);
    expect('previous' in sheetOf(board, id)).toBe(false);
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
    const broken = JSON.parse(JSON.stringify(withPrevious)) as { sheets: { previous: unknown }[] };
    broken.sheets[0].previous = [{ menuId: 1 }, null];
    expect(parseBoard(broken)?.sheets[0].previous).toBeUndefined();
    broken.sheets[0].previous = [null];
    expect(parseBoard(broken)?.sheets[0].previous).toBeUndefined();
  });

  it('follows a layout change, and the layout undo brings the dropped pane\'s previous back', () => {
    const { board, id } = base();
    const keep = editPane(setPane(board, id, 1, screen('z')), id, 1, screen('y'), 'push');
    const before = sheetOf(keep, id);
    const shrunk = setLayout(keep, id, '1x1');
    const after = sheetOf(shrunk, id);
    expect(after.previous).toBeUndefined();
    const restored = restoreLayout(shrunk, { sheetId: id, before, after, layout: '1x1' });
    expect(previousOf(sheetOf(restored!, id), 1)).toEqual(screen('z'));
    expect(normalizeBoard({ ...keep, sheets: [{ ...before, previous: [null] }] })?.sheets[0].previous).toBeUndefined();
  });
});

describe('pane edits', () => {
  const edits = (): PaneEdit[] => [{ index: 1, before: screen('b', '?x=1'), after: screen('b', '?x=2') }];
  const seeded = () => {
    const { board, id } = base();
    return { board: setPane(board, id, 1, screen('b', '?x=1')), id };
  };

  it('applies the edits and reverts them only while every edited pane still holds what the action left', () => {
    const { board, id } = seeded();
    const applied = applyPaneEdits(board, id, edits());
    expect(sheetOf(applied, id).panes[1]).toEqual(screen('b', '?x=2'));
    expect(sheetOf(revertPaneEdits(applied, id, edits())!, id).panes[1]).toEqual(screen('b', '?x=1'));
    expect(revertPaneEdits(setPane(applied, id, 1, screen('b', '?x=3')), id, edits())).toBeNull();
    expect(revertPaneEdits({ ...applied, sheets: [] }, id, edits())).toBeNull();
  });

  it('reverts a duplicate by emptying the pane it filled', () => {
    const { board, id } = base();
    const duplicate: PaneEdit[] = [{ index: 1, before: null, after: screen('a'), fresh: true }];
    const applied = applyPaneEdits(board, id, duplicate);
    expect(sheetOf(applied, id).panes).toEqual([screen('a'), screen('a')]);
    expect(sheetOf(revertPaneEdits(applied, id, duplicate)!, id).panes).toEqual([screen('a'), null]);
  });
});

describe('openScreenInNewSheet', () => {
  it('adds an active sheet holding the screen, and refuses at 20 sheets', () => {
    const board = freshBoard('시트');
    const next = openScreenInNewSheet(board, '시트', screen('a', '?x=1'))!;
    expect(next.sheets).toHaveLength(2);
    const added = sheetOf(next, next.activeSheetId);
    expect(added).toMatchObject({ layout: '1x1', panes: [screen('a', '?x=1')] });
    expect(added.name).toBe('시트 2');
    let full = board;
    for (let i = 1; i < MAX_SHEETS; i++) full = addSheet(full, '시트');
    expect(openScreenInNewSheet(full, '시트', screen('a'))).toBeNull();
  });
});
