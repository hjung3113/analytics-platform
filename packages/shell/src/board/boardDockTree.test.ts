import { describe, expect, it } from 'vitest';
import { isValidDockTree } from '@ap/components/dock';
import { activateInTree, defaultTree, effectiveTree, fromDockTree, groupHolding, groupsOf, reconcileSelection, toDockTree } from './boardDockTree';
import {
  addPane, addPaneInGroup, applyPaneEdits, closePane, freshBoard, normalizeBoard, restoreClosedPane, restorePane, resetTree, revertPaneEdits, selectPane, selectPaneActive, setPane, setTree, withGrid,
  type Board, type LayoutNode, type Sheet,
} from './boardModel';
import { defaultArrangement } from './boardTypes';

const screen = (menuId: string) => ({ menuId, params: {}, query: '' });
const g = (panes: string[], active = panes[0]!): LayoutNode => ({ type: 'group', panes, active });
const row = (sizes: number[], ...children: LayoutNode[]): LayoutNode => ({ type: 'branch', dir: 'row', sizes, children });
const col = (sizes: number[], ...children: LayoutNode[]): LayoutNode => ({ type: 'branch', dir: 'column', sizes, children });

/** A board of one sheet `s` with `count` panes, grown the way a user grows it (`칸 추가`). */
function boardOf(count: number): { board: Board; ids: string[] } {
  let board = freshBoard('시트');
  const sheetId = board.sheets[0].id;
  for (let n = 1; n < count; n++) board = addPane(board, sheetId);
  return { board, ids: board.sheets[0].panes.map(p => p.id) };
}
const sheetOf = (board: Board): Sheet => board.sheets[0];
const sid = (board: Board) => sheetOf(board).id;
const idsOf = (board: Board) => sheetOf(board).panes.map(p => p.id);

describe('toDockTree / fromDockTree', () => {
  const trees: [string, LayoutNode][] = [
    ['one group', g(['a'])],
    ['tabs in one group', g(['a', 'b', 'c'], 'b')],
    ['a row', row([30, 70], g(['a']), g(['b']))],
    ['nested', row([40, 60], col([50, 50], g(['a']), g(['c'], 'c')), g(['b', 'd'], 'd'))],
  ];
  it.each(trees)('round-trips %s', (_name, tree) => {
    expect(fromDockTree(toDockTree(tree))).toEqual(tree);
  });
  it('renames the member list and nothing else', () => {
    expect(toDockTree(row([50, 50], g(['a', 'b'], 'b'), g(['c'])))).toEqual({
      type: 'branch', dir: 'row', sizes: [50, 50], children: [{ type: 'group', panels: ['a', 'b'], active: 'b' }, { type: 'group', panels: ['c'], active: 'c' }],
    });
  });
  it('does not share arrays with its input', () => {
    const tree = g(['a', 'b']);
    const dock = toDockTree(tree);
    if (dock.type === 'group') dock.panels.push('x');
    expect(tree).toEqual(g(['a', 'b']));
  });
});

