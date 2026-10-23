import { describe, expect, it } from 'vitest';
import type { PaneScreen } from '@ap/kernel/host';
import {
  setArrangement, MAX_SHEETS, addSheet, applyPaneEdits, editPane, freshBoard, goBackPane, layoutOf, normalizeBoard, openScreenInNewSheet, parseBoardV2, previousAt, restoreLayout,
  revertPaneEdits, screens, setLayout, setPane, type Board, type PaneEdit,
} from './boardModel';
import { migrateV1 } from './boardMigrate';
import { toLegacy } from './__fixtures__/legacyBoard';

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
    expect(previousAt(sheetOf(pushed, id), 0)).toEqual(screen('a'));
    const again = editPane(pushed, id, 0, screen('c'), 'push');
    expect(previousAt(sheetOf(again, id), 0)).toEqual(screen('b'));
    const back = goBackPane(again, id, 0);
    expect(screens(sheetOf(back, id))[0]).toEqual(screen('b'));
    expect(previousAt(sheetOf(back, id), 0)).toBeNull();
    expect(goBackPane(back, id, 0)).toBe(back);
  });

  it.each([
    ['a replace to another menu', 'c', 'replace'],
    ['a push inside the same menu', 'b', 'push'],
  ] as const)('%s leaves previous alone', (_name, menuId, how) => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    const next = editPane(withPrevious, id, 0, screen(menuId, '?x=1'), how);
    expect(previousAt(sheetOf(next, id), 0)).toEqual(screen('a'));
    expect(previousAt(sheetOf(editPane(board, id, 0, screen('a', '?x=1'), 'push'), id), 0)).toBeNull();
    expect(previousAt(sheetOf(editPane(board, id, 0, screen('b'), 'replace'), id), 0)).toBeNull();
  });

  it('is cleared when the pane is cleared or given a whole new screen', () => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    expect(previousAt(sheetOf(setPane(withPrevious, id, 0, null), id), 0)).toBeNull();
    expect(previousAt(sheetOf(setPane(withPrevious, id, 0, screen('c')), id), 0)).toBeNull();
    const fresh = applyPaneEdits(withPrevious, id, [{ index: 0, before: screen('b'), after: screen('b', '?x=1'), fresh: true }]);
    expect(previousAt(sheetOf(fresh, id), 0)).toBeNull();
    const contextOnly = applyPaneEdits(withPrevious, id, [{ index: 0, before: screen('b'), after: screen('b', '?x=1') }]);
    expect(previousAt(sheetOf(contextOnly, id), 0)).toEqual(screen('a'));
  });

  it('is stored, parses back, and a board stored without it (or with a malformed one) still parses', () => {
    const { board, id } = base();
    const withPrevious = editPane(board, id, 0, screen('b'), 'push');
    expect(parseBoardV2(JSON.parse(JSON.stringify(withPrevious)))).toEqual(withPrevious);
    expect(sheetOf(board, id).panes.every(p => p.previous === null)).toBe(true);
    expect(parseBoardV2(JSON.parse(JSON.stringify(board)))).toEqual(board);
    // A V1 board stored with a malformed or wrong-length `previous` migrates without it; a V2 slot with a malformed one is rejected whole.
    const stored = toLegacy(withPrevious);
    expect(migrateV1({ ...stored, sheets: [{ ...stored.sheets[0], previous: [{ menuId: 1 }, null] }] })?.sheets[0].panes.map(p => p.previous)).toEqual([null, null]);
    expect(migrateV1({ ...stored, sheets: [{ ...stored.sheets[0], previous: [null] }] })?.sheets[0].panes.map(p => p.previous)).toEqual([null, null]);
    const broken = JSON.parse(JSON.stringify(withPrevious)) as { sheets: { panes: { previous: unknown }[] }[] };
    broken.sheets[0].panes[0].previous = { menuId: 1 };
    expect(parseBoardV2(broken)).toBeNull();
  });

  it('follows a layout change, and the layout undo brings the dropped pane\'s previous back', () => {
    const { board, id } = base();
    const keep = editPane(setPane(board, id, 1, screen('z')), id, 1, screen('y'), 'push');
    const before = sheetOf(keep, id);
    const shrunk = setLayout(keep, id, '1x1');
    const after = sheetOf(shrunk, id);
    expect(after.panes.every(p => p.previous === null)).toBe(true);
    const restored = restoreLayout(shrunk, { sheetId: id, before, after, layout: '1x1' });
    expect(previousAt(sheetOf(restored!, id), 1)).toEqual(screen('z'));
    // The slot owns its `previous`, so a wrong-length array cannot exist; the repair that remains is a selection pointing at no pane.
    expect(normalizeBoard({ ...keep, sheets: [{ ...before, selectedPaneId: 'gone' }] })?.sheets[0].selectedPaneId).toBe(before.panes[0].id);
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
    expect(screens(sheetOf(applied, id))[1]).toEqual(screen('b', '?x=2'));
    expect(screens(sheetOf(revertPaneEdits(applied, id, edits())!, id))[1]).toEqual(screen('b', '?x=1'));
    expect(revertPaneEdits(setPane(applied, id, 1, screen('b', '?x=3')), id, edits())).toBeNull();
    expect(revertPaneEdits({ ...applied, sheets: [] }, id, edits())).toBeNull();
  });

  it('reverts a Context-only edit without dropping the pane\'s 이전 화면', () => {
    const { board, id } = seeded();
    const withPrevious = editPane(board, id, 1, screen('c'), 'push');
    const only: PaneEdit[] = [{ index: 1, before: screen('c'), after: screen('c', '?x=2') }];
    const applied = applyPaneEdits(withPrevious, id, only);
    expect(previousAt(sheetOf(applied, id), 1)).toEqual(screen('b', '?x=1'));
    const reverted = revertPaneEdits(applied, id, only)!;
    expect(screens(sheetOf(reverted, id))[1]).toEqual(screen('c'));
    expect(previousAt(sheetOf(reverted, id), 1)).toEqual(screen('b', '?x=1'));
  });

  it('reverts a duplicate by emptying the pane it filled', () => {
    const { board, id } = base();
    const duplicate: PaneEdit[] = [{ index: 1, before: null, after: screen('a'), fresh: true }];
    const applied = applyPaneEdits(board, id, duplicate);
    expect(screens(sheetOf(applied, id))).toEqual([screen('a'), screen('a')]);
    expect(screens(sheetOf(revertPaneEdits(applied, id, duplicate)!, id))).toEqual([screen('a'), null]);
  });
});

