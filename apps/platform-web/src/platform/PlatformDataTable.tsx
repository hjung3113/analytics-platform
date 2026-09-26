import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type Column, type ColumnDef, type ColumnPinningState, type ColumnSizingState, type RowSelectionState, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Loader2 } from 'lucide-react';
import { useI18n } from '../kernel/i18n';
import { usePlatform } from '../kernel/platform';
import { type ApiResponse, serializeGlobal } from '@ap/contracts';
import { Button } from '../ui/components/Button';
import { Checkbox } from '../ui/components/shadcn/checkbox';
import { Label } from '../ui/components/shadcn/label';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/shadcn/popover';
import { Skeleton } from '../ui/components/shadcn/skeleton';
import { cn } from '../ui/utils/cn';
import { DataTrustIndicator } from './DataTrustIndicator';
import { OutcomeView } from './StateView';

export type PageQuery = { page: number; pageSize: number; sorting: SortingState };
export type PageResult<T> = { rows: T[]; total: number };
export type ColumnMeta = { align?: 'right'; label?: string };

type Preferences = { sizing: ColumnSizingState; visibility: VisibilityState; pinning: ColumnPinningState };
const defaults: Preferences = { sizing: {}, visibility: {}, pinning: { left: [], right: [] } };
function readPreferences(key: string): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(key) || 'null');
    if (!p || typeof p !== 'object') return defaults;
    return {
      sizing: Object.fromEntries(Object.entries(p.sizing || {}).filter(([, v]) => typeof v === 'number' && v >= 60 && v <= 600)) as ColumnSizingState,
      visibility: Object.fromEntries(Object.entries(p.visibility || {}).filter(([, v]) => typeof v === 'boolean')) as VisibilityState,
      pinning: { left: Array.isArray(p.pinning?.left) ? p.pinning.left.filter((v: unknown) => typeof v === 'string') : [], right: [] },
    };
  } catch { return defaults; }
}

