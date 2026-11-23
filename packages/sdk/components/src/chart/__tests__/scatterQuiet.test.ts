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
  expect(high.symbolSize).toBe(6); expect(high.itemStyle.opacity).toBe(0.6); expect(high.itemStyle.borderWidth).toBe(0);
  expect(high.label?.show).toBe(false); expect(high.emphasis?.label).toMatchObject({ show: true, formatter: '{status|■}' });
  expect(o.series.some(series => series.id?.startsWith('__scatterStatusBacking'))).toBe(false);
  const outlineIndex = o.series.findIndex(series => series.id?.startsWith('__scatterStatusOutline'));
  expect(outlineIndex).toBeGreaterThan(0);
  expect(o.series[outlineIndex]).toMatchObject({ symbolSize: 6, silent: true, itemStyle: { opacity: 0.75 } });
  expect(o.series[outlineIndex].data[0].itemStyle).toMatchObject({ borderWidth: 1, borderColor: statusBorderColor(status, statusFill(high.itemStyle.color, 0.6)) });
  expect(p.seriesKeys[outlineIndex]).toEqual([]);
  expect(o.tooltip.formatter({ seriesIndex: 0, dataIndex: 1 })).toContain('■ High · Above range');
  if (categorical) {
    expect(o.series[0].markArea?.itemStyle.opacity).toBe(0.12);
    expect(o.series[0].markLine?.data).toHaveLength(2);
  }
});
it.each([false, true])('quiet preserves selection and reveals selected glyph (categorical=%s)', categorical => {
  const p = scatterData({ ...fixture(categorical), density: 'quiet' }, 'en', 's');
  const o = p.option(p.rows.slice(0, 2).map(row => row.key)) as Option;
  expect(o.series[0].data[0].itemStyle).toMatchObject({ borderWidth: 1.5, borderColor: token('chart-selection-outline') });
  expect(o.series[0].data[1].itemStyle).toMatchObject({ borderWidth: 1.5, borderColor: token('chart-selection-outline'), shadowBlur: 6, shadowColor: token('chart-selection-outline') });
  expect(o.series[0].data[1].label).toMatchObject({ show: true, formatter: '{status|■}' });
});
it.each([false, true])('quiet leaves table, CSV and rows identical (categorical=%s)', categorical => {
  const spec = fixture(categorical); const normal = scatterData(spec, 'en', 's'); const quiet = scatterData({ ...spec, density: 'quiet' }, 'en', 's');
  for (const key of ['rows', 'headers', 'csvHeaders', 'tableValues', 'csvValues'] as const) expect(quiet[key]).toEqual(normal[key]);
  if (!categorical) expect(quiet.summary).toEqual(normal.summary);
});
it('quiet draws every group as a circle and counts groups in the category summary instead of listing them', () => {
  const spec = fixture(true);
  spec.points = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, x: null, y: i, category: 'a', group: `EQ-00${i}` }));
  const quiet = scatterData({ ...spec, density: 'quiet' }, 'en', 's'); const normal = scatterData(spec, 'en', 's');
  expect(quiet.legend.slice(0, 6).map(item => item.symbol)).toEqual(Array(6).fill('circle'));
  expect(new Set(normal.legend.map(item => item.symbol)).size).toBeGreaterThan(1);
  expect(quiet.summary).toContain('groups: 6'); expect(quiet.summary).not.toContain('EQ-001');
  expect(normal.summary).toContain('EQ-001');
});
it('hides colliding category axis labels', () => {
  const o = scatterData(fixture(true), 'en', 's').option([]) as unknown as { xAxis: { axisLabel: { hideOverlap?: boolean } } };
  expect(o.xAxis.axisLabel.hideOverlap).toBe(true);
});
it.each([false, true])('explicit default preserves legacy status options (categorical=%s)', categorical => {
  const spec = fixture(categorical); const absent = scatterData(spec, 'en', 's').option([]); const explicit = scatterData({ ...spec, density: 'default' }, 'en', 's').option([]);
  expect(JSON.stringify(explicit)).toEqual(JSON.stringify(absent));
  const o = absent as Option;
  expect(o.series[0].symbolSize).toBeUndefined(); expect(o.series[0].data[0].itemStyle.opacity).toBeUndefined();
  expect(o.series[0].data[1].itemStyle.borderWidth).toBe(2); expect(o.series[0].data[1].label).toMatchObject({ show: true, formatter: '{status|■}' });
  const outline = o.series.find(series => series.id?.startsWith('__scatterStatusOutline'))!;
  expect(outline.data[0].itemStyle.borderWidth).toBe(2);
});
it('quiet also mutes a numeric scatter with no status decorator', () => {
  const spec = fixture(false); spec.points = [spec.points[0]];
  const o = scatterData({ ...spec, density: 'quiet' }, 'en', 's').option([]) as Option;
  expect(o.series[0].symbolSize).toBe(6); expect(o.series[0].data[0].itemStyle.opacity).toBe(0.45);
});
