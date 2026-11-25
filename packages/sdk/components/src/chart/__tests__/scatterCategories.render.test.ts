// @vitest-environment node
import * as echarts from 'echarts/core';
import { CustomChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { expect, it } from 'vitest';
import { scatterData } from '../analysisChartKinds';
import { token } from '../EChart';
import { statusBacking, statusBorderColor, statusFill } from '../chartStatus';

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
    expect(text).toEqual(expect.arrayContaining(['A', 'B', 'C', '■', 'R1', 'R2']));
    expect(text.filter(label => label === 'R1')).toHaveLength(1);
    expect(text).not.toContain('unused'); expect(svg).toContain('stroke-dasharray="8,4"'); expect(svg).toContain('stroke-dasharray="2,4"');
    expect(svg).toContain('fill-opacity="0.12"');
  } finally { chart.dispose(); }
});

const luminance = (rgb: string) => {
  const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
it.each([{ categorical: false, matching: false }, { categorical: false, matching: true }, { categorical: true, matching: false }, { categorical: true, matching: true }])('renders opaque, nonselectable scatter status strokes: %j', ({ categorical, matching }) => {
  const status = { tone: 'danger' as const, label: 'High' };
  const ids = ['one', 'two', 'three', 'four'];
  const projection = scatterData({ kind: 'scatter', xUnit: 'x', xLabel: 'Cell', yLabel: 'Duration',
    groups: ids.map((id, index) => ({ id, label: id, ...(matching && index === 0 ? { color: 'chart-status-critical' as const } : {}) })),
    points: ids.map((id, index) => ({ id, group: id, category: id, x: index, y: index + 1, status })),
    ...(categorical ? { xCategories: { order: ids } } : {}),
  }, 'en', 's');
  type Datum = { value: number[]; itemStyle: { color?: string; borderColor?: string; borderWidth?: number } };
  type Series = { id?: string; symbol: string; silent?: boolean; z?: number; data: Datum[]; itemStyle?: { opacity: number }; tooltip?: { show: boolean } };
  const option = projection.option([]) as { series: Series[] };
  const outlines = option.series.filter(series => series.silent && (series.z === 3 || series.z === 4));
  expect(outlines.length).toBeGreaterThan(0);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    chart.setOption({ ...option, animation: false });
    const paths = chart.renderToSVGString().match(/<path[^>]*ecmeta_ssr_type="chart"[^>]*>/g)!;
    for (const [index, series] of option.series.entries()) {
      if (!(series.silent && (series.z === 3 || series.z === 4))) continue;
      expect(projection.seriesKeys[index]).toEqual([]);
      expect(series).toMatchObject({ silent: true, itemStyle: { opacity: 1 }, tooltip: { show: false } });
      const drawn = paths.filter(path => path.includes(`ecmeta_series_index="${index}"`));
      expect(drawn).toHaveLength(series.data.length);
      for (const path of drawn) {
        expect(path).not.toMatch(/stroke-opacity="0\./);
        const matrix = path.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number);
        const width = Number(path.match(/stroke-width="([^"]+)"/)![1]);
        expect(width * Math.sqrt(Math.abs(matrix[0] * matrix[3]))).toBeCloseTo(series.data[0].itemStyle.borderWidth!);
      }
    }
    for (const [index, series] of option.series.slice(0, projection.legend.filter(item => !item.status).length).entries()) {
      if (!series.data.length) continue;
      const datum = series.data[0];
      const effective = statusFill(datum.itemStyle.color!, 0.8);
      const backing = statusBacking(status, effective);
      const stroke = statusBorderColor(status, effective);
      const layers = outlines.filter(layer => layer.symbol === series.symbol && layer.data.some(item => JSON.stringify(item.value) === JSON.stringify(datum.value)));
      expect(layers.some(layer => layer.data.some(item => item.itemStyle.borderColor === stroke && item.itemStyle.borderWidth === 2))).toBe(true);
      if (backing) {
        expect(layers.some(layer => layer.data.some(item => item.itemStyle.borderColor === backing && item.itemStyle.borderWidth === 6))).toBe(true);
        expect(contrast(backing, effective)).toBeGreaterThanOrEqual(3);
        expect(contrast(stroke, backing)).toBeGreaterThanOrEqual(3);
      } else expect(contrast(stroke, effective)).toBeGreaterThanOrEqual(3);
      expect(paths.some(path => path.includes(`ecmeta_series_index="${index}"`) && path.includes('fill-opacity="0.8"'))).toBe(true);
    }
    expect(option.series[0].data[0].itemStyle.color).toBe(token(matching ? 'chart-status-critical' : 'chart-series-1'));
  } finally { chart.dispose(); }
});

it('renders thin quiet rings without a backing and reveals only the selected status glyph', () => {
  const projection = scatterData({ kind: 'scatter', density: 'quiet', xUnit: 'x', xLabel: 'Cell', yLabel: 'Value',
    points: [{ id: 'normal', x: 0, y: 1 }, { id: 'high', x: 1, y: 12, status: { tone: 'danger', label: 'High' } }],
  }, 'en', 's');
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    const option = projection.option([]);
    const series = option.series as { silent?: boolean; z?: number }[];
    expect(series.some(item => item.silent && item.z === 3)).toBe(false);
    const outlineIndex = series.findIndex(item => item.silent && item.z === 4);
    chart.setOption({ ...option, animation: false });
    const svg = chart.renderToSVGString();
    expect(svg).not.toContain('>■</text>');
    expect(svg).toContain('fill-opacity="0.45"'); expect(svg).toContain('fill-opacity="0.6"');
    const ring = svg.match(/<path[^>]*ecmeta_ssr_type="chart"[^>]*>/g)!.find(path => path.includes(`ecmeta_series_index="${outlineIndex}"`))!;
    expect(ring).toBeDefined();
    const matrix = ring.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number);
    const width = Number(ring.match(/stroke-width="([^"]+)"/)![1]);
    expect(width * Math.sqrt(Math.abs(matrix[0] * matrix[3]))).toBeCloseTo(1);
    chart.setOption({ ...projection.option([projection.rows[1].key]), animation: false }, { notMerge: true });
    expect(chart.renderToSVGString()).toContain('>■</text>');
  } finally { chart.dispose(); }
});
