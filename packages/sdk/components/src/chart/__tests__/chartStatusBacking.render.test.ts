// @vitest-environment node
import { createHash } from 'node:crypto';
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
import { CHART_ECHARTS_THEME } from '../chartMarks';
import type { ChartSeries } from '../AnalysisChartFrame';

echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);

type Rect = { x: number; y: number; width: number; height: number };
type NativeData = { count: () => number; getItemLayout: (n: number) => Rect; getRawIndex: (n: number) => number };
type NativeModel = { getSeriesByIndex: (n: number) => { getData: () => NativeData } };
const closeRect = (a: Rect, b: Rect) => { for (const key of ['x', 'y', 'width', 'height'] as const) expect(a[key], key).toBeCloseTo(b[key], 5); };

it('preserves the legacy time stacked-bar option and status rendering from origin/main', () => {
  const times = ['2026-11-16T00:00:00', '2026-11-16T01:00:00', '2026-11-16T02:00:00'];
  const displayed: ChartSeries[] = [
    { id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [[times[0], 2], [times[1], 4]] },
    { id: 'b', name: 'B', color: 'chart-blue', kind: 'bar', points: [[times[1], 3], [times[2], 8]] },
  ];
  const option = buildChartOption(baselineInput({ xType: 'time', horizontal: false, stacked: true, displayed, activeCategory: null, extremes: undefined, pointStatus: () => ({ tone: 'warning', label: 'Status' }) }));
  const rings = (option.series as CustomSeriesOption[]).filter(s => String(s.id).startsWith('__statusBarBacking'));
  const rendered = rings.map(({ data, renderItem }) => (data as number[][]).map(row =>
    (renderItem as (params: unknown, api: unknown) => unknown)({}, { value: (d: number) => row[d], coord: ([x, y]: number[]) => [x / 3_600_000, y * 20], barLayout: () => undefined, size: () => [20, 20] })));
  // Hash the option and callback output, since JSON serialization omits renderItem itself.
  expect(createHash('sha256').update(JSON.stringify({ option, rendered })).digest('hex')).toBe('2cccda153d237c5cbab5a763ecada5e1dcdc16f58319cb79fe7bd3a909666d1a');
});

it('adds a dashed emphasis around only the matching status bar', () => {
  const displayed: ChartSeries[] = [{ id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [['R1', 8], ['R2', 4]] }];
  const selection = '#872bd0';
  const input = baselineInput({ categories: ['R1', 'R2'], displayed, activeCategory: null, extremes: undefined,
    palette: { ...resolveChartPalette(displayed), selection }, pointStatus: () => ({ tone: 'warning', label: 'Status' }) });
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 800, height: 260 });
  const emphasis = () => chart.renderToSVGString().split('\n').filter(line => line.includes(`stroke="${selection}"`) && line.includes('stroke-dasharray='));
  try {
    chart.setOption({ ...buildChartOption(input), animation: false }, { notMerge: true });
    expect(emphasis()).toHaveLength(0);
    chart.setOption({ ...buildChartOption({ ...input, highlightedValues: ['R1'] }), animation: false }, { notMerge: true });
    expect(emphasis()).toHaveLength(1);
  } finally { chart.dispose(); }
});

