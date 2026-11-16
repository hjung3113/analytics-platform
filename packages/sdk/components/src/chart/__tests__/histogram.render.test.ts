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

it('keeps reference labels at either end of the axis inside the plot area', () => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 480, height: 280 });
  try {
    const data = histogramData({ kind: 'histogram', xLabel: 'Duration', xUnit: 's',
      bins: [{ start: 3, end: 4, count: 100 }, { start: 6, end: 7, count: 10 }],
      referenceLines: [{ id: 'lower', value: 3, label: 'HTM lower bound 3s' }, { id: 'upper', value: 7, label: 'HTM upper bound 7s', tone: 'danger' }] }, 'en');
    chart.setOption({ ...data.option([]), animation: false });
    const [left, right] = [3, 7].map(value => chart.convertToPixel({ xAxisIndex: 0 }, value) as number);
    const texts = chart.getZr().storage.getDisplayList().filter(element => typeof (element as { style?: { text?: unknown } }).style?.text === 'string') as unknown as
      { style: { text?: string }; getBoundingRect: () => { x: number; width: number; applyTransform: (m: unknown) => void; clone: () => { x: number; width: number; applyTransform: (m: unknown) => void } }; transform: unknown }[];
    for (const label of ['HTM lower bound 3s', 'HTM upper bound 7s']) {
      const text = texts.find(t => t.style.text === label)!;
      expect(text, label).toBeDefined();
      const box = text.getBoundingRect().clone(); if (text.transform) box.applyTransform(text.transform);
      expect(box.x, `${label} left`).toBeGreaterThanOrEqual(left - 0.5);
      expect(box.x + box.width, `${label} right`).toBeLessThanOrEqual(right + 0.5);
    }
  } finally { chart.dispose(); }
});
