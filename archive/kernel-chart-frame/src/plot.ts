import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { fixture, type ChartLocalState, type PageFilter } from './model';
import { colors } from './design-tokens';
import type { Annotation } from './annotations';
echarts.use([LineChart, GridComponent, MarkAreaComponent, SVGRenderer]);
export function plotOption(local: ChartLocalState, filter: PageFilter, annotations: Annotation[]): EChartsCoreOption {
  const names = [...(local.visibleA ? ['A' as const] : []), ...(local.compare && local.visibleB ? ['B' as const] : [])];
  return {
    animation: false, grid: { left: 48, right: 24, top: 30, bottom: 42 },
    xAxis: { type: 'value', min: local.viewport[0], max: local.viewport[1], name: 'index' },
    yAxis: { type: 'value', min: 0, max: 100, name: 'synthetic value', splitLine: { lineStyle: { color: colors['chart-grid'] } } },
    series: [...names.map(name => ({ name: `Synthetic ${name}`, type: 'line', symbol: name === 'A' ? 'circle' : 'diamond', symbolSize: 7,
      lineStyle: { type: name === 'A' ? 'solid' : 'dashed' }, itemStyle: { color: name === 'A' ? colors['chart-blue'] : colors['chart-purple'] },
      data: fixture.map(row => [row.x, row[name] >= filter.threshold ? row[name] : null]),
    })), {
      id: 'selection-annotations', name: 'Selection and annotations', type: 'line',
      data: [], silent: true, symbol: 'none',
      markArea: { silent: true, data: [
        ...(local.brush ? [[{ name: 'Brush', xAxis: local.brush[0], itemStyle: { color: colors['chart-blue'], opacity: 0.10 } }, { xAxis: local.brush[1] }]] : []),
        ...annotations.map(a => [{ name: a.text, xAxis: a.range[0], itemStyle: { color: colors['chart-purple'], opacity: 0.12 } }, { xAxis: a.range[1] }])
      ] }
    }]
  };
}
export function renderPlot(option: EChartsCoreOption): string {
  const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 900, height: 340 });
  try { chart.setOption(option); return chart.renderToSVGString(); } finally { chart.dispose(); }
}
