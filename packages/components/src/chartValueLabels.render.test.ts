// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette, type ChartOptionInput } from './buildChartOption';
import { resolveRowTotals } from './chartValueLabels';
import { seriesExtremes } from './chartLanes';
import type { ChartSeries } from './AnalysisChartFrame';

echarts.use([LineChart, BarChart, ScatterChart, DataZoomComponent, GridComponent, TooltipComponent, MarkAreaComponent, MarkLineComponent, LabelLayout, SVGRenderer]);

// What ECharts really draws: the built option rendered by its server-side SVG renderer. A jsdom test with a mocked chart cannot see a label that is never
// created (F1), a label wider than the segment ECharts resolved (F4) or one under a Min/Max chip (F6). Hidden labels are not in the SVG at all.
const bar = (id: string, color: ChartSeries['color'], categories: string[], values: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color, kind: 'bar', points: categories.map((x, n) => [x, values[n]]) });
type Drawn = { segment: string[]; total: string[]; chip: string[] };
function draw(displayed: ChartSeries[], categories: string[], size: { width: number; height: number }, more: Partial<ChartOptionInput> = {}, sum = true): Drawn {
  const totals = resolveRowTotals({ displayed, categories, mayClientSum: sum, allShown: true });
  const input: ChartOptionInput = {
    displayed, categories, previousIds: new Set(), xType: 'category', horizontal: true, zoom: [0, 100], brushMode: false, selection: null, annotations: [], noteSpans: [], noteLevels: [], timeExtent: 0,
    chartWidth: size.width, markLines: undefined, unit: 's', lang: 'ko', stacked: true, valueFormat: v => String(v), palette: resolveChartPalette(displayed), valueLabels: 'both', totals, rowPitch: 40, ...more,
  };
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: size.width, height: size.height });
  chart.setOption({ ...buildChartOption(input), animation: false });
  const svg = chart.renderToSVGString();
  chart.dispose();
  const out: Drawn = { segment: [], total: [], chip: [] };
  for (const [, style, text] of svg.matchAll(/<text[^>]*style="([^"]*)"[^>]*>([^<]*)<\/text>/g)) {
    if (style.includes('font-size:11px')) out.total.push(text);
    else if (style.includes('font-size:10px')) (style.includes('bold') ? out.chip : out.segment).push(text);
  }
  return out;
}
const R = ['R1', 'R2', 'R3'];
const wide = { width: 600, height: 150 };

describe('totals are drawn by ECharts (F1)', () => {
  const displayed = [bar('a', 'chart-blue', R, [800, 300, null]), bar('b', 'chart-series-1', R, [100, 200, 200])];
  it('draws a complete total and a partial total, plain', () => {
    expect(draw(displayed, R, wide).total).toEqual(['900', '500', '≥ 200']);
  });
  it('draws them in the fixed column with startAlign', () => {
    expect(draw(displayed, R, wide, { startAlign: true }).total).toEqual(['900', '500', '≥ 200']);
  });
  it('draws a server total of a measure that is not added', () => {
    const d = [bar('a', 'chart-blue', R, [8, 3, 2])];
    const totals = resolveRowTotals({ displayed: d, categories: R, mayClientSum: false, allShown: true, serverTotals: new Map([['R1', 0.5], ['R3', 0.7]]) });
    expect(draw(d, R, wide, { totals }, false).total).toEqual(['0.5', '0.7']);
  });
});

describe('a segment label that does not fit is not drawn (F4)', () => {
  const displayed = [bar('a', 'chart-blue', R, [800, 30, 400]), bar('b', 'chart-series-1', R, [100, 7, 400])];
  it('keeps the wide segments and drops the narrow ones, and a 0 or null has no label', () => {
    expect(draw(displayed, R, wide, { valueLabels: 'segment' }).segment).toEqual(['800', '400', '100', '400']);
    const withZero = [bar('a', 'chart-blue', R, [800, 0, null]), bar('b', 'chart-series-1', R, [100, 200, 200])];
    expect(draw(withZero, R, wide, { valueLabels: 'segment' }).segment).toEqual(['800', '100', '200', '200']);
  });
  it('drops every label when the bar is too thin for the text, with the pitch at its minimum and without a pitch', () => {
    expect(draw(displayed, R, { width: 600, height: 60 }, { valueLabels: 'segment', rowPitch: undefined }).segment).toEqual([]);
    expect(draw(displayed, R, { width: 600, height: 150 }, { valueLabels: 'segment', rowPitch: undefined }).segment).toContain('800');
  });
  it('drops a label that the long Korean category names squeeze out of a narrow chart', () => {
    const cats = ['사출성형 설비 제1공장 A동 보조 모듈', '사출성형 설비 제2공장 B동 보조 모듈'];
    const d = [bar('a', 'chart-blue', cats, [120, 40]), bar('b', 'chart-series-1', cats, [30, 1000])];
    const roomy = draw(d, cats, { width: 900, height: 120 }, { valueLabels: 'segment', rowPitch: undefined }).segment;
    const narrow = draw(d, cats, { width: 420, height: 120 }, { valueLabels: 'segment', rowPitch: undefined }).segment;
    expect(roomy).toContain('120');
    expect(narrow).not.toContain('120');
    expect(narrow).toContain('1천');
  });
  it('keeps the same rule in lanes', () => {
    const lanes = draw(displayed, R, wide, { valueLabels: 'segment', startAlign: true }).segment;
    expect(lanes).toContain('800');
    expect(lanes).not.toContain('7');
  });
});