export type PlatformDataTableProps<T> = {
  title: ReactNode;
  subtitle?: ReactNode;
  ariaLabel: string;
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  /** Server-side sort/page. Returns the §19 envelope; the table renders the outcome taxonomy. */
  loadPage: (query: PageQuery, signal: AbortSignal) => Promise<ApiResponse<PageResult<T>>>;
  /** Identity of page-owned filters; a change returns to page 1 and clears row selection. */
  filterKey: string;
  filters?: ReactNode;
  rowAction?: (row: T) => ReactNode;
  bulkActions?: (selectedIds: string[]) => ReactNode;
  onExport?: (scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered'; total: number }) => void;
  activeRowId?: string | null;
  preferenceKey: string;
  pageSize?: number;
  height?: number;
  emptyAction?: ReactNode;
};

/** §15: platform owns interaction, loading/error, column preference, selection model, toolbar layout; domain owns columns/cells/actions/filters. */
export function PlatformDataTable<T>(p: PlatformDataTableProps<T>) {
  const { t, lang } = useI18n();
  const { global, role, scenario, route } = usePlatform();
  // Registry declares export capability (§5); the table never offers Export on a menu that did not declare it.
  const canExport = !!p.onExport && !!route?.menu.features.export;
  const pageSize = p.pageSize ?? 100;
  const [preferences, setPreferences] = useState(() => readPreferences(p.preferenceKey));
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<PageResult<T>> } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  // Context identity: global Context + role + page filters. Selection never survives a Context change (DESIGN Tables).
  const contextIdentity = JSON.stringify([serializeGlobal(global), role, p.filterKey, scenario]);
  const lastContext = useRef(contextIdentity);
  const effectivePage = lastContext.current === contextIdentity ? page : 0;
  useEffect(() => {
    if (lastContext.current !== contextIdentity) {
      lastContext.current = contextIdentity; setPage(0); setSelection({});
      if (viewport.current) viewport.current.scrollTop = 0;
    }
  }, [contextIdentity]);
  const requestIdentity = JSON.stringify([contextIdentity, effectivePage, sorting, retry]);
  const loadRef = useRef(p.loadPage);
  loadRef.current = p.loadPage;
  useEffect(() => {
    const controller = new AbortController();
    loadRef.current({ page: effectivePage, pageSize, sorting }, controller.signal)
      .then(response => { if (!controller.signal.aborted) setResult({ identity: requestIdentity, response }); })
      .catch(error => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        setResult({
          identity: requestIdentity,
          response: {
            outcome: 'error', data: null, assessments: [], trust: null,
            correlationId: 'client-' + Date.now().toString(16), message: String(error),
          },
        });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestIdentity]);
  useEffect(() => { try { localStorage.setItem(p.preferenceKey, JSON.stringify(preferences)); } catch { /* memory-only */ } }, [preferences, p.preferenceKey]);

  // Same Context (page/sort/retry) keeps the last rows visible while loading; a new Context hides them.
  const sameContext = result !== null && JSON.parse(result.identity)[0] === contextIdentity;
  const shown = sameContext ? result!.response : null;
  const shownPage = shown
    ? (JSON.parse(result!.identity) as [string, number])[1]
    : effectivePage;
  const loading = result?.identity !== requestIdentity;
  const data = shown?.outcome === 'ok' ? shown.data! : { rows: [] as T[], total: shown?.data?.total ?? 0 };

  const allColumns = useMemo<ColumnDef<T>[]>(() => [
    {
      id: '_select', size: 40, enableSorting: false, enableHiding: false, enableResizing: false,
      header: ({ table }) => <Checkbox aria-label={lang === 'ko' ? '현재 페이지 전체 선택' : 'Select all rows on this page'}
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={v => table.toggleAllPageRowsSelected(v === true)} className="size-3.5 border-border-control" />,
      cell: ({ row }) => <Checkbox aria-label={`${lang === 'ko' ? '선택' : 'Select'} ${row.id}`} checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(v === true)} className="size-3.5 border-border-control" />,
    },
    ...p.columns,
    ...(p.rowAction ? [{ id: '_action', size: 128, enableSorting: false, enableHiding: false, enableResizing: false, header: lang === 'ko' ? '동작' : 'Actions', cell: ({ row }: { row: { original: T } }) => p.rowAction!(row.original) } as ColumnDef<T>] : []),
  ], [p.columns, p.rowAction, lang]);

  const table = useReactTable({
    data: data.rows, columns: allColumns, getRowId: p.getRowId, getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true, enableRowSelection: true, columnResizeMode: 'onChange',
    defaultColumn: { size: 150, minSize: 60, maxSize: 600 },
    state: { sorting, rowSelection: selection, columnSizing: preferences.sizing, columnVisibility: preferences.visibility, columnPinning: preferences.pinning },
    onSortingChange: u => { setSorting(u); setPage(0); if (viewport.current) viewport.current.scrollTop = 0; },
    onRowSelectionChange: setSelection,
    onColumnSizingChange: u => setPreferences(pr => ({ ...pr, sizing: typeof u === 'function' ? u(pr.sizing) : u })),
    onColumnVisibilityChange: u => setPreferences(pr => ({ ...pr, visibility: typeof u === 'function' ? u(pr.visibility) : u })),
    onColumnPinningChange: u => setPreferences(pr => ({ ...pr, pinning: typeof u === 'function' ? u(pr.pinning) : u })),
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => viewport.current, estimateSize: () => 32, overscan: 8, getItemKey: i => rows[i].id });
  const selectedIds = Object.keys(selection).filter(k => selection[k]);
  const pageCount = Math.max(1, Math.ceil(data.total / pageSize));

  function cellStyle(column: Column<T>): CSSProperties {
    const pinned = column.getIsPinned();
    return { width: column.getSize(), flexShrink: 0, position: pinned ? 'sticky' : 'relative', left: pinned === 'left' ? column.getStart('left') : undefined, zIndex: pinned ? 2 : undefined };
  }
  const align = (column: Column<T>) => ((column.columnDef.meta as ColumnMeta | undefined)?.align === 'right' ? 'justify-end text-right tabular' : '');
  const cellBase = 'flex min-h-8 items-center px-3 py-1 [overflow-wrap:anywhere] pointer-coarse:min-h-11';
  const nameOf = (c: Column<T>) => (c.columnDef.meta as ColumnMeta | undefined)?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id);

  return <section aria-label={p.ariaLabel} className="flex flex-col rounded-lg border border-border-subtle bg-surface-card">
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-3">
      <div className="min-w-0">
        <h2 className="t-card-title">{p.title}</h2>
        {p.subtitle && <p className="text-[12px] text-text-muted">{p.subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.filters}
        <Popover>
          <PopoverTrigger asChild><Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-sm border-border-strong"><Columns3 className="size-3.5" aria-hidden />{lang === 'ko' ? '컬럼' : 'Columns'}</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-md border border-border-strong bg-surface-card p-3 shadow-md">
            <p className="t-card-title mb-2">{lang === 'ko' ? '컬럼 설정 (브라우저에 저장)' : 'Column preferences (saved locally)'}</p>
            <ul className="space-y-2">{table.getAllLeafColumns().filter(c => c.getCanHide()).map(c => <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <Label className="flex items-center gap-2 text-[12px] font-normal"><Checkbox checked={c.getIsVisible()} onCheckedChange={v => c.toggleVisibility(v === true)} className="size-3.5" />{nameOf(c)}</Label>
              <Label className="flex items-center gap-1 text-[11px] font-normal text-text-muted"><Checkbox checked={c.getIsPinned() === 'left'} onCheckedChange={v => c.pin(v === true ? 'left' : false)} className="size-3.5" />{lang === 'ko' ? '고정' : 'Pin'}</Label>
              <input aria-label={`${nameOf(c)} width`} type="range" min="60" max="600" value={c.getSize()} className="col-span-2 accent-[rgb(var(--accent-primary))]" onChange={e => table.setColumnSizing(o => ({ ...o, [c.id]: Number(e.target.value) }))} />
            </li>)}</ul>
          </PopoverContent>
        </Popover>
        {canExport && <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-sm border-border-strong"
          onClick={() => p.onExport!(selectedIds.length ? { kind: 'selected', ids: selectedIds } : { kind: 'filtered', total: data.total })}>
          <Download className="size-3.5" aria-hidden />{t('export')}{selectedIds.length ? ` (${selectedIds.length})` : ''}
        </Button>}
      </div>
    </div>

    {selectedIds.length > 0 && <div className="flex min-h-10 flex-wrap items-center gap-3 border-t border-border-subtle bg-accent-primary-soft px-3 py-2 text-[12px]">
      <span className="font-semibold tabular" data-testid="selected-count">{lang === 'ko' ? `${selectedIds.length}개 선택` : `${selectedIds.length} selected`}</span>
      {p.bulkActions?.(selectedIds)}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => setSelection({})}>{lang === 'ko' ? '선택 해제' : 'Clear selection'}</Button>
      <span className="text-text-muted">{lang === 'ko' ? '선택은 현재 조회 결과 안에서만 유지되며 Context 변경 시 해제됩니다.' : 'Selection is kept within this result and cleared on context change.'}</span>
    </div>}

    <div className="flex min-h-7 items-center justify-between gap-2 border-t border-border-subtle px-3 py-1 text-[12px] text-text-muted" aria-live="polite">
      <span className="tabular">{shown ? (lang === 'ko' ? `${data.total.toLocaleString()}건 · ${shownPage + 1}/${pageCount} 페이지` : `${data.total.toLocaleString()} results · page ${shownPage + 1}/${pageCount}`) : t('loading')}</span>
      <span className="flex items-center gap-2">
        {loading && shown && <span role="status" className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden />{t('refreshing')}</span>}
        {shown && <DataTrustIndicator trust={shown.trust} assessments={shown.assessments} className="min-h-6" />}
      </span>
    </div>

    {shown && shown.outcome !== 'ok' ? <div className="border-t border-border-subtle p-3"><OutcomeView response={shown} onRetry={() => setRetry(r => r + 1)} emptyAction={p.emptyAction}>{() => null}</OutcomeView></div> :
      <div ref={viewport} tabIndex={0} aria-label={lang === 'ko' ? '스크롤 가능한 행 영역' : 'Scrollable rows'} className="overflow-auto overscroll-contain border-t border-border-subtle [overflow-anchor:none]" style={{ height: p.height ?? 420 }}>
        <div role="table" aria-label={p.ariaLabel} aria-rowcount={data.total + 1} aria-busy={loading} style={{ width: table.getTotalSize(), minWidth: '100%' }}>
          <div role="rowgroup" className="sticky top-0 z-[5]">
            <div role="row" className="flex">{table.getHeaderGroups()[0].headers.map(h => {
              const sorted = h.column.getIsSorted();
              return <div role="columnheader" key={h.id} data-column={h.column.id} style={cellStyle(h.column)}
                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : h.column.getCanSort() ? 'none' : undefined}
                className={cn(cellBase, 't-table-header border-b border-border-subtle bg-surface-sunken text-text-muted', align(h.column))}>
                {h.column.getCanSort()
                  ? <button type="button" onClick={h.column.getToggleSortingHandler()} className="-mx-1 inline-flex items-center gap-1 rounded-xs px-1 uppercase hover:text-text-primary">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUpDown className="size-3 opacity-40" aria-hidden />}
                    </button>
                  : flexRender(h.column.columnDef.header, h.getContext())}
                {h.column.getCanResize() && <div aria-hidden onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()} className="absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none hover:bg-accent-primary" />}
              </div>;
            })}</div>
          </div>
          {!shown ? <div className="space-y-2 p-3" aria-hidden>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5 rounded-sm bg-surface-sunken" />)}</div> :
            <div role="rowgroup" style={{ height: virtual.getTotalSize(), position: 'relative' }}>{virtual.getVirtualItems().map(item => {
              const row = rows[item.index];
              const active = p.activeRowId === row.id;
              return <div role="row" key={row.id} ref={virtual.measureElement} data-index={item.index} aria-rowindex={shownPage * pageSize + item.index + 2}
                aria-selected={row.getIsSelected()} data-row-id={row.id}
                className={cn('group absolute left-0 top-0 flex w-full', loading && 'opacity-60')} style={{ transform: `translateY(${item.start}px)` }}>
                {row.getVisibleCells().map(cell => <div role="cell" key={cell.id} data-column={cell.column.id} style={cellStyle(cell.column)}
                  className={cn(cellBase, 'border-b border-border-subtle bg-surface-card text-[13px] group-hover:bg-surface-row-hover group-aria-selected:bg-surface-row-selected', active && 'bg-surface-row-selected', align(cell.column))}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>)}
              </div>;
            })}</div>}
        </div>
      </div>}

    <div className="flex items-center justify-end gap-2 border-t border-border-subtle p-2">
      <Button variant="secondary" size="sm" className="h-7 rounded-sm px-2 text-[12px]" disabled={loading || effectivePage === 0} onClick={() => { setPage(effectivePage - 1); if (viewport.current) viewport.current.scrollTop = 0; }}>{lang === 'ko' ? '이전' : 'Previous'}</Button>
      <Button variant="secondary" size="sm" className="h-7 rounded-sm px-2 text-[12px]" disabled={loading || effectivePage + 1 >= pageCount} onClick={() => { setPage(effectivePage + 1); if (viewport.current) viewport.current.scrollTop = 0; }}>{lang === 'ko' ? '다음' : 'Next'}</Button>
    </div>
  </section>;
}

/** Server-side sort/page over an in-memory result set (mock server helper). */
export function sortAndPage<T>(rows: T[], q: PageQuery): PageResult<T> {
  const sorted = [...rows];
  const s = q.sorting[0];
  if (s) sorted.sort((a, b) => {
    const av = (a as Record<string, unknown>)[s.id]; const bv = (b as Record<string, unknown>)[s.id];
    const c = av === bv ? 0 : av === null || av === undefined ? 1 : bv === null || bv === undefined ? -1 : av < bv ? -1 : 1;
    return s.desc ? -c : c;
  });
  return { rows: sorted.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: rows.length };
}
