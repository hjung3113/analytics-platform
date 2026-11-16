// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart, type CustomSeriesOption } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { heatmapStatusOutlines, statusRing } from '../chartStatus';
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
    const captured = new Map<string, { shape: Rect; lineWidth: number }[][]>();
    for (const s of option.series) if (String(s.id).startsWith('__statusBarBacking')) {
      const original = s.renderItem as Exclude<CustomSeriesOption['renderItem'], undefined | string>;
      s.renderItem = (params, api) => {
        const result = original(params, api) as { children: { shape: Rect; style: { fill: string; lineWidth: number } }[] };
        const rects = captured.get(String(s.id)) ?? [];
        rects[Number(api.value(3))] = result.children.map(c => ({ shape: c.shape, lineWidth: c.style.lineWidth }));
        captured.set(String(s.id), rects);
        expect(result.children.every(c => c.style.fill === 'none')).toBe(true);
        return result as ReturnType<typeof original>;
      };
    }
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 260 });
    try {
      chart.setOption({ ...option, animation: false });
      const svg = chart.renderToSVGString();
      expect(svg).not.toContain('stroke-width="6"');
      const model = (chart as unknown as { getModel: () => NativeModel }).getModel();
      for (const [slot, id] of ['a', 'b'].entries()) {
        const native = model.getSeriesByIndex(option.series.findIndex(s => s.id === id)).getData();
        const rects = captured.get(slot === 0 ? '__statusBarBacking' : `__statusBarBacking-${slot}`)!;
        for (let n = 0; n < native.count(); n++) {
          const raw = native.getItemLayout(n);
          if (![raw.x, raw.y, raw.width, raw.height].every(Number.isFinite)) continue;
          const box = { x: Math.min(raw.x, raw.x + raw.width), y: Math.min(raw.y, raw.y + raw.height), width: Math.abs(raw.width), height: Math.abs(raw.height) };
          const border = Math.min(2, box.width, box.height);
          const strokes = rects[n];
          // The status stroke shares the native border's centreline (#2326 C1)...
          closeRect(strokes.at(-1)!.shape, { x: box.x + border / 2, y: box.y + border / 2, width: box.width - border, height: box.height - border });
          // ...and every stroke, backing included, stays inside its own piece, never over a neighbour (#2351).
          for (const { shape, lineWidth } of strokes) {
            expect(shape.x - lineWidth / 2).toBeGreaterThanOrEqual(box.x - 1e-6);
            expect(shape.y - lineWidth / 2).toBeGreaterThanOrEqual(box.y - 1e-6);
            expect(shape.x + shape.width + lineWidth / 2).toBeLessThanOrEqual(box.x + box.width + 1e-6);
            expect(shape.y + shape.height + lineWidth / 2).toBeLessThanOrEqual(box.y + box.height + 1e-6);
          }
          if (strokes.length === 2) closeRect(strokes[0].shape, { x: box.x + border + strokes[0].lineWidth / 2, y: box.y + border + strokes[0].lineWidth / 2, width: box.width - 2 * border - strokes[0].lineWidth, height: box.height - 2 * border - strokes[0].lineWidth });
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
      const svg = chart.renderToSVGString();
      const paths = svg.match(/<path[^>]*ecmeta_ssr_type="chart"[^>]*>/g)!;
      const backings = paths.filter(p => p.includes('ecmeta_series_index="1"'));
      const strokes = paths.filter(p => p.includes('ecmeta_series_index="2"'));
      expect(backings).toHaveLength(2);
      expect(strokes).toHaveLength(3); // null status is rendered too
      // Pixel rectangles: the stroke width is drawn as given, not stretched by a symbol scale (#2351).
      for (const path of [...backings, ...strokes]) {
        expect(path).not.toContain('matrix(');
        expect(path).toContain('stroke-width="2"');
      }
      expect([...backings, ...strokes].every(p => !/stroke-opacity="0\./.test(p))).toBe(true);
      expect(paths.filter(p => p.includes('fill-opacity="0.8"'))).toHaveLength(3);
    } finally { chart.dispose(); }
  });
});

describe('status rings stay inside thin cells (#2351)', () => {
  type Drawn = { shape: Rect; style: { lineWidth: number } };
  const drawn = (width: number, height: number) => (heatmapStatusOutlines([{ value: [0, 0, 25], status: { tone: 'danger', label: 'D' }, fill: token('chart-status-critical') }], [width, height]) as unknown as
    { id: string; data: unknown[][]; renderItem: (params: unknown, api: unknown) => Drawn }[])
    .map(s => ({ id: s.id, ...s.renderItem({}, { value: (d: number) => s.data[0][d], coord: () => [100, 50] }) }));
  it.each([[80, 40], [24, 15], [30, 8], [6, 6]])('a %ix%i cell keeps both rings inside the cell and at most a quarter of its short side', (width, height) => {
    const ring = statusRing(Math.min(width, height));
    expect(ring.border + ring.backing).toBeLessThanOrEqual(Math.min(width, height) / 4 + 1e-9);
    const cell = { x: 100 - width / 2, y: 50 - height / 2, width, height };
    const rings = drawn(width, height);
    for (const { shape, style: { lineWidth } } of rings) {
      // A rect stroke straddles its path: its outer edge is half the line width outside the shape.
      expect(shape.x - lineWidth / 2).toBeGreaterThanOrEqual(cell.x - 1e-9);
      expect(shape.y - lineWidth / 2).toBeGreaterThanOrEqual(cell.y - 1e-9);
      expect(shape.x + shape.width + lineWidth / 2).toBeLessThanOrEqual(cell.x + width + 1e-9);
      expect(shape.y + shape.height + lineWidth / 2).toBeLessThanOrEqual(cell.y + height + 1e-9);
    }
    const outline = rings.find(r => r.id === '__statusOutline')!;
    expect(outline.shape.x - outline.style.lineWidth / 2).toBeCloseTo(cell.x); // the border meets the cell edge
    const backing = rings.find(r => r.id === '__statusBacking');
    if (backing) expect(backing.shape.x - backing.style.lineWidth / 2).toBeCloseTo(cell.x + outline.style.lineWidth); // the backing meets the border's inner edge
  });
  it('a 24x15 cell (24 rows in 420px) keeps 7px of fill between the rings, where the centred 6px backing left 5px', () => {
    const rings = drawn(24, 15);
    const inner = Math.min(...rings.map(r => r.shape.height - r.style.lineWidth));
    expect(inner).toBeGreaterThanOrEqual(7 - 1e-9);
  });
});
