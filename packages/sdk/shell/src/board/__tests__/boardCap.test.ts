import { describe, expect, it } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { movePanel } from '@ap/components/dock';
import { fromDockTree, groupsOf, splitExceedsCap, toDockTree } from '../boardDockTree';
import {
  MAX_GROUPS, MAX_TABS, addPane, addPaneInGroup, closePane, droppedPaneCount, freshBoard, normalizeBoard, parseBoard, resetTree, restoreClosedPane, setLayout, setPane, setTree,
  type Board, type LayoutNode, type Sheet,
} from '../boardModel';
import { loadBoard, saveBoard } from '../boardStore';

const KEY = 'platform:board:v2:u1';
const screen = (menuId: string) => ({ menuId, params: {}, query: '' });
const sheetOf = (board: Board): Sheet => board.sheets[0];
const sid = (board: Board) => sheetOf(board).id;

/** One sheet grown with `칸 추가` to `count` panes, each holding a screen. */
function grown(count: number): Board {
  let board = freshBoard('시트');
  for (let n = 1; n < count; n++) board = addPane(board, sid(board));
  sheetOf(board).panes.forEach((_, i) => { board = setPane(board, sid(board), i, screen(`m${i}`)); });
  return board;
}
const json = (board: Board, v: number) => JSON.parse(JSON.stringify({ ...board, v })) as Record<string, unknown>;
const ids = (board: Board) => sheetOf(board).panes.map(p => p.id);

