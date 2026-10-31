import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RowSelectionState, Updater } from '@tanstack/react-table';
import type { ColumnFilter, PageSort } from '@ap/contracts';

/**
 * What a bulk action or export receives (#556c, ADR-0104): an explicit id list, or "every row of the filtered result except
 * these" — the exclusion model, so a select-all never builds or sends an id list. `total` is the result count when the user
 * chose select-all (a display snapshot); the server recomputes the set at action time from Context + page filters + column
 * filters − `excludedIds` and re-checks permission/Scope.
 */
export type TableSelection = { kind: 'ids'; ids: string[] } | { kind: 'all'; excludedIds: string[]; total: number };

/** The `exportRows` request (06 §15): which rows (`selected` ids / `filtered` whole result / `all` = whole result minus `excludedIds`), the table's sort and the active column filters. */
export type TableExportRequest = {
  scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' } | { kind: 'all'; excludedIds: string[] };
  sorting: PageSort[];
  filters?: ColumnFilter[];
};

/**
 * How an `exportRows` helper reads `request.scope` (#556c): `ids: null` = every filtered row, `ids: [...]` = that selection, and
 * `all-except` = every filtered row but `excludedIds`. A helper that handles the first mode only fails to compile on `.ids`,
 * so a new scope cannot silently export excluded rows.
 */
export function exportScopeIds(scope: TableExportRequest['scope']): { mode: 'ids'; ids: string[] | null } | { mode: 'all-except'; excludedIds: string[] } {
  switch (scope.kind) {
    case 'selected': return { mode: 'ids', ids: scope.ids };
    case 'filtered': return { mode: 'ids', ids: null };
    case 'all': return { mode: 'all-except', excludedIds: scope.excludedIds };
    default: { const never: never = scope; return never; }
  }
}

type SelectAllState = { excluded: ReadonlySet<string>; total: number };

type Input<T> = {
  /** The table has a feature that reads a selection (export/copy, bulk actions). */
  enabled: boolean;
  /** `selectAllResults` opt-in. */
  selectAllResults: boolean;
  rows: T[];
  getRowId: (row: T) => string;
  /** Total of the shown result; only meaningful when `resultOk`. */
  total: number;
  resultOk: boolean;
};

/**
 * Row selection state for the table (#556c): the id map today's tables use, plus the opt-in `all` mode where the state is the
 * exclusion set only (constant size, whatever the page count). TanStack gets a derived `RowSelectionState` of the shown page.
 */
export function useTableSelection<T>({ enabled, selectAllResults, rows, getRowId, total, resultOk }: Input<T>) {
  const [ids, setIds] = useState<RowSelectionState>({});
  const [all, setAll] = useState<SelectAllState | null>(null);
  const active = enabled;
  useEffect(() => {
    if (!enabled) { setIds(previous => Object.keys(previous).length ? {} : previous); setAll(null); }
  }, [enabled]);

  const rowSelection = useMemo<RowSelectionState>(() => {
    if (!active) return {};
    if (!all) return ids;
    return Object.fromEntries(rows.map(getRowId).filter(id => !all.excluded.has(id)).map(id => [id, true]));
  }, [active, all, ids, rows, getRowId]);

  const onRowSelectionChange = useCallback((updater: Updater<RowSelectionState>) => {
    if (!all) { setIds(updater); return; }
    const next = typeof updater === 'function' ? updater(rowSelection) : updater;
    const excluded = new Set(all.excluded);
    for (const row of rows) {
      const id = getRowId(row);
      if (next[id]) excluded.delete(id); else excluded.add(id);
    }
    // Excluding every row leaves nothing selected: leave the mode instead of showing "0 selected" of a result.
    if (excluded.size >= all.total) { setAll(null); setIds({}); return; }
    setAll({ excluded, total: all.total });
  }, [all, rowSelection, rows, getRowId]);

  const clear = useCallback(() => { setIds({}); setAll(null); }, []);
  const selectedIds = useMemo(() => all || !active ? [] : Object.keys(ids).filter(k => ids[k]), [all, active, ids]);
  const pageFullySelected = rows.length > 0 && rows.every(row => !!rowSelection[getRowId(row)]);
  /** Gmail pattern: offered only for a fully selected page with more results behind it. */
  const offerAll = active && selectAllResults && !all && resultOk && pageFullySelected && total > rows.length;
  const selectAll = useCallback(() => setAll({ excluded: new Set(), total }), [total]);

  const excludedIds = useMemo(() => all ? [...all.excluded] : [], [all]);
  const selection = useMemo<TableSelection | null>(() => all
    ? { kind: 'all', excludedIds, total: all.total }
    : selectedIds.length > 0 ? { kind: 'ids', ids: selectedIds } : null, [all, excludedIds, selectedIds]);
  const count = all ? all.total - all.excluded.size : selectedIds.length;
  /** Header checkbox in `all` mode: checked, or indeterminate once rows are excluded; null = the table's own page-select state. */
  const headerState: 'all' | 'partial' | null = all ? (all.excluded.size > 0 ? 'partial' : 'all') : null;

  return { rowSelection, onRowSelectionChange, selectedIds, selection, count, all, excludedIds, offerAll, selectAll, clear, headerState };
}
