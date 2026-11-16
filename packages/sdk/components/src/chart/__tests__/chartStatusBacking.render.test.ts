// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart, type CustomSeriesOption } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { heatmapStatusOutlines } from '../chartStatus';
import { token } from '../EChart';
import type { ChartSeries } from '../AnalysisChartFrame';

echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);

type Rect = { x: number; y: number; width: number; height: number };
type NativeData = { count: () => number; getItemLayout: (n: number) => Rect; getRawIndex: (n: number) => number };
type NativeModel = { getSeriesByIndex: (n: number) => { getData: () => NativeData } };
const closeRect = (a: Rect, b: Rect) => { for (const key of ['x', 'y', 'width', 'height'] as const) expect(a[key], key).toBeCloseTo(b[key], 5); };

describe('effective status borders drawn by ECharts (#2326 C1)', () => {
  it.each([
    { horizontal: true, stacked: true, startAlign: false, xType: 'category' as const },
    { horizontal: true, stacked: true, startAlign: true, xType: 'category' as const },
    { horizontal: false, stacked: false, startAlign: false, xType: 'category' as const },
    { horizontal: false, stacked: false, startAlign: false, xType: 'time' as const },
  ])('aligns double strokes with native bar rectangles: %j', extra => {
    const categories = extra.xType === 'time' ? ['2026-11-16T00:00:00', '2026-11-16T01:00:00', '2026-11-16T02:00:00'] : ['R1', 'R2', 'R3'];
    const displayed: ChartSeries[] = [
      { id: 'a', name: 'A', color: 'chart-status-warn', kind: 'bar', points: categories.map((x, n) => [x, [8, 4, 1][n]]) },
      { id: 'b', name: 'B', color: 'chart-status-critical', kind: 'bar', points: categories.map((x, n) => [x, [2, 0, null][n]]) },
    ];
    const input = baselineInput({ ...extra, categories, displayed, activeCategory: null, extremes: undefined, palette: resolveChartPalette(displayed), pointStatus: p => ({ tone: p.seriesId === 'a' ? 'warning' : 'danger', label: 'Status' }) });
    const option = buildChartOption(input) as { series: CustomSeriesOption[] };
    const captured = new Map<string, Rect[]>();
    for (const s of option.series) if (String(s.id).startsWith('__statusBarBacking')) {
      const original = s.renderItem as Exclude<CustomSeriesOption['renderItem'], undefined | string>;
      s.renderItem = (params, api) => {
        const result = original(params, api) as { children: { shape: Rect; style: { fill: string; lineWidth: number } }[] };
        const rects = captured.get(String(s.id)) ?? [];
        rects[Number(api.value(3))] = result.children[0].shape;
        captured.set(String(s.id), rects);
        expect(result.children.map(c => c.style.lineWidth)).toEqual([6, 2]);
        expect(result.children.every(c => c.style.fill === 'none')).toBe(true);
        closeRect(result.children[0].shape, result.children[1].shape);
        return result as ReturnType<typeof original>;
      };
    }
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 260 });
    try {
      chart.setOption({ ...option, animation: false });
      const svg = chart.renderToSVGString();
      expect(svg).toContain('stroke-width="6"');
      const model = (chart as unknown as { getModel: () => NativeModel }).getModel();
      for (const [slot, id] of ['a', 'b'].entries()) {
        const native = model.getSeriesByIndex(option.series.findIndex(s => s.id === id)).getData();
        const rects = captured.get(slot === 0 ? '__statusBarBacking' : `__statusBarBacking-${slot}`)!;
        for (let n = 0; n < native.count(); n++) {
          const raw = native.getItemLayout(n);
          if (![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite)) continue;
          const border = Math.min(2, Math.abs(raw.width), Math.abs(raw.height));
          closeRect(rects[n], { x: Math.min(raw.x, raw.x + raw.width) + border / 2, y: Math.min(raw.y, raw.y + raw.height) + border / 2, width: Math.abs(raw.width) - border, height: Math.abs(raw.height) - border });
        }
      }
    } finally { chart.dispose(); }
  });
  it('renders opaque heatmap double strokes above the translucent warning/danger fills and a neutral null cell', () => {
    const cells = [
      { value: [0, 0, 15], status: { tone: 'warning' as const, label: 'Warning' }, fill: token('chart-status-warn') },
      { value: [1, 0, null], status: { tone: 'neutral' as const, label: 'Unknown' }, fill: token('chart-no-data') },
      { value: [2, 0, 25], status: { tone: 'danger' as const, label: 'Danger' }, fill: token('chart-status-critical') },
    ];
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 260 });
    try {
      chart.setOption({ animation: false, xAxis: { type: 'category', data: ['A', 'B', 'C'] }, yAxis: { type: 'category', data: ['Row'] }, series: [
        { type: 'scatter', symbol: 'rect', symbolSize: [80, 40], data: cells.map(c => ({ value: c.value, itemStyle: { color: c.fill } })) },
        ...heatmapStatusOutlines(cells, [80, 40]),
      ] });
      const paths = chart.renderToSVGString().match(/<path[^>]*ecmeta_ssr_type="chart"[^>]*>/g)!;
      const backings = paths.filter(p => p.includes('ecmeta_series_index="1"'));
      const strokes = paths.filter(p => p.includes('ecmeta_series_index="2"'));
      expect(backings).toHaveLength(2);
      expect(strokes).toHaveLength(3); // null status is rendered too
      // Scatter normalizes its symbol path; ECharts divides the width by sqrt(scaleX * scaleY).
      for (const [paths, width] of [[backings, 6], [strokes, 2]] as const) for (const path of paths) {
        const matrix = path.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number);
        const strokeWidth = Number(path.match(/stroke-width="([^"]+)"/)![1]);
        expect(strokeWidth * Math.sqrt(Math.abs(matrix[0] * matrix[3]))).toBeCloseTo(width);
      }
      expect([...backings, ...strokes].every(p => !/stroke-opacity="0\./.test(p))).toBe(true);
      expect(paths.filter(p => p.includes('fill-opacity="0.8"'))).toHaveLength(3);
    } finally { chart.dispose(); }
  });
});