describe('openScreenInNewSheet', () => {
  it('adds an active sheet holding the screen, and refuses at 20 sheets', () => {
    const board = freshBoard('시트');
    const next = openScreenInNewSheet(board, '시트', screen('a', '?x=1'))!;
    expect(next.sheets).toHaveLength(2);
    const added = sheetOf(next, next.activeSheetId);
    expect(layoutOf(added)).toBe('1x1');
    expect(screens(added)).toEqual([screen('a', '?x=1')]);
    expect(added.name).toBe('시트 2');
    let full = board;
    for (let i = 1; i < MAX_SHEETS; i++) full = addSheet(full, '시트');
    expect(openScreenInNewSheet(full, '시트', screen('a'))).toBeNull();
  });
});

it('pane navigation and edits/undo retain all saved arrangements', () => {
  const { board: original, id } = base();
  const value = { columns: [60, 40], rows: [[100], [100]], collapsed: [] };
  const board = setArrangement(original, id, '1x2', value);
  const navigated = editPane(board, id, 0, screen('b'), 'push');
  expect(goBackPane(navigated, id, 0).sheets[0].gridMemory).toEqual(board.sheets[0].gridMemory);
  const edits: PaneEdit[] = [{ index: 0, before: screens(board.sheets[0])[0], after: screen('a', '?tab=x') }];
  const applied = applyPaneEdits(board, id, edits);
  expect(revertPaneEdits(applied, id, edits)?.sheets[0].gridMemory).toEqual(board.sheets[0].gridMemory);
  expect(openScreenInNewSheet(board, '시트', screen('c'))?.sheets[0].gridMemory).toEqual(board.sheets[0].gridMemory);
});
