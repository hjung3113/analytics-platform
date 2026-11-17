import { useCompactPageDensity } from '../pageDensity';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useId, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type Column, type ColumnDef, type ColumnPinningState, type Header } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Columns3, Copy, Download, FileSpreadsheet, FileText, GripVertical, Loader2, Pin, PinOff } from 'lucide-react';
import { useEndpointRefreshEpoch, useI18n, useMessages, usePlatform } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { useHostPlatform } from '@ap/kernel/host';
import { formatNumber } from '@ap/contracts';
import type { ApiResponse, Capability, ColumnFilter, ColumnFilterSpec, ContextKey, GroupedPageResult, PageQuery, PageResult, PageSort, TableQuery } from '@ap/contracts';
import { Button, Checkbox, cn, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, Label, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, shortcutLabel, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { AnalysisSectionContext } from '../archetypes/AnalysisSectionContext';
import { toColumnDef, toGroupedColumnDefs } from './columnDef';
import { columnGroupBasis, columnGroupErrors, columnGroupLabel, displayedUnits, displayedWidth, effectiveColumnGroups, validGroupName, type StoredColumnGroups } from './columnGroups';
import { createColumnGroup, materializeColumnGroups, renameColumnGroup, setColumnGroupMembers, setColumnGroupWidth, ungroupColumns } from './columnGroupEdits';
import { ColumnGroupChooseView, ColumnGroupRename, ColumnGroupResizer, ColumnGroupRowMenu, useColumnGroupEditor, useColumnGroupResize } from './ColumnGroupEditor';
import { columnGroupModel, FADE_BASE, useColumnGroupLayout } from './useColumnGroupLayout';
import { isProductionEnv } from '@ap/ui';
import { DataTrustIndicator } from '../state/DataTrustIndicator';
import { useElementSize } from '../state/useElementSize';
import { OutcomeContent } from '../StateView';
import { useSharedOutcomeNotice } from '../filters/OutcomeScope';
import { SCROLLPORT_LABEL } from '../scrollportLabel';
import { useEmbeddedChrome, useInWorkspacePanel } from '../workspace/panelContext';
import { ACTION_PIN_MIN_SCROLL, ROW_AREA_FALLBACK, useTableFit } from './tableFit';
import { exportItemName, exportTarget, FORMAT_LABEL, type ExportScopeKind } from './tableMessages';
import { groupedOrder, groupedPins, moveWithinGroup } from './columnOrder';
import { useColumnPreferences } from './useColumnPreferences';
import { usePagedRows } from './usePagedRows';
import { useRowsSource } from './useRowsSource';
import { useColumnFilters } from './columnFilters';
import { resolveFilterFields, type InstantEntry, type TableFilterField } from './filterFields';
import type { FilterValueCheck } from './tableFilterUrl';
import { FilterLine, HeaderFunnel, fieldCheck, useDroppedNote } from './filterLine';
import { useTableTransfer } from './useTableTransfer';
import { useTableSelection, type TableExportRequest, type TableSelection } from './useTableSelection';
import { SelectAllBar } from './selectAllBar';
import { buildGroupedItems, GroupHeaderCells, groupHeaderLayout, groupKeyOf } from './rowGroups';
import { collapsedControls, GroupMenu, GroupSubmenu, MoreMenu, TableSizeMenu, TableSizeSubmenu, ToolbarDescription, ToolbarTitle } from './tableToolbar';
import { BASE_ROW_HEIGHT, TABLE_SIZE_STEPS, useTableSize } from './tableSize';
import { useRegisterPageBound } from '../pageFlow';

export type { GroupedPageResult, PageGroup, PageQuery, PageResult } from '@ap/contracts';
export { sortAndPage } from '@ap/contracts';
export type { TableFilterField } from './filterFields';
export type { TableExportParams, TableExportRequest, TableSelection } from './useTableSelection';

/** Read by the stable `_select` header renderer from `table.options.meta`. */
type SelectionMeta = { headerState: 'all' | 'partial' | null; clear: () => void };
export { exportScopeIds, tableExportParams } from './useTableSelection';
type ColumnMeta = { align?: 'right'; label?: string };

export type PlatformColumnGroup = {
  label: string;
  /** Opt-in px at the normal table size. Top-level only; clips/pans wide content and stretches narrow members to fill. */
  width?: number;
};

/** §15 domain-owned column shape (#160): what menus declare; the TanStack `ColumnDef` conversion lives in the internal `columnDef.ts`, which index.ts does not export. */
export type PlatformColumn<T> = {
  /** Stable id = server sort field = column-preference key = URL sort value. A sortable column's id must be a server sort field; display-only columns set `sortable: false`. */
  id: string;
  /** Header text and the column-menu label. */
  header: string;
  /** Column-group id path, outer → inner. Absent = not grouped. */
  columnGroup?: readonly string[];
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
  /**
   * Opt-in column filter (#556b, ADR-0104): the header gets a filter button and the table sends the user's `ColumnFilter`
   * to `loadPage` (`query.filters`) and `exportRows`. The id is the server field; the server applies the filter.
   */
  filter?: ColumnFilterSpec;
  /** Display only (ADR-0105): this column's filter button sits on the filter line (a chip once set). Needs `filter`. A number is the pinned position (1 first); `true` keeps column order after the numbered ones. */
  filterPinned?: boolean | number;
  /** Display only: the field name in the filter line, editor and XLSX 조회 정보; default = `header`. */
  filterLabel?: string;
  /** Display/entry only, `instant` filters: the time zone and precision of the editor's date-time inputs (`InstantEntry`). Default: browser zone, minutes. */
  filterEntry?: InstantEntry;
  /**
   * Opt-in row groups (#556d, ADR-0104): the toolbar offers 「그룹」 with this column; choosing it sends `groupBy: <id>` to `loadPage`,
   * and the server answers rows ordered by group plus `groups` describing the whole filtered result. The id is the server field.
   */
  groupable?: boolean;
  /**
   * Display only: a group header shows the server's result-wide `PageGroup.subtotals[id]` under this column. The server computes it;
   * declare it only for a column whose reaggregation is `sum` (ADR-0082) — never for a ratio, average or `none` column.
   */
  subtotal?: boolean;
};
/** The trust button's own inline padding (px-2 × 2) and the status line's flex gap (gap-x-2): the probe measures content only. */
const TRUST_BUTTON_PADDING = 16;
const STATUS_GAP = 8;
/** The filter block's flex-basis on the result line (`basis-80` = 20rem); it shares the row with count and trust until the row wraps. */
const FILTER_BASIS = 320;
/** #2310: with a lead (title, search) in the band the filter line reserves the pinned buttons' room; more chips wrap inside the band. */
const FILTER_BASIS_LEAD = 160;
/** #2310: the one-band fit reserves fixed room for the result count (「1,234건 · 12/62 페이지」 is about 115px; a longer count wraps inside the band) and
 * the collapsed trust summary (dot, short status, 자세히; about 150px in Korean) instead of measuring them, so loading and paging never
 * switch the band and remount an open filter editor. */
const COUNT_RESERVE = 120;
const TRUST_SUMMARY_RESERVE = 160;
const ACTION_COLUMN_WIDTH = 128;
/** Icon-only action column: two 32px icon buttons and a 4px gap fit with `px-0`. */
const COMPACT_ACTION_WIDTH = 72;
/** A table narrower than this (a detail drawer beside it) takes the compact action column when columns are scrolled off anyway, so the freed 56px shows more data. */
const NARROW_TABLE_WIDTH = 800;
const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 600;
const SELECT_COLUMN_SIZE = 40;
/** Cell px-4 padding on both sides; a group label must fit the declared clip span. */
const CELL_INLINE_PADDING = 32;
/** The width the engine renders for a declared size: `defaultColumn` min/max apply to every column, `_select` included (40 → 60). */
const renderedWidth = (size: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, size));
/** Keyboard focus ring only (ADR-0023): the feature-ui item focus tint is not distinguishable on the popover surface, so the menu keeps an inset ring — never clipped by the content's `overflow-hidden`, and it stays on top of the shared focus background. */
const exportItemClass = 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';
export type TableUrlState = {
  /** 1-based; null = default page 1 (key omitted). */
  page: number | null;
  /** What the header shows; empty = unsorted. */
  sorting: PageSort[];
  /** User sort/page gestures, and `clamp` when a successful response is past the last page (#314). The page owns the URL keys and its own resets (§6.1). */
  onChange: (next: { page: number | null; sorting: PageSort[]; filters?: ColumnFilter[] }, reason: 'user' | 'reset' | 'clamp') => void;
  /**
   * Opt-in (ADR-0105): the page holds the column-filter conditions in its URL page state (`useTableUrlState(..., { filters })`).
   * Given, the table shows and edits THESE conditions (a change calls `onChange` with the new list and page 1) and its internal
   * filter state is unused; absent, the table keeps its own state as before. The table never knows the key name.
   */
  filters?: ColumnFilter[];
  /** The page's value check (`useTableUrlState(..., { filters: { validate } })`): the filter editor refuses a draft the address would refuse, inline. */
  validate?: FilterValueCheck;
};

/** Server-shaped page read of the `loadPage` input: returns the §19 envelope. */
export type TableLoadPage<T> = (query: TableQuery, signal: AbortSignal) => Promise<ApiResponse<GroupedPageResult<T>>>;

