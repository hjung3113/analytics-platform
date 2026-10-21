import {
  BOARD_LAYOUTS, columnPanes, defaultArrangement, isDefaultArrangement, layoutShape, paneCount, parseArrangementEntry,
  type Arrangement, type BoardLayout, type GridMemory, type LayoutNode, type Sheet,
} from './boardTypes';

/**
 * The grid renderer's view of a sheet: a pure projection of the layout tree onto `{ layout, arrangement }` (docs/16 §7). The tree is the
 * source of pane grouping, order and column sizes; only a collapsed column's row ratios live in `gridMemory` alone.
 */
export type GridView = { layout: BoardLayout; arrangement: Arrangement; order: number[] };

/** The grid a pane count gets when the tree is not grid-shaped. Three panes are not a V1 shape and display as 2×2 with the fourth cell empty. */
export const defaultLayoutFor = (count: number): BoardLayout => (count <= 1 ? '1x1' : count === 2 ? '1x2' : '2x2');

const group = (panes: string[], active: string): LayoutNode => ({ type: 'group', panes, active });

/** `gridMemory` with `layout`'s entry set (or removed when it is the default); the field itself goes when nothing is left. */
export function withGridMemory(sheet: Sheet, layout: BoardLayout, arrangement: Arrangement): Sheet {
  const { gridMemory, ...rest } = sheet;
  const entries: GridMemory = { ...gridMemory };
  if (isDefaultArrangement(arrangement, layout)) delete entries[layout]; else entries[layout] = { columns: [...arrangement.columns], rows: arrangement.rows.map(r => [...r]), collapsed: [...arrangement.collapsed].sort((a, b) => a - b) };
  // Canonical key order, so two sheets with the same memory serialize the same.
  const memory: GridMemory = {};
  for (const l of BOARD_LAYOUTS) if (entries[l]) memory[l] = entries[l];
  return Object.keys(memory).length ? { ...rest, gridMemory: memory } : rest;
}

/** The saved arrangement of `layout`, or the default. Invalid stored entries read as the default. */
export const memoryOf = (sheet: Sheet, layout: BoardLayout): Arrangement => parseArrangementEntry(sheet.gridMemory?.[layout], layout) ?? defaultArrangement(layout);

/** The tree of `layout` over the sheet's panes in pane-number order. A column with a collapsed pane is one group whose active tab is the expanded pane. */
function treeOf(ids: readonly string[], layout: BoardLayout, arrangement: Arrangement): LayoutNode {
  const { rows, columns } = layoutShape(layout);
  const column = (c: number): LayoutNode => {
    const indices = columnPanes(layout, c);
    if (rows === 1) return group([ids[indices[0]]], ids[indices[0]]);
    const open = indices.find(i => !arrangement.collapsed.includes(i));
    if (indices.some(i => arrangement.collapsed.includes(i)) && open !== undefined) return group(indices.map(i => ids[i]), ids[open]);
    return { type: 'branch', dir: 'column', sizes: [...arrangement.rows[c]], children: indices.map(i => group([ids[i]], ids[i])) };
  };
  const columnNodes = Array.from({ length: columns }, (_, c) => column(c));
  return columns === 1 ? columnNodes[0] : { type: 'branch', dir: 'row', sizes: [...arrangement.columns], children: columnNodes };
}

/** Sets the sheet's grid: the tree for `layout` and the arrangement in `gridMemory`. Unchanged when the pane count does not fit the layout. */
export function withGrid(sheet: Sheet, layout: BoardLayout, arrangement: Arrangement): Sheet {
  if (sheet.panes.length !== paneCount(layout)) return sheet;
  return withGridMemory({ ...sheet, tree: treeOf(sheet.panes.map(p => p.id), layout, arrangement) }, layout, arrangement);
}

const singlePane = (node: LayoutNode, id: string) => node.type === 'group' && node.panes.length === 1 && node.panes[0] === id;

/** One column of the tree: its panes top to bottom are `top` and `bottom`; null when the subtree is not that column. */
function columnOf(node: LayoutNode, top: string, bottom: string | null, rowsFallback: number[]): { rows: number[]; collapsed: 'top' | 'bottom' | null } | null {
  if (bottom === null) return singlePane(node, top) ? { rows: [100], collapsed: null } : null;
  if (node.type === 'group') {
    if (node.panes.length !== 2 || node.panes[0] !== top || node.panes[1] !== bottom) return null;
    if (node.active === top) return { rows: rowsFallback, collapsed: 'bottom' };
    return node.active === bottom ? { rows: rowsFallback, collapsed: 'top' } : null;
  }
  if (node.dir !== 'column' || node.children.length !== 2 || !singlePane(node.children[0], top) || !singlePane(node.children[1], bottom)) return null;
  return { rows: [...node.sizes], collapsed: null };
}

function project(sheet: Sheet): { layout: BoardLayout; arrangement: Arrangement } | null {
  const ids = sheet.panes.map(p => p.id);
  const tree = sheet.tree;
  const memoryRows = (layout: BoardLayout, c: number) => memoryOf(sheet, layout).rows[c];
  if (ids.length === 1) return singlePane(tree, ids[0]) ? { layout: '1x1', arrangement: defaultArrangement('1x1') } : null;
  if (ids.length === 2) {
    if (tree.type === 'branch' && tree.dir === 'row') {
      if (tree.children.length !== 2 || !singlePane(tree.children[0], ids[0]) || !singlePane(tree.children[1], ids[1])) return null;
      return { layout: '1x2', arrangement: { columns: [...tree.sizes], rows: [[100], [100]], collapsed: [] } };
    }
    const column = columnOf(tree, ids[0], ids[1], memoryRows('2x1', 0));
    return column && { layout: '2x1', arrangement: { columns: [100], rows: [column.rows], collapsed: column.collapsed === 'bottom' ? [1] : column.collapsed === 'top' ? [0] : [] } };
  }
  if (ids.length === 4) {
    if (tree.type !== 'branch' || tree.dir !== 'row' || tree.children.length !== 2) return null;
    const left = columnOf(tree.children[0], ids[0], ids[2], memoryRows('2x2', 0));
    const right = columnOf(tree.children[1], ids[1], ids[3], memoryRows('2x2', 1));
    if (!left || !right) return null;
    const collapsed = [left.collapsed === 'top' ? 0 : left.collapsed === 'bottom' ? 2 : -1, right.collapsed === 'top' ? 1 : right.collapsed === 'bottom' ? 3 : -1].filter(i => i >= 0);
    return { layout: '2x2', arrangement: { columns: [...tree.sizes], rows: [left.rows, right.rows], collapsed } };
  }
  return null;
}

/** The grid a sheet projects to. `order[cell]` is the pane index shown in that row-major cell; any tree that is not a grid shape gets the default grid. */
export function gridOf(sheet: Sheet): GridView {
  const projected = project(sheet);
  const layout = projected?.layout ?? defaultLayoutFor(sheet.panes.length);
  return { layout, arrangement: projected?.arrangement ?? defaultArrangement(layout), order: sheet.panes.map((_, i) => i) };
}
