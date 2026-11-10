import { useEffect, useMemo, useState } from 'react';
import { clientCorrelationId, filterRows, groupPage, sortAndPage, validateFilters, type ApiResponse, type GroupedPageResult, type TableQuery } from '@ap/contracts';
import { isProductionEnv } from '@ap/ui';
import type { PlatformColumn, TableLoadPage } from './PlatformDataTable';
import type { TableFilterField } from './filterFields';

type RowsInput<T> = {
  /** Undefined = server mode (`loadPage`): nothing here applies. */
  rows: readonly T[] | undefined;
  rowsLoading: boolean;
  /** The menu owns the window (keyset): every given row is shown in the given order. */
  external: boolean;
  columns: PlatformColumn<T>[];
  filterFields: TableFilterField[] | undefined;
};

function withoutFilterAndGroup<T>(column: PlatformColumn<T>): PlatformColumn<T> {
  const copy = { ...column };
  delete copy.filter; delete copy.filterPinned; delete copy.filterLabel; delete copy.filterEntry; delete copy.groupable;
  return copy;
}

/**
 * `rows` input of PlatformDataTable: the table builds its own `loadPage` over rows the page already holds (filter, group or sort, page —
 * all through the column's value) and answers the §19 envelope itself. `version` counts a new `rows` reference or a `rowsLoading` change;
 * the paging hook folds it into the request identity (never the Context identity), so page and selection survive and rows stay visible.
 * With `external` the menu owns the window, so column filters and row groups (which need the whole set) are removed here, once, before
 * the columns reach the rest of the table; `filtersIgnored` tells the table to drop any (controlled or own) filter state too, so identity, export and descriptions never see it.
 */
export function useRowsSource<T>({ rows, rowsLoading, external, columns, filterFields }: RowsInput<T>) {
  const active = rows !== undefined;
  // State adjusted during render (never a ref): React re-runs this component at once with the new version.
  const [seen, setSeen] = useState({ rows, rowsLoading, version: 0 });
  if (seen.rows !== rows || seen.rowsLoading !== rowsLoading) setSeen({ rows, rowsLoading, version: seen.version + 1 });
  const ignored = active && external && (columns.some(c => c.filter || c.groupable) || (filterFields?.length ?? 0) > 0);
  useEffect(() => {
    if (!ignored || isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return;
    console.warn('[PlatformDataTable] `filter`, `filterFields` and `groupable` are ignored with `rows` and `externalPagination`: the menu owns the window, so the table cannot filter or group the whole result.');
  }, [ignored]);
  const shownColumns = useMemo(() => ignored ? columns.map(withoutFilterAndGroup) : columns, [ignored, columns]);
  const shownFields = ignored ? undefined : filterFields;
  if (!active) return { columns, filterFields, loadPage: undefined, version: 0, filtersIgnored: false };
  const loadPage: TableLoadPage<T> = async (query, signal) => {
    if (rowsLoading) return new Promise<never>((_, reject) => {
      const abort = () => reject(new DOMException('aborted', 'AbortError'));
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
    if (external) return envelope(rows, rows.length);
    return localPage(rows, query, shownColumns, shownFields);
  };
  return { columns: shownColumns, filterFields: shownFields, loadPage, version: seen.version, filtersIgnored: external };
}

function envelope<T>(rows: readonly T[], total: number, groups?: GroupedPageResult<T>['groups']): ApiResponse<GroupedPageResult<T>> {
  return { outcome: total === 0 ? 'empty' : 'ok', data: { rows: [...rows], total, ...(groups ? { groups } : {}) }, assessments: [], trust: null, correlationId: clientCorrelationId() };
}

function localPage<T>(rows: readonly T[], query: TableQuery, columns: PlatformColumn<T>[], fields: TableFilterField[] | undefined): ApiResponse<GroupedPageResult<T>> {
  const byId = new Map(columns.map(c => [c.id, c]));
  const accessor = (row: T, id: string) => byId.get(id)?.value?.(row) ?? (row as Record<string, unknown>)[id];
  const specs = Object.fromEntries([...columns.flatMap(c => c.filter ? [[c.id, c.filter] as const] : []), ...(fields ?? []).map(f => [f.id, f.spec] as const)]);
  if (query.filters?.length) {
    const check = validateFilters(query.filters, specs);
    if (!check.ok) return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: `filter rejected: ${check.reason} (${check.filter.id})` };
  }
  const filtered = filterRows(rows, query.filters, accessor, { specs });
  if (query.groupBy) {
    const grouped = groupPage(filtered, { groupBy: query.groupBy, sorting: query.sorting, subtotalColumns: columns.filter(c => c.subtotal).map(c => c.id), accessor, page: query.page, pageSize: query.pageSize });
    return envelope(grouped.rows, grouped.total, grouped.groups);
  }
  const paged = sortAndPage(filtered, query, accessor);
  return envelope(paged.rows, paged.total);
}
