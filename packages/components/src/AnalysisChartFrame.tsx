import { unknownLabel } from './analysisChartShared';
import { BrushIcon, Download, GitCompare, MessageSquarePlus, MoreHorizontal, RotateCcw, Table2, ZoomIn } from 'lucide-react';
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { formatDateTime, parseDateTime } from '@ap/contracts';
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, prefersReducedMotion } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { AnalysisSectionContext, resolveAnalysisChartSize, analysisChartHeight, type ChartSize } from './AnalysisSectionContext';
import { chartTheme, EChart, strokeToken, token } from './EChart';
import { downloadChartCsv } from './analysisChartCsv';
import { assignNoteLevels, noteLabelWidths } from './annotationLayout';

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

type Selection = { from: string; to: string };
type ClipNotice = 'partial' | 'outside';
type LinePattern = 'solid' | number[];
const toMs = (v: string) => parseDateTime(v, 'x').getTime();
/** The plot's horizontal margin (grid left 52 + right 20) and the width assumed before the chart instance exists. */
const PLOT_MARGIN = 72;
const NOTE_FALLBACK_WIDTH = 640;
/** One note-label row at fontSize 10. */
const NOTE_LABEL_ROW = 12;
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
function clipToPeriod(range: Selection, periodFrom: string | null, periodTo: string | null, clip: boolean): { range: Selection | null; notice: ClipNotice | null } {
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

function linePattern(series: ChartSeries, previous: boolean): LinePattern {
  if (previous) return series.dashed ? [8, 3, 2, 3] : [2, 2];
  return series.dashed ? [8, 4] : 'solid';
}

function svgDasharray(pattern: LinePattern): string | undefined {
  return Array.isArray(pattern) ? pattern.join(' ') : undefined;
}

/** A consumer-owned point identity; activation never navigates by itself. */
export type ChartPoint = { x: string; seriesId: string; value: number | null };
export type ChartPointAction = { id: string; label: string; onSelect: (point: ChartPoint) => void; disabled?: boolean };
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
  pointActions?: readonly ChartPointAction[];
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
  const height = p.height ?? analysisChartHeight(size, 260);
  const { setGlobal, toast, global, adapter, route } = usePlatform();
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
  const applyRangeButton = useRef<HTMLButtonElement | null>(null);
  const annotateButton = useRef<HTMLButtonElement | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [pointMenuOpen, setPointMenuOpen] = useState(false);
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compare, setCompare] = useState(false);
  const [brushMode, setBrushMode] = useState(false);
  // Bumped from onReady: imperative instance effects below must replay once the lazy EChartImpl
  // creates the instance (a Brush click during chunk load would otherwise never reach it, #48 P1).
  const [instanceReady, setInstanceReady] = useState(0);
  // The chart instance's width in px: label budgets are cut from it, so a container resize must reach the option (#399 F3).
  const [chartWidth, setChartWidth] = useState(NOTE_FALLBACK_WIDTH);
  const [zoom, setZoom] = useState<[number, number]>([0, 100]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Selection | null>(null);
  const [clipNotice, setClipNotice] = useState<ClipNotice | null>(null);
  const [rangeDraft, setRangeDraft] = useState<Selection | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  // A row belongs to one site: the Scope is part of the query identity, so a site switch hides the previous site's notes.
  const scopeId = global.scopeId;
  const annotationQuery = usePlatformQuery(signal => adapter.listAnnotations({ chartId: p.chartId, scopeId }, signal), [p.chartId, scopeId], canAnnotate && scopeId !== null, 'session');
  const annotations = useMemo(() => annotationQuery.response?.data?.items ?? [], [annotationQuery.response]);
  const refetchAnnotations = annotationQuery.refetch;
  const [saving, setSaving] = useState(false);
  // Each editor session gets a generation; a save that finishes after cancel/reopen/Scope change must not touch the newer draft.
  const draftGen = useRef(0);
  // Delete (#399): one inline confirm per note. `pendingDelete` is the note being confirmed, `deleting` the in-flight call,
  // `settled` a delete the server accepted whose refetch has not removed the row yet.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settled, setSettled] = useState<{ id: string; nextId: string | null } | null>(null);
  const [restoreFocus, setRestoreFocus] = useState<string | null>(null);
  // Bumped when a Context change cancels the delete operation: a call that was in flight then completes into nothing.
  const deleteGen = useRef(0);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  // Whether keyboard focus is still on the confirm row: set by focus in, cleared when focus leaves the group — to another element or to the
  // page (blur to body). A window blur keeps the element active and leaves it set; removing the focused row fires no event the group sees.
  const focusOnConfirm = useRef(false);
  const openNote = () => { draftGen.current++; setNote(''); };
  const closeNote = useCallback(() => { draftGen.current++; setNote(null); }, []);

  const allSeries = useMemo(() => [...p.series, ...(compare && canCompare ? p.compareSeries ?? [] : [])], [p.series, p.compareSeries, compare, canCompare]);
  const previousIds = useMemo(() => new Set(compare && canCompare ? p.compareSeries?.map(s => s.id) ?? [] : []), [compare, canCompare, p.compareSeries]);
  const showPeriodGroups = compare && canCompare;
  const periodLegendColumnCount = Math.max(p.series.length, p.compareSeries?.length ?? 0);
  const usePeriodLegendGrid = periodLegendColumnCount <= 4;
  const visibleIds = useMemo(() => p.visibleSeriesIds === undefined ? null : new Set(p.visibleSeriesIds), [p.visibleSeriesIds]);
  const visible = useMemo(() => allSeries.filter(s => visibleIds ? visibleIds.has(s.id) : !hidden.has(s.id)), [allSeries, hidden, visibleIds]);
  const pointControls = !!p.pointActivation || !!p.pointActions?.length;
  const points = useMemo(() => pointControls ? visible.flatMap(s => s.points.map(([x, value]) => ({ x, seriesId: s.id, value }))) : [], [pointControls, visible]);
  const selectedPoint = points.find(point => pointKey(point) === selectedPointKey) ?? points[0];
  const categories = useMemo(() => (xType === 'category' ? p.series[0]?.points.map(([x]) => x) ?? [] : []), [xType, p.series]);
  const format = p.valueFormat ?? ((v: number) => v.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 1 }));
  // One row per distinct x across the visible series (#297): Compare series carry different dates, so the
  // old array-index join put one series' values under another's dates. Rows run in x order (time: ascending
  // ISO strings sort chronologically; category: the axis order), each x once — duplicate categories collapse
  // to their first occurrence instead of doubling the row (F2). null = the series has no point at that x.
  const rows = useMemo(() => {
    const xs = new Set(visible.flatMap(s => s.points.map(([x]) => x)));
    const order = xType === 'time'
      ? [...xs].sort()
      : [...new Set(categories.filter(x => xs.has(x))), ...[...xs].filter(x => !categories.includes(x))];
    return order.map(x => [x, visible.map(s => s.points.find(([px]) => px === x)?.[1] ?? null)] as const);
  }, [visible, xType, categories]);

  const resetLocal = useCallback(() => {
    setHidden(new Set()); p.onVisibleSeriesChange?.(allSeries.map(s => s.id)); setSelectedPointKey(null); setPointMenuOpen(false); setCompare(false); setBrushMode(false); setZoom([0, 100]); setSelection(null); setPreview(null); closeNote(); setClipNotice(null); setRangeDraft(null);
  }, [closeNote, p.onVisibleSeriesChange, allSeries]);
  // Global Context changes invalidate local selection (it described the previous result).
  const contextKey = JSON.stringify(global);
  useEffect(() => { setSelection(null); setPreview(null); closeNote(); setZoom([0, 100]); setClipNotice(null); setRangeDraft(null);
    deleteGen.current++; focusOnConfirm.current = false; setPendingDelete(null); setSettled(null); setDeleting(false);
    setSelectedPointKey(null); setPointMenuOpen(false);
  }, [contextKey, closeNote]);
  // 06 §26: the confirm row unmounts, so focus moves only if it is still on that row — the next note's delete button, else Annotate.
  useEffect(() => {
    if (!settled || annotations.some(a => a.id === settled.id)) return;
    const onConfirm = focusOnConfirm.current;
    focusOnConfirm.current = false;
    setSettled(null); setPendingDelete(null); setDeleting(false);
    if (!onConfirm) return;
    const next = settled.nextId ? deleteButtons.current.get(settled.nextId) : undefined;
    const fallback = annotateButton.current && !annotateButton.current.disabled ? annotateButton.current : brushToggle.current;
    (next ?? fallback)?.focus({ preventScroll: true });
  }, [annotations, settled]);
  // Cancel and failure keep the note: focus goes back to the button that opened the confirm.
  useEffect(() => {
    if (restoreFocus === null) return;
    deleteButtons.current.get(restoreFocus)?.focus({ preventScroll: true });
    setRestoreFocus(null);
  }, [restoreFocus]);

  const timeBounds = useMemo(() => (xType === 'time' ? timeBoundaries(p.series, global.from, global.to) : []), [xType, p.series, global.from, global.to]);
  const showKeyboard = xType === 'time' && global.to !== null && timeBounds.length >= 2;
  const xValue = (x: string) => (xType === 'time' ? toMs(x) : x);
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
  const option = useMemo<EChartsCoreOption>(() => {
    const theme = chartTheme();
    // Pixels per axis unit from the plot width and the zoom window, so a label can be cut to its own area (#399 AC-2).
    const plotWidth = Math.max(0, chartWidth - PLOT_MARGIN);
    const zoomed = Math.max((zoom[1] - zoom[0]) / 100, 0.01);
    const units = xType === 'time' ? timeExtent : categories.length;
    const pxPerUnit = units > 0 ? plotWidth / (units * zoomed) : 0;
    const noteWidths = noteLabelWidths(noteSpans, pxPerUnit, plotWidth);
    const areas = [
      // Notes keep the default top label; the selection labels its bottom so a note saved over it never collides (#320).
      ...(selection ? [[{ name: lang === 'ko' ? '선택' : 'Selection', [horizontal ? 'yAxis' : 'xAxis']: xValue(selection.from), itemStyle: { color: token('chart-blue'), opacity: 0.12 }, label: { position: 'insideBottom' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(selection.to) }]] : []),
      ...annotations.map((a, i) => [{ name: a.text, [horizontal ? 'yAxis' : 'xAxis']: xValue(a.from), itemStyle: { color: token('chart-purple'), opacity: 0.14 }, label: { color: token('cat-purple'), fontSize: 10, offset: [0, noteLevels[i] * NOTE_LABEL_ROW], width: noteWidths[i], overflow: 'truncate', ellipsis: '…' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(a.to) }]),
    ];
    return {
      grid: { left: 52, right: 20, top: 16, bottom: 44, ...(horizontal ? { containLabel: true } : {}) },
      tooltip: {
        trigger: 'axis', confine: true, textStyle: { fontSize: 12 },
        valueFormatter: (v: number | null) => (v === null || v === undefined ? unknownLabel(lang === 'ko') : `${format(v)} ${p.unit}`),
      },
      xAxis: horizontal ? { type: 'value', min: 0, name: p.unit, splitLine: theme.splitLine } : xType === 'time'
        ? { type: 'time', axisLine: theme.axisLine, axisLabel: { hideOverlap: true }, splitLine: { show: false } }
        : { type: 'category', data: categories, axisLine: theme.axisLine, axisTick: { alignWithLabel: true } },
      yAxis: horizontal ? { type: 'category', data: categories, inverse: true, axisLine: theme.axisLine, axisLabel: { interval: 0 }, axisTick: { alignWithLabel: true } } : { type: 'value', min: 0, name: p.unit, nameTextStyle: { align: 'right' }, splitLine: theme.splitLine },
      dataZoom: [{ type: 'inside', ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }), start: zoom[0], end: zoom[1], zoomOnMouseWheel: 'shift', moveOnMouseMove: !brushMode }],
      // Fill derives rgba from the resolved chart-blue token (#297): copying stroke channels would shift the hue,
      // and a literal rgba copies the token's values. Selection and annotation fills keep echarts-native opacity.
      brush: { ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }), brushType: horizontal ? 'lineY' : 'lineX', brushMode: 'single', throttleType: 'debounce', throttleDelay: 120,
        brushStyle: { color: token('chart-blue').replace(/^rgb\((.+)\)$/, (_, rgb: string) => `rgba(${rgb},0.12)`), borderColor: token(strokeToken('chart-blue')) } },
      toolbox: { show: false, feature: { brush: { type: [horizontal ? 'lineY' : 'lineX', 'clear'] } } },
      series: [
        ...visible.map(s => {
          const kind = horizontal ? 'bar' : s.kind ?? 'line';
          const color = token(kind === 'line' ? strokeToken(s.color) : s.color);
          const pattern = linePattern(s, previousIds.has(s.id));
          return {
            id: s.id, name: s.name, type: kind, stack: p.stacked && kind === 'bar' ? 'total' : undefined,
            showSymbol: false, symbolSize: 5, connectNulls: false, barMaxWidth: 18,
            lineStyle: { ...(kind === 'line' ? { color } : {}), width: 2, type: pattern }, itemStyle: { color: token(s.color) },
            emphasis: { focus: 'series' },
            data: xType === 'time' ? s.points.map(([x, y]) => [toMs(x), y]) : horizontal ? categories.map(x => s.points.find(([label]) => label === x)?.[1] ?? null) : s.points.map(([, y]) => y),
          };
        }),
        {
          id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
          markArea: { silent: true, data: areas },
          markLine: p.markLines?.length ? { ...theme.referenceLine, data: p.markLines.map(m => ({ name: m.label, [horizontal ? 'xAxis' : 'yAxis']: m.y })) } : undefined,
        },
      ],
    };
    // Deps intentionally restricted to the chart inputs below (would trip react-hooks/exhaustive-deps if that rule is enabled).
  }, [visible, previousIds, xType, horizontal, categories, zoom, brushMode, selection, annotations, noteSpans, noteLevels, timeExtent, chartWidth, p.markLines, p.unit, lang, p.stacked, instanceReady]);

  // Re-arm the brush cursor after each option replacement, and once the instance becomes ready.
  useEffect(() => {
    chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: brushMode ? { brushType: horizontal ? 'lineY' : 'lineX', brushMode: 'single' } : { brushType: false } });
  }, [option, brushMode, horizontal, instanceReady]);

  // Pending legacy clicks belong to the displayed result and gesture configuration only.
  useEffect(() => () => {
    if (pendingClick.current !== null) clearTimeout(pendingClick.current);
    pendingClick.current = null;
  }, [brushMode, contextKey, visible, p.pointActivation, p.onPointClick]);
  useEffect(() => { if (brushMode || !selectedPoint) setPointMenuOpen(false); }, [brushMode, selectedPoint]);

  const eventPoint = useCallback((params: PointEvent): ChartPoint | null => {
    if (!params.seriesId || params.seriesId === '__overlay') return null;
    const series = visible.find(s => s.id === params.seriesId);
    if (!series) return null;
    const datum = params.dataIndex !== undefined
      ? (horizontal ? series.points.find(([x]) => x === categories[params.dataIndex!]) : series.points[params.dataIndex])
      : undefined;
    const x = datum?.[0] ?? (xType === 'time' && Array.isArray(params.value) ? formatDateTime(new Date(params.value[0] as number)) : params.name ?? '');
    const value = datum ? datum[1] : series.points.find(([label]) => label === x)?.[1];
    return value === undefined ? null : { x, seriesId: series.id, value };
  }, [visible, horizontal, categories, xType]);

  const onEvents = useMemo(() => ({
    brushEnd: (params: { areas?: { coordRange?: [number, number] }[] }, instance: ECharts) => {
      const range = params.areas?.[0]?.coordRange;
      instance.dispatchAction({ type: 'brush', areas: [] });
      if (!range) return;
      if (xType === 'time') {
        // Same snap as the keyboard path, then clip. A zero-width drag only drops an open confirm.
        const snapped = snapOutward(range[0], range[1], timeBounds);
        if (!snapped) { setPreview(null); return; }
        const result = clipToPeriod(snapped, global.from, global.to, compare && canCompare);
        setSelection(result.range);
        setClipNotice(result.notice);
        if (!result.range) closeNote();
        setRangeDraft(null);
      } else {
        const a = categories[Math.max(0, Math.round(range[0]))]; const b = categories[Math.min(categories.length - 1, Math.round(range[1]))];
        if (a && b) setSelection({ from: a, to: b });
        setClipNotice(null);
        setRangeDraft(null);
      }
      setPreview(null);
    },
    datazoom: (_: unknown, instance: ECharts) => {
      const dz = (instance.getOption() as { dataZoom?: { start: number; end: number }[] }).dataZoom?.[0];
      if (dz) setZoom([dz.start, dz.end]);
    },
    click: (params: PointEvent) => {
      if (brushMode) return;
      const point = eventPoint(params);
      if (!point) return;
      if (pointControls) setSelectedPointKey(pointKey(point));
      if (p.pointActivation?.on === 'dblclick') {
        if (pendingClick.current !== null) clearTimeout(pendingClick.current);
        pendingClick.current = setTimeout(() => { pendingClick.current = null; p.onPointClick?.(point.x, point.seriesId); }, 300);
      } else {
        p.onPointClick?.(point.x, point.seriesId);
        p.pointActivation?.onActivate(point);
      }
    },
    dblclick: (params: PointEvent) => {
      if (pendingClick.current !== null) clearTimeout(pendingClick.current);
      pendingClick.current = null;
      if (brushMode || p.pointActivation?.on !== 'dblclick') return;
      const point = eventPoint(params);
      if (point) { setSelectedPointKey(pointKey(point)); p.pointActivation.onActivate(point); }
    },
    contextmenu: (params: PointEvent) => {
      if (brushMode || !p.pointActions?.length) return;
      const point = eventPoint(params);
      if (point) { params.event?.event?.preventDefault?.(); setSelectedPointKey(pointKey(point)); setPointMenuOpen(true); }
    },
  }), [xType, categories, brushMode, p.onPointClick, p.pointActivation, p.pointActions, pointControls, eventPoint, timeBounds, global.from, global.to, compare, canCompare, closeNote]);

  const selectionCounts = selection ? visible.map(s => {
    const inRange = s.points.filter(([x, y]) => y !== null && (xType === 'time' ? x >= selection.from && x < selection.to : categories.indexOf(x) >= categories.indexOf(selection.from) && categories.indexOf(x) <= categories.indexOf(selection.to)));
    const values = inRange.map(([, y]) => y as number);
    return { s, n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, max: values.length ? Math.max(...values) : null };
  }) : [];

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

  async function saveNote(range: Selection) {
    const text = (note ?? '').trim();
    if (!text || scopeId === null || saving) return;
    const gen = draftGen.current;
    const failed = () => { if (gen === draftGen.current) toast(lang === 'ko' ? '주석을 저장하지 못했습니다. 입력은 유지됩니다.' : 'Could not save the annotation. Your text is kept.'); };
    setSaving(true);
    try {
      const res = await adapter.saveAnnotation({ chartId: p.chartId, scopeId, from: range.from, to: range.to, text });
      if (res.outcome !== 'ok') failed();
      else {
        refetchAnnotations();
        if (gen === draftGen.current) { closeNote(); toast(lang === 'ko' ? '주석을 저장했습니다.' : 'Annotation saved.'); }
      }
    } catch { failed(); } finally { setSaving(false); }
  }

  async function deleteNote(id: string) {
    if (scopeId === null || deleting) return;
    const mineIds = annotations.filter(a => a.mine).map(a => a.id);
    const nextId = mineIds[mineIds.indexOf(id) + 1] ?? null;
    const gen = deleteGen.current;
    const stale = () => gen !== deleteGen.current;
    const failed = () => {
      if (stale()) return;
      toast(lang === 'ko' ? '주석을 삭제하지 못했습니다.' : 'Could not delete the annotation.');
      setPendingDelete(null); setDeleting(false);
      if (focusOnConfirm.current) setRestoreFocus(id);
      focusOnConfirm.current = false;
    };
    setDeleting(true);
    try {
      const res = await adapter.deleteAnnotation({ chartId: p.chartId, scopeId, id });
      if (stale()) {
        // The server removed the note; the session list is keyed by chart and Scope only, so it must still reload.
        if (res.outcome === 'ok') refetchAnnotations();
        return;
      }
      if (res.outcome !== 'ok') { failed(); return; }
      toast(lang === 'ko' ? '주석을 삭제했습니다.' : 'Annotation deleted.');
      setSettled({ id, nextId });
      refetchAnnotations();
    } catch { failed(); }
  }

  const oneHour = global.to ? presetWindow(1, timeBounds, global.to) : null;
  const fourHour = global.to ? presetWindow(4, timeBounds, global.to) : null;
  const fallbackRange: Selection | null = timeBounds.length >= 2 ? { from: timeBounds[0], to: timeBounds[timeBounds.length - 1] } : null;
  const draft = rangeDraft ?? selection ?? fallbackRange;
  function commitRange(range: Selection) {
    const snapped = snapOutward(toMs(range.from), toMs(range.to), timeBounds);
    if (!snapped) { setPreview(null); return; }
    const result = clipToPeriod(snapped, global.from, global.to, compare && canCompare && xType === 'time');
    setSelection(result.range);
    setClipNotice(result.notice);
    if (!result.range) closeNote();
    setPreview(null);
    setRangeDraft(null);
  }
  function chooseStart(next: string) {
    const base = rangeDraft ?? selection ?? fallbackRange;
    if (!base) return;
    const to = base.to > next ? base.to : timeBounds.find(bound => bound > next) ?? base.to;
    setRangeDraft({ from: next, to });
  }
  function chooseEnd(next: string) {
    const base = rangeDraft ?? selection ?? fallbackRange;
    if (!base) return;
    setRangeDraft({ from: base.from, to: next });
  }

  // min-w-0: the plot canvas owns a fixed px width; without it that width becomes the card's min-content and a
  // grid cell can never shrink the card (the ResizeObserver then never sees a smaller width on column switch).
  return <section role="region" aria-labelledby={titleId} data-analysis-chart={analysisSection ? '' : undefined} className="relative flex min-w-0 flex-col rounded-lg border border-border-subtle bg-surface-card">
    {/* Pinned to the card corner so a wrapping toolbar never strands it on its own line. */}
    <AnalysisChartPart enabled={analysisSection !== null}>
    <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', analysisSection && 'pr-12')}>
      <ChartHeading titleId={titleId} title={p.title} description={p.description} metricVersion={p.metricVersion} compact={compact} />
      {/* The core controls wrap in source order inside narrow cards; the Export/More tail stays bundled as its own
        wrap unit. Wide cards keep one right-aligned row, and extraActions keeps its own bundle. */}
      <div role="toolbar" aria-label={lang === 'ko' ? '차트 동작' : 'Chart actions'} className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {pointControls && <div className="flex flex-wrap items-center gap-1">
          <select aria-label={lang === 'ko' ? '차트 지점 선택' : 'Select chart point'} value={selectedPoint ? pointKey(selectedPoint) : ''} disabled={brushMode || !points.length}
            className="max-w-56 rounded-md border border-border-control bg-surface-card px-2 py-1 text-xs" onChange={event => setSelectedPointKey(event.target.value)}>
            {!points.length && <option value="">{lang === 'ko' ? '선택할 지점 없음' : 'No points available'}</option>}
            {points.map(point => <option key={pointKey(point)} value={pointKey(point)}>{point.x} · {allSeries.find(s => s.id === point.seriesId)?.name} · {point.value === null ? unknownLabel(lang === 'ko') : format(point.value)}</option>)}
          </select>
          {p.pointActivation && <Button variant="ghost" size="toolbar" disabled={brushMode || !selectedPoint} onClick={() => { if (selectedPoint && !brushMode) p.pointActivation?.onActivate(selectedPoint); }}>{lang === 'ko' ? '선택 지점 실행' : 'Activate selected point'}</Button>}
          {!!p.pointActions?.length && <DropdownMenu open={pointMenuOpen && !brushMode && !!selectedPoint} onOpenChange={setPointMenuOpen}>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="toolbar" disabled={brushMode || !selectedPoint}>{lang === 'ko' ? '지점 동작' : 'Point actions'}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {p.pointActions.map(action => <DropdownMenuItem key={action.id} disabled={action.disabled} className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring" onSelect={() => { if (selectedPoint && !brushMode) action.onSelect(selectedPoint); }}>{action.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
          {brushMode && <span className="text-tiny text-text-secondary">{lang === 'ko' ? '구간 선택 중에는 지점 실행과 동작을 사용할 수 없습니다.' : 'Point activation and actions are unavailable while brushing.'}</span>}
        </div>}
        {p.extraActions != null && <div className="flex items-center gap-1">{p.extraActions}</div>}
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="toolbar" onClick={() => setZoom(([a, b]) => { const q = (b - a) / 4; return [a + q, b - q]; })} title={lang === 'ko' ? '확대 (Shift+휠도 가능)' : 'Zoom in (Shift+wheel)'}><ZoomIn className="size-3.5" aria-hidden />{lang === 'ko' ? '확대' : 'Zoom'}</Button>
          <Button ref={brushToggle} variant={brushMode ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={brushMode} onClick={() => setBrushMode(b => !b)}><BrushIcon className="size-3.5" aria-hidden />{lang === 'ko' ? '구간 선택' : 'Brush'}</Button>
          {showKeyboard && <div role="group" aria-label={lang === 'ko' ? '빠른 구간 선택' : 'Quick range'} className="flex items-center gap-1">
            {oneHour && <Button variant="ghost" size="toolbar" onClick={() => commitRange(oneHour)}>{lang === 'ko' ? '1시간' : '1h'}</Button>}
            {fourHour && <Button variant="ghost" size="toolbar" onClick={() => commitRange(fourHour)}>{lang === 'ko' ? '4시간' : '4h'}</Button>}
            <Button variant="ghost" size="toolbar" onClick={() => commitRange({ from: timeBounds[0], to: timeBounds[timeBounds.length - 1] })}>{lang === 'ko' ? '전체' : 'All'}</Button>
          </div>}
          <Button variant="ghost" size="toolbar" onClick={resetLocal}><RotateCcw className="size-3.5" aria-hidden />{lang === 'ko' ? '초기화' : 'Reset'}</Button>
          {canCompare && <Button variant={compare ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={compare} onClick={() => {
            const next = !compare;
            if (next && canCompare && xType === 'time' && (selection || preview)) {
              const source = selection ?? preview!;
              const snapped = snapOutward(toMs(source.from), toMs(source.to), timeBounds);
              const result = snapped ? clipToPeriod(snapped, global.from, global.to, true) : { range: null, notice: 'outside' as const };
              if (selection) {
                setSelection(result.range);
                if (!result.range) closeNote();
              }
              if (preview) setPreview(result.range);
              setClipNotice(result.notice);
              setRangeDraft(null);
            }
            setCompare(next);
          }}><GitCompare className="size-3.5" aria-hidden />{lang === 'ko' ? '비교' : 'Compare'}</Button>}
          {canAnnotate && <Button ref={annotateButton} variant="ghost" size="toolbar" disabled={!selection || scopeId === null} title={scopeId === null ? (lang === 'ko' ? '주석은 사이트(Scope)를 선택한 뒤 남길 수 있습니다' : 'Pick a site (Scope) to annotate') : selection ? undefined : (lang === 'ko' ? '구간 선택으로 구간을 먼저 선택하세요' : 'Brush a range first')} onClick={openNote}><MessageSquarePlus className="size-3.5" aria-hidden />{lang === 'ko' ? '주석' : 'Annotate'}</Button>}
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

    <div role="group" aria-label={lang === 'ko' ? '범례' : 'Legend'} className={cn('px-4 pt-2', showPeriodGroups ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- legend column count depends on the visible period groups at runtime */}
      {showPeriodGroups ? usePeriodLegendGrid ? <div data-period-legend-grid className="grid items-center gap-x-4 gap-y-2" style={{ gridTemplateColumns: `repeat(${periodLegendColumnCount + 1}, max-content)` }}>
        {renderPeriodLegendGroup(currentPeriodId, t('currentPeriod'), p.series, false)}
        {renderPeriodLegendGroup(previousPeriodId, t('previousPeriod'), p.compareSeries ?? [], true)}
      </div> : <>
        {renderPeriodLegendGroup(currentPeriodId, t('currentPeriod'), p.series, false)}
        {renderPeriodLegendGroup(previousPeriodId, t('previousPeriod'), p.compareSeries ?? [], true)}
      </> : allSeries.map(s => renderLegendSeries(s, false))}
      {brushMode && <span className="text-tiny text-accent-primary">{lang === 'ko' ? '차트를 드래그해 구간을 선택하세요' : 'Drag across the chart to select a range'}</span>}
      {p.onPointClick && !brushMode && p.pointClickHint && <span className="text-tiny text-text-muted">{p.pointClickHint}</span>}
    </div>

    </AnalysisChartPart>
    <AnalysisChartPart enabled={analysisSection !== null} body>
    {allSeries.length > 0 && visible.length === 0 && <p role="status" className="px-4 py-3 text-text-secondary">{lang === 'ko' ? '표시할 시리즈를 모두 껐습니다' : 'All series are turned off'}</p>}
    <div className="px-2" role={pointControls ? 'group' : undefined} aria-label={pointControls ? (lang === 'ko' ? '차트 지점' : 'Chart points') : undefined} tabIndex={pointControls ? 0 : undefined}
      onContextMenu={event => { if (p.pointActions?.length) event.preventDefault(); }}
      onKeyDown={event => {
        if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && p.pointActions?.length) {
          event.preventDefault();
          if (!brushMode && selectedPoint) setPointMenuOpen(true);
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

    <section aria-label={lang === 'ko' ? '선택 요약' : 'Selection summary'} aria-live="polite" className="mx-4 mb-3 min-h-9 rounded-md bg-surface-sunken px-3 py-2 text-xs">
      {showKeyboard && draft && <div role="group" aria-label={lang === 'ko' ? '시작과 끝으로 구간 선택' : 'Choose a range by start and end'} className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-text-secondary">{lang === 'ko' ? '시작' : 'Start'}</span>
        <Select value={draft.from} onValueChange={chooseStart}>
          <SelectTrigger aria-label={lang === 'ko' ? '구간 시작' : 'Range start'} className="h-8 w-44 border-border-control">
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
      {!selection ? <span className="text-text-secondary">{showKeyboard
        ? (lang === 'ko' ? '선택 구간 없음 — 시작·끝이나 빠른 구간, 또는 구간 선택으로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — choose a start and end, a quick range, or brush a range to summarize, annotate or apply it.')
        : (lang === 'ko' ? '선택 구간 없음 — 구간 선택으로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — brush a range to summarize, annotate or apply it.')}</span>
        : <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold tabular">{t('selectedRange')}: {xType === 'time' ? `${fmt(selection.from)} – ${fmt(selection.to)}` : `${selection.from} – ${selection.to}`}</span>
          {selectionCounts.map(c => <span key={c.s.id} className="tabular text-text-secondary">{c.s.name}: n={c.n}{c.avg !== null && ` · avg ${format(c.avg)} · max ${format(c.max!)}`} {p.unit}</span>)}
          <span className="ml-auto flex flex-wrap gap-2">
            {p.selectionActions?.(selection)}
            {xType === 'time' && p.canApplyRange !== false && <Button ref={applyRangeButton} size="toolbar" onClick={() => setPreview(selection)}>{lang === 'ko' ? '분석 구간 적용…' : 'Apply analysis range…'}</Button>}
            <Button size="toolbar" variant="ghost" onClick={() => { setSelection(null); setClipNotice(null); setRangeDraft(null); }}>{t('clear')}</Button>
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
        <Button size="toolbar" variant="secondary" onClick={() => { setPreview(null); applyRangeButton.current?.focus({ preventScroll: true }); }}>{t('cancel')}</Button>
      </div>}
      {canAnnotate && note !== null && selection && <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void saveNote(selection); }}>
        <input autoFocus aria-label={lang === 'ko' ? '주석 내용' : 'Annotation text'} value={note} onChange={e => setNote(e.target.value)} placeholder={lang === 'ko' ? '예: PM 작업으로 인한 대기 증가' : 'e.g. queue spike due to PM'} className="h-7 min-w-64 flex-1 rounded-md border border-border-control bg-surface-card px-2" />
        <Button size="toolbar" type="submit" disabled={saving}>{lang === 'ko' ? '저장' : 'Save'}</Button>
        <Button size="toolbar" type="button" variant="ghost" onClick={closeNote}>{t('cancel')}</Button>
      </form>}
      {canAnnotate && scopeId !== null && annotationQuery.response && !['ok', 'empty'].includes(annotationQuery.response.outcome) && <p role="alert" className="mt-2 flex items-center gap-2 border-t border-border-subtle pt-1.5 text-tiny text-text-secondary">
        {lang === 'ko' ? '주석을 불러오지 못했습니다. 차트는 그대로 사용할 수 있습니다.' : 'Could not load annotations. The chart is unaffected.'}
        <Button size="toolbar" variant="ghost" onClick={refetchAnnotations}>{lang === 'ko' ? '다시 시도' : 'Retry'}</Button>
      </p>}
      {annotations.length > 0 && <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-1.5 text-tiny text-text-secondary">
        {annotations.map(a => <li key={a.id} className="tabular flex flex-wrap items-center gap-x-1"><span className="mr-1 inline-block size-2 rounded-xs bg-chart-purple/60 align-middle" aria-hidden />{xType === 'time' ? `${fmt(a.from)}–${fmt(a.to)}` : `${a.from}–${a.to}`}: {a.text}
          {a.mine && (pendingDelete === a.id
            ? <div role="group" aria-label={lang === 'ko' ? `삭제 확인: ${a.text}` : `Confirm delete: ${a.text}`} className="ml-2 inline-flex items-center gap-1" onFocus={() => { focusOnConfirm.current = true; }} onBlur={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              // Removing the focused button also fires focusout (relatedTarget null, activeElement body) while the row is still attached; judge after the commit: a row that is gone keeps ownership.
              const group = e.currentTarget;
              queueMicrotask(() => { if (group.isConnected && !group.contains(document.activeElement)) focusOnConfirm.current = false; });
            }}>
              <span>{lang === 'ko' ? '이 주석을 삭제할까요?' : 'Delete this note?'}</span>
              <Button size="toolbar" variant="destructive" autoFocus aria-disabled={deleting} onClick={() => void deleteNote(a.id)}>{lang === 'ko' ? '삭제 확정' : 'Confirm delete'}</Button>
              <Button size="toolbar" variant="ghost" aria-disabled={deleting} onClick={() => { if (deleting) return; setPendingDelete(null); setRestoreFocus(a.id); }}>{t('cancel')}</Button>
            </div>
            : <Button ref={el => { if (el) deleteButtons.current.set(a.id, el); else deleteButtons.current.delete(a.id); }} size="toolbar" variant="ghost" className="ml-2" aria-label={lang === 'ko' ? `삭제: ${a.text}` : `Delete note: ${a.text}`} onClick={() => setPendingDelete(a.id)}>{lang === 'ko' ? '삭제' : 'Delete'}</Button>)}
        </li>)}
      </ul>}
    </section>

    <ChartTrustFooter trust={p.trust} />
    </AnalysisChartPart>
  </section>;
}
