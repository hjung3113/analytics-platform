// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { ParetoSpec, ScatterSpec } from '../AnalysisChart';
import { boxPlotData, KindLegend, paretoData, scatterData } from '../analysisChartKinds';
import { buildChartOption, resolveChartPalette } from '../buildChartOption';
import { projectChartBounds } from '../chartBounds';
import { ChartBoundsLegend } from '../ChartBoundsLegend';
import { histogramData } from '../histogram';
import { topNData } from '../topNBar';
import { chartReferenceLineTheme, token } from '../EChart';
import type { ChartReferenceMark } from '../referenceMarks';
import { referenceBandData } from '../referenceMarks';
import { baselineInput } from '../__fixtures__/baselineInput';
import main from '../__fixtures__/buildChartOption.main.json';

echarts.use([BarChart, BoxplotChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent,
  GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, SVGRenderer]);

function renderOption(option: ReturnType<typeof buildChartOption>) {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    chart.setOption({ ...option, animation: false });
    return chart.renderToSVGString();
  } finally { chart.dispose(); }
}

function frameOption(referenceMarks: ChartReferenceMark[], horizontal: boolean) {
  const input = baselineInput({
    referenceMarks, horizontal, stacked: false, rowPitch: undefined, extremes: undefined, activeCategory: undefined,
    categories: ['A', 'B'], displayed: [{ id: 'a', name: 'A', color: 'chart-blue',
      kind: horizontal ? 'bar' : 'line', points: [['A', 4], ['B', 6]] }],
  });
  return buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) });
}

it.each([
  { name: 'horizontal Frame', axis: 'x', option: (marks: ChartReferenceMark[]) => frameOption(marks, true) },
  { name: 'vertical Frame', axis: 'y', option: (marks: ChartReferenceMark[]) => frameOption(marks, false) },
  ...(['x', 'y'] as const).map(axis => ({ name: 'histogram', axis, option: (referenceMarks: ChartReferenceMark[]) => histogramData({
    kind: 'histogram', xLabel: 'Duration', xUnit: 's', bins: [{ start: 1, end: 5, count: 4 }], referenceMarks,
  }, 'en').option([]) })),
  { name: 'box plot', axis: 'y', option: (referenceMarks: ChartReferenceMark[]) => boxPlotData({
    kind: 'boxPlot', whisker: 'minMax',
    groups: [{ id: 'a', label: 'A', stats: { min: 4, q1: 4, median: 5, q3: 6, max: 6 } }], referenceMarks,
  }, 'en', 's').option([]) },
  { name: 'Top N', axis: 'x', option: (referenceMarks: ChartReferenceMark[]) => topNData({
    kind: 'topNBar', items: [{ id: 'a', label: 'A', value: 6, colorToken: 'chart-blue' }], referenceMarks,
  }, 'en', 's').option([]) },
] as const)('renders out-of-data bands and fractional lines on the $name $axis axis', ({ axis, option }) => {
  const svg = renderOption(option([
    { type: 'band', axis, from: 10, to: 20, label: 'High band' },
    { type: 'band', axis, from: -20, to: -10, label: 'Low band' },
    { type: 'line', axis, value: -30.126, label: 'Low line' },
    { type: 'line', axis, value: 30.126, label: 'High line' },
  ]));
  const labels = ['High band', 'Low band', 'Low line', 'High line'];
  expect(labels.filter(label => svg.includes(`>${label}</text>`))).toEqual(labels);
});

it.each(['Frame', 'category scatter'] as const)('keeps $0 bound strokes, fills and legend unchanged when reference lines are restyled', kind => {
  const lineColor = token('chart-series-1');
  const boundColor = token('text-secondary');
  const referenceMarks: ChartReferenceMark[] = [
    { type: 'band', axis: 'y', from: 10, to: 20, label: 'Operating range' },
    { type: 'line', axis: 'y', value: 5, label: 'Target' },
  ];
  const bounds = new Map([['R1', { lower: 1, upper: 7 }]]);
  function render() {
    if (kind === 'Frame') {
      const input = baselineInput({ horizontal: false, bounds, referenceMarks });
      const option = buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) });
      return { svg: renderOption(option), legend: renderToStaticMarkup(createElement(ChartBoundsLegend, { bounds: projectChartBounds(input) })) };
    }
    const projection = scatterData({
      kind: 'scatter', xLabel: 'Cell', yLabel: 'Duration', xUnit: 's', points: [{ id: 'a', category: 'a', x: null, y: 4 }],
      xCategories: { order: ['a'], bounds: new Map([['a', { lower: 1, upper: 7 }]]) }, referenceMarks,
    }, 'en', 's');
    return { svg: renderOption(projection.option([])), legend: renderToStaticMarkup(createElement(KindLegend, { items: projection.legend.slice(-3) })) };
  }
  const plotMarks = (svg: string) => [...svg.matchAll(/<(?:path|polygon)[^>]+>/g)].map(([tag]) => tag.replace(/ class="[^"]+"/, ''));
  const strokes = (svg: string) => plotMarks(svg)
    .filter(tag => tag.includes(`stroke="${boundColor}"`) && /stroke-dasharray="(8,4|2,4)"/.test(tag));
  const fills = (svg: string) => plotMarks(svg)
    .filter(tag => tag.includes(`fill="${boundColor}"`) && tag.includes('fill-opacity="0.12"'));
  const original = render();
  expect(strokes(original.svg)).toHaveLength(2);
  expect(fills(original.svg)).toHaveLength(2);
  expect(original.legend).toContain(boundColor);
  const base = chartReferenceLineTheme.base;
  const restyle = vi.spyOn(chartReferenceLineTheme, 'base').mockImplementation(() => {
    const style = base(lineColor);
    return { ...style, lineStyle: { ...style.lineStyle, opacity: 0.5 } };
  });
  try {
    const { svg, legend } = render();
    expect(svg).toContain('>Operating range</text>');
    expect(svg.match(/<text[^>]+>Target<\/text>/)?.[0]).toContain(`fill="${lineColor}"`);
    expect(plotMarks(svg).some(tag => tag.includes(`stroke="${lineColor}"`) && tag.includes('stroke-opacity="0.5"'))).toBe(true);
    expect(strokes(svg)).toEqual(strokes(original.svg));
    expect(fills(svg)).toEqual(fills(original.svg));
    expect(legend).toBe(original.legend);
  } finally { restyle.mockRestore(); }
});