type TableBaseProps<T> = {
  title: ReactNode;
  /** The page already shows the title: keep h2 screen-reader only; without quick search merge filters/results into the toolbar. Panels keep their existing layout. Default false. */
  hideTitle?: boolean;
  subtitle?: ReactNode;
  ariaLabel: string;
  columns: PlatformColumn<T>[];
  /** Column-group id → header label. Every id used in a columnGroup path must be here. */
  columnGroups?: Readonly<Record<string, string | PlatformColumnGroup>>;
  /** Opt-in editing of top-level column groups in the Columns popover, persisted with the other column settings. Default false. */
  editableColumnGroups?: boolean;
  /** Opt-in 1px `border-subtle` line between columns in the column-header row and the body (default off: rows are told apart by
   *  row lines only). For dense side-by-side comparisons such as the members of a column group. */
  columnDividers?: boolean;
  getRowId: (row: T) => string;
  /** Identity of page-owned filters (a query the page holds outside the column filters, e.g. a search); a change returns to page 1 and clears row selection. Default `''`: no page-owned filter. */
  filterKey?: string;
  /**
   * Quick search slot (06 §15, node 1217c): the page's search field, rendered in the toolbar line beside the title. The table does not own the
   * query — the page does (`<Input inputSize="toolbar" …/>` bound to its page key); the slot only places it.
   */
  search?: ReactNode;
  /**
   * Page controls slot (06 §15, #2299): screen keys outside the table filter model (a view switch, a range) placed in the toolbar line —
   * after the quick search in two bands, before the filter line in the merged band. Column conditions stay in `filterFields` (ADR-0105).
   * No width cap; the controls wrap. Does not change when the band merges. Default: none.
   */
  pageControls?: ReactNode;
  rowAction?: (row: T, context: { compact: boolean }) => ReactNode;
  /** Bulk actions for an explicit id selection. Hidden while a `selectAllResults` selection covers the whole result — use `bulkSelectionActions` for that. */
  bulkActions?: (selectedIds: string[]) => ReactNode;
  /** Bulk actions for either selection kind (renders in `ids` and `all` mode, after `bulkActions`). The second argument carries active column filters and sorting; the menu supplies its own Context/page filters. Existing one-argument callbacks remain valid. Without it, an `all` selection shows no bulk action. */
  bulkSelectionActions?: (selection: TableSelection, query: { filters: ColumnFilter[]; sorting: PageSort[] }) => ReactNode;
  /**
   * Table-owned export (#173, 06 §15): the menu only says how to read the rows to export from the server — permission/
   * Scope/limits re-checked per request. Omit to make the screen un-exportable. `sorting` is the table's active sort, so
   * the export follows the screen's order (#173 UX P2-6).
   */
  exportRows?: (request: TableExportRequest, signal: AbortSignal) => Promise<ApiResponse<T[]>>;
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
  /**
   * Opt-in: rows for which this returns true read as secondary. Their data cells take `text-text-muted` at rest and
   * `text-text-secondary` while hovered, selected or active (muted text fails contrast on those surfaces, DESIGN.md §색);
   * `_select`/`_action` cells and content with its own colour class (badges, links) are untouched, the row gets
   * `data-muted="true"`. Visual only: selection, focus, row action and export are unchanged, so the meaning (e.g. 비활성)
   * must also sit in a visible cell such as a status badge. Default absent = no row is muted.
   */
  isRowMuted?: (row: T) => boolean;
  preferenceKey: string;
  pageSize?: number;
  /** Optional keyset/externally paged surface: summary and previous/next controls are owned by the caller.
   * `loadPage` returns the current chunk; no result-wide total is claimed. Default keeps offset pagination. */
  externalPagination?: { summary: ReactNode; controls: ReactNode };
  /** Maximum row-area height; default fits the page (content height, up to the room left on the page, never under 240px). */
  height?: number;
  /** Use the parent flex height budget instead of the page-fit cap; short tables keep their intrinsic height. Default false. Explicit height still caps the row area. */
  fill?: boolean;
  /** The empty result's action. Absent: while column filters are applied the table offers `조건 초기화` (clears them); with none applied there is no button. A passed node replaces that default. */
  emptyAction?: ReactNode;
  /** Filterable fields that are not columns (ADR-0105). Ids are unique across columns and these fields; the filter line renders when there is at least one filterable field. */
  filterFields?: TableFilterField[];
  /** Controlled sort/page (§6.1 page keys). Omit to keep today's internal state. The table never knows URL key names. */
  urlState?: TableUrlState;
};

/** The data source is one of two exclusive inputs (ADR-0137 names the choice): a server-shaped `loadPage`, or the `rows` the page already holds. */
export type PlatformDataTableProps<T> = TableBaseProps<T> & (
  | {
    /** Server-side sort/page. Returns the §19 envelope; the table renders the outcome taxonomy. */
    loadPage: TableLoadPage<T>;
    /** The endpoints this table's `loadPage` reads (the endpoint declarations a menu already has). After a write whose `invalidates` names one of them succeeds, the table reads the same page again; page and selection stay, the previous rows stay visible while loading. `loadPage` is opaque to the table, so it cannot know. */
    refreshOn?: readonly { id: string }[];
    /**
     * Opt-in (#556c, ADR-0104): once the whole page is checked and more results exist, the table offers 「필터 결과 전체 M행 선택」.
     * The selection then is `{ kind: 'all', excludedIds, total }` — no id list is built or sent; the server recomputes the set
     * from Context + page filters + column filters − `excludedIds`. Default false: tables behave as before.
     */
    selectAllResults?: boolean;
    /**
     * Opt-in (#2380): keep this table's answered pages in the Kernel query engine under this key (unique in the app: start it with the menu id).
     * A page kept for the same request (Context, filters, page, page size, sort, group, `refreshOn` epoch) shows at once with no request and no
     * loading state, so a table remounted by a tab switch comes back as it was. Pages leave after five minutes or with the session; a write
     * the table cannot see (no `refreshOn` endpoint) needs a new key, e.g. one carrying the screen's own write count; a changed key reads
     * again at once, keeping the current rows while it loads. Pages outlive the screen, so a count that restarts when the screen mounts
     * again needs a per-mount part in the key too, or a reopened screen gets the pages it read before its last write.
     */
    cacheKey?: string;
    rows?: never; rowsLoading?: never;
  }
  | {
    /** Rows the page already holds. The table filters, groups, sorts and pages them itself (or shows them all with `externalPagination`) and answers its own §19 envelope. A successful result: a failed read stays with `QueryView`, never `rows={[]}`. Memoize it: a new reference reads again. */
    rows: readonly T[];
    /** The read behind `rows` is in flight: the table shows its loading state (previous rows stay visible) until it turns false. */
    rowsLoading?: boolean;
    loadPage?: never; refreshOn?: never; selectAllResults?: never; cacheKey?: never;
  }
);

const NO_FILTERS: ColumnFilter[] = [];

/** The outcome container shows a retry button: a failed or timed-out read, and (only when `groupedEmpty`) an empty one that joined a shared-response group (#1175). */
const isRetryable = (response: Pick<ApiResponse<unknown>, 'outcome'> | null, groupedEmpty = false): boolean =>
  response?.outcome === 'error' || response?.outcome === 'timeout' || (groupedEmpty && response?.outcome === 'empty');

