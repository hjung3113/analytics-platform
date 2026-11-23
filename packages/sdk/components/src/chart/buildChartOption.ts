import type { EChartsCoreOption } from 'echarts/core';
import { formatText, type Lang } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import { chartTheme, strokeToken, token } from './EChart';
import { boundSeries, boundText, projectChartBounds, type ChartBounds, type ChartBoundLabels } from './chartBounds';
import { lineStatusSeries } from './linePointStatus';
import { noteLabelWidths } from './annotationLayout';
import { GRID_BOTTOM, GRID_TOP, rowLabelGutter } from './analysisChartGeometry';
import { toMs, unknownLabel, percent } from './analysisChartShared';
import type { HistogramBin, HistogramSpec } from './AnalysisChart';
import type { ChartRow } from './analysisChartData';
import { chartDiagnostic } from './analysisChartData';
import type { ChartSeries } from './AnalysisChartFrame';
import { chartPointKey, statusBorderColor, statusColor, statusKey, statusMarker, statusText, type ChartStatus } from './chartStatus';
import { escapeHtml } from './chartText';
import { barStatusBackingSeries } from './chartStatusBacking';
import { rowGroupLayout, rowGroupSeries, rowLabel, type ChartRowGroups } from './chartRowGroups';
import { emptyCategoryLabels, emptyCategorySeries } from './chartEmptyCategories';
import type { Selection } from './useChartRange';
import { laneLayout, type LaneLayout, type SeriesExtremes } from './chartLanes';
import { axisBreakGraphic, barRadius, CHART_MARKS, lineSymbolShown } from './chartMarks';
import { LABEL_FONT, labelFitsSegment, labelWidth, segmentLabelStyle, shortNumber, stackEnd, type LabelRect, type RowTotal, type ValueLabels } from './chartValueLabels';

/** The plot's horizontal margin (grid left 52 + right 20). */
export const PLOT_MARGIN = 72;
/** One note-label row at fontSize 10. */
const NOTE_LABEL_ROW = 12;
/** Smallest pixel budget of a lane name: a zero-width lane would otherwise be truncated to nothing. */
const MIN_LANE_LABEL_PX = 40;
/** Right grid room reserved for a 최소/최대 label chip beyond the last segment (row-pitch mode keeps its own 20). */
const MIN_MAX_LABEL_ROOM = 44;
/** A plain stacked bar's total label moves right by this much when a 최소/최대 chip may sit at the same bar end. */
const CHIP_SHIFT = 32;
/** Gap between a bar end (or the lane column) and its total label; the partial marker adds its own width. */
const TOTAL_GAP = 4;
/** Minimum spacing between time-axis and horizontal value-axis labels, in px. */
const MIN_TICK_PITCH = 64;
const DEFAULT_TICKS = 5;
const PARTIAL_MARKER = 8;
/** Upper bound of the category-label allowance in a `containLabel` horizontal grid. */
const MAX_CATEGORY_ROOM = 160;
/** Histogram numeric axis uses the same sparse tick budget as the frame. */
export function buildHistogramOption({ spec, bins, rows, countLabel }: {
  spec: HistogramSpec; bins: HistogramBin[]; rows: ChartRow[]; countLabel: string;
}): EChartsCoreOption {
  const theme = chartTheme();
  const ids = new Set<string>();
  const references = (spec.referenceLines ?? []).filter(line => {
    if (!Number.isFinite(line.value) || ids.has(line.id)) { chartDiagnostic('histogram: non-finite or duplicate reference line dropped'); return false; }
    ids.add(line.id); return true;
  });
  let min = bins[0]?.start ?? 0; let max = bins.at(-1)?.end ?? 1;
  for (const line of references) { min = Math.min(min, line.value); max = Math.max(max, line.value); }
  const statusPeaks: number[] = [];
  for (const [i, bin] of bins.entries()) {
    const status = rows[i].status;
    if (!status) continue;
    const previous = rows[i - 1]?.status;
    if (previous && bins[i - 1].end === bin.start && statusKey(previous) === statusKey(status)) {
      const peak = statusPeaks.at(-1)!;
      if (bin.count > bins[peak].count) statusPeaks[statusPeaks.length - 1] = i;
    } else statusPeaks.push(i);
  }
  return {
    grid: { top: 32, bottom: 56, left: 40, right: 40, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { dataIndex: number; seriesIndex?: number }) => {
      if (p.seriesIndex !== undefined && p.seriesIndex !== 0) return '';
      const row = rows[p.dataIndex];
      return row ? `${row.label} ${spec.xUnit} · ${countLabel}: ${row.value} · ${percent(row.share ?? 0)}${row.status ? ` · ${statusText(row.status)}` : ''}` : '';
    } },
    xAxis: { type: 'value', min, max, name: `${spec.xLabel} (${spec.xUnit})`, nameLocation: 'middle', nameGap: 32,
      splitNumber: DEFAULT_TICKS, axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, hideOverlap: true }, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, minInterval: 1, name: countLabel, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine },
    series: [
      { type: 'custom', clip: true, emphasis: { disabled: true }, encode: { x: [0, 1], y: 2 },
        renderItem: (_params: unknown, api: { value: (dimension: number) => unknown; coord: (point: unknown[]) => number[]; visual: (key: string) => string }) => {
          const [left, top] = api.coord([api.value(0), api.value(2)]);
          const [right, baseline] = api.coord([api.value(1), 0]);
          return { type: 'rect', shape: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, baseline - top) }, style: { fill: api.visual('color') } };
        },
        data: bins.map((bin, i) => ({ value: [bin.start, bin.end, bin.count], itemStyle: { color: rows[i].status ? statusColor(rows[i].status!) : token('chart-series-1') } })),
        markLine: { ...theme.referenceLine, symbol: ['none', 'none'], data: references.map(line => {
          const color = line.tone ? statusColor({ tone: line.tone, label: line.label }) : theme.referenceLine.lineStyle.color;
          return { name: line.label, xAxis: line.value, lineStyle: { type: 'dashed', color },
            // The text runs from the line toward the plot's middle, so a line near either axis end keeps its label inside the plot.
            // ECharts anchors `insideEndTop` 5px left of a vertical line; a left-half label moves twice that to sit 5px right of it.
            label: { show: true, formatter: () => line.label, position: 'insideEndTop', rotate: 0, color,
              ...(line.value < min / 2 + max / 2 ? { align: 'left', offset: [10, 0] } : { align: 'right' }) } };
        }) },
      },
      { type: 'scatter', silent: true, tooltip: { show: false }, symbolSize: 0, z: 3,
        data: statusPeaks.map(i => {
          const bin = bins[i];
          return { value: [bin.start + (bin.end - bin.start) / 2, bin.count], label: { ...statusMarker(rows[i].status!), position: 'top' } };
        }) },
    ],
  };
}
/** Extra right grid room for the right value axis' labels and name (a left axis gets 52, the plain right margin is 20). */
const RIGHT_AXIS_ROOM = 32;

