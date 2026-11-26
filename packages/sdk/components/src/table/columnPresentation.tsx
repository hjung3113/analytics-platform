import { useRef } from 'react';
import type { ColumnFilter } from '@ap/contracts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useIsTruncated } from '@ap/ui';
import type { PlatformColumn } from './PlatformDataTable';
import { BASE_ROW_HEIGHT, TABLE_SIZE_STEPS, type TableSize } from './tableSize';

export function columnKind<T>({ cellKind, filter }: PlatformColumn<T>) {
  if (cellKind) return cellKind;
  if (filter?.kind === 'number' || filter?.kind === 'instant') return filter.kind;
  return 'text';
}

export function columnValue<T>(column: PlatformColumn<T>, row: T): unknown {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[column.id];
}

// Width floors in normal row-height units, with room for both cell insets.
const MIN_WIDTH_UNITS = { instant: 4.25, 'instant-seconds': 5.5, badge: 4 };

export function columnMinWidth<T>(column: PlatformColumn<T>, size: TableSize) {
  const kind = columnKind(column);
  if (kind === 'number' || kind === 'text' || kind === 'longText') return undefined;
  return Math.round(BASE_ROW_HEIGHT * MIN_WIDTH_UNITS[kind] * TABLE_SIZE_STEPS[size].widthScale);
}

export function uniformBadgeColumns<T>(columns: readonly PlatformColumn<T>[], rows: readonly T[], filters: readonly ColumnFilter[], { complete }: { complete: boolean }) {
  const uniform = new Set<string>();
  if (rows.length === 0) return uniform;
  for (const column of columns) {
    if (columnKind(column) !== 'badge') continue;
    const first = columnValue(column, rows[0]);
    if (first == null || first === '') continue;
    const spec = column.filter;
    // Only a one-value enum filter proves the field across pages: its options declare the field's values. A text `equals`
    // compares `String(raw)`, so raw '7' and 7 both match and the shortcut cannot prove one value.
    const exact = !complete && !column.value && typeof first === 'string' && filters.some(filter => filter.id === column.id
      && spec?.kind === 'enum' && spec.cell !== 'many' && filter.op === 'in' && filter.value.length === 1 && filter.value[0] === first);
    if ((complete || exact) && rows.every(row => Object.is(columnValue(column, row), first))) uniform.add(column.id);
  }
  return uniform;
}

export function badgeText<T>(column: PlatformColumn<T>, row: T, value: unknown) {
  const label = column.exportValue?.(row);
  if (typeof label === 'string') return label;
  if (column.filter?.kind === 'enum') {
    const option = column.filter.options.find(option => option.value === value);
    if (option) return option.label;
  }
  return String(value);
}

export function TruncatedTableText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const clipped = useIsTruncated(ref);
  // Keep the span and its focus when a resize crosses the truncation boundary.
  return <TooltipProvider><Tooltip>
    <TooltipTrigger asChild>
      <span ref={ref} tabIndex={clipped ? 0 : undefined} className="min-w-0 truncate">{text}</span>
    </TooltipTrigger>
    {clipped && <TooltipContent className="max-w-sm break-words">{text}</TooltipContent>}
  </Tooltip></TooltipProvider>;
}
