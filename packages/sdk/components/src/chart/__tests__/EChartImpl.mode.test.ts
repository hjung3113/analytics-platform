// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette, type ChartOptionInput } from '../buildChartOption';
import { setOptionMode } from '../EChartImpl';
import type { ChartSeries } from '../AnalysisChartFrame';

echarts.use([LineChart, BarChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);

// #705: a re-render of a zoomed chart must not rebuild its inside dataZoom (the roam controller that owns a drag in progress).
// The real ECharts model shows what each mode keeps; the drag itself is covered by the E2E `확대한 그림을 끌면 보이는 구간이 옮겨간다`.
const line = (id: string, values: number[]): ChartSeries => ({ id, name: id, color: 'accent-primary', kind: 'line', points: values.map((v, n) => [`2026-09-25T${String(n).padStart(2, '0')}:00:00`, v]) });
const optionOf = (displayed: ChartSeries[], more: Partial<ChartOptionInput> = {}): EChartsCoreOption => ({
  // The same root settings EChartImpl merges in front of every option.
  textStyle: { fontFamily: 'sans-serif' }, animationDuration: 120, useUTC: true,
  ...buildChartOption({
    displayed, categories: [], previousIds: new Set(), xType: 'time', horizontal: false, zoom: [0, 100], brushMode: false, selection: null, annotations: [], noteSpans: [], noteLevels: [], timeExtent: 0,
    chartWidth: 640, markLines: undefined, unit: 's', lang: 'ko', stacked: false, valueFormat: v => String(v), palette: resolveChartPalette(displayed), ...more,
  }),
});
const charts: echarts.ECharts[] = [];
const chartWith = (first: EChartsCoreOption) => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 640, height: 320 });
  charts.push(chart);
  chart.setOption(first, setOptionMode(null, first));
  return chart;
};
const modelOf = (chart: echarts.ECharts, type: string) => (chart as unknown as { getModel: () => { getComponent: (type: string) => object | undefined } }).getModel().getComponent(type);
afterEach(() => { for (const chart of charts.splice(0)) chart.dispose(); });

describe('setOptionMode (#705)', () => {
  it('rebuilds on the first option', () => {
    expect(setOptionMode(null, optionOf([line('a', [1, 2])]))).toEqual({ notMerge: true });
  });

  it('a re-render with the same shape keeps the dataZoom, grid and brush models and replaces the other component types', () => {
    const first = optionOf([line('a', [1, 2, 3])]);
    const chart = chartWith(first);
    const zoom = modelOf(chart, 'dataZoom');
    const grid = modelOf(chart, 'grid');
    const brush = modelOf(chart, 'brush');
    const next = optionOf([line('a', [1, 2, 3])], { zoom: [20, 80] });
    const mode = setOptionMode(first, next);
    expect(mode).toHaveProperty('replaceMerge');
    expect((mode as { replaceMerge: string[] }).replaceMerge).toEqual(expect.arrayContaining(['series', 'xAxis', 'yAxis']));
    expect((mode as { replaceMerge: string[] }).replaceMerge).not.toContain('dataZoom');
    expect((mode as { replaceMerge: string[] }).replaceMerge).not.toContain('grid');
    expect((mode as { replaceMerge: string[] }).replaceMerge).not.toContain('brush');
    expect((mode as { replaceMerge: string[] }).replaceMerge).not.toContain('textStyle');
    chart.setOption(next, mode);
    expect(modelOf(chart, 'dataZoom')).toBe(zoom);
    expect(modelOf(chart, 'grid')).toBe(grid);
    expect(modelOf(chart, 'brush')).toBe(brush);
    const dz = (chart.getOption().dataZoom as { start: number; end: number }[])[0];
    expect([dz.start, dz.end]).toEqual([20, 80]);
  });

  it('replaced component types drop what the next option no longer has', () => {
    const first = optionOf([line('a', [1, 2]), line('b', [3, 4])]);
    const chart = chartWith(first);
    const next = optionOf([line('a', [1, 2])]);
    chart.setOption(next, setOptionMode(first, next));
    // replaceMerge leaves a null hole where a removed component was; nothing is drawn there.
    expect((chart.getOption().series as ({ id: string } | null)[]).filter(s => s !== null).map(s => s.id)).toEqual(expect.arrayContaining(['a']));
    expect((chart.getOption().series as ({ id: string } | null)[]).some(s => s?.id === 'b')).toBe(false);
  });

  it('a key the next series leaves out does not survive (EChartImpl empties the series before a replaceMerge)', () => {
    const first = optionOf([line('a', [1, 2])]);
    const labelled = { ...first, series: (first.series as object[]).map(entry => ({ ...entry, label: { show: true } })) };
    const chart = chartWith(labelled);
    const mode = setOptionMode(labelled, first);
    expect(mode).toHaveProperty('replaceMerge');
    chart.setOption({ series: [] }, { replaceMerge: ['series'], silent: true, lazyUpdate: true });
    chart.setOption(first, mode);
    const series = (chart.getOption().series as ({ id: string; label?: { show?: boolean } } | null)[]).filter(entry => entry !== null);
    expect(series.find(entry => entry.id === 'a')?.label?.show).not.toBe(true);
  });

  it('rebuilds when dataZoom goes away or changes shape, or the grid or brush shape changes', () => {
    const first = optionOf([line('a', [1, 2])]);
    expect(setOptionMode(first, { ...first, grid: [{}, {}] })).toEqual({ notMerge: true });
    expect(setOptionMode(first, { ...first, grid: { ...(first.grid as object), containLabel: true } })).toEqual({ notMerge: true });
    const { xAxisIndex: _x, ...brush } = first.brush as Record<string, unknown>;
    expect(setOptionMode(first, { ...first, brush: { ...brush, yAxisIndex: 0 } })).toEqual({ notMerge: true });
    expect(setOptionMode(first, { ...first, dataZoom: [] })).toEqual({ notMerge: true });
    expect(setOptionMode(first, { ...first, dataZoom: [{ type: 'inside', yAxisIndex: 0 }] })).toEqual({ notMerge: true });
  });

  it('rebuilds when the root keys differ or an unknown object key appears', () => {
    const first = optionOf([line('a', [1, 2])]);
    const { useUTC: _dropped, ...fewer } = first as Record<string, unknown>;
    expect(setOptionMode(first, fewer as EChartsCoreOption)).toEqual({ notMerge: true });
    const withUnknown = { ...first, polar: {} };
    expect(setOptionMode({ ...first, polar: {} }, withUnknown)).toEqual({ notMerge: true });
  });
});
