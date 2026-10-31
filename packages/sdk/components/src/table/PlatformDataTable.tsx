import { useCompactPageDensity } from '../pageDensity';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useId, type CSSProperties, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type Column, type ColumnDef, type ColumnPinningState, type Header, type RowSelectionState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, Copy, Download, FileSpreadsheet, FileText, Loader2, Pin, PinOff } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import type { ApiResponse, Capability, ContextKey, PageQuery, PageResult, PageSort } from '@ap/contracts';
import { Button, Checkbox, cn, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Label, Popover, PopoverContent, PopoverTrigger, shortcutLabel, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { AnalysisSectionContext } from '../archetypes/AnalysisSectionContext';
import { toColumnDef } from './columnDef';
import { DataTrustIndicator } from '../state/DataTrustIndicator';
import { useElementWidth } from '../state/useElementWidth';
import { OutcomeContent } from '../StateView';
import { useSharedOutcome } from '../filters/OutcomeScope';
import { SCROLLPORT_LABEL } from '../scrollportLabel';
import { useEmbeddedChrome, useInWorkspacePanel } from '../workspace/panelContext';
import { ACTION_PIN_MIN_SCROLL, ROW_AREA_FALLBACK, useTableFit } from './tableFit';
import { exportItemName, exportTarget, FORMAT_LABEL, type ExportScopeKind } from './tableMessages';
import { useColumnPreferences } from './useColumnPreferences';
import { usePagedRows } from './usePagedRows';
import { useTableTransfer } from './useTableTransfer';

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
/** The trust button's own inline padding (px-2 × 2) and the status line's flex gap (gap-x-2): the probe measures content only. */
const TRUST_BUTTON_PADDING = 16;
const STATUS_GAP = 8;
const ACTION_COLUMN_WIDTH = 128;
/** Icon-only action column: two 32px icon buttons and a 4px gap fit with `px-0`. */
const COMPACT_ACTION_WIDTH = 72;
const DEFAULT_COLUMN_WIDTH = 150;
/** Keyboard focus ring only (ADR-0023): the feature-ui item focus tint is not distinguishable on the popover surface, so the menu keeps an inset ring — never clipped by the content's `overflow-hidden`, and it stays on top of the shared focus background. */
const exportItemClass = 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';
export type TableUrlState = {
  /** 1-based; null = default page 1 (key omitted). */
  page: number | null;
  /** What the header shows; empty = unsorted. */
  sorting: PageSort[];
  /** User sort/page gestures, and `clamp` when a successful response is past the last page (#314). The page owns the URL keys and its own resets (§6.1). */
  onChange: (next: { page: number | null; sorting: PageSort[] }, reason: 'user' | 'reset' | 'clamp') => void;
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
  rowAction?: (row: T, context: { compact: boolean }) => ReactNode;
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
  /**
   * The export endpoint's Context declaration (`endpoint.context`, #173 review R-P2-1). The 조회 정보 sheet lists only the
   * global keys — and 기간 — this declaration applies; without it the menu manifest's applied keys are used. Pass it
   * whenever the export endpoint applies fewer keys than the menu (e.g. a catalog whose manifest applies `metric` for
   * another endpoint).
   */
  exportContext?: Readonly<Partial<Record<ContextKey, Capability>>>;
  activeRowId?: string | null;
  preferenceKey: string;
  pageSize?: number;
  /** Maximum row-area height; default fits the page (content height, up to the room left on the page, never under 240px). */
  height?: number;
  emptyAction?: ReactNode;
  /** Controlled sort/page (§6.1 page keys). Omit to keep today's internal state. The table never knows URL key names. */
  urlState?: TableUrlState;
};

/** §15: platform owns interaction, loading/error, column preference, selection model, toolbar layout; domain owns columns/cells/actions/filters. */
export function PlatformDataTable<T>(p: PlatformDataTableProps<T>) {
  const { t, lang } = useI18n();
  const analysisSection = useContext(AnalysisSectionContext);
  const inPanel = useInWorkspacePanel();
  const densePage = useCompactPageDensity();
  const embedded = useEmbeddedChrome();
  const { route } = usePlatform();
  const { screenMode } = useHostPlatform();
  // §15: a workspace panel or board pane body scrolls too, so the row area chains the wheel outward at its edge; flow pages and drawers contain it.
  const chainWheel = inPanel || screenMode === 'pane';
  // Registry declares export capability (§5); the table never offers Export on a menu that did not declare it.
  const canExport = !!p.exportRows && !!route?.menu.features.export;
  // Selection exists only for features that read it (export/copy, bulk actions); ADR-0037.
  const selectable = canExport || !!p.bulkActions;
  const pageSize = p.pageSize ?? 100;
  const { preferences, onColumnSizingChange, onColumnVisibilityChange, onColumnPinningChange, resetPreferences } = useColumnPreferences(p.preferenceKey);
  const [sorting, setSorting] = useState<PageSort[]>([]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const effectiveSelection = selectable ? selection : {};
  useEffect(() => {
    if (!selectable) setSelection(previous => Object.keys(previous).length ? {} : previous);
  }, [selectable]);
  const [copyTip, setCopyTip] = useState(false);
  /** Column popover / export menu open: the Ctrl/⌘+C shortcut stays native while either is open. */
  const [overlayOpen, setOverlayOpen] = useState({ columns: false, export: false });
  const viewport = useRef<HTMLDivElement | null>(null);
  const section = useRef<HTMLElement>(null);
  const fit = useTableFit(section);
  // The status line drops to a one-line trust summary only when the full line does not fit: the available inline space (the status line
  // minus the result count, the refreshing label and their gaps) is compared with a hidden probe of the full content. The probe is
  // measured independently of what is shown, so the choice cannot feed back into its own input.
  const statusLine = useElementWidth();
  const countSpan = useElementWidth();
  const refreshSpan = useElementWidth();
  const probe = useElementWidth();
  const statusNarrow = statusLine.width !== null && statusLine.width > 0 && probe.width !== null && probe.width > 0
    && probe.width + TRUST_BUTTON_PADDING + (countSpan.width ? countSpan.width + STATUS_GAP : 0) + (refreshSpan.width ? refreshSpan.width + STATUS_GAP : 0) > statusLine.width;
  // Right-pinned column fade: only while the row area overflows horizontally and is not scrolled to its end.
  const [fade, setFade] = useState({ left: false, right: false });
  const updateFade = useCallback(() => {
    const node = viewport.current;
    const next = { left: !!node && node.scrollLeft > 1, right: !!node && node.scrollWidth - node.clientWidth - node.scrollLeft > 1 };
    setFade(prev => prev.left === next.left && prev.right === next.right ? prev : next);
  }, []);
  const bindViewport = fit.viewportRef;
  const viewportRef = useCallback((node: HTMLDivElement | null) => { viewport.current = node; bindViewport(node); }, [bindViewport]);
  useLayoutEffect(updateFade);
  const outcome = useRef<HTMLDivElement>(null);
  const previousButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusedPager = useRef<'previous' | 'next' | null>(null);
  /** The "다시 시도" button owned focus (outcome container onFocus/onBlur, recorded before any mutation):
   * consumed by the settle effect to hand focus onward when the response removes or keeps the button (#338 UX fold). */
  const focusedRetry = useRef(false);
  // urlState (§6.1): controlled sort/page. The page writes the URL via onChange; the table never touches keys.
  const activeSorting = p.urlState ? p.urlState.sorting : sorting;
  const { setPage, retry, effectivePage, shown, shownPage, loading, data, pageCount, success, outOfRange } = usePagedRows<T>({
    loadPage: p.loadPage, filterKey: p.filterKey, urlState: p.urlState, pageSize, activeSorting, viewport,
    // Selection never survives a Context change; an in-flight export/copy belongs to the old result set.
    onContextChange: () => { setSelection({}); abortTransfers(); },
  });
  // The table's result joins the page's OutcomeScope like a QueryView does; the toolbar <h2> already names it, so the grouped state hides the name line (§306).
  const groupedOutcome = useSharedOutcome(shown, retry, p.ariaLabel, loading ? (shown ? 'refreshing' : 'loading') : 'done');
  const selectedIds = Object.keys(effectiveSelection).filter(k => effectiveSelection[k]);
  const { exporting, copying, exportNote, copyNote, runExport, runCopy, onShortcut, abortTransfers } = useTableTransfer<T>({
    columns: p.columns, getRowId: p.getRowId, exportRows: p.exportRows, menuNote: p.exportNote, exportFilterSummary: p.exportFilterSummary, exportContext: p.exportContext,
    canExport, selectedIds, selection, loadedRows: data.rows, total: data.total, resultOk: shown?.outcome === 'ok', activeSorting, preferences, overlayOpen,
  });

  const columnPrefsId = useId();
  // ADR-0037: the action column is pinned right whenever the scrollport keeps room beside the user's left pins; narrower
  // it scrolls with the rest so pinned regions never overlap. Never user-pinnable, never stored (`_action` stays out of preferences).
  const leftPinnedWidth = (preferences.pinning.left ?? []).reduce((sum, id) => preferences.visibility[id] === false ? sum : sum + (preferences.sizing[id] ?? p.columns.find(c => c.id === id)?.size ?? DEFAULT_COLUMN_WIDTH), 0);
  // When only the compact (72px, icon-only) form fits beside the left pins it stays pinned; narrower still it unpins in the normal form.
  const fitsFull = fit.width === null || fit.width === 0 || fit.width >= leftPinnedWidth + ACTION_COLUMN_WIDTH + ACTION_PIN_MIN_SCROLL;
  const actionCompact = !!p.rowAction && !fitsFull && fit.width !== null && fit.width >= leftPinnedWidth + COMPACT_ACTION_WIDTH + ACTION_PIN_MIN_SCROLL;
  const actionPinned = !!p.rowAction && (fitsFull || actionCompact);
  const actionWidth = actionCompact ? COMPACT_ACTION_WIDTH : ACTION_COLUMN_WIDTH;
  const pinningState: ColumnPinningState = { left: preferences.pinning.left ?? [], right: actionPinned ? ['_action'] : [] };
  // The data and selection definitions do not depend on the action width: a band crossing must keep their cell functions (and the DOM they render).
  const baseColumns = useMemo<ColumnDef<T>[]>(() => [
    ...(selectable ? [{
      id: '_select', size: 40, enableSorting: false, enableHiding: false, enableResizing: false,
      header: ({ table }) => <Checkbox aria-label={lang === 'ko' ? '현재 페이지 전체 선택' : 'Select all rows on this page'}
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={v => table.toggleAllPageRowsSelected(v === true)} className="size-3.5 border-border-control" />,
      cell: ({ row }) => <Checkbox aria-label={`${lang === 'ko' ? '선택' : 'Select'} ${row.id}`} checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(v === true)} className="size-3.5 border-border-control" />,
    } as ColumnDef<T>] : []),
    ...p.columns.map(toColumnDef),
  ], [p.columns, lang, selectable]);
  const hasAction = !!p.rowAction;
  const allColumns = useMemo<ColumnDef<T>[]>(() => [
    ...baseColumns,
    ...(hasAction ? [{ id: '_action', size: actionWidth, enableSorting: false, enableHiding: false, enableResizing: false, header: lang === 'ko' ? '동작' : 'Actions' } as ColumnDef<T>] : []),
  ], [baseColumns, hasAction, lang, actionWidth]);

  // Gesture-scoped (see startResize): the rendered widths of the columns being dragged and the pointer's travel since mousedown.
  const resizeGesture = useRef<{ rendered: Record<string, number>; total: number; startX: number; deltaX: number } | null>(null);
  const sizingChange: typeof onColumnSizingChange = u => {
    const gesture = resizeGesture.current;
    onColumnSizingChange(old => {
      const next = typeof u === 'function' ? u(old) : u;
      if (!gesture) return next;
      // The engine's own value starts from the base size and floors a shrink near zero; the dragged columns are recomputed from what is rendered.
      const ratio = Math.max(gesture.deltaX / gesture.total, -0.999999);
      return Object.fromEntries(Object.entries(next).map(([id, size]) => [id, id in gesture.rendered ? Math.min(600, Math.max(60, Math.round(gesture.rendered[id] * (1 + ratio) * 100) / 100)) : size]));
    });
  };
  const table = useReactTable({
    data: data.rows, columns: allColumns, getRowId: p.getRowId, getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true, enableRowSelection: selectable, columnResizeMode: 'onChange',
    enableMultiSort: !p.urlState,
    defaultColumn: { size: DEFAULT_COLUMN_WIDTH, minSize: 60, maxSize: 600 },
    state: { sorting: activeSorting, rowSelection: effectiveSelection, columnSizing: preferences.sizing, columnVisibility: preferences.visibility, columnPinning: pinningState },
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
    onColumnSizingChange: sizingChange, onColumnVisibilityChange, onColumnPinningChange: onColumnPinningChange(actionPinned),
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => viewport.current, estimateSize: () => 32, overscan: 8, getItemKey: i => rows[i].id });
  // #338 UX fold: while loading the failure is not decided yet — a Context/identity change empties `shown`
  // before the response settles, and a native disable would then drop a focused button (its blur clears the
  // ownership refs, so the settle move could not recover). `aria-disabled` already marks the group busy.
  // Boundary targets come from `effectivePage` alone: during a Context change `shownPage` collapses to it
  // (이전 from page 2 → page 0 request in flight), which would natively disable the focused button mid-flight.
  const previousDisabled = !loading && (!success || effectivePage === 0);
  const nextDisabled = !loading && (!success || effectivePage + 1 >= pageCount);
  useLayoutEffect(() => {
    if (loading) return;
    // Retry-button ownership (recorded by the outcome container's onFocus/onBlur before any mutation): when
    // the settled response removed the button, focus follows where it went — ok → row viewport; still
    // retryable → the button itself (a no-op while it kept focus, restores it if the remount dropped it);
    // otherwise (forbidden·too_large·empty — a successful empty renders the OutcomeView, no viewport) →
    // the section. A user blur before the settle cleared the ref,
    // so nothing is stolen from a focus that moved away.
    if (focusedRetry.current) {
      if (success && shown?.outcome === 'ok') { focusedRetry.current = false; viewport.current?.focus(); return; }
      if (shown?.outcome === 'error' || shown?.outcome === 'timeout') { outcome.current?.querySelector('button')?.focus(); return; }
      focusedRetry.current = false;
      section.current?.focus();
      return;
    }
    // Focus/blur events record ownership before the mutation phase can disable the button.
    // Do not infer ownership from activeElement here: native disabled may already have cleared it.
    const owned = focusedPager.current;
    if (!owned || !(owned === 'previous' ? previousDisabled : nextDisabled)) return;
    focusedPager.current = null;
    const opposite = owned === 'previous' ? nextButton.current : previousButton.current;
    const retryButton = shown?.outcome === 'error' || shown?.outcome === 'timeout'
      ? outcome.current?.querySelector('button') : null;
    const target = opposite && !opposite.disabled ? opposite : retryButton ?? section.current;
    target?.focus();
  }, [loading, previousDisabled, nextDisabled, shown, success]);

  // Fill (#1166): a table narrower than its scrollport hands the leftover width to the columns nobody fixed — not the checkbox/action
  // columns, not left-pinned columns (their offsets are sums of widths) and not columns the user resized. Proportional to base width;
  // once the columns outgrow the scrollport the extra is 0 and the row area scrolls horizontally as before.
  const baseTotal = table.getTotalSize();
  const flexIds = new Set(table.getVisibleLeafColumns().filter(c => c.id !== '_select' && c.id !== '_action' && !c.getIsPinned() && preferences.sizing[c.id] === undefined).map(c => c.id));
  const flexBase = table.getVisibleLeafColumns().reduce((sum, c) => flexIds.has(c.id) ? sum + c.getSize() : sum, 0);
  const extra = fit.width !== null && flexBase > 0 ? Math.max(0, fit.width - baseTotal) : 0;
  // Floored shares leave a remainder of at most one pixel per column; the last grown column takes it so the cells sum to the scrollport.
  const flexList = table.getVisibleLeafColumns().filter(c => flexIds.has(c.id));
  const shares = new Map(flexList.map(c => [c.id, extra > 0 ? Math.floor(extra * c.getSize() / flexBase) : 0]));
  if (flexList.length > 0 && extra > 0) { const last = flexList[flexList.length - 1].id; shares.set(last, (shares.get(last) ?? 0) + extra - [...shares.values()].reduce((a, b) => a + b, 0)); }
  const widthOf = (column: Column<T>) => column.getSize() + (shares.get(column.id) ?? 0);
  const tableWidth = baseTotal + (extra > 0 ? extra : 0);
  // A resize drag is computed from the rendered width plus the pointer's travel, not from the engine's base size (which is narrower for a
  // fill-grown column and floors a large shrink); the result is clamped to 60–600. Gesture-scoped; automatic fill widths are never stored.
  const startResize = (h: Header<T, unknown>) => (event: React.MouseEvent | React.TouchEvent) => {
    const rendered = Object.fromEntries(h.getLeafHeaders().map(l => [l.column.id, widthOf(l.column)]));
    const startX = 'touches' in event ? Math.round(event.touches[0]?.clientX ?? 0) : event.clientX;
    const gesture = { rendered, total: Object.values(rendered).reduce((a, b) => a + b, 0), startX, deltaX: 0 };
    resizeGesture.current = gesture;
    // Registered before the engine's own listeners, so the travel is current when the engine reports.
    const onMouse = (e: MouseEvent) => { gesture.deltaX = e.clientX - startX; };
    const onTouch = (e: TouchEvent) => { const x = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX; if (x !== undefined) gesture.deltaX = Math.round(x) - startX; };
    const clear = () => {
      for (const type of ['mousemove', 'mouseup'] as const) document.removeEventListener(type, onMouse);
      for (const type of ['touchmove', 'touchend'] as const) document.removeEventListener(type, onTouch);
      setTimeout(() => { if (resizeGesture.current === gesture) resizeGesture.current = null; }, 0);
    };
    document.addEventListener('mousemove', onMouse);
    document.addEventListener('mouseup', onMouse);
    document.addEventListener('touchmove', onTouch);
    document.addEventListener('touchend', onTouch);
    document.addEventListener('mouseup', clear, { once: true });
    document.addEventListener('touchend', clear, { once: true });
    h.getResizeHandler()(event);
  };
  function cellStyle(column: Column<T>): CSSProperties {
    const pinned = column.getIsPinned();
    return { width: widthOf(column), flexShrink: 0, position: pinned ? 'sticky' : 'relative', left: pinned === 'left' ? column.getStart('left') : undefined, right: pinned === 'right' ? column.getAfter('right') : undefined, zIndex: pinned ? 2 : undefined };
  }
  const align = (column: Column<T>) => ((column.columnDef.meta as ColumnMeta | undefined)?.align === 'right' ? 'justify-end text-right tabular' : '');
  const headerBase = 'flex min-h-8 items-center overflow-hidden whitespace-nowrap px-4 py-1 pointer-coarse:min-h-11';
  const cellBase = cn(headerBase, 'overflow-visible whitespace-normal [overflow-wrap:anywhere]');
  /** The right-pinned action column keeps a visible edge while content scrolls beneath it (a border token; DESIGN.md allows no shadow). */
  const pinEdge = 'border-l border-l-border-control';
  /** A pinned cell fades the column scrolling beneath its inner edge (a pseudo-element of the cell itself, no pointer events), so a half-clipped column never reads as cut text. */
  const fadeBase = 'before:pointer-events-none before:absolute before:inset-y-0 before:w-5 before:from-transparent before:content-[""]';
  const fadeClass = (side: 'left' | 'right' | false | null, body: boolean, active = false) => !side || !(side === 'right' ? fade.right : fade.left) ? undefined
    : cn(fadeBase, 'overflow-visible', side === 'right' ? 'before:right-full before:bg-linear-to-r' : 'before:left-full before:bg-linear-to-l',
      body ? cn(active ? 'before:to-surface-row-selected' : 'before:to-surface-card', 'group-hover:before:to-surface-row-hover group-aria-selected:before:to-surface-row-selected') : 'before:to-surface-sunken');
  const nameOf = (c: Column<T>) => (c.columnDef.meta as ColumnMeta | undefined)?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id);
  // #239 (ADR-0024): the Columns popover lists each hideable column with a visibility checkbox and a pin toggle at the
  // row end; pinned columns sit in their own group on top. Width is set by dragging the header edge only.
  const hideableColumns = table.getAllLeafColumns().filter(c => c.getCanHide());
  // A pin toggle moves its row between the groups, which remounts the button; give focus back to the same column's toggle.
  const refocusPin = useRef<string | null>(null);
  useEffect(() => {
    if (refocusPin.current === null) return;
    document.getElementById(`${columnPrefsId}-${refocusPin.current}-pin`)?.focus();
    refocusPin.current = null;
  });
  function columnPrefRow(c: Column<T>) {
    const pinned = c.getIsPinned() === 'left';
    return <li key={c.id} className="flex items-center gap-2">
      <Checkbox id={`${columnPrefsId}-${c.id}-visible`} checked={c.getIsVisible()} onCheckedChange={v => c.toggleVisibility(v === true)} className="size-3.5 border-border-control" />
      <div className="min-w-0 flex-1"><Label htmlFor={`${columnPrefsId}-${c.id}-visible`}>{nameOf(c)}</Label></div>
      <Button id={`${columnPrefsId}-${c.id}-pin`} type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-pressed={pinned} aria-label={`${nameOf(c)} ${lang === 'ko' ? '왼쪽 고정' : 'pin left'}`} disabled={!c.getCanPin()} onClick={() => { refocusPin.current = c.id; c.pin(pinned ? false : 'left'); }}>
        {pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
      </Button>
    </li>;
  }
  const pinnedPrefs = hideableColumns.filter(c => c.getIsPinned() === 'left');
  const otherPrefs = hideableColumns.filter(c => c.getIsPinned() !== 'left');
  const exportItems = (kind: ExportScopeKind, count: number | null) => (['xlsx', 'csv'] as const).map(format =>
    <DropdownMenuItem key={format} className={exportItemClass} disabled={exporting} aria-label={exportItemName(kind, count, format, lang)} onSelect={() => { void runExport(format, kind); }}>
      {format === 'xlsx' ? <FileSpreadsheet className="mr-2 size-3.5" aria-hidden /> : <FileText className="mr-2 size-3.5" aria-hidden />}{FORMAT_LABEL[format]}
    </DropdownMenuItem>);
  // No `ok` result yet (new Context loading, refused page): the count is unknown, so the group label says “필터 결과 전체” with no number.
  const filteredCount = shown?.outcome === 'ok' ? data.total : null;
  return <section ref={section} tabIndex={-1} aria-label={p.ariaLabel} onKeyDown={onShortcut} className={cn('flex flex-col rounded-lg border border-border-subtle bg-surface-card', embedded && 'rounded-none border-0 shadow-none')}>
    <div className={cn('flex flex-wrap items-center justify-between gap-2', densePage ? 'min-h-10 px-2 py-1.5' : 'min-h-11 p-3', analysisSection && 'pr-12')}>
      <div className="min-w-0">
        <h2 className={cn('t-card-title', inPanel && 'sr-only')}>{p.title}</h2>
        {p.subtitle && <p className="text-xs text-text-muted">{p.subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.filters}
        <Popover onOpenChange={open => setOverlayOpen(o => ({ ...o, columns: open }))}>
          <PopoverTrigger asChild><Button variant="secondary" size="toolbar"><Columns3 className="size-3.5" aria-hidden />{lang === 'ko' ? '컬럼' : 'Columns'}</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="t-card-title mb-2">{lang === 'ko' ? '컬럼 설정 (브라우저에 저장)' : 'Column preferences (saved locally)'}</p>
            <div className="space-y-3">
              {pinnedPrefs.length > 0 && <div>
                <p className="mb-1 text-xs text-text-secondary">{lang === 'ko' ? '고정됨' : 'Pinned'}</p>
                <ul className="space-y-2">{pinnedPrefs.map(columnPrefRow)}</ul>
              </div>}
              {otherPrefs.length > 0 && <div>
                {pinnedPrefs.length > 0 && <p className="mb-1 text-xs text-text-secondary">{lang === 'ko' ? '나머지' : 'Other'}</p>}
                <ul className="space-y-2">{otherPrefs.map(columnPrefRow)}</ul>
              </div>}
            </div>
            {/* Visibility, width and pin back to the column defaults; sort, page and selection stay. */}
            <div className="mt-3"><Button type="button" variant="secondary" size="toolbar" onClick={resetPreferences}>{lang === 'ko' ? '기본값으로' : 'Reset to default'}</Button></div>
          </PopoverContent>
        </Popover>
        {/* Toolbar D (#172): fixed order [컬럼] [복사] [내보내기 ▾]. */}
        {canExport && <TooltipProvider delayDuration={200}>
          {/* No selection: aria-disabled (focusable, not native disabled) so the tooltip says why on hover and keyboard focus. */}
          {/* Enabled: the tooltip and aria-keyshortcuts name the shortcut and where it works (UX P3-1). */}
          <Tooltip open={copyTip} onOpenChange={setCopyTip}>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="toolbar" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                aria-disabled={selectedIds.length === 0 || copying || undefined} aria-busy={copying || undefined}
                aria-keyshortcuts={selectedIds.length > 0 ? 'Control+C Meta+C' : undefined}
                onClick={runCopy}>
                {copying ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {selectedIds.length === 0 ? (lang === 'ko' ? '복사' : 'Copy') : lang === 'ko' ? `${selectedIds.length}행 복사` : `Copy ${selectedIds.length} ${selectedIds.length === 1 ? 'row' : 'rows'}`}
              </Button>
            </TooltipTrigger>
            <TooltipContent size="sm">{selectedIds.length === 0
              ? (lang === 'ko' ? '행을 선택하면 복사할 수 있습니다' : 'Select rows to copy')
              : (lang === 'ko' ? `${shortcutLabel('C')}로도 복사할 수 있습니다(표 안에서)` : `You can also copy with ${shortcutLabel('C')} (inside the table)`)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>}
        {canExport && <DropdownMenu onOpenChange={open => setOverlayOpen(o => ({ ...o, export: open }))}>
          <DropdownMenuTrigger asChild>
            {/* aria-disabled, not native disabled (#173 UX P2-2): the trigger stays focusable so Radix can return
                focus here after an item runs. The keyboard can still open the menu while busy, so its items are disabled
                then (#173 review N-P3-1); runExport also guards re-entry. The polite status is announced separately. */}
            <Button variant="secondary" size="toolbar" className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-disabled={exporting || undefined} aria-busy={exporting || undefined}>
              <Download className="size-3.5" aria-hidden />{t('export')}
              {exporting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {selectedIds.length > 0 && <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>{exportTarget('selected', selectedIds.length, lang)}</DropdownMenuLabel>
                {exportItems('selected', selectedIds.length)}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{exportTarget('filtered', filteredCount, lang)}</DropdownMenuLabel>
              {exportItems('filtered', filteredCount)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        {/* Visually hidden (width-stable) so screen readers hear what the export is preparing (#173 UX P2-3). */}
        {/* Always mounted while export is available; only the text changes, so screen readers announce it (#173 review N-P3-2). */}
        {canExport && <span role="status" className="sr-only" data-testid="export-status">{[exportNote, copyNote].filter(Boolean).join(' · ')}</span>}
      </div>
    </div>

    {selectedIds.length > 0 && <div className="flex min-h-10 flex-wrap items-center gap-3 border-t border-border-subtle bg-accent-primary-soft px-3 py-2 text-xs">
      <span className="font-semibold tabular" data-testid="selected-count">{lang === 'ko' ? `${selectedIds.length}행 선택` : `${selectedIds.length} selected`}</span>
      {p.bulkActions?.(selectedIds)}
      <Button variant="ghost" size="toolbar" onClick={() => setSelection({})}>{lang === 'ko' ? '선택 해제' : 'Clear selection'}</Button>
      <span className="text-text-secondary">{lang === 'ko' ? '선택은 현재 조회 결과 안에서만 유지되며 Context 변경 시 해제됩니다.' : 'Selection is kept within this result and cleared on context change.'}</span>
    </div>}

    <div ref={statusLine.ref} data-table-status-line className="relative flex min-h-7 min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border-subtle px-3 py-1 text-xs text-text-muted" aria-live="polite">
      <span ref={countSpan.ref} className="tabular whitespace-nowrap">{!shown || (loading && outOfRange) ? t('loading')
        : !success ? '—'
        : outOfRange
          ? (lang === 'ko' ? `${data.total.toLocaleString()}건 · ${pageCount}페이지` : `${data.total.toLocaleString()} results · ${pageCount} pages`)
          : (lang === 'ko' ? `${data.total.toLocaleString()}건 · ${shownPage + 1}/${pageCount} 페이지` : `${data.total.toLocaleString()} results · page ${shownPage + 1}/${pageCount}`)}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {loading && shown && <span ref={refreshSpan.ref} role="status" className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden />{t('refreshing')}</span>}
        {shown && <DataTrustIndicator trust={shown.trust} assessments={shown.assessments} className="min-h-6" wrap summary={statusNarrow} />}
        {shown && <DataTrustIndicator trust={shown.trust} assessments={shown.assessments} probe={probe.ref} />}
      </span>
    </div>

    {shown && shown.outcome !== 'ok' ? <div ref={outcome} onFocus={() => { focusedRetry.current = true; }} onBlur={() => { focusedRetry.current = false; }} className="border-t border-border-subtle p-3"><OutcomeContent response={shown} onRetry={retry} emptyAction={p.emptyAction} grouped={groupedOutcome} compact={groupedOutcome || undefined} widgetName={p.ariaLabel} hideWidgetName>{() => null}</OutcomeContent></div> :
      // eslint-disable-next-line shadcn/no-inline-styles -- viewport max height comes from the height prop or the measured page fit at runtime
      <div ref={viewportRef} data-table-auto-fit={p.height === undefined ? '' : undefined} tabIndex={0} aria-label={SCROLLPORT_LABEL[lang]} className={cn('overflow-auto border-t border-border-subtle [overflow-anchor:none]', chainWheel ? 'overscroll-auto' : 'overscroll-contain')} onScroll={updateFade} style={{ maxHeight: p.height ?? fit.cap ?? ROW_AREA_FALLBACK }}>
        {/* eslint-disable-next-line shadcn/no-inline-styles -- table width is the total column size computed at runtime */}
        <div role="table" aria-label={p.ariaLabel} aria-rowcount={data.total + 1} aria-busy={loading} className="min-w-full" style={{ width: tableWidth }}>
          <div role="rowgroup" className="sticky top-0 z-[5]">
            <div role="row" className="flex">{table.getHeaderGroups()[0].headers.map(h => {
              const sorted = h.column.getIsSorted();
              // eslint-disable-next-line shadcn/no-inline-styles -- column width and pin offset come from column sizing at runtime
              return <div role="columnheader" key={h.id} data-column={h.column.id} style={cellStyle(h.column)} title={typeof h.column.columnDef.header === 'string' ? h.column.columnDef.header : undefined}
                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : h.column.getCanSort() ? 'none' : undefined}
                className={cn(headerBase, 't-table-header border-b border-border-subtle bg-surface-sunken text-text-secondary', h.column.getIsPinned() === 'right' && pinEdge, fadeClass(h.column.getIsPinned(), false), align(h.column))}>
                {h.column.getCanSort()
                  ? <button type="button" onClick={h.column.getToggleSortingHandler()} className="-mx-1 inline-flex min-w-0 items-center gap-1 rounded-xs px-1 uppercase hover:text-text-primary">
                      <span className="min-w-0 truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      {sorted === 'asc' ? <ArrowUp className="size-3 shrink-0" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3 shrink-0" aria-hidden /> : <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />}
                    </button>
                  : <span className="min-w-0 truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>}
                {/* #239: an always-visible 1px divider with an 8px grab area; double-click restores the default width. */}
                {h.column.getCanResize() && <div aria-hidden data-column-resizer onMouseDown={startResize(h)} onTouchStart={startResize(h)} onDoubleClick={event => { event.preventDefault(); h.column.resetSize(); }} className="group/resize absolute right-0 top-0 flex h-full w-2 cursor-col-resize touch-none justify-end">
                  <span className={cn('h-full w-px', h.column.getIsResizing() ? 'bg-accent-primary' : 'bg-border-subtle group-hover/resize:bg-accent-primary')} />
                </div>}
              </div>;
            })}</div>
          </div>
          {!shown ? <div className="space-y-2 p-3" aria-hidden>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div> :
            // eslint-disable-next-line shadcn/no-inline-styles -- total row height comes from the virtualizer at runtime
            <div role="rowgroup" className="relative" style={{ height: virtual.getTotalSize() }}>{virtual.getVirtualItems().map(item => {
              const row = rows[item.index];
              const active = p.activeRowId === row.id;
              // Weight goes to the first cell with content — the selection checkbox and the trailing action stay unweighted (UXA-5).
              const cells = row.getVisibleCells();
              const firstDataCell = cells.findIndex(cell => cell.column.id !== '_select' && cell.column.id !== '_action');
              return <div role="row" key={row.id} ref={virtual.measureElement} data-index={item.index} aria-rowindex={shownPage * pageSize + item.index + 2}
                aria-selected={row.getIsSelected()} aria-current={active ? 'true' : undefined} data-row-id={row.id}
                // eslint-disable-next-line shadcn/no-inline-styles -- row offset is the virtual item position computed at runtime
                className="group absolute left-0 top-0 flex w-full" style={{ transform: `translateY(${item.start}px)` }}>
                {/* The active bar rides a zero-width element pinned to the scrollport's left edge, so it stays visible at
                    any horizontal scroll — the same sticky mechanism as the fixed columns (zIndex 2) beside it (UXA-5). */}
                {active && <div aria-hidden data-active-row-marker className="sticky left-0 z-[3] w-0">
                  <span aria-hidden className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-accent-primary" />
                </div>}
                {/* eslint-disable-next-line shadcn/no-inline-styles -- cell width and pin offset come from column sizing at runtime */}
                {cells.map((cell, cellIndex) => <div role="cell" key={cell.id} data-column={cell.column.id} style={cellStyle(cell.column)}
                  className={cn(cellBase, 'border-b border-border-subtle bg-surface-card text-sm group-hover:bg-surface-row-hover group-aria-selected:bg-surface-row-selected', active && 'bg-surface-row-selected', active && cellIndex === firstDataCell && 'font-medium', cell.column.id === '_action' && (actionCompact ? 'py-0 px-0' : 'py-0'), cell.column.getIsPinned() === 'right' && pinEdge, fadeClass(cell.column.getIsPinned(), true, active), align(cell.column))}>
                  {/* The _action column cell is not used — rowAction renders directly to preserve DOM identity (#296). */}
                  {cell.column.id === '_action' ? p.rowAction?.(row.original, { compact: actionCompact }) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>)}
              </div>;
            })}</div>}
        </div>
      </div>}

    <div className="flex items-center justify-end gap-2 border-t border-border-subtle p-2">
      <Button ref={previousButton} variant="secondary" size="toolbar" disabled={previousDisabled}
        aria-disabled={loading || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onFocus={() => { focusedPager.current = 'previous'; }} onBlur={() => { focusedPager.current = null; }}
        onClick={() => {
          if (loading) return;
          // zero-based target; controlled mode reports 1-based with null = page 1 (§6.1).
          if (p.urlState) p.urlState.onChange({ sorting: p.urlState.sorting, page: effectivePage === 1 ? null : effectivePage }, 'user');
          else setPage(effectivePage - 1);
          if (viewport.current) viewport.current.scrollTop = 0;
        }}>{lang === 'ko' ? '이전' : 'Previous'}</Button>
      <Button ref={nextButton} variant="secondary" size="toolbar" disabled={nextDisabled}
        aria-disabled={loading || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onFocus={() => { focusedPager.current = 'next'; }} onBlur={() => { focusedPager.current = null; }}
        onClick={() => {
          if (loading) return;
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
