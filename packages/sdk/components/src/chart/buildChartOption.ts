import type { EChartsCoreOption } from 'echarts/core';
import type { ThemeColorToken } from '@ap/ui/theme';
import { chartTheme, strokeToken, token } from './EChart';
import { noteLabelWidths } from './annotationLayout';
import { GRID_BOTTOM, GRID_TOP, ROW_LABEL_GUTTER } from './analysisChartGeometry';
import { toMs, unknownLabel } from './analysisChartShared';
import type { ChartSeries } from './AnalysisChartFrame';
import type { Selection } from './useChartRange';
import { laneLayout, type LaneLayout, type SeriesExtremes } from './chartLanes';
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
/** Value-axis tick spacing floor in px and ECharts' default tick count (`splitNumber`); only a plot narrower than the former times the latter gets fewer ticks. */
const MIN_TICK_PITCH = 64;
const DEFAULT_TICKS = 5;
const PARTIAL_MARKER = 8;
/** Upper bound of the category-label allowance in a `containLabel` horizontal grid. */
const MAX_CATEGORY_ROOM = 160;

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
  unit: string;
  lang: string;
  stacked: boolean | undefined;
  palette: ChartPalette;
  /** Stable and live: the tooltip calls it when it opens, so a consumer's new `valueFormat` never rebuilds the option. */
  valueFormat: (v: number) => string;
  /** Horizontal only. Set = row-pitch viewport: the frame scrolls the plot, so category zoom is off (one viewport model, 06 §16). */
  rowPitch?: number;
  /** Horizontal only. The controlled row highlight: a border on that row's bars and a bold category label. */
  activeCategory?: string | null;
  /** Horizontal stacked only. Each series' piece starts at its own lane's left edge; the value axis shows lane names instead of numbers. */
  startAlign?: boolean;
  /** Horizontal only. Per series id, the rows to outline as minimum and maximum (see `seriesExtremes`). */
  extremes?: ReadonlyMap<string, SeriesExtremes>;
  /** Horizontal stacked only; absent = no value labels and the option is unchanged. */
  valueLabels?: ValueLabels;
  /** Per category total to draw (`resolveRowTotals`); only read when `valueLabels` includes `total`. */
  totals?: ReadonlyMap<string, RowTotal>;
  /** Each total's text under the render's own formatter: the text and the grid room are built from it, not from the lazy `valueFormat`. */
  totalText?: ReadonlyMap<string, string>;
};

/** What a label that does not fit lays out as: ECharts has no hide switch for a layout callback, so the label collapses to nothing. */
const YIELDED = { fontSize: 0, width: 0, height: 0 };

