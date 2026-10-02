import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type Column, type ColumnDef, type ColumnPinningState, type ColumnSizingState, type RowSelectionState, type VisibilityState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Loader2 } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { type ApiResponse, type PageQuery, type PageResult, type PageSort, serializeGlobal } from '@ap/contracts';
import { Button, Checkbox, cn, Label, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@ap/ui';
import { toColumnDef } from './columnDef';
import { DataTrustIndicator } from './DataTrustIndicator';
import { OutcomeView } from './StateView';
import { exportCell, exportColumns, toCsv } from './tableExport';

export type { PageQuery, PageResult } from '@ap/contracts';
export { sortAndPage } from '@ap/contracts';
type ColumnMeta = { align?: 'right'; label?: string };

/** §15 domain-owned column shape (#160): what menus declare; the TanStack `ColumnDef` conversion lives in the internal `columnDef.ts`, which index.ts does not export. */
export type PlatformColumn<T> = {
  /** Stable id = server sort field = column-preference key = URL sort value. A sortable column's id must be a server sort field; display-only columns set `sortable: false`. */
  id: string;
  /** Header text and the column-menu label. */
  header: string;
  /** Sort/default display value; default `(row as Record<string, unknown>)[id]`. */
  value?: (row: T) => unknown;
  /** Display; default String(value) ('' for null/undefined). */
  cell?: (row: T) => ReactNode;
  size?: number;
  /** Numeric: right aligned + tabular. */
  align?: 'right';
  /** Default true. Only for columns whose id is a server sort field; display-only columns set `false`. */
  sortable?: boolean;
  /** Default true. */
  hideable?: boolean;
  /** Default true; false keeps a column on screen but out of exports. */
  exportable?: boolean;
  /**
   * Export value (#173, 06 §15): export shows what the screen shows. A column whose cell turns a code into a
   * label or formats a time gives the same text here; numeric columns return `number`. Without it the export
   * uses `value ?? row[id]`, and an object/array/Date there is a dev-time error asking for `exportValue`.
   */
  exportValue?: (row: T) => string | number | boolean | null;
};

/** Export refusal copy per outcome (#173): no file is built for these; the reason reaches the user as a toast. */
const EXPORT_REFUSAL: Record<'forbidden' | 'too_large' | 'error' | 'timeout', { ko: string; en: string }> = {
  forbidden: { ko: '서버가 이 조건의 내보내기를 거부했습니다.', en: 'The server rejected the export for this context.' },
  too_large: { ko: '내보내기 결과가 내보내기 상한을 넘었습니다. 필터를 좁혀 주세요.', en: 'The export result is over the export limit. Narrow the filter.' },
  timeout: { ko: '내보내기 요청이 시간 초과되었습니다.', en: 'The export request timed out.' },
  error: { ko: '내보내기를 수행하지 못했습니다.', en: 'The export could not be completed.' },
};
/** Defensive client cap only: the server's declared `limits.maxRows` (#175) is the real guard — this one fires after the rows already arrived. */
const EXPORT_ROW_CAP = 100_000;

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

export type TableUrlState = {
  /** 1-based; null = default page 1 (key omitted). */
  page: number | null;
  /** What the header shows; empty = unsorted. */
  sorting: PageSort[];
  /** One callback for user sort/page gestures; the page owns the URL keys and its own resets (§6.1). */
  onChange: (next: { page: number | null; sorting: PageSort[] }, reason: 'user' | 'reset') => void;
};

export type PlatformDataTableProps<T> = {
  title: ReactNode;
  subtitle?: ReactNode;
  ariaLabel: string;
  columns: PlatformColumn<T>[];
  getRowId: (row: T) => string;
  /** Server-side sort/page. Returns the §19 envelope; the table renders the outcome taxonomy. */
  loadPage: (query: PageQuery, signal: AbortSignal) => Promise<ApiResponse<PageResult<T>>>;
  /** Identity of page-owned filters; a change returns to page 1 and clears row selection. */
  filterKey: string;
  filters?: ReactNode;
  rowAction?: (row: T) => ReactNode;
  bulkActions?: (selectedIds: string[]) => ReactNode;
  /** Table-owned export (#173, 06 §15): the menu only says how to read the rows to export from the server — permission/Scope/limits re-checked per request. Omit to make the screen un-exportable. */
  exportRows?: (scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }, signal: AbortSignal) => Promise<ApiResponse<T[]>>;
  /** Menu note appended to the export toast (e.g. cycle-time "page filters apply; not the full KPI population"). */
  exportNote?: string;
  activeRowId?: string | null;
  preferenceKey: string;
  pageSize?: number;
  height?: number;
  emptyAction?: ReactNode;
  /** Controlled sort/page (§6.1 page keys). Omit to keep today's internal state. The table never knows URL key names. */
  urlState?: TableUrlState;
};

