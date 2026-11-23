// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { CHART_ECHARTS_THEME, CHART_HEIGHTS, lineSymbolShown } from '../chartMarks';
import { analysisChartHeight } from '../../archetypes/AnalysisSectionContext';
import type { ChartSeries } from '../AnalysisChartFrame';
import { chartPointKey } from '../chartStatus';

echarts.use([BarChart, CustomChart, LineChart, ScatterChart, GridComponent, MarkAreaComponent, MarkLineComponent, SVGRenderer]);

type Model = { getComponent: (type: string, i: number) => { get: (path: string[]) => unknown }; getSeriesByIndex: (i: number) => { get: (path: string | string[]) => unknown } };
/** The option as ECharts resolves it under the chart theme, as `EChart` draws it. */
function resolved(option: object, run: (model: Model) => void) {
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 600, height: 240 });
  try { chart.setOption({ ...option, animation: false }); run((chart as unknown as { getModel: () => Model }).getModel()); } finally { chart.dispose(); }
}
const ROWS = ['R1', 'R2', 'R3'];
const series = (id: string, kind: 'bar' | 'line', extra: Partial<ChartSeries> = {}): ChartSeries => ({ id, name: id, color: 'chart-blue', kind, points: ROWS.map((x, n) => [x, n + 1]), ...extra });
const frame = (displayed: ChartSeries[], extra = {}) => buildChartOption(baselineInput({ displayed, horizontal: false, stacked: false, rowPitch: undefined, activeCategory: null, extremes: undefined, markLines: [], ...extra })) as { graphic?: { left: number; bottom?: number; top?: number; silent: boolean }[]; series: { id: string; itemStyle?: { borderRadius?: unknown }; areaStyle?: { opacity: number }; lineStyle?: { width: number }; showSymbol?: boolean }[] };

describe('chart theme defaults (#2725)', () => {
  it('draws grid lines on the value axis only, no ticks, no value axis line, 12px axis text', () => {
    resolved(frame([series('a', 'bar')]), model => {
      const x = model.getComponent('xAxis', 0); const y = model.getComponent('yAxis', 0);
      expect([x.get(['splitLine', 'show']), y.get(['splitLine', 'show'])]).toEqual([false, true]);
      expect([x.get(['axisTick', 'show']), y.get(['axisTick', 'show'])]).toEqual([false, false]);
      expect([x.get(['axisLine', 'show']), y.get(['axisLine', 'show'])]).toEqual([true, false]);
      expect([x.get(['axisLabel', 'fontSize']), y.get(['nameTextStyle', 'fontSize'])]).toEqual([12, 12]);
    });
  });
  it('lays bars out at most 40px wide with 35% category and 12% bar gaps', () => {
    resolved(frame([series('a', 'bar')]), model => {
      const bar = model.getSeriesByIndex(0);
      expect([bar.get('barMaxWidth'), bar.get('barCategoryGap'), bar.get('barGap')]).toEqual([40, '35%', '12%']);
    });
  });
});

describe('frame marks (#2725)', () => {
  const radius = (extra: object) => frame([series('a', 'bar'), series('b', 'bar')], extra).series.find(s => s.id === 'a')!.itemStyle!.borderRadius;
  it('rounds the value end of a bar: top on vertical, right on horizontal, none when stacked', () => {
    expect(radius({})).toEqual([2, 2, 0, 0]);
    expect(radius({ horizontal: true, rowPitch: 26 })).toEqual([0, 2, 2, 0]);
    expect(radius({ stacked: true })).toBe(0);
  });
  it('fills the area under the only solid line, never under several lines, a dashed one or one beside bars', () => {
    expect(frame([series('a', 'line')]).series[0].areaStyle).toEqual({ opacity: 0.09 });
    expect(frame([series('a', 'line'), series('b', 'line')]).series.some(s => s.areaStyle)).toBe(false);
    expect(frame([series('a', 'line', { dashed: true })]).series[0].areaStyle).toBeUndefined();
    expect(frame([series('a', 'line'), series('b', 'bar')]).series.some(s => s.areaStyle)).toBe(false);
    expect(frame([series('a', 'line', { dashed: true })]).series[0].lineStyle!.width).toBe(1.5);
  });
  it('shows line points up to 12; over 12 on hover only, unless markPoints or a selected point need them', () => {
    expect([lineSymbolShown(12), lineSymbolShown(13), lineSymbolShown(13, true)]).toEqual([true, false, true]);
    const line = (count: number, selectedPointKeys: string[]) => {
      const points = Array.from({ length: count }, (_, n): [string, number] => [`R${n}`, n]);
      return frame([series('a', 'line', { points })], { categories: points.map(([x]) => x), selectedPointKeys }).series[0].showSymbol;
    };
    expect([line(12, []), line(13, []), line(13, [chartPointKey({ seriesId: 'a', x: 'R3' })])]).toEqual([true, false, true]);
  });
});

describe('axis break and heights (#2725)', () => {
  const high = (kind: 'bar' | 'line') => series('a', kind, { points: ROWS.map((x, n): [string, number] => [x, 50 + n * 5]) });
  it('a fitted line axis over values far above 0 stops short of 0, which is what the Frame reads to draw the mark', () => {
    let floor = 0;
    resolved(frame([high('line')], { yFit: true }), model => { floor = (model.getComponent('yAxis', 0) as unknown as { axis: { scale: { getExtent: () => number[] } } }).axis.scale.getExtent()[0]; });
    expect(floor).toBeGreaterThan(0);
  });
  it('draws the break mark at the baseline start of a fitted line chart only', () => {
    const [mark] = frame([high('line')], { yFit: true, axisBreak: 'bottom' }).graphic!;
    expect(mark).toMatchObject({ left: 47, bottom: 40, silent: true });
    expect(frame([high('line')], { yFit: true, axisBreak: 'top' }).graphic![0]).toMatchObject({ top: 12 });
    expect(frame([high('line')], { yFit: true }).graphic).toBeUndefined();
    expect(frame([high('line')], { axisBreak: 'bottom' }).graphic).toBeUndefined();
    expect(frame([high('bar')], { yFit: true, axisBreak: 'bottom' }).graphic).toBeUndefined();
  });
  it('keeps the size steps in one place: compact 200, regular 260–280, hero 360, fill from 320, 28px per row', () => {
    expect(['compact', 'hero', 'fill'].map(size => analysisChartHeight(size as 'compact', CHART_HEIGHTS.regular))).toEqual([200, 360, 320]);
    expect([CHART_HEIGHTS.regularFrame, CHART_HEIGHTS.regular, CHART_HEIGHTS.rowPitch]).toEqual([260, 280, 28]);
  });
});
