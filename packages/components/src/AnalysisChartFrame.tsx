import { toMs, unknownLabel } from './analysisChartShared';
import { BrushIcon, Download, GitCompare, MessageSquarePlus, MoreHorizontal, RotateCcw, Table2, ZoomIn } from 'lucide-react';
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { useI18n, usePlatform } from '@ap/kernel';
import { formatDateTime } from '@ap/contracts';
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, prefersReducedMotion } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { AnalysisSectionContext, resolveAnalysisChartSize, analysisChartHeight, FILL_CARD_CLASS, FILL_CHART_MIN_HEIGHT, FILL_PLOT_BASE_CLASS, FILL_PLOT_CLASS, type ChartSize } from './AnalysisSectionContext';
import { useElementHeight } from './useElementHeight';
import { EChart, strokeToken, token } from './EChart';
import { downloadChartCsv } from './analysisChartCsv';
import { assignNoteLevels } from './annotationLayout';
import { buildChartOption, linePattern, resolveChartPalette } from './buildChartOption';
import { useAnnotationDeleteFocus, useAnnotationEditor } from './useAnnotationEditor';
import { useChartRange, type ClipResult, type Selection } from './useChartRange';
import { usePointMenu } from './usePointMenu';
import { seriesExtremes } from './chartLanes';
import { clampRowPitch, revealScrollTop, rowFocusDiagnostic, rowPitchChartHeight, ROW_PITCH_MIN } from './analysisChartGeometry';

import { AnalysisChartPart, ChartHeading, ChartTrustFooter } from './analysisChartFrameParts';

export type ChartSeries = {
  id: string;
  name: string;
  /** Public CSS custom property name from @ap/ui/theme, e.g. 'chart-blue'. */
  color: ThemeColorToken;
  /** [x, y]: x is a naive wall-clock datetime (time axis) or a category label. null = unknown, never 0. */
  points: [string, number | null][];
  kind?: 'line' | 'bar';
  dashed?: boolean;
};

/** FILL_PLOT_CLASS with its overflow-hidden split, so the row-pitch window scrolls vertically only. */
const FILL_PLOT_SCROLL_BASE_CLASS = 'grow basis-0 overflow-x-hidden overflow-y-auto';
const FILL_PLOT_SCROLL_CLASS = `min-h-80 ${FILL_PLOT_SCROLL_BASE_CLASS}`;
/** Below this the axes and labels stop being readable, so `fillMin` never goes lower. */
const FILL_MIN_FLOOR = 160;
/** Capture-phase on the plot wrapper: without Shift the wheel never reaches zrender, so the browser scrolls the nearest container. No preventDefault. */
const stopPlainWheel = (event: WheelEvent) => { if (!event.shiftKey) event.stopPropagation(); };
/** The width assumed before the chart instance exists. */
const NOTE_FALLBACK_WIDTH = 640;
const fmt = (v: string) => v.replace('T', ' ').slice(0, 16);
const HOUR_MS = 3_600_000;

/** Current-period bar starts, plus the query end, plus a query start that precedes the first bar. No invented spacing. Without a query end there are no boundaries: snapping falls back to raw seconds (06 §16). */
function timeBoundaries(series: ChartSeries[], periodFrom: string | null, periodTo: string | null): string[] {
  if (periodTo === null) return [];
  const starts = [...new Set(series.flatMap(s => s.points.map(([x]) => x)))].sort();
  if (starts.length === 0) return [];
  const bounds = [...starts];
  if (periodFrom && periodFrom < starts[0]) bounds.unshift(periodFrom);
  if (periodTo && !bounds.includes(periodTo)) bounds.push(periodTo);
  return [...new Set(bounds)].sort();
}

/** Floor the start and ceil the end onto boundaries. Fewer than two boundaries keeps second precision. A side with no boundary stays put. */
function snapOutward(fromMs: number, toMsValue: number, bounds: readonly string[]): Selection | null {
  let from = formatDateTime(new Date(Math.floor(fromMs / 1000) * 1000));
  let to = formatDateTime(new Date(Math.ceil(toMsValue / 1000) * 1000));
  if (bounds.length >= 2) {
    const ms = bounds.map(bound => toMs(bound));
    let lo = -1;
    for (let i = 0; i < ms.length; i++) if (ms[i] <= fromMs) lo = i;
    if (lo >= 0) from = bounds[lo];
    for (let i = 0; i < ms.length; i++) if (ms[i] >= toMsValue) { to = bounds[i]; break; }
  }
  if (from >= to) return null;
  return { from, to };
}

/** Clip only while Compare is on and both query ends exist. Snap has already run. */
function clipToPeriod(range: Selection, periodFrom: string | null, periodTo: string | null, clip: boolean): ClipResult {
  if (!clip || periodFrom === null || periodTo === null) return { range, notice: null };
  if (range.to <= periodFrom || range.from >= periodTo) return { range: null, notice: 'outside' };
  const from = range.from < periodFrom ? periodFrom : range.from;
  const to = range.to > periodTo ? periodTo : range.to;
  if (from >= to) return { range: null, notice: 'outside' };
  const clipped = from !== range.from || to !== range.to;
  return { range: { from, to }, notice: clipped ? 'partial' : null };
}

/** A quick range ending at the query end. Hidden when the data span is shorter, or snapping would land wider than asked. */
function presetWindow(hours: number, bounds: readonly string[], periodTo: string): Selection | null {
  if (bounds.length < 2) return null;
  const span = toMs(bounds[bounds.length - 1]) - toMs(bounds[0]);
  if (span < hours * HOUR_MS) return null;
  const snapped = snapOutward(toMs(periodTo) - hours * HOUR_MS, toMs(periodTo), bounds);
  if (!snapped) return null;
  if (toMs(snapped.to) - toMs(snapped.from) > hours * HOUR_MS) return null;
  return snapped;
}

function withBound(options: readonly string[], value: string): string[] {
  return options.includes(value) ? [...options] : [...options, value].sort();
}

function svgDasharray(pattern: ReturnType<typeof linePattern>): string | undefined {
  return Array.isArray(pattern) ? pattern.join(' ') : undefined;
}

/** A consumer-owned point identity; activation never navigates by itself. */
export type ChartPoint = { x: string; seriesId: string; value: number | null };
export type ChartPointAction = { id: string; label: string; onSelect: (point: ChartPoint) => void; disabled?: boolean;
  /** The action may change page keys but does not move the user: when the menu closes, focus returns to `지점 동작` even though the URL changed (06 §16). */
  keepsFocus?: boolean };
type PointEvent = { seriesId?: string; value?: unknown; name?: string; dataIndex?: number; event?: { event?: { preventDefault?: () => void } } };
const pointKey = (point: ChartPoint) => JSON.stringify([point.seriesId, point.x]);

