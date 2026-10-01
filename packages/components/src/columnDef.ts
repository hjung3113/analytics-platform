import type { ColumnDef } from '@tanstack/react-table';
import type { PlatformColumn } from './PlatformDataTable';

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
