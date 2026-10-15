// THROWAWAY #303/#307 — never merge.
import { BrushIcon, Download, GitCompare, MessageSquarePlus, MoreHorizontal, RotateCcw, Table2, ZoomIn } from 'lucide-react';
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { formatDateTime, formatMetricVersion, parseDateTime } from '@ap/contracts';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, prefersReducedMotion, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, usePrototype } from '@ap/ui';
import { AnalysisSectionContext } from './AnalysisSectionContext';
import { EChart, strokeToken, token } from './EChart';
import { toCsvDocument } from './tableExport';

function AnalysisChartPart({ enabled, body, children }: { enabled: boolean; body?: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return body ? <div data-analysis-chart-body className="flex flex-1 flex-col">{children}</div>
    : <div data-analysis-chart-head>{children}</div>;
}

export type ChartSeries = {
  id: string;
  name: string;
  /** CSS custom property name from tokens.css, e.g. 'chart-blue'. */
  color: string;
  /** [x, y]: x is a naive wall-clock datetime (time axis) or a category label. null = unknown, never 0. */
  points: [string, number | null][];
  kind?: 'line' | 'bar';
  dashed?: boolean;
};

type Selection = { from: string; to: string };
type LinePattern = 'solid' | number[];
const toMs = (v: string) => parseDateTime(v, 'x').getTime();
const fmt = (v: string) => v.replace('T', ' ').slice(0, 16);

function linePattern(series: ChartSeries, previous: boolean): LinePattern {
  if (previous) return series.dashed ? [8, 3, 2, 3] : [2, 2];
  return series.dashed ? [8, 4] : 'solid';
}

function svgDasharray(pattern: LinePattern): string | undefined {
  return Array.isArray(pattern) ? pattern.join(' ') : undefined;
}

export type AnalysisChartFrameProps = {
  chartId: string;
  title: ReactNode;
  description?: ReactNode;
  metricVersion?: string;
  series: ChartSeries[];
  /** Shown only while Compare is on (e.g. previous period, other group). */
  compareSeries?: ChartSeries[];
  xType?: 'time' | 'category';
  unit: string;
  valueFormat?: (v: number) => string;
  height?: number;
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
  const { setGlobal, toast, global, adapter, route } = usePlatform();
  // THROWAWAY #303/#307 — never merge.
  const prototype = usePrototype();
  const brushVariant = prototype.question === 'brush' ? prototype.variant : null;
  const prototypeBrushActive = brushVariant !== null;
  const features = route?.menu.features;
  const canCompare = !!features?.compare && !!p.compareSeries?.length;
  const canAnnotate = !!features?.annotate;
  const canExport = !!features?.export;
  const titleId = useId();
  // THROWAWAY #303/#307 — never merge.
  const cursorTextId = useId();
  const currentPeriodId = useId();
  const previousPeriodId = useId();
  const xType = p.xType ?? 'time';
  const chart = useRef<ECharts | null>(null);
  // Focus anchors for the confirm row (#297 UX): it unmounts on both outcomes, so its handlers hand focus back —
  // cancel to the "Apply analysis range…" button, apply (selection cleared by the Context change) to the brush toggle.
  const brushToggle = useRef<HTMLButtonElement | null>(null);
  const applyRangeButton = useRef<HTMLButtonElement | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [brushMode, setBrushMode] = useState(false);
  // Bumped from onReady: imperative instance effects below must replay once the lazy EChartImpl
  // creates the instance (a Brush click during chunk load would otherwise never reach it, #48 P1).
  const [instanceReady, setInstanceReady] = useState(0);
  const [zoom, setZoom] = useState<[number, number]>([0, 100]);
  const [selection, setSelection] = useState<Selection | null>(null);
  // THROWAWAY #303/#307 — never merge.
  const [selectionClipped, setSelectionClipped] = useState(false);
  const [rangeDraft, setRangeDraft] = useState<Selection | null>(null);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<Selection | null>(null);
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
  const openNote = () => { draftGen.current++; setNote(''); };
  const closeNote = useCallback(() => { draftGen.current++; setNote(null); }, []);

  const allSeries = useMemo(() => [...p.series, ...(compare && canCompare ? p.compareSeries ?? [] : [])], [p.series, p.compareSeries, compare, canCompare]);
  const previousIds = useMemo(() => new Set(compare && canCompare ? p.compareSeries?.map(s => s.id) ?? [] : []), [compare, canCompare, p.compareSeries]);
  const showPeriodGroups = compare && canCompare;
  const periodLegendColumnCount = Math.max(p.series.length, p.compareSeries?.length ?? 0);
  const usePeriodLegendGrid = periodLegendColumnCount <= 4;
  const visible = allSeries.filter(s => !hidden.has(s.id));
  const categories = useMemo(() => (xType === 'category' ? p.series[0]?.points.map(([x]) => x) ?? [] : []), [xType, p.series]);
  // THROWAWAY #303/#307 — never merge.
  const timeBoundaries = useMemo(() => {
    if (xType !== 'time') return [];
    const values = new Set(p.series.flatMap(s => s.points.map(([x]) => x)).filter(x => (global.from === null || x >= global.from) && (global.to === null || x < global.to)));
    if (global.from) values.add(global.from);
    if (global.to) values.add(global.to);
    const sorted = [...values].sort();
    if (!global.to && sorted.length > 1) sorted.push(formatDateTime(new Date(toMs(sorted[sorted.length - 1]) + toMs(sorted[sorted.length - 1]) - toMs(sorted[sorted.length - 2]))));
    return sorted;
  }, [xType, p.series, global.from, global.to]);
  const keyboardValues = xType === 'time' ? timeBoundaries.slice(0, -1) : categories;
  const cursorValue = keyboardValues[Math.min(cursorIndex, Math.max(0, keyboardValues.length - 1))];
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

  // THROWAWAY #303/#307 — never merge.
  const commitSelection = useCallback((next: Selection | null, clipped = false) => {
    setSelection(next);
    setSelectionClipped(clipped);
    setRangeDraft(null);
    setPreview(null);
  }, []);
  const normalizeTimeRange = useCallback((raw: [number, number], clampCurrent = prototypeBrushActive && compare) => {
    let start = Math.min(raw[0], raw[1]);
    let end = Math.max(raw[0], raw[1]);
    let clipped = false;
    if (clampCurrent && global.from && global.to) {
      const lower = toMs(global.from); const upper = toMs(global.to);
      const nextStart = Math.max(start, lower); const nextEnd = Math.min(end, upper);
      clipped = nextStart !== start || nextEnd !== end;
      start = nextStart; end = nextEnd;
      if (start >= end) return { selection: null as Selection | null, clipped: true };
    }
    if (prototypeBrushActive && timeBoundaries.length >= 2) {
      let fromIndex = 0;
      for (let i = 0; i < timeBoundaries.length; i++) {
        if (toMs(timeBoundaries[i]) <= start) fromIndex = i;
        else break;
      }
      let toIndex = timeBoundaries.findIndex(value => toMs(value) >= end);
      if (toIndex < 0) toIndex = timeBoundaries.length - 1;
      if (toIndex <= fromIndex) toIndex = Math.min(fromIndex + 1, timeBoundaries.length - 1);
      const from = timeBoundaries[fromIndex]; const to = timeBoundaries[toIndex];
      return from < to ? { selection: { from, to }, clipped } : { selection: null, clipped };
    }
    const from = formatDateTime(new Date(Math.floor(start / 1000) * 1000));
    const to = formatDateTime(new Date(Math.ceil(end / 1000) * 1000));
    return from < to ? { selection: { from, to }, clipped } : { selection: null, clipped };
  }, [prototypeBrushActive, compare, global.from, global.to, timeBoundaries]);
  const annotationsForDisplay = useMemo(() => {
    if (!prototypeBrushActive || !compare || xType !== 'time' || !global.from || !global.to) return annotations;
    const lower = toMs(global.from); const upper = toMs(global.to);
    return annotations.flatMap(annotation => {
      const from = Math.max(toMs(annotation.from), lower); const to = Math.min(toMs(annotation.to), upper);
      return from < to ? [{ ...annotation, from: formatDateTime(new Date(from)), to: formatDateTime(new Date(to)) }] : [];
    });
  }, [annotations, prototypeBrushActive, compare, xType, global.from, global.to]);
  const setRangePreset = useCallback((hours: number | null) => {
    if (timeBoundaries.length < 2) return;
    const to = timeBoundaries[timeBoundaries.length - 1];
    const endMs = toMs(to);
    const target = hours === null ? toMs(timeBoundaries[0]) : Math.max(toMs(timeBoundaries[0]), endMs - hours * 3_600_000);
    const from = timeBoundaries.slice(0, -1).filter(value => toMs(value) <= target).at(-1) ?? timeBoundaries[0];
    commitSelection({ from, to });
  }, [timeBoundaries, commitSelection]);

  const resetLocal = useCallback(() => {
    setHidden(new Set()); setCompare(false); setBrushMode(false); setZoom([0, 100]); commitSelection(null); setCursorIndex(0); setAnchorIndex(null); closeNote();
  }, [closeNote, commitSelection]);
  // Global Context changes invalidate local selection (it described the previous result).
  const contextKey = JSON.stringify(global);
  // THROWAWAY #303/#307 — never merge.
  useEffect(() => { setSelection(null); setSelectionClipped(false); setRangeDraft(null); setCursorIndex(0); setAnchorIndex(null); setPreview(null); closeNote(); setZoom([0, 100]); }, [contextKey, closeNote]);

  const xValue = (x: string) => (xType === 'time' ? toMs(x) : x);
  const option = useMemo<EChartsCoreOption>(() => {
    const areas = [
      // Notes keep the default top label; the selection labels its bottom so a note saved over it never collides (#320).
      ...(selection ? [[{ name: lang === 'ko' ? '선택' : 'Selection', xAxis: xValue(selection.from), itemStyle: { color: token('chart-blue'), opacity: 0.12 }, label: { position: 'insideBottom' } }, { xAxis: xValue(selection.to) }]] : []),
      ...annotationsForDisplay.map(a => [{ name: a.text, xAxis: xValue(a.from), itemStyle: { color: token('chart-purple'), opacity: 0.14 }, label: { color: token('cat-purple'), fontSize: 10 } }, { xAxis: xValue(a.to) }]),
    ];
    const markLines = [
      ...(p.markLines ?? []).map(mark => ({ name: mark.label, yAxis: mark.y })),
      ...(brushVariant === 'B' && cursorValue !== undefined ? [{ name: lang === 'ko' ? '현재 버킷' : 'Current bucket', xAxis: xValue(cursorValue), lineStyle: { color: token('accent-primary'), width: 2, type: 'solid' }, label: { show: false } }] : []),
    ];
    return {
      grid: { left: 52, right: 20, top: 16, bottom: 44 },
      tooltip: {
        trigger: 'axis', confine: true, textStyle: { fontSize: 12 },
        valueFormatter: (v: number | null) => (v === null || v === undefined ? (lang === 'ko' ? '미확인' : 'unknown') : `${format(v)} ${p.unit}`),
      },
      xAxis: xType === 'time'
        // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
        ? { type: 'time', axisLine: { lineStyle: { color: token('border-strong') } }, axisLabel: { hideOverlap: true }, splitLine: { show: false } }
        // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
        : { type: 'category', data: categories, axisLine: { lineStyle: { color: token('border-strong') } }, axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', min: 0, name: p.unit, nameTextStyle: { align: 'right' }, splitLine: { lineStyle: { color: token('chart-grid') } } },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, start: zoom[0], end: zoom[1], zoomOnMouseWheel: 'shift', moveOnMouseMove: !brushMode }],
      // Fill derives rgba from the resolved chart-blue token (#297): copying stroke channels would shift the hue,
      // and a literal rgba copies the token's values. Selection and annotation fills keep echarts-native opacity.
      brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', throttleType: 'debounce', throttleDelay: 120,
        brushStyle: { color: token('chart-blue').replace(/^rgb\((.+)\)$/, (_, rgb: string) => `rgba(${rgb},0.12)`), borderColor: token(strokeToken('chart-blue')) } },
      toolbox: { show: false, feature: { brush: { type: ['lineX', 'clear'] } } },
      series: [
        ...visible.map(s => {
          const kind = s.kind ?? 'line';
          const color = token(kind === 'line' ? strokeToken(s.color) : s.color);
          const pattern = linePattern(s, previousIds.has(s.id));
          return {
            id: s.id, name: s.name, type: kind, stack: p.stacked && kind === 'bar' ? 'total' : undefined,
            showSymbol: false, symbolSize: 5, connectNulls: false, barMaxWidth: 18,
            lineStyle: { ...(kind === 'line' ? { color } : {}), width: 2, type: pattern }, itemStyle: { color: token(s.color) },
            emphasis: { focus: 'series' },
            data: s.points.map(([x, y]) => (xType === 'time' ? [toMs(x), y] : y)),
          };
        }),
        {
          id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
          markArea: { silent: true, data: areas },
          // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
          markLine: markLines.length ? { silent: true, symbol: 'none', lineStyle: { color: token('text-secondary'), type: 'dashed' }, label: { formatter: '{b}', fontSize: 10, color: token('text-secondary'), position: 'insideEndTop' }, data: markLines } : undefined,
        },
      ],
    };
    // Deps intentionally restricted to the chart inputs below (would trip react-hooks/exhaustive-deps if that rule is enabled).
  }, [visible, previousIds, xType, categories, zoom, brushMode, selection, annotationsForDisplay, p.markLines, p.unit, lang, p.stacked, brushVariant, cursorValue]);

  // Re-arm the brush cursor after each option replacement, and once the instance becomes ready.
  useEffect(() => {
    chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: brushMode ? { brushType: 'lineX', brushMode: 'single' } : { brushType: false } });
  }, [option, brushMode, instanceReady]);

  const onEvents = useMemo(() => ({
    brushEnd: (params: { areas?: { coordRange?: [number, number] }[] }, instance: ECharts) => {
      const range = params.areas?.[0]?.coordRange;
      instance.dispatchAction({ type: 'brush', areas: [] });
      if (!range) return;
      if (xType === 'time') {
        const normalized = normalizeTimeRange(range);
        commitSelection(normalized.selection, normalized.clipped);
      } else {
        const a = categories[Math.max(0, Math.round(range[0]))]; const b = categories[Math.min(categories.length - 1, Math.round(range[1]))];
        if (a && b) commitSelection({ from: a, to: b });
      }
    },
    datazoom: (_: unknown, instance: ECharts) => {
      const dz = (instance.getOption() as { dataZoom?: { start: number; end: number }[] }).dataZoom?.[0];
      if (dz) setZoom([dz.start, dz.end]);
    },
    click: (params: { seriesId?: string; value?: unknown; name?: string }) => {
      if (brushMode || !p.onPointClick || !params.seriesId || params.seriesId === '__overlay') return;
      const x = xType === 'time' && Array.isArray(params.value) ? formatDateTime(new Date(params.value[0] as number)) : params.name ?? '';
      p.onPointClick(x, params.seriesId);
    },
  }), [xType, categories, brushMode, p.onPointClick, normalizeTimeRange, commitSelection]);

  // THROWAWAY #303/#307 — never merge.
  const toggleCompare = () => {
    const next = !compare;
    setCompare(next);
    if (next && prototypeBrushActive && xType === 'time' && selection) {
      const normalized = normalizeTimeRange([toMs(selection.from), toMs(selection.to)], true);
      commitSelection(normalized.selection, normalized.clipped);
    } else if (!next) setSelectionClipped(false);
  };
  const onChartKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (brushVariant !== 'B' || event.altKey || event.ctrlKey || event.metaKey || keyboardValues.length === 0) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      commitSelection(null);
      setAnchorIndex(null);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const currentIndex = Math.min(cursorIndex, keyboardValues.length - 1);
    const nextIndex = Math.max(0, Math.min(keyboardValues.length - 1, currentIndex + (event.key === 'ArrowLeft' ? -1 : 1)));
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    setCursorIndex(nextIndex);
    if (event.shiftKey) {
      const anchor = anchorIndex ?? currentIndex;
      setAnchorIndex(anchor);
      const startIndex = Math.min(anchor, nextIndex); const endIndex = Math.max(anchor, nextIndex);
      if (xType === 'time') {
        const from = timeBoundaries[startIndex]; const to = timeBoundaries[Math.min(endIndex + 1, timeBoundaries.length - 1)];
        if (from && to) commitSelection({ from, to });
      } else {
        const from = categories[startIndex]; const to = categories[endIndex];
        if (from && to) commitSelection({ from, to });
      }
    } else {
      setAnchorIndex(null);
      commitSelection(null);
    }
  };
  const sliderStartIndex = selection && timeBoundaries.includes(selection.from) ? timeBoundaries.indexOf(selection.from) : 0;
  const sliderEndIndex = selection && timeBoundaries.includes(selection.to) ? timeBoundaries.indexOf(selection.to) : Math.max(1, timeBoundaries.length - 1);
  const commitSliderIndex = (thumb: 'start' | 'end', value: number) => {
    if (timeBoundaries.length < 2) return;
    const last = timeBoundaries.length - 1;
    const start = thumb === 'start' ? Math.max(0, Math.min(value, sliderEndIndex - 1)) : sliderStartIndex;
    const end = thumb === 'end' ? Math.max(start + 1, Math.min(value, last)) : sliderEndIndex;
    commitSelection({ from: timeBoundaries[start], to: timeBoundaries[end] });
  };
  const onSliderKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, thumb: 'start' | 'end') => {
    const min = thumb === 'start' ? 0 : sliderStartIndex + 1;
    const max = thumb === 'start' ? sliderEndIndex - 1 : timeBoundaries.length - 1;
    const current = thumb === 'start' ? sliderStartIndex : sliderEndIndex;
    const pageStep = Math.max(1, Math.ceil((max - min + 1) / 10));
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowDown': next = current - 1; break;
      case 'ArrowRight': case 'ArrowUp': next = current + 1; break;
      case 'PageDown': next = current - pageStep; break;
      case 'PageUp': next = current + pageStep; break;
      case 'Home': next = min; break;
      case 'End': next = max; break;
      default: return;
    }
    event.preventDefault();
    commitSliderIndex(thumb, Math.max(min, Math.min(max, next)));
  };
  const rangeInputValue = rangeDraft ?? selection ?? (timeBoundaries.length >= 2 ? { from: timeBoundaries[0], to: timeBoundaries[timeBoundaries.length - 1] } : null);
  const rangeEndOptions = rangeInputValue ? timeBoundaries.filter(value => value > rangeInputValue.from) : [];

  const selectionCounts = selection ? visible.map(s => {
    const inRange = s.points.filter(([x, y]) => y !== null && (xType === 'time' ? x >= selection.from && x < selection.to : categories.indexOf(x) >= categories.indexOf(selection.from) && categories.indexOf(x) <= categories.indexOf(selection.to)));
    const values = inRange.map(([, y]) => y as number);
    return { s, n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, max: values.length ? Math.max(...values) : null };
  }) : [];

  function renderLegendSeries(s: ChartSeries, previous: boolean) {
    const kind = s.kind ?? 'line';
    // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
    const stroke = token(kind === 'bar' && s.color === 'chart-remainder' ? 'border-control' : strokeToken(s.color));
    return <label key={s.id} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
      <input type="checkbox" className="size-3.5 accent-accent-primary" checked={!hidden.has(s.id)} onChange={() => setHidden(h => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
      {kind === 'bar'
        // eslint-disable-next-line shadcn/no-inline-styles -- swatch color is the series token resolved at runtime
        ? <span aria-hidden className="inline-block size-3 border-2" style={{ backgroundColor: token(s.color), borderColor: stroke }} />
        : <svg aria-hidden width="32" height="14"><line x1="0" y1="7" x2="32" y2="7" stroke={stroke} strokeWidth="2" strokeDasharray={svgDasharray(linePattern(s, previous))} /></svg>}
      {s.name}
    </label>;
  }

  function renderPeriodLegendGroup(id: string, title: string, series: ChartSeries[], previous: boolean) {
    if (!usePeriodLegendGrid) return <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <strong id={id} className="min-w-20 text-xs font-medium text-text-secondary">{title}</strong>
      {series.map(s => renderLegendSeries(s, previous))}
    </div>;

    return <div role="group" aria-labelledby={id} className="col-span-full grid grid-cols-subgrid items-center gap-x-4">
      <strong id={id} className="col-start-1 min-w-20 text-xs font-medium text-text-secondary">{title}</strong>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- legend column is the per-series index computed at runtime */}
      {series.map((s, index) => <div key={s.id} data-legend-series-id={s.id} style={{ gridColumn: index + 2 }}>{renderLegendSeries(s, previous)}</div>)}
    </div>;
  }

  function exportCsv() {
    const header = ['x', ...visible.map(s => s.name)];
    // The table projection verbatim: numbers stay numbers so the formula guard never prefixes them (#297).
    const body = rows.map(([x, values]) => [x, ...values.map(v => (v === null ? '' : v))]);
    const meta = `# ${String(typeof p.title === 'string' ? p.title : p.chartId)} · scopeId=${global.scopeId ?? ''} · from=${global.from ?? ''} · to=${global.to ?? ''}${p.metricVersion ? ` · metricVersion=${p.metricVersion}` : ''}`;
    const blob = new Blob([toCsvDocument(meta, header, body)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${p.chartId}.csv`; a.click(); URL.revokeObjectURL(a.href);
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

  // min-w-0: the plot canvas owns a fixed px width; without it that width becomes the card's min-content and a
  // grid cell can never shrink the card (the ResizeObserver then never sees a smaller width on column switch).
  return <section role="region" aria-labelledby={titleId} data-analysis-chart={analysisSection ? '' : undefined} className="relative flex min-w-0 flex-col rounded-lg border border-border-subtle bg-surface-card">
    {/* Pinned to the card corner so a wrapping toolbar never strands it on its own line. */}
    <AnalysisChartPart enabled={analysisSection !== null}>
    <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', analysisSection && 'pr-12')}>
      <div className="min-w-0">
        <h2 id={titleId} className="t-card-title">{p.title}</h2>
        {(p.description || p.metricVersion) && <p className="text-xs text-text-muted">{p.description}{p.metricVersion && <> · <span className="tabular">{t('metricVersion')} {formatMetricVersion(p.metricVersion)}</span></>}</p>}
      </div>
      {/* Line-based wrapping (#297 FIX1, supersedes the A-07 single bundle): bundles collapse as whole lines, so a
        narrow card drops them below the title and the Export/More tail is never stranded alone; wide cards still
        get one right-aligned row. extraActions keeps its own bundle. */}
      <div role="toolbar" aria-label={lang === 'ko' ? '차트 동작' : 'Chart actions'} className="ml-auto flex flex-wrap items-center justify-end gap-1">
        {p.extraActions != null && <div className="flex items-center gap-1">{p.extraActions}</div>}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="toolbar" onClick={() => setZoom(([a, b]) => { const q = (b - a) / 4; return [a + q, b - q]; })} title={lang === 'ko' ? '확대 (Shift+휠도 가능)' : 'Zoom in (Shift+wheel)'}><ZoomIn className="size-3.5" aria-hidden />{lang === 'ko' ? '확대' : 'Zoom'}</Button>
          <Button ref={brushToggle} variant={brushMode ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={brushMode} onClick={() => setBrushMode(b => !b)}><BrushIcon className="size-3.5" aria-hidden />{lang === 'ko' ? '구간 선택' : 'Brush'}</Button>
          {/* THROWAWAY #303/#307 — never merge. */}
          {prototypeBrushActive && brushVariant === 'A' && xType === 'time' && <div role="group" aria-label={lang === 'ko' ? '빠른 구간 선택' : 'Quick range selection'} className="flex items-center gap-0.5">
            <Button variant="ghost" size="toolbar" title={lang === 'ko' ? '마지막 1시간' : 'Last 1 hour'} onClick={() => setRangePreset(1)}>{lang === 'ko' ? '1시간' : '1h'}</Button>
            <Button variant="ghost" size="toolbar" title={lang === 'ko' ? '마지막 4시간' : 'Last 4 hours'} onClick={() => setRangePreset(4)}>{lang === 'ko' ? '4시간' : '4h'}</Button>
            <Button variant="ghost" size="toolbar" onClick={() => setRangePreset(null)}>{lang === 'ko' ? '전체' : 'All'}</Button>
          </div>}
          <Button variant="ghost" size="toolbar" onClick={resetLocal}><RotateCcw className="size-3.5" aria-hidden />{lang === 'ko' ? '초기화' : 'Reset'}</Button>
          {canCompare && <Button variant={compare ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={compare} onClick={toggleCompare}><GitCompare className="size-3.5" aria-hidden />{lang === 'ko' ? '비교' : 'Compare'}</Button>}
          {canAnnotate && <Button variant="ghost" size="toolbar" disabled={!selection || scopeId === null} title={scopeId === null ? (lang === 'ko' ? '주석은 사이트(Scope)를 선택한 뒤 남길 수 있습니다' : 'Pick a site (Scope) to annotate') : selection ? undefined : (lang === 'ko' ? '구간 선택으로 구간을 먼저 선택하세요' : 'Brush a range first')} onClick={openNote}><MessageSquarePlus className="size-3.5" aria-hidden />{lang === 'ko' ? '주석' : 'Annotate'}</Button>}
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
    {/* THROWAWAY #303/#307 — never merge. */}
    <div data-prototype-chart-plot={brushVariant === 'B' ? '' : undefined} role={brushVariant === 'B' ? 'group' : undefined} tabIndex={brushVariant === 'B' ? 0 : undefined}
      aria-label={brushVariant === 'B' ? (lang === 'ko' ? '키보드 구간 선택 차트' : 'Keyboard range selection chart') : undefined}
      aria-describedby={brushVariant === 'B' ? cursorTextId : undefined} onKeyDown={brushVariant === 'B' ? onChartKeyDown : undefined}
      className={cn('px-2', brushVariant === 'B' && 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring')}>
      <EChart option={option} height={p.height ?? 260} onEvents={onEvents} onReady={c => { chart.current = c; setInstanceReady(v => v + 1); }}
        ariaLabel={`${typeof p.title === 'string' ? p.title : p.chartId}: ${visible.map(s => s.name).join(', ')}`} />
    </div>
    {brushVariant === 'B' && <p id={cursorTextId} aria-live="polite" className="px-4 text-tiny text-text-secondary">
      {lang === 'ko' ? '현재 버킷' : 'Current bucket'}: {cursorValue ? (xType === 'time' ? fmt(cursorValue) : cursorValue) : (lang === 'ko' ? '데이터 없음' : 'No data')} · {lang === 'ko' ? '←/→ 이동, Shift+←/→ 선택 확장, Esc 선택 해제' : '←/→ move, Shift+←/→ extend selection, Esc clear'}
    </p>}
    {/* THROWAWAY #303/#307 — never merge. */}
    {prototypeBrushActive && brushVariant === 'C' && xType === 'time' && timeBoundaries.length >= 2 && <div role="group" aria-label={lang === 'ko' ? '선택 구간 범위 슬라이더' : 'Selection range slider'} className="mx-4 mb-2">
      <div className="mb-1 flex flex-wrap justify-between gap-x-4 text-tiny text-text-secondary">
        <span>{lang === 'ko' ? '시작' : 'Start'}: {fmt(timeBoundaries[sliderStartIndex])}</span>
        <span>{lang === 'ko' ? '끝' : 'End'}: {fmt(timeBoundaries[sliderEndIndex])}</span>
      </div>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-subtle" />
        {selection && <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-primary" style={{ left: `${sliderStartIndex / (timeBoundaries.length - 1) * 100}%`, right: `${100 - sliderEndIndex / (timeBoundaries.length - 1) * 100}%` }} />}
        <input type="range" aria-label={lang === 'ko' ? '구간 시작' : 'Range start'} aria-valuetext={fmt(timeBoundaries[sliderStartIndex])}
          min={0} max={Math.max(0, sliderEndIndex - 1)} step={1} value={sliderStartIndex} onChange={event => commitSliderIndex('start', Number(event.target.value))} onKeyDown={event => onSliderKeyDown(event, 'start')}
          className="pointer-events-none absolute inset-0 z-20 h-8 w-full appearance-none bg-transparent accent-accent-primary [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-primary [&::-webkit-slider-thumb]:bg-surface-card [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent-primary [&::-moz-range-thumb]:bg-surface-card" />
        <input type="range" aria-label={lang === 'ko' ? '구간 끝' : 'Range end'} aria-valuetext={fmt(timeBoundaries[sliderEndIndex])}
          min={Math.min(timeBoundaries.length - 1, sliderStartIndex + 1)} max={timeBoundaries.length - 1} step={1} value={sliderEndIndex} onChange={event => commitSliderIndex('end', Number(event.target.value))} onKeyDown={event => onSliderKeyDown(event, 'end')}
          className="pointer-events-none absolute inset-0 z-10 h-8 w-full appearance-none bg-transparent accent-accent-primary [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent-primary [&::-webkit-slider-thumb]:bg-surface-card [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent-primary [&::-moz-range-thumb]:bg-surface-card" />
      </div>
    </div>}

    {showTable && <div className="mx-4 mb-2 max-h-56 overflow-auto rounded-md border border-border-subtle">
      <table aria-labelledby={titleId} className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-surface-sunken"><tr><th className="t-table-header px-3 py-1.5 text-left text-text-secondary">{lang === 'ko' ? (xType === 'time' ? '시각' : '구간') : (xType === 'time' ? 'Time' : 'Category')}</th>{visible.map(s => <th key={s.id} className="t-table-header px-3 py-1.5 text-right text-text-secondary">{s.name}</th>)}</tr></thead>
        <tbody>{rows.map(([x, values]) => <tr key={x} className="border-t border-border-subtle">
          <td className="px-3 py-1">{xType === 'time' ? fmt(x) : x}</td>
          {values.map((v, i) => <td key={visible[i].id} className="px-3 py-1 text-right">{v === null ? '—' : format(v)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}

    {/* THROWAWAY #303/#307 — never merge. */}
    <section aria-label={lang === 'ko' ? '선택 요약' : 'Selection summary'} aria-live="polite" className="mx-4 mb-3 min-h-9 rounded-md bg-surface-sunken px-3 py-2 text-xs">
      {prototypeBrushActive && brushVariant === 'A' && xType === 'time' && rangeInputValue && <div role="group" aria-label={lang === 'ko' ? '시작과 끝으로 구간 선택' : 'Select a range by start and end'} className="mb-2 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-tiny text-text-secondary">
          <span>{lang === 'ko' ? '시작' : 'Start'}</span>
          <Select value={rangeInputValue.from} onValueChange={value => {
            const nextEnd = rangeInputValue.to > value ? rangeInputValue.to : timeBoundaries.find(boundary => boundary > value) ?? value;
            setRangeDraft({ from: value, to: nextEnd });
          }}>
            <SelectTrigger aria-label={lang === 'ko' ? '구간 시작 버킷' : 'Range start bucket'} className="h-7 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{timeBoundaries.slice(0, -1).map(value => <SelectItem key={value} value={value}>{fmt(value)}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-tiny text-text-secondary">
          <span>{lang === 'ko' ? '끝' : 'End'}</span>
          <Select value={rangeInputValue.to} onValueChange={value => setRangeDraft({ from: rangeInputValue.from, to: value })}>
            <SelectTrigger aria-label={lang === 'ko' ? '구간 끝 버킷' : 'Range end bucket'} className="h-7 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{rangeEndOptions.map(value => <SelectItem key={value} value={value}>{fmt(value)}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <Button size="toolbar" disabled={rangeInputValue.from >= rangeInputValue.to} onClick={() => commitSelection(rangeInputValue)}>{lang === 'ko' ? '선택' : 'Select'}</Button>
      </div>}
      {selectionClipped && <p role="status" className="mb-2 text-tiny text-text-secondary">{lang === 'ko' ? '비교 기간 쪽으로 걸친 구간을 현재 기간 x범위로 잘랐습니다.' : 'The range was clipped to the current period x-range.'}</p>}
      {!selection ? <span className="text-text-secondary">{prototypeBrushActive && brushVariant === 'A' && xType === 'time'
        ? (lang === 'ko' ? '시작·끝을 고른 뒤 선택을 누르면 요약이 만들어집니다. 전역 기간은 적용 확인 뒤에만 바뀝니다.' : 'Choose start and end, then Select to create the summary. The global period changes only after confirmation.')
        : (lang === 'ko' ? '선택 구간 없음 — 구간 선택으로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — brush a range to summarize, annotate or apply it.')}</span>
        : <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold tabular">{t('selectedRange')}: {xType === 'time' ? `${fmt(selection.from)} – ${fmt(selection.to)}` : `${selection.from} – ${selection.to}`}</span>
          {selectionCounts.map(c => <span key={c.s.id} className="tabular text-text-secondary">{c.s.name}: n={c.n}{c.avg !== null && ` · avg ${format(c.avg)} · max ${format(c.max!)}`} {p.unit}</span>)}
          <span className="ml-auto flex flex-wrap gap-2">
            {p.selectionActions?.(selection)}
            {xType === 'time' && p.canApplyRange !== false && <Button ref={applyRangeButton} size="toolbar" onClick={() => setPreview(selection)}>{lang === 'ko' ? '분석 구간 적용…' : 'Apply analysis range…'}</Button>}
            <Button size="toolbar" variant="ghost" onClick={() => commitSelection(null)}>{t('clear')}</Button>
          </span>
        </div>}
      {preview && <div role="group" aria-label={lang === 'ko' ? '구간 적용 확인' : 'Confirm range'} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent-primary bg-surface-card p-2">
        <span className="tabular">{lang === 'ko' ? '전역 기간을 다음으로 변경합니다 (초 정렬, [from, to)):' : 'Change the global period to (second-aligned, [from, to)):'} <b>{preview.from.replace('T', ' ')} → {preview.to.replace('T', ' ')}</b></span>
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
      {annotationsForDisplay.length > 0 && <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-1.5 text-tiny text-text-secondary">
        {annotationsForDisplay.map(a => <li key={a.id} className="tabular"><span className="mr-1 inline-block size-2 rounded-xs bg-chart-purple/60 align-middle" aria-hidden />{xType === 'time' ? `${fmt(a.from)}–${fmt(a.to)}` : `${a.from}–${a.to}`}: {a.text}</li>)}
      </ul>}
    </section>

    {p.trust && <footer className="border-t border-border-subtle px-4 py-2 text-tiny text-text-muted tabular">
      {t('source')}: <span className="t-mono text-tiny">{p.trust.source}</span> · {t('updated')}: {p.trust.updated} · {t('coverage')}: {p.trust.coverage}
    </footer>}
    </AnalysisChartPart>
  </section>;
}
