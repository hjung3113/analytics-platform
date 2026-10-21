import { describe, expect, it } from 'vitest';
import { BOARD_LAYOUTS, defaultArrangement, layoutShape, paneCount, parseBoardV2, type Arrangement, type BoardLayout, type LayoutNode, type Sheet } from './boardModel';
import { defaultLayoutFor } from './boardGrid';
import { gridOf, withGrid } from './boardModel';
import { v2Sheet } from './__fixtures__/legacyBoard';

const blank = (layout: BoardLayout): Sheet => v2Sheet('a', { layout, panes: Array(paneCount(layout)).fill(null) });

function collapseSets(layout: BoardLayout): number[][] {
  const { rows, columns } = layoutShape(layout);
  if (rows === 1) return [[]];
  const perColumn = Array.from({ length: columns }, (_, c) => [null, c, c + columns]);
  return perColumn.reduce<number[][]>((sets, options) => sets.flatMap(set => options.map(o => (o === null ? set : [...set, o]))), [[]]);
}
const arrangements = (layout: BoardLayout, collapsed: number[]): Arrangement[] => {
  const { rows, columns } = layoutShape(layout);
  return [
    { ...defaultArrangement(layout), collapsed },
    { columns: columns === 2 ? [30, 70] : [100], rows: Array.from({ length: columns }, (_, c) => (rows === 2 ? (c === 0 ? [25, 75] : [60, 40]) : [100])), collapsed },
  ];
};
const cases = BOARD_LAYOUTS.flatMap(layout => collapseSets(layout).flatMap(collapsed => arrangements(layout, collapsed).map(arrangement => ({ layout, collapsed, arrangement }))));

