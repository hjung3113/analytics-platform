// @vitest-environment node
import * as echarts from 'echarts/core';
import { CustomChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { expect, it } from 'vitest';
import { scatterData } from '../analysisChartKinds';

echarts.use([CustomChart, ScatterChart, BrushComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, SVGRenderer]);
it('draws category ticks, one label per group span, status glyphs, bound dashes and a band in ECharts', () => {
  const projection = scatterData({ kind: 'scatter', xUnit: 'unused', xLabel: 'Cell', yLabel: 'Duration', points: [
    { id: 'a', category: 'a', x: null, y: 12, status: { tone: 'danger', label: 'High' } },
    { id: 'b', category: 'b', x: null, y: 2 },
    { id: 'c', category: 'c', x: null, y: 3 },
  ], xCategories: { order: ['a', 'b', 'c'], groups: { header: 'Rack', byCategory: new Map([
    ['a', { group: 'R1', label: 'A' }], ['b', { group: 'R1', label: 'B' }], ['c', { group: 'R2', label: 'C' }],
  ]) }, bounds: new Map([['a', { lower: -2, upper: 10 }], ['b', { lower: -2, upper: 10 }], ['c', { upper: 15 }]]) } }, 'en', 's');
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    chart.setOption({ ...projection.option([]), animation: false });
    const model = (chart as unknown as { getModel: () => { getComponent: (name: string) => { axis: { scale: { getTicks: () => { value: number }[] } } } } }).getModel();
    expect(model.getComponent('xAxis').axis.scale.getTicks().map(tick => tick.value)).toEqual([-0.5, 0, 0.5, 1, 1.5, 2, 2.5]);
    const svg = chart.renderToSVGString();
    const text = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
    expect(text).toEqual(expect.arrayContaining(['A', 'B', 'C', '▲', 'R1', 'R2']));
    expect(text.filter(label => label === 'R1')).toHaveLength(1);
    expect(text).not.toContain('unused'); expect(svg).toContain('stroke-dasharray="8,4"'); expect(svg).toContain('stroke-dasharray="2,4"');
    expect(svg).toContain('fill-opacity="0.12"');
  } finally { chart.dispose(); }
});
