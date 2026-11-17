import type { CSSProperties, ReactNode } from 'react';
import type { Column, Header, Table } from '@tanstack/react-table';
import { cn } from '@ap/ui';
import { columnGroupWidth, displayedUnits, displayedWidth, renderDisplayedUnits, type ColumnGroups } from './columnGroups';
import { useColumnGroupPan } from './useColumnGroupPan';

/** A pinned cell or a panned group clip fades what scrolls beneath its inner edge (a pseudo-element, no pointer events). */
export const FADE_BASE = 'before:pointer-events-none before:absolute before:inset-y-0 before:w-5 before:from-transparent before:content-[""]';
/** A column-group edge is the same line as the action pin edge: `border-strong` is too close to the row lines to separate groups. */
const GROUP_EDGE = 'border-l border-l-border-control';

/** The declared column groups as the table reads them before its engine exists: paths, declared group widths and membership. */
export function columnGroupModel(columns: readonly { id: string; columnGroup?: readonly string[] }[], groups: ColumnGroups | undefined, widthScale: number) {
  const paths = new Map(columns.map(c => [c.id, c.columnGroup]));
  const groupWidth = (id: string) => columnGroupWidth(groups, id, widthScale);
  return {
    paths,
    hasColumnGroups: columns.some(c => c.columnGroup?.length),
    groupWidth,
    /** The column belongs to a top-level group with a declared width (its cells live in a clip box and are never pinned on their own). */
    inWidthGroup: (id: string) => { const group = paths.get(id)?.[0]; return group !== undefined && groupWidth(group) !== undefined; },
  };
}
export type ColumnGroupModel = ReturnType<typeof columnGroupModel>;

type LayoutInput<T> = {
  table: Table<T>;
  model: ColumnGroupModel;
  /** Widths the user dragged; such a column never takes fill width. */
  sizing: Readonly<Record<string, number>>;
  /** Scrollport width; null before it is measured. */
  fitWidth: number | null;
  columnDividers?: boolean;
};

/**
 * Column layout of the displayed columns (#2418, #1166): fill shares, declared group widths, pin offsets, group edges and the
 * clip box that pans a width group. The table body only reads the result.
 */
