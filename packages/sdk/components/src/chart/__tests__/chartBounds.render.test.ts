// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette, type ChartOptionInput } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, SVGRenderer]);
function draw(extra: Partial<ChartOptionInput>) {
  const input = baselineInput({ horizontal: false, stacked: false, rowPitch: undefined, extremes: undefined, activeCategory: undefined, markLines: undefined, categories: ['A', 'B', 'C'], displayed: [{ id: 'a', name: 'A', color: 'chart-blue', points: [['A', 3], ['B', null], ['C', 5]] }], ...extra });
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 300 });
  try {
    chart.setOption({ ...buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) }), animation: false });
    return chart.renderToSVGString();
  } finally { chart.dispose(); }
}
describe('rendered line bounds and statuses (#2333)', () => {
  it('draws both dash patterns and a translucent band, with no fill on the one-sided step', () => {
    const svg = draw({ bounds: new Map([['A', { lower: -3, upper: 9 }], ['B', { upper: 12 }]]) });
    expect(svg).toContain('stroke-dasharray="8,4"');
    expect(svg).toContain('stroke-dasharray="2,4"');
    expect(svg.match(/fill-opacity="0.12"/g)).toHaveLength(1);
  });
  it.each(['category', 'time'] as const)('keeps a band crossing the zoom window on a %s axis', xType => {
    const xs = xType === 'time' ? ['2026-11-16T09:00:00', '2026-11-16T10:00:00', '2026-11-16T11:00:00'] : ['A', 'B', 'C'];
    const svg = draw({ xType, displayed: [{ id: 'a', name: 'A', color: 'chart-blue', points: xs.map(x => [x, 3]) }], zoom: [30, 70], bounds: new Map([[xs[0], { lower: 1, upper: 8 }]]) });
    expect(svg).toContain('fill-opacity="0.12"');
    expect(svg).toContain('stroke-dasharray="8,4"');
    expect(svg).not.toContain('NaN');
  });
  it('renders only measured status symbols and glyphs when the line hides symbols', () => {
    const svg = draw({ pointStatus: () => ({ tone: 'warning', label: 'High' }) });
    expect(svg.match(/>▼<\/text>/g)).toHaveLength(2);
    expect(svg).not.toContain('NaN');
  });
});
