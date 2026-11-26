import { useDockChartHead } from '../dock/DockChartHead';
import { ChartGestureHint, ChartInteractionToolbar } from './ChartInteractionToolbar';
import { chartToolVariant, type ChartChromeOptions } from './chartChrome';
import type { ChartBounds, ChartBoundLabels } from './chartBounds';
import { BrushIcon, ChevronDown, ChevronUp, RotateCcw, Play, ExternalLink } from 'lucide-react';
import type { ChartTrust } from '../state/trustFormat';
import { percent, unknownLabel, brushOptions, followedChartKey, isBrushableKind, isSingleSelectKind, warnMissingChartUnit } from './analysisChartShared';
import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useI18n, useMessages, usePlatformOptional } from '@ap/kernel';
import { Button, Checkbox, cn, type Tone } from '@ap/ui';
import type { Reaggregation, Text } from '@ap/contracts';
import { COMPONENTS_MESSAGES } from '../messages';
import { useThemeRevision, type ThemeColorToken } from '@ap/ui/theme';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { chartTheme, EChart, token } from './EChart';
import { downloadChartCsv } from './analysisChartCsv';
import { ChartImageCopyButton, ChartImagePrintButton, ImageActionStatus, useImageActionGate, type ChartExportActionsPolicy } from './ChartImageCopyButton';
import { echartImageBlob } from './chartImageCopy';
import { safeFileName } from '../table/download';
import { chartData, chartColors as colors, cellKey as keyOf, chartDiagnostic as diagnostic } from './analysisChartData';
import { KindLegend } from './analysisChartKinds';
import { heatmapMinCanvasHeight, heatmapSymbolSize } from './analysisChartGeometry';
import { CHART_HEIGHTS, selectionRing } from './chartMarks';
import { categoryOtherBlocked, categoryOtherWarning, validCategoryTopN, type CategoryTopN } from './categoryTopN';
import { AnalysisSectionContext, resolveAnalysisChartSize, analysisChartHeight, fillChartHeight, FILL_CARD_CLASS, FILL_PLOT_CLASS, type ChartSize } from '../archetypes/AnalysisSectionContext';
import { useElementSize } from '../state/useElementSize';
import { ChartStatusLegend } from './ChartStatusLegend';
import { distinctStatuses, heatmapStatusOutlines, statusMarker, statusText, type ChartStatus } from './chartStatus';
import { AnalysisChartPart, ChartHeading, ChartTrustFooter, ChartLegendLabel, ChartLegendLayout } from './analysisChartFrameParts';
import { useEmbeddedChrome, useInWorkspacePanel } from '../workspace/panelContext';
import type { ChartRowGroups } from './chartRowGroups';
import { HEATMAP_CATEGORY_TOKENS, UNKNOWN_HEATMAP_CATEGORY_TOKENS } from './heatmapCategories';
import { referenceMarkOptions, type ChartReferenceOptions } from './referenceMarks';
import { releaseFocusLater } from '../state/releaseFocusLater';

