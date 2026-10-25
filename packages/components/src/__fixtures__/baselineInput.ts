import type { ChartOptionInput } from '../buildChartOption';
import type { ChartSeries } from '../AnalysisChartFrame';
import { seriesExtremes } from '../chartLanes';

const ROWS = ['R1', 'R2', 'R3', 'R4'];
const bar = (id: string, values: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color: 'chart-blue', kind: 'bar', points: ROWS.map((x, n) => [x, values[n]]) });
const displayed = [bar('a', [800, 20, null, 600]), bar('b', [100, 0, 200, 400])];
/** A stacked horizontal chart with an active row, Min/Max and a reference line: the input whose option main's `buildChartOption` produced (`buildChartOption.main.json`). */
export const baselineInput = (extra: Partial<ChartOptionInput> = {}): ChartOptionInput => ({
  displayed, previousIds: new Set(), xType: 'category', horizontal: true, categories: ROWS, zoom: [0, 100], brushMode: false, selection: null, annotations: [], noteSpans: [], noteLevels: [], timeExtent: 0,
  chartWidth: 600, markLines: [{ y: 300, label: '목표' }], unit: 's', lang: 'ko', stacked: true, valueFormat: v => `${v}`, rowPitch: 26, activeCategory: 'R2', extremes: seriesExtremes(displayed),
  palette: {
    theme: { axisLine: { lineStyle: { color: 'axisLine' } }, splitLine: { lineStyle: { color: 'splitLine' } }, axisLabel: { color: 'axisLabel' }, tooltip: { backgroundColor: 'b', borderColor: 'c', textStyle: { color: 't' } }, referenceLine: { silent: true, symbol: 'none', lineStyle: { color: 'ref', type: 'dashed' }, label: { formatter: '{b}', fontSize: 10, color: 'ref', position: 'insideEndTop' } } },
    selection: 'sel', annotation: 'ann', annotationLabel: 'annL', brushFill: 'bf', brushBorder: 'bb', minMax: { min: 'min', max: 'max' }, labelSurface: 'surface',
    series: [{ stroke: 'aStroke', fill: 'aFill' }, { stroke: 'bStroke', fill: 'bFill' }],
    // fields of this branch, absent from main's palette and unused while valueLabels is unset
    segmentText: [{ color: 'x', chip: false }, { color: 'y', chip: false }], totalText: 'tt',
  },
  ...extra,
}) as ChartOptionInput;