describe('minMax on draws no segment labels, totals stay (D7)', () => {
  const displayed = [bar('a', 'chart-blue', R, [800, 300, 100]), bar('b', 'chart-series-1', R, [100, 100, 100])];
  const extremes = seriesExtremes(displayed);
  it('draws the chips and the totals but no segment number', () => {
    const drawn = draw(displayed, R, wide, { valueLabels: 'both', extremes });
    expect(drawn.chip).toEqual(expect.arrayContaining(['최대', '최소']));
    expect(drawn.segment).toEqual([]);
    expect(drawn.total).toEqual(['900', '400', '200']);
  });
  it('keeps the segment numbers when minMax is off (control)', () => {
    expect(draw(displayed, R, wide, { valueLabels: 'segment' }).segment).toContain('800');
  });
  it('draws no segment number in lanes either, and the chips stay', () => {
    const drawn = draw(displayed, R, wide, { valueLabels: 'segment', extremes, startAlign: true });
    expect(drawn.segment.filter(t => /\d/.test(t))).toEqual([]); // the lane names (A, B) are 10px text too
    expect(drawn.chip).toContain('최대');
  });
});

// A category dataZoom (no rowPitch) filters rows out and ECharts renumbers the rest; the fit decision follows the resolved segment box, not that index (G1).
describe('a zoom window that excludes leading rows (G1)', () => {
  const C = ['R1', 'R2', 'R3', 'R4'];
  const displayed = [bar('a', 'chart-blue', C, [900, 12, 1, 600]), bar('b', 'chart-series-1', C, [100, 100, 40, 100])];
  it('still drops an ordinary narrow number and keeps the wide ones', () => {
    const drawn = draw(displayed, C, { width: 600, height: 200 }, { valueLabels: 'segment', rowPitch: undefined, zoom: [25, 100] }).segment;
    expect(drawn).not.toContain('12');
    expect(drawn.filter(t => t === '600')).toHaveLength(1);
  });
});

describe('a label that yields leaves nothing behind (G3)', () => {
  const SURFACE = '#fedcba';
  const svgOf = (displayed: ChartSeries[], size: { width: number; height: number }, more: Partial<ChartOptionInput> = {}) => {
    const palette = { ...resolveChartPalette(displayed), labelSurface: SURFACE };
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: size.width, height: size.height });
    chart.setOption({ ...buildChartOption({
      displayed, categories: R, previousIds: new Set(), xType: 'category', horizontal: true, zoom: [0, 100], brushMode: false, selection: null, annotations: [], noteSpans: [], noteLevels: [], timeExtent: 0,
      chartWidth: size.width, markLines: undefined, unit: 's', lang: 'ko', stacked: true, valueFormat: v => String(v), palette, valueLabels: 'segment', rowPitch: undefined, ...more,
    }), animation: false });
    const svg = chart.renderToSVGString();
    chart.dispose();
    return svg;
  };
  const heat = (values: (number | null)[]) => [bar('a', 'chart-heat-div-0', R, values)];
  // A background or hit target is a path in the surface colour with an area; the collapsed label of a yielded number leaves at most an empty path (`M0 0Z`: no area, nothing to see or hover).
  const boxes = (svg: string) => [...svg.matchAll(/<path d="([^"]*)"[^>]*fill="#fedcba"/g)].filter(([, d]) => d !== 'M0 0Z').length;
  const texts = (svg: string) => [...svg.matchAll(/<text[^>]*font-size:10px[^>]*>([^<]+)<\/text>/g)].length;
  it('draws a surface box for every number that fits (control)', () => {
    const svg = svgOf(heat([800, 400, 600]), wide);
    expect([boxes(svg), texts(svg)]).toEqual([3, 3]);
  });
  it.each([
    ['a narrow segment', heat([1000, 1, 1000]), wide, 2],
    ['a zero and a null', heat([800, 0, null]), wide, 1],
    ['a bar too thin for the text', heat([800, 400, 600]), { width: 600, height: 40 }, 0],
  ] as const)('has no text, background or padding box for %s', (_, d, size, drawn) => {
    const svg = svgOf([...d], size);
    expect([boxes(svg), texts(svg)]).toEqual([drawn, drawn]);
  });
});
