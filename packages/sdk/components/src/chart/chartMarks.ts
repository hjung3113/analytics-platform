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
} as const;

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

export const CHART_ECHARTS_THEME = {
  textStyle: { fontSize: CHART_MARKS.fontSize },
  categoryAxis: baseAxis,
  timeAxis: baseAxis,
  valueAxis,
  logAxis: valueAxis,
  bar: {
    barMaxWidth: CHART_MARKS.barMaxWidth, barCategoryGap: CHART_MARKS.barCategoryGap, barGap: CHART_MARKS.barGap,
    itemStyle: { borderRadius: barRadius(false) },
  },
  line: { lineStyle: { width: CHART_MARKS.lineWidth }, emphasis: { scale: true } },
};
