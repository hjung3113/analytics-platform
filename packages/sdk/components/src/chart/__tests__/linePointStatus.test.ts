import { describe, expect, it } from 'vitest';
import { readColorToken } from '@ap/ui/theme';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { chartPointKey } from '../chartStatus';
import { pointStatuses } from '../chartStatus';
const status = { tone: 'warning' as const, label: 'High', reason: 'Limit' };
const displayed = [{ id: 'line', name: 'Line', color: 'chart-blue' as const, points: [['A', 3], ['B', null], ['C', 5]] as [string, number | null][] }];
describe('sparse line status symbols (#2333)', () => {
  it('draws a ring, surface halo and glyph while leaving the line and unmarked points unchanged', () => {
    const i = baselineInput({ displayed, horizontal: false, xType: 'category', categories: ['A', 'B', 'C'], pointStatus: p => p.x === 'A' ? status : undefined });
    const o = buildChartOption(i) as any;
    expect(o.series[0].showSymbol).toBe(false); expect(o.series[0].data).toEqual([3, null, 5]);
    const marker = o.series.find((s: any) => s.type === 'scatter' && s.z === 5);
    expect(marker.data).toHaveLength(1);
    expect(marker.data[0]).toMatchObject({ value: ['A', 3], itemStyle: { borderWidth: 2 }, label: { formatter: '{status|◆}' } });
    expect(o.series.find((s: any) => s.type === 'scatter' && s.z === 4).itemStyle.color).toBe(readColorToken('surface-card'));
    expect(o.tooltip.formatter([{ seriesId: 'line', dataIndex: 0 }])).toContain('◆ High · Limit');
  });
  it('excludes null/nonfinite points and hidden series from the projection', () => {
    const callback = () => status;
    const withNonfinite = displayed.map(s => ({ ...s, points: [...s.points, ['D', NaN] as [string, number]] }));
    const statuses = pointStatuses(withNonfinite, callback);
    expect([...statuses.keys()]).toEqual([chartPointKey({ seriesId: 'line', x: 'A' }), chartPointKey({ seriesId: 'line', x: 'C' })]);
    expect(pointStatuses([], callback).size).toBe(0);
  });
  it('keeps the bar path identical', () => {
    const i = baselineInput({ pointStatus: () => status });
    const o = buildChartOption(i) as any;
    expect(o.series.some((s: any) => s.type === 'scatter')).toBe(false);
    expect(o.series[0].data[0].itemStyle.color).toBe('aFill');
    expect(o.series[0].data[0].label.formatter).toContain('◆');
  });
});

const luminance = (rgb: string) => {
  const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
it.each(['danger', 'warning', 'neutral'] as const)('%s line ring has at least 3:1 contrast on its surface halo', tone => {
  const i = baselineInput({ displayed, horizontal: false, categories: ['A', 'B', 'C'], pointStatus: () => ({ tone, label: 'Status' }) });
  const o = buildChartOption(i) as any;
  const ring = luminance(o.series.find((s: any) => s.type === 'scatter' && s.z === 5).data[0].itemStyle.borderColor);
  const surface = luminance(readColorToken('surface-card'));
  expect((Math.max(ring, surface) + 0.05) / (Math.min(ring, surface) + 0.05)).toBeGreaterThanOrEqual(3);
});
it('places time status overlays on the right series axis with the original wall-clock identity', () => {
  const x = '2026-11-16T09:00:00';
  const i = baselineInput({ horizontal: false, xType: 'time', displayed: [{ ...displayed[0], axis: 'right', points: [[x, 3]] }], rightAxis: { unit: '%', valueFormat: v => `p${v}` }, pointStatus: () => status });
  const o = buildChartOption(i) as any;
  const marker = o.series.find((s: any) => s.type === 'scatter' && s.z === 5);
  expect(marker.yAxisIndex).toBe(1);
  expect(marker.data[0].value[0]).toBeTypeOf('number');
  expect(o.tooltip.formatter([{ seriesId: 'line', dataIndex: 0 }])).toContain('p3 %');
});
