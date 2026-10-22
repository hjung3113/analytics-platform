import { isRecord } from '@ap/contracts';
import type { PaneScreen } from '@ap/kernel';

/** `rows x columns`; panes are numbered row by row, so `1x2` is two side by side and `2x1` two stacked. */
export type BoardLayout = '1x1' | '1x2' | '2x1' | '2x2';
export const BOARD_LAYOUTS: readonly BoardLayout[] = ['1x1', '1x2', '2x1', '2x2'];
export const MAX_SHEETS = 20;
export const MAX_PANES = 4;

/** The grid renderer's per-layout sizes: column ratios, per-column row ratios and the collapsed panes (row-major pane indices). */
export type Arrangement = { columns: number[]; rows: number[][]; collapsed: number[] };

/**
 * One pane of a sheet. Array order in `Sheet.panes` is the pane number users see (`칸 n` = index + 1); `id` is opaque and unique per
 * sheet. `previous` is the one step `이전 화면` goes back (docs/16 §4).
 */
export type PaneSlot = { id: string; screen: PaneScreen | null; previous: PaneScreen | null };

/** How a sheet's panes are grouped and sized: a group is the tabs of one dock cell, a branch splits its children by `sizes` (percent). */
export type LayoutNode =
  | { type: 'group'; panes: string[]; active: string }
  | { type: 'branch'; dir: 'row' | 'column'; sizes: number[]; children: LayoutNode[] };

/** `gridMemory` keeps the grid renderer's `Arrangement` of every layout (non-default entries only), including the current one. */
export type GridMemory = Partial<Record<BoardLayout, Arrangement>>;
export type Sheet = { id: string; name: string; panes: PaneSlot[]; selectedPaneId: string; tree: LayoutNode; gridMemory?: GridMemory };
export type Board = { v: 2; activeSheetId: string; sheets: Sheet[] };

export const paneCount = (layout: BoardLayout) => ({ '1x1': 1, '1x2': 2, '2x1': 2, '2x2': 4 })[layout];
export const layoutShape = (layout: BoardLayout) => ({ rows: Number(layout[0]), columns: Number(layout[2]) });

export function makeId(prefix: string, taken: ReadonlySet<string>): string {
  for (;;) {
    let id: string;
    try { id = `${prefix}${crypto.randomUUID().slice(0, 8)}`; } catch { id = `${prefix}${Math.random().toString(36).slice(2, 10)}`; }
    if (!taken.has(id)) return id;
  }
}

/** Row-major indices belonging to a logical column, independent of responsive stacking. */
export function columnPanes(layout: BoardLayout, column: number): number[] {
  const { rows, columns } = layoutShape(layout);
  return Array.from({ length: rows }, (_, row) => row * columns + column);
}

export function defaultArrangement(layout: BoardLayout): Arrangement {
  const { rows, columns } = layoutShape(layout);
  return { columns: Array(columns).fill(100 / columns), rows: Array.from({ length: columns }, () => Array(rows).fill(100 / rows)), collapsed: [] };
}

/** A vector of `count` finite positives summing to 100 (±0.01); a single track is exactly 100. */
export const isRatioVector = (v: unknown, count: number): v is number[] => Array.isArray(v) && v.length === count
  && v.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
  && Math.abs(v.reduce((a: number, b: number) => a + b, 0) - 100) <= 0.01
  && (count !== 1 || v[0] === 100);

export function parseArrangementEntry(value: unknown, layout: BoardLayout): Arrangement | null {
  if (!isRecord(value)) return null;
  const { rows, columns } = layoutShape(layout);
  if (!isRatioVector(value.columns, columns) || !Array.isArray(value.rows) || value.rows.length !== columns
    || !value.rows.every(v => isRatioVector(v, rows)) || !Array.isArray(value.collapsed)) return null;
  const collapsed: number[] = value.collapsed;
  if (collapsed.some(i => !Number.isInteger(i) || i < 0 || i >= paneCount(layout)) || new Set(collapsed).size !== collapsed.length
    || Array.from({ length: columns }, (_, c) => columnPanes(layout, c)).some(indices => indices.every(i => collapsed.includes(i)))) return null;
  return { columns: [...value.columns], rows: value.rows.map(v => [...v]), collapsed: [...collapsed].sort((a, b) => a - b) };
}

export const isDefaultArrangement = (entry: Arrangement, layout: BoardLayout) => JSON.stringify(entry) === JSON.stringify(defaultArrangement(layout));

/** Valid, non-default entries only; an object that is not a record, a bad entry or an unknown key is dropped. */
export function parseGridMemory(value: unknown): GridMemory | undefined {
  if (!isRecord(value)) return undefined;
  const entries: GridMemory = {};
  for (const layout of BOARD_LAYOUTS) {
    const entry = parseArrangementEntry(value[layout], layout);
    if (entry && !isDefaultArrangement(entry, layout)) entries[layout] = entry;
  }
  return Object.keys(entries).length ? entries : undefined;
}

export function parsePane(value: unknown): PaneScreen | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.menuId !== 'string' || typeof value.query !== 'string' || !isRecord(value.params)) return undefined;
  if (value.query !== '' && !value.query.startsWith('?')) return undefined;
  const params: Record<string, string> = {};
  for (const [key, v] of Object.entries(value.params)) {
    if (typeof v !== 'string') return undefined;
    params[key] = v;
  }
  return { menuId: value.menuId, params, query: value.query };
}
