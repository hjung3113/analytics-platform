// @vitest-environment node
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@ap/kernel';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisChart } from '../AnalysisChart';
import { EChart, type EChartProps } from '../EChart';
import { buildChartOption, resolveChartPalette } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { scatterData } from '../analysisChartKinds';
import type { ChartStatus } from '../chartStatus';

// Capture the real heatmap option without mounting a browser/canvas; the interaction below uses real ECharts.
vi.mock('../EChart', async importOriginal => ({
  ...await importOriginal<typeof import('../EChart')>(),
  EChart: vi.fn((_props: EChartProps) => null),
}));
echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);

type Element = {
  type: string; style?: Record<string, unknown>; currentStates: string[];
  traverse: (visit: (element: Element) => void) => void;
  getTextContent: () => Element | undefined;
};
type Series = { id: string; get: (key: string) => unknown };
type Runtime = {
  getModel: () => { getSeriesByIndex: (index: number) => Series };
  getViewOfSeriesModel: (series: Series) => { group: Element };
};
const styleOf = (element: Element) => {
  const style = element.style!;
  return { opacity: style.opacity ?? 1, fill: style.fill, stroke: style.stroke, lineWidth: style.lineWidth, lineDash: style.lineDash };
};
function checkInteraction(option: EChartsCoreOption, overlays: string[], { blurred }: { blurred: boolean }) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    chart.setOption({ ...option, animation: false, stateAnimation: { duration: 0 } });
    const runtime = chart as unknown as Runtime;
    const series = chart.getOption().series as { id: string }[];
    const samples = overlays.map(id => {
      const index = series.findIndex(s => s.id === id);
      expect(index, id).toBeGreaterThanOrEqual(0);
      const group = runtime.getViewOfSeriesModel(runtime.getModel().getSeriesByIndex(index)).group;
      const elements: Element[] = [];
      group.traverse(element => {
        if (element.style) elements.push(element);
        const label = element.getTextContent();
        if (label) elements.push(label);
      });
      expect(elements.length, id).toBeGreaterThan(0);
      if (id.startsWith('__line-status-')) expect(elements.some(element => element.type === 'text'), 'status glyph label').toBe(true);
      return { id, elements, normal: elements.map(styleOf) };
    });
    const act = (type: 'highlight' | 'downplay') => {
      chart.dispatchAction({ type, seriesIndex: 0, dataIndex: 0 });
      // SSR has no animation loop. Advance the actual ECharts frame so hover states reach element styles.
      chart.getZr().animation.update();
    };
    act('highlight');
    for (const { id, elements, normal } of samples) {
      expect(elements.some(element => element.currentStates.includes('blur')), id).toBe(blurred);
      expect.soft(elements.map(styleOf), `${id} during highlight`).toEqual(normal);
    }
    act('downplay');
    for (const { id, elements, normal } of samples) {
      expect(elements.some(element => element.currentStates.includes('blur')), id).toBe(false);
      expect(elements.map(styleOf), `${id} after downplay`).toEqual(normal);
    }
  } finally { chart.dispose(); }
}
const categories = ['A', 'B'];
const status = (tone: ChartStatus['tone']): ChartStatus => ({ tone, label: 'Status' });

// Series blur is opt-in since #2342 (`emphasisFocus: 'series'`); the line and bar cases opt in so the blur path stays covered.
describe('semantic overlay opacity through ECharts focus/blur (#2333 FIX1)', () => {
  it.each(['danger', 'warning', 'neutral'] as const)('preserves the %s line halo, ring, glyph and bound strokes/band', tone => {
    const displayed = [{ id: 'line', name: 'Line', color: 'chart-blue' as const, points: [['A', 3], ['B', 5]] as [string, number][] }];
    const input = baselineInput({ displayed, categories, horizontal: false, stacked: false, activeCategory: null, extremes: undefined, pointStatus: () => status(tone), bounds: new Map([['A', { lower: 1, upper: 6 }]]), palette: resolveChartPalette(displayed), emphasisFocus: 'series' });
    checkInteraction(buildChartOption(input), ['__line-halo-line', '__line-status-line', '__bounds-upper', '__bounds-lower', '__bounds-band'], { blurred: true });
  });
  it.each([false, true])('preserves both bar backing strokes, horizontal=%s', horizontal => {
    const displayed = [{ id: 'bar', name: 'Bar', kind: 'bar' as const, color: 'chart-status-critical' as const, points: [['A', 3], ['B', 5]] as [string, number][] }];
    const input = baselineInput({ displayed, categories, horizontal, stacked: false, activeCategory: null, extremes: undefined, pointStatus: () => status('danger'), palette: resolveChartPalette(displayed), emphasisFocus: 'series' });
    checkInteraction(buildChartOption(input), ['__statusBarBacking'], { blurred: true });
  });
  it.each([false, true])('does not blur scatter status layers when the host is highlighted, categorical=%s', categorical => {
    const projection = scatterData({ kind: 'scatter', xLabel: 'X', xUnit: 'x', yLabel: 'Y', groups: [{ id: 'g', label: 'Group', color: 'chart-status-critical' }], points: [
      { id: 'a', group: 'g', category: 'A', x: 0, y: 3, status: status('danger') },
      { id: 'b', group: 'g', category: 'B', x: 1, y: 5, status: status('danger') },
    ], ...(categorical ? { xCategories: { order: categories } } : {}) }, 'en', 's');
    const option = projection.option([]);
    expect((option.series as { emphasis: { focus: string } }[])[0].emphasis.focus).toBe('none');
    checkInteraction(option, ['__scatterStatusBacking-0', '__scatterStatusOutline-0'], { blurred: false });
  });
  it('does not blur heatmap status layers when the host is highlighted', () => {
    renderToString(<I18nProvider><AnalysisChart chartId="heat" title="Heatmap" unit="s" spec={{ kind: 'heatmap', xLabels: categories, yLabels: ['Row'], scale: { type: 'threshold', breaks: [1, 2], labels: ['Low', 'Mid', 'High'] }, cells: [
      { x: 'A', y: 'Row', value: 3, status: status('danger') },
      { x: 'B', y: 'Row', value: 5, status: status('danger') },
    ] }} /></I18nProvider>);
    const option = vi.mocked(EChart).mock.calls.at(-1)![0].option;
    expect((option.series as { emphasis: { focus: string } }[])[0].emphasis.focus).toBe('none');
    checkInteraction(option, ['__statusBacking', '__statusOutline'], { blurred: false });
  });
});