export type HeatmapCell = { x: string; y: string; value: number | null; status?: ChartStatus; category?: string };
export type HeatmapCategory = { id: string; label: Text; tone: Tone };
export type HeatmapSpec = ChartReferenceOptions & {
  kind: 'heatmap';
  /** Explicit axis order. Missing coordinates remain empty; null is an unknown cell. */
  xLabels: string[]; yLabels: string[]; cells: HeatmapCell[];
  /** Label for explicit null values. Defaults to the localized unknown value label. */
  nullLabel?: string;
  /** Controlled plot outline and fallback action cell by axis label. Null clears it; `label` can replace the default summary label. */
  selectedCell?: { x: string; y: string; label?: string } | null;
  /** Opt-in categorical fill and legend; missing/unknown category ids use the unknown fill and label. */
  categories?: readonly HeatmapCategory[];
  /** Positive row floor in px; fill plots scroll vertically, other sizes grow. Shows every y label. */
  minRowHeight?: number;
  /** Keep status outlines and accessible text; omit repeated cell glyphs. Default: marker. */
  statusDisplay?: 'marker' | 'border';
  /** Thresholds are only for approved real judgements, not inferred status. */
  scale?: { type: 'sequential'; domain?: [number, number] }
    | { type: 'diverging'; pivot: number; pivotLabel?: string; domain?: [number, number]; lowerIsBetter?: boolean }
    | { type: 'threshold'; breaks: [number, number]; labels: [string, string, string] };
  valueFormat?: (v: number) => string;
  /** Explicit drill from Details only; canvas clicks select. */
  onCellClick?: (x: string, y: string) => void;
  /** Opt-in canvas gesture; the keyboard selection action invokes the same callback. */
  cellActivation?: { on: 'click' | 'dblclick'; onActivate: (x: string, y: string) => void };
};
export type DonutSlice = { id: string; label: string; value: number; color?: ThemeColorToken };
export type DonutSpec = {
  kind: 'donut'; slices: DonutSlice[];
  categoryTopN?: CategoryTopN;
  /** Set to 'sum' to allow categoryTopN to group omitted values. */
  reaggregation?: Reaggregation;
  /** Known denominator; excess is Unclassified. A denominator below the sum falls back to the sum. */
  total?: number;
  /** Defaults to 5, clamps to 2..5 including Other; Unclassified is always separate. */
  maxSlices?: number;
  centerLabel?: string;
  valueFormat?: (v: number) => string;
  /** Explicit drill from Details only; canvas clicks select. */
  onSliceClick?: (id: string) => void;
  /** Follows this slice until a local click or Reset; a changed value resumes following, as for TopNBarSpec. */
  selectedId?: string | null;
  /** Selection only, separate from Details. Clearing or selecting a synthetic aggregate reports null. */
  onSelectedChange?: (id: string | null) => void;
};
export type ScatterPoint = {
  id: string; x: number | null; y: number | null; group?: string; label?: string;
  /** Category mode only: a cell in xCategories.order; x is ignored. */
  category?: string;
  /** Consumer-given judgement, never inferred by the SDK. */
  status?: ChartStatus;
};
export type ScatterSpec = ChartReferenceOptions & {
  kind: 'scatter'; points: ScatterPoint[]; xUnit: string; xLabel: string; yLabel: string;
  selectedId?: string | null;
  /** Opt-in calmer dense scatter; table, CSV and summary remain unchanged. */
  density?: 'default' | 'quiet';
  groups?: { id: string; label: string; color?: ThemeColorToken }[];
  referenceLines?: { axis: 'x' | 'y'; value: number; label: string }[];
  onPointClick?: (id: string) => void;
  xCategories?: {
    /** Left-to-right cells; points outside this order are diagnosed and dropped. */
    order: readonly string[];
    /** Consecutive group spans and short cell labels, also used in table/CSV/summary. */
    groups?: ChartRowGroups;
    /** Stable id-hash spread as a fraction of cell width; clamped to [0, 0.9], default 0.6. */
    jitter?: number;
    bounds?: ChartBounds;
    /** Defaults: Upper bound / Lower bound / Bound range (localized). */
    boundLabels?: ChartBoundLabels;
  };
};
export type BoxStats = {
  /** Caller-owned whisker endpoints: extrema for minMax, outermost inliers within Tukey fences for tukey. */
  min: number; q1: number; median: number; q3: number; max: number; outliers?: number[]; n?: number;
};
export type BoxPlotSpec = ChartReferenceOptions & {
  kind: 'boxPlot'; groups: { id: string; label: string; stats: BoxStats | null }[];
  selectedId?: string | null;
  /** Changes the description and validates endpoints; never infers observations or quartiles. */
  whisker: 'minMax' | 'tukey'; referenceLines?: { value: number; label: string }[];
  onGroupClick?: (id: string) => void;
};
export type ParetoSpec = ChartReferenceOptions & {
  kind: 'pareto'; items: { id: string; label: string; value: number }[];
  categoryTopN?: CategoryTopN;
  /** Set to 'sum' to allow categoryTopN to group omitted values. */
  reaggregation?: Reaggregation;
  selectedId?: string | null;
  /** Finite fraction in (0,1], default 0.8. */
  cumulativeTarget?: number;
  /** Total displayed cap including Other; floors and clamps to at least 2, default 10. */
  maxItems?: number; onItemClick?: (id: string) => void;
};
export type TopNBarItem = { id: string; label: string; value: number; colorToken: ThemeColorToken };
export type TopNBarSpec = ChartReferenceOptions & {
  kind: 'topNBar'; items: TopNBarItem[];
  categoryTopN?: CategoryTopN;
  /** Set to 'sum' to allow categoryTopN to group omitted values. */
  reaggregation?: Reaggregation;
  legend?: { label: string; colorToken: ThemeColorToken }[];
  topN?: number; expanded?: boolean; defaultExpanded?: boolean;
  onExpandedChange?: (next: boolean) => void; hideWhenEmpty?: boolean;
  onItemClick?: (id: string) => void;
  /**
   * The item the page currently shows (for example the one an address names). Present → the chart follows it: its bar is the selection
   * whenever it is drawn (also when rows arrive or N grows later); while it is not drawn but is a valid input item, the selection summary
   * names it as outside the drawn top N. A click, Reset or brush makes the selection local until this value or the global Context
   * changes, which returns to following. `null` follows nothing (no selection). Absent → selection is local only, as before.
   */
  selectedId?: string | null;
};
export type HistogramBin = { start: number; end: number; count: number };
export type HistogramSpec = ChartReferenceOptions & {
  kind: 'histogram'; xUnit: string; xLabel: string;
  selectedBin?: { start: number; end: number } | null;
  referenceLines?: { id: string; value: number; label: string; tone?: ChartStatus['tone'] }[];
  /** Consumer judgement only; never inferred from reference lines. */
  binStatus?: (bin: HistogramBin) => ChartStatus | undefined;
} & (
  { bins: HistogramBin[]; values?: never; binning?: never }
  | { bins?: never; values: number[]; binning?: { width?: number; count?: number; domain?: [number, number] } }
);
export type ChartSpec = HeatmapSpec | DonutSpec | ScatterSpec | BoxPlotSpec | ParetoSpec | TopNBarSpec | HistogramSpec;
export type AnalysisChartProps = ChartChromeOptions & {
  chartId: string; title: ReactNode; description?: ReactNode; metricVersion?: string; unit: string;
  /** Trust footer: the response `Trust` (formatted by the SDK, viewer time zone), `null` (no footer), or an already formatted `{ source, updated, coverage }` text triple (shown as given). */
  trust?: ChartTrust; height?: number; size?: ChartSize; emptyText?: string; spec: ChartSpec;
  /** Adds a `이미지 복사` button (PNG to the clipboard, or a download when the clipboard is unavailable), shown only when the current menu manifest enables `features.export`. */
  imageCopy?: boolean;
  /** Adds a `인쇄` button: the same image as `imageCopy`, printed under the chart's title. Shown only when the current menu manifest enables `features.export`. */
  imagePrint?: boolean;
  /**
   * Outside a platform only (#1953 B): the chart renders with `I18nProvider` alone, and this opens its `내보내기` (CSV), `imageCopy` and `imagePrint`
   * buttons (default off, `exportAllowed: true` opens them) and says where their result text goes (`notify`, default a status line beside the button).
   * Inside a `PlatformProvider` it is ignored and the menu's `features.export` decides; it never widens a menu's permission.
   */
  exportActions?: ChartExportActionsPolicy;
};