/** §15: platform owns interaction, loading/error, column preference, selection model, toolbar layout; domain owns columns/cells/actions/filters. */
export function PlatformDataTable<T>(props: PlatformDataTableProps<T>) {
  const epoch = useEndpointRefreshEpoch((props.refreshOn ?? []).map(e => e.id));
  const source = useRowsSource<T>({ rows: props.rows, rowsLoading: !!props.rowsLoading, external: !!props.externalPagination, urlSorting: !!props.urlState, columns: props.columns, filterFields: props.filterFields });
  const { preferences, onColumnSizingChange, onColumnVisibilityChange, onColumnPinningChange, onColumnOrderChange, onColumnGroupsChange, resetPreferences } = useColumnPreferences(props.preferenceKey);
  const effective = useMemo(() => props.editableColumnGroups ? effectiveColumnGroups(source.columns, props.columnGroups, preferences.groups) : { columns: source.columns, columnGroups: props.columnGroups }, [props.editableColumnGroups, source.columns, props.columnGroups, preferences.groups]);
  // The rest of the table reads one shape: always a `loadPage`, the (possibly stripped) columns and fields.
  const p = { ...props, ...effective, filterFields: source.filterFields, loadPage: props.loadPage ?? source.loadPage! };
  const dataVersion = props.rows ? source.version : epoch;
  const { t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const analysisSection = useContext(AnalysisSectionContext);
  const inPanel = useInWorkspacePanel();
  const densePage = useCompactPageDensity();
  // 1217d: one per-user size for every table, a step relative to this context's baseline; 보통 renders exactly as before (no size class or style is added).
  const [tableSize, setTableSize] = useTableSize();
  const sized = tableSize !== 'normal';
  const step = TABLE_SIZE_STEPS[tableSize];
  const rowHeight = BASE_ROW_HEIGHT + step.rowDelta;
  const widthScale = step.widthScale;
  const sizeVars = { '--ap-table-font': step.font, '--ap-table-mono-font': `calc(${step.font} - 1px)`, '--ap-table-head-font': step.head, '--ap-table-row-h': `${rowHeight}px` } as CSSProperties;
  const embedded = useEmbeddedChrome();
  // #2310: every table outside a workspace panel is one band when it fits — [title ⓘ][search][page controls][filters] … [count · trust][controls].
  // A titled or searchable table falls back to its two bands when the measured lead, page controls, filter basis, count and controls do not fit
  // (`mergeToolbar` below); a hidden title without search always merges (R2, #1234). Workspace panels keep two bands.
  const canMerge = !inPanel;
  const alwaysMerge = canMerge && !!p.hideTitle && !p.search;
  // The visible title and the quick search lead the band; a hidden title keeps ⓘ beside the result count (R2).
  const titleShown = !inPanel && !p.hideTitle;
  const hasLead = canMerge && !alwaysMerge;
  const { route, toast } = usePlatform();
  const { screenMode } = useHostPlatform();
  // §15: a workspace panel or board pane body scrolls too, so the row area chains the wheel outward at its edge; flow pages and drawers contain it.
  const chainWheel = inPanel || screenMode === 'pane';
  // Registry declares export capability (§5); the table never offers Export on a menu that did not declare it.
  const canExport = !!p.exportRows && !!route?.menu.features.export;
  // Selection exists only for features that read it (export/copy, bulk actions); ADR-0037.
  const selectable = canExport || !!p.bulkActions || !!p.bulkSelectionActions;
  const pageSize = p.pageSize ?? 100;
  const [sorting, setSorting] = useState<PageSort[]>([]);
  const [copyTip, setCopyTip] = useState(false);
  /** Column popover / export menu open: the Ctrl/⌘+C shortcut stays native while either is open. */
  const [overlayOpen, setOverlayOpen] = useState({ columns: false, export: false });
  const editorIdentity = JSON.stringify([props.preferenceKey, !!props.editableColumnGroups, columnGroupBasis(source.columns, props.columnGroups)]);
  const groupEditor = useColumnGroupEditor(editorIdentity);
  const viewport = useRef<HTMLDivElement | null>(null);
  const section = useRef<HTMLElement>(null);
  useRegisterPageBound(!!p.fill);
  const fit = useTableFit(section);
  // The status line drops to a one-line trust summary only when the full line does not fit: the available inline space (the status line
  // minus the result count, the refreshing label and their gaps) is compared with a hidden probe of the full content. The probe is
  // measured independently of what is shown, so the choice cannot feed back into its own input.
  const statusLine = useElementSize();
  const toolbar = useElementSize();
  // Lead, controls, page controls and count keep their own widths in both layouts, so the band choice cannot feed back into its input.
  const toolbarControls = useElementSize(canMerge);
  const pageControls = useElementSize(canMerge && !!p.pageControls);
  const lead = useElementSize(hasLead);
  // P10 measures the whole toolbar content box, including the merged filter/result band; thresholds and order stay unchanged.
  const overflow = collapsedControls(toolbar.width);
  const openColumnsAfterMenu = useRef(false);
  // 「컬럼」 in `⋯`: the popover has only an anchor (no trigger), so `⋯` is the focus-return target and a pointer-outside close keeps the pointer's focus.
  const moreButton = useRef<HTMLButtonElement>(null);
  const columnsOutside = useRef(false);
  const countSpan = useElementSize();
  const refreshSpan = useElementSize();
  const probe = useElementSize();
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
  const filterFields = useMemo(() => resolveFilterFields(p.columns, p.filterFields, lang), [p.columns, p.filterFields, lang]);
  const columnFilters = useColumnFilters(p.urlState, filterFields);
  // `rows` + `externalPagination` ignores filters: one effective state feeds identity, loading, export and descriptions.
  const effectiveFilters = source.filtersIgnored ? NO_FILTERS : columnFilters.filters;
  const droppedNote = useDroppedNote(filterFields, columnFilters.filters, columnFilters.apply);
  // Merged fit must not depend on the shown summary's intrinsic width: measure the whole band and the controls separately.
  // Reserve the existing 320px filter basis when count + description fit beside it; otherwise the right-hand group wraps.
  const descriptionWidth = p.subtitle && alwaysMerge ? 24 + STATUS_GAP : 0;
  // Page controls share the left of the merged band with the filters: their measured width leaves the band before the filter basis is reserved.
  const pageControlsWidth = !p.pageControls ? 0 : pageControls.width === null ? null : pageControls.width + STATUS_GAP;
  // The lead (title ⓘ + quick search) is measured at its own width the same way (#2310).
  const leadWidth = !hasLead ? 0 : lead.width === null ? null : lead.width + STATUS_GAP;
  const beforeFilters = pageControlsWidth === null || leadWidth === null ? null : pageControlsWidth + leadWidth;
  const mergedWidth = toolbar.width === null || toolbarControls.width === null || beforeFilters === null ? null : toolbar.width - toolbarControls.width - STATUS_GAP - beforeFilters;
  // The merged band's left group (lead + page controls + filters) reserves its measured lead plus the filter basis beside the controls.
  // #556d: one group column (a groupable column of this table), collapse state keyed by group key. A group change returns to page 1 and
  // expands every group; the selection is kept (it is by row id, and sorting/grouping do not change the result set).
  const groupColumns = useMemo(() => p.columns.filter(c => c.groupable), [p.columns]);
  const [groupChoice, setGroupChoice] = useState('');
  const groupBy = groupColumns.some(c => c.id === groupChoice) ? groupChoice : null;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const { setPage, retry, effectivePage, shown, shownPage, loading, data, pageCount, success, outOfRange } = usePagedRows<T>({
    loadPage: p.loadPage, filterKey: p.filterKey ?? '', urlState: p.urlState, pageSize, activeSorting, viewport, columnFilters: effectiveFilters, groupBy, dataVersion, cacheKey: p.cacheKey,
    // Selection never survives a Context change; an in-flight export/copy belongs to the old result set.
    onContextChange: () => { selectionState.clear(); abortTransfers(); setCollapsed(new Set()); },
  });
  const filterBasis = hasLead ? FILTER_BASIS_LEAD : FILTER_BASIS;
  const mergedShared = mergedWidth === null ? null : mergedWidth - filterBasis - STATUS_GAP;
  // Only widths that hold while rows load or pages turn decide the band (toolbar, controls, lead, page controls); the count and trust get fixed room.
  const fitsOneBand = mergedWidth === null || (filterFields.length > 0 ? mergedShared! : mergedWidth) >= COUNT_RESERVE + descriptionWidth + STATUS_GAP + TRUST_SUMMARY_RESERVE;
  // Switching bands moves the filter and result lines to another parent, which remounts them: while a popover anchored there is open
  // (a filter editor with its draft, + 필터, the trust details) the band holds, and the measured choice applies when it closes.
  const anchoredOpen = useAnchoredOverlayOpen(section, canMerge && !alwaysMerge);
  const heldBand = useRef<boolean | null>(null);
  const measuredMerge = alwaysMerge || (canMerge && fitsOneBand);
  const mergeToolbar = anchoredOpen && heldBand.current !== null ? heldBand.current : measuredMerge;
  useEffect(() => { heldBand.current = mergeToolbar; });
  const leftBasis = mergeToolbar && beforeFilters !== null && beforeFilters > 0 ? { '--ap-table-left-basis': `${(filterFields.length > 0 ? filterBasis : -STATUS_GAP) + beforeFilters}px` } as CSSProperties : undefined;
  const mergedRoom = filterFields.length > 0 && mergedShared !== null && mergedShared >= (countSpan.width ?? 0) + descriptionWidth ? mergedShared : mergedWidth;
  // With separate filters the right-hand blocks get what the filter block (basis 320) leaves; when even the count does not fit beside it, the row wraps and they have the whole line.
  const sharedWidth = statusLine.width === null ? null : statusLine.width - FILTER_BASIS - STATUS_GAP;
  const trustRoom = mergeToolbar ? (mergedRoom === null ? null : mergedRoom - descriptionWidth) : statusLine.width === null || filterFields.length === 0 || sharedWidth === null || sharedWidth < (countSpan.width ?? 0) ? statusLine.width : sharedWidth;
  const statusNarrow = trustRoom !== null && trustRoom > 0 && probe.width !== null && probe.width > 0
    && probe.width + TRUST_BUTTON_PADDING + (countSpan.width ? countSpan.width + STATUS_GAP : 0) + (refreshSpan.width ? refreshSpan.width + STATUS_GAP : 0) > trustRoom;
  // The table's result joins the page's OutcomeScope like a QueryView does; the toolbar <h2> already names it, so the grouped state hides the name line (§306).
  const { grouped: groupedOutcome, bannerId: outcomeBannerId, multiple: multipleOutcomeGroups } = useSharedOutcomeNotice(shown, retry, p.ariaLabel, loading ? (shown ? 'refreshing' : 'loading') : 'done');
  const selectionState = useTableSelection<T>({ enabled: selectable, selectAllResults: !!p.selectAllResults, rows: data.rows, getRowId: p.getRowId, total: data.total, resultOk: shown?.outcome === 'ok' });
  const { selectedIds, rowSelection: effectiveSelection } = selectionState;
  const selectedCount = selectionState.count;
  const { headerState, clear: clearSelection } = selectionState;
  const { exporting, copying, exportNote, copyNote, runExport, runCopy, onShortcut, abortTransfers } = useTableTransfer<T>({
    columns: p.columns, columnGroups: p.columnGroups, getRowId: p.getRowId, exportRows: p.exportRows, menuNote: p.exportNote, exportFilterSummary: p.exportFilterSummary, exportContext: p.exportContext,
    canExport, selectedIds, selection: effectiveSelection, allSelection: selectionState.all ? { excludedIds: selectionState.excludedIds, count: selectedCount } : null, columnFilters: effectiveFilters, filterFields, loadedRows: data.rows, total: data.total, resultOk: shown?.outcome === 'ok', activeSorting, preferences, overlayOpen,
  });

  const orderedIds = useMemo(() => groupedOrder(p.columns, preferences.order), [p.columns, preferences.order]);
  const pinnedIds = groupedPins(p.columns, preferences.pinning.left ?? [], orderedIds, preferences.visibility, preferences.order.length > 0);
  const columnGroups = columnGroupModel(p.columns, p.columnGroups, widthScale);
  const { paths, hasColumnGroups, groupWidth, inWidthGroup } = columnGroups;
  useEffect(() => {
    if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return;
    for (const error of columnGroupErrors(props.columns, props.columnGroups)) console.error(`[PlatformDataTable] ${error}`);
  }, [props.columns, props.columnGroups]);
  const columnPrefsId = useId();
  // ADR-0037: the action column is pinned right whenever the scrollport keeps room beside the user's left pins; narrower
  // it scrolls with the rest so pinned regions never overlap. Never user-pinnable, never stored (`_action` stays out of preferences).
  // One width model for the fit estimates: the stored or declared size, clamped to what the table renders.
  const columnWidth = (id: string, size: number | undefined) => renderedWidth((inWidthGroup(id) ? undefined : preferences.sizing[id]) ?? Math.round((size ?? DEFAULT_COLUMN_WIDTH) * widthScale));
  const visibleDataColumns = p.columns.filter(c => preferences.visibility[c.id] !== false);
  const leftPinnedWidth = displayedWidth(pinnedIds.flatMap(id => visibleDataColumns.filter(c => c.id === id)), c => c.columnGroup, c => columnWidth(c.id, c.size), groupWidth);
  // When only the compact (72px, icon-only) form fits beside the left pins it stays pinned; narrower still it unpins in the normal form.
  const fitsFull = fit.width === null || fit.width === 0 || fit.width >= leftPinnedWidth + ACTION_COLUMN_WIDTH + ACTION_PIN_MIN_SCROLL;
  // Narrow table with columns scrolled off by more than a whole action column: the 56px saved by the compact form is worth more as data.
  const dataColumnsWidth = (selectable ? renderedWidth(SELECT_COLUMN_SIZE) : 0) + displayedWidth(orderedIds.flatMap(id => visibleDataColumns.filter(c => c.id === id)), c => c.columnGroup, c => columnWidth(c.id, c.size), groupWidth);
  const narrowScrolling = fit.width !== null && fit.width > 0 && fit.width < NARROW_TABLE_WIDTH && dataColumnsWidth > fit.width + ACTION_COLUMN_WIDTH;
  const actionCompact = !!p.rowAction && (fitsFull ? narrowScrolling : fit.width !== null && fit.width >= leftPinnedWidth + COMPACT_ACTION_WIDTH + ACTION_PIN_MIN_SCROLL);
  const actionPinned = !!p.rowAction && (fitsFull || actionCompact);
  const actionWidth = actionCompact ? COMPACT_ACTION_WIDTH : ACTION_COLUMN_WIDTH;
  // #556a: `order` is the single order source; the pins only say which columns are pinned and are laid out by it.
  const pinningState: ColumnPinningState = { left: pinnedIds, right: actionPinned ? ['_action'] : [] };
  // The data and selection definitions do not depend on the action width: a band crossing must keep their cell functions (and the DOM they render).
  // Converted leaves depend on the declaration and the size scale only, never on the order (a reorder must not remount cells).
  // Group edits change paths/labels only; leaf renderers continue to depend on the source declaration, preserving cell state.
  const leafDefs = useMemo(() => new Map(source.columns.map(c => [c.id, toColumnDef(widthScale === 1 ? c : { ...c, size: Math.round((c.size ?? DEFAULT_COLUMN_WIDTH) * widthScale) })])), [source.columns, widthScale]);
  // Ungrouped tables keep declaration order here and leave ordering to the engine's `columnOrder`; grouped tables nest in the shown order.
  const treeOrder = p.columns.some(c => (c.columnGroup?.length ?? 0) > 0) ? orderedIds : null;
  const baseColumns = useMemo<ColumnDef<T>[]>(() => [
    ...(selectable ? [{
      id: '_select', size: SELECT_COLUMN_SIZE, enableSorting: false, enableHiding: false, enableResizing: false,
      // #556c: while a select-all-results selection is active the header speaks for the whole result; clicking it clears the selection.
      // The changing state arrives through `table.options.meta` so this renderer keeps its identity (a new component type would remount the focused checkbox).
      header: ({ table }) => {
        const { headerState, clear } = table.options.meta as SelectionMeta;
        return <Checkbox aria-label={headerState ? m('tableSelectAllClear') : m('tableSelectAllPage')}
          checked={headerState ? (headerState === 'all' ? true : 'indeterminate') : table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={v => headerState ? clear() : table.toggleAllPageRowsSelected(v === true)} className="size-3.5 border-border-control" />;
      },
      cell: ({ row }) => <Checkbox aria-label={m('tableSelectRow', { id: row.id })} checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(v === true)} className="size-3.5 border-border-control" />,
    } as ColumnDef<T>] : []),
    // 크게 widens the DEFAULT widths by the font ratio; a width the user dragged is stored in `preferences.sizing` and wins over it.
    ...toGroupedColumnDefs(treeOrder ? treeOrder.flatMap(id => p.columns.filter(c => c.id === id)) : p.columns, p.columnGroups, c => leafDefs.get(c.id)!),
  ], [p.columns, p.columnGroups, treeOrder, leafDefs, m, selectable]);
  const hasAction = !!p.rowAction;
  const allColumns = useMemo<ColumnDef<T>[]>(() => [
    ...baseColumns,
    ...(hasAction ? [{ id: '_action', size: actionWidth, enableSorting: false, enableHiding: false, enableResizing: false, header: m('tableActionColumn') } as ColumnDef<T>] : []),
  ], [baseColumns, hasAction, m, actionWidth]);

  // The selection and action utility columns keep their places at the two ends.
  const columnOrder = useMemo(() => [...(selectable ? ['_select'] : []), ...orderedIds, ...(hasAction ? ['_action'] : [])], [selectable, orderedIds, hasAction]);

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
    meta: { headerState, clear: clearSelection } satisfies SelectionMeta,
    manualSorting: true, manualPagination: true, enableRowSelection: selectable, columnResizeMode: 'onChange',
    enableMultiSort: !p.urlState,
    defaultColumn: { size: DEFAULT_COLUMN_WIDTH, minSize: MIN_COLUMN_WIDTH, maxSize: MAX_COLUMN_WIDTH },
    state: { sorting: activeSorting, rowSelection: effectiveSelection, columnSizing: Object.fromEntries(Object.entries(preferences.sizing).filter(([id]) => !inWidthGroup(id))), columnVisibility: preferences.visibility, columnPinning: pinningState, columnOrder },
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
    onRowSelectionChange: selectionState.onRowSelectionChange,
    onColumnSizingChange: sizingChange, onColumnVisibilityChange, onColumnPinningChange: update => {
      const next = typeof update === 'function' ? update(pinningState) : update;
      onColumnPinningChange(actionPinned)({ ...next, left: groupedPins(p.columns, next.left ?? [], orderedIds, preferences.visibility, preferences.order.length > 0) });
    },
  });
  const headerSegments = hasColumnGroups ? [
    { side: 'left' as const, rows: table.getLeftHeaderGroups() },
    { side: false as const, rows: table.getCenterHeaderGroups() },
    { side: 'right' as const, rows: table.getRightHeaderGroups() },
  ] : [{ side: false as const, rows: table.getHeaderGroups() }];
  const headerRowCount = Math.max(1, ...headerSegments.map(segment => segment.rows.length));
  const headerRows = Array.from({ length: headerRowCount }, (_, depth) => headerSegments.flatMap(segment =>
    (segment.rows[depth]?.headers ?? []).map(header => ({ header, side: hasColumnGroups ? segment.side : header.column.getIsPinned() }))));
  const rows = table.getRowModel().rows;
  // #556d: group header rows are virtual items mixed into the list; null = flat, exactly as before (no groupBy, or a response without `groups`).
  const groupColumn = groupBy ? groupColumns.find(c => c.id === groupBy) : undefined;
  const groupedItems = useMemo(() => groupColumn
    ? buildGroupedItems(rows, data.groups, row => groupKeyOf(groupColumn.value ? groupColumn.value(row.original) : (row.original as Record<string, unknown>)[groupColumn.id]), collapsed)
    : null, [groupColumn, rows, data.groups, collapsed]);
  const items = groupedItems ?? rows.map(row => ({ kind: 'row' as const, key: row.id, row }));
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => viewport.current, estimateSize: () => rowHeight, overscan: 8, getItemKey: i => items[i].key });
  useLayoutEffect(() => { virtual.measure(); }, [rowHeight]); // eslint-disable-line react-hooks/exhaustive-deps -- `virtual` is stable; a size change re-measures the cached rows
  // Selected rows of this page that a collapsed group hides: the page selection still covers them, and the count says so.
  const hiddenSelected = groupedItems ? rows.filter(r => r.getIsSelected()).length - groupedItems.filter(it => it.kind === 'row' && it.row.getIsSelected()).length : 0;
  const changeGroup = (id: string) => {
    setGroupChoice(id); setCollapsed(new Set());
    if (p.urlState) { if (p.urlState.page !== null) p.urlState.onChange({ sorting: p.urlState.sorting, page: null }, 'reset'); } else setPage(0);
    if (viewport.current) viewport.current.scrollTop = 0;
  };
  const toggleGroup = (key: string) => setCollapsed(prev => { const next = new Set(prev); if (!next.delete(key)) next.add(key); return next; });
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
    // otherwise (forbidden·too_large·empty — a successful empty renders the outcome state, no viewport) →
    // the section. A user blur before the settle cleared the ref,
    // so nothing is stolen from a focus that moved away.
    if (focusedRetry.current) {
      if (success && shown?.outcome === 'ok') { focusedRetry.current = false; viewport.current?.focus(); return; }
      // A grouped empty keeps its own retry button (the scope's shared-response rule), so it is retryable too (#1175).
      if (isRetryable(shown, groupedOutcome)) { outcome.current?.querySelector('button')?.focus(); return; }
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
    const retryButton = isRetryable(shown)
      ? outcome.current?.querySelector('button') : null;
    const target = opposite && !opposite.disabled ? opposite : retryButton ?? section.current;
    target?.focus();
    // groupedOutcome: joining or leaving a group swaps the state message (and its retry button) without any other change here (#1175).
  }, [loading, previousDisabled, nextDisabled, shown, success, groupedOutcome]);

  const { pan, tableWidth, widthOf, displayedSize, lineClass, cellStyle, groupHeadStyle: groupSpanStyle, renderCells } = useColumnGroupLayout({ table, model: columnGroups, sizing: preferences.sizing, fitWidth: fit.width, columnDividers: p.columnDividers });
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
  const align = (column: Column<T>) => ((column.columnDef.meta as ColumnMeta | undefined)?.align === 'right' ? 'justify-end text-right tabular' : '');
  // 보통 keeps today's literal; 작게/크게 take the row height and font from the section's variables (checkboxes are excluded from the 작게 button height: they stay 14×14).
  const headerBase = sized ? 'flex min-h-(--ap-table-row-h) items-center overflow-hidden whitespace-nowrap px-4 py-0 pointer-coarse:min-h-11' : 'flex min-h-8 items-center overflow-hidden whitespace-nowrap px-4 py-1 pointer-coarse:min-h-11';
  const cellBase = cn(headerBase, 'overflow-visible whitespace-normal [overflow-wrap:anywhere]',
    sized && 'py-0.5 [&_a]:text-(length:--ap-table-font) [&_button:not([role=checkbox])]:text-(length:--ap-table-font) [&_.t-mono]:text-(length:--ap-table-mono-font)',
    tableSize === 'small' && '[&_button:not([role=checkbox])]:h-6 [&_a.h-8]:h-6');
  const cellText = sized ? 'text-(length:--ap-table-font)' : 'text-sm';
  const headStyle = (column: Column<T>): CSSProperties => sized ? { ...cellStyle(column), fontSize: 'var(--ap-table-head-font)' } : cellStyle(column);
  const groupHeadStyle = (h: Header<T, unknown>, side: 'left' | 'right' | false): CSSProperties => sized ? { ...groupSpanStyle(h, side), fontSize: 'var(--ap-table-head-font)' } : groupSpanStyle(h, side);
  /** The right-pinned action column keeps a visible edge while content scrolls beneath it (a border token; DESIGN.md allows no shadow). */
  const pinEdge = 'border-l border-l-border-control';
  const fadeClass = (side: 'left' | 'right' | false | null, body: boolean, active = false) => !side || !(side === 'right' ? fade.right : fade.left) ? undefined
    : cn(FADE_BASE, 'overflow-visible', side === 'right' ? 'before:right-full before:bg-linear-to-r' : 'before:left-full before:bg-linear-to-l',
      body ? cn(active ? 'before:to-surface-row-selected' : 'before:to-surface-card', 'group-hover:before:to-surface-row-hover group-aria-selected:before:to-surface-row-selected') : 'before:to-surface-sunken');
  const nameOf = (c: Column<T>) => (c.columnDef.meta as ColumnMeta | undefined)?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id);
  function editGroups(edit: (snapshot: StoredColumnGroups) => StoredColumnGroups, mode: 'now' | 'later', { gather = false }: { gather?: boolean } = {}) {
    if (!p.editableColumnGroups) return;
    const displayed = [...table.getLeftLeafColumns(), ...table.getCenterLeafColumns(), ...table.getRightLeafColumns()].map(c => c.id).filter(id => id !== '_select' && id !== '_action');
    onColumnGroupsChange(previous => {
      const groups = edit(materializeColumnGroups(source.columns, props.columnGroups, previous.groups));
      if (!gather) return { groups };
      const merged = effectiveColumnGroups(source.columns, props.columnGroups, groups);
      return { groups, order: groupedOrder(merged.columns, displayed) };
    }, mode);
  }
  // Every editor exit removes the focused control (rename input, choose view, ungrouped row); hand focus to the group's
  // menu, or to 묶음 만들기 when that group is new or gone.
  const groupNewId = `${columnPrefsId}-group-new`;
  const groupMenuId = (id: string) => `${columnPrefsId}-${id}-group-menu`;
  const refocusGroup = useRef<string | null>(null);
  useEffect(() => {
    const id = refocusGroup.current;
    if (id === null) return;
    refocusGroup.current = null;
    (document.getElementById(id) ?? document.getElementById(groupNewId))?.focus();
  });
  function closeGroupEditor(focus = true) {
    const draft = groupEditor.draft;
    if (focus && draft.kind !== 'idle') refocusGroup.current = draft.kind === 'rename' || draft.id ? groupMenuId(draft.id!) : groupNewId;
    groupEditor.cancel();
  }
  function announceGroup(message: 'tableGroupCreated' | 'tableGroupChanged' | 'tableGroupRemoved', name: string) {
    const note = m(message, { name });
    groupEditor.setNote(note); toast(note);
  }
  function saveGroupName(byKey: boolean) {
    const draft = groupEditor.draft;
    if (draft.kind !== 'rename' || !validGroupName(draft.name)) return;
    editGroups(snapshot => renameColumnGroup(snapshot, draft.id, draft.name), 'now');
    announceGroup('tableGroupChanged', draft.name.trim()); closeGroupEditor(byKey);
  }
  function saveGroupMembers() {
    const draft = groupEditor.draft;
    if (draft.kind !== 'choose' || !validGroupName(draft.name) || draft.members.length < (draft.id ? 1 : 2)) return;
    const members = dataColumns.map(c => c.id).filter(id => draft.members.includes(id));
    if (draft.id) {
      const id = draft.id;
      editGroups(snapshot => {
        const changed = setColumnGroupMembers(snapshot, id, members);
        return draft.name.trim() === columnGroupLabel(p.columnGroups, id) ? changed : renameColumnGroup(changed, id, draft.name);
      }, 'now', { gather: true });
      announceGroup('tableGroupChanged', draft.name.trim());
    } else {
      editGroups(snapshot => createColumnGroup(snapshot, draft.name, members, [...source.columns.map(c => c.id), ...source.columns.flatMap(c => c.columnGroup ?? []), ...Object.keys(props.columnGroups ?? {})]), 'now', { gather: true });
      announceGroup('tableGroupCreated', draft.name.trim());
    }
    closeGroupEditor();
  }
  const setGroupWidth = (id: string, width: number | undefined) => editGroups(snapshot => setColumnGroupWidth(snapshot, id, width), 'later');
  const groupResize = useColumnGroupResize(editorIdentity, widthScale, setGroupWidth);
  // #239 (ADR-0024): the Columns popover lists each hideable column with a visibility checkbox and a pin toggle at the
  // row end; pinned columns sit in their own group on top. Width is set by dragging the header edge only.
  // #556a: every data column can be ordered (a non-hideable one shows no checkbox); moves stay inside the pinned / other group.
  const engineColumns = new Map(table.getAllFlatColumns().map(column => [column.id, column]));
  const dataColumns = table.getAllLeafColumns().filter(c => c.id !== '_select' && c.id !== '_action');
  // A pin toggle moves its row between the groups, which remounts the button; give focus back to the same column's toggle.
  const refocusPin = useRef<string | null>(null);
  useEffect(() => {
    if (refocusPin.current === null) return;
    document.getElementById(`${columnPrefsId}-${refocusPin.current}-pin`)?.focus();
    refocusPin.current = null;
  });
  const pinnedPrefs = pinnedIds.flatMap(id => dataColumns.filter(c => c.id === id));
  const otherPrefs = dataColumns.filter(c => !pinnedIds.includes(c.id));
  const [orderNote, setOrderNote] = useState('');
  const [dragOver, setDragOver] = useState<{ id: string; index: number } | null>(null);
  // A move re-keys nothing but the browser drops focus from a moved node; give it back to the same button (the other one when this one is now at the edge).
  const refocusMove = useRef<{ id: string; dir: 'up' | 'down'; fallback: 'up' | 'down' } | null>(null);
  useEffect(() => {
    const target = refocusMove.current;
    if (!target) return;
    refocusMove.current = null;
    const button = (dir: 'up' | 'down') => document.getElementById(`${columnPrefsId}-${target.id}-${dir}`) as HTMLButtonElement | null;
    const first = button(target.dir);
    (first && !first.disabled ? first : button(target.fallback))?.focus();
  });
  function moveColumn(c: Column<T>, group: Column<T>[], toIndex: number, dir?: 'up' | 'down') {
    const sequence = group.map(g => g.id);
    const to = Math.max(0, Math.min(sequence.length - 1, toIndex));
    if (to === sequence.indexOf(c.id)) return;
    if (dir) refocusMove.current = { id: c.id, dir, fallback: dir === 'up' ? 'down' : 'up' };
    // No saved order yet: start from what is shown (pins in their pin order, then the rest), so the untouched group keeps its sequence.
    const base = groupedOrder(p.columns, preferences.order.length > 0 ? orderedIds : [...pinnedIds, ...orderedIds.filter(id => !pinnedIds.includes(id))]);
    const leafIds = (column: Column<T>) => column.columns.length ? column.getLeafColumns().map(leaf => leaf.id) : [column.id];
    const moved = moveWithinGroup(sequence, sequence, c.id, to).flatMap(id => leafIds(group.find(column => column.id === id)!));
    const slots = new Set(group.flatMap(leafIds));
    let index = 0;
    onColumnOrderChange(base.map(id => slots.has(id) ? moved[index++] : id));
    setOrderNote(m('tableColumnMoved', { name: nameOf(c), position: to + 1 }));
  }
  /** Pointer drag on the handle: the row under the pointer (same group only) is the drop target; the move is committed on release. */
  function startDrag(e: React.PointerEvent<HTMLElement>, c: Column<T>, group: Column<T>[]) {
    if (e.button > 0) return;
    const row = e.currentTarget.closest('[data-column-pref-row]');
    const block = row?.parentElement?.parentElement;
    const list = block?.hasAttribute('data-column-pref-block') ? block.parentElement : row?.parentElement;
    if (!list) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    const overIndex = (clientY: number) => {
      const rows = [...list.children] as HTMLElement[];
      const hit = rows.findIndex(row => clientY <= row.getBoundingClientRect().bottom);
      return hit < 0 ? rows.length - 1 : hit;
    };
    let index = group.indexOf(c);
    setDragOver({ id: c.id, index });
    const move = (ev: PointerEvent) => { index = overIndex(ev.clientY); setDragOver({ id: c.id, index }); };
    const end = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      setDragOver(null);
      if (ev.type === 'pointerup') moveColumn(c, group, index);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  function columnPrefRow(c: Column<T>, at: number, group: Column<T>[]) {
    const pinned = c.getIsPinned() === 'left';
    const isGroup = c.columns.length > 0;
    const editable = !!p.editableColumnGroups && isGroup && !c.parent;
    const canPin = !c.parent;
    const name = nameOf(c);
    return <li key={c.id} data-column-pref-row className={cn('flex items-center gap-2', dragOver?.id === c.id && 'opacity-60', dragOver && dragOver.id !== c.id && dragOver.index === at && group.some(g => g.id === dragOver.id) && 'border-t border-t-border-control')}>
      <span role="presentation" aria-hidden className="shrink-0 cursor-grab touch-none text-text-muted" onPointerDown={e => startDrag(e, c, group)}><GripVertical className="size-3.5" /></span>
      {!isGroup && c.getCanHide() ? <Checkbox id={`${columnPrefsId}-${c.id}-visible`} checked={c.getIsVisible()} onCheckedChange={v => c.toggleVisibility(v === true)} className="size-3.5 border-border-control" /> : <span className="size-3.5 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{editable && groupEditor.draft.kind === 'rename' && groupEditor.draft.id === c.id
        ? <ColumnGroupRename name={groupEditor.draft.name} onName={groupEditor.setName} onSave={saveGroupName} onCancel={() => closeGroupEditor()} />
        : !isGroup && c.getCanHide() ? <Label htmlFor={`${columnPrefsId}-${c.id}-visible`}>{name}</Label> : <span className="block truncate text-sm" title={name}>{name}</span>}</div>
      <Button id={`${columnPrefsId}-${c.id}-up`} type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-label={m('tableColumnMoveUp', { name })} disabled={at === 0} onClick={() => moveColumn(c, group, at - 1, 'up')}><ArrowUp className="size-3.5" aria-hidden /></Button>
      <Button id={`${columnPrefsId}-${c.id}-down`} type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-label={m('tableColumnMoveDown', { name })} disabled={at === group.length - 1} onClick={() => moveColumn(c, group, at + 1, 'down')}><ArrowDown className="size-3.5" aria-hidden /></Button>
      {canPin && <Button id={`${columnPrefsId}-${c.id}-pin`} type="button" variant="ghost" size="icon-xs" className="shrink-0" aria-pressed={pinned} aria-label={m('tableColumnPinLeft', { name })} disabled={!c.getCanPin()} onClick={() => { refocusPin.current = c.id; c.pin(pinned ? false : 'left'); }}>
        {pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
      </Button>}
      {editable && <ColumnGroupRowMenu triggerId={groupMenuId(c.id)} name={name} onRename={() => groupEditor.rename(c.id, name)} onMembers={() => groupEditor.edit(c.id, name, c.getLeafColumns().map(leaf => leaf.id))}
        onUngroup={() => { refocusGroup.current = groupNewId; editGroups(snapshot => ungroupColumns(snapshot, c.id), 'now'); announceGroup('tableGroupRemoved', name); }} />}
    </li>;
  }
  function columnPrefList(members: Column<T>[], depth = 0): ReactNode {
    const units: { column: Column<T>; members: Column<T>[] }[] = [];
    for (const member of members) {
      const id = paths.get(member.id)?.[depth];
      const previous = units.at(-1);
      if (id && previous?.column.id === id) previous.members.push(member);
      else units.push({ column: (id ? engineColumns.get(id) : undefined) ?? member, members: [member] });
    }
    const siblings = units.map(unit => unit.column);
    return <ul className="space-y-2">{units.map((unit, index) => unit.column.columns.length ?
      <li key={unit.column.id} data-column-pref-block>
        <ul>{columnPrefRow(unit.column, index, siblings)}</ul>
        <div className="ml-3 mt-2">{columnPrefList(unit.members, depth + 1)}</div>
      </li> : columnPrefRow(unit.column, index, siblings))}</ul>;
  }
  const exportItems = (kind: ExportScopeKind, count: number | null) => (['xlsx', 'csv'] as const).map(format =>
    <DropdownMenuItem key={format} className={exportItemClass} disabled={exporting} aria-label={exportItemName(kind, count, format, lang)} onSelect={() => { void runExport(format, kind); }}>
      {format === 'xlsx' ? <FileSpreadsheet className="mr-2 size-3.5" aria-hidden /> : <FileText className="mr-2 size-3.5" aria-hidden />}{FORMAT_LABEL[format]}
    </DropdownMenuItem>);
  // No `ok` result yet (new Context loading, refused page): the count is unknown, so the group label says “필터 결과 전체” with no number.
  const filteredCount = shown?.outcome === 'ok' ? data.total : null;
  const groupIn = groupColumns.length > 0 && overflow.has('group');
  const sizeIn = overflow.has('size');
  const columnsIn = overflow.has('columns');
  const copyIn = canExport && overflow.has('copy');
  const exportIn = canExport && overflow.has('export');
  const hasMore = groupIn || sizeIn || columnsIn || copyIn || exportIn;
  const copyLabel = selectedIds.length === 0 ? m('tableCopy') : m(selectedIds.length === 1 ? 'tableCopyRowsOne' : 'tableCopyRowsMany', { count: selectedIds.length });
  // Same wording as the wide 복사 button's tooltip; the overflow item carries it as its description (no hover/focus tooltip inside a menu).
  const copyHelp = selectionState.all
    ? m('tableCopyAllSelectionBlocked')
    : selectedIds.length === 0
    ? m('tableCopySelectPrompt')
    : m('tableCopyShortcut', { shortcut: shortcutLabel('C') });
  const copyHelpId = `${columnPrefsId}-copy-help`;
  const descriptionId = `${columnPrefsId}-description`;
  const exportBody = <>
    {selectedCount > 0 && <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{exportTarget('selected', selectedCount, lang)}</DropdownMenuLabel>
        {exportItems('selected', selectedCount)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>}
    <DropdownMenuGroup>
      <DropdownMenuLabel>{exportTarget('filtered', filteredCount, lang)}</DropdownMenuLabel>
      {exportItems('filtered', filteredCount)}
    </DropdownMenuGroup>
  </>;
  const moreMenu = hasMore ? <MoreMenu lang={lang} triggerRef={moreButton} onCloseAutoFocus={event => {
    // 「컬럼」 chosen in `⋯`: the popover opens after the menu closed, so the menu's focus return does not take focus from it.
    if (!openColumnsAfterMenu.current) return;
    openColumnsAfterMenu.current = false;
    event.preventDefault();
    columnsOutside.current = false;
    setOverlayOpen(o => ({ ...o, columns: true }));
  }}>
    {groupIn && <GroupSubmenu lang={lang} value={groupBy ?? ''} options={groupColumns} onChange={changeGroup} />}
    {sizeIn && <TableSizeSubmenu lang={lang} value={tableSize} onChange={setTableSize} />}
    {columnsIn && <DropdownMenuItem className={exportItemClass} onSelect={() => { openColumnsAfterMenu.current = true; }}><Columns3 className="mr-2 size-3.5" aria-hidden />{m('tableColumns')}</DropdownMenuItem>}
    {copyIn && <DropdownMenuItem className={exportItemClass} disabled={selectedIds.length === 0 || copying} aria-label={copyLabel} aria-describedby={copyHelpId} aria-keyshortcuts={selectedIds.length > 0 ? 'Control+C Meta+C' : undefined} onSelect={() => { void runCopy(); }}><Copy className="mr-2 size-3.5" aria-hidden />{copyLabel}</DropdownMenuItem>}
    {exportIn && <DropdownMenuSub>
      <DropdownMenuSubTrigger><Download className="mr-2 size-3.5" aria-hidden />{t('export')}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">{exportBody}</DropdownMenuSubContent>
    </DropdownMenuSub> }
  </MoreMenu> : null;
  const columnsButton = <Button variant="secondary" size="toolbar"><Columns3 className="size-3.5" aria-hidden />{m('tableColumns')}</Button>;
  // With 「컬럼」 in `⋯`, the popover anchors to the `⋯` button and is rendered last, so `⋯` ends the row.
  const columnsPopover = <Popover open={overlayOpen.columns} onOpenChange={open => { if (!open) groupEditor.cancel(); setOverlayOpen(o => ({ ...o, columns: open })); }}>
    {columnsIn ? <PopoverAnchor asChild><span className="inline-flex">{moreMenu}</span></PopoverAnchor> : <PopoverTrigger asChild>{columnsButton}</PopoverTrigger>}
    <PopoverContent align="end" className="max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto break-keep" onEscapeKeyDown={event => { if (groupEditor.draft.kind !== 'idle') { event.preventDefault(); closeGroupEditor(); } }} onInteractOutside={() => { columnsOutside.current = true; }} onCloseAutoFocus={columnsIn ? event => {
      event.preventDefault();
      if (!columnsOutside.current) moreButton.current?.focus();
      columnsOutside.current = false;
    } : undefined}>
      {p.editableColumnGroups && groupEditor.draft.kind === 'choose' ? <ColumnGroupChooseView editor={groupEditor} idPrefix={columnPrefsId} onSave={saveGroupMembers} onCancel={() => closeGroupEditor()}
        columns={dataColumns.map(c => ({ id: c.id, label: nameOf(c), hidden: !c.getIsVisible(), group: paths.get(c.id)?.[0] ? columnGroupLabel(p.columnGroups, paths.get(c.id)![0]) : undefined }))} /> : <>
      <p className="t-card-title mb-2">{m('tableColumnPrefsTitle')}</p>
      <div className="space-y-3">
        {pinnedPrefs.length > 0 && <div>
          <p className="mb-1 text-xs text-text-secondary">{m('tableColumnPinned')}</p>
          {columnPrefList(pinnedPrefs)}
        </div>}
        {otherPrefs.length > 0 && <div>
          {pinnedPrefs.length > 0 && <p className="mb-1 text-xs text-text-secondary">{m('tableColumnOther')}</p>}
          {columnPrefList(otherPrefs)}
        </div>}
      </div>
      <p className="sr-only" aria-live="polite">{orderNote}</p>
      {/* Visibility, width, pin and order back to the column defaults; sort, page and selection stay. */}
      <div className="mt-3 flex items-center gap-2">{p.editableColumnGroups && <Button id={groupNewId} type="button" variant="secondary" size="toolbar" onClick={groupEditor.start}>{m('tableGroupNew')}</Button>}<Button type="button" variant="secondary" size="toolbar" onClick={() => { groupEditor.cancel(); resetPreferences(); }}>{m('tableResetPrefs')}</Button></div>
      </>}
      {p.editableColumnGroups && <p className="sr-only" aria-live="polite">{groupEditor.note}</p>}
    </PopoverContent>
  </Popover>;
  const toolbarActions = <>
        {groupColumns.length > 0 && !groupIn && <GroupMenu lang={lang} value={groupBy ?? ''} options={groupColumns} onChange={changeGroup} />}
        {!sizeIn && <TableSizeMenu lang={lang} value={tableSize} onChange={setTableSize} />}
        {!columnsIn && columnsPopover}
        {/* Toolbar D (#172): fixed order [컬럼] [복사] [내보내기 ▾]; the opt-in 「그룹」 menu (#556d) sits before 「컬럼」 — both change what the rows show, and a table without a groupable column keeps the order above. */}
        {canExport && !copyIn && <TooltipProvider delayDuration={200}>
          {/* No selection: aria-disabled (focusable, not native disabled) so the tooltip says why on hover and keyboard focus. */}
          {/* Enabled: the tooltip and aria-keyshortcuts name the shortcut and where it works (UX P3-1). */}
          <Tooltip open={copyTip} onOpenChange={setCopyTip}>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="toolbar" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                aria-disabled={selectedIds.length === 0 || copying || undefined} aria-busy={copying || undefined}
                aria-keyshortcuts={selectedIds.length > 0 ? 'Control+C Meta+C' : undefined}
                onClick={runCopy}>
                {copying ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copyLabel}
              </Button>
            </TooltipTrigger>
            <TooltipContent portal size="sm">{copyHelp}</TooltipContent>
          </Tooltip>
        </TooltipProvider>}
        {canExport && !exportIn && <DropdownMenu onOpenChange={open => setOverlayOpen(o => ({ ...o, export: open }))}>
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
          <DropdownMenuContent align="end" className="min-w-56">{exportBody}</DropdownMenuContent>
        </DropdownMenu>}
        {columnsIn ? columnsPopover : moreMenu}
        {/* The overflow 복사 item's description lives outside the portaled menu so the menu's item text stays the label (aria-describedby). */}
        {copyIn && <span id={copyHelpId} className="sr-only">{copyHelp}</span>}
        {/* Visually hidden (width-stable) so screen readers hear what the export is preparing (#173 UX P2-3). */}
        {/* Always mounted while export is available; only the text changes, so screen readers announce it (#173 review N-P3-2). */}
        {canExport && <span role="status" className="sr-only" data-testid="export-status">{[exportNote, copyNote].filter(Boolean).join(' · ')}</span>}
  </>;
  const filterLine = filterFields.length > 0 && <div className={cn('min-w-0 flex-1', mergeToolbar && hasLead ? 'basis-40' : (!mergeToolbar || !!p.pageControls) && 'basis-80')}><FilterLine fields={filterFields} filters={columnFilters.filters} lang={lang} dropped={droppedNote.dropped} onChange={droppedNote.change} onClear={() => { columnFilters.clear(); droppedNote.reset(); }} limit={columnFilters.limit} check={p.urlState?.validate} /></div>;
  const resultCount = <span ref={countSpan.ref} className={cn('tabular whitespace-nowrap', !mergeToolbar && 'ml-auto')}>{!shown || (loading && outOfRange) ? t('loading')
        : !success ? '—'
        : p.externalPagination ? p.externalPagination.summary
        : outOfRange
          ? m('tableSummaryOutOfRange', { total: formatNumber(data.total, lang), pages: pageCount })
          : m('tableSummaryPage', { total: formatNumber(data.total, lang), page: shownPage + 1, pages: pageCount })}</span>;
  const resultLine = (
    <div ref={statusLine.ref} data-table-status-line className={cn('relative flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted', p.fill && 'shrink-0', !mergeToolbar && 'min-h-9 border-t border-border-subtle px-3 py-1.5')} aria-live={groupedOutcome ? 'off' : 'polite'}>
      {!mergeToolbar && filterLine}
      {alwaysMerge ? <span className="inline-flex items-center gap-2"><ToolbarDescription subtitle={p.subtitle} lang={lang} descriptionId={descriptionId} />{resultCount}</span> : resultCount}
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {loading && shown && <span ref={refreshSpan.ref} role={groupedOutcome ? undefined : 'status'} className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />{t('refreshing')}</span>}
        {shown && <DataTrustIndicator trust={shown.trust} assessments={shown.assessments} className="min-h-6" wrap summary={statusNarrow} />}
        {shown && <DataTrustIndicator trust={shown.trust} assessments={shown.assessments} probe={probe.ref} />}
      </span>
    </div>
  );
  return <section ref={section} tabIndex={-1} aria-label={p.ariaLabel} aria-describedby={p.subtitle ? descriptionId : undefined} onKeyDown={onShortcut} style={sizeVars} data-table-size={tableSize} className={cn('flex flex-col rounded-lg border border-border-subtle bg-surface-card', embedded && 'rounded-none border-0 shadow-none', p.fill && 'min-h-0 max-h-full shrink')}>
    {/* R2 (#1234, #2310): lead, page controls and filters (left), results + controls (right) in one band; workspace panels retain two bands. */}
    <div ref={toolbar.ref} data-table-toolbar className={cn('flex items-center justify-between gap-2', p.fill && 'shrink-0', embedded ? 'min-h-10 px-2 py-1.5' : densePage ? 'min-h-14 px-3 py-3' : 'min-h-14 p-4', analysisSection && 'pr-12', mergeToolbar && 'flex-wrap')}>
      {/* With page controls the merged left group wraps: the filters (basis 320) drop under the controls instead of shrinking to nothing. */}
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', mergeToolbar && (p.pageControls || hasLead) && 'flex-wrap', mergeToolbar && (leftBasis ? 'basis-(--ap-table-left-basis)' : filterFields.length > 0 ? 'basis-80' : !p.pageControls && !hasLead && 'sr-only'))}
        style={mergeToolbar ? leftBasis : undefined}>
        {/* The lead keeps one shape (title ⓘ, fixed-width search) in both layouts so its measured width does not depend on the band choice. */}
        {hasLead
          ? <div ref={lead.ref} data-table-lead className="flex min-w-0 max-w-full shrink-0 items-center gap-2">
              <div className="min-w-0 max-w-80"><ToolbarTitle title={p.title} subtitle={p.subtitle} srOnly={!titleShown} lang={lang} descriptionId={descriptionId} /></div>
              {p.search && <div data-table-search className="w-56 min-w-0">{p.search}</div>}
            </div>
          : <ToolbarTitle title={p.title} subtitle={mergeToolbar ? undefined : p.subtitle} srOnly={inPanel || !!p.hideTitle} lang={lang} descriptionId={descriptionId} />}
        {!hasLead && p.search && <div data-table-search className="min-w-0 max-w-xs flex-1">{p.search}</div>}
        {p.pageControls && <div ref={pageControls.ref} data-table-page-controls className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{p.pageControls}</div>}
        {mergeToolbar && filterLine}
      </div>
      <div className={cn('flex items-center gap-2', mergeToolbar ? 'ml-auto min-w-0 max-w-full flex-wrap justify-end' : 'shrink-0')}>
        {mergeToolbar && resultLine}
        {canMerge ? <div ref={toolbarControls.ref} data-table-controls className="flex shrink-0 items-center gap-2">{toolbarActions}</div> : toolbarActions}
      </div>
    </div>

    {!mergeToolbar && resultLine}

    <SelectAllBar lang={lang} pageRows={data.rows.length} total={data.total} offer={selectionState.offerAll} all={selectionState.all} excluded={selectionState.excludedIds.length} onSelectAll={selectionState.selectAll} onClear={clearSelection} />

    {selectedCount > 0 && <div className="flex min-h-10 flex-wrap items-center gap-3 border-t border-border-subtle bg-accent-primary-soft px-3 py-2 text-xs">
      <span className="font-semibold tabular" data-testid="selected-count">{selectionState.all
        ? (selectionState.excludedIds.length > 0
          ? m('tableSelectedExcluded', { total: formatNumber(selectionState.all.total, lang), excluded: formatNumber(selectionState.excludedIds.length, lang) })
          : m('tableSelectedAll', { total: formatNumber(selectionState.all.total, lang) }))
        : m('tableSelectedCount', { count: selectedCount })}</span>
      {selectionState.selection?.kind === 'ids' && p.bulkActions?.(selectionState.selection.ids)}
      {selectionState.selection && p.bulkSelectionActions?.(selectionState.selection, { filters: effectiveFilters, sorting: activeSorting })}
      {!selectionState.all && <Button variant="ghost" size="toolbar" onClick={clearSelection}>{m('tableClearSelection')}</Button>}
      {hiddenSelected > 0 && <span className="tabular" data-testid="selected-collapsed-note">{m('tableSelectedCollapsedNote', { count: formatNumber(hiddenSelected, lang) })}</span>}
      <span className="text-text-secondary">{m('tableSelectionPolicy')}</span>
    </div>}

    {/* Stable widget wrapper (like QueryView's): the busy state survives the outcome/rows switch. A grouped table's refresh is announced by the scope only (components.md §공유 위젯 응답). */}
    <div aria-busy={loading} className={p.fill ? 'flex min-h-0 flex-col' : undefined}>
    {shown && shown.outcome !== 'ok' ? <div ref={outcome} onFocus={() => { focusedRetry.current = true; }} onBlur={() => { focusedRetry.current = false; }} className="border-t border-border-subtle p-3"><OutcomeContent response={shown} onRetry={retry} emptyAction={p.emptyAction ?? (effectiveFilters.length > 0 ? <Button type="button" size="sm" variant="secondary" onClick={() => { columnFilters.clear(); droppedNote.reset(); }}>{t('clearConditions')}</Button> : undefined)} grouped={groupedOutcome} bannerId={outcomeBannerId} multipleGroups={multipleOutcomeGroups} compact={groupedOutcome || undefined} widgetName={p.ariaLabel} hideWidgetName>{() => null}</OutcomeContent></div> :
      // eslint-disable-next-line shadcn/no-inline-styles -- viewport max height comes from the height prop or the measured page fit at runtime
      <div ref={viewportRef} data-table-auto-fit={p.height === undefined && !p.fill ? '' : undefined} tabIndex={0} aria-label={SCROLLPORT_LABEL[lang]} className={cn('scrollbar-panel overflow-auto border-t border-border-subtle [overflow-anchor:none]', p.fill && 'min-h-0', chainWheel ? 'overscroll-auto' : 'overscroll-contain')} onScroll={updateFade} style={{ maxHeight: p.height ?? (p.fill ? undefined : fit.cap ?? ROW_AREA_FALLBACK) }}>
        {/* eslint-disable-next-line shadcn/no-inline-styles -- table width is the total column size computed at runtime */}
        <div ref={pan.ref} role="table" aria-label={p.ariaLabel} aria-rowcount={groupedItems || p.externalPagination ? -1 : data.total + headerRowCount} aria-busy={loading} className={cn('min-w-full', pan.groups.size > 0 && 'group/pan-table')} style={{ width: tableWidth }}>
          <div role="rowgroup" className="sticky top-0 z-[5]">
            {headerRows.map((headers, depth) => <div role="row" key={depth} aria-rowindex={hasColumnGroups ? depth + 1 : undefined} className="flex">{renderCells(headers, item => item.header.column, ({ header: h, side }) => {
              const isGroup = h.column.columns.length > 0 && !h.isPlaceholder;
              const path = (paths.get(h.column.id) ?? []).map(id => columnGroupLabel(p.columnGroups, id)).join(', ');
              const sorted = h.column.getIsSorted();
              const panGroup = pan.groups.get(h.column.id);
              const editableGroup = !!p.editableColumnGroups && isGroup && !h.column.parent;
              if (isGroup || h.isPlaceholder) {
                // eslint-disable-next-line shadcn/no-inline-styles -- group span and pin offsets sum the rendered leaf widths
                return <div role="columnheader" key={h.id} data-column={h.column.id} aria-label={editableGroup ? nameOf(h.column) : undefined} aria-colspan={isGroup ? h.colSpan : undefined} tabIndex={panGroup && panGroup.max > 0 ? 0 : undefined} aria-description={panGroup && panGroup.max > 0 ? m('tableColumnGroupPanHint') : undefined} style={isGroup ? groupHeadStyle(h, side) : headStyle(h.column)}
                  className={cn(headerBase, 't-table-header border-b border-border-subtle bg-surface-sunken text-text-secondary', isGroup && 'overflow-visible', lineClass(h.column.getLeafColumns()[0]?.id ?? h.column.id, false), panGroup && panGroup.max > 0 && 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring', side === 'right' && pinEdge, fadeClass(h.column.getLeafColumns().some(c => inWidthGroup(c.id)) ? false : side, false))}>
                  {/* eslint-disable-next-line shadcn/no-inline-styles -- keep the top-level label in its declared clip span as member columns pan underneath */}
                  {isGroup && <span className={cn('sticky left-0 min-w-0', editableGroup ? 'flex h-full w-full items-center break-keep' : 'truncate')} style={panGroup ? { transform: `translateX(var(${panGroup.variable}, 0px))`, maxWidth: panGroup.width - CELL_INLINE_PADDING } : undefined} title={nameOf(h.column)}>
                    <span className="min-w-0 truncate">{nameOf(h.column)}</span>
                    {editableGroup && <ColumnGroupResizer id={h.column.id} controlId={`${columnPrefsId}-${h.column.id}-resize`} name={nameOf(h.column)} width={panGroup?.width ?? displayedSize(h.column.getLeafColumns())} widthScale={widthScale} resize={groupResize} onWidth={setGroupWidth} />}
                  </span>}
                </div>;
              }
              // eslint-disable-next-line shadcn/no-inline-styles -- column width and pin offset come from column sizing at runtime
              return <div role="columnheader" key={h.id} data-column={h.column.id} style={headStyle(h.column)} title={typeof h.column.columnDef.header === 'string' ? h.column.columnDef.header : undefined}
                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : h.column.getCanSort() ? 'none' : undefined}
                className={cn(headerBase, 'group/head t-table-header border-b border-border-subtle bg-surface-sunken text-text-secondary', lineClass(h.column.id), h.column.getIsPinned() === 'right' && pinEdge, fadeClass(inWidthGroup(h.column.id) ? false : h.column.getIsPinned(), false), align(h.column))}>
                {h.column.getCanSort()
                  ? <button type="button" onClick={h.column.getToggleSortingHandler()} className="-mx-1 inline-flex min-w-0 items-center gap-1 rounded-xs px-1 uppercase hover:text-text-primary">
                      <span className="min-w-0 truncate">{path && <span className="sr-only">{path}, </span>}{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      {sorted === 'asc' ? <ArrowUp className="size-3 shrink-0" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3 shrink-0" aria-hidden /> : <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />}
                    </button>
                  : <span className="min-w-0 truncate">{path && <span className="sr-only">{path}, </span>}{flexRender(h.column.columnDef.header, h.getContext())}</span>}
                {(() => {
                  const field = filterFields.find(f => f.origin === 'column' && f.id === h.column.id);
                  return field ? <HeaderFunnel field={field} lang={lang} limit={columnFilters.limit} check={fieldCheck(field, columnFilters.filters, filterFields, p.urlState?.validate)} active={columnFilters.filters.find(f => f.id === field.id)} onApply={next => droppedNote.change(field, next)} /> : null;
                })()}
                {/* #239: an always-visible 1px divider with an 8px grab area; double-click restores the default width. */}
                {h.column.getCanResize() && <div aria-hidden data-column-resizer onMouseDown={startResize(h)} onTouchStart={startResize(h)} onDoubleClick={event => { event.preventDefault(); h.column.resetSize(); }} className="group/resize absolute right-0 top-0 flex h-full w-2 cursor-col-resize touch-none justify-end">
                  <span className={cn('h-full w-px', h.column.getIsResizing() ? 'bg-accent-primary' : 'bg-border-subtle group-hover/resize:bg-accent-primary')} />
                </div>}
              </div>;
            })}</div>)}
          </div>
          {!shown ? <div className="space-y-2 p-3" aria-hidden>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div> :
            // eslint-disable-next-line shadcn/no-inline-styles -- total row height comes from the virtualizer at runtime
            <div role="rowgroup" className="relative" style={{ height: virtual.getTotalSize() }}>{virtual.getVirtualItems().map(item => {
              const entry = items[item.index];
              if (entry.kind === 'group') {
                // Layout from the DISPLAYED order (left-pinned, centre, right-pinned — as header and row cells): the leading label cell stops before the first subtotal column, so every subtotal stays under its own column.
                const displayed = [...table.getLeftVisibleLeafColumns(), ...table.getCenterVisibleLeafColumns(), ...table.getRightVisibleLeafColumns()];
                const subtotalIds = new Set(p.columns.filter(c => c.subtotal).map(c => c.id));
                const { leading, trailing, leadSubtotal } = groupHeaderLayout<Column<T>>(displayedUnits(displayed, c => inWidthGroup(c.id) ? paths.get(c.id) : undefined), c => c.getIsPinned() === 'right', subtotalIds);
                return <div role="row" key={entry.key} ref={virtual.measureElement} data-index={item.index} data-group-row={entry.group.key} aria-rowindex={item.index + headerRowCount + 1}
                  // eslint-disable-next-line shadcn/no-inline-styles -- row offset is the virtual item position computed at runtime
                  className="group absolute left-0 top-0 flex w-full" style={{ transform: `translateY(${item.start}px)` }}>
                  <GroupHeaderCells lang={lang} item={entry} onToggle={() => toggleGroup(entry.group.key)}
                    cellClassName={cn(cellBase, 'border-b border-border-subtle bg-surface-sunken', cellText)} labelClassName={cellText}
                    lead={{ style: { width: displayedSize(leading), flexShrink: 0 }, span: leading.length, stickyLeft: displayedSize(table.getLeftVisibleLeafColumns()), subtotal: leadSubtotal ? { id: leadSubtotal.id } : undefined }}
                    leadingCells={hasColumnGroups ? leading.map(c => ({ id: c.id, subtotal: subtotalIds.has(c.id), style: cellStyle(c), className: cn(lineClass(c.id), c.getIsPinned() === 'right' && pinEdge) })) : undefined}
                    renderCells={(cells, render) => renderCells(cells, cell => table.getColumn(cell.id)!, render)}
                    trailing={trailing.map(c => ({ id: c.id, subtotal: subtotalIds.has(c.id), style: cellStyle(c), className: cn(lineClass(c.id), c.getIsPinned() === 'right' && pinEdge) }))} />
                </div>;
              }
              const row = entry.row;
              const active = p.activeRowId === row.id;
              // Weight goes to the first cell with content — the selection checkbox and the trailing action stay unweighted (UXA-5).
              const cells = row.getVisibleCells();
              const firstDataCell = cells.findIndex(cell => cell.column.id !== '_select' && cell.column.id !== '_action');
              const muted = p.isRowMuted?.(row.original) === true;
              return <div role="row" key={row.id} ref={virtual.measureElement} data-index={item.index} aria-rowindex={groupedItems ? item.index + headerRowCount + 1 : shownPage * pageSize + item.index + headerRowCount + 1}
                aria-selected={row.getIsSelected()} aria-current={active ? 'true' : undefined} data-row-id={row.id} data-muted={muted ? 'true' : undefined}
                // eslint-disable-next-line shadcn/no-inline-styles -- row offset is the virtual item position computed at runtime
                className="group absolute left-0 top-0 flex w-full" style={{ transform: `translateY(${item.start}px)` }}>
                {/* The active bar rides a zero-width element pinned to the scrollport's left edge, so it stays visible at
                    any horizontal scroll — the same sticky mechanism as the fixed columns (zIndex 2) beside it (UXA-5). */}
                {active && <div aria-hidden data-active-row-marker className="sticky left-0 z-[3] w-0">
                  <span aria-hidden className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-accent-primary" />
                </div>}
                {/* eslint-disable-next-line shadcn/no-inline-styles -- cell width and pin offset come from column sizing at runtime */}
                {renderCells(cells, cell => cell.column, cell => <div role="cell" key={cell.id} data-column={cell.column.id} style={cellStyle(cell.column)}
                  className={cn(cellBase, 'border-b border-border-subtle bg-surface-card', cellText, 'group-hover:bg-surface-row-hover group-aria-selected:bg-surface-row-selected', active && 'bg-surface-row-selected', active && cells.indexOf(cell) === firstDataCell && 'font-medium', muted && cell.column.id !== '_select' && cell.column.id !== '_action' && cn('text-text-muted group-hover:text-text-secondary group-aria-selected:text-text-secondary', active && 'text-text-secondary'), cell.column.id === '_action' && (actionCompact ? 'py-0 px-0' : 'py-0'), lineClass(cell.column.id), cell.column.getIsPinned() === 'right' && pinEdge, fadeClass(inWidthGroup(cell.column.id) ? false : cell.column.getIsPinned(), true, active), align(cell.column))}>
                  {/* The _action column cell is not used — rowAction renders directly to preserve DOM identity (#296). */}
                  {cell.column.id === '_action' ? p.rowAction?.(row.original, { compact: actionCompact }) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>, { body: true, active })}
              </div>;
            })}</div>}
        </div>
      </div>}
    </div>

    <div className={cn("flex items-center justify-end gap-2 border-t border-border-subtle p-2", p.fill && "shrink-0")}>
      {p.externalPagination ? p.externalPagination.controls : <><Button ref={previousButton} variant="secondary" size="toolbar" disabled={previousDisabled}
        aria-disabled={loading || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onFocus={() => { focusedPager.current = 'previous'; }} onBlur={() => { focusedPager.current = null; }}
        onClick={() => {
          if (loading) return;
          // zero-based target; controlled mode reports 1-based with null = page 1 (§6.1).
          if (p.urlState) p.urlState.onChange({ sorting: p.urlState.sorting, page: effectivePage === 1 ? null : effectivePage }, 'user');
          else setPage(effectivePage - 1);
          if (viewport.current) viewport.current.scrollTop = 0;
        }}>{m('tablePreviousPage')}</Button>
      <Button ref={nextButton} variant="secondary" size="toolbar" disabled={nextDisabled}
        aria-disabled={loading || undefined} className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        onFocus={() => { focusedPager.current = 'next'; }} onBlur={() => { focusedPager.current = null; }}
        onClick={() => {
          if (loading) return;
          if (p.urlState) p.urlState.onChange({ sorting: p.urlState.sorting, page: effectivePage + 2 }, 'user');
          else setPage(effectivePage + 1);
          if (viewport.current) viewport.current.scrollTop = 0;
        }}>{m('tableNextPage')}</Button></>}
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

const ANCHORED_OVERLAY = '[data-table-toolbar] [aria-expanded="true"], [data-table-status-line] [aria-expanded="true"]';

/** #2310: whether a popover or menu anchored in the toolbar or result line is open (its trigger has `aria-expanded="true"`). */
function useAnchoredOverlayOpen(section: RefObject<HTMLElement | null>, enabled: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = section.current;
    if (!enabled || !root) { setOpen(false); return; }
    const read = () => setOpen(root.querySelector(ANCHORED_OVERLAY) !== null);
    const observer = new MutationObserver(read);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    read();
    return () => observer.disconnect();
  }, [section, enabled]);
  return open;
}