export type LinePattern = 'solid' | number[];
export function linePattern(series: ChartSeries, previous: boolean): LinePattern {
  if (previous) return series.dashed ? [8, 3, 2, 3] : [2, 2];
  return series.dashed ? [8, 4] : 'solid';
}

/** CSS token values, resolved when the option is rebuilt: the theme can change between rebuilds, so the builder never reads them itself. */
export type ChartPalette = {
  theme: ReturnType<typeof chartTheme>;
  selection: string;
  annotation: string;
  annotationLabel: string;
  brushFill: string;
  brushBorder: string;
  /** Outline colours of the per-series minimum and maximum segments (Show Min/Max). */
  minMax: { min: string; max: string };
  /** Background of the 최소/최대 label chip, so the text reads on any series fill. */
  labelSurface: string;
  /** Index-aligned with the displayed series: the line stroke and the fill. */
  series: { stroke: string; fill: string }[];
  /** Index-aligned with the displayed series: the segment label colour that reads on that fill, and whether it sits on a surface chip (`segmentLabelStyle`). */
  segmentText: { color: string; chip: boolean }[];
  /** Total label colour. */
  totalText: string;
};

export function resolveChartPalette(displayed: readonly { color: ThemeColorToken }[]): ChartPalette {
  return {
    theme: chartTheme(),
    selection: token('chart-blue'),
    annotation: token('chart-purple'),
    annotationLabel: token('cat-purple'),
    // Fill derives rgba from the resolved chart-blue token (#297): copying stroke channels would shift the hue,
    // and a literal rgba copies the token's values.
    brushFill: token('chart-blue').replace(/^rgb\((.+)\)$/, (_, rgb: string) => `rgba(${rgb},0.12)`),
    brushBorder: token(strokeToken('chart-blue')),
    // Two status hues no series fill uses (series are slate, violet and teal tones); the 최소/최대 label carries the meaning, so colour is never the only cue.
    minMax: { min: token('chart-status-good'), max: token('chart-status-critical') },
    labelSurface: token('surface-card'),
    series: displayed.map(s => ({ stroke: token(strokeToken(s.color)), fill: token(s.color) })),
    segmentText: displayed.map(s => { const l = segmentLabelStyle(s.color); return { color: token(l.text), chip: l.chip }; }),
    // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
    totalText: token('text-primary'),
  };
}