describe('effective status borders drawn by ECharts (#2326 C1)', () => {
  it.each([
    { horizontal: true, stacked: true, startAlign: false, xType: 'category' as const },
    { horizontal: true, stacked: true, startAlign: true, xType: 'category' as const },
    { horizontal: false, stacked: false, startAlign: false, xType: 'category' as const },
    { horizontal: false, stacked: false, startAlign: false, xType: 'time' as const },
    { horizontal: false, stacked: true, explicitStack: true, startAlign: false, xType: 'time' as const },
  ])('aligns double strokes with native bar rectangles: %j', extra => {
    const categories = extra.xType === 'time' ? ['2026-11-16T00:00:00', '2026-11-16T01:00:00', '2026-11-16T02:00:00'] : ['R1', 'R2', 'R3'];
    const displayed: ChartSeries[] = [
      { id: 'a', name: 'A', color: 'chart-status-warn', kind: 'bar', points: categories.map((x, n) => [x, [8, 4, 0.2][n]]) }, // 0.2: a piece only a few px long (#2351)
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
    // The theme EChart draws with sets the native bar layout the rings follow (#2725).
    const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 800, height: 260 });
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
          const short = Math.min(box.width, box.height);
          const border = statusRing(short).border;
          const strokes = rects[n];
          // Border and backing together stay within a quarter of the piece's short side (#2351 review C1).
          expect(strokes.reduce((sum, s) => sum + s.lineWidth, 0)).toBeLessThanOrEqual(short / 4 + 1e-9);
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

it('draws every bar status ring in the inset layer, including a status that needs no backing (#2351 review C1)', () => {
  const displayed: ChartSeries[] = [{ id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [['R1', 8]] }];
  const input = baselineInput({ horizontal: false, stacked: false, categories: ['R1'], displayed, activeCategory: null, extremes: undefined, palette: resolveChartPalette(displayed), pointStatus: () => ({ tone: 'neutral', label: 'Unknown' }) });
  const option = buildChartOption(input) as { series: { id: string; data: ({ itemStyle: { borderWidth: number } } | number)[] }[] };
  expect((option.series.find(s => s.id === 'a')!.data[0] as { itemStyle: { borderWidth: number } }).itemStyle.borderWidth).toBe(0);
  expect(option.series.some(s => s.id === '__statusBarBacking')).toBe(true);
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
  it.each([[0, 15], [24, 0], [0, 0]])('a %ix%i cell (dense grid or unmeasured plot) draws no ring, and the layers clip to the plot (#2351 review C2)', (width, height) => {
    const series = heatmapStatusOutlines([{ value: [0, 0, 25], status: { tone: 'danger', label: 'D' }, fill: token('chart-status-critical') }], [width, height]) as unknown as { clip: boolean }[];
    expect(series.every(s => s.clip)).toBe(true);
    expect(drawn(width, height).every(r => (r as { ignore?: boolean }).ignore)).toBe(true);
    expect(drawn(24, 15).some(r => (r as { ignore?: boolean }).ignore)).toBe(false);
  });
  it('a 24x15 cell (24 rows in 420px) keeps 7px of fill between the rings, where the centred 6px backing left 5px', () => {
    const rings = drawn(24, 15);
    const inner = Math.min(...rings.map(r => r.shape.height - r.style.lineWidth));
    expect(inner).toBeGreaterThanOrEqual(7 - 1e-9);
  });
});

it('draws a separate unfilled dashed line mark outside and above its status halo', () => {
  const displayed: ChartSeries[] = [{ id: 'a', name: 'A', color: 'chart-blue', kind: 'line', points: [['R1', 8], ['R2', 4]] }];
  const selection = '#872bd0';
  const input = baselineInput({ horizontal: false, stacked: false, categories: ['R1', 'R2'], displayed,
    activeCategory: null, extremes: undefined, highlightedValues: ['R1'],
    palette: { ...resolveChartPalette(displayed), selection }, pointStatus: () => ({ tone: 'warning', label: 'Status' }) });
  const option = buildChartOption(input) as { series: { id: string }[] };
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 800, height: 260 });
  try {
    chart.setOption({ ...option, animation: false });
    const svg = chart.renderToSVGString();
    const paths = svg.match(/<path[^>]*>/g)!;
    const halo = paths.findIndex(path => path.includes(`ecmeta_series_index="${option.series.findIndex(s => s.id === '__line-halo-a')}"`));
    const status = paths.findIndex(path => path.includes(`ecmeta_series_index="${option.series.findIndex(s => s.id === '__line-status-a')}"`));
    const dashed = paths.filter(path => path.includes(`stroke="${selection}"`) && path.includes('stroke-dasharray='));
    expect(dashed).toHaveLength(1);
    expect(dashed[0]).toContain('fill="none"');
    expect(halo).toBeGreaterThanOrEqual(0);
    expect(status).toBeGreaterThan(halo);
    expect(paths.indexOf(dashed[0])).toBeGreaterThan(status);
    const radius = (path: string) => Number(path.match(/A([\d.]+) /)?.[1]) * Number(path.match(/matrix\(([\d.]+),/)?.[1] ?? 1);
    expect(radius(dashed[0])).toBeGreaterThan(radius(paths[halo]) + 1);
    expect(svg).toContain('◆');
  } finally { chart.dispose(); }
});

it('keeps dashed outlines inside both thin adjacent category stacked pieces', () => {
  const [firstX, secondX] = ['R1', 'R2'];
  const displayed: ChartSeries[] = [
    { id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [[firstX, 0.25], [secondX, 100]] },
    { id: 'b', name: 'B', color: 'chart-teal', kind: 'bar', points: [[firstX, 0.25], [secondX, 100]] },
  ];
  const option = buildChartOption(baselineInput({ horizontal: true, xType: 'category', stacked: true, categories: [firstX, secondX], displayed,
    activeCategory: null, extremes: undefined, highlightedValues: [firstX], palette: resolveChartPalette(displayed),
    pointStatus: ({ seriesId }) => ({ tone: seriesId === 'a' ? 'danger' : 'warning', label: 'Status' }) })) as { series: CustomSeriesOption[] };
  const dashed: { shape: Rect; style: { lineWidth: number } }[] = [];
  for (const ring of option.series.filter(s => String(s.id).startsWith('__statusBarBacking')) as CustomSeriesOption[]) {
    const original = ring.renderItem as Exclude<CustomSeriesOption['renderItem'], undefined | string>;
    ring.renderItem = (params, api) => {
      const result = original(params, api) as { children: { shape: Rect; style: { lineWidth: number; lineDash?: number[] } }[] };
      dashed.push(...result.children.filter(child => child.style.lineDash));
      return result as ReturnType<typeof original>;
    };
  }
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 800, height: 260 });
  try {
    chart.setOption({ ...option, animation: false });
    const model = (chart as unknown as { getModel: () => NativeModel }).getModel();
    const [first, second] = displayed.map(({ id }) => model.getSeriesByIndex(option.series.findIndex(s => s.id === id)).getData().getItemLayout(0));
    expect(first.x + first.width).toBeCloseTo(second.x, 6);
    expect(dashed).toHaveLength(2);
    for (const [raw, { shape, style: { lineWidth } }] of [[first, dashed[0]], [second, dashed[1]]] as const) {
      const x = Math.min(raw.x, raw.x + raw.width);
      const y = Math.min(raw.y, raw.y + raw.height);
      const width = Math.abs(raw.width);
      const height = Math.abs(raw.height);
      expect(Math.min(width, height)).toBeLessThan(2);
      expect(lineWidth).toBeGreaterThan(0);
      expect(shape.x - lineWidth / 2).toBeGreaterThanOrEqual(x - 1e-6);
      expect(shape.x + shape.width + lineWidth / 2).toBeLessThanOrEqual(x + width + 1e-6);
      expect(shape.y - lineWidth / 2).toBeGreaterThanOrEqual(y - 1e-6);
      expect(shape.y + shape.height + lineWidth / 2).toBeLessThanOrEqual(y + height + 1e-6);
    }
  } finally { chart.dispose(); }
});

it('draws no dashed bar outline for highlightedValues on a time axis', () => {
  const time = '2026-11-16T00:00:00';
  const displayed: ChartSeries[] = [{ id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [[time, 8]] }];
  const selection = '#872bd0';
  const input = baselineInput({ xType: 'time', horizontal: false, displayed, activeCategory: null, extremes: undefined,
    highlightedValues: [time], palette: { ...resolveChartPalette(displayed), selection } });
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 400, height: 260 });
  try {
    chart.setOption({ ...buildChartOption(input), animation: false });
    const paths = chart.renderToSVGString().match(/<path[^>]*>/g) ?? [];
    expect(paths.filter(path => path.includes(`stroke="${selection}"`) && path.includes('stroke-dasharray='))).toHaveLength(0);
  } finally { chart.dispose(); }
});
