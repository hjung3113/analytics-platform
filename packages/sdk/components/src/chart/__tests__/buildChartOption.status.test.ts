import { describe, expect, it } from 'vitest';
import { buildChartOption } from '../buildChartOption';
import { barStatusRing, baselineInput } from '../__fixtures__/baselineInput';

const status = { tone: 'danger' as const, label: '<상한 초과>', reason: 'Recipe <script> & "unknown"' };
type Datum = { value: number; itemStyle: { color: string; borderColor: string; borderWidth: number; borderType?: string; shadowColor?: string }; label: { formatter: string; rich: object } };
type Option = { series: { id: string; data: (number | null | Datum)[] }[]; tooltip: { formatter: (params: { seriesId: string; name: string; value: number }[]) => string } };

describe('consumer bar statuses (#2326)', () => {
  it('adds a token border and glyph only to measured bar pieces, preserving fill and min/max/active cues', () => {
    const input = baselineInput({ pointStatus: () => status });
    const option = buildChartOption(input) as unknown as Option;
    const a = option.series.find(s => s.id === 'a')!;
    const first = a.data[0] as Datum; const active = a.data[1] as Datum;
    expect(first.itemStyle.color).toBe('aFill');
    // The status border is drawn inside the piece by the custom layer, not by the native bar (#2351).
    expect(first.itemStyle.borderWidth).toBe(0);
    expect(barStatusRing(option)!.at(-1)).toMatchObject({ stroke: expect.stringContaining('rgb'), lineWidth: 2 });
    expect(first.label.formatter).toContain('■');
    expect(first.itemStyle.shadowColor).toBe('max');
    expect(active.itemStyle).toMatchObject({ borderWidth: 0, shadowColor: 'min' });
    expect(a.data[2]).toBeNull();
    const tip = option.tooltip.formatter([{ seriesId: 'a', name: 'R1', value: 800 }]);
    expect(tip).toContain('&lt;상한 초과&gt;');
    expect(tip).toContain('Recipe &lt;script&gt; &amp; &quot;unknown&quot;');
    expect(tip).not.toContain('<script>');
  });
  it('keeps the line itself unchanged while adding opt-in line status overlays', () => {
    const input = baselineInput({ horizontal: false, displayed: [{ ...baselineInput().displayed[0], kind: 'line' }] });
    const plain = JSON.parse(JSON.stringify(buildChartOption(input)));
    const withStatus = JSON.parse(JSON.stringify(buildChartOption(baselineInput({ ...input, statuses: undefined, pointStatus: () => status }))));
    expect(withStatus.series[0]).toEqual(plain.series[0]);
    expect(withStatus.series.some((s: { id: string }) => s.id === '__line-status-a')).toBe(true);
  });
});

it.each(['category', 'time'] as const)('supports unstacked vertical %s bars and preserves the right unit', xType => {
  const x = xType === 'time' ? '2026-11-16T09:00:00' : 'R1';
  const input = baselineInput({ xType, horizontal: false, stacked: false, displayed: [{ id: 'v', name: 'V', color: 'chart-blue', kind: 'bar', axis: 'right', points: [[x, 8]] }], pointStatus: () => status, rightAxis: { unit: '%', valueFormat: v => `p${v}` } });
  const option = buildChartOption(input) as unknown as Option;
  expect((option.series[0].data[0] as Datum).label.formatter).toContain('■');
  expect(option.tooltip.formatter([{ seriesId: 'v', name: x, value: 8 }])).toContain('p8 %');
});
it('escapes group headers, group names and short row labels in HTML tooltips', () => {
  const rowGroups = { header: '<Header>', byCategory: new Map([['R1', { group: '<Group>', label: '<Row>' }]]) };
  const option = buildChartOption(baselineInput({ rowGroups })) as unknown as Option;
  const tip = option.tooltip.formatter([{ seriesId: 'a', name: 'R1', value: 800 }]);
  expect(tip).toContain('&lt;Header&gt;: &lt;Group&gt; · &lt;Row&gt;');
  expect(tip).not.toContain('<Group>');
});
it('keeps a bar option identical when the callback returns no statuses', () => {
  const plain = JSON.parse(JSON.stringify(buildChartOption(baselineInput())));
  expect(JSON.parse(JSON.stringify(buildChartOption(baselineInput({ pointStatus: () => undefined }))))).toEqual(plain);
});

it('keeps status styling fixed when the active row changes, including startAlign spacers', () => {
  const make = (activeCategory: string | null) => buildChartOption(baselineInput({ startAlign: true, activeCategory, pointStatus: () => status })) as unknown as Option;
  const active = make('R2'); const inactive = make(null);
  expect((active.series.find(s => s.id === 'a')!.data[1] as Datum).itemStyle).toEqual((inactive.series.find(s => s.id === 'a')!.data[1] as Datum).itemStyle);
  const spacer = active.series.find(s => s.id === '__spacer-1')!;
  expect(spacer.data.every(d => typeof d === 'number')).toBe(true);
  const tip = active.tooltip.formatter([{ seriesId: '__spacer-1', name: 'R1', value: 1 }, { seriesId: 'a', name: 'R1', value: 800 }]);
  expect(tip).not.toContain('__spacer');
  expect(tip.match(/■/g)).toHaveLength(1);
});
