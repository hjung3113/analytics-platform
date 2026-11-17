import type { ColumnDef } from '@tanstack/react-table';
import type { PlatformColumn } from './PlatformDataTable';
import { columnGroupErrors, columnGroupLabel, columnGroupWidth, type ColumnGroups } from './columnGroups';

/** PlatformColumn → TanStack ColumnDef (#160). Internal module: index.ts does not export it, so the engine type never reaches menus. */
export function toColumnDef<T>(c: PlatformColumn<T>): ColumnDef<T> {
  return {
    id: c.id,
    header: c.header,
    ...(c.size !== undefined && { size: c.size }),
    enableSorting: c.sortable !== false,
    enableHiding: c.hideable !== false,
    meta: { align: c.align },
    accessorFn: c.value ?? ((row: T) => (row as Record<string, unknown>)[c.id]),
    cell: c.cell
      ? ({ row }) => c.cell!(row.original)
      : ({ getValue }) => { const v = getValue(); return v == null ? '' : String(v); },
  };
}

/** Build private engine nesting from the normalized leaf order, preserving default leaf definitions. */
/** `leafDef` hands back the same converted leaf for a column every time, so a new order rebuilds only the group nodes: a leaf's `cell`
 *  renderer keeps its identity and the cell subtree is not remounted (flexRender treats the function as a component type). */
export function toGroupedColumnDefs<T>(columns: PlatformColumn<T>[], labels: ColumnGroups = {}, leafDef: (c: PlatformColumn<T>) => ColumnDef<T> = toColumnDef): ColumnDef<T>[] {
  // Invalid ids must not enter the engine's unique-id tree; the table reports the declaration separately in dev.
  if (columnGroupErrors(columns, labels).length) return columns.map(leafDef);
  const build = (members: PlatformColumn<T>[], depth: number): ColumnDef<T>[] => {
    const seen = new Set<string>();
    return members.flatMap(c => {
      const id = c.columnGroup?.[depth];
      if (id === undefined) return [{ ...leafDef(c), ...(c.columnGroup?.[0] && columnGroupWidth(labels, c.columnGroup[0], 1) !== undefined ? { enableResizing: false } : {}) }];
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, header: columnGroupLabel(labels, id), enableResizing: false, enableSorting: false, enableHiding: false,
        columns: build(members.filter(member => member.columnGroup?.[depth] === id), depth + 1) }];
    });
  };
  return build(columns, 0);
}