it('keeps the serialized Frame option for legacy markLines byte-identical', () => {
  expect(JSON.stringify(buildChartOption(baselineInput()))).toBe(JSON.stringify(main));
});

it('projects new scatter lines identically to legacy referenceLines on both axes', () => {
  const spec: ScatterSpec = { kind: 'scatter', xLabel: 'X', yLabel: 'Y', xUnit: 's', points: [{ id: 'a', x: 3, y: 4 }] };
  const lines = [{ axis: 'x', value: 3, label: 'Target' }, { axis: 'y', value: 4, label: 'Limit' }] as const;
  const legacy = scatterData({ ...spec, referenceLines: [...lines] }, 'en', 's').option([]);
  const current = scatterData({ ...spec, referenceMarks: lines.map(line => ({ ...line, type: 'line', kind: 'target' })) }, 'en', 's').option([]);
  expect(JSON.stringify(current)).toBe(JSON.stringify(legacy));
});

it('renders an opt-in reference band with its label', () => {
  echarts.use([CustomChart, ScatterChart, GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 480, height: 280 });
  try {
    const data = histogramData({ kind: 'histogram', xLabel: 'Duration', xUnit: 's', bins: [{ start: 1, end: 5, count: 4 }],
      referenceMarks: [{ type: 'band', axis: 'x', from: 2, to: 4, label: 'Operating range' }] }, 'en');
    chart.setOption({ ...data.option([]), animation: false });
    expect(chart.renderToSVGString()).toContain('Operating range');
  } finally { chart.dispose(); }
});

it('places a band label inside its start corner, away from the line label at the plot end', () => {
  const theme = { referenceBand: { color: '#64748b', opacity: 0.12 } } as Parameters<typeof referenceBandData>[0];
  const [y] = referenceBandData(theme, [{ type: 'band', axis: 'y', from: 80, to: 90, label: 'Range' }]) as [{ label: unknown }, unknown][];
  const [x] = referenceBandData(theme, [{ type: 'band', axis: 'x', from: 1, to: 2, label: 'Range' }]) as [{ label: unknown }, unknown][];
  expect(y[0].label).toMatchObject({ position: 'insideTopLeft', fontSize: 12 });
  expect(x[0].label).toMatchObject({ position: 'insideTop', fontSize: 12 });
});

it('draws the population P95 through the same Frame option as its legacy markLine', () => {
  const legacy = buildChartOption(baselineInput({ horizontal: false, markLines: [{ y: 300, label: 'P95 300 s' }] }));
  const current = buildChartOption(baselineInput({ horizontal: false, markLines: undefined,
    referenceMarks: [{ type: 'line', axis: 'y', kind: 'statistic', value: 300, label: 'P95 300 s' }] }));
  expect(JSON.stringify(current)).toBe(JSON.stringify(legacy));
});

it('draws the default Pareto 80% line with declared lines on the shared marker', () => {
  const spec: ParetoSpec = { kind: 'pareto', items: [{ id: 'a', label: 'A', value: 10 }],
    referenceMarks: [{ type: 'line', axis: 'y', kind: 'previous', value: 90, label: 'Previous target' }] };
  const option = paretoData(spec, 'en', 's').option([]) as { series: { markLine: { data: unknown[] } }[] };
  expect(option.series[1].markLine.data).toEqual([{ name: '80%', yAxis: 80 }, { name: 'Previous target', yAxis: 90 }]);
});

it('ignores non-finite legacy values and non-finite band endpoints', () => {
  const empty = buildChartOption(baselineInput({ markLines: undefined }));
  expect([
    buildChartOption(baselineInput({ markLines: [{ y: Infinity, label: 'Invalid' }] })),
    buildChartOption(baselineInput({ markLines: undefined,
      referenceMarks: [{ type: 'band', axis: 'x', from: NaN, to: 5, label: 'Invalid' }] })),
  ].map(option => JSON.stringify(option))).toEqual([JSON.stringify(empty), JSON.stringify(empty)]);
});
