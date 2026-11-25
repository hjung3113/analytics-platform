// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette } from '../buildChartOption';
import { baselineInput, type BaselineOverrides } from '../__fixtures__/baselineInput';

echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);
function draw(extra: BaselineOverrides, check?: (chart: ReturnType<typeof echarts.init>) => void) {
  const input = baselineInput(extra);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 260 });
  try {
    chart.setOption({ ...buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) }), animation: false });
    check?.(chart);
    return chart.renderToSVGString();
  } finally { chart.dispose(); }
}
const rowGroups = { header: '설비', byCategory: new Map([
  ['R1', { group: 'EQ1', label: 'PM1' }], ['R2', { group: 'EQ1', label: 'PM2' }], ['R3', { group: 'EQ2', label: 'PM1' }], ['R4', { group: 'EQ1', label: 'PM3' }],
]) };
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

const warning = () => ({ tone: 'warning' as const, label: 'High' });
const total = { value: 900, partial: false, missing: [] };
const categoryValueMarks = { label: 'Measured total', byCategory: new Map([['R1', 950]]) };
const horizontalCollisions = [
  ['__total', { valueLabels: 'total', totals: new Map([['R1', total]]), totalText: new Map([['R1', 'Row total']]) }, '>Row total</text>'],
  ['__spacer-1', { startAlign: true }, 'ecmeta_series_index="1"'],
  ['__categoryValueMark', { categoryValueMarks }, 'ecmeta_series_index="2"'],
  ['__overlay', {}, '>목표</text>'],
  ['__rowGroups', { rowGroups }, '>EQ2</text>'],
  ['__statusBarBacking', { pointStatus: warning }, 'ecmeta_series_index="2"'],
  ['__statusBarBacking-1', { pointStatus: warning, startAlign: true }, 'ecmeta_series_index="4"'],
] satisfies [string, BaselineOverrides, string][];
const verticalCollisions = [
  ['__bounds-upper', 'stroke-dasharray="8,4"'],
  ['__bounds-lower', 'stroke-dasharray="2,4"'],
  ['__bounds-band', 'fill-opacity="0.12"'],
  ['__line-halo-a', 'ecmeta_series_index="3"'],
  ['__line-status-a', '>◆</text>'],
  ['__line-highlight-a', 'ecmeta_series_index="5"'],
] as const;

function expectConsumerSeries(chart: ReturnType<typeof echarts.init>, id: string) {
  const series = chart.getOption().series as { id?: string; name?: string }[];
  expect(series.filter(entry => entry.id === id)).toEqual([expect.objectContaining({ name: 'Consumer series' })]);
  expect(series.filter(entry => entry.id === `${id}~1`)).toHaveLength(1);
}

it.each(horizontalCollisions)('renders a horizontal consumer series with ID %s and its reading aids', (id, options, marker) => {
  const displayed = baselineInput().displayed.map((s, index) => index === 0 ? { ...s, id, name: 'Consumer series' } : s);
  const svg = draw({ ...options, displayed, extremes: undefined }, chart => expectConsumerSeries(chart, id));
  expect(svg).toContain('ecmeta_series_index="0"');
  expect(svg).toContain(marker);
});

it.each(verticalCollisions)('renders a vertical consumer series with ID %s and its reading aids', (id, marker) => {
  const displayed = baselineInput().displayed.map((s, index) => ({
    ...s, ...(index === 1 ? { id, name: 'Consumer series' } : { kind: 'line' as const }),
  }));
  const svg = draw({
    displayed, horizontal: false, stacked: false, rowPitch: undefined, extremes: undefined, markLines: undefined,
    bounds: new Map([['R1', { lower: 1, upper: 1000 }]]),
    pointStatus: point => point.seriesId === 'a' ? warning() : undefined,
    highlightedValues: ['R1'],
  }, chart => expectConsumerSeries(chart, id));
  expect(svg).toContain('ecmeta_series_index="1"');
  expect(svg).toContain(marker);
});
describe('ECharts draws the reading aids (#2326)', () => {
  it.each([26, undefined])('draws one group label per run and short labels, rowPitch=%s', rowPitch => {
    const drawn = texts(draw({ rowGroups, rowPitch }));
    expect(drawn.filter(t => t === 'EQ1')).toHaveLength(2);
    expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
    expect(drawn).toContain('PM2');
    expect(drawn).not.toContain('R2');
  });
  it('keeps a partially zoomed group and excludes group runs outside the zoom window', () => {
    const drawn = texts(draw({ rowGroups, rowPitch: undefined, zoom: [25, 66] }));
    expect(drawn.filter(t => t === 'EQ1')).toHaveLength(1);
    expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
  });
  it('draws status markers alongside minimum and maximum chips, never on null pieces', () => {
    const drawn = texts(draw({ pointStatus: () => ({ tone: 'warning', label: 'High' }) }));
    expect(drawn.filter(t => t === '◆')).toHaveLength(7);
    expect(drawn.some(t => t.includes('최소'))).toBe(true);
    expect(drawn.some(t => t.includes('최대'))).toBe(true);
  });
});