const sequential = [colors.seq0, colors.seq1, colors.seq2, colors.seq3, colors.seq4];
const diverging = [colors.div0, colors.div1, colors.div2, colors.div3, colors.div4];
/** Kind-specific charts keep selection local; activation and Details are explicit consumer callbacks. */
export function AnalysisChart(p: AnalysisChartProps) {
  const { t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const platform = usePlatformOptional();
  const global = platform?.global ?? null;
  const exportGate = useImageActionGate(p.exportActions);
  const section = useContext(AnalysisSectionContext);
  // Inside a panel or a board pane the container owns the border and radius, as for AnalysisChartFrame and the table (#1166).
  const embedded = useEmbeddedChrome();
  const panel = useInWorkspacePanel();
  const chrome = p.chrome ?? (panel ? 'standard' : 'full');
  const compactChrome = chrome !== 'full';
  const size = resolveAnalysisChartSize(p.size, section);
  const compact = size === 'compact';
  const bodyId = useId();
  const collapseButton = useRef<HTMLButtonElement>(null);
  const [localExpanded, setLocalExpanded] = useState(p.spec.kind === 'topNBar' ? p.spec.defaultExpanded ?? false : false);
  const expanded = p.spec.kind !== 'topNBar' || (p.spec.expanded ?? localExpanded);
  if (p.spec.kind === 'topNBar' && p.spec.expanded !== undefined && localExpanded !== p.spec.expanded) setLocalExpanded(p.spec.expanded);
  const collapsibleBody = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded && collapsibleBody.current?.contains(document.activeElement)) collapseButton.current?.focus();
  }, [expanded]);
  const titleId = useId(); const summaryId = useId();
  const [table, setTable] = useState(false);
  const [panelToolsOpen, setPanelToolsOpen] = useState(false);
  const chart = useRef<ECharts | null>(null);
  const spec = p.spec;
  // `selected === null` follows the page's current item whenever it is drawn. A click, Reset or Brush makes the selection
  // local until the followed key or Context changes.
  const followedKey = followedChartKey(spec);
  const selectionEnabled = spec.kind !== 'histogram' || followedKey !== undefined;
  const unfollowed: string[] | null = followedKey === undefined ? [] : null;
  const [selected, setSelected] = useState<string[] | null>(unfollowed);
  const [selectionFromTable, setSelectionFromTable] = useState(false);
  const [previousFollowed, setPreviousFollowed] = useState(followedKey);
  const brushedKeys = useRef<string[]>([]);
  const [brushMode, setBrushMode] = useState(false);
  const [instanceReady, setInstanceReady] = useState(0);
  // Colours are resolved while building the option: a root `data-theme` change rebuilds it (#2723).
  const themeRevision = useThemeRevision();
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const controlledCell = spec.kind === 'heatmap' ? spec.selectedCell : undefined;
  const controlledCellSupplied = controlledCell !== undefined;
  const canPreferTableSelection = spec.kind === 'heatmap' && controlledCellSupplied && !!spec.cellActivation;
  const controlledKey = controlledCell ? keyOf(controlledCell.x, controlledCell.y) : null;
  const topN = spec.kind === 'topNBar';
  useEffect(() => {
    if (topN && !p.unit.trim()) warnMissingChartUnit(p.chartId);
  }, [p.chartId, p.unit, topN]);
  const blockedOther = 'categoryTopN' in spec && categoryOtherBlocked(spec.categoryTopN, spec.reaggregation);
  const warnedOther = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && blockedOther && !warnedOther.current) {
      console.warn(`AnalysisChart: ${categoryOtherWarning}`);
    }
    warnedOther.current = blockedOther;
  }, [blockedOther]);
  const brushable = isBrushableKind(spec.kind);
  const singleSelect = isSingleSelectKind(spec.kind);
  const { cells, rows, total, extended } = useMemo(() => chartData(spec, lang, p.unit), [spec, lang, p.unit]);
  const empty = extended ? extended.empty : spec.kind === 'heatmap' ? !cells.length : total === 0;
  const statusLegend = useMemo(() => distinctStatuses(cells.map(c => c.status)), [cells]);
  const hasStatuses = statusLegend.length > 0;
  // `fill`: the plot box takes the height its container leaves; a top-N bar keeps its row-count height only until that is measured.
  const fill = useElementSize(size === 'fill');
  const fittedDonut = spec.kind === 'donut' && size === 'fill' && chrome === 'standard';
  const donutMinimumHeight = 112;
  const measuredFillHeight = chrome === 'standard' ? Math.max(0, fill.height ?? 0) : fillChartHeight(fill.height);
  const height = p.height ?? (size === 'fill' && fill.height !== null ? measuredFillHeight : spec.kind === 'topNBar' ? Math.max(120, rows.length * CHART_HEIGHTS.rowPitch + 24) : analysisChartHeight(size, CHART_HEIGHTS.regular));
  const rowFloor = spec.kind === 'heatmap' && Number.isFinite(spec.minRowHeight) && spec.minRowHeight! > 0 ? spec.minRowHeight : undefined;
  let canvasHeight = height;
  if (rowFloor && spec.kind === 'heatmap') canvasHeight = Math.max(height, heatmapMinCanvasHeight(spec.yLabels.length, rowFloor));
  if (fittedDonut) canvasHeight = Math.max(donutMinimumHeight, height);
  const keys = useMemo(() => rows.flatMap(row => row.groupLabel === undefined ? [row.key] : []), [rows]);
  // Selection lookups by set: a point count times a selection count of `includes` compares otherwise (#2812).
  const keySet = useMemo(() => new Set(keys), [keys]);
  const contextKey = JSON.stringify([platform?.user?.id, platform?.revision, global]);
  const [previousContext, setPreviousContext] = useState(contextKey);
  const following = selected === null;
  const followingEmptyChart = following && empty;
  // The selection summary unmounts when a followed chart empties; if it held focus, hand it to the table toggle (or the chart).
  const chartRoot = useRef<HTMLElement>(null);
  const tableToggle = useRef<HTMLButtonElement>(null);
  const summaryHadFocus = useRef(false);
  useLayoutEffect(() => {
    if (!followingEmptyChart || !summaryHadFocus.current) return;
    summaryHadFocus.current = false;
    if (document.activeElement !== document.body) return;
    const root = chartRoot.current;
    const toggle = tableToggle.current;
    if (toggle?.isConnected && !toggle.disabled) toggle.focus();
    else if (root) { root.tabIndex = -1; root.focus(); }
  }, [followingEmptyChart]);
  const active = useMemo(() => {
    if (previousContext !== contextKey) return [];
    if (selected !== null) return selected.filter(key => keySet.has(key));
    if (followedKey == null || empty) return [];
    const drawn = extended ? extended.seriesKeys.some(keys => keys.includes(followedKey)) : keySet.has(followedKey);
    return drawn ? [followedKey] : [];
  }, [previousContext, contextKey, selected, followedKey, keySet, extended, empty]);
  const activeSet = useMemo(() => new Set(active), [active]);
  if (previousContext !== contextKey) {
    setPreviousContext(contextKey);
    setSelected(unfollowed);
    setSelectionFromTable(false);
  }
  else if (previousFollowed !== followedKey) setSelected(unfollowed);
  else if (selected !== null && active.length !== selected.length) setSelected(active);
  if (previousFollowed !== followedKey) setPreviousFollowed(followedKey);
  useEffect(() => { brushedKeys.current = []; if (brushable) clearBrush(chart.current); }, [contextKey, brushable]);
  useEffect(() => { brushedKeys.current = []; setBrushMode(false); }, [spec.kind]);
  const reset = () => {
    brushedKeys.current = [];
    setSelected([]);
    setSelectionFromTable(false);
    if (brushable) clearBrush(chart.current);
    if (spec.kind === 'donut') spec.onSelectedChange?.(null);
  };
  const toggle = (key: string, source: 'plot' | 'table') => {
    if (spec.kind === 'heatmap') setSelectionFromTable(source === 'table' && canPreferTableSelection);
    if (spec.kind === 'donut') {
      const next = activeSet.has(key) ? [] : [key];
      setSelected(next);
      spec.onSelectedChange?.(next.length ? spec.slices.find(slice => JSON.stringify(['slice', slice.id]) === key)?.id ?? null : null);
      return;
    }
    setSelected(previous => {
      const old = previous ?? active;
      return old.includes(key) ? old.filter(k => k !== key) : singleSelect ? [key] : [...old, key];
    });
  };
  const format = useCallback((v: number) => ('valueFormat' in spec ? spec.valueFormat?.(v) : undefined) ?? String(v), [spec]);
  const unknown = (spec.kind === 'heatmap' ? spec.nullLabel : undefined) ?? unknownLabel(lang);
  const valueText = useCallback((v: number | null) => v === null ? unknown : `${format(v)} ${p.unit}`, [unknown, format, p.unit]);
  const { option, scale, domain, ramp, validThreshold } = useMemo(() => {
    void themeRevision;
    const theme = chartTheme();
    const values = cells.flatMap(c => c.value === null ? [] : [c.value]);
    const scale = spec.kind === 'heatmap' && spec.categories === undefined ? spec.scale : undefined;
    let domain: [number, number] = scale && 'domain' in scale && scale.domain ? scale.domain : [values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 0];
    let ramp: ThemeColorToken[] = sequential;
    if (scale?.type === 'diverging') {
      const half = Math.max(Math.abs(domain[0] - scale.pivot), Math.abs(domain[1] - scale.pivot));
      domain = [scale.pivot - half, scale.pivot + half];
      ramp = scale.lowerIsBetter === false ? [...diverging].reverse() : diverging;
    }
    const validThreshold = scale?.type !== 'threshold' || scale.breaks[0] < scale.breaks[1];
    if (!validThreshold) diagnostic('threshold breaks must be increasing; using sequential scale');
    // One computed-style read per token for this option, not two per cell; index and selection lookups by map and set (#822).
    const read = new Map<ThemeColorToken, string>();
    const tone = (name: ThemeColorToken) => { let value = read.get(name); if (value === undefined) { value = token(name); read.set(name, value); } return value; };
    const xIndex = new Map(spec.kind === 'heatmap' ? spec.xLabels.map((label, index) => [label, index] as const) : []);
    const yIndex = new Map(spec.kind === 'heatmap' ? spec.yLabels.map((label, index) => [label, index] as const) : []);
    const borderOnly = spec.kind === 'heatmap' && spec.statusDisplay === 'border';
    const categories = spec.kind === 'heatmap' && spec.categories !== undefined ? new Map(spec.categories.map(category => [category.id, category])) : undefined;
    const categoryTokens = (cell: HeatmapCell) => {
      const category = cell.category === undefined ? undefined : categories?.get(cell.category);
      return category ? HEATMAP_CATEGORY_TOKENS[category.tone] : UNKNOWN_HEATMAP_CATEGORY_TOKENS;
    };
    function cellColor(value: number | null) {
      if (value === null) return tone(colors.unknown);
      if (scale?.type === 'threshold' && validThreshold) return tone(value < scale.breaks[0] ? colors.good : value < scale.breaks[1] ? colors.warn : colors.critical);
      const fraction = domain[1] === domain[0] ? 0.5 : (value - domain[0]) / (domain[1] - domain[0]);
      return tone(ramp[Math.max(0, Math.min(4, Math.round(fraction * 4)))]);
    }
    const fillColor = (cell: HeatmapCell) => categories ? tone(categoryTokens(cell).fill) : cellColor(cell.value);
    const cellLabel = (cell: HeatmapCell) => {
      const marker = cell.status && !borderOnly ? statusMarker(cell.status) : undefined;
      if (!categories) return marker;
      return { ...marker, show: true, color: tone(categoryTokens(cell).text), formatter: `${valueText(cell.value)}${marker ? `\n${marker.formatter}` : ''}` };
    };
    const cellStyle = (cell: HeatmapCell) => {
      const key = keyOf(cell.x, cell.y);
      const controlled = key === controlledKey;
      const outlined = controlledCell === undefined ? activeSet.has(key) : controlled;
      const hasInsetStatus = cell.status && !controlled;
      return {
        color: fillColor(cell), ...(categories ? { opacity: 1 } : {}),
        borderColor: tone(outlined ? colors.selection : colors.pattern),
        borderWidth: hasInsetStatus ? 0 : outlined ? selectionRing(true) : cell.value === null ? 1 : 0,
        borderType: cell.value === null && !controlled ? 'dashed' : 'solid',
        ...(hasInsetStatus && outlined ? { shadowBlur: 6, shadowColor: tone(colors.selection) } : {}),
      };
    };
    const option: EChartsCoreOption = extended ? extended.option(active) : spec.kind === 'heatmap' ? {
      tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (params: { dataIndex: number }) => { const c = cells[params.dataIndex]; return c ? `${c.x} · ${c.y}: ${valueText(c.value)}${categories ? ` · ${rows[params.dataIndex].categoryLabel}` : ''}${c.status ? ` · ${statusText(c.status)}` : ''}` : ''; } },
      grid: { top: 16, bottom: 16, left: 16, right: 16, containLabel: true },
      xAxis: { type: 'category', data: spec.xLabels, axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, interval: 'auto', hideOverlap: true }, splitLine: theme.splitLine },
      yAxis: { type: 'category', data: spec.yLabels, axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, interval: rowFloor ? 0 : 'auto', hideOverlap: !rowFloor }, splitLine: theme.splitLine },
      ...brushOptions(),
      series: [{ type: 'scatter', symbol: 'rect', symbolSize: heatmapSymbolSize(plotSize.width, plotSize.height, spec.xLabels.length, spec.yLabels.length), emphasis: { focus: 'none' }, ...referenceMarkOptions(theme, spec.referenceMarks), data: cells.map(c => ({
        value: [xIndex.get(c.x) ?? -1, yIndex.get(c.y) ?? -1, c.value],
        itemStyle: cellStyle(c),
        ...(categories || (c.status && !borderOnly) ? { label: { ...cellLabel(c), position: 'inside' } } : {}),
      })) }, ...heatmapStatusOutlines(cells.flatMap(c => c.status ? [{ value: [xIndex.get(c.x) ?? -1, yIndex.get(c.y) ?? -1, c.value], status: c.status, fill: fillColor(c), ...(categories ? { opacity: 1 } : {}) }] : []), heatmapSymbolSize(plotSize.width, plotSize.height, spec.xLabels.length, spec.yLabels.length), new Set())],
    } : {
      tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (params: { dataIndex: number }) => { const row = rows[params.dataIndex]; return row ? `${row.groupLabel ?? row.label}: ${valueText(row.value)} · ${percent(row.share ?? 0)}` : ''; } },
      series: [{ type: 'pie', radius: ['55%', '80%'], selectedMode: false, emphasis: { focus: 'none', scale: false }, label: { show: false }, data: rows.map(row => ({ name: row.label, value: row.value, itemStyle: { color: token(row.color!), borderColor: token(colors.selection), borderWidth: selectionRing(activeSet.has(row.key)) } })) }],
    };
    return { option, scale, domain, ramp, validThreshold };
  // `size`, `height` and `lang` are deliberate re-run triggers: a new option object makes ECharts re-lay out the plot for the new size/language.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional triggers, see comment above
  }, [spec, cells, rows, extended, active, activeSet, controlledCell, controlledKey, plotSize, valueText, size, height, lang, rowFloor, themeRevision]);
  const measureGrid = useCallback((instance: ECharts | null) => {
    if (spec.kind !== 'heatmap' || !instance || instance.isDisposed?.()) return;
    // ECharts exposes the laid-out grid through its runtime model (not in its public TS surface).
    const grid = (instance as unknown as { getModel?: () => { getComponent: (name: string) => { coordinateSystem?: { getRect: () => { width: number; height: number } } } | undefined } }).getModel?.().getComponent('grid');
    const rect = grid?.coordinateSystem?.getRect();
    if (rect) setPlotSize(old => old.width === rect.width && old.height === rect.height ? old : { width: rect.width, height: rect.height });
  }, [spec.kind]);
  // notMerge replaces the brush model; restore the toolbox cursor after that replacement.
  useEffect(() => {
    if (brushable && chart.current && !chart.current.isDisposed?.()) {
      chart.current.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: brushMode ? 'rect' : false, brushMode: 'single' } }, { silent: true });
    }
    measureGrid(chart.current);
  }, [option, brushMode, instanceReady, brushable, measureGrid]);
  const summary = extended?.summary ?? (spec.kind === 'heatmap'
    ? m('chartHeatmapSummary', { cells: cells.length, missing: spec.xLabels.length * spec.yLabels.length - cells.length, unknown: cells.filter(c => c.value === null).length, nullLabel: spec.nullLabel ?? unknown.toLowerCase(), unit: p.unit })
    : m('chartDonutSummary', { count: rows.length, total: format(total), unit: p.unit }));
  const selectedRows = useMemo(() => rows.filter(row => activeSet.has(row.key)), [rows, activeSet]);
  const controlledRow = controlledKey === null ? undefined : rows.find(row => row.key === controlledKey);
  const useTableSelection = canPreferTableSelection && selectionFromTable
    && selectedRows.length === 1 && selectedRows[0].value !== null;
  const controlledActionRow = useTableSelection ? selectedRows[0] : controlledRow;
  const controlledActionRows = controlledActionRow ? [controlledActionRow] : [];
  const actionRows = controlledCellSupplied ? controlledActionRows : selectedRows;
  const summaryRows = actionRows;
  const controlledLabel = controlledActionRow === controlledRow ? controlledCell?.label : undefined;
  const summaryLabels = controlledLabel ?? summaryRows.map(row => row.label).join(', ');
  let selectionSummary = summaryRows.length ? m(spec.kind === 'heatmap' ? 'chartHeatmapSelectionSummary' : 'chartSelectionSummary', { labels: summaryLabels, count: summaryRows.length }) : m('chartNoSelection');
  if ((spec.kind === 'scatter' || spec.kind === 'pareto') && active.length > 3) {
    const labels = selectedRows.slice(0, 3).map(row => row.label).join(', ');
    selectionSummary = m('chartSelectionOverflow', { count: active.length, labels, more: active.length - 3 });
  }
  // Still following an item whose bar is not drawn: name it as outside the drawn top N (only a valid input item; a rejected one is no rank).
  const outsideLabel = following && spec.kind === 'topNBar' && spec.selectedId != null && !active.length
    ? extended?.labels?.get(spec.selectedId) : undefined;
  if (outsideLabel !== undefined && spec.kind === 'topNBar') {
    selectionSummary = spec.categoryTopN && validCategoryTopN(spec.categoryTopN)
      ? m('chartSelectionOutsideCategories', { label: outsideLabel })
      : m('chartSelectionOutsideTopN', { label: outsideLabel, count: rows.length });
  }
  if (spec.kind === 'heatmap' && summaryRows.length > 3) {
    const range = (labels: string[], axis: 'x' | 'y') => {
      const chosen = new Set(selectedRows.map(row => row[axis]));
      const selectedLabels = labels.filter(label => chosen.has(label));
      return selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels[0]}–${selectedLabels.at(-1)}`;
    };
    selectionSummary = m('chartHeatmapRangeSelection', { count: active.length, yRange: range(spec.yLabels, 'y'), xRange: range(spec.xLabels, 'x') });
  }
  const lastSelected = rows.find(row => row.key === active.at(-1));
  const rowDrill = topN && rows.some(row => !!row.drill);
  const cellDrill = spec.kind === 'heatmap' && spec.cellActivation?.on === 'dblclick';
  const canDrill = rowDrill;
  const plotKey = (seriesIndex: number, dataIndex: number) =>
    extended ? extended.seriesKeys[seriesIndex]?.[dataIndex] : rows[dataIndex]?.key;
  const selectedCell = spec.kind === 'heatmap' && actionRows.length === 1 ? cells.find(cell => keyOf(cell.x, cell.y) === actionRows[0].key) : undefined;
  const selectedActionRow = actionRows.length === 1 ? actionRows[0] : undefined;
  const showDisabledHeatmapDetails = controlledCellSupplied && spec.kind === 'heatmap' && !!spec.onCellClick;
  const activateCell = (gesture: 'click' | 'dblclick', params: { componentType?: string; seriesIndex?: number; dataIndex: number }) => {
    if (brushMode || spec.kind !== 'heatmap' || spec.cellActivation?.on !== gesture || params.componentType !== 'series' || params.seriesIndex !== 0) return;
    const cell = cells[params.dataIndex];
    if (cell) spec.cellActivation.onActivate(cell.x, cell.y);
  };
  const categorical = spec.kind === 'heatmap' && spec.categories !== undefined;
  const headers = extended?.headers ?? (spec.kind === 'heatmap' ? ['x', 'y', m('chartHeaderValue'), ...(categorical ? [m('chartHeaderCategory')] : []), ...(hasStatuses ? [m('chartHeaderStatus')] : [])] : [m('chartHeaderName'), m('chartHeaderValue'), '%']);
  const tableValues = extended?.tableValues ?? rows.map(row => spec.kind === 'heatmap' ? [row.x!, row.y!, valueText(row.value), ...(categorical ? [row.categoryLabel!] : []), ...(hasStatuses ? [statusText(row.status)] : [])] : [row.groupLabel ?? row.label, valueText(row.value), percent(row.share ?? 0)]);
  const numericColumns = extended?.numericColumns ?? (spec.kind === 'donut' ? [1, 2] : []);
  function exportCsv() {
    const csvHeaders = extended?.csvHeaders ?? [...headers.map((header, i) => i === (spec.kind === 'heatmap' ? 2 : 1) ? `${header} (${p.unit})` : header), ...(hasStatuses ? [m('chartHeaderReason')] : [])];
    const csvValues = extended?.csvValues ?? rows.map(row => spec.kind === 'heatmap' ? [row.x!, row.y!, row.value ?? unknown, ...(categorical ? [row.categoryLabel!] : []), ...(hasStatuses ? [row.status?.label ?? '', row.status?.reason ?? ''] : [])] : [row.groupLabel ?? row.label, row.value ?? unknown, row.share ?? 0]);
    try { downloadChartCsv({ ...p, context: global ?? {} }, csvHeaders, csvValues); } catch {
      exportGate.say(m('chartExportCsvFailed', { chartId: p.chartId }), 'warning');
      return;
    }
    exportGate.say(m('chartExportedCsv', { chartId: p.chartId }));
  }
  const categoryLegend = spec.kind === 'heatmap' && spec.categories?.map(category => <span key={category.id} className={cn('inline-flex items-center gap-1', chrome === 'standard' && 'min-w-0 max-w-full')}>
    <Swatch color={token(HEATMAP_CATEGORY_TOKENS[category.tone].fill)} fixed={chrome === 'standard'} />
    {chrome === 'standard' ? <ChartLegendLabel name={category.label[lang]} /> : category.label[lang]}
  </span>);
  const pivotLabel = scale?.type === 'diverging' ? scale.pivotLabel ?? m('chartTarget', { pivot: format(scale.pivot) }) : undefined;
  const kindLegend = <>{spec.kind === 'heatmap' && <div className={cn('px-4 py-2 text-text-secondary', compact ? 'text-tiny' : 'text-xs')}>
        {categorical && <div className="flex flex-wrap gap-3">{categoryLegend}</div>}
        {!categorical && (scale?.type === 'threshold' && validThreshold ? <div className="flex gap-3">{scale.labels.map((label, i) => <span key={i} className="flex items-center gap-1"><Swatch color={token([colors.good, colors.warn, colors.critical][i])} />{label}</span>)}</div> : <>
          <HeatmapRamp ramp={ramp} />
          <div className="relative flex justify-between">
            <span>{format(domain[0])}</span>
            {scale?.type === 'diverging' && <span className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
              <span aria-hidden className="absolute bottom-full h-2 border-l border-border-strong" />
              <span>{pivotLabel}</span>
            </span>}
            <span>{format(domain[1])}</span>
          </div>
        </>)}
        <span className="flex items-center gap-1"><Swatch color={token(colors.unknown)} unknown />{unknown}</span>
        {hasStatuses && <div className="flex flex-wrap gap-3" role="group" aria-label={m('chartLegend')}><ChartStatusLegend statuses={statusLegend} /></div>}
      </div>}
      {extended && <KindLegend compact={compact} items={extended.legend} label={m('chartLegend')} />}
      {spec.kind === 'donut' && <ul aria-label={m('chartLegend')} className={cn('flex flex-wrap gap-3 px-4 py-2 text-text-secondary', compact ? 'text-tiny' : 'text-xs')}>{rows.map(row => <li key={row.key} className="flex items-center gap-1"><Swatch color={token(row.color!)} />{row.label} · {valueText(row.value)} · {percent(row.share ?? 0)}</li>)}</ul>}</>;
  const standardLegend = <>
    {spec.kind === 'heatmap' && <>
      {categorical && categoryLegend}
      {!categorical && (scale?.type === 'threshold' && validThreshold ? scale.labels.map((label, i) => <span key={i} className="inline-flex min-w-0 max-w-full items-center gap-1">
        <Swatch color={token([colors.good, colors.warn, colors.critical][i])} fixed /><ChartLegendLabel name={label} />
      </span>) : <>
        <span>{format(domain[0])}</span>
        <HeatmapRamp ramp={ramp} inline />
        {pivotLabel !== undefined && <ChartLegendLabel name={pivotLabel} />}
        <span>{format(domain[1])}</span>
      </>)}
      <span className="inline-flex min-w-0 max-w-full items-center gap-1"><Swatch color={token(colors.unknown)} unknown fixed /><ChartLegendLabel name={unknown} /></span>
      <ChartStatusLegend statuses={statusLegend} singleLine />
    </>}
    {extended && <KindLegend compact singleLine items={extended.legend} />}
    {spec.kind === 'donut' && rows.map(row => <span key={row.key} className="inline-flex min-w-0 max-w-full items-center gap-1">
      <Swatch color={token(row.color!)} fixed /><ChartLegendLabel name={row.label}>{row.label} · {valueText(row.value)} · {percent(row.share ?? 0)}</ChartLegendLabel>
    </span>)}
  </>;
  const rankingToolbar = spec.kind === 'topNBar' && <ChartInteractionToolbar compact={compactChrome} reserveCorner={section !== null}
    toolsReveal={chrome === 'standard' ? p.toolsReveal : undefined} secondaryOpen={panelToolsOpen} onSecondaryOpenChange={setPanelToolsOpen}
    heading={<ChartHeading titleId={titleId} title={p.title} description={p.description} metricVersion={p.metricVersion}
      compact={compact || compactChrome} hideTitle={compactChrome} />}
    start={<Button type="button" ref={collapseButton} size={compactChrome ? 'icon-xs' : 'toolbar'} variant={chartToolVariant(compactChrome)}
      aria-label={m(expanded ? 'chartHide' : 'chartShow')} title={m(expanded ? 'chartHide' : 'chartShow')} aria-expanded={expanded} aria-controls={bodyId} onClick={() => {
        const next = !expanded;
        if (spec.expanded === undefined) setLocalExpanded(next);
        spec.onExpandedChange?.(next);
      }}>{expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      {!compactChrome && <span className="t-chart-tool">{m(expanded ? 'chartHide' : 'chartShow')}</span>}
    </Button>}
    reset={<Button type="button" variant={chartToolVariant(compactChrome)} size={compactChrome ? 'icon-xs' : 'toolbar'} aria-label={m('chartReset')} title={m('chartReset')} onClick={reset}>
      <RotateCcw className="size-3.5" aria-hidden />{!compactChrome && <span className="t-chart-tool">{m('chartReset')}</span>}
    </Button>}
    table={{ shown: expanded && table, toggle: () => {
      if (!expanded) {
        if (spec.expanded === undefined) setLocalExpanded(true);
        spec.onExpandedChange?.(true);
        setTable(true);
      } else setTable(current => !current);
    } }}
    exportCsv={exportGate.allowed ? exportCsv : undefined}
    exportTools={exportGate.allowed && <>
      {p.imageCopy && <ChartImageCopyButton standalone={p.exportActions} onOutcome={exportGate.say} fileName={`${safeFileName(p.chartId)}.png`} capture={() => echartImageBlob(chart.current)} />}
      {p.imagePrint && <ChartImagePrintButton standalone={p.exportActions} onOutcome={exportGate.say} title={() => document.getElementById(titleId)?.textContent ?? ''} capture={() => echartImageBlob(chart.current)} />}
    </>}
    secondary={<>
      {chrome === 'minimal' && kindLegend}
      {rowDrill && <div className="flex flex-wrap items-center gap-1">
        <select aria-label={m('chartSelectPoint')} className="max-w-56 rounded-md border border-border-control bg-surface-card px-2 py-1 text-xs"
          value={lastSelected?.key ?? ''} onChange={event => setSelected([event.target.value])}>
          <option value="" disabled>{m('chartSelectPoint')}</option>
          {rows.filter(row => keySet.has(row.key)).map(row => <option key={row.key} value={row.key}>{row.label} · {valueText(row.value)}</option>)}
        </select>
        <Button type="button" size="toolbar" variant="ghost" disabled={!lastSelected?.drill} onClick={lastSelected?.drill}>{m('chartActivatePoint')}</Button>
      </div>}
      <p className="border-t border-border-subtle pt-2 text-text-secondary">{summary}</p>
    </>} />;
  const rendered = !(spec.kind === 'topNBar' && spec.hideWhenEmpty && empty);
  useDockChartHead(titleId, { mounted: rendered, acceptsHead: false });
  if (!rendered) return null;
  const toolbarButtonSize = compactChrome ? 'icon-xs' : 'toolbar';
  const categoryToolbar = !topN && <ChartInteractionToolbar compact={compactChrome} reserveCorner={section !== null}
    toolsReveal={chrome === 'standard' ? p.toolsReveal : undefined} secondaryOpen={panelToolsOpen} onSecondaryOpenChange={setPanelToolsOpen}
    heading={<ChartHeading titleId={titleId} title={p.title} description={p.description} metricVersion={p.metricVersion}
      compact={compact || compactChrome} hideTitle={compactChrome} />}
    brush={brushable && <Button type="button" size={toolbarButtonSize} variant={chartToolVariant(compactChrome, brushMode)}
      aria-label={m('chartBrush')} title={m('chartBrush')} aria-pressed={brushMode} onClick={() => setBrushMode(!brushMode)}><BrushIcon className="size-3.5" aria-hidden />{!compactChrome && <span className="t-chart-tool">{m('chartBrush')}</span>}</Button>}
    reset={selectionEnabled && <Button type="button" size={toolbarButtonSize} variant={chartToolVariant(compactChrome)}
      aria-label={m('chartReset')} title={m('chartReset')} onClick={reset}><RotateCcw className="size-3.5" aria-hidden />{!compactChrome && <span className="t-chart-tool">{m('chartReset')}</span>}</Button>}
    table={{ shown: table, toggle: () => setTable(current => !current), buttonRef: tableToggle }}
    exportCsv={exportGate.allowed ? exportCsv : undefined}
    exportTools={exportGate.allowed && <>
      {p.imageCopy && <ChartImageCopyButton standalone={p.exportActions} onOutcome={exportGate.say} fileName={`${safeFileName(p.chartId)}.png`} capture={() => echartImageBlob(chart.current)} />}
      {p.imagePrint && <ChartImagePrintButton standalone={p.exportActions} onOutcome={exportGate.say} title={() => document.getElementById(titleId)?.textContent ?? ''} capture={() => echartImageBlob(chart.current)} />}
    </>}
    secondary={compactChrome && <>
      {chrome === 'minimal' && kindLegend}
      <p className="border-t border-border-subtle pt-2 text-text-secondary">{summary}</p>
    </>} />;
  return <section ref={chartRoot} role="region" aria-labelledby={titleId} aria-describedby={summaryId} data-analysis-chart={section ? '' : undefined} className={cn(compactChrome && 'group/chart', 'relative flex min-w-0 flex-col rounded-lg border border-border-subtle bg-surface-card elevation-panel', size === 'fill' && (chrome === 'standard' ? 'h-full min-h-0' : FILL_CARD_CLASS), fittedDonut && 'min-h-64 overflow-y-auto', embedded && 'rounded-none border-0 shadow-none')}>
    <AnalysisChartPart enabled={section !== null}>
      {topN ? <>{rankingToolbar}{chrome === 'full' && kindLegend}
        {!compactChrome && <p id={summaryId} className="px-4 py-2 text-xs text-text-secondary">{summary}</p>}
      </> : <>{categoryToolbar}
        {chrome === 'full' && kindLegend}
        {!compactChrome && <p id={summaryId} className="px-4 py-2 text-xs text-text-secondary">{summary}</p>}
      </>}
      {(topN || !compactChrome) && <ImageActionStatus text={exportGate.status} />}
      {!topN && compactChrome && exportGate.allowed && <span role="status" className="sr-only">{exportGate.status}</span>}
      {compactChrome && <p id={summaryId} className="sr-only">{summary}</p>}
    </AnalysisChartPart>
    <ChartCollapseBody enabled={spec.kind === 'topNBar'} bodyRef={collapsibleBody} id={bodyId} expanded={expanded}>
    <AnalysisChartPart enabled={section !== null} body bounded={chrome === 'standard' && size === 'fill'}>
      <ChartLegendLayout enabled={chrome === 'standard'} fill={size === 'fill' && !fittedDonut} placement={p.legendPlacement} legend={standardLegend} caption={p.legendCaption}>
      {!expanded ? null : empty ? <p className="px-4 py-3 text-text-secondary">{p.emptyText ?? m('chartNoData')}</p> : <div ref={fill.ref} role={canDrill ? 'group' : rowFloor ? 'region' : undefined}
        aria-label={canDrill ? m('chartPointsGroup') : undefined} aria-labelledby={rowFloor && !canDrill ? titleId : undefined}
        tabIndex={rowFloor || canDrill ? 0 : undefined} onKeyDown={canDrill ? event => {
          if (event.key !== 'Enter' || brushMode) return;
          if (lastSelected?.drill) {
            event.preventDefault();
            lastSelected.drill();
          }
        } : undefined} className={cn('relative', size === 'fill' && (chrome === 'standard' ? 'min-h-0 grow basis-0 overflow-hidden' : FILL_PLOT_CLASS), rowFloor && 'overflow-y-auto', fittedDonut && 'min-h-28')}>
        <EChart key={spec.kind} onReady={instance => { chart.current = instance; setInstanceReady(generation => generation + 1); }} onResize={() => measureGrid(chart.current)} option={option} height={canvasHeight} ariaLabel={typeof p.title === 'string' ? p.title : p.chartId} onEvents={{
          click: params => {
            if (!selectionEnabled || params.componentType !== 'series' || (spec.kind === 'heatmap' && params.seriesIndex > 0)) return;
            activateCell('click', params);
            const key = plotKey(params.seriesIndex, params.dataIndex);
            if (!key || !keySet.has(key)) return;
            if (!topN) {
              toggle(key, 'plot');
              return;
            }
            if (brushMode) return;
            const add = !singleSelect && (params.event?.event?.metaKey || params.event?.event?.shiftKey);
            setSelected(previous => add ? [...(previous ?? active).filter(item => item !== key), key] : [key]);
          },
          ...(canDrill || cellDrill ? { dblclick: (params: { componentType?: string; seriesIndex: number; dataIndex: number }) => {
            if (brushMode || params.componentType !== 'series') return;
            if (cellDrill) activateCell('dblclick', params);
            else rows.find(row => row.key === plotKey(params.seriesIndex, params.dataIndex))?.drill?.();
          } } : {}),
          finished: (_, instance) => measureGrid(instance),
          takeglobalcursor: params => { if (brushable) setBrushMode(params.key === 'brush' && params.brushOption?.brushType === 'rect'); },
          brushselected: params => { if (!brushable) return; const selections: { seriesIndex: number; dataIndex: number[] }[] = params.batch?.[0]?.selected ?? []; brushedKeys.current = [...new Set(selections.flatMap(s => s.dataIndex.flatMap(i => { const key = extended ? extended.seriesKeys[s.seriesIndex]?.[i] : s.seriesIndex === 0 ? rows[i]?.key : undefined; return key ? [key] : []; })))]; },
          brushEnd: () => {
            if (!brushable) return;
            const next = brushedKeys.current.filter(key => keySet.has(key));
            const nextSet = new Set(next);
            if (spec.kind === 'heatmap') setSelectionFromTable(false);
            setSelected(old => old !== null && old.length === next.length && old.every(key => nextSet.has(key)) ? old : next);
          },
        }} />
        {spec.kind === 'donut' && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-xs text-text-secondary">
          <p>{selectedRows[0]?.label ?? spec.centerLabel ?? m('chartTotal')}</p>
          <p className="t-card-title">{valueText(selectedRows[0]?.value ?? total)}</p>
          {selectedRows[0] && <p>{percent(selectedRows[0].share ?? 0)}</p>}
        </div>}
      </div>}
      </ChartLegendLayout>
      {topN && expanded && <ChartGestureHint point={rows.length > 0} additive={!singleSelect} drill={canDrill} />}
      {selectionEnabled && !followingEmptyChart && <section onFocus={() => { summaryHadFocus.current = true; }} onBlur={(event) => { releaseFocusLater(event.currentTarget, () => { summaryHadFocus.current = false; }); }} tabIndex={compactChrome && !(spec.kind === 'heatmap' && spec.cellActivation) && !selectedActionRow?.drill ? 0 : undefined} aria-label={m('chartSelectionSummaryRegion')} className={cn(compactChrome ? 'flex max-h-16 shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 overflow-y-auto px-2 py-0.5 text-xs text-text-secondary' : 'px-4 py-2 text-xs text-text-secondary', !compactChrome && (embedded ? 'border-t border-border-subtle' : 'bg-surface-sunken'))}>
        {selectionSummary}
        {hasStatuses && summaryRows.filter(row => row.status).map(row => <p key={row.key}>{row.label}: {statusText(row.status)}</p>)}
        {spec.kind === 'heatmap' && spec.cellActivation && <Button size={compactChrome ? 'icon-xs' : 'toolbar'} variant="ghost" aria-label={compactChrome ? m('chartActivatePoint') : undefined} title={compactChrome ? m('chartActivatePoint') : undefined} disabled={brushMode || !selectedCell} onClick={() => { if (!brushMode && selectedCell) spec.cellActivation?.onActivate(selectedCell.x, selectedCell.y); }}>{compactChrome ? <Play className="size-3.5" aria-hidden /> : m('chartActivatePoint')}</Button>}
        {(selectedActionRow?.drill || showDisabledHeatmapDetails) && <Button size={compactChrome ? 'icon-xs' : 'toolbar'} variant="ghost" aria-label={compactChrome ? m('chartDetails') : undefined} title={compactChrome ? m('chartDetails') : undefined} disabled={!selectedActionRow?.drill} onClick={selectedActionRow?.drill}>{compactChrome ? <ExternalLink className="size-3.5" aria-hidden /> : m('chartDetails')}</Button>}
      </section>}
      {table && <div className="overflow-auto px-4 py-2"><table tabIndex={spec.kind === 'histogram' ? 0 : undefined} className="t-body w-full"><caption className="t-caption">{p.title} · {p.unit}</caption>
        <thead className="bg-surface-sunken"><tr>{(selectionEnabled ? [...headers, m('chartSelect')] : headers).map((h, i) => <th key={h} scope="col" className={cn('t-table-header', numericColumns.includes(i) && 'text-right')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.key}>{tableValues[i].map((value, j) => <td key={j} className={numericColumns.includes(j) ? 'text-right tabular-nums' : undefined}>{value}</td>)}{selectionEnabled && <td>
          {keySet.has(row.key) && <Checkbox aria-label={m('chartSelectItem', { label: row.label })} checked={activeSet.has(row.key)} onCheckedChange={() => toggle(row.key, 'table')} />}
          {row.drill && <Button size="toolbar" variant="ghost" onClick={row.drill}>{m('chartDetails')}</Button>}
        </td>}</tr>)}</tbody>
      </table></div>}
      <ChartTrustFooter trust={p.trust} />
    </AnalysisChartPart>
    </ChartCollapseBody>
  </section>;
}

function clearBrush(chart: ECharts | null) {
  if (chart && !chart.isDisposed?.()) chart.dispatchAction({ type: 'brush', areas: [] });
}

function HeatmapRamp({ ramp, inline = false }: { ramp: ThemeColorToken[]; inline?: boolean }) {
  // eslint-disable-next-line shadcn/no-inline-styles -- continuous scale legend resolves the five public ramp tokens at runtime
  return <div aria-hidden={inline || undefined} className={inline ? 'h-2 w-20 shrink-0 rounded' : 'h-2 w-full rounded'} style={{ background: `linear-gradient(to right, ${ramp.map(c => token(c)).join(', ')})` }} />;
}

function Swatch({ color, unknown = false, fixed = false }: { color: string; unknown?: boolean; fixed?: boolean }) {
  // eslint-disable-next-line shadcn/no-inline-styles -- swatch reflects runtime chart tokens; unknown matches the canvas dashed border
  return <span aria-hidden className={cn('inline-block size-3', fixed && 'shrink-0')} style={{ backgroundColor: color, border: unknown ? `1px dashed ${token(colors.pattern)}` : undefined }} />;
}

function ChartCollapseBody({ enabled, bodyRef, id, expanded, children }: { enabled: boolean; bodyRef: RefObject<HTMLDivElement | null>; id: string; expanded: boolean; children: ReactNode }) {
  return enabled ? <div ref={bodyRef} id={id} hidden={!expanded} className={expanded ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>{children}</div> : <>{children}</>;
}
