// @vitest-environment node
import * as echarts from 'echarts/core';
import { CustomChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { expect, it } from 'vitest';
import { histogramData } from '../histogram';
import { statusColor } from '../chartStatus';
import { token } from '../EChart';

echarts.use([CustomChart, ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);
it('ECharts renders histogram rectangles, reference text, axis caption and a status marker', () => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 880, height: 280 });
  try {
    const data = histogramData({ kind: 'histogram', xLabel: 'Duration', xUnit: 's',
      bins: [{ start: 3, end: 4, count: 100 }, { start: 6, end: 7, count: 10 }],
      referenceLines: [{ id: 'limit', value: 6, label: 'HTM upper 6s', tone: 'danger' }],
      binStatus: bin => bin.start >= 6 ? { tone: 'danger', label: 'Above limit' } : undefined }, 'en');
    chart.setOption({ ...data.option([]), animation: false });
    const svg = chart.renderToSVGString();
    expect(svg).toContain('HTM upper 6s');
    expect(svg).toContain('Duration (s)');
    expect(svg).toContain('■');
    expect(svg).toContain('stroke-dasharray');
    const bars = chart.getZr().storage.getDisplayList().filter(element => element.type === 'rect') as unknown as { shape: { width: number; height: number }; style: { fill: string } }[];
    const bins = bars.filter(bar => bar.shape.width > 100);
    expect(bins).toHaveLength(2);
    expect(bins.map(bin => bin.style.fill)).toEqual([token('chart-series-1'), statusColor({ tone: 'danger', label: 'Above limit' })]);
    expect(bins[0].shape.height / bins[1].shape.height).toBeCloseTo(10);
  } finally { chart.dispose(); }
});