describe('gridOf / withGrid', () => {
  it.each(cases)('round-trips a $layout grid with collapsed $collapsed', ({ layout, arrangement }) => {
    const sheet = withGrid(blank(layout), layout, arrangement);
    const grid = gridOf(sheet);
    expect(grid.layout).toBe(layout);
    expect(grid.arrangement).toEqual(arrangement);
    expect(grid.order).toEqual(sheet.panes.map((_, i) => i));
    // Identity: writing back what was read changes nothing, and the sheet survives storage.
    expect(withGrid(sheet, grid.layout, grid.arrangement)).toEqual(sheet);
    expect(parseBoardV2({ v: 2, activeSheetId: 'a', sheets: [JSON.parse(JSON.stringify(sheet))] })?.sheets[0]).toEqual(sheet);
  });

  it('writes the arrangement to gridMemory, but not a default one', () => {
    const custom = arrangements('2x2', [0])[1];
    expect(withGrid(blank('2x2'), '2x2', custom).gridMemory).toEqual({ '2x2': custom });
    expect(withGrid(withGrid(blank('2x2'), '2x2', custom), '2x2', defaultArrangement('2x2')).gridMemory).toBeUndefined();
  });

  it('shapes 1×2 as a row of two groups, 2×1 as a column or one tab group, and 2×2 as a row of two columns', () => {
    const group = (...ids: string[]): LayoutNode => ({ type: 'group', panes: ids, active: ids[0] });
    const ids = (sheet: Sheet) => sheet.panes.map(p => p.id);
    const wide = blank('1x2');
    expect(withGrid(wide, '1x2', defaultArrangement('1x2')).tree).toEqual({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group(ids(wide)[0]), group(ids(wide)[1])] });
    const tall = blank('2x1');
    expect(withGrid(tall, '2x1', defaultArrangement('2x1')).tree).toEqual({ type: 'branch', dir: 'column', sizes: [50, 50], children: [group(ids(tall)[0]), group(ids(tall)[1])] });
    expect(withGrid(tall, '2x1', { ...defaultArrangement('2x1'), collapsed: [1] }).tree).toEqual({ type: 'group', panes: ids(tall), active: ids(tall)[0] });
    expect(withGrid(tall, '2x1', { ...defaultArrangement('2x1'), collapsed: [0] }).tree).toEqual({ type: 'group', panes: ids(tall), active: ids(tall)[1] });
    const grid = blank('2x2');
    const [p0, p1, p2, p3] = ids(grid);
    expect(withGrid(grid, '2x2', { ...defaultArrangement('2x2'), collapsed: [2] }).tree).toEqual({
      type: 'branch', dir: 'row', sizes: [50, 50],
      children: [{ type: 'group', panes: [p0, p2], active: p0 }, { type: 'branch', dir: 'column', sizes: [50, 50], children: [group(p1), group(p3)] }],
    });
  });

  it('leaves the sheet alone when the pane count does not fit the layout', () => {
    const sheet = blank('1x2');
    expect(withGrid(sheet, '2x2', defaultArrangement('2x2'))).toBe(sheet);
  });

  it('restores a collapsed column\'s saved row ratios on expand', () => {
    const rows = [[20, 80], [50, 50]];
    const collapsed = withGrid(blank('2x2'), '2x2', { columns: [50, 50], rows, collapsed: [0] });
    expect(gridOf(collapsed).arrangement.rows).toEqual(rows);
    const expanded = withGrid(collapsed, '2x2', { ...gridOf(collapsed).arrangement, collapsed: [] });
    expect(expanded.tree).toMatchObject({ children: [{ type: 'branch', dir: 'column', sizes: [20, 80] }, { sizes: [50, 50] }] });
    expect(gridOf(expanded).arrangement.rows).toEqual(rows);
  });

  it('reads an open column\'s rows from the tree, not from a stale memory', () => {
    const sheet = withGrid(blank('2x2'), '2x2', { columns: [50, 50], rows: [[20, 80], [50, 50]], collapsed: [] });
    const edited: Sheet = { ...sheet, tree: { ...sheet.tree, children: [{ ...(sheet.tree as { children: LayoutNode[] }).children[0], sizes: [70, 30] }, (sheet.tree as { children: LayoutNode[] }).children[1]] } as LayoutNode };
    expect(gridOf(edited).arrangement.rows[0]).toEqual([70, 30]);
  });

  describe('trees that are not grid-shaped project to the default grid', () => {
    const ids = (sheet: Sheet) => sheet.panes.map(p => p.id);
    const group = (panes: string[], active = panes[0]): LayoutNode => ({ type: 'group', panes, active });
    it.each([
      ['two panes in a row, swapped', '1x2', (s: Sheet): LayoutNode => ({ type: 'branch', dir: 'row', sizes: [30, 70], children: [group([ids(s)[1]]), group([ids(s)[0]])] })],
      ['two panes in a tab group in reverse order', '1x2', (s: Sheet): LayoutNode => group([ids(s)[1], ids(s)[0]])],
      ['four panes in one tab group', '2x2', (s: Sheet): LayoutNode => group(ids(s))],
      ['four panes in a column of four groups', '2x2', (s: Sheet): LayoutNode => ({ type: 'branch', dir: 'column', sizes: [25, 25, 25, 25], children: ids(s).map(id => group([id])) })],
      ['four panes whose row holds a lone group', '2x2', (s: Sheet): LayoutNode => ({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group(ids(s).slice(0, 3)), group([ids(s)[3]])] })],
    ] as const)('%s', (_name, layout, tree) => {
      const base = blank(layout);
      const sheet: Sheet = { ...base, tree: tree(base) };
      expect(parseBoardV2({ v: 2, activeSheetId: 'a', sheets: [sheet] })).not.toBeNull();
      const grid = gridOf(sheet);
      expect(grid).toEqual({ layout, arrangement: defaultArrangement(layout), order: base.panes.map((_, i) => i) });
      expect(sheet.tree).toBe(sheet.tree);
    });
  });

  it('displays three panes as 2×2 with a default arrangement, and never writes that back', () => {
    const four = blank('2x2');
    const three: Sheet = { ...four, panes: four.panes.slice(0, 3), tree: { type: 'group', panes: four.panes.slice(0, 3).map(p => p.id), active: four.panes[0].id } };
    expect(defaultLayoutFor(3)).toBe('2x2');
    expect(gridOf(three)).toEqual({ layout: '2x2', arrangement: defaultArrangement('2x2'), order: [0, 1, 2] });
    expect(withGrid(three, '2x2', defaultArrangement('2x2'))).toBe(three);
    expect(three.panes).toHaveLength(3);
  });
});
