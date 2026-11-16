import type { ChartOptionInput } from '../buildChartOption';
import type { ChartPoint, ChartSeries } from '../AnalysisChartFrame';
import { pointStatuses, type ChartStatus } from '../chartStatus';
import { seriesExtremes } from '../chartLanes';

const ROWS = ['R1', 'R2', 'R3', 'R4'];
const bar = (id: string, values: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color: 'chart-blue', kind: 'bar', points: ROWS.map((x, n) => [x, values[n]]) });
const displayed = [bar('a', [800, 20, null, 600]), bar('b', [100, 0, 200, 400])];
/** A stacked horizontal chart with an active row, Min/Max and a reference line: the input whose option main's `buildChartOption` produced (`buildChartOption.main.json`). */
export type BaselineOverrides = Partial<ChartOptionInput> & { pointStatus?: (point: ChartPoint) => ChartStatus | undefined };
export const baselineInput = (extra: BaselineOverrides = {}): ChartOptionInput => {
  const { pointStatus, ...options } = extra;
  return ({
  displayed, previousIds: new Set(), xType: 'category', horizontal: true, categories: ROWS, zoom: [0, 100], brushMode: false, selection: null, annotations: [], noteSpans: [], noteLevels: [], timeExtent: 0,
  chartWidth: 600, markLines: [{ y: 300, label: '목표' }], unit: 's', lang: 'ko', stacked: true, valueFormat: v => `${v}`, rowPitch: 26, activeCategory: 'R2', extremes: seriesExtremes(displayed),
  palette: {
    theme: { axisLine: { lineStyle: { color: 'axisLine' } }, splitLine: { lineStyle: { color: 'splitLine' } }, axisLabel: { color: 'axisLabel' }, tooltip: { backgroundColor: 'b', borderColor: 'c', textStyle: { color: 't' } }, referenceLine: { silent: true, symbol: 'none', lineStyle: { color: 'ref', type: 'dashed' }, label: { formatter: '{b}', fontSize: 10, color: 'ref', position: 'insideEndTop' } } },
    selection: 'sel', annotation: 'ann', annotationLabel: 'annL', brushFill: 'bf', brushBorder: 'bb', minMax: { min: 'min', max: 'max' }, labelSurface: 'surface',
    series: [{ stroke: 'aStroke', fill: 'aFill' }, { stroke: 'bStroke', fill: 'bFill' }],
    // fields of this branch, absent from main's palette and unused while valueLabels is unset
    segmentText: [{ color: 'x', chip: false }, { color: 'y', chip: false }], totalText: 'tt',
  },
  ...options,
  statuses: options.statuses ?? pointStatuses(options.displayed ?? displayed, pointStatus),
}) as ChartOptionInput;
};

type StatusRingSeries = { id: string; data: unknown[][]; renderItem: (params: unknown, api: unknown) => { children: { ignore?: boolean; style: { stroke: string; lineWidth: number } }[] } };
/** The strokes the inset bar status layer draws for one piece (#2351): `[backing?, border]`, read from a 20×18px piece. */
export function barStatusRing(option: unknown, slot = 0, piece = 0) {
  const series = (option as { series: StatusRingSeries[] }).series.find(s => s.id === (slot ? `__statusBarBacking-${slot}` : '__statusBarBacking'));
  if (!series) return undefined;
  const row = series.data[piece];
  const api = { value: (d: number) => row[d], coord: ([a, b]: number[]) => [a * 20, b * 20], barLayout: () => [{ width: 18, offset: -9 }], size: () => [20, 20] };
  return series.renderItem({}, api).children.map(c => c.style);
}