export function buildChartOption(i: ChartOptionInput): EChartsCoreOption {
  const { horizontal, xType, categories, palette, lang } = i;
  const theme = palette.theme;
  const active = horizontal ? i.activeCategory ?? null : null;
  const lanes = horizontal && i.startAlign && i.stacked ? laneLayout(i.displayed, categories) : null;
  const chips = !!i.extremes?.size && horizontal;
  const segments = !chips && horizontal && !!i.stacked && i.displayed.length > 1 && (i.valueLabels === 'segment' || i.valueLabels === 'both');
  const totalTexts = horizontal && !!i.stacked && (i.valueLabels === 'total' || i.valueLabels === 'both') && i.totals?.size ? i.totals : null;
  // Room for the widest total (plus the partial marker); a plain stacked bar shifts it clear of a 최소/최대 chip, lanes keep one fixed column.
  const textOf = (x: string, t: RowTotal) => i.totalText?.get(x) ?? i.valueFormat(t.value);
  const totalRoom = totalTexts ? Math.max(...[...totalTexts].map(([x, t]) => labelWidth(`≥ ${textOf(x, t)}`))) + TOTAL_GAP + PARTIAL_MARKER : 0;
  const gridRight = (chips ? MIN_MAX_LABEL_ROOM : 20) + totalRoom;
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
  // Pixels per axis unit from the plot width and the zoom window, so a label can be cut to its own area (#399 AC-2).
  const plotWidth = Math.max(0, i.chartWidth - PLOT_MARGIN);
  const zoomed = Math.max((i.zoom[1] - i.zoom[0]) / 100, 0.01);
  const units = xType === 'time' ? i.timeExtent : categories.length;
  const pxPerUnit = units > 0 ? plotWidth / (units * zoomed) : 0;
  // A narrow plot (a 400px drawer) cannot hold five numeric ticks: fewer ticks, and any that still touch are dropped; a wide plot keeps ECharts' defaults instead of printing `1,0002,000`.
  // Without rowPitch the grid is `containLabel`, so the category labels also eat plot width; their real width is unknown here, so the longest category is estimated (capped) and taken off.
  const categoryRoom = i.rowPitch !== undefined ? ROW_LABEL_GUTTER : 52 + Math.min(MAX_CATEGORY_ROOM, Math.max(0, ...categories.map(labelWidth)));
  const gridPlotWidth = (i.tickRoom ?? i.chartWidth) - categoryRoom - gridRight;
  const tickCount = Math.floor(gridPlotWidth / MIN_TICK_PITCH);
  const valueAxisTicks = tickCount < DEFAULT_TICKS ? { splitNumber: Math.max(1, tickCount), axisLabel: { hideOverlap: true } } : {};
  const noteWidths = noteLabelWidths(i.noteSpans, pxPerUnit, plotWidth);
  const areas = [
    // Notes keep the default top label; the selection labels its bottom so a note saved over it never collides (#320).
    ...(i.selection ? [[{ name: lang === 'ko' ? '선택' : 'Selection', [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.from), itemStyle: { color: palette.selection, opacity: 0.12 }, label: { position: 'insideBottom' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.to) }]] : []),
    ...i.annotations.map((a, n) => [{ name: a.text, [horizontal ? 'yAxis' : 'xAxis']: xValue(a.from), itemStyle: { color: palette.annotation, opacity: 0.14 }, label: { color: palette.annotationLabel, fontSize: 10, offset: [0, i.noteLevels[n] * NOTE_LABEL_ROW], width: noteWidths[n], overflow: 'truncate', ellipsis: '…' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(a.to) }]),
  ];
  // A segment label is hidden (ECharts' label layout has no hide switch: a zero font size draws nothing) when ECharts' own resolved boxes say it does not fit (width and height).
  // With `minMax` on there are no segment labels at all: a 최소/최대 chip and a number would compete for the same row, and the chip is the emphasis (D7).
  const segmentLayout = (p: { labelRect: LabelRect; rect: LabelRect }) => (labelFitsSegment(p.labelRect, p.rect) ? {} : YIELDED);
  // The totals ride on an invisible scatter series: lanes put them at the lane span (one fixed column), a plain bar at its own end.
  function totalSeries(totals: ReadonlyMap<string, RowTotal>) {
    const missingText = (t: RowTotal) => `${t.missing.join(', ')} ${lang === 'ko' ? '미측정' : 'not measured'}`;
    return {
      id: '__total', type: 'scatter', silent: false, animation: false, z: 4,
      // ECharts draws no label for a symbol of `none`, so the anchor is a 1px transparent dot.
      symbol: 'circle', symbolSize: 1, itemStyle: { color: 'transparent', opacity: 1 },
      tooltip: { trigger: 'item', formatter: (p: { data?: { tip?: string } }) => p.data?.tip ?? '' },
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
  return {
    // Row-pitch mode: no containLabel, so the category band is exactly height - top - bottom = rows × pitch and row i starts at top + i × pitch (the reveal maths relies on it).
    grid: horizontal && i.rowPitch !== undefined ? { left: ROW_LABEL_GUTTER, right: gridRight, top: GRID_TOP, bottom: GRID_BOTTOM, containLabel: false }
      : { left: 52, right: gridRight, top: GRID_TOP, bottom: GRID_BOTTOM, ...(horizontal ? { containLabel: true } : {}) },
    tooltip: {
      trigger: 'axis', confine: true, textStyle: { fontSize: 12 },
      valueFormatter: (v: number | null) => (v === null || v === undefined ? unknownLabel(lang === 'ko') : `${i.valueFormat(v)} ${i.unit}`),
    },
    // Lane mode: ticks sit at scale intervals and cannot mark lane starts, so the numbers and the unit go; lane names are drawn by the overlay's markLine.
    xAxis: lanes ? { type: 'value', min: 0, max: lanes.span || undefined, axisLabel: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
      : horizontal ? { type: 'value', min: 0, name: i.unit, splitLine: theme.splitLine, ...valueAxisTicks } : xType === 'time'
      ? { type: 'time', axisLine: theme.axisLine, axisLabel: { hideOverlap: true }, splitLine: { show: false } }
      : { type: 'category', data: categories, axisLine: theme.axisLine, axisTick: { alignWithLabel: true } },
    yAxis: horizontal ? { type: 'category', data: categories, inverse: true, axisLine: theme.axisLine, axisLabel: { interval: i.rowPitch !== undefined ? 0 : 'auto', ...(i.rowPitch !== undefined ? { width: ROW_LABEL_GUTTER - 12, overflow: 'truncate', ellipsis: '…' } : {}), ...(active ? { formatter: (v: string) => (v === active ? `{active|${v}}` : v), rich: { active: { fontWeight: 'bold', color: theme.axisLabel.color } } } : {}) }, axisTick: { alignWithLabel: true } } : { type: 'value', min: 0, name: i.unit, nameTextStyle: { align: 'right' }, splitLine: theme.splitLine },
    // Row-pitch mode: the inner scroller is the only viewport. A dataZoom window on top would make the selection summary, Brush and export ambiguous (ADR-0079).
    dataZoom: horizontal && i.rowPitch !== undefined ? [] : [{ type: 'inside', ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }), start: i.zoom[0], end: i.zoom[1], zoomOnMouseWheel: 'shift', moveOnMouseMove: !i.brushMode }],
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
        const datum = (x: string, y: number | null) => {
          const isActive = active !== null && x === active;
          const mark = extreme?.min.x === x ? 'min' : extreme?.max.x === x ? 'max' : null;
          if (!isActive && !mark) return y;
          // Row focus keeps its series-coloured border; a min/max segment's thicker outline replaces it, so the active one adds a glow instead and both cues show.
          return { value: y, itemStyle: {
            color: palette.series[n].fill,
            borderColor: mark ? palette.minMax[mark] : palette.series[n].stroke, borderWidth: mark ? 3 : 2,
            ...(mark && isActive ? { shadowBlur: 6, shadowColor: palette.series[n].stroke } : {}),
          }, ...(mark ? { label: extremeLabel(mark, lanes !== null, palette, lang) } : {}) };
        };
        const real = {
          id: s.id, name: s.name, type: kind, stack: i.stacked && kind === 'bar' ? 'total' : undefined,
          showSymbol: false, symbolSize: 5, connectNulls: false, barMaxWidth: 18,
          lineStyle: { ...(kind === 'line' ? { color } : {}), width: 2, type: pattern }, itemStyle: { color: palette.series[n].fill },
          emphasis: { focus: i.emphasisFocus ?? 'series' },
          ...(segments && kind === 'bar' ? {
            label: { show: true, position: 'inside', fontSize: LABEL_FONT, color: palette.segmentText[n].color, ...(palette.segmentText[n].chip ? { backgroundColor: palette.labelSurface, borderRadius: 2, padding: 0 } : {}), formatter: (p: { value: unknown }) => (typeof p.value === 'number' ? shortNumber(p.value, lang) : '') },
            labelLayout: segmentLayout,
          } : {}),
          data: xType === 'time' ? s.points.map(([x, y]) => [toMs(x), y]) : s.points.map(([x, y]) => datum(x, y)),
        };
        // Transparent, silent, no emphasis and out of the axis tooltip (`tooltip.show === false`, ECharts 6): it only pushes the next piece to its lane start.
        const spacer = lanes && n > 0 ? [{
          id: `__spacer-${n}`, type: 'bar', stack: 'total', silent: true, tooltip: { show: false }, emphasis: { disabled: true }, barMaxWidth: 18,
          itemStyle: { color: 'transparent', opacity: 1 }, data: lanes.spacers[n - 1],
        }] : [];
        return [...spacer, real];
      }),
      ...(totalTexts ? [totalSeries(totalTexts)] : []),
      {
        id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
        markArea: { silent: true, data: areas },
        markLine: lanes ? laneMarkLine(lanes, theme, i.chartWidth - (i.rowPitch !== undefined ? ROW_LABEL_GUTTER + gridRight : 52 + gridRight))
          : i.markLines?.length ? { ...theme.referenceLine, data: i.markLines.map(m => ({ name: m.label, [horizontal ? 'xAxis' : 'yAxis']: m.y })) } : undefined,
      },
    ],
  };
}

function extremeName(mark: 'min' | 'max', lang: string) {
  return mark === 'min' ? (lang === 'ko' ? '최소' : 'Min') : (lang === 'ko' ? '최대' : 'Max');
}

/**
 * The 최소/최대 label chip: the surface colour behind the text and a border in the emphasis colour, so it reads on any fill.
 * In lane mode a max segment fills its whole lane, so its label sits inside the right end; every other label stays outside to the right.
 */
function extremeLabel(mark: 'min' | 'max', lanes: boolean, palette: ChartPalette, lang: string) {
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
    lineStyle: { color: theme.axisLine.lineStyle.color, type: 'dotted', width: 1 },
    data: lanes.lanes.map(lane => ({
      name: lane.name, xAxis: lane.start,
      label: { show: true, formatter: lane.name, position: 'start', align: 'left', fontSize: 10, color: theme.axisLabel.color, width: Math.max(MIN_LANE_LABEL_PX, lane.width * pxPerUnit), overflow: 'truncate', ellipsis: '…' },
    })),
  };
}
