/**
 * Pure row model of a workspace in stack mode (#686): the top level of the layout is a column of rows, each with its own px height. Px is the
 * single source; the layout's top-level shares are only a projection of it (`withRowShares`). No React, no DOM: the caller measures and passes
 * px in.
 */
import { moveToNewRow, panelOrder } from '../dock/commands';
import { DOCK_STRIP_HEIGHT, minAlong, topLevelRows, type PanelMinimums } from '../dock/displayModel';
import { DEFAULT_MIN_PANEL_SIZE } from '../dock/dockTypes';
import type { DockNode } from '../dock/schema';

export { topLevelRows };

/** px: no row is ever lower than this, whatever its panels declare. */
export const ROW_MIN_HEIGHT = 200;
/** px height of a row the user creates (`아래 새 줄로 옮기기`, a tab dropped under the last row). */
export const NEW_ROW_HEIGHT = 360;

/** The least height a row keeps, in px. */
export type RowMinimum = (row: DockNode) => number;

/** `max(200, the row's own minimum along the column axis)`: the recursive rule of the separators (nested columns add up, a split row takes its tallest part) plus one strip per group. */
export const rowMinimumOf = (panels: PanelMinimums): RowMinimum => row => Math.max(ROW_MIN_HEIGHT, minAlong(row, 'column', DEFAULT_MIN_PANEL_SIZE, panels, DOCK_STRIP_HEIGHT));

/** Within `[minimum, maximum]`; a minimum above the maximum wins (a row never gets less than it needs, even when that is more than one screen). */
export const clampRow = (px: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(px, maximum));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Entering stack mode: each row gets `round(share × max(baseline, rows × 360))` px, within its bounds. `baseline` is the height fit mode gives
 * the layout (measured by the caller the same way in both modes).
 */
export function enterRows(layout: DockNode, baseline: number, minimum: RowMinimum, maximum: number): number[] {
  const rows = topLevelRows(layout);
  const shares = layout.type === 'branch' && layout.dir === 'column' ? layout.sizes : [100];
  const total = Math.max(baseline, rows.length * NEW_ROW_HEIGHT);
  return rows.map((row, index) => clampRow(Math.round((shares[index]! / 100) * total), minimum(row), maximum));
}

/**
 * A structural change (drop, move, hide, show, move below) from `prevLayout` to `nextLayout`: a row that keeps (some of) the panels of an earlier
 * row keeps that row's px (raised to its minimum, never lowered); a row without a predecessor is new and gets 360 within its bounds; a row that no
 * longer exists is dropped. Rows are matched by shared panels, the largest overlap first.
 */
export function reconcileRows(prevLayout: DockNode, prevRows: readonly number[], nextLayout: DockNode, minimum: RowMinimum, maximum: number): number[] {
  const before = topLevelRows(prevLayout).map(panelOrder);
  const used = new Set<number>();
  return topLevelRows(nextLayout).map(row => {
    const ids = panelOrder(row);
    let best = -1;
    let overlap = 0;
    before.forEach((old, index) => {
      if (used.has(index) || prevRows[index] === undefined) return;
      const shared = old.filter(id => ids.includes(id)).length;
      if (shared > overlap) { best = index; overlap = shared; }
    });
    if (best < 0) return clampRow(NEW_ROW_HEIGHT, minimum(row), maximum);
    used.add(best);
    return Math.max(minimum(row), prevRows[best]!);
  });
}

/** The same layout with its top-level shares set to the rows' px proportions (a layout that is not a column of `rows.length` rows is returned as it is). */
export function withRowShares(layout: DockNode, rows: readonly number[]): DockNode {
  if (layout.type !== 'branch' || layout.dir !== 'column' || rows.length !== layout.children.length) return layout;
  const total = sum(rows);
  const sizes = rows.map(px => Math.round((px / total) * 1e6) / 1e4);
  sizes[sizes.length - 1] = Math.round((100 - sum(sizes.slice(0, -1))) * 1e4) / 1e4;
  return { ...layout, sizes };
}

/** Whether `아래 새 줄로 옮기기` would change anything: false for a panel that already is alone in the last row. */
export function canMoveBelow(layout: DockNode, panelId: string): boolean {
  try { return JSON.stringify(moveToNewRow(layout, panelId)) !== JSON.stringify(layout); } catch { return false; }
}

export { moveToNewRow };