export type AnalysisChartFrameProps = {
  chartId: string;
  title: ReactNode;
  description?: ReactNode;
  metricVersion?: string;
  series: ChartSeries[];
  /** Shown only while Compare is on (e.g. previous period, other group). */
  compareSeries?: ChartSeries[];
  xType?: 'time' | 'category';
  /** Category axes only: horizontal bars with consumer labels in top-to-bottom order. */
  orientation?: 'vertical' | 'horizontal';
  /** Controlled visibility includes current and comparison series IDs. */
  visibleSeriesIds?: readonly string[];
  onVisibleSeriesChange?: (ids: string[]) => void;
  pointActivation?: { on: 'click' | 'dblclick'; onActivate: (point: ChartPoint) => void };
  /** A list, or a function of the selected point evaluated when the menu opens. `지점 동작` is disabled while the list for the selected point is empty. */
  pointActions?: readonly ChartPointAction[] | ((point: ChartPoint) => readonly ChartPointAction[]);
  /** Points for which this returns false are not offered by the point selector, never reached by the keyboard picker, and ignored on click, double-click and context menu. Keep the function stable (memoize it), like `series`. */
  isPointSelectable?: (point: ChartPoint) => boolean;
  /** Default true. False omits the Frame's own series legend and checkboxes, for a page that owns visibility through `visibleSeriesIds`. */
  legend?: boolean;
  /** `size="fill"` only: the least plot height, px. Default 320; values below 160 are raised to 160 (axes and labels stop being readable) with a dev warning. */
  fillMin?: number;
  unit: string;
  valueFormat?: (v: number) => string;
  height?: number; size?: ChartSize;
  trust?: { source: string; updated: string; coverage: string };
  /** Time axis only: allow promoting a brushed range to the global period (explicit Apply). */
  canApplyRange?: boolean;
  /** Page-owned actions for the current brushed selection (e.g. filter a table). */
  selectionActions?: (selection: Selection) => ReactNode;
  /** Explicit drill-down on a data point; charts never silently mutate global Context on click. */
  onPointClick?: (x: string, seriesId: string) => void;
  pointClickHint?: string;
  markLines?: { y: number; label: string }[];
  extraActions?: ReactNode;
  stacked?: boolean;
  /**
   * Horizontal category charts only (ignored elsewhere, with a dev warning). Controlled row highlight: while the prop is present (null = no row)
   * the frame never changes its own highlight; it draws a border on that row's bars and a bold category label, and names the row in the selection summary.
   */
  activeCategory?: string | null;
  /** A bar click ('pointer') or the point picker moving to a row ('keyboard'). On a click this runs before `pointActivation.onActivate`; the two are separate (06 §16, ADR-0079). */
  onActiveCategoryChange?: (category: string | null, how: 'pointer' | 'keyboard') => void;
  /** With `rowPitch`: when `activeCategory` changes from outside, scroll that row into view inside the frame. Never moves focus; a change that came from this frame's own click does not scroll. */
  revealActive?: boolean;
  /** Horizontal only: px per row, minimum 24 (WCAG 2.2 2.5.8). The plot becomes `rows × pitch + axes` tall and scrolls inside the frame; category zoom is off, Brush stays. Menus cap the rows through the endpoint's `limits.maxRows` (06 §15). */
  rowPitch?: number;
  /** Horizontal + stacked only (ignored elsewhere, with a dev warning). Visual only: each series gets a lane as wide as its largest value and every row's piece starts at its lane's left edge; values, totals, table and export are unchanged. The value axis shows lane names instead of numbers, and Brush is off (x is no longer one value scale). */
  startAlign?: boolean;
  /** Horizontal only. Per series (category), outlines the segment with its smallest and the one with its largest value and labels them 최소/최대. `null`, points `isPointSelectable` rejects, hidden series and series with fewer than 2 measured rows are left out. */
  minMax?: boolean;
};

/**
 * §16 Chart Frame: Title/Actions → Description/Metric Version → Legend → Plot → Selection Summary → Source·Updated·Coverage.
 * State layers stay separate: Global Context (URL) · Page Filter (page) · Chart Local State (here) · Persistent Annotation (server, keyed by chartId + Scope).
 * Compare/Annotate/Export follow the current menu's manifest `features`; a chart outside a routed menu offers none of them.
 */