it.each([26, undefined])('draws aligned run labels and separators in startAlign, rowPitch=%s', rowPitch => {
  const svg = draw({ startAlign: true, rowGroups, rowPitch });
  const drawn = texts(svg);
  expect(drawn.filter(t => t === 'EQ1')).toHaveLength(2);
  expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
  expect(drawn).toContain('PM2');
  const rowYs = [...svg.matchAll(/<text[^>]*transform="translate\([^ ]+ ([^)]+)\)"[^>]*>PM[^<]*<\/text>/g)].map(m => Number(m[1]));
  const groupYs = [...svg.matchAll(/<text[^>]*y="([^" ]+)"[^>]*>EQ[^<]*<\/text>/g)].map(m => Number(m[1]));
  expect(rowYs).toHaveLength(4);
  expect(groupYs).toEqual([(rowYs[0] + rowYs[1]) / 2, rowYs[2], rowYs[3]]);
  const separators = [...svg.matchAll(/<path d="M12 ([^L]+)L[^ ]+ ([^" ]+)"[^>]*ecmeta_silent="true"/g)].map(m => [Number(m[1]), Number(m[2])]);
  expect(separators).toEqual([[(rowYs[1] + rowYs[2]) / 2, (rowYs[1] + rowYs[2]) / 2], [(rowYs[2] + rowYs[3]) / 2, (rowYs[2] + rowYs[3]) / 2]]);
});
it.each([false, true])('draws startAlign status glyphs only on real pieces, minMax=%s', minMax => {
  const drawn = texts(draw({ startAlign: true, extremes: minMax ? baselineInput().extremes : undefined, pointStatus: () => ({ tone: 'warning', label: 'High' }) }));
  expect(drawn.filter(t => t === '◆')).toHaveLength(7);
  expect(drawn.some(t => t.includes('최소'))).toBe(minMax);
  expect(drawn.some(t => t.includes('최대'))).toBe(minMax);
});

describe('empty category labels (#2700)', () => {
  const displayed = baselineInput().displayed.map((series, index) => ({
    ...series, points: series.points.map(([x, y]): [string, number | null] => {
      const empty = x === 'R3' || x === 'R4' || (x === 'R2' && index === 0);
      return [x, empty ? null : y];
    }),
  }));
  const emptyCategoryLabel = 'Held out';
  const labelCount = (extra: BaselineOverrides) => texts(draw({ displayed, extremes: undefined, ...extra })).filter(t => t === emptyCategoryLabel).length;

  it.each([
    { stacked: false },
    { stacked: true },
    { stacked: true, startAlign: true, rowGroups },
  ])('draws one text mark per empty row with %j', options => {
    expect(labelCount({ ...options, emptyCategoryLabel })).toBe(2);
  });

  it('follows the category zoom window and grouped row order', () => {
    const svg = draw({ displayed, extremes: undefined, emptyCategoryLabel, rowGroups, rowPitch: undefined, zoom: [25, 66] });
    const markerY = svg.match(/<text[^>]*y="([^"]+)"[^>]*>Held out<\/text>/)?.[1];
    const rowY = svg.match(/<text[^>]*transform="translate\([^ ]+ ([^)]+)\)"[^>]*>PM1<\/text>/)?.[1];
    expect(texts(svg).filter(t => t === emptyCategoryLabel)).toHaveLength(1);
    expect(markerY).toBeDefined();
    expect(markerY).toBe(rowY);
  });

  it('draws when a consumer series uses the internal marker name as its id', () => {
    const clashing = displayed.map((series, index) => index === 0 ? { ...series, id: '__emptyCategoryLabel' } : series);
    expect(texts(draw({ displayed: clashing, extremes: undefined, emptyCategoryLabel })).filter(t => t === emptyCategoryLabel)).toHaveLength(2);
  });

  it('draws no mark by default or on vertical charts', () => {
    expect(labelCount({})).toBe(0);
    expect(labelCount({ horizontal: false, emptyCategoryLabel })).toBe(0);
  });
});
