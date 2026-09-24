import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState, type RowSelectionState, type ColumnSizingState, type VisibilityState, type ColumnPinningState, type Column } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
export type PageQuery = { page: number; pageSize: number; sorting: SortingState; filter: string };
export type PageResult<T> = { rows: T[]; total: number };
type Preferences = { sizing: ColumnSizingState; visibility: VisibilityState; pinning: ColumnPinningState };
const defaults: Preferences = { sizing: {}, visibility: {}, pinning: { left: [], right: [] } };
function readPreferences(key: string): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(key) || 'null');
    if (!p || typeof p !== 'object') return defaults;
    return {
      sizing: Object.fromEntries(Object.entries(p.sizing || {}).filter(([, v]) => typeof v === 'number' && v >= 80 && v <= 600)) as ColumnSizingState,
      visibility: Object.fromEntries(Object.entries(p.visibility || {}).filter(([, v]) => typeof v === 'boolean')) as VisibilityState,
      pinning: { left: Array.isArray(p.pinning?.left) ? p.pinning.left.filter((v: unknown) => typeof v === 'string') : [], right: [] },
    };
  } catch { return defaults; }
}
export function PlatformDataTable<T>({ columns, getRowId, loadPage, filter, filterControl, rowAction, preferenceKey, onExport, ariaLabel, pageSize }: {
  columns: ColumnDef<T>[]; getRowId: (row: T) => string;
  loadPage: (query: PageQuery, signal: AbortSignal) => Promise<PageResult<T>>;
  filter: string; filterControl: ReactNode; rowAction: (row: T) => ReactNode;
  preferenceKey: string; onExport: () => void; ariaLabel: string; pageSize: number;
}) {
  const [preferences, setPreferences] = useState(() => readPreferences(preferenceKey));
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<T>>({ rows: [], total: 0 });
  const [retry, setRetry] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const previousFilter = useRef(filter);
  // Derive the first page immediately when the fixture-owned filter changes.
  const effectivePage = previousFilter.current === filter ? page : 0;
  const request = useMemo(() => ({ query: { page: effectivePage, pageSize, sorting, filter }, loadPage, retry }), [effectivePage, pageSize, sorting, filter, loadPage, retry]);
  const [completion, setCompletion] = useState<{ request: typeof request; status: 'ready' | 'error' } | null>(null);
  // Query changes and busy commit together, including parent-owned filter changes.
  // Keep the last successful rows mounted until the current response replaces them.
  const state = completion?.request === request ? completion.status : 'loading';
  useEffect(() => { if (previousFilter.current !== filter) { previousFilter.current = filter; setPage(0); if (viewport.current) viewport.current.scrollTop = 0; } }, [filter]);
  useEffect(() => { try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* session preferences remain usable */ } }, [preferences, preferenceKey]);
  useEffect(() => {
    const controller = new AbortController();
    request.loadPage(request.query, controller.signal).then(data => {
      if (!controller.signal.aborted) { setResult(data); setCompletion({ request, status: 'ready' }); }
    }).catch(() => { if (!controller.signal.aborted) setCompletion({ request, status: 'error' }); });
    return () => controller.abort();
  }, [request]);
  const allColumns = useMemo<ColumnDef<T>[]>(() => [
    { id: '_select', header: 'Select', size: 80, enableSorting: false, enableHiding: false, enablePinning: false,
      cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> },
    ...columns,
    { id: '_action', header: 'Action', size: 120, enableSorting: false, enableHiding: false, enablePinning: false, cell: ({ row }) => rowAction(row.original) },
  ], [columns, rowAction]);
  const table = useReactTable({ data: result.rows, columns: allColumns, getRowId, getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualFiltering: true, manualPagination: true, enableRowSelection: true, columnResizeMode: 'onChange',
    defaultColumn: { size: 180, minSize: 80, maxSize: 600 },
    state: { sorting, rowSelection: selection, columnSizing: preferences.sizing, columnVisibility: preferences.visibility, columnPinning: preferences.pinning },
    onSortingChange: updater => { setSorting(updater); setPage(0); if (viewport.current) viewport.current.scrollTop = 0; },
    onRowSelectionChange: setSelection,
    onColumnSizingChange: updater => setPreferences(p => ({ ...p, sizing: typeof updater === 'function' ? updater(p.sizing) : updater })),
    onColumnVisibilityChange: updater => setPreferences(p => ({ ...p, visibility: typeof updater === 'function' ? updater(p.visibility) : updater })),
    onColumnPinningChange: updater => setPreferences(p => ({ ...p, pinning: typeof updater === 'function' ? updater(p.pinning) : updater })),
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => viewport.current, estimateSize: () => 40, overscan: 4, getItemKey: index => rows[index].id });
  function cellStyle(column: Column<T>): CSSProperties {
    return { width: column.getSize(), flexShrink: 0, position: column.getIsPinned() ? 'sticky' : 'relative', left: column.getIsPinned() === 'left' ? column.getStart('left') : undefined, zIndex: column.getIsPinned() ? 2 : undefined };
  }
  const pageCount = Math.ceil(result.total / pageSize);
  function goTo(next: number) { setPage(next); if (viewport.current) viewport.current.scrollTop = 0; }
  return <section aria-label="Platform table">
    <div className="toolbar">{filterControl}<button onClick={onExport}>Export</button><details><summary>Column preferences</summary>
      <div className="preferences">{table.getAllLeafColumns().filter(c => c.getCanHide()).map(column => <div key={column.id}>
        <label><input type="checkbox" aria-label={`Show ${column.id}`} checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{column.id}</label>
        <label><input type="checkbox" aria-label={`Pin ${column.id}`} checked={!!column.getIsPinned()} onChange={e => column.pin(e.target.checked ? 'left' : false)} />Pin</label>
        <label>Width<input aria-label={`Width ${column.id}`} type="range" min="80" max="600" value={column.getSize()} onChange={e => table.setColumnSizing(old => ({ ...old, [column.id]: Number(e.target.value) }))} /></label>
      </div>)}</div></details></div>
    <div className="summary"><span data-testid="selected-count">{Object.values(selection).filter(Boolean).length} selected</span><button onClick={() => setSelection({})}>Clear selection</button><span data-testid="result-count">{result.total} results · Page {effectivePage + 1} / {Math.max(1, pageCount)}</span></div>
    <div aria-live="polite">{state === 'loading' && <p role="status">Loading…{result.rows.length > 0 && " Previous results remain visible."}</p>}{state === 'error' && <p role="alert">Unable to load rows. {result.rows.length > 0 && "Previous results remain visible. "}<button onClick={() => setRetry(r => r + 1)}>Retry</button></p>}{state === 'ready' && result.total === 0 && <p>No matching rows.</p>}</div>
    <div ref={viewport} className="viewport" data-testid="viewport" tabIndex={0} aria-label="Scrollable rows">
      <div role="table" aria-label={ariaLabel} aria-rowcount={result.total + 1} aria-busy={state === 'loading'} style={{ width: table.getTotalSize(), minWidth: '100%' }}>
        <div role="rowgroup" className="header"><div role="row" className="table-row">{table.getHeaderGroups()[0].headers.map(header => <div role="columnheader" className="cell" data-column={header.column.id} key={header.id} style={cellStyle(header.column)} aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}>
          {header.column.getCanSort() ? <button onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}</button> : flexRender(header.column.columnDef.header, header.getContext())}
          <div className="resize" onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} aria-hidden="true" />
        </div>)}</div></div>
        <div role="rowgroup" style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
          const row = rows[item.index];
          return <div role="row" aria-rowindex={effectivePage * pageSize + item.index + 2} aria-selected={row.getIsSelected()} data-testid="data-row" data-row-id={row.id} data-index={item.index} ref={virtual.measureElement} key={row.id} className="table-row data-row" style={{ position: 'absolute', top: 0, transform: `translateY(${item.start}px)`, width: '100%' }}>
            {row.getVisibleCells().map(cell => <div role="cell" className="cell" data-column={cell.column.id} key={cell.id} style={cellStyle(cell.column)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>)}
          </div>;
        })}</div>
      </div>
    </div>
    <div className="toolbar"><button disabled={state !== 'ready' || effectivePage === 0} onClick={() => goTo(effectivePage - 1)}>Previous</button><button disabled={state !== 'ready' || effectivePage + 1 >= pageCount} onClick={() => goTo(effectivePage + 1)}>Next</button></div>
  </section>;
}