/** §15: platform owns interaction, loading/error, column preference, selection model, toolbar layout; domain owns columns/cells/actions/filters. */
export function PlatformDataTable<T>(p: PlatformDataTableProps<T>) {
  const { t, lang } = useI18n();
  const { global, user, revision, route, toast } = usePlatform();
  // Registry declares export capability (§5); the table never offers Export on a menu that did not declare it.
  const canExport = !!p.exportRows && !!route?.menu.features.export;
  const pageSize = p.pageSize ?? 100;
  const [preferences, setPreferences] = useState(() => readPreferences(p.preferenceKey));
  const [sorting, setSorting] = useState<PageSort[]>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<PageResult<T>> } | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportAbort = useRef<AbortController | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  // urlState (§6.1): controlled sort/page. The page writes the URL via onChange; the table never touches keys.
  const activeSorting = p.urlState ? p.urlState.sorting : sorting;

  // Context identity: global Context + user + page filters + adapter revision. Selection never survives a Context change (DESIGN Tables).
  const contextIdentity = JSON.stringify([serializeGlobal(global), user.id, p.filterKey, revision]);
  const lastContext = useRef(contextIdentity);
  const effectivePage = p.urlState ? (p.urlState.page ?? 1) - 1 : lastContext.current === contextIdentity ? page : 0;
  useEffect(() => {
    if (lastContext.current !== contextIdentity) {
      lastContext.current = contextIdentity; if (!p.urlState) setPage(0); setSelection({});
      exportAbort.current?.abort(); // an in-flight export belongs to the old result set
      if (viewport.current) viewport.current.scrollTop = 0;
    }
  }, [contextIdentity]);
  useEffect(() => () => exportAbort.current?.abort(), []);
  const requestIdentity = JSON.stringify([contextIdentity, effectivePage, activeSorting, retry]);
  const loadRef = useRef(p.loadPage);
  loadRef.current = p.loadPage;
  useEffect(() => {
    const controller = new AbortController();
    loadRef.current({ page: effectivePage, pageSize, sorting: activeSorting }, controller.signal)
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
    // Deps intentionally restricted to requestIdentity (would trip react-hooks/exhaustive-deps if that rule is enabled).
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
    ...p.columns.map(toColumnDef),
    ...(p.rowAction ? [{ id: '_action', size: 128, enableSorting: false, enableHiding: false, enableResizing: false, header: lang === 'ko' ? '동작' : 'Actions', cell: ({ row }: { row: { original: T } }) => p.rowAction!(row.original) } as ColumnDef<T>] : []),
  ], [p.columns, p.rowAction, lang]);

  const table = useReactTable({
    data: data.rows, columns: allColumns, getRowId: p.getRowId, getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true, enableRowSelection: true, columnResizeMode: 'onChange',
    enableMultiSort: !p.urlState,
    defaultColumn: { size: 150, minSize: 60, maxSize: 600 },
    state: { sorting: activeSorting, rowSelection: selection, columnSizing: preferences.sizing, columnVisibility: preferences.visibility, columnPinning: preferences.pinning },
    onSortingChange: u => {
      const next = typeof u === 'function' ? u(p.urlState ? p.urlState.sorting : sorting) : u;
      if (p.urlState) {
        // §6.1: one callback; a sort gesture also resets the page to its default (null).
        p.urlState.onChange({ sorting: next, page: null }, 'user');
        if (viewport.current) viewport.current.scrollTop = 0;
        return;
      }
      setSorting(next); setPage(0); if (viewport.current) viewport.current.scrollTop = 0;
    },
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

  // Table-owned export (#173): the selection when any, else all filtered rows — one CSV built from the column
  // definitions. The menu only supplies the row read; outcome handling, reconciliation, size guard, file and toasts live here.
  async function runExport() {
    const scope = selectedIds.length ? { kind: 'selected' as const, ids: selectedIds } : { kind: 'filtered' as const };
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    try {
      const response = await p.exportRows!(scope, controller.signal);
      if (controller.signal.aborted) return;
      if (response.outcome !== 'ok' && response.outcome !== 'empty') {
        toast(EXPORT_REFUSAL[response.outcome][lang], 'warning');
        return;
      }
      let rows: T[] = response.outcome === 'empty' ? [] : response.data ?? [];
      if (scope.kind === 'selected') {
        // The server already filtered by ids; reconcile again by getRowId — a row can have left the current result.
        const wanted = new Set(scope.ids);
        rows = rows.filter(row => wanted.has(p.getRowId(row)));
        const missing = scope.ids.length - rows.length;
        if (missing > 0) {
          toast(lang === 'ko' ? `선택 ${scope.ids.length}행 중 ${rows.length}행 — ${missing}행은 현재 결과에 없음` : `${rows.length} of ${scope.ids.length} selected rows — ${missing} ${missing === 1 ? 'row is' : 'rows are'} not in the current results`, 'warning');
        }
      }
      if (rows.length > EXPORT_ROW_CAP) {
        toast(lang === 'ko' ? `받은 행이 ${EXPORT_ROW_CAP.toLocaleString('ko-KR')}건을 넘어 파일을 만들지 않습니다. 필터를 좁혀 주세요.` : `More than ${EXPORT_ROW_CAP.toLocaleString('en-US')} rows arrived; no file was built. Narrow the filter.`, 'warning');
        return;
      }
      const columns = exportColumns(p.columns, preferences);
      const csv = toCsv(columns.map(c => c.header), rows.map(row => columns.map(c => exportCell(c, row))));
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${route?.menu.id ?? 'table'}-${stamp}${response.trust?.provisional ? '-provisional' : ''}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      const target = scope.kind === 'selected'
        ? (lang === 'ko' ? `선택 ${rows.length}행을 CSV 파일로 내보냈습니다` : `Exported ${rows.length} selected ${rows.length === 1 ? 'row' : 'rows'} to a CSV file`)
        : (lang === 'ko' ? `필터 결과 전체 ${rows.length}행을 CSV 파일로 내보냈습니다` : `Exported all ${rows.length} filtered ${rows.length === 1 ? 'row' : 'rows'} to a CSV file`);
      toast(p.exportNote ? `${target} — ${p.exportNote}` : target);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      toast(EXPORT_REFUSAL.error[lang], 'warning');
    } finally {
      if (exportAbort.current === controller) { exportAbort.current = null; setExporting(false); }
    }
  }
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
        {canExport && <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-sm border-border-strong" disabled={exporting} onClick={runExport}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}{t('export')}{selectedIds.length ? ` (${selectedIds.length})` : ''}
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
      <Button variant="secondary" size="sm" className="h-7 rounded-sm px-2 text-[12px]" disabled={loading || effectivePage === 0}
        onClick={() => {
          // zero-based target; controlled mode reports 1-based with null = page 1 (§6.1).
          if (p.urlState) p.urlState.onChange({ sorting: p.urlState.sorting, page: effectivePage === 1 ? null : effectivePage }, 'user');
          else setPage(effectivePage - 1);
          if (viewport.current) viewport.current.scrollTop = 0;
        }}>{lang === 'ko' ? '이전' : 'Previous'}</Button>
      <Button variant="secondary" size="sm" className="h-7 rounded-sm px-2 text-[12px]" disabled={loading || effectivePage + 1 >= pageCount}
        onClick={() => {
          if (p.urlState) p.urlState.onChange({ sorting: p.urlState.sorting, page: effectivePage + 2 }, 'user');
          else setPage(effectivePage + 1);
          if (viewport.current) viewport.current.scrollTop = 0;
        }}>{lang === 'ko' ? '다음' : 'Next'}</Button>
    </div>
  </section>;
}

/** §6.1 page-key codecs. Value domains (allowed columns, tab ids) stay page-owned; these pin only the shared wire format. */
export function parsePageIndex(raw: string | null): { ok: true; page: number } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, page: 1 };
  if (!/^[1-9][0-9]*$/.test(raw)) return { ok: false };
  const page = Number(raw);
  return Number.isSafeInteger(page) ? { ok: true, page } : { ok: false };
}

export function parseTableSort(raw: string | null, allowed: readonly string[]): { ok: true; sorting: PageSort[] } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, sorting: [] };
  const m = /^([A-Za-z][A-Za-z0-9_]*):(asc|desc)$/.exec(raw);
  if (!m || !allowed.includes(m[1])) return { ok: false };
  return { ok: true, sorting: [{ id: m[1], desc: m[2] === 'desc' }] };
}

export function encodeTableSort(sorting: PageSort[]): string | null {
  const s = sorting[0];
  return s ? `${s.id}:${s.desc ? 'desc' : 'asc'}` : null;
}
