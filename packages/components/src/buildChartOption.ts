import type { EChartsCoreOption } from 'echarts/core';
import type { ThemeColorToken } from '@ap/ui/theme';
import { chartTheme, strokeToken, token } from './EChart';
import { noteLabelWidths } from './annotationLayout';
import { GRID_BOTTOM, GRID_TOP, ROW_LABEL_GUTTER } from './analysisChartGeometry';
import { toMs, unknownLabel } from './analysisChartShared';
import type { ChartSeries } from './AnalysisChartFrame';
import type { Selection } from './useChartRange';
import { laneLayout, type LaneLayout, type SeriesExtremes } from './chartLanes';

/** The plot's horizontal margin (grid left 52 + right 20). */
export const PLOT_MARGIN = 72;
/** One note-label row at fontSize 10. */
const NOTE_LABEL_ROW = 12;
/** Smallest pixel budget of a lane name: a zero-width lane would otherwise be truncated to nothing. */
const MIN_LANE_LABEL_PX = 40;
/** Right grid room reserved for a 최소/최대 label chip beyond the last segment (row-pitch mode keeps its own 20). */
const MIN_MAX_LABEL_ROOM = 44;

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
  };
}

export type ChartOptionInput = {
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
};

export function buildChartOption(i: ChartOptionInput): EChartsCoreOption {
  const { horizontal, xType, categories, palette, lang } = i;
  const theme = palette.theme;
  const active = horizontal ? i.activeCategory ?? null : null;
  const lanes = horizontal && i.startAlign && i.stacked ? laneLayout(i.displayed, categories) : null;
  const gridRight = i.extremes?.size && horizontal ? MIN_MAX_LABEL_ROOM : 20;
  const xValue = (x: string) => (xType === 'time' ? toMs(x) : x);
  // Pixels per axis unit from the plot width and the zoom window, so a label can be cut to its own area (#399 AC-2).
  const plotWidth = Math.max(0, i.chartWidth - PLOT_MARGIN);
  const zoomed = Math.max((i.zoom[1] - i.zoom[0]) / 100, 0.01);
  const units = xType === 'time' ? i.timeExtent : categories.length;
  const pxPerUnit = units > 0 ? plotWidth / (units * zoomed) : 0;
  const noteWidths = noteLabelWidths(i.noteSpans, pxPerUnit, plotWidth);
  const areas = [
    // Notes keep the default top label; the selection labels its bottom so a note saved over it never collides (#320).
    ...(i.selection ? [[{ name: lang === 'ko' ? '선택' : 'Selection', [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.from), itemStyle: { color: palette.selection, opacity: 0.12 }, label: { position: 'insideBottom' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(i.selection.to) }]] : []),
    ...i.annotations.map((a, n) => [{ name: a.text, [horizontal ? 'yAxis' : 'xAxis']: xValue(a.from), itemStyle: { color: palette.annotation, opacity: 0.14 }, label: { color: palette.annotationLabel, fontSize: 10, offset: [0, i.noteLevels[n] * NOTE_LABEL_ROW], width: noteWidths[n], overflow: 'truncate', ellipsis: '…' } }, { [horizontal ? 'yAxis' : 'xAxis']: xValue(a.to) }]),
  ];
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
      : horizontal ? { type: 'value', min: 0, name: i.unit, splitLine: theme.splitLine } : xType === 'time'
      ? { type: 'time', axisLine: theme.axisLine, axisLabel: { hideOverlap: true }, splitLine: { show: false } }
      : { type: 'category', data: categories, axisLine: theme.axisLine, axisTick: { alignWithLabel: true } },
    yAxis: horizontal ? { type: 'category', data: categories, inverse: true, axisLine: theme.axisLine, axisLabel: { interval: 0, ...(i.rowPitch !== undefined ? { width: ROW_LABEL_GUTTER - 12, overflow: 'truncate', ellipsis: '…' } : {}), ...(active ? { formatter: (v: string) => (v === active ? `{active|${v}}` : v), rich: { active: { fontWeight: 'bold', color: theme.axisLabel.color } } } : {}) }, axisTick: { alignWithLabel: true } } : { type: 'value', min: 0, name: i.unit, nameTextStyle: { align: 'right' }, splitLine: theme.splitLine },
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
          emphasis: { focus: 'series' },
          data: xType === 'time' ? s.points.map(([x, y]) => [toMs(x), y]) : s.points.map(([x, y]) => datum(x, y)),
        };
        // Transparent, silent, no emphasis and out of the axis tooltip (`tooltip.show === false`, ECharts 6): it only pushes the next piece to its lane start.
        const spacer = lanes && n > 0 ? [{
          id: `__spacer-${n}`, type: 'bar', stack: 'total', silent: true, tooltip: { show: false }, emphasis: { disabled: true }, barMaxWidth: 18,
          itemStyle: { color: 'transparent' }, data: lanes.spacers[n - 1],
        }] : [];
        return [...spacer, real];
      }),
      {
        id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
        markArea: { silent: true, data: areas },
        markLine: lanes ? laneMarkLine(lanes, theme, i.chartWidth - (i.rowPitch !== undefined ? ROW_LABEL_GUTTER + gridRight : 52 + gridRight))
          : i.markLines?.length ? { ...theme.referenceLine, data: i.markLines.map(m => ({ name: m.label, [horizontal ? 'xAxis' : 'yAxis']: m.y })) } : undefined,
      },
    ],
  };
}

/**
 * The 최소/최대 label chip: the surface colour behind the text and a border in the emphasis colour, so it reads on any fill.
 * In lane mode a max segment fills its whole lane, so its label sits inside the right end; every other label stays outside to the right.
 */
function extremeLabel(mark: 'min' | 'max', lanes: boolean, palette: ChartPalette, lang: string) {
  const name = mark === 'min' ? (lang === 'ko' ? '최소' : 'Min') : (lang === 'ko' ? '최대' : 'Max');
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