describe('reconcileSelection', () => {
  const sheet = (tree: LayoutNode, selectedPaneId: string): Sheet => ({
    id: 's', name: 's', panes: ['a', 'b', 'c'].map(id => ({ id, screen: null, previous: null })), selectedPaneId, tree,
  });
  it.each<[string, LayoutNode, string, string]>([
    ['the selected pane is its group\'s active tab', row([50, 50], g(['a', 'b'], 'a'), g(['c'])), 'a', 'a'],
    ['a single-pane group', row([50, 50], g(['a', 'b'], 'a'), g(['c'])), 'c', 'c'],
    ['another tab came to the front of the selected pane\'s group', row([50, 50], g(['a', 'b'], 'b'), g(['c'])), 'a', 'b'],
    ['the selected pane became a background tab of the group it was dropped into', row([50, 50], g(['a']), g(['c', 'b'], 'c')), 'b', 'c'],
  ])('%s', (_name, tree, selected, expected) => {
    expect(reconcileSelection(sheet(tree, selected)).selectedPaneId).toBe(expected);
  });
  it('returns the same sheet when nothing needs to move', () => {
    const ok = sheet(g(['a', 'b', 'c'], 'a'), 'a');
    expect(reconcileSelection(ok)).toBe(ok);
  });
  it('activateInTree fronts the pane and leaves the rest', () => {
    const tree = row([50, 50], g(['a', 'b'], 'a'), g(['c']));
    expect(activateInTree(tree, 'b')).toEqual(row([50, 50], g(['a', 'b'], 'b'), g(['c'])));
    expect(activateInTree(tree, 'a')).toBe(tree);
    expect(activateInTree(tree, 'zzz')).toBe(tree);
  });
  it('effectiveTree shows the selected pane in front even when the stored tree says otherwise', () => {
    const stored = sheet(g(['a', 'b', 'c'], 'c'), 'a');
    expect(effectiveTree(stored)).toEqual(g(['a', 'b', 'c'], 'a'));
  });
});

describe('defaultTree', () => {
  it.each([1, 2, 3, 4])('is a valid tree over %i panes in pane-number order', count => {
    const ids = ['p1', 'p2', 'p3', 'p4'].slice(0, count);
    expect(isValidDockTree(toDockTree(defaultTree(ids)), ids)).toBe(true);
  });
  it.each([[1, '1x1'], [2, '1x2'], [4, '2x2']] as const)('is the grid shape for %i panes', (count, layout) => {
    const { board } = boardOf(count);
    const sheet = sheetOf(board);
    expect(defaultTree(sheet.panes.map(p => p.id))).toEqual(withGrid(sheet, layout, defaultArrangement(layout)).tree);
  });
  it('puts pane 1 beside a column of panes 2 and 3 for three panes', () => {
    expect(defaultTree(['p1', 'p2', 'p3'])).toEqual(row([50, 50], g(['p1']), col([50, 50], g(['p2']), g(['p3']))));
  });
  it('resetTree restores it, keeps the selected pane in front and reports no change when already default', () => {
    const { board, ids } = boardOf(3);
    const moved = setTree(board, sid(board), g(ids, ids[2]));
    const reset = resetTree(moved, sid(moved));
    expect(sheetOf(reset).tree).toEqual(defaultTree(ids));
    expect(sheetOf(reset).selectedPaneId).toBe(sheetOf(moved).selectedPaneId);
    expect(resetTree(reset, sid(reset))).toBe(reset);
  });
});

describe('setTree', () => {
  it('stores a valid tree and lets the selection follow the active tab', () => {
    const { board, ids } = boardOf(2);
    const selectedFirst = selectPaneActive(board, sid(board), 0);
    const next = setTree(selectedFirst, sid(board), g(ids, ids[1]));
    expect(sheetOf(next).tree).toEqual(g(ids, ids[1]));
    expect(sheetOf(next).selectedPaneId).toBe(ids[1]);
  });
  it.each<[string, (ids: string[]) => LayoutNode]>([
    ['a pane missing', ids => g([ids[0]])],
    ['an unknown pane', ids => g([...ids, 'zz'])],
    ['a duplicate pane', ids => g([ids[0], ids[0], ids[1]])],
    ['sizes that do not sum to 100', ids => row([30, 30], g([ids[0]]), g([ids[1]]))],
    ['an active tab outside its group', ids => g(ids, 'zz')],
  ])('ignores %s', (_name, build) => {
    const { board, ids } = boardOf(2);
    expect(setTree(board, sid(board), build(ids))).toBe(board);
  });
  it('ignores the tree the sheet already has', () => {
    const { board } = boardOf(2);
    expect(setTree(board, sid(board), sheetOf(board).tree)).toBe(board);
  });
});

