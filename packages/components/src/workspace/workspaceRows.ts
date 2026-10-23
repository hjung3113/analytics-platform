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
 * A structural change (drop, move, hide, show, move below) from `prevLayout` to `nextLayout`. Rows are matched by provenance, not by position:
 * the rows that survive (same panels first, then the largest overlap, the earlier row on a tie) keep their px (raised to their minimum, never
 * lowered) before anything is allocated; a row without a predecessor is new and gets 360 within its bounds; a row that no longer exists is
 * dropped. `created` is the panel an edit moved into a row of its own (`아래 새 줄로 옮기기`, a drop on the strip, a split above or below): that row
 * is always new, even when its panels equal an old row's, so the net change is the new row less the row the panel left. A drag the layout alone
 * cannot explain (rows swapped by a drop at the top or bottom) has no `created`: a row that keeps its panels keeps its px wherever it went.
 */
export function reconcileRows(prevLayout: DockNode, prevRows: readonly number[], nextLayout: DockNode, minimum: RowMinimum, maximum: number, created?: string): number[] {
  const before = topLevelRows(prevLayout).map(panelOrder);
  const next = topLevelRows(nextLayout);
  const after = next.map(panelOrder);
  const heights: (number | undefined)[] = next.map(() => undefined);
  const taken = new Set<number>();
  const isCreated = (ids: readonly string[]) => created !== undefined && ids.length === 1 && ids[0] === created;
  const give = (at: number, index: number) => { heights[at] = Math.max(minimum(next[at]!), prevRows[index]!); taken.add(index); };
  const shared = (old: readonly string[], ids: readonly string[]) => old.filter(id => ids.includes(id)).length;
  // Same panels first: an unchanged row never loses its px to a row that only overlaps it.
  after.forEach((ids, at) => {
    if (isCreated(ids)) return;
    const index = before.findIndex((old, candidate) => !taken.has(candidate) && prevRows[candidate] !== undefined && old.length === ids.length && shared(old, ids) === ids.length);
    if (index >= 0) give(at, index);
  });
  // Then the remaining survivors, the largest overlap first.
  const candidates = after.flatMap((ids, at) => (heights[at] !== undefined || isCreated(ids) ? [] : before.map((old, index) => ({ at, index, overlap: shared(old, ids) }))))
    .filter(candidate => candidate.overlap > 0 && !taken.has(candidate.index) && prevRows[candidate.index] !== undefined)
    .sort((x, y) => y.overlap - x.overlap || x.at - y.at || x.index - y.index);
  for (const { at, index } of candidates) if (heights[at] === undefined && !taken.has(index)) give(at, index);
  return heights.map((height, at) => height ?? clampRow(NEW_ROW_HEIGHT, minimum(next[at]!), maximum));
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
