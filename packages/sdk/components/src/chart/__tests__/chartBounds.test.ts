import { describe, expect, it } from 'vitest';
import { projectChartBounds, boundSeries } from '../chartBounds';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';

const times = ['2026-11-16T09:00:00', '2026-11-16T10:00:00', '2026-11-16T11:00:00'];
const input = () => baselineInput({ horizontal: false, stacked: false, extremes: undefined, activeCategory: undefined, displayed: [{ id: 'a', name: 'A', color: 'chart-blue', points: times.map(x => [x, 5]) }], xType: 'time' });
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
describe('per-x step bounds (#2333)', () => {
  it('sorts time entries, changes mid-series, clears missing sides and stops at the data extent', () => {
    const middle = '2026-11-16T09:30:00';
    const p = projectChartBounds({ ...input(), bounds: new Map([[times[1], { upper: 12 }], [times[0], { lower: -3, upper: 9 }], [middle, { lower: 1, upper: 10 }]]) })!;
    expect(p.segments.map(s => [s.from, s.to, s.lower, s.upper])).toEqual([[times[0], middle, -3, 9], [middle, times[1], 1, 10], [times[1], times[2], undefined, 12]]);
    expect(p.at('2026-11-16T09:45:00')).toEqual({ lower: 1, upper: 10 });
    expect(p.at(times[1])).toEqual({ upper: 12 });
    expect(p.at('2026-11-16T08:00:00')).toEqual({});
    expect(p.extent).toEqual({ min: -3, max: 12 });
    expect(p.parts).toEqual(['upper', 'lower', 'band']);
  });
  it('uses category axis order, including a gap entry and the final category', () => {
    const p = projectChartBounds({ ...input(), xType: 'category', categories: ['Z', 'A', 'M', 'B'], bounds: new Map([['M', { lower: 4 }], ['Z', { lower: 1, upper: 3 }], ['A', {}]]) })!;
    expect(p.segments.map(s => [s.from, s.to])).toEqual([['Z', 'A'], ['A', 'M'], ['M', 'B']]);
    expect(p.at('A')).toEqual({}); expect(p.at('B')).toEqual({ lower: 4 });
    expect(p.at('unknown')).toEqual({});
  });
  it('ignores horizontal bounds and keeps absent options identical to the baseline', () => {
    expect(projectChartBounds(baselineInput({ bounds: new Map([['R1', { upper: 3 }]]) }))).toBeUndefined();
    expect(json(buildChartOption(baselineInput({ bounds: undefined, boundLabels: undefined })))).toEqual(json(buildChartOption(baselineInput())));
  });
  it('extends the left y range, preserves markLines, and escapes labels and values in tooltip HTML', () => {
    const i = { ...input(), bounds: new Map([[times[0], { lower: -3, upper: 50 }]]), boundLabels: { lower: '<low>', upper: '<high>' }, valueFormat: (v: number) => `<${v}>` };
    const o = buildChartOption(i) as any;
    expect(o.yAxis.min({ min: 2, max: 5 })).toBe(-3);
    expect(o.yAxis.max({ min: 2, max: 5 })).toBe(50);
    expect(o.series.find((s: any) => s.markArea).markLine.data).toEqual([{ name: '목표', yAxis: 300 }]);
    const tip = o.tooltip.formatter([{ seriesId: 'a', dataIndex: 1 }]);
    expect(tip).toContain('&lt;low&gt;: &lt;-3&gt;'); expect(tip).toContain('&lt;high&gt;: &lt;50&gt;');
    expect(tip).not.toContain('<low>');
  });
  it('includes only present legend parts and fills only steps with both sides', () => {
    const i = { ...input(), bounds: new Map([[times[0], { upper: 8 }], [times[1], { lower: 2, upper: 10 }]]) };
    const p = projectChartBounds(i)!;
    const series = boundSeries(p, i.palette, new Set());
    expect(series.find(s => s.name === p.labels.band)!.data).toHaveLength(1);
    const one = projectChartBounds({ ...i, bounds: new Map([[times[0], { upper: 8 }]]) })!;
    expect(one.parts).toEqual(['upper']);
  });
  it('does not give compare series bounds or extend the step to compare-only x values', () => {
    const i = input();
    i.displayed = [...i.displayed, { ...i.displayed[0], id: 'previous', points: [['2026-11-16T12:00:00', 8]] }];
    i.previousIds = new Set(['previous']);
    const bounds = new Map([[times[0], { lower: 1, upper: 9 }]]);
    expect(projectChartBounds({ ...i, bounds })!.segments.at(-1)!.to).toBe(times[2]);
    const o = buildChartOption({ ...i, bounds }) as any;
    expect(o.tooltip.formatter([{ seriesId: 'previous', dataIndex: 0 }])).not.toContain('상한');
  });
});

it('omits missing bound labels and returns no caption when both values are absent (#2426)', async () => {
  const { boundText } = await import('../chartBounds');
  const projection = projectChartBounds({ ...input(), bounds: new Map([[times[0], { lower: 0 }], [times[1], {}]]), boundLabels: { lower: 'HTM 하한', upper: 'HTM 상한' } })!;
  expect(boundText(projection, times[0], String)).toBe('HTM 하한: 0');
  expect(boundText(projection, times[1], String)).toBe('');
});