describe('selectPaneActive vs selectPane', () => {
  it('selectPane stays tree-free (a collapsed grid column\'s active tab is which pane is open)', () => {
    const { board, ids } = boardOf(2);
    const tabbed = setTree(board, sid(board), g(ids, ids[0]));
    const next = selectPane(tabbed, sid(board), 1);
    expect(sheetOf(next).selectedPaneId).toBe(ids[1]);
    expect(sheetOf(next).tree).toEqual(g(ids, ids[0]));
  });
  it('selectPaneActive also fronts the pane in its group', () => {
    const { board, ids } = boardOf(2);
    const tabbed = setTree(board, sid(board), g(ids, ids[0]));
    const next = selectPaneActive(tabbed, sid(board), 1);
    expect(sheetOf(next).selectedPaneId).toBe(ids[1]);
    expect(sheetOf(next).tree).toEqual(g(ids, ids[1]));
    expect(selectPaneActive(next, sid(next), 1)).toBe(next);
  });
});

describe('addPane', () => {
  it('appends pane N+1, selects it and docks it right of the selected pane\'s group', () => {
    const { board, ids } = boardOf(1);
    const next = addPane(board, sid(board));
    const sheet = sheetOf(next);
    expect(sheet.panes).toHaveLength(2);
    expect(sheet.panes[0].id).toBe(ids[0]);
    expect(sheet.selectedPaneId).toBe(sheet.panes[1].id);
    expect(sheet.tree).toEqual(row([50, 50], g([ids[0]]), g([sheet.panes[1].id])));
  });
  it('on the default arrangement the result is the default arrangement of one pane more: 1 → 2 → 3 → 2×2', () => {
    let board = freshBoard('시트');
    const shapes: LayoutNode[] = [];
    for (let n = 1; n < 4; n++) {
      board = addPane(board, sid(board));
      shapes.push(sheetOf(board).tree);
      expect(sheetOf(board).tree).toEqual(defaultTree(idsOf(board)));
      expect(sheetOf(board).selectedPaneId).toBe(idsOf(board)[n]);
    }
    const [one, two, four] = [shapes[0]!, shapes[1]!, shapes[2]!];
    expect(one).toEqual(row([50, 50], g([idsOf(board)[0]!]), g([idsOf(board)[1]!])));
    expect(two).toEqual(row([50, 50], g([idsOf(board)[0]!]), col([50, 50], g([idsOf(board)[1]!]), g([idsOf(board)[2]!]))));
    expect(four).toEqual(row([50, 50], col([50, 50], g([idsOf(board)[0]!]), g([idsOf(board)[2]!])), col([50, 50], g([idsOf(board)[1]!]), g([idsOf(board)[3]!]))));
  });
  it('on any other arrangement it splits the largest group along its longer side and selects the new pane there', () => {
    const { board, ids } = boardOf(3);
    // Pane 1 takes 70% of the width: it is the largest group and wider than tall, so the new pane goes to its right (a sibling in the same row).
    const wide = setTree(board, sid(board), row([70, 30], g([ids[0]!]), col([50, 50], g([ids[1]!]), g([ids[2]!]))));
    const right = sheetOf(addPane(wide, sid(wide)));
    expect(right.tree).toEqual(row([35, 35, 30], g([ids[0]!]), g([right.panes[3]!.id]), col([50, 50], g([ids[1]!]), g([ids[2]!]))));
    expect(right.selectedPaneId).toBe(right.panes[3]!.id);
    expect(isValidDockTree(toDockTree(right.tree), right.panes.map(p => p.id))).toBe(true);
    // Three equal columns are taller than wide: the first (a tie) is split, the new pane goes below it.
    const columns = setTree(board, sid(board), row([34, 33, 33], g([ids[0]!]), g([ids[1]!]), g([ids[2]!])));
    const below = sheetOf(addPane(columns, sid(columns)));
    expect(below.tree).toEqual(row([34, 33, 33], col([50, 50], g([ids[0]!]), g([below.panes[3]!.id])), g([ids[1]!]), g([ids[2]!])));
  });
  it('a resized default arrangement is not the default any more', () => {
    const { board, ids } = boardOf(2);
    const resized = setTree(board, sid(board), row([70, 30], g([ids[0]!]), g([ids[1]!])));
    const next = sheetOf(addPane(resized, sid(resized)));
    expect(next.tree).toEqual(row([35, 35, 30], g([ids[0]!]), g([next.panes[2]!.id]), g([ids[1]!])));
  });
  it('can leave the selection alone', () => {
    const { board, ids } = boardOf(1);
    expect(sheetOf(addPane(board, sid(board), false)).selectedPaneId).toBe(ids[0]);
  });
  it('can leave the selection and the group\'s active tab alone at four groups (893e)', () => {
    const { board, ids } = boardOf(4);
    const selected = sheetOf(board).selectedPaneId;
    const group = groupHolding(sheetOf(board).tree, selected)!;
    const viaAdd = sheetOf(addPane(board, sid(board), false));
    expect(viaAdd.panes).toHaveLength(5);
    expect(viaAdd.selectedPaneId).toBe(selected);
    expect(groupHolding(viaAdd.tree, selected)!.active).toBe(group.active);
    expect(groupHolding(viaAdd.tree, viaAdd.panes[4]!.id)!.panes).toContain(selected);
    const viaGroup = sheetOf(addPaneInGroup(board, sid(board), ids[3]!, null, false));
    expect(viaGroup.selectedPaneId).toBe(selected);
    expect(groupHolding(viaGroup.tree, ids[3]!)!.active).toBe(ids[3]);
  });
  it('at four groups adds a tab to the selected pane\'s group instead of a fifth group, and is a no-op at eight panes (893e)', () => {
    const { board, ids } = boardOf(4);
    let next = board;
    for (let n = 5; n <= 8; n++) {
      next = addPane(next, sid(next));
      expect(sheetOf(next).panes).toHaveLength(n);
      expect(groupsOf(sheetOf(next).tree)).toHaveLength(4);
    }
    expect(sheetOf(next).panes.slice(0, 4).map(p => p.id)).toEqual(ids);
    expect(groupHolding(sheetOf(next).tree, ids[3]!)!.panes.length).toBeGreaterThan(1);
    expect(addPane(next, sid(next))).toBe(next);
  });
});

