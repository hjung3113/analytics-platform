// @vitest-environment node
import * as echarts from 'echarts/core';
import { CustomChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { expect, it } from 'vitest';
import type { ParetoSpec, ScatterSpec } from '../AnalysisChart';
import { paretoData, scatterData } from '../analysisChartKinds';
import { buildChartOption } from '../buildChartOption';
import { histogramData } from '../histogram';
import { baselineInput } from '../__fixtures__/baselineInput';
import main from '../__fixtures__/buildChartOption.main.json';

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