export function AnalysisChartFrame(p: AnalysisChartFrameProps) {
  const { t, lang } = useI18n();
  const analysisSection = useContext(AnalysisSectionContext);
  const size = resolveAnalysisChartSize(p.size, analysisSection);
  const compact = size === 'compact';
  const fill = useElementHeight(size === 'fill');
  const fillMin = p.fillMin === undefined ? FILL_CHART_MIN_HEIGHT : Math.max(FILL_MIN_FLOOR, p.fillMin);
  const loweredFill = fillMin !== FILL_CHART_MIN_HEIGHT;
  const viewportHeight = p.height ?? (size === 'fill' ? Math.max(fillMin, fill.height ?? 0) : analysisChartHeight(size, 260));
  const { setGlobal, toast, global, adapter, route, url } = usePlatform();
  const features = route?.menu.features;
  const canCompare = !!features?.compare && !!p.compareSeries?.length;
  const canAnnotate = !!features?.annotate;
  const canExport = !!features?.export;
  const titleId = useId();
  const currentPeriodId = useId();
  const previousPeriodId = useId();
  const xType = p.xType ?? 'time';
  const horizontal = xType === 'category' && p.orientation === 'horizontal';
  const chart = useRef<ECharts | null>(null);
  // Focus anchors for the confirm row (#297 UX): it unmounts on both outcomes, so its handlers hand focus back —
  // cancel to the "Apply analysis range…" button, apply (selection cleared by the Context change) to the brush toggle.
  const brushToggle = useRef<HTMLButtonElement | null>(null);
  const rangeStart = useRef<HTMLButtonElement | null>(null);
  // Set when the keyboard turns brush mode on in a fill card: the range form appears then and takes focus (ADR-0067 decision 21).
  const focusRangeForm = useRef(false);
  const applyRangeButton = useRef<HTMLButtonElement | null>(null);
  const annotateButton = useRef<HTMLButtonElement | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const menu = usePointMenu(url);
  const pointChart = menu.chartRef;
  const { selectedKey: selectedPointKey, setSelectedKey: setSelectedPointKey, openMenu: openPointMenu } = menu;
  // Plain wheel over the plot scrolls the page: zrender's local listener never sees it. Shift+wheel passes through to ECharts zoom (§16).
  const wheelNode = useRef<HTMLDivElement | null>(null);
  const wheelPassThrough = useCallback((node: HTMLDivElement | null) => {
    if (wheelNode.current === node) return;
    wheelNode.current?.removeEventListener('wheel', stopPlainWheel, { capture: true });
    wheelNode.current = node;
    node?.addEventListener('wheel', stopPlainWheel, { capture: true, passive: true });
  }, []);
  const [compare, setCompare] = useState(false);
  const activeCategory = horizontal ? p.activeCategory : undefined;
  const rowPitch = horizontal && p.rowPitch !== undefined ? clampRowPitch(p.rowPitch) : undefined;
  // The category the last pointer click reported: the row is already visible, so that echo must not scroll.
  const [pointerRequest, setPointerRequest] = useState<string | null>(null);
  const revealedCategory = useRef<string | null | undefined>(undefined);
  const { startAlign: rawStartAlign, stacked: rawStacked, minMax: rawMinMax } = p;
  const { rowPitch: rawRowPitch, activeCategory: rawActive, onActiveCategoryChange, revealActive } = p;
  useEffect(() => {
    if (!horizontal && (rawRowPitch !== undefined || rawActive !== undefined || onActiveCategoryChange || revealActive)) rowFocusDiagnostic('activeCategory, onActiveCategoryChange, revealActive and rowPitch apply only to orientation="horizontal" with a category x axis; ignored.');
    if (rawStartAlign && !(horizontal && rawStacked)) rowFocusDiagnostic('startAlign applies only to a stacked chart with orientation="horizontal"; ignored.');
    if (rawMinMax && !horizontal) rowFocusDiagnostic('minMax applies only to orientation="horizontal" with a category x axis; ignored.');
    if (horizontal && rawRowPitch !== undefined && !(rawRowPitch >= ROW_PITCH_MIN)) rowFocusDiagnostic(`rowPitch ${rawRowPitch} is below the ${ROW_PITCH_MIN}px target size; using ${ROW_PITCH_MIN}.`);
  }, [horizontal, rawRowPitch, rawActive, onActiveCategoryChange, revealActive, rawStartAlign, rawStacked, rawMinMax]);
  // Bumped from onReady: imperative instance effects below must replay once the lazy EChartImpl
  // creates the instance (a Brush click during chunk load would otherwise never reach it, #48 P1).
  const rawFillMin = p.fillMin; const legendProp = p.legend; const controlledVisibility = p.visibleSeriesIds !== undefined;
  useEffect(() => {
    if (rawFillMin !== undefined && !(rawFillMin >= FILL_MIN_FLOOR)) rowFocusDiagnostic(`fillMin ${rawFillMin} is below ${FILL_MIN_FLOOR}px, where axes and labels stop being readable; using ${FILL_MIN_FLOOR}.`);
    if (legendProp === false && !controlledVisibility) rowFocusDiagnostic('legend={false} without visibleSeriesIds leaves the user no way to toggle series; pass visibleSeriesIds or keep the legend.');
  }, [rawFillMin, legendProp, controlledVisibility]);
  const [instanceReady, setInstanceReady] = useState(0);
  // The chart instance's width in px: label budgets are cut from it, so a container resize must reach the option (#399 F3).
  const [chartWidth, setChartWidth] = useState(NOTE_FALLBACK_WIDTH);
  const { state: range, actions: rangeActions } = useChartRange();
  const { selection, preview, zoom, clipNotice, rangeDraft } = range;
  const startAlign = horizontal && !!p.stacked && !!p.startAlign;
  // StartAlign turns Brush off: x is no longer one value scale, so a dragged range would not mean seconds.
  const brushMode = range.brushMode && !startAlign;
  const [showTable, setShowTable] = useState(false);
  const scopeId = global.scopeId;
  const editor = useAnnotationEditor({ chartId: p.chartId, scopeId, canAnnotate });
  const { annotations, note, closeEditor } = editor;

  const allSeries = useMemo(() => [...p.series, ...(compare && canCompare ? p.compareSeries ?? [] : [])], [p.series, p.compareSeries, compare, canCompare]);
  const previousIds = useMemo(() => new Set(compare && canCompare ? p.compareSeries?.map(s => s.id) ?? [] : []), [compare, canCompare, p.compareSeries]);
  const showPeriodGroups = compare && canCompare;
  const periodLegendColumnCount = Math.max(p.series.length, p.compareSeries?.length ?? 0);
  const usePeriodLegendGrid = periodLegendColumnCount <= 4;
  const visibleIds = useMemo(() => p.visibleSeriesIds === undefined ? null : new Set(p.visibleSeriesIds), [p.visibleSeriesIds]);
  const visible = useMemo(() => allSeries.filter(s => visibleIds ? visibleIds.has(s.id) : !hidden.has(s.id)), [allSeries, hidden, visibleIds]);
  const pointActions = p.pointActions;
  const hasPointActions = typeof pointActions === 'function' || !!pointActions?.length;
  const pointControls = !!p.pointActivation || hasPointActions;
  const isPointSelectable = p.isPointSelectable;
  const categories = useMemo(() => (xType === 'category' ? (horizontal ? [...new Set(p.series[0]?.points.map(([x]) => x) ?? [])] : p.series[0]?.points.map(([x]) => x) ?? []) : []), [xType, horizontal, p.series]);
  // With a row pitch the chart is as tall as its rows and `viewportHeight` is only the window the plot box scrolls in.
  const height = rowPitch !== undefined ? rowPitchChartHeight(categories.length, rowPitch) : viewportHeight;
  // Horizontal consumers share the plotted axis and first-occurrence value policy.
  const displayed = useMemo(() => horizontal ? visible.map(s => ({ ...s, points: categories.map(x => [x, s.points.find(([label]) => label === x)?.[1] ?? null] as [string, number | null]) })) : visible, [horizontal, visible, categories]);
  // revealActive: an outside change of the active row scrolls it into the plot window (grid top + index × pitch). Focus never moves.
  useEffect(() => {
    if (rowPitch === undefined || !revealActive || activeCategory == null) { revealedCategory.current = activeCategory; return; }
    if (revealedCategory.current === activeCategory) return;
    revealedCategory.current = activeCategory;
    const own = pointerRequest === activeCategory;
    const node = pointChart.current;
    const index = categories.indexOf(activeCategory);
    if (own || !node || index < 0) return;
    const target = revealScrollTop(index, rowPitch, node.scrollTop, node.clientHeight);
    if (target !== null) node.scrollTop = target;
  }, [rowPitch, revealActive, activeCategory, categories, pointChart, pointerRequest]);
  // Declared after the reveal effect: the request lives for the render of its own click only, so an ignored one cannot swallow a later outside reveal of the same row.
  useEffect(() => { if (pointerRequest !== null) setPointerRequest(null); }, [pointerRequest]);
  // Computed from the displayed (visible) series, so a hidden series has none; the point selector's own rule decides which rows count.
  const extremes = useMemo(() => (horizontal && p.minMax ? seriesExtremes(displayed, isPointSelectable) : undefined), [horizontal, p.minMax, displayed, isPointSelectable]);
  const points = useMemo(() => pointControls ? displayed.flatMap(s => s.points.map(([x, value]) => ({ x, seriesId: s.id, value })).filter(point => isPointSelectable?.(point) ?? true)) : [], [pointControls, displayed, isPointSelectable]);
  const selectedPoint = points.find(point => pointKey(point) === selectedPointKey) ?? points[0];
  const actionsFor = useCallback((point: ChartPoint): readonly ChartPointAction[] => (typeof pointActions === 'function' ? pointActions(point) : pointActions ?? []), [pointActions]);
  const selectedActions = useMemo(() => (selectedPoint ? actionsFor(selectedPoint) : []), [selectedPoint, actionsFor]);
  const noActions = hasPointActions && selectedActions.length === 0;
  const format = p.valueFormat ?? ((v: number) => v.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 1 }));
  // The tooltip reads the formatter when it opens, so a consumer's new `valueFormat` takes effect without rebuilding the option.
  const formatRef = useRef(format);
  useLayoutEffect(() => { formatRef.current = format; });
  // One row per distinct x across the visible series (#297): Compare series carry different dates, so the
  // old array-index join put one series' values under another's dates. Rows run in x order (time: ascending
  // ISO strings sort chronologically; category: the axis order), each x once — duplicate categories collapse
  // to their first occurrence instead of doubling the row (F2). null = the series has no point at that x.
  const rows = useMemo(() => {
    const xs = new Set(displayed.flatMap(s => s.points.map(([x]) => x)));
    const order = xType === 'time'
      ? [...xs].sort()
      : [...new Set(categories.filter(x => xs.has(x))), ...[...xs].filter(x => !categories.includes(x))];
    return order.map(x => [x, displayed.map(s => s.points.find(([px]) => px === x)?.[1] ?? null)] as const);
  }, [displayed, xType, categories]);

  const onVisibleSeriesChange = p.onVisibleSeriesChange;
  const { reset: resetPoint } = menu;
  const { cancelDelete } = editor;
  const resetLocal = useCallback(() => {
    setHidden(new Set()); onVisibleSeriesChange?.(allSeries.map(s => s.id)); resetPoint(); setCompare(false); rangeActions.buttonReset(); closeEditor();
  }, [closeEditor, onVisibleSeriesChange, allSeries, resetPoint, rangeActions]);
  // Global Context changes invalidate local selection (it described the previous result).
  const contextKey = JSON.stringify(global);
  useEffect(() => { rangeActions.contextReset(); closeEditor(); cancelDelete(); resetPoint();
  }, [contextKey, closeEditor, cancelDelete, resetPoint, rangeActions]);
  useAnnotationDeleteFocus(editor, { annotateButton, brushToggle });

  const timeBounds = useMemo(() => (xType === 'time' ? timeBoundaries(p.series, global.from, global.to) : []), [xType, p.series, global.from, global.to]);
  const showKeyboard = xType === 'time' && global.to !== null && timeBounds.length >= 2;
  // Label geometry, cached by what it depends on: the spans and rows change with the notes only, the data extent with the series,
  // so zoom, resize, editor typing and busy state redo none of it. Nothing runs while there are no notes.
  const noteSpans = useMemo(() => annotations.map(a => (xType === 'time'
    ? { from: toMs(a.from), to: toMs(a.to) }
    : { from: categories.indexOf(a.from), to: categories.indexOf(a.to) })), [annotations, xType, categories]);
  const noteLevels = useMemo(() => (noteSpans.length ? assignNoteLevels(noteSpans) : []), [noteSpans]);
  const timeExtent = useMemo(() => {
    if (xType !== 'time' || annotations.length === 0) return 0;
    let min = Infinity; let max = -Infinity;
    for (const s of allSeries) for (const [x] of s.points) { const ms = toMs(x); if (ms < min) min = ms; if (ms > max) max = ms; }
    return max > min ? max - min : 0;
  }, [xType, allSeries, annotations.length]);
  // Stable and live: the tooltip reads the formatter through the ref when it opens.
  const valueFormat = useCallback((v: number) => formatRef.current(v), []);
  const markLines = p.markLines; const unit = p.unit; const stacked = p.stacked;
  const option = useMemo<EChartsCoreOption>(() => {
    // A new chart instance replays the option: the lazy chunk and theme CSS may have settled since the tokens were last resolved.
    void instanceReady;
    return buildChartOption({
      displayed, previousIds, xType, horizontal, categories, zoom, brushMode, selection, annotations, noteSpans, noteLevels, timeExtent, chartWidth, markLines, unit, lang, stacked, valueFormat, rowPitch, activeCategory, startAlign, extremes,
      palette: resolveChartPalette(displayed),
    });
  }, [displayed, previousIds, xType, horizontal, categories, zoom, brushMode, selection, annotations, noteSpans, noteLevels, timeExtent, chartWidth, markLines, unit, lang, stacked, valueFormat, rowPitch, activeCategory, startAlign, extremes, instanceReady]);

  // Re-arm the brush cursor after each option replacement, and once the instance becomes ready.
  useEffect(() => {
    chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: brushMode ? { brushType: horizontal ? 'lineY' : 'lineX', brushMode: 'single' } : { brushType: false } });
  }, [option, brushMode, horizontal, instanceReady]);

  const closePointMenu = menu.close;
  useEffect(() => { if (brushMode || !selectedPoint || noActions) closePointMenu(); }, [brushMode, selectedPoint, noActions, closePointMenu]);

  const eventPoint = useCallback((params: PointEvent): ChartPoint | null => {
    if (!params.seriesId || params.seriesId === '__overlay') return null;
    const series = displayed.find(s => s.id === params.seriesId);
    if (!series) return null;
    const datum = params.dataIndex !== undefined
      ? series.points[params.dataIndex]
      : undefined;
    const x = datum?.[0] ?? (xType === 'time' && Array.isArray(params.value) ? formatDateTime(new Date(params.value[0] as number)) : params.name ?? '');
    const value = datum ? datum[1] : series.points.find(([label]) => label === x)?.[1];
    if (value === undefined) return null;
    const point = { x, seriesId: series.id, value };
    return isPointSelectable && !isPointSelectable(point) ? null : point;
  }, [displayed, xType, isPointSelectable]);

  const onEvents = useMemo(() => ({
    brushEnd: (params: { areas?: { coordRange?: [number, number] }[] }, instance: ECharts) => {
      const brushed = params.areas?.[0]?.coordRange;
      instance.dispatchAction({ type: 'brush', areas: [] });
      if (!brushed) return;
      if (xType === 'time') {
        // Same snap as the keyboard path, then clip. A zero-width drag only drops an open confirm.
        const snapped = snapOutward(brushed[0], brushed[1], timeBounds);
        if (!snapped) { rangeActions.snapSelect(null); return; }
        const result = clipToPeriod(snapped, global.from, global.to, compare && canCompare);
        rangeActions.snapSelect(result);
        if (!result.range) closeEditor();
      } else {
        const a = categories[Math.max(0, Math.round(brushed[0]))]; const b = categories[Math.min(categories.length - 1, Math.round(brushed[1]))];
        rangeActions.categorySelect(a && b ? { from: a, to: b } : null);
      }
    },
    datazoom: (_: unknown, instance: ECharts) => {
      const dz = (instance.getOption() as { dataZoom?: { start: number; end: number }[] }).dataZoom?.[0];
      if (dz) rangeActions.setZoom([dz.start, dz.end]);
    },
    click: (params: PointEvent) => {
      if (brushMode) return;
      const point = eventPoint(params);
      if (!point) return;
      if (pointControls) setSelectedPointKey(pointKey(point));
      // Row focus first, then activation: a click focuses the row and (on: 'click') also activates the point.
      if (horizontal && onActiveCategoryChange) {
        setPointerRequest(point.x);
        onActiveCategoryChange(point.x, 'pointer');
      }
      // Native double-click recognition is OS-defined; no timer can safely commit a click first.
      const onPointClick = p.onPointClick;
      const pointActivation = p.pointActivation;
      if (pointActivation?.on !== 'dblclick') {
        onPointClick?.(point.x, point.seriesId);
        pointActivation?.onActivate(point);
      }
    },
    dblclick: (params: PointEvent) => {
      const activation = p.pointActivation;
      if (brushMode || activation?.on !== 'dblclick') return;
      const point = eventPoint(params);
      if (point) { setSelectedPointKey(pointKey(point)); activation.onActivate(point); }
    },
    contextmenu: (params: PointEvent) => {
      if (brushMode || !hasPointActions) return;
      const point = eventPoint(params);
      if (point) { params.event?.event?.preventDefault?.(); setSelectedPointKey(pointKey(point)); if (actionsFor(point).length > 0) openPointMenu(pointChart.current); }
    },
  }), [xType, horizontal, onActiveCategoryChange, categories, brushMode, p.onPointClick, p.pointActivation, hasPointActions, actionsFor, pointControls, eventPoint, openPointMenu, pointChart, timeBounds, global.from, global.to, compare, canCompare, closeEditor, rangeActions, setSelectedPointKey]);

  const selectionCounts = selection ? displayed.map(s => {
    const inRange = s.points.filter(([x, y]) => y !== null && (xType === 'time' ? x >= selection.from && x < selection.to : categories.indexOf(x) >= categories.indexOf(selection.from) && categories.indexOf(x) <= categories.indexOf(selection.to)));
    const values = inRange.map(([, y]) => y as number);
    return { s, n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, max: values.length ? Math.max(...values) : null };
  }) : [];

  /** ` · 최소` / ` · 최대` after a point that is its series' minimum or maximum, for the keyboard picker (colour is never the only cue). */
  function extremeText(point: ChartPoint) {
    const e = extremes?.get(point.seriesId);
    return e?.min.x === point.x ? ` · ${lang === 'ko' ? '최소' : 'Min'}` : e?.max.x === point.x ? ` · ${lang === 'ko' ? '최대' : 'Max'}` : '';
  }

  function renderLegendSeries(s: ChartSeries, previous: boolean) {
    const kind = horizontal ? 'bar' : s.kind ?? 'line';
    // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
    const stroke = token(kind === 'bar' && s.color === 'chart-remainder' ? 'border-control' : strokeToken(s.color));
    return <label key={s.id} className={cn('inline-flex cursor-pointer items-center gap-1.5 text-text-secondary', compact ? 'text-tiny' : 'text-xs')}>
      <input type="checkbox" className="size-3.5 accent-accent-primary" checked={visibleIds ? visibleIds.has(s.id) : !hidden.has(s.id)} onChange={() => {
        const next = new Set(p.visibleSeriesIds ?? allSeries.filter(item => !hidden.has(item.id)).map(item => item.id));
        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
        if (p.visibleSeriesIds === undefined) setHidden(current => { const updated = new Set(current); if (updated.has(s.id)) updated.delete(s.id); else updated.add(s.id); return updated; });
        p.onVisibleSeriesChange?.([...next]);
      }} />
      {kind === 'bar'
        // eslint-disable-next-line shadcn/no-inline-styles -- swatch color is the series token resolved at runtime
        ? <span aria-hidden className="inline-block size-3 border-2" style={{ backgroundColor: token(s.color), borderColor: stroke }} />
        : <svg aria-hidden width="32" height="14"><line x1="0" y1="7" x2="32" y2="7" stroke={stroke} strokeWidth="2" strokeDasharray={svgDasharray(linePattern(s, previous))} /></svg>}
      {s.name}
    </label>;
  }

  function renderPeriodLegendGroup(id: string, title: string, series: ChartSeries[], previous: boolean) {
    if (!usePeriodLegendGrid) return <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <strong id={id} className={cn('min-w-20 font-medium text-text-secondary', compact ? 'text-tiny' : 'text-xs')}>{title}</strong>
      {series.map(s => renderLegendSeries(s, previous))}
    </div>;

    return <div role="group" aria-labelledby={id} className="col-span-full grid grid-cols-subgrid items-center gap-x-4">
      <strong id={id} className={cn('col-start-1 min-w-20 font-medium text-text-secondary', compact ? 'text-tiny' : 'text-xs')}>{title}</strong>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- legend column is the per-series index computed at runtime */}
      {series.map((s, index) => <div key={s.id} data-legend-series-id={s.id} style={{ gridColumn: index + 2 }}>{renderLegendSeries(s, previous)}</div>)}
    </div>;
  }

  function exportCsv() {
    const header = ['x', ...visible.map(s => s.name)];
    // The table projection verbatim: numbers stay numbers so the formula guard never prefixes them (#297).
    const body = rows.map(([x, values]) => [x, ...values.map(v => (v === null ? '' : v))]);
    downloadChartCsv({ ...p, context: global }, header, body);
    toast(lang === 'ko' ? `${p.chartId}.csv 내보냄 (보이는 시리즈, 현재 적용 Context 기준)` : `Exported ${p.chartId}.csv (visible series, applied context)`);
  }

  const oneHour = global.to ? presetWindow(1, timeBounds, global.to) : null;
  const fourHour = global.to ? presetWindow(4, timeBounds, global.to) : null;
  const fallbackRange: Selection | null = timeBounds.length >= 2 ? { from: timeBounds[0], to: timeBounds[timeBounds.length - 1] } : null;
  const draft = rangeDraft ?? selection ?? fallbackRange;
  // A fill card gives the plot the space: the start/end form and the empty-selection hint appear while brushing or once a range exists
  // (ADR-0067 decision 21); notes, errors and the confirm row keep their place. Other sizes always show them.
  const rangeUi = size !== 'fill' || brushMode || !!selection;
  const annotationAlert = canAnnotate && scopeId !== null && !!editor.query.response && !['ok', 'empty'].includes(editor.query.response.outcome);
  const showSummary = rangeUi || !!clipNotice || !!preview || note !== null || annotations.length > 0 || annotationAlert || (activeCategory !== undefined && activeCategory !== null) || (!!extremes && !!selectedPoint && extremes.has(selectedPoint.seriesId));
  useEffect(() => {
    if (!focusRangeForm.current || !brushMode) return;
    focusRangeForm.current = false;
    rangeStart.current?.focus({ preventScroll: true });
  }, [brushMode, showSummary]);
  function commitRange(next: Selection) {
    const snapped = snapOutward(toMs(next.from), toMs(next.to), timeBounds);
    if (!snapped) { rangeActions.snapSelect(null); return; }
    const result = clipToPeriod(snapped, global.from, global.to, compare && canCompare && xType === 'time');
    rangeActions.snapSelect(result);
    if (!result.range) closeEditor();
  }
  function toggleCompare() {
    const next = !compare;
    if (next && canCompare && xType === 'time' && (selection || preview)) {
      const source = selection ?? preview!;
      const snapped = snapOutward(toMs(source.from), toMs(source.to), timeBounds);
      const result: ClipResult = snapped ? clipToPeriod(snapped, global.from, global.to, true) : { range: null, notice: 'outside' };
      rangeActions.compareClip(result);
      if (selection && !result.range) closeEditor();
    }
    setCompare(next);
  }
  function chooseStart(next: string) {
    const base = rangeDraft ?? selection ?? fallbackRange;
    if (!base) return;
    const to = base.to > next ? base.to : timeBounds.find(bound => bound > next) ?? base.to;
    rangeActions.setDraft({ from: next, to });
  }
  function chooseEnd(next: string) {
    const base = rangeDraft ?? selection ?? fallbackRange;
    if (!base) return;
    rangeActions.setDraft({ from: base.from, to: next });
  }

  // min-w-0: the plot canvas owns a fixed px width; without it that width becomes the card's min-content and a
  // grid cell can never shrink the card (the ResizeObserver then never sees a smaller width on column switch).
  return <section role="region" aria-labelledby={titleId} data-analysis-chart={analysisSection ? '' : undefined} className={cn('relative flex min-w-0 flex-col rounded-lg border border-border-subtle bg-surface-card', size === 'fill' && FILL_CARD_CLASS)}>
    {/* Pinned to the card corner so a wrapping toolbar never strands it on its own line. */}
    <AnalysisChartPart enabled={analysisSection !== null}>
    <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', analysisSection && 'pr-12')}>
      <ChartHeading titleId={titleId} title={p.title} description={p.description} metricVersion={p.metricVersion} compact={compact} />
      {/* The core controls wrap in source order inside narrow cards; the Export/More tail stays bundled as its own
        wrap unit. Wide cards keep one right-aligned row, and extraActions keeps its own bundle. */}
      <div role="toolbar" aria-label={lang === 'ko' ? '차트 동작' : 'Chart actions'} className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {pointControls && <div className="flex flex-wrap items-center gap-1">
          <select aria-label={lang === 'ko' ? '차트 지점 선택' : 'Select chart point'} value={selectedPoint ? pointKey(selectedPoint) : ''} disabled={brushMode || !points.length}
            className="max-w-56 rounded-md border border-border-control bg-surface-card px-2 py-1 text-xs" onChange={event => { setSelectedPointKey(event.target.value); const picked = points.find(point => pointKey(point) === event.target.value); if (horizontal && picked) p.onActiveCategoryChange?.(picked.x, 'keyboard'); }}>
            {!points.length && <option value="">{lang === 'ko' ? '선택할 지점 없음' : 'No points available'}</option>}
            {points.map(point => <option key={pointKey(point)} value={pointKey(point)}>{point.x} · {allSeries.find(s => s.id === point.seriesId)?.name} · {point.value === null ? unknownLabel(lang === 'ko') : format(point.value)}{extremeText(point)}</option>)}
          </select>
          {p.pointActivation && <Button variant="ghost" size="toolbar" disabled={brushMode || !selectedPoint} onClick={() => { if (selectedPoint && !brushMode) p.pointActivation?.onActivate(selectedPoint); }}>{lang === 'ko' ? '선택 지점 실행' : 'Activate selected point'}</Button>}
          {hasPointActions && <DropdownMenu open={menu.open && !brushMode && !!selectedPoint && !noActions} onOpenChange={open => { if (open) openPointMenu(menu.triggerRef.current); else menu.close(); }}>
            <DropdownMenuTrigger asChild><Button ref={menu.triggerRef} variant="ghost" size="toolbar" disabled={brushMode || !selectedPoint || noActions}>{lang === 'ko' ? '지점 동작' : 'Point actions'}</Button></DropdownMenuTrigger>
            <DropdownMenuContent ref={menu.contentRef} align="end" onCloseAutoFocus={menu.onCloseAutoFocus}>
              {selectedActions.map(action => <DropdownMenuItem key={action.id} disabled={action.disabled} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring" onSelect={() => { if (selectedPoint && !brushMode) { if (action.keepsFocus) menu.stayOnChart(); action.onSelect(selectedPoint); } }}>{action.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
          {brushMode && <span className="text-tiny text-text-secondary">{lang === 'ko' ? '구간 선택 중에는 지점 실행과 동작을 사용할 수 없습니다.' : 'Point activation and actions are unavailable while brushing.'}</span>}
        </div>}
        {p.extraActions != null && <div className="flex items-center gap-1">{p.extraActions}</div>}
        <div className="flex flex-wrap items-center gap-1">
          {rowPitch === undefined && <Button variant="ghost" size="toolbar" onClick={rangeActions.zoomIn} title={lang === 'ko' ? '확대 (Shift+휠도 가능)' : 'Zoom in (Shift+wheel)'}><ZoomIn className="size-3.5" aria-hidden />{lang === 'ko' ? '확대' : 'Zoom'}</Button>}
          <Button ref={brushToggle} variant={brushMode ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={brushMode} disabled={startAlign} title={startAlign ? (lang === 'ko' ? '시작 위치 맞춤에서는 가로축이 하나의 값 척도가 아니라 구간 선택을 쓸 수 없습니다' : 'Brush is unavailable with StartAlign: the x axis is no longer one value scale') : undefined} onClick={event => { if (size === 'fill' && !brushMode && event.detail === 0) focusRangeForm.current = true; rangeActions.toggleBrush(); }}><BrushIcon className="size-3.5" aria-hidden />{lang === 'ko' ? '구간 선택' : 'Brush'}</Button>
          {showKeyboard && <div role="group" aria-label={lang === 'ko' ? '빠른 구간 선택' : 'Quick range'} className="flex items-center gap-1">
            {oneHour && <Button variant="ghost" size="toolbar" onClick={() => commitRange(oneHour)}>{lang === 'ko' ? '1시간' : '1h'}</Button>}
            {fourHour && <Button variant="ghost" size="toolbar" onClick={() => commitRange(fourHour)}>{lang === 'ko' ? '4시간' : '4h'}</Button>}
            <Button variant="ghost" size="toolbar" onClick={() => commitRange({ from: timeBounds[0], to: timeBounds[timeBounds.length - 1] })}>{lang === 'ko' ? '전체' : 'All'}</Button>
          </div>}
          <Button variant="ghost" size="toolbar" onClick={resetLocal}><RotateCcw className="size-3.5" aria-hidden />{lang === 'ko' ? '초기화' : 'Reset'}</Button>
          {canCompare && <Button variant={compare ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={compare} onClick={toggleCompare}><GitCompare className="size-3.5" aria-hidden />{lang === 'ko' ? '비교' : 'Compare'}</Button>}
          {canAnnotate && <Button ref={annotateButton} variant="ghost" size="toolbar" disabled={!selection || scopeId === null} title={scopeId === null ? (lang === 'ko' ? '주석은 사이트(Scope)를 선택한 뒤 남길 수 있습니다' : 'Pick a site (Scope) to annotate') : selection ? undefined : (lang === 'ko' ? '구간 선택으로 구간을 먼저 선택하세요' : 'Brush a range first')} onClick={editor.openEditor}><MessageSquarePlus className="size-3.5" aria-hidden />{lang === 'ko' ? '주석' : 'Annotate'}</Button>}
        </div>
        <div className="flex items-center gap-1" data-chart-toolbar-tail>
          {canExport && <Button variant="ghost" size="toolbar" onClick={exportCsv}><Download className="size-3.5" aria-hidden />{lang === 'ko' ? '내보내기' : 'Export'}</Button>}
          <Popover>
            <PopoverTrigger asChild><Button variant="ghost" size="toolbar" aria-label={lang === 'ko' ? '더보기' : 'More'}><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-surface-sunken" onClick={() => setShowTable(s => !s)}><Table2 className="size-3.5" aria-hidden />{showTable ? (lang === 'ko' ? '데이터 표 숨기기' : 'Hide data table') : (lang === 'ko' ? '같은 데이터를 표로 보기' : 'Show same data as table')}</button>
              <p className="mt-2 border-t border-border-subtle pt-2 text-text-secondary">{lang === 'ko'
                ? '확대·구간 선택·시리즈 표시·비교는 이 차트의 로컬 상태로 URL에 저장되지 않습니다. 구간을 전역 기간으로 올리려면 선택 요약의 “분석 구간 적용”을 명시적으로 눌러야 합니다. 주석은 서버에 사이트(Scope)별로 보관되어 초기화 후에도 유지됩니다.'
                : 'Zoom, brush, series visibility and compare are local chart state, never written to the URL. Promoting a range to the global period requires the explicit “Apply analysis range”. Annotations are stored on the server per site (Scope) and survive Reset.'}</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>

    {(p.legend !== false || brushMode || (p.onPointClick && p.pointClickHint)) && <div role={p.legend === false ? undefined : 'group'} aria-label={p.legend === false ? undefined : lang === 'ko' ? '범례' : 'Legend'} className={cn('px-4 pt-2', showPeriodGroups ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- legend column count depends on the visible period groups at runtime */}
      {p.legend === false ? null : showPeriodGroups ? usePeriodLegendGrid ? <div data-period-legend-grid className="grid items-center gap-x-4 gap-y-2" style={{ gridTemplateColumns: `repeat(${periodLegendColumnCount + 1}, max-content)` }}>
        {renderPeriodLegendGroup(currentPeriodId, t('currentPeriod'), p.series, false)}
        {renderPeriodLegendGroup(previousPeriodId, t('previousPeriod'), p.compareSeries ?? [], true)}
      </div> : <>
        {renderPeriodLegendGroup(currentPeriodId, t('currentPeriod'), p.series, false)}
        {renderPeriodLegendGroup(previousPeriodId, t('previousPeriod'), p.compareSeries ?? [], true)}
      </> : allSeries.map(s => renderLegendSeries(s, false))}
      {brushMode && <span className="text-tiny text-accent-primary">{lang === 'ko' ? '차트를 드래그해 구간을 선택하세요' : 'Drag across the chart to select a range'}</span>}
      {p.onPointClick && !brushMode && p.pointClickHint && <span className="text-tiny text-text-muted">{p.pointClickHint}</span>}
    </div>}

    </AnalysisChartPart>
    <AnalysisChartPart enabled={analysisSection !== null} body>
    {allSeries.length > 0 && visible.length === 0 && <p role="status" className="px-4 py-3 text-text-secondary">{lang === 'ko' ? '표시할 시리즈를 모두 껐습니다' : 'All series are turned off'}</p>}
    <div ref={node => { pointChart.current = node; fill.ref(node); wheelPassThrough(node); }} className={cn('px-2', size === 'fill' && (rowPitch !== undefined ? (loweredFill ? FILL_PLOT_SCROLL_BASE_CLASS : FILL_PLOT_SCROLL_CLASS) : (loweredFill ? FILL_PLOT_BASE_CLASS : FILL_PLOT_CLASS)), rowPitch !== undefined && 'overflow-y-auto')}
      // eslint-disable-next-line shadcn/no-inline-styles -- the scroll window is the given height at runtime
      style={rowPitch !== undefined && size !== 'fill' ? { maxHeight: viewportHeight } : size === 'fill' && loweredFill ? { minHeight: fillMin } : undefined} role={pointControls ? 'group' : undefined} aria-label={pointControls ? (lang === 'ko' ? '차트 지점' : 'Chart points') : undefined} tabIndex={pointControls ? 0 : undefined}
      onContextMenu={event => { if (hasPointActions) event.preventDefault(); }}
      onKeyDown={event => {
        if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && hasPointActions) {
          event.preventDefault();
          if (!brushMode && selectedPoint && !noActions) openPointMenu(pointChart.current);
        }
      }}><EChart option={option} height={height} onEvents={onEvents} onReady={c => { chart.current = c; setChartWidth(c.getWidth()); setInstanceReady(v => v + 1); }} onResize={setChartWidth}
      ariaLabel={`${typeof p.title === 'string' ? p.title : p.chartId}: ${visible.map(s => s.name).join(', ')}`} /></div>

    {showTable && <div className="mx-4 mb-2 max-h-56 overflow-auto rounded-md border border-border-subtle">
      <table aria-labelledby={titleId} className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-surface-sunken"><tr><th className="t-table-header px-3 py-1.5 text-left text-text-secondary">{lang === 'ko' ? (xType === 'time' ? '시각' : '구간') : (xType === 'time' ? 'Time' : 'Category')}</th>{visible.map(s => <th key={s.id} className="t-table-header px-3 py-1.5 text-right text-text-secondary">{s.name}</th>)}</tr></thead>
        <tbody>{rows.map(([x, values]) => <tr key={x} className="border-t border-border-subtle">
          <td className="px-3 py-1">{xType === 'time' ? fmt(x) : x}</td>
          {values.map((v, i) => <td key={visible[i].id} className="px-3 py-1 text-right">{v === null ? '—' : format(v)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}

    {showSummary && <section aria-label={lang === 'ko' ? '선택 요약' : 'Selection summary'} aria-live="polite" className="mx-4 mb-3 min-h-9 rounded-md bg-surface-sunken px-3 py-2 text-xs">
      {rangeUi && showKeyboard && draft && <div role="group" aria-label={lang === 'ko' ? '시작과 끝으로 구간 선택' : 'Choose a range by start and end'} className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-text-secondary">{lang === 'ko' ? '시작' : 'Start'}</span>
        <Select value={draft.from} onValueChange={chooseStart}>
          <SelectTrigger ref={rangeStart} aria-label={lang === 'ko' ? '구간 시작' : 'Range start'} className="h-8 w-44 border-border-control">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {withBound(timeBounds.slice(0, -1), draft.from).map(value => <SelectItem key={value} value={value}>{fmt(value)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-text-secondary">{lang === 'ko' ? '끝' : 'End'}</span>
        <Select value={draft.to} onValueChange={chooseEnd}>
          <SelectTrigger aria-label={lang === 'ko' ? '구간 끝' : 'Range end'} className="h-8 w-44 border-border-control">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {withBound(timeBounds.filter(bound => bound > draft.from), draft.to).map(value => <SelectItem key={value} value={value}>{fmt(value)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="toolbar" onClick={() => commitRange(draft)}>{lang === 'ko' ? '선택' : 'Select'}</Button>
      </div>}
      {activeCategory != null && <p className="mb-1 font-semibold">{lang === 'ko' ? '활성 행' : 'Active row'}: {activeCategory}</p>}
      {selectedPoint && extremes?.get(selectedPoint.seriesId) && (() => { const e = extremes.get(selectedPoint.seriesId)!; const name = allSeries.find(s => s.id === selectedPoint.seriesId)?.name; return <p className="mb-1 tabular">{name}: {lang === 'ko' ? '최소' : 'Min'} {e.min.x} {format(e.min.value)} · {lang === 'ko' ? '최대' : 'Max'} {e.max.x} {format(e.max.value)} {p.unit}</p>; })()}
      {!selection ? rangeUi && <span className="text-text-secondary">{startAlign ? (lang === 'ko' ? '선택 구간 없음' : 'No selection') : showKeyboard
        ? (lang === 'ko' ? '선택 구간 없음 — 시작·끝이나 빠른 구간, 또는 구간 선택으로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — choose a start and end, a quick range, or brush a range to summarize, annotate or apply it.')
        : (lang === 'ko' ? '선택 구간 없음 — 구간 선택으로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — brush a range to summarize, annotate or apply it.')}</span>
        : <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold tabular">{t('selectedRange')}: {xType === 'time' ? `${fmt(selection.from)} – ${fmt(selection.to)}` : `${selection.from} – ${selection.to}`}</span>
          {selectionCounts.map(c => <span key={c.s.id} className="tabular text-text-secondary">{c.s.name}: n={c.n}{c.avg !== null && ` · avg ${format(c.avg)} · max ${format(c.max!)}`} {p.unit}</span>)}
          <span className="ml-auto flex flex-wrap gap-2">
            {p.selectionActions?.(selection)}
            {xType === 'time' && p.canApplyRange !== false && <Button ref={applyRangeButton} size="toolbar" onClick={() => rangeActions.setPreview(selection)}>{lang === 'ko' ? '분석 구간 적용…' : 'Apply analysis range…'}</Button>}
            <Button size="toolbar" variant="ghost" onClick={rangeActions.clear}>{t('clear')}</Button>
          </span>
        </div>}
      {selection && selectionCounts.length > 0 && selectionCounts.every(c => c.n === 0) && <p className="mt-1 text-text-secondary">
        {lang === 'ko' ? '선택 구간에 요약할 값이 없습니다. 시작·끝을 바꾸거나 더 넓은 구간을 선택하세요.' : 'No values to summarize in this range. Change the start and end or choose a wider range.'}
      </p>}
      {clipNotice && <p className="mt-1 text-text-secondary">{clipNotice === 'partial'
        ? (lang === 'ko' ? '비교 중인 이전 기간에 걸친 부분을 현재 기간으로 잘랐습니다.' : 'The part in the previous period was cut back to the current period.')
        : (lang === 'ko' ? '고른 구간이 모두 이전 기간이라 선택하지 않았습니다.' : 'The range is entirely in the previous period, so nothing was selected.')}</p>}
      {preview && <div role="group" aria-label={lang === 'ko' ? '구간 적용 확인' : 'Confirm range'} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent-primary bg-surface-card p-2">
        <span className="tabular">{lang === 'ko' ? '전역 기간을 다음으로 바꿉니다:' : 'Change the global period to:'} <b>{preview.from.replace('T', ' ')} → {preview.to.replace('T', ' ')}</b></span>
        {/* The row unmounts on either button; hand keyboard focus back instead of dropping it to body (#297 UX). */}
        <Button size="toolbar" onClick={() => { setGlobal({ from: preview.from, to: preview.to }); toast(lang === 'ko' ? '선택 구간을 전역 기간으로 적용했습니다. 다른 메뉴로 이동해도 유지됩니다.' : 'Applied the selection as the global period; it carries across menus.'); brushToggle.current?.focus({ preventScroll: true }); }}>{t('apply')}</Button>
        <Button size="toolbar" variant="secondary" onClick={() => { rangeActions.setPreview(null); applyRangeButton.current?.focus({ preventScroll: true }); }}>{t('cancel')}</Button>
      </div>}
      {canAnnotate && note !== null && selection && <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void editor.saveNote(selection); }}>
        <input autoFocus aria-label={lang === 'ko' ? '주석 내용' : 'Annotation text'} value={note} onChange={e => editor.setNote(e.target.value)} placeholder={lang === 'ko' ? '예: PM 작업으로 인한 대기 증가' : 'e.g. queue spike due to PM'} className="h-7 min-w-64 flex-1 rounded-md border border-border-control bg-surface-card px-2" />
        <Button size="toolbar" type="submit" disabled={editor.saving}>{lang === 'ko' ? '저장' : 'Save'}</Button>
        <Button size="toolbar" type="button" variant="ghost" onClick={closeEditor}>{t('cancel')}</Button>
      </form>}
      {annotationAlert && <p role="alert" className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-1.5 text-tiny text-text-secondary">
        {lang === 'ko' ? '주석을 불러오지 못했습니다. 차트는 그대로 사용할 수 있습니다.' : 'Could not load annotations. The chart is unaffected.'}
        <Button size="toolbar" variant="ghost" onClick={editor.refetch}>{lang === 'ko' ? '다시 시도' : 'Retry'}</Button>
      </p>}
      {annotations.length > 0 && <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-1.5 text-tiny text-text-secondary">
        {annotations.map(a => <li key={a.id} className="tabular flex flex-wrap items-center gap-x-1"><span className="mr-1 inline-block size-2 rounded-xs bg-chart-purple/60 align-middle" aria-hidden />{xType === 'time' ? `${fmt(a.from)}–${fmt(a.to)}` : `${a.from}–${a.to}`}: {a.text}
          {a.mine && (editor.pendingDelete === a.id
            ? <div role="group" aria-label={lang === 'ko' ? `삭제 확인: ${a.text}` : `Confirm delete: ${a.text}`} className="ml-2 inline-flex items-center gap-1" onFocus={() => { editor.focusOnConfirm.current = true; }} onBlur={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              // Removing the focused button also fires focusout (relatedTarget null, activeElement body) while the row is still attached; judge after the commit: a row that is gone keeps ownership.
              const group = e.currentTarget;
              queueMicrotask(() => { if (group.isConnected && !group.contains(document.activeElement)) editor.focusOnConfirm.current = false; });
            }}>
              <span>{lang === 'ko' ? '이 주석을 삭제할까요?' : 'Delete this note?'}</span>
              <Button size="toolbar" variant="destructive" autoFocus aria-disabled={editor.deleting} onClick={() => void editor.deleteNote(a.id)}>{lang === 'ko' ? '삭제 확정' : 'Confirm delete'}</Button>
              <Button size="toolbar" variant="ghost" aria-disabled={editor.deleting} onClick={() => editor.cancelConfirm(a.id)}>{t('cancel')}</Button>
            </div>
            : <Button ref={el => { if (el) editor.deleteButtons.current.set(a.id, el); else editor.deleteButtons.current.delete(a.id); }} size="toolbar" variant="ghost" className="ml-2" aria-label={lang === 'ko' ? `삭제: ${a.text}` : `Delete note: ${a.text}`} onClick={() => editor.startDelete(a.id)}>{lang === 'ko' ? '삭제' : 'Delete'}</Button>)}
        </li>)}
      </ul>}
    </section>}

    <ChartTrustFooter trust={p.trust} />
    </AnalysisChartPart>
  </section>;
}
