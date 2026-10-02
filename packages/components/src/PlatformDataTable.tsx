import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type Column, type ColumnDef, type ColumnPinningState, type ColumnSizingState, type RowSelectionState, type VisibilityState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { CONTEXT_LABELS, useI18n, usePlatform } from '@ap/kernel';
import { conditionLabel, type ApiResponse, type Capability, type ContextKey, type GlobalContext, type PageQuery, type PageResult, type PageSort, serializeGlobal, type Trust } from '@ap/contracts';
import { Button, Checkbox, cn, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, isProductionEnv, Label, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@ap/ui';
import { toColumnDef } from './columnDef';
import { DataTrustIndicator } from './DataTrustIndicator';
import { OutcomeView } from './StateView';
import { exportCell, exportColumns, toCsv, toXlsx } from './tableExport';

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

/** Export refusal copy per outcome (#173, 06 §26 원인/행동): every refusal names a next action; no specific cause is claimed the server did not state. */
const EXPORT_REFUSAL: Record<'forbidden' | 'too_large' | 'error' | 'timeout', { ko: string; en: string }> = {
  forbidden: { ko: '서버가 이 조건의 내보내기를 거부했습니다. 현재 Scope와 접근 권한을 확인하세요.', en: 'The server rejected the export for this context. Check the current scope and your access rights.' },
  too_large: { ko: '내보내기 결과가 내보내기 상한을 넘었습니다. 필터를 좁혀 주세요.', en: 'The export result is over the export limit. Narrow the filter.' },
  timeout: { ko: '내보내기 요청이 시간 초과되었습니다. 다시 시도해 주세요.', en: 'The export request timed out. Please try again.' },
  error: { ko: '내보내기를 수행하지 못했습니다. 다시 시도하고, 반복되면 관리자에게 문의하세요.', en: 'The export could not be completed. Try again, and contact the administrator if it keeps failing.' },
};
/** Defensive client cap only: the server's declared `limits.maxRows` (#175) is the real guard — this one fires after the rows already arrived. */
const EXPORT_ROW_CAP = 100_000;
type ExportFormat = 'xlsx' | 'csv';
type ExportScopeKind = 'selected' | 'filtered';
/** Export target wording (toolbar D, #172): one source for the menu group labels, item names and toasts. `count === null` = no usable total (no `ok` result yet). */
function exportTarget(kind: ExportScopeKind, count: number | null, lang: 'ko' | 'en'): string {
  if (lang === 'ko') return kind === 'selected' ? `선택 ${count}행` : count === null ? '필터 결과 전체' : `필터 결과 전체 ${count}행`;
  const rows = count !== null && count === 1 ? 'row' : 'rows';
  return kind === 'selected' ? `${count} selected ${rows}` : count === null ? 'all filtered rows' : `all ${count} filtered ${rows}`;
}
const FORMAT_LABEL: Record<ExportFormat, string> = { xlsx: 'Excel (.xlsx)', csv: 'CSV' };
/** Korean object particle for the export target (three wording sites keep it in lockstep): “선택 3행**을**”, “필터 결과 전체**를**”. */
const objectParticle = (target: string) => (target.endsWith('행') ? '을' : '를');
/** Menu item accessible name carries its target: "선택 3행을 Excel(.xlsx)로 내보내기" / "Export 3 selected rows as Excel (.xlsx)". */
function exportItemName(kind: ExportScopeKind, count: number | null, format: ExportFormat, lang: 'ko' | 'en'): string {
  const target = exportTarget(kind, count, lang);
  return lang === 'ko'
    ? `${target}${objectParticle(target)} ${format === 'xlsx' ? 'Excel(.xlsx)' : 'CSV'}로 내보내기`
    : `Export ${target} as ${FORMAT_LABEL[format]}`;
}
/** Shared primitive's item focus is the card background (invisible on the popover); this menu-only class makes keyboard focus visible — an inset ring is never clipped by the content's `overflow-hidden`, and it stays on top of the soft focus background. */
const exportItemClass = 'gap-2 focus:bg-accent-primary-soft focus:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

/** 조회 정보 (#173 review P2-3): id sets render as count + leading ids; the explicit empty set is shown, never folded into “all”. */
const CONTEXT_ID_LIMIT = 10;
const INFO_LABELS = {
  ko: { menu: '메뉴', target: '대상', exportedAt: '내보낸 시각', period: '기간', updatedAt: '갱신 시각', dataThrough: '데이터 기준 시각', coverage: '커버리지', metricVersion: '지표 버전', provisional: '잠정 여부', provisionalYes: '잠정', provisionalNo: '확정', source: '원천' },
  en: { menu: 'Menu', target: 'Target', exportedAt: 'Exported at', period: 'Period', updatedAt: 'Updated at', dataThrough: 'Data through', coverage: 'Coverage', metricVersion: 'Metric version', provisional: 'Provisional', provisionalYes: 'Provisional', provisionalNo: 'Final', source: 'Source' },
} as const;
// Global id sets count ids (“N개” / “N ids”), not exported rows — “행” stays for table rows (#173 review N-P3-6).
const EXPLICIT_EMPTY = { ko: '(명시적 빈 집합)', en: '(explicit empty set)' } as const;
function idSetValue(ids: string[], lang: 'ko' | 'en'): string {
  const count = lang === 'ko' ? `${ids.length}개` : `${ids.length} ${ids.length === 1 ? 'id' : 'ids'}`;
  if (ids.length === 0) return `${count} ${EXPLICIT_EMPTY[lang]}`;
  const head = ids.slice(0, CONTEXT_ID_LIMIT).join(', ');
  return ids.length > CONTEXT_ID_LIMIT ? `${count}: ${head} …` : `${count}: ${head}`;
}
const CONDITION_AXIS_LABEL = { stgroup: { ko: 'StGroup', en: 'StGroup' }, team: { ko: '분임조', en: 'Team' }, makerModel: { ko: 'Maker+Model', en: 'Maker+Model' } } as const;
/**
 * Applied global Context keys of this menu, rendered readably (the GlobalContextBar vocabulary). Limited to keys the
 * menu's manifest applies; absent keys are omitted as whole rows — never invented.
 */
function globalContextRows(global: GlobalContext, context: Record<ContextKey, Capability>, lang: 'ko' | 'en'): [string, string][] {
  const applied = (key: ContextKey) => context[key] === 'apply';
  const rows: [string, string][] = [];
  if (applied('roomNames') && global.roomNames !== null) rows.push([CONTEXT_LABELS.roomNames[lang], global.roomNames.length > 0 ? global.roomNames.join(', ') : EXPLICIT_EMPTY[lang]]);
  if (applied('condition') && global.condition !== null) rows.push([CONTEXT_LABELS.condition[lang], `${CONDITION_AXIS_LABEL[global.condition.axis][lang]}: ${conditionLabel(global.condition)}`]);
  if (applied('selection') && global.selection !== null) rows.push([CONTEXT_LABELS.selection[lang], idSetValue(global.selection, lang)]);
  if (applied('lot') && global.lotIds !== null) rows.push([CONTEXT_LABELS.lot[lang], idSetValue(global.lotIds, lang)]);
  if (applied('ppid') && global.ppid !== null) rows.push([CONTEXT_LABELS.ppid[lang], global.ppid]);
  if (applied('recipe') && global.recipeIds !== null) rows.push([CONTEXT_LABELS.recipe[lang], idSetValue(global.recipeIds, lang)]);
  if (applied('metric') && global.metricId !== null) rows.push([CONTEXT_LABELS.metric[lang], global.metricVersion !== null ? `${global.metricId} v${global.metricVersion}` : global.metricId]);
  return rows;
}

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
  /**
   * Table-owned export (#173, 06 §15): the menu only says how to read the rows to export from the server — permission/
   * Scope/limits re-checked per request. Omit to make the screen un-exportable. `sorting` is the table's active sort, so
   * the export follows the screen's order (#173 UX P2-6).
   */
  exportRows?: (request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] }, signal: AbortSignal) => Promise<ApiResponse<T[]>>;
  /** Menu note appended to the export toast (e.g. cycle-time "page filters apply; not the full KPI population"). */
  exportNote?: string;
  /**
   * Readable page filters for the XLSX "조회 정보" sheet (#173 review P2-3): `[label, value]` pairs as the screen shows
   * them. Omit a pair for an unset filter; the table adds the applied global Context keys itself.
   */
  exportFilterSummary?: readonly (readonly [string, string])[];
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
  /** Polite “준비 중” announcement next to the trigger (#173 UX P2-3); visually hidden so the toolbar width stays stable. */
  const [busyNote, setBusyNote] = useState<string | null>(null);
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

  // Table-owned export (#173): the target (selection / all filtered rows) and format come from the chosen menu item —
  // a selection never hides "all filtered". The menu only supplies the row read; outcome handling, reconciliation,
  // size guard, file and toasts live here.
  async function runExport(format: ExportFormat, kind: ExportScopeKind) {
    if (exportAbort.current) return; // busy guard (#173 review P3-3): the trigger uses aria-disabled, so re-entry is possible
    const scope = kind === 'selected' ? { kind: 'selected' as const, ids: selectedIds } : { kind: 'filtered' as const };
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(true);
    const startTarget = exportTarget(kind, kind === 'selected' ? selectedIds.length : shown?.outcome === 'ok' ? data.total : null, lang);
    const file = format === 'xlsx' ? 'Excel' : 'CSV';
    setBusyNote(lang === 'ko' ? `${startTarget}${objectParticle(startTarget)} ${file} 파일로 준비 중입니다` : `Preparing ${startTarget} as ${format === 'xlsx' ? 'an Excel' : 'a CSV'} file`);
    const cancelled = (error: unknown) => controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    try {
      const response = await p.exportRows!({ scope, sorting: activeSorting }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.outcome !== 'ok' && response.outcome !== 'empty') {
        // 06 §26 원인/행동: the refusal names a next action; an `error` carries the correlationId for support.
        // An `error` with a server message (e.g. a deterministic refusal) shows that message instead of the generic retry advice (#173 review N-P3-3).
        const correlation = response.outcome === 'error' && response.correlationId ? ` (correlationId: ${response.correlationId})` : '';
        const message = response.outcome === 'error' && response.message ? response.message : EXPORT_REFUSAL[response.outcome][lang];
        toast(message + correlation, 'warning');
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
        toast(lang === 'ko' ? `받은 행이 ${EXPORT_ROW_CAP.toLocaleString('ko-KR')}행을 넘어 파일을 만들지 않습니다. 필터를 좁혀 주세요.` : `More than ${EXPORT_ROW_CAP.toLocaleString('en-US')} rows arrived; no file was built. Narrow the filter.`, 'warning');
        return;
      }
      // Serializer (#173 review P2-1): outside the server-request try, so a column bug is not reported as a server
      // failure. Dev logs the error — it names the column that needs exportValue; production stays silent + toast.
      let headers: string[];
      let cells: (string | number)[][];
      try {
        const columns = exportColumns(p.columns, preferences);
        headers = columns.map(c => c.header);
        cells = rows.map(row => columns.map(c => exportCell(c, row)));
      } catch (error) {
        if (!isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) console.error(error);
        toast(EXPORT_REFUSAL.error[lang], 'warning');
        return;
      }
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const target = exportTarget(scope.kind, rows.length, lang);
      let blob: Blob;
      if (format === 'csv') {
        blob = new Blob([toCsv(headers, cells)], { type: 'text/csv;charset=utf-8' });
      } else {
        // "조회 정보" sheet: what was exported, from which Context, with which filters and trust. Missing values stay
        // empty — never invented. Values render like the screen: times space-separated, coverage as a percent string.
        const trust = response.trust;
        // Labels follow the UI language, like the menus' exportFilterSummary (#173 review N-P3-4). 기간/Scope are written
        // only when this menu applies them (manifest time 'apply' / requiresScope) — never a condition that did not filter (N-P2-1).
        const L = INFO_LABELS[lang];
        const menu = route?.menu;
        const info: [string, string | number][] = [
          [L.menu, menu?.id ?? ''],
          [L.target, exportTarget(scope.kind, rows.length, lang)],
          [L.exportedAt, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`],
          ...(menu?.requiresScope ? [['Scope', global.scopeId ?? ''] as [string, string]] : []),
          ...(menu?.context.time === 'apply' ? [[L.period, global.from && global.to ? `${global.from} – ${global.to}` : ''] as [string, string]] : []),
          ...(p.exportFilterSummary ?? []).map(([label, value]) => [label, value] as [string, string]),
          ...(menu ? globalContextRows(global, menu.context, lang) : []),
          [L.updatedAt, trust?.updatedAt?.replace('T', ' ') ?? ''],
          [L.dataThrough, trust?.dataThrough?.replace('T', ' ') ?? ''],
          [L.coverage, trust != null && trust.coverage !== null ? `${(trust.coverage * 100).toFixed(1)}%` : ''],
          [L.metricVersion, trust?.metricVersion ?? ''],
          [L.provisional, trust ? (trust.provisional ? L.provisionalYes : L.provisionalNo) : ''],
          [L.source, trust?.source ?? ''],
          ['Correlation ID', response.correlationId ?? ''],
        ];
        blob = await toXlsx(headers, cells, info, lang);
        if (controller.signal.aborted) return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(route?.menu.id ?? 'table').replace(/[^A-Za-z0-9._-]/g, '-')}-${stamp}${response.trust?.provisional ? '-provisional' : ''}.${format}`;
      link.click();
      // Safari/older Firefox cancel downloads whose blob URL is revoked synchronously — release after the click settles.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const done = lang === 'ko' ? `${target}${objectParticle(target)} ${file} 파일로 내보냈습니다` : `Exported ${target} to ${format === 'xlsx' ? 'an' : 'a'} ${file} file`;
      // Provisional responses (#173 review P2-2): CSV has no trust sheet, so the toast carries the data-through time —
      // never `updatedAt`; an unknown data-through is said to be unknown.
      const provisional = response.trust?.provisional
        ? (lang === 'ko'
            ? ` — 잠정 데이터(${response.trust.dataThrough ? `데이터 기준 시각 ${response.trust.dataThrough.replace('T', ' ').slice(0, 16)}` : '기준 시각 미확인'})`
            : ` — provisional data (${response.trust.dataThrough ? `data through ${response.trust.dataThrough.replace('T', ' ').slice(0, 16)}` : 'data-through unknown'})`)
        : '';
      toast(p.exportNote ? `${done}${provisional} — ${p.exportNote}` : done + provisional);
    } catch (error) {
      if (cancelled(error)) return;
      toast(EXPORT_REFUSAL.error[lang], 'warning');
    } finally {
      if (exportAbort.current === controller) { exportAbort.current = null; setExporting(false); setBusyNote(null); }
    }
  }
  const exportItems = (kind: ExportScopeKind, count: number | null) => (['xlsx', 'csv'] as const).map(format =>
    <DropdownMenuItem key={format} className={exportItemClass} disabled={exporting} aria-label={exportItemName(kind, count, format, lang)} onSelect={() => { void runExport(format, kind); }}>
      {format === 'xlsx' ? <FileSpreadsheet className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}{FORMAT_LABEL[format]}
    </DropdownMenuItem>);
  // No `ok` result yet (new Context loading, refused page): the count is unknown, so the group label says “필터 결과 전체” with no number.
  const filteredCount = shown?.outcome === 'ok' ? data.total : null;
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
        {/* Toolbar D (#172): fixed order [컬럼] [복사] [내보내기 ▾]. The [복사] button (#174) goes here, between the two. */}
        {canExport && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* aria-disabled, not native disabled (#173 UX P2-2): the trigger stays focusable so Radix can return
                focus here after an item runs. The keyboard can still open the menu while busy, so its items are disabled
                then (#173 review N-P3-1); runExport also guards re-entry. The polite status is announced separately. */}
            <Button variant="secondary" size="sm" className="h-8 gap-1.5 rounded-sm border-border-strong aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-disabled={exporting || undefined} aria-busy={exporting || undefined}>
              <Download className="size-3.5" aria-hidden />{t('export')}
              {exporting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          {/* DESIGN.md: no drop shadows — this menu only; the shared primitive keeps its look for other menus. */}
          <DropdownMenuContent align="end" className="min-w-56 border border-border-strong shadow-none">
            {selectedIds.length > 0 && <>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="t-caption tabular text-text-muted">{exportTarget('selected', selectedIds.length, lang)}</DropdownMenuLabel>
                {exportItems('selected', selectedIds.length)}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="t-caption tabular text-text-muted">{exportTarget('filtered', filteredCount, lang)}</DropdownMenuLabel>
              {exportItems('filtered', filteredCount)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        {/* Visually hidden (width-stable) so screen readers hear what the export is preparing (#173 UX P2-3). */}
        {/* Always mounted while export is available; only the text changes, so screen readers announce it (#173 review N-P3-2). */}
        {canExport && <span role="status" className="sr-only" data-testid="export-status">{busyNote ?? ''}</span>}
      </div>
    </div>

    {selectedIds.length > 0 && <div className="flex min-h-10 flex-wrap items-center gap-3 border-t border-border-subtle bg-accent-primary-soft px-3 py-2 text-[12px]">
      <span className="font-semibold tabular" data-testid="selected-count">{lang === 'ko' ? `${selectedIds.length}행 선택` : `${selectedIds.length} selected`}</span>
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
