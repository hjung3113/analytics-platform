/**
 * Chart mark, axis and grid defaults (#2725): the one home of their numbers. `CHART_ECHARTS_THEME` is the ECharts theme every
 * `EChart` starts from, so `AnalysisChart`, `AnalysisChartFrame`, `topNBar` and a consumer's own option get the same defaults; an
 * option value still wins. Colours stay in the option (`chartTheme()`), resolved per build, so a theme switch needs no re-init.
 */
export const CHART_MARKS = {
  /** Chart text, axis labels and axis names. Values inside marks keep their own smaller size (`LABEL_FONT`). */
  fontSize: 12,
  barMaxWidth: 40,
  barCategoryGap: '35%',
  barGap: '12%',
  /** Corner radius at a bar's value end; stacked pieces stay square. */
  barRadius: 2,
  lineWidth: 2,
  /** Dashed and dotted lines (compare, previous period) stay lighter than the solid line. */
  patternLineWidth: 1.5,
  /** A line with more points than this draws them only on hover. */
  maxShownSymbols: 12,
  /** Area under the only solid line of a chart without bars. */
  singleLineAreaOpacity: 0.09,
  /** Hover (#2736): the hovered line widens by this much. Other series keep their look by default (#2342 owner decision). */
  hoverLineWidthGain: 1,
  /** Hover (#2736): the other series' opacity when a chart opts into dimming (`emphasisFocus: 'series'`), instead of ECharts' 0.1. */
  blurOpacity: 0.3,
  /** Selection (#2736): a selected mark keeps its own fill and gets a ring of this width in the selection colour. */
  selectionRingWidth: 1.5,
  /** Selection (#2736): a selected line point is a solid circle of this size (other points stay 5px hollow), so its ring shows. */
  selectedPointSize: 8,
  /** Range (#2736): fill opacity of a dragged or selected range band, in the selection colour, on every chart. */
  rangeBandOpacity: 0.1,
  /** Range (#2736): outline of a canvas chart's range band and LaneTimeline's selected segment, the confirmed range-brush look. */
  rangeOutlineWidth: 2,
} as const;

/**
 * Plot heights by size step, px (#2725). `regular` is the AnalysisChart kinds' default and `regularFrame` the time-series Frame's; both sit
 * in the 240–280 band. Row-based charts (topNBar, horizontal bars with `rowPitch`) grow by rows instead: `rowPitch` per row.
 */
export const CHART_HEIGHTS = { compact: 200, regularFrame: 260, regular: 280, hero: 360, fillMin: 320, rowPitch: 28 } as const;

/**
 * Break mark on a line chart whose value axis does not reach 0 (#2725): two short slashes across the end of the category baseline, on a
 * surface-coloured gap, so a fitted axis never reads as starting at 0. `side` is where the axis stops short of 0: `bottom` when every value
 * is above 0, `top` when every value is below. Silent: it takes no pointer events.
 */
export function axisBreakGraphic(side: 'bottom' | 'top', at: { left: number; top: number; bottom: number }, colors: { line: string; surface: string }) {
  const stroke = { stroke: colors.line, lineWidth: 1 };
  return {
    type: 'group', left: at.left - 5, ...(side === 'bottom' ? { bottom: at.bottom - 4 } : { top: at.top - 4 }), silent: true, z: 100,
    children: [
      { type: 'polygon', shape: { points: [[1, 8], [5, 0], [9, 0], [5, 8]] }, style: { fill: colors.surface } },
      { type: 'line', shape: { x1: 1, y1: 8, x2: 5, y2: 0 }, style: stroke },
      { type: 'line', shape: { x1: 5, y1: 8, x2: 9, y2: 0 }, style: stroke },
    ],
  };
}

/** Ring width of a mark: `selectionRingWidth` when selected, none otherwise. Pair it with the `chart-selection-outline` colour. */
export function selectionRing(selected: boolean): number {
  return selected ? CHART_MARKS.selectionRingWidth : 0;
}

/** The range band fill: a resolved `rgb(r,g,b)` colour at `rangeBandOpacity`. Another colour form is returned unchanged. */
export function rangeBandFill(color: string): string {
  return color.replace(/^rgb\((.+)\)$/, (_, rgb: string) => `rgba(${rgb},${CHART_MARKS.rangeBandOpacity})`);
}

/**
 * Canvas range band (LaneTimeline, OrderedIntervalPlot): `rangeBandOpacity` fill in `color` across the full plot height with a
 * `rangeOutlineWidth` outline inset by 1px, so the outline stays inside the canvas. The caller clips to the plot.
 */
export function paintRangeBand(ctx: CanvasRenderingContext2D, color: string, x0: number, x1: number, height: number): void {
  const alpha = ctx.globalAlpha;
  ctx.fillStyle = color; ctx.globalAlpha = CHART_MARKS.rangeBandOpacity; ctx.fillRect(x0, 0, x1 - x0, height); ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = CHART_MARKS.rangeOutlineWidth; ctx.strokeRect(x0, 1, x1 - x0, height - 2);
}

/** Rounded value end: top corners of a vertical bar, right corners of a horizontal one, none on a stacked piece. */
export function barRadius(horizontal: boolean, stacked = false): number | number[] {
  const r = CHART_MARKS.barRadius;
  if (stacked) return 0;
  return horizontal ? [0, r, r, 0] : [r, r, 0, 0];
}

/** Point symbols of a line: drawn while they stay countable, otherwise only on hover (a series with markPoints keeps them). */
export function lineSymbolShown(points: number, markPoints = false): boolean {
  return markPoints || points <= CHART_MARKS.maxShownSymbols;
}

const axisText = { axisLabel: { fontSize: CHART_MARKS.fontSize }, nameTextStyle: { fontSize: CHART_MARKS.fontSize } };
/** Category and time axes: the baseline stays (colour from the option), no ticks, no grid lines. */
const baseAxis = { ...axisText, axisTick: { show: false }, splitLine: { show: false } };
/** Value axes: no line and no ticks; their split lines are the only grid (horizontal on a vertical chart). */
const valueAxis = { ...axisText, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: true, lineStyle: { width: 1, type: 'solid' } } };

/** Dimmed look of the series a hover does not target; drawn only when a chart opts into `focus: 'series'`. */
const blur = { itemStyle: { opacity: CHART_MARKS.blurOpacity }, lineStyle: { opacity: CHART_MARKS.blurOpacity }, areaStyle: { opacity: CHART_MARKS.blurOpacity * CHART_MARKS.singleLineAreaOpacity }, label: { opacity: CHART_MARKS.blurOpacity } };

export const CHART_ECHARTS_THEME = {
  textStyle: { fontSize: CHART_MARKS.fontSize },
  categoryAxis: baseAxis,
  timeAxis: baseAxis,
  valueAxis,
  logAxis: valueAxis,
  bar: {
    barMaxWidth: CHART_MARKS.barMaxWidth, barCategoryGap: CHART_MARKS.barCategoryGap, barGap: CHART_MARKS.barGap,
    itemStyle: { borderRadius: barRadius(false) }, blur,
  },
  line: { lineStyle: { width: CHART_MARKS.lineWidth }, emphasis: { scale: true }, blur },
  scatter: { blur },
  pie: { blur },
  boxplot: { blur },
};