export type ChartOptionInput = {
  yFit?: boolean;
  /** Where the fitted value axis stops short of 0, measured from the drawn chart; draws the break mark (#2725). */
  axisBreak?: 'bottom' | 'top';
  bounds?: ChartBounds;
  boundLabels?: ChartBoundLabels;
  rowGroups?: ChartRowGroups;
  statuses?: ReadonlyMap<string, ChartStatus>;
  emphasisFocus?: 'series' | 'none';
  displayed: readonly ChartSeries[];
  previousIds: ReadonlySet<string>;
  xType: 'time' | 'category';
  horizontal: boolean;
  categories: readonly string[];
  zoom: readonly [number, number];
  brushMode: boolean;
  selection: Selection | null;
  annotations: readonly { text: string; from: string; to: string }[];
  noteSpans: readonly { from: number; to: number }[];
  noteLevels: readonly number[];
  timeExtent: number;
  chartWidth: number;
  /** Horizontal value axis only: the measured width bucketed by the Frame, so the tick budget follows a resize without the whole option changing. Absent = `chartWidth`. */
  tickRoom?: number;
  markLines: { y: number; label: string }[] | undefined;
  categoryValueMarks?: { label: string; byCategory: ReadonlyMap<string, number> };
  emptyCategoryLabel?: string;
  unit: string;
  lang: Lang;
  stacked: boolean | undefined;
  palette: ChartPalette;
  /** Stable and live: the tooltip calls it when it opens, so a consumer's new `valueFormat` never rebuilds the option. */
  valueFormat: (v: number) => string;
  /** Horizontal only. Set = row-pitch viewport: the frame scrolls the plot, so category zoom is off (one viewport model, 06 §16). */
  rowPitch?: number;
  /** Row-pitch plain rows only. Category-label gutter: absent = `ROW_LABEL_GUTTER`, a number = that width (px), 'auto' = the longest label, capped at `ROW_LABEL_GUTTER`. */
  rowLabelWidth?: 'auto' | number;
  /** Horizontal only. The controlled row highlight: a border on that row's bars and a bold category label. */
  activeCategory?: string | null;
  /** Horizontal stacked only. Each series' piece starts at its own lane's left edge; the value axis shows lane names instead of numbers. */
  startAlign?: boolean;
  /** Horizontal only. Per series id, the rows to outline as minimum and maximum (see `seriesExtremes`). */
  extremes?: ReadonlyMap<string, SeriesExtremes>;
  /** Horizontal stacked only; absent = no value labels and the option is unchanged. */
  valueLabels?: ValueLabels;
  selectedPointKeys?: readonly string[];
  /** Per category total to draw (`resolveRowTotals`); only read when `valueLabels` includes `total`. */
  totals?: ReadonlyMap<string, RowTotal>;
  /** Each total's text under the render's own formatter: the text and the grid room are built from it, not from the lazy `valueFormat`. */
  totalText?: ReadonlyMap<string, string>;
  /** Vertical, unstacked charts only (the Frame resolves that). Set = a second value axis on the right; a series with `axis: 'right'` is drawn on it with this unit and format in its tooltip. Absent = one axis and the option is unchanged. */
  rightAxis?: { unit: string; valueFormat: (v: number) => string };
};

/** What a label that does not fit lays out as: ECharts has no hide switch for a layout callback, so the label collapses to nothing. */
const YIELDED = { fontSize: 0, width: 0, height: 0 };

const HOUR_MS = 3_600_000;
const CATEGORY_MARK_SERIES = '__categoryValueMark';
const CATEGORY_MARK_SIZE = 8;
const DAY_MS = 24 * HOUR_MS;
const SHORTEST_MONTH_MS = 28 * DAY_MS;
const HOUR_TICK_STEPS = [1, 2, 3, 4, 6, 8, 12, 24].map(hours => hours * HOUR_MS);
const DAY_TICK_STEPS = [1, 2, 7, 14].map(days => days * DAY_MS);
const MONTH_TICK_STEPS = [1, 2, 3, 6, 12];

function minimumGap(values: readonly number[]) {
  let step = Infinity;
  for (let index = 1; index < values.length; index++) {
    step = Math.min(step, values[index] - values[index - 1]);
  }
  return step;
}

type TimeBuckets = {
  boundaries: number[];
  step?: number;
  calendar?: { boundaries: number[]; step: number; inferred: boolean };
};

export function timeBucketStep(series: readonly Pick<ChartSeries, 'points'>[]): TimeBuckets {
  const values = new Set<string>();
  for (const { points } of series) {
    for (const [x] of points) values.add(x);
  }
  const boundaries = [...values].map(toMs).sort((a, b) => a - b);
  const buckets: TimeBuckets = { boundaries };
  if (boundaries.length > 1) {
    const step = minimumGap(boundaries);
    buckets.step = step;
    if (step >= DAY_MS) {
      const months = boundaries.map(monthIndex);
      // Calendar-month buckets have unequal millisecond spans and at most one boundary per month.
      const monthly = step >= SHORTEST_MONTH_MS && new Set(months).size === months.length;
      if (monthly) {
        buckets.calendar = { boundaries, step: minimumGap(months), inferred: true };
      } else {
        // For a coarse grid on shorter buckets, keep the first on-phase boundary of each month.
        const first = boundaries[0];
        const monthStarts = new Map<number, number>();
        for (const [index, value] of boundaries.entries()) {
          const month = months[index];
          if ((value - first) % step === 0 && !monthStarts.has(month)) monthStarts.set(month, value);
        }
        buckets.calendar = { boundaries: [...monthStarts.values()], step: 1, inferred: false };
      }
    }
  }
  // Recomputed on every option build: a cache keyed by array identity would keep stale ticks when points change in place.
  return buckets;
}