describe('tab total and display groups are separate caps (893e)', () => {
  it('E1: a fifth tab joins an existing group while the four groups stay, up to eight in all', () => {
    let board = grown(4);
    const before = ids(board);
    const anchor = before[0]!;
    board = addPaneInGroup(board, sid(board), anchor, screen('new'));
    expect(sheetOf(board).panes).toHaveLength(5);
    expect(groupsOf(sheetOf(board).tree)).toHaveLength(MAX_GROUPS);
    expect(ids(board).slice(0, 4)).toEqual(before);
    for (let n = 6; n <= MAX_TABS; n++) board = addPaneInGroup(board, sid(board), anchor, null);
    expect(sheetOf(board).panes).toHaveLength(MAX_TABS);
    expect(addPaneInGroup(board, sid(board), anchor, null)).toBe(board);
    expect(addPane(board, sid(board))).toBe(board);
  });

  it('E1: the five-pane board survives store round trips as v:3 and nothing is lost', () => {
    const base = grown(4);
    const bigger = addPaneInGroup(base, sid(base), ids(base)[3]!, screen('z'));
    const storage = memoryStorage();
    expect(saveBoard(storage, 'u1', bigger)).toBe(true);
    expect(JSON.parse(storage.getItem(KEY)!).v).toBe(3);
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded).toMatchObject({ notice: null, readOnly: false });
    expect(sheetOf(loaded.board).panes.map(p => p.id)).toEqual(ids(bigger));
    expect(sheetOf(loaded.board).panes.map(p => p.screen)).toEqual(sheetOf(bigger).panes.map(p => p.screen));
    expect(groupsOf(sheetOf(loaded.board).tree)).toHaveLength(4);
  });

  it('E4: with four groups 칸 추가 makes a tab of the selected pane\'s group, never a fifth group', () => {
    const board = grown(4);
    const selected = sheetOf(board).selectedPaneId;
    const next = addPane(board, sid(board));
    const group = groupsOf(sheetOf(next).tree).find(g => g.panes.includes(selected))!;
    expect(group.panes).toHaveLength(2);
    expect(groupsOf(sheetOf(next).tree)).toHaveLength(4);
    expect(sheetOf(next).selectedPaneId).toBe(sheetOf(next).panes[4]!.id);
  });

  it('E4: a layout that would make a fifth display group is refused, one with four is kept', () => {
    const base = grown(4);
    const five = addPaneInGroup(base, sid(base), ids(base)[0]!, null);
    const [a, b, c, d, e] = ids(five) as [string, string, string, string, string];
    const g = (panes: string[]): LayoutNode => ({ type: 'group', panes, active: panes[0]! });
    const fiveGroups: LayoutNode = { type: 'branch', dir: 'row', sizes: [20, 20, 20, 20, 20], children: [a, b, c, d, e].map(id => g([id])) };
    expect(setTree(five, sid(five), fiveGroups)).toBe(five);
    const fourGroups: LayoutNode = { type: 'branch', dir: 'row', sizes: [25, 25, 25, 25], children: [g([a, e]), g([b]), g([c]), g([d])] };
    expect(sheetOf(setTree(five, sid(five), fourGroups)).tree).toEqual(fourGroups);
  });

  it('E2: v:2 holds at most four panes, v:3 at most eight, both at most four groups', () => {
    const base = grown(4);
    const five = addPaneInGroup(base, sid(base), ids(base)[0]!, null);
    expect(parseBoard(json(five, 2))).toBeNull();
    expect(parseBoard(json(five, 3))).toEqual({ ...five, v: 3 });
    expect(parseBoard(json(base, 2))).toEqual(base);
    expect(parseBoard(json(base, 3))).toEqual({ ...base, v: 3 });
    const nine = json(grown(8), 3) as { sheets: { panes: unknown[]; tree: LayoutNode }[] };
    nine.sheets[0]!.panes.push({ id: 'p9', screen: null, previous: null });
    const first = groupsOf(nine.sheets[0]!.tree)[0]!;
    first.panes.push('p9');
    expect(parseBoard(nine)).toBeNull();
    const tooManyGroups = json(base, 2) as { sheets: Record<string, unknown>[] };
    const sheet = tooManyGroups.sheets[0]!;
    const panes = (sheet.panes as { id: string }[]).map(p => p.id);
    panes.push('extra');
    (sheet.panes as unknown[]).push({ id: 'extra', screen: null, previous: null });
    sheet.tree = { type: 'branch', dir: 'row', sizes: [20, 20, 20, 20, 20], children: panes.map(id => ({ type: 'group', panes: [id], active: id })) };
    expect(parseBoard(tooManyGroups)).toBeNull();
    // v:3 with six panes (under the tab cap): five display groups are the only reason to refuse.
    const fiveGroups = json(base, 3) as { sheets: Record<string, unknown>[] };
    const wide = fiveGroups.sheets[0]!;
    const ownIds = (wide.panes as { id: string }[]).map(p => p.id);
    (wide.panes as unknown[]).push({ id: 'x1', screen: null, previous: null }, { id: 'x2', screen: null, previous: null });
    const members = [...ownIds.map(id => [id]), ['x1', 'x2']];
    wide.tree = { type: 'branch', dir: 'row', sizes: [20, 20, 20, 20, 20], children: members.map(m => ({ type: 'group', panes: m, active: m[0] })) };
    expect(parseBoard(fiveGroups)).toBeNull();
    members.splice(3, 2, [ownIds[3]!, 'x1', 'x2']);
    wide.tree = { type: 'branch', dir: 'row', sizes: [25, 25, 25, 25], children: members.map(m => ({ type: 'group', panes: m, active: m[0] })) };
    expect(parseBoard(fiveGroups)).not.toBeNull();
  });

  it('E3: normalize, 기본 배치, restoreClosedPane and layout change keep every pane of a sheet over four', () => {
    const board = grown(7);
    const all = ids(board);
    expect(all).toHaveLength(7);
    expect(normalizeBoard(board)).toBe(board);
    // A broken tree is repaired to the default arrangement without dropping a pane.
    const broken: Board = { ...board, sheets: [{ ...sheetOf(board), tree: { type: 'group', panes: all.slice(0, 2), active: all[0]! } }] };
    const repaired = normalizeBoard(broken)!;
    expect(sheetOf(repaired).panes.map(p => p.id)).toEqual(all);
    expect(groupsOf(sheetOf(repaired).tree).flatMap(g => g.panes).sort()).toEqual([...all].sort());
    expect(groupsOf(sheetOf(repaired).tree)).toHaveLength(4);
    const reset = resetTree(broken, sid(broken));
    expect(groupsOf(sheetOf(reset).tree).flatMap(g => g.panes).sort()).toEqual([...all].sort());
    expect(groupsOf(sheetOf(reset).tree)).toHaveLength(4);
    // A grid layout holds four: the model leaves a bigger sheet alone.
    expect(setLayout(board, sid(board), '2x2')).toBe(board);
    expect(setLayout(board, sid(board), '1x2')).toBe(board);
    expect(droppedPaneCount(sheetOf(board), '2x2')).toBe(3);
  });

  it('E3: closing an empty pane and restoring it keeps the ids, the order and four groups', () => {
    const base = grown(4);
    let five = addPane(base, sid(base));
    const before = ids(five);
    const closed = closePane(five, sid(five), 4)!;
    expect(closed).not.toBeNull();
    five = closed.board;
    const restored = restoreClosedPane(five, closed.closed)!;
    expect(ids(restored)).toEqual(before);
    expect(groupsOf(sheetOf(restored).tree)).toHaveLength(4);
  });

  it('E3: a restore after the arrangement changed joins the selected pane\'s group at four groups', () => {
    const base = grown(4);
    const five = addPane(base, sid(base));
    const closed = closePane(five, sid(five), 4)!;
    // Another pane gets an extra tab meanwhile, so the arrangement is no longer the one the close left.
    const moved = addPaneInGroup(closed.board, sid(five), ids(base)[0]!, null);
    const restored = restoreClosedPane(moved, { ...closed.closed, after: sheetOf(moved) });
    expect(restored).not.toBeNull();
    expect(groupsOf(sheetOf(restored!).tree)).toHaveLength(4);
  });

  it('E2: coming back to four panes stores v:2 again, the rollback path', () => {
    const base = grown(4);
    const five = addPane(base, sid(base));
    const storage = memoryStorage();
    saveBoard(storage, 'u1', five);
    expect(JSON.parse(storage.getItem(KEY)!).v).toBe(3);
    const closed = closePane(five, sid(five), 4)!;
    saveBoard(storage, 'u1', closed.board);
    expect(JSON.parse(storage.getItem(KEY)!).v).toBe(2);
    expect(loadBoard(storage, 'u1', '시트').board.sheets[0]!.panes).toHaveLength(4);
  });

  it('E2: a board of four panes or fewer is stored as v:2, a value from v:4 on is read-only and never written, v:3 is read', () => {
    const storage = memoryStorage();
    saveBoard(storage, 'u1', grown(4));
    expect(JSON.parse(storage.getItem(KEY)!).v).toBe(2);
    const raw = JSON.stringify({ v: 4, anything: true });
    storage.setItem(KEY, raw);
    expect(loadBoard(storage, 'u1', '시트')).toMatchObject({ notice: 'newer', readOnly: true });
    expect(saveBoard(storage, 'u1', grown(4))).toBe(false);
    expect(storage.getItem(KEY)).toBe(raw);
    storage.setItem(KEY, JSON.stringify({ v: 3, anything: true }));
    expect(loadBoard(storage, 'u1', '시트')).toMatchObject({ notice: 'corrupt', readOnly: false });
  });

  it('E2: a v:2 value holding five panes is quarantined as corrupt and kept aside', () => {
    const base = grown(4);
    const five = addPane(base, sid(base));
    const storage = memoryStorage();
    const raw = JSON.stringify({ ...five, v: 2 });
    storage.setItem(KEY, raw);
    const loaded = loadBoard(storage, 'u1', '시트');
    expect(loaded.notice).toBe('corrupt');
    expect(storage.getItem('platform:board:corrupt-backup:v2:u1')).toBe(raw);
  });
});

