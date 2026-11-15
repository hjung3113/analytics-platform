import { expect, it } from 'vitest';
import { scatterData } from '../analysisChartKinds';
import type { ScatterSpec } from '../AnalysisChart';
import { token } from '../EChart';
import { statusBorderColor, statusFill } from '../chartStatus';

const status = { tone: 'danger' as const, label: 'High', reason: 'Above range' };
const fixture = (categorical: boolean): ScatterSpec => ({ kind: 'scatter', xUnit: 'x', xLabel: 'Cell', yLabel: 'Value', points: [
  { id: 'normal', x: 0, y: 1, category: 'a' },
  { id: 'high', x: 1, y: 12, category: 'b', status },
  { id: 'unknown', x: null, y: null, category: 'a' },
], ...(categorical ? { xCategories: { order: ['a', 'b'], bounds: new Map([['a', { lower: 0, upper: 10 }], ['b', { lower: 0, upper: 10 }]]) } } : {}) });
type Datum = { symbolSize?: number; itemStyle: { color: string; opacity?: number; borderWidth: number; borderColor: string; shadowBlur?: number; shadowColor?: string }; label?: { show: boolean; formatter: string }; emphasis?: { label: { show: boolean; formatter: string } } };
type Series = { id?: string; symbolSize?: number; silent?: boolean; data: Datum[]; itemStyle?: { opacity: number }; markArea?: { itemStyle: { opacity: number } }; markLine?: { data: unknown[] } };
type Option = { series: Series[]; tooltip: { formatter: (p: { seriesIndex: number; dataIndex: number }) => string } };

it.each([false, true])('quiet styles normal/status points without backing or resting glyph (categorical=%s)', categorical => {
  const p = scatterData({ ...fixture(categorical), density: 'quiet' }, 'en', 's'); const o = p.option([]) as Option;
  expect(o.series[0].symbolSize).toBe(6);
  expect(o.series[0].data[0].itemStyle.opacity).toBe(0.45);
  const high = o.series[0].data[1];
  expect(high.symbolSize).toBe(7); expect(high.itemStyle.opacity).toBe(0.6); expect(high.itemStyle.borderWidth).toBe(0);
  expect(high.label?.show).toBe(false); expect(high.emphasis?.label).toMatchObject({ show: true, formatter: '{status|▲}' });
  expect(o.series.some(series => series.id?.startsWith('__scatterStatusBacking'))).toBe(false);
  const outlineIndex = o.series.findIndex(series => series.id?.startsWith('__scatterStatusOutline'));
  expect(outlineIndex).toBeGreaterThan(0);
  expect(o.series[outlineIndex]).toMatchObject({ symbolSize: 7, silent: true, itemStyle: { opacity: 1 } });
  expect(o.series[outlineIndex].data[0].itemStyle).toMatchObject({ borderWidth: 1.5, borderColor: statusBorderColor(status, statusFill(high.itemStyle.color, 0.6)) });
  expect(p.seriesKeys[outlineIndex]).toEqual([]);
  expect(o.tooltip.formatter({ seriesIndex: 0, dataIndex: 1 })).toContain('▲ High · Above range');
  if (categorical) {
    expect(o.series[0].markArea?.itemStyle.opacity).toBe(0.12);
    expect(o.series[0].markLine?.data).toHaveLength(2);
  }
});
it.each([false, true])('quiet preserves selection and reveals selected glyph (categorical=%s)', categorical => {
  const p = scatterData({ ...fixture(categorical), density: 'quiet' }, 'en', 's');
  const o = p.option(p.rows.slice(0, 2).map(row => row.key)) as Option;
  expect(o.series[0].data[0].itemStyle).toMatchObject({ borderWidth: 2, borderColor: token('chart-selection-outline') });
  expect(o.series[0].data[1].itemStyle).toMatchObject({ borderWidth: 2, borderColor: token('chart-selection-outline'), shadowBlur: 6, shadowColor: token('chart-selection-outline') });
  expect(o.series[0].data[1].label).toMatchObject({ show: true, formatter: '{status|▲}' });
});
it.each([false, true])('quiet leaves table, CSV, summary and rows identical (categorical=%s)', categorical => {
  const spec = fixture(categorical); const normal = scatterData(spec, 'en', 's'); const quiet = scatterData({ ...spec, density: 'quiet' }, 'en', 's');
  for (const key of ['rows', 'headers', 'csvHeaders', 'tableValues', 'csvValues', 'summary'] as const) expect(quiet[key]).toEqual(normal[key]);
});
it.each([false, true])('explicit default preserves legacy status options (categorical=%s)', categorical => {
  const spec = fixture(categorical); const absent = scatterData(spec, 'en', 's').option([]); const explicit = scatterData({ ...spec, density: 'default' }, 'en', 's').option([]);
  expect(JSON.stringify(explicit)).toEqual(JSON.stringify(absent));
  const o = absent as Option;
  expect(o.series[0].symbolSize).toBeUndefined(); expect(o.series[0].data[0].itemStyle.opacity).toBeUndefined();
  expect(o.series[0].data[1].itemStyle.borderWidth).toBe(2); expect(o.series[0].data[1].label).toMatchObject({ show: true, formatter: '{status|▲}' });
  const outline = o.series.find(series => series.id?.startsWith('__scatterStatusOutline'))!;
  expect(outline.data[0].itemStyle.borderWidth).toBe(2);
});
it('quiet also mutes a numeric scatter with no status decorator', () => {
  const spec = fixture(false); spec.points = [spec.points[0]];
  const o = scatterData({ ...spec, density: 'quiet' }, 'en', 's').option([]) as Option;
  expect(o.series[0].symbolSize).toBe(6); expect(o.series[0].data[0].itemStyle.opacity).toBe(0.45);
});