describe('closePane', () => {
  const withScreens = (count: number) => {
    const { board, ids } = boardOf(count);
    return { board: ids.reduce((b, _id, i) => setPane(b, sid(b), i, screen(`m${i + 1}`)), board), ids };
  };
  it('refuses a pane with a screen and the only pane', () => {
    const { board } = withScreens(2);
    expect(closePane(board, sid(board), 0)).toBeNull();
    const single = boardOf(1);
    expect(closePane(single.board, sid(single.board), 0)).toBeNull();
  });
  it('removes an empty pane 2 of 3: later numbers move down, the tree stays valid and the selection is kept', () => {
    const { board, ids } = withScreens(3);
    const emptied = setPane(board, sid(board), 1, null);
    const kept = selectPaneActive(emptied, sid(emptied), 2);
    const result = closePane(kept, sid(kept), 1)!;
    const sheet = sheetOf(result.board);
    expect(sheet.panes.map(p => p.id)).toEqual([ids[0], ids[2]]);
    expect(sheet.panes.map(p => p.screen?.menuId)).toEqual(['m1', 'm3']);
    expect(sheet.selectedPaneId).toBe(ids[2]);
    expect(isValidDockTree(toDockTree(sheet.tree), [ids[0], ids[2]])).toBe(true);
  });
  it('hands a closed selected pane\'s selection to the pane that takes its number (the last one when it was last)', () => {
    const { board, ids } = withScreens(3);
    const open = (index: number) => {
      const emptied = setPane(selectPaneActive(board, sid(board), index), sid(board), index, null);
      return sheetOf(closePane(emptied, sid(emptied), index)!.board);
    };
    expect(open(1).selectedPaneId).toBe(ids[2]);
    expect(open(2).selectedPaneId).toBe(ids[1]);
    expect(open(0).selectedPaneId).toBe(ids[1]);
  });
  it('closes a background tab without moving the selection', () => {
    const { board, ids } = withScreens(2);
    const tabbed = setTree(setPane(board, sid(board), 1, null), sid(board), g(ids, ids[0]));
    const selected = selectPaneActive(tabbed, sid(tabbed), 0);
    const sheet = sheetOf(closePane(selected, sid(selected), 1)!.board);
    expect(sheet.tree).toEqual(g([ids[0]]));
    expect(sheet.selectedPaneId).toBe(ids[0]);
  });

  describe('undo (restoreClosedPane)', () => {
    it('puts the pane back under its number and in its place in the tree', () => {
      const { board, ids } = withScreens(3);
      const emptied = setPane(board, sid(board), 1, null);
      const before = sheetOf(emptied);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const restored = sheetOf(restoreClosedPane(closed.board, closed.closed)!);
      expect(restored.panes.map(p => p.id)).toEqual(ids);
      expect(restored.tree).toEqual(before.tree);
      expect(restored.selectedPaneId).toBe(before.selectedPaneId);
    });
    it('restores a closed selected pane\'s selection while nothing moved it', () => {
      const { board, ids } = withScreens(3);
      const selected = setPane(selectPaneActive(board, sid(board), 2), sid(board), 2, null);
      const closed = closePane(selected, sid(selected), 2)!;
      expect(sheetOf(closed.board).selectedPaneId).toBe(ids[1]);
      expect(sheetOf(restoreClosedPane(closed.board, closed.closed)!).selectedPaneId).toBe(ids[2]);
      const moved = selectPaneActive(closed.board, sid(closed.board), 0);
      expect(sheetOf(restoreClosedPane(moved, closed.closed)!).selectedPaneId).toBe(ids[0]);
    });
    it('docks the pane right of the selected pane after the arrangement changed, still as the same number', () => {
      const { board, ids } = withScreens(3);
      const emptied = setPane(board, sid(board), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const merged = setTree(closed.board, sid(closed.board), g([ids[0], ids[2]]));
      const restored = sheetOf(restoreClosedPane(merged, closed.closed)!);
      expect(restored.panes.map(p => p.id)).toEqual(ids);
      expect(isValidDockTree(toDockTree(restored.tree), ids)).toBe(true);
    });
    it('keeps a resize made after the close out of the way: same arrangement, so the old place is restored', () => {
      const { board, ids } = withScreens(3);
      const emptied = setPane(board, sid(board), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const resized = setTree(closed.board, sid(closed.board), row([70, 30], g([ids[0]]), g([ids[2]])));
      const restored = restoreClosedPane(resized, closed.closed);
      expect(restored).not.toBeNull();
      expect(isValidDockTree(toDockTree(sheetOf(restored!).tree), ids)).toBe(true);
    });
    it('keeps the sizes the user set after the close: a resized branch stays resized, the restored pane only gets its own place back', () => {
      const { board, ids } = withScreens(3);
      const emptied = setPane(board, sid(board), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const resized = setTree(closed.board, sid(closed.board), row([70, 30], g([ids[0]!]), g([ids[2]!])));
      expect(sheetOf(restoreClosedPane(resized, closed.closed)!).tree).toEqual(row([70, 30], g([ids[0]!]), col([50, 50], g([ids[1]!]), g([ids[2]!]))));
    });
    it('keeps the sizes of every other group of a 2×2 whose pane 2 was closed and the others resized', () => {
      const { board, ids } = withScreens(4);
      const emptied = setPane(board, sid(board), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      expect(sheetOf(closed.board).tree).toEqual(row([50, 50], col([50, 50], g([ids[0]!]), g([ids[2]!])), g([ids[3]!])));
      const resized = setTree(closed.board, sid(closed.board), row([70, 30], col([80, 20], g([ids[0]!]), g([ids[2]!])), g([ids[3]!])));
      expect(sheetOf(restoreClosedPane(resized, closed.closed)!).tree)
        .toEqual(row([70, 30], col([80, 20], g([ids[0]!]), g([ids[2]!])), col([50, 50], g([ids[1]!]), g([ids[3]!]))));
    });
    it('gives a restored pane in a branch its old share and takes it from its siblings in proportion to what they have now', () => {
      const { board, ids } = withScreens(3);
      const wide = setTree(board, sid(board), row([20, 30, 50], g([ids[0]!]), g([ids[1]!]), g([ids[2]!])));
      const emptied = setPane(wide, sid(wide), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const resized = setTree(closed.board, sid(closed.board), row([40, 60], g([ids[0]!]), g([ids[2]!])));
      const tree = sheetOf(restoreClosedPane(resized, closed.closed)!).tree;
      expect(tree.type === 'branch' ? tree.sizes : []).toEqual([28, 30, 42]);
    });
    it('is null (nothing restored) once the panes changed or the sheet is full again', () => {
      const { board } = withScreens(3);
      const emptied = setPane(board, sid(board), 1, null);
      const closed = closePane(emptied, sid(emptied), 1)!;
      const grown = addPane(closed.board, sid(closed.board));
      expect(restoreClosedPane(grown, closed.closed)).toBeNull();
      const again = restoreClosedPane(closed.board, closed.closed)!;
      expect(restoreClosedPane(again, closed.closed)).toBeNull();
      expect(normalizeBoard(again)).toBe(again);
    });
  });
});

describe('undo addresses a pane by its slot, not its number (a close renumbers the panes)', () => {
  const setup = () => {
    // Panes [A, B, C]: B has a screen, A and C are empty.
    const { board, ids } = boardOf(3);
    return { board: setPane(board, sid(board), 1, screen('b')), ids };
  };
  it('a clear undone after an earlier pane closed puts the screen back in the cleared slot and leaves the one now at its old number alone', () => {
    const { board, ids } = setup();
    const cleared = setPane(board, sid(board), 1, null);
    const closedA = closePane(cleared, sid(cleared), 0)!.board;
    expect(idsOf(closedA)).toEqual([ids[1], ids[2]]);
    const restored = sheetOf(restorePane(closedA, sid(closedA), 1, screen('b'), ids[1]!)!);
    expect(restored.panes.map(p => p.screen?.menuId ?? null)).toEqual(['b', null]);
  });
  it('is null when the cleared slot itself is gone', () => {
    const { board, ids } = setup();
    const cleared = setPane(board, sid(board), 1, null);
    const closedB = closePane(cleared, sid(cleared), 1)!.board;
    expect(restorePane(closedB, sid(closedB), 1, screen('b'), ids[1]!)).toBeNull();
  });
  it('an edit with a slot id is reverted in that slot after a close, and refused once the slot is gone', () => {
    const { board, ids } = setup();
    const edit = { index: 1, paneId: ids[1]!, before: screen('b'), after: { ...screen('b'), query: '?x=2' } };
    const applied = applyPaneEdits(board, sid(board), [edit]);
    const closedA = closePane(applied, sid(applied), 0)!.board;
    expect(sheetOf(revertPaneEdits(closedA, sid(closedA), [edit])!).panes.map(p => p.screen?.query ?? null)).toEqual(['', null]);
    const withoutB = setPane(closedA, sid(closedA), 0, null);
    expect(revertPaneEdits(closePane(withoutB, sid(withoutB), 0)!.board, sid(board), [edit])).toBeNull();
  });
});