describe('the drop preview rule and setTree agree (978b)', () => {
  const positions = ['left', 'right', 'top', 'bottom', 'center'] as const;
  const shapes: Array<[string, () => Board]> = [
    ['three groups', () => grown(3)],
    ['four groups', () => grown(4)],
    ['four groups with a two-tab group', () => { const base = grown(4); return addPaneInGroup(base, sid(base), ids(base)[0]!, null); }],
  ];
  it.each(shapes)('%s: every drop splitExceedsCap allows is accepted by setTree, every one it refuses is ignored', (_name, build) => {
    const board = build();
    const tree = sheetOf(board).tree;
    for (const source of ids(board)) {
      for (const target of ids(board).filter(id => id !== source)) {
        for (const position of positions) {
          const result = fromDockTree(movePanel(toDockTree(tree), source, { panelId: target, position }));
          const accepted = groupsOf(result).length <= MAX_GROUPS;
          expect(!splitExceedsCap(tree, source, position) || !accepted).toBe(true);
          if (splitExceedsCap(tree, source, position)) expect(setTree(board, sid(board), result)).toBe(board);
          else if (JSON.stringify(result) !== JSON.stringify(tree)) expect(sheetOf(setTree(board, sid(board), result)).tree).toEqual(result);
        }
      }
    }
  });
});