function monthIndex(value: number) {
  const date = new Date(value);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function niceTickStep(ladder: readonly number[], bucketStep: number, minStep: number) {
  if (minStep <= bucketStep) return bucketStep;
  return ladder.find(candidate => candidate >= minStep && candidate % bucketStep === 0);
}

function lowerBound(values: readonly number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function timeAxisTicks(series: readonly ChartSeries[], zoom: readonly [number, number], width: number) {
  const { step, boundaries, calendar } = timeBucketStep(series);
  if (!boundaries.length) return { axisLabel: { hideOverlap: true } };
  if (step === undefined) {
    const customValues = [boundaries[0]];
    return { axisTick: { customValues }, axisLabel: { hideOverlap: true, customValues } };
  }

  const first = boundaries[0];
  const span = boundaries[boundaries.length - 1] - first;
  const minStep = span * (zoom[1] - zoom[0]) / 100 * MIN_TICK_PITCH / Math.max(width, 1);
  // Round the window as ECharts' dataZoom does (nearest millisecond, `toFixed(0)`), so the slice and the fallback test see exactly the
  // ticks the engine keeps: no edge bucket is dropped, and no clipped candidate suppresses the fallback.
  const from = Number((first + span * (zoom[0] / 100)).toFixed(0));
  const to = Number((first + span * (zoom[1] / 100)).toFixed(0));
  const visible = (values: readonly number[]) => values.slice(lowerBound(values, from), lowerBound(values, to + 1));
  let customValues: number[];
  let formatter = '{yyyy}-{MM}-{dd}';
  if (calendar && (calendar.inferred || minStep > Math.max(step, DAY_TICK_STEPS[DAY_TICK_STEPS.length - 1]))) {
    const minMonths = minStep / SHORTEST_MONTH_MS;
    const tickMonths = niceTickStep(MONTH_TICK_STEPS, calendar.step, minMonths)
      ?? Math.ceil(minMonths / calendar.step) * calendar.step;
    const firstMonth = monthIndex(first);
    customValues = visible(calendar.boundaries).filter(value => (monthIndex(value) - firstMonth) % tickMonths === 0);
    if (!customValues.length) {
      const observed = visible(boundaries);
      if (observed.length) {
        const anchorMonth = monthIndex(observed[0]);
        const ticksByMonth = new Map<number, number>();
        for (const value of observed) {
          const month = monthIndex(value);
          if ((month - anchorMonth) % tickMonths === 0 && !ticksByMonth.has(month)) ticksByMonth.set(month, value);
        }
        customValues = [...ticksByMonth.values()];
      }
    }
    formatter = '{yyyy}-{MM}';
  } else {
    const ladder = step < DAY_MS ? HOUR_TICK_STEPS : DAY_TICK_STEPS;
    const tickStep = niceTickStep(ladder, step, minStep) ?? Math.ceil(minStep / step) * step;
    // The encoding uses UTC digits for wall-clock time. Use its midnight grid when the buckets share that phase.
    const anchor = DAY_MS % tickStep === 0 && first % step === 0 ? 0 : first;
    const observed = visible(boundaries);
    customValues = observed.filter(value => (value - anchor) % tickStep === 0);
    if (!customValues.length && observed.length) {
      customValues = observed.filter(value => (value - observed[0]) % tickStep === 0);
    }
  }
  return {
    minInterval: step,
    axisTick: { customValues },
    axisLabel: { hideOverlap: true, customValues, ...(step >= DAY_MS ? { formatter } : {}) },
  };
}

export function buildChartOption(i: ChartOptionInput): EChartsCoreOption {
  const { horizontal, xType, categories, palette, lang } = i;
  const theme = palette.theme;
  const groups = horizontal && xType === 'category' ? i.rowGroups : undefined;
  const groupLayout = groups ? rowGroupLayout(groups, categories) : undefined;
  const active = horizontal ? i.activeCategory ?? null : null;
  const lanes = horizontal && i.startAlign && i.stacked ? laneLayout(i.displayed, categories) : null;
  const selectedPoints = new Set(i.selectedPointKeys);
  const statuses = i.statuses ?? new Map<string, ChartStatus>();
  const categoryMarks = i.categoryValueMarks;
  const emptyLabels = emptyCategoryLabels(i);
  let markMin = 0;
  if (categoryMarks) {
    for (const value of categoryMarks.byCategory.values()) markMin = Math.min(markMin, value);
  }
  const horizontalMin = markMin < 0 ? (extent: { min: number }) => Math.min(extent.min, markMin) : 0;
  const bounds = projectChartBounds(i);
  const chips = !!i.extremes?.size && horizontal;
  const segments = !chips && horizontal && !!i.stacked && i.displayed.length > 1 && (i.valueLabels === 'segment' || i.valueLabels === 'both');
  const totalTexts = horizontal && !!i.stacked && (i.valueLabels === 'total' || i.valueLabels === 'both') && i.totals?.size ? i.totals : null;
  // Room for the widest total (plus the partial marker); a plain stacked bar shifts it clear of a 최소/최대 chip, lanes keep one fixed column.
  const textOf = (x: string, t: RowTotal) => i.totalText?.get(x) ?? i.valueFormat(t.value);
  const totalRoom = totalTexts ? Math.max(...[...totalTexts].map(([x, t]) => labelWidth(`≥ ${textOf(x, t)}`))) + TOTAL_GAP + PARTIAL_MARKER : 0;
  const gridRight = (chips ? MIN_MAX_LABEL_ROOM : 20) + totalRoom + (i.rightAxis ? RIGHT_AXIS_ROOM : 0);
  // The chip sits on its own segment, so it is at the bar end when that segment ends where the row's stack ends (a zero-width tail after it does not move the end).
  const chipAtEnd = (x: string) => {
    const end = stackEnd(i.displayed, x);
    let run = 0;
    for (const s of i.displayed) {
      const y = s.points.find(([label]) => label === x)?.[1];
      if (typeof y !== 'number') continue;
      if (y > 0) run += y;
      const e = i.extremes?.get(s.id);
      if ((e?.min.x === x || e?.max.x === x) && run === end) return true;
    }
    return false;
  };
  const xValue = (x: string) => (xType === 'time' ? toMs(x) : x);
  const rowGutter = rowLabelGutter(i.rowLabelWidth, categories);
  // Pixels per axis unit from the plot width and the zoom window, so a label can be cut to its own area (#399 AC-2).
  const plotWidth = Math.max(0, i.chartWidth - (groupLayout ? groupLayout.gutter + 20 : PLOT_MARGIN) - (i.rightAxis ? RIGHT_AXIS_ROOM : 0));
  const zoomed = Math.max((i.zoom[1] - i.zoom[0]) / 100, 0.01);
  const units = xType === 'time' ? i.timeExtent : categories.length;
  const pxPerUnit = units > 0 ? plotWidth / (units * zoomed) : 0;
  // A narrow plot (a 400px drawer) cannot hold five numeric ticks: fewer ticks, and any that still touch are dropped; a wide plot keeps ECharts' defaults instead of printing `1,0002,000`.
  // Without rowPitch the grid is `containLabel`, so the category labels also eat plot width; their real width is unknown here, so the longest category is estimated (capped) and taken off.
  const categoryRoom = groupLayout?.gutter ?? (i.rowPitch !== undefined ? rowGutter : 52 + Math.min(MAX_CATEGORY_ROOM, Math.max(0, ...categories.map(labelWidth))));
  const gridPlotWidth = (i.tickRoom ?? i.chartWidth) - categoryRoom - gridRight;
  const tickCount = Math.floor(gridPlotWidth / MIN_TICK_PITCH);
  const valueAxisTicks = tickCount < DEFAULT_TICKS ? { splitNumber: Math.max(1, tickCount), axisLabel: { hideOverlap: true } } : {};
  const noteWidths = noteLabelWidths(i.noteSpans, pxPerUnit, plotWidth);
  const areas = [
    // Notes keep the default top label; the selection labels its bottom so a note saved over it never collides (#320).
    ...(i.selection ? [[{ name: formatText(COMPONENTS_MESSAGES.chartSelection, lang), [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.from), itemStyle: { color: palette.selection, opacity: 0.12 }, label: { position: 'insideBottom' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.to) }]] : []),
    ...i.annotations.map((a, n) => [{ name: a.text, [horizontal ? 'yAxis' : 'xAxis']: xType === 'time' ? i.noteSpans[n].from : categories[i.noteSpans[n].from], itemStyle: { color: palette.annotation, opacity: 0.14 }, label: { color: palette.annotationLabel, fontSize: 10, offset: [0, i.noteLevels[n] * NOTE_LABEL_ROW], width: noteWidths[n], overflow: 'truncate', ellipsis: '…' } }, { [horizontal ? 'yAxis' : 'xAxis']: xType === 'time' ? i.noteSpans[n].to : categories[i.noteSpans[n].to] }]),
  ];
  // A segment label is hidden (ECharts' label layout has no hide switch: a zero font size draws nothing) when ECharts' own resolved boxes say it does not fit (width and height).
  // With `minMax` on there are no segment labels at all: a 최소/최대 chip and a number would compete for the same row, and the chip is the emphasis (D7).
  const segmentLayout = (p: { labelRect: LabelRect; rect: LabelRect }) => (labelFitsSegment(p.labelRect, p.rect) ? {} : YIELDED);
  // The totals ride on an invisible scatter series: lanes put them at the lane span (one fixed column), a plain bar at its own end.
  function totalSeries(totals: ReadonlyMap<string, RowTotal>) {
    const missingText = (t: RowTotal) => formatText(COMPONENTS_MESSAGES.chartMissingTotal, lang, { items: t.missing.join(', ') });
    return {
      id: '__total', type: 'scatter', silent: false, animation: false, z: 4,
      // ECharts draws no label for a symbol of `none`, so the anchor is a 1px transparent dot.
      symbol: 'circle', symbolSize: 1, itemStyle: { color: 'transparent', opacity: 1 },
      // The tooltip renderer is picked once from the global tooltip model (a series-level `renderMode` is ignored) and HTML mode sets a formatter's string as innerHTML.
      // The tip carries series names from server data, so the formatter escapes them (#1879).
      tooltip: { trigger: 'item', formatter: (p: { data?: { tip?: string } }) => escapeHtml(p.data?.tip ?? '') },
      label: { show: true, position: 'right', fontSize: 11, fontWeight: 'bold', color: palette.totalText },
      data: categories.flatMap(x => {
        const t = totals.get(x);
        if (!t) return [];
        const text = textOf(x, t);
        // Only a row whose last stacked series carries the chip (its min or max) moves; the other rows keep the bar-end gap.
        const offset = [TOTAL_GAP + (!lanes && chips && chipAtEnd(x) ? CHIP_SHIFT : 0) + (t.partial ? PARTIAL_MARKER : 0), 0];
        return [{
          value: [lanes ? lanes.span : stackEnd(i.displayed, x), x],
          ...(t.partial ? {
            symbol: 'diamond', symbolSize: PARTIAL_MARKER, itemStyle: { color: 'transparent', borderColor: palette.totalText, borderWidth: 1.5 },
            tip: missingText(t), label: { show: true, position: 'right', offset, formatter: `≥ ${text}`, fontWeight: 'normal', fontStyle: 'italic' },
          } : { tooltip: { show: false }, label: { show: true, position: 'right', offset, formatter: text } }),
        }];
      }),
    };
  }
  type TooltipPoint = { seriesId?: string; name?: string; dataIndex?: number; value?: unknown };
  function rowTooltip(params: TooltipPoint[] | TooltipPoint) {
    const items = Array.isArray(params) ? params : [params];
    let category: string | undefined;
    const rows = items.flatMap(p => {
      if (p.seriesId === CATEGORY_MARK_SERIES && Array.isArray(p.value) && typeof p.value[1] === 'string') {
        category ??= p.value[1];
        return [];
      }
      const s = i.displayed.find(series => series.id === p.seriesId);
      const point = s?.points[p.dataIndex ?? s.points.findIndex(([x]) => x === p.name)];
      if (!s || !point) return [];
      const [x, y] = point;
      category ??= x;
      const axis = i.rightAxis && s.axis === 'right' ? i.rightAxis : i;
      const value = y === null ? emptyLabels?.get(x) ?? unknownLabel(lang) : `${axis.valueFormat(y)} ${s.unit?.trim() || axis.unit}`;
      const group = groups ? `${groups.header}: ${groups.byCategory.get(x)?.group ?? ''} · ` : '';
      const text = `${group}${rowLabel(groups, x)} · ${s.name}: ${value}`;
      const status = statuses.get(chartPointKey({ seriesId: s.id, x }));
      const bound = bounds && !i.previousIds.has(s.id) ? ` · ${boundText(bounds, x, i.valueFormat)}` : '';
      return [escapeHtml(`${text}${status ? ` · ${statusText(status)}` : ''}${bound}`)];
    });
    const mark = category === undefined ? undefined : categoryMarks?.byCategory.get(category);
    if (categoryMarks && mark !== undefined) rows.push(escapeHtml(`${categoryMarks.label}: ${i.valueFormat(mark)} ${i.unit}`));
    return rows.join('<br/>');
  }
  const fitY = i.yFit && !horizontal && i.displayed.every(series => (series.kind ?? 'line') === 'line');
  /** The only shown series is a solid line: it gets a light area (#2725). */
  const areaLine = !horizontal && i.displayed.length === 1 && (i.displayed[0].kind ?? 'line') === 'line' && linePattern(i.displayed[0], i.previousIds.has(i.displayed[0].id)) === 'solid';
  /** Value labels inside a bar piece: the text token that reads on that fill, on a surface chip when the fill is outside the checked set. */
  const insideLabel = (n: number) => ({ color: palette.segmentText[n].color, ...(palette.segmentText[n].chip ? { backgroundColor: palette.labelSurface, borderRadius: 2, padding: 0 } : {}) });
  const valueAxis = { type: 'value', ...(fitY ? { scale: true } : { min: 0 }), name: i.unit, nameTextStyle: { align: 'right' }, splitLine: theme.splitLine,
    ...(bounds?.extent ? { min: (extent: { min: number }) => Math.min(fitY ? extent.min : 0, extent.min, bounds.extent!.min), max: (extent: { max: number }) => Math.max(extent.max, bounds.extent!.max) } : {}),
  };
  return {
    // Row-pitch mode: no containLabel, so the category band is exactly height - top - bottom = rows × pitch and row i starts at top + i × pitch (the reveal maths relies on it).
    grid: groupLayout ? { left: groupLayout.gutter, right: gridRight, top: GRID_TOP, bottom: GRID_BOTTOM, containLabel: false } : horizontal && i.rowPitch !== undefined ? { left: rowGutter, right: gridRight, top: GRID_TOP, bottom: GRID_BOTTOM, containLabel: false }
      : { left: 52, right: gridRight, top: GRID_TOP, bottom: GRID_BOTTOM, ...(horizontal ? { containLabel: true } : {}) },
    ...(fitY && i.axisBreak ? { graphic: [axisBreakGraphic(i.axisBreak, { left: 52, top: GRID_TOP, bottom: GRID_BOTTOM }, { line: theme.axisLine.lineStyle.color, surface: palette.labelSurface })] } : {}),
    tooltip: {
      trigger: 'axis', confine: true, textStyle: { fontSize: 12 },
      ...(groups || statuses.size || bounds || categoryMarks || emptyLabels?.size ? { formatter: rowTooltip } : {}),
      valueFormatter: (v: number | null) => (v === null || v === undefined ? unknownLabel(lang) : `${i.valueFormat(v)} ${i.unit}`),
    },
    // Lane mode: ticks sit at scale intervals and cannot mark lane starts, so the numbers and the unit go; lane names are drawn by the overlay's markLine.
    xAxis: lanes ? { type: 'value', min: 0, max: lanes.span || undefined, axisLabel: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
      : horizontal ? { type: 'value', min: horizontalMin, name: i.unit, splitLine: theme.splitLine, ...valueAxisTicks } : xType === 'time'
      ? { type: 'time', axisLine: theme.axisLine, splitLine: { show: false }, ...timeAxisTicks(i.displayed, i.zoom, plotWidth) }
      : { type: 'category', data: categories, axisLine: theme.axisLine, axisTick: { alignWithLabel: true } },
    yAxis: horizontal ? { type: 'category', data: categories, inverse: true, axisLine: theme.axisLine, axisLabel: { interval: i.rowPitch !== undefined ? 0 : 'auto', ...(i.rowPitch !== undefined ? { width: rowGutter - 12, overflow: 'truncate', ellipsis: '…' } : {}), ...(groups ? { formatter: (v: string) => (v === active ? `{active|${rowLabel(groups, v)}}` : rowLabel(groups, v)), width: groupLayout!.rowWidth - 12, overflow: 'truncate', rich: { active: { fontWeight: 'bold', color: theme.axisLabel.color } } } : active ? { formatter: (v: string) => (v === active ? `{active|${v}}` : v), rich: { active: { fontWeight: 'bold', color: theme.axisLabel.color } } } : {}) }, axisTick: { alignWithLabel: true } } : i.rightAxis ? [valueAxis, rightValueAxis(i.rightAxis)] : valueAxis,
    // Row-pitch mode: the inner scroller is the only viewport. A dataZoom window on top would make the selection summary, Brush and export ambiguous (ADR-0079).
    dataZoom: horizontal && i.rowPitch !== undefined ? [] : [{ type: 'inside', ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }), ...(groups ? { filterMode: 'weakFilter' } : {}), start: i.zoom[0], end: i.zoom[1], zoomOnMouseWheel: 'shift', moveOnMouseMove: !i.brushMode }],
    // Selection and annotation fills keep echarts-native opacity.
    brush: { ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }), brushType: horizontal ? 'lineY' : 'lineX', brushMode: 'single', throttleType: 'debounce', throttleDelay: 120,
      brushStyle: { color: palette.brushFill, borderColor: palette.brushBorder } },
    toolbox: { show: false, feature: { brush: { type: [horizontal ? 'lineY' : 'lineX', 'clear'] } } },
    series: [
      ...i.displayed.flatMap((s, n) => {
        const kind = horizontal ? 'bar' : s.kind ?? 'line';
        const color = kind === 'line' ? palette.series[n].stroke : palette.series[n].fill;
        const pattern = linePattern(s, i.previousIds.has(s.id));
        const extreme = horizontal ? i.extremes?.get(s.id) : undefined;
        const right = i.rightAxis && s.axis === 'right' ? i.rightAxis : null;
        const axis = right ?? i;
        const unit = s.unit?.trim() || axis.unit;
        const datum = (x: string, y: number | null) => {
          const isActive = active !== null && x === active;
          const mark = extreme?.min.x === x ? 'min' : extreme?.max.x === x ? 'max' : null;
          const status = kind === 'bar' ? statuses.get(chartPointKey({ seriesId: s.id, x })) : undefined;
          const label = y !== null && selectedPoints.has(chartPointKey({ seriesId: s.id, x }))
            ? { show: true, position: horizontal ? 'insideRight' : 'top', ...(horizontal ? insideLabel(n) : {}), formatter: () => `${axis.valueFormat(y)} ${unit}`.trim() }
            : undefined;
          if (!isActive && !mark && !status) return label ? { value: y, label } : y;
          // Row focus keeps its series-coloured border; a min/max segment's thicker outline replaces it, so the active one adds a glow instead and both cues show.
          if (status) {
            // The status ring is drawn inside the piece by the __statusBarBacking layer (#2351). The active label stays bold; Min/Max retains its glow and chip.
            const marker = statusMarker(status);
            const extremeChip = mark ? extremeLabel(mark, lanes !== null, palette, lang) : undefined;
            return { value: y, itemStyle: { color: palette.series[n].fill, borderWidth: 0, ...(mark ? { shadowBlur: 6, shadowColor: palette.minMax[mark] } : {}) },
              label: { ...extremeChip, ...marker, position: extremeChip?.position ?? 'insideRight', formatter: `${marker.formatter}${mark ? ` ${extremeName(mark, lang)}` : ''}`, rich: marker.rich },
            };
          }
          return { value: y, itemStyle: {
            color: palette.series[n].fill,
            borderColor: mark ? palette.minMax[mark] : palette.series[n].stroke, borderWidth: mark ? 3 : 2,
            ...(mark && isActive ? { shadowBlur: 6, shadowColor: palette.series[n].stroke } : {}),
          }, ...(mark ? { label: extremeLabel(mark, lanes !== null, palette, lang) } : label ? { label } : {}) };
        };
        const real = {
          id: s.id, name: s.name, type: kind, stack: i.stacked && kind === 'bar' ? 'total' : undefined,
          // Over 12 points they show on hover only; a series with a selected point keeps them, since its label rides on the symbol.
          showSymbol: i.selectedPointKeys !== undefined && (lineSymbolShown(s.points.length) || s.points.some(([x]) => selectedPoints.has(chartPointKey({ seriesId: s.id, x })))), symbolSize: 5, connectNulls: false,
          ...(kind === 'line' && s.step ? { step: s.step } : {}),
          lineStyle: { ...(kind === 'line' ? { color } : {}), width: pattern === 'solid' ? CHART_MARKS.lineWidth : CHART_MARKS.patternLineWidth, type: pattern },
          itemStyle: { color: palette.series[n].fill, ...(kind === 'bar' ? { borderRadius: barRadius(horizontal, i.stacked || lanes !== null) } : {}) },
          ...(areaLine ? { areaStyle: { opacity: CHART_MARKS.singleLineAreaOpacity } } : {}),
          emphasis: { focus: i.emphasisFocus ?? 'none' },
          // The tooltip's own formatter is the left axis'; a right series reads its unit and format.
          ...(right ? { yAxisIndex: 1 } : {}),
          ...(right || s.unit?.trim() ? { tooltip: { valueFormatter: (v: number | null) => (v === null || v === undefined ? unknownLabel(lang) : `${axis.valueFormat(v)} ${unit}`) } } : {}),
          ...(segments && kind === 'bar' ? {
            label: { show: true, position: 'inside', fontSize: LABEL_FONT, ...insideLabel(n), formatter: (p: { value: unknown }) => (typeof p.value === 'number' ? shortNumber(p.value, lang) : '') },
            labelLayout: (p: { dataIndex: number; labelRect: LabelRect; rect: LabelRect }) => statuses.has(chartPointKey({ seriesId: s.id, x: s.points[p.dataIndex]?.[0] })) ? {} : segmentLayout(p),
          } : {}),
          data: xType === 'time' ? s.points.map(([x, y]) => { const point = datum(x, y); return typeof point === 'object' && point !== null ? { ...point, value: [toMs(x), y] } : [toMs(x), y]; }) : s.points.map(([x, y]) => datum(x, y)),
        };
        // Transparent, silent, no emphasis and out of the axis tooltip (`tooltip.show === false`, ECharts 6): it only pushes the next piece to its lane start.
        const spacer = lanes && n > 0 ? [{
          id: `__spacer-${n}`, type: 'bar', stack: 'total', silent: true, tooltip: { show: false }, emphasis: { disabled: true },
          itemStyle: { color: 'transparent', opacity: 1 }, data: lanes.spacers[n - 1],
        }] : [];
        return [...spacer, real];
      }),
      ...barStatusBackingSeries(i, statuses, lanes),
      ...lineStatusSeries(i, statuses),
      ...(bounds ? boundSeries(bounds, palette) : []),
      ...(totalTexts ? [totalSeries(totalTexts)] : []),
      ...(categoryMarks?.byCategory.size ? [{
        id: CATEGORY_MARK_SERIES, type: 'scatter', name: categoryMarks.label, silent: true, animation: false, z: 5,
        symbol: 'diamond', symbolSize: CATEGORY_MARK_SIZE, itemStyle: { color: palette.totalText, borderColor: palette.labelSurface, borderWidth: 1, opacity: 1 },
        data: [...categoryMarks.byCategory].map(([category, value]) => [value, category]),
      }] : []),
      ...(emptyLabels?.size ? [emptyCategorySeries(categories, emptyLabels, theme.axisLabel.color)] : []),
      ...(groupLayout ? [rowGroupSeries(groupLayout, theme.axisLabel.color, theme.separator)] : []),
      {
        id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
        markArea: { silent: true, data: areas },
        markLine: lanes ? laneMarkLine(lanes, theme, i.chartWidth - (groupLayout?.gutter ?? (i.rowPitch !== undefined ? rowGutter : 52)) - gridRight)
          : i.markLines?.length ? { ...theme.referenceLine, data: i.markLines.map(m => ({ name: m.label, [horizontal ? 'xAxis' : 'yAxis']: m.y })) } : undefined,
      },
    ],
  };
}