export function useColumnGroupLayout<T>({ table, model, sizing, fitWidth, columnDividers }: LayoutInput<T>) {
  const { paths, hasColumnGroups, groupWidth, inWidthGroup } = model;
  // Fill (#1166): a table narrower than its scrollport hands the leftover width to the columns nobody fixed — not the checkbox/action
  // columns, not left-pinned columns (their offsets are sums of widths) and not columns the user resized. Proportional to base width;
  // once the columns outgrow the scrollport the extra is 0 and the row area scrolls horizontally as before.
  const displayedColumns = [...table.getLeftVisibleLeafColumns(), ...table.getCenterVisibleLeafColumns(), ...table.getRightVisibleLeafColumns()];
  const displayedPath = (c: Column<T>) => paths.get(c.id);
  const baseTotal = displayedWidth(displayedColumns, displayedPath, c => c.getSize(), groupWidth);
  // Column-group boundaries (#2418): where a top-level group starts or ends, a `border-control` line (the action pin edge) runs from the header to the
  // last row, so groups read apart in the body too. Only tables that declare groups; a width group carries its edge on the clip
  // box, which does not pan. The optional column divider is the quieter `border-subtle` line between all other columns.
  const groupEdgeIds = new Set(hasColumnGroups ? displayedColumns.filter((c, i) => i > 0 && paths.get(c.id)?.[0] !== paths.get(displayedColumns[i - 1].id)?.[0]).map(c => c.id) : []);
  const lineClass = (id: string, divider = true) => groupEdgeIds.has(id) ? (inWidthGroup(id) ? undefined : GROUP_EDGE)
    : divider && columnDividers && id !== displayedColumns[0]?.id ? 'border-l border-l-border-subtle' : undefined;
  const visibleLeaves = table.getVisibleLeafColumns();
  const flexIds = new Set(visibleLeaves.filter(c => c.id !== '_select' && c.id !== '_action' && !inWidthGroup(c.id) && !c.getIsPinned() && sizing[c.id] === undefined).map(c => c.id));
  const flexBase = visibleLeaves.reduce((sum, c) => flexIds.has(c.id) ? sum + c.getSize() : sum, 0);
  const extra = fitWidth !== null && flexBase > 0 ? Math.max(0, fitWidth - baseTotal) : 0;
  // Floored shares leave a remainder of at most one pixel per column; the last grown column takes it so the cells sum to the scrollport.
  const flexList = visibleLeaves.filter(c => flexIds.has(c.id));
  const shares = new Map(flexList.map(c => [c.id, extra > 0 ? Math.floor(extra * c.getSize() / flexBase) : 0]));
  if (flexList.length > 0 && extra > 0) { const last = flexList[flexList.length - 1].id; shares.set(last, (shares.get(last) ?? 0) + extra - [...shares.values()].reduce((a, b) => a + b, 0)); }
  for (const unit of displayedUnits(displayedColumns, displayedPath)) {
    const width = unit.kind === 'group' ? groupWidth(unit.id) : undefined;
    if (width === undefined) continue;
    const content = unit.leaves.reduce((sum, c) => sum + c.getSize(), 0);
    const growth = Math.max(0, width - content);
    let remaining = growth;
    unit.leaves.forEach((c, index) => {
      const share = index === unit.leaves.length - 1 ? remaining : Math.floor(growth * c.getSize() / content);
      shares.set(c.id, share); remaining -= share;
    });
  }
  const widthOf = (column: Column<T>) => column.getSize() + (shares.get(column.id) ?? 0);
  const pan = useColumnGroupPan(displayedUnits(displayedColumns, displayedPath).flatMap(unit => {
    const width = unit.kind === 'group' ? groupWidth(unit.id) : undefined;
    return unit.kind === 'group' && width !== undefined ? [{ id: unit.id, width, widths: unit.leaves.map(widthOf) }] : [];
  }));
  const displayedSize = (columns: readonly Column<T>[]) => displayedWidth(columns, displayedPath, widthOf, groupWidth);
  const leftOffset = (column: Column<T>) => {
    const group = paths.get(column.id)?.[0];
    const columns = table.getLeftVisibleLeafColumns();
    const index = columns.findIndex(c => c.id === column.id || (group !== undefined && inWidthGroup(column.id) && paths.get(c.id)?.[0] === group));
    return displayedSize(columns.slice(0, Math.max(0, index)));
  };
  const tableWidth = baseTotal + (extra > 0 ? extra : 0);
  function cellStyle(column: Column<T>): CSSProperties {
    const pinned = inWidthGroup(column.id) ? false : column.getIsPinned();
    const right = table.getRightVisibleLeafColumns();
    return { width: widthOf(column), flexShrink: 0, position: pinned ? 'sticky' : 'relative', left: pinned === 'left' ? leftOffset(column) : undefined, right: pinned === 'right' ? displayedSize(right.slice(right.findIndex(c => c.id === column.id) + 1)) : undefined, zIndex: pinned ? 2 : undefined };
  }
  function groupHeadStyle(h: Header<T, unknown>, side: 'left' | 'right' | false): CSSProperties {
    const leaves = h.getLeafHeaders().filter(leaf => leaf.subHeaders.length === 0);
    const pinned = leaves.some(leaf => inWidthGroup(leaf.column.id)) ? false : side;
    return { width: leaves.reduce((sum, leaf) => sum + widthOf(leaf.column), 0), flexShrink: 0,
      position: pinned ? 'sticky' : 'relative', left: pinned === 'left' && leaves[0] ? leftOffset(leaves[0].column) : undefined,
      right: pinned === 'right' ? leaves.at(-1)?.column.getAfter('right') : undefined, zIndex: pinned ? 2 : undefined };
  }
  /** Renders displayed cells, wrapping each width group's cells in its clip box that pans them as one. */
  const renderCells = <C,>(items: readonly C[], columnOf: (item: C) => Column<T>, render: (item: C) => ReactNode, row: { body: boolean; active?: boolean } = { body: false }) =>
    renderDisplayedUnits(items, item => {
      const column = columnOf(item);
      return paths.get(column.id) ?? paths.get(column.getLeafColumns()[0]?.id);
    }, render, (unit, cells) => {
      const width = groupWidth(unit.id);
      if (width === undefined) return undefined;
      const first = columnOf(unit.leaves[0]).getLeafColumns()[0] ?? columnOf(unit.leaves[0]);
      const group = pan.groups.get(unit.id)!;
      const edge = pan.edges[unit.id] ?? { left: false, right: group.max > 0 };
      const background = row.body ? cn('bg-surface-card group-hover:bg-surface-row-hover group-aria-selected:bg-surface-row-selected', row.active && 'bg-surface-row-selected') : 'bg-surface-sunken';
      const beforeBackground = row.body ? cn(row.active ? 'before:to-surface-row-selected' : 'before:to-surface-card', 'group-hover:before:to-surface-row-hover group-aria-selected:before:to-surface-row-selected') : 'before:to-surface-sunken';
      const afterBackground = row.body ? cn(row.active ? 'after:to-surface-row-selected' : 'after:to-surface-card', 'group-hover:after:to-surface-row-hover group-aria-selected:after:to-surface-row-selected') : 'after:to-surface-sunken';
      return <div key={unit.id} role="none" data-column-group-clip data-group-id={unit.id} data-pan-left={edge.left} data-pan-right={edge.right}
        className={cn(background, groupEdgeIds.has(first.id) && GROUP_EDGE, group.max > 0 && 'cursor-grab group-data-[column-group-panning=true]/pan-table:cursor-grabbing', edge.left && cn(FADE_BASE, 'before:left-0 before:z-[3] before:bg-linear-to-l', beforeBackground), edge.right && cn('after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-[3] after:w-5 after:from-transparent after:bg-linear-to-r after:content-[""]', afterBackground))}
        // eslint-disable-next-line shadcn/no-inline-styles -- declared group width, pin offset and clip behavior come from runtime layout
        style={{ width, overflow: 'clip', flexShrink: 0, touchAction: 'pan-y', position: first.getIsPinned() === 'left' ? 'sticky' : 'relative', left: first.getIsPinned() === 'left' ? leftOffset(first) : undefined, zIndex: first.getIsPinned() ? 2 : undefined }}>
        {/* eslint-disable-next-line shadcn/no-inline-styles -- all group cells share one visual pan offset without changing their roles or order */}
        <div role="none" className="flex" style={{ transform: `translateX(calc(-1 * var(${group.variable}, 0px)))` }}>{cells}</div>
      </div>;
    });
  return { pan, tableWidth, widthOf, displayedSize, lineClass, cellStyle, groupHeadStyle, renderCells };
}