/** The right value axis: its own scale from 0, no grid lines (the left axis owns them), its unit above the labels. */
function rightValueAxis(right: { unit: string }) {
  return { type: 'value', min: 0, position: 'right', name: right.unit, nameTextStyle: { align: 'left' }, splitLine: { show: false } };
}

function extremeName(mark: 'min' | 'max', lang: Lang) {
  return formatText(mark === 'min' ? COMPONENTS_MESSAGES.chartMin : COMPONENTS_MESSAGES.chartMax, lang);
}

/**
 * The 최소/최대 label chip: the surface colour behind the text and a border in the emphasis colour, so it reads on any fill.
 * In lane mode a max segment fills its whole lane, so its label sits inside the right end; every other label stays outside to the right.
 */
function extremeLabel(mark: 'min' | 'max', lanes: boolean, palette: ChartPalette, lang: Lang) {
  const name = extremeName(mark, lang);
  return {
    show: true, position: lanes && mark === 'max' ? 'insideRight' : 'right', formatter: name, fontSize: 10, fontWeight: 'bold', color: palette.minMax[mark],
    backgroundColor: palette.labelSurface, borderColor: palette.minMax[mark], borderWidth: 1, borderRadius: 2, padding: [1, 3],
  };
}

/** A separator at every lane start with the series name under the plot, cut to its lane's pixel width. Reference markLines are ignored in lane mode: x is no longer one value scale. */
function laneMarkLine(lanes: LaneLayout, theme: ReturnType<typeof chartTheme>, plotWidth: number) {
  if (lanes.span <= 0) return undefined;
  const pxPerUnit = Math.max(0, plotWidth) / lanes.span;
  return {
    silent: true, symbol: 'none', animation: false,
    lineStyle: { color: theme.separator, type: 'dotted', width: 1 },
    data: lanes.lanes.map(lane => ({
      name: lane.name, xAxis: lane.start,
      label: { show: true, formatter: lane.name, position: 'start', align: 'left', fontSize: 10, color: theme.axisLabel.color, width: Math.max(MIN_LANE_LABEL_PX, lane.width * pxPerUnit), overflow: 'truncate', ellipsis: '…' },
    })),
  };
}
