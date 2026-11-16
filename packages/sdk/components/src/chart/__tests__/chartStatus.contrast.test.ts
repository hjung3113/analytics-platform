import { describe, expect, it } from 'vitest';
import { readColorToken } from '@ap/ui/theme';
import { buildChartOption } from '../buildChartOption';
import { barStatusRing, baselineInput } from '../__fixtures__/baselineInput';
import { statusBacking } from '../chartStatus';

const luminance = (rgb: string) => {
  const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const fills = ['chart-blue', 'chart-teal', 'chart-purple', 'chart-green', 'chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4', 'chart-status-warn', 'chart-status-critical', 'chart-status-good', 'chart-heat-seq-4', 'chart-heat-div-0', 'chart-heat-div-4', 'chart-no-data'] as const;
describe('status non-text contrast (#2326)', () => {
  it.each(fills)('neutral outline contrasts at least 3:1 against %s', fill => {
    const input = baselineInput({ pointStatus: () => ({ tone: 'neutral', label: 'Unknown' }) });
    input.palette = { ...input.palette, series: input.palette.series.map(s => ({ ...s, fill: readColorToken(fill) })) };
    const border = barStatusRing(buildChartOption(input))!.at(-1)!.stroke;
    expect(ratio(border, readColorToken(fill))).toBeGreaterThanOrEqual(3);
  });
  it.each(['danger', 'warning', 'neutral'] as const)('%s glyph contrasts at least 3:1 on its surface-backed chip', tone => {
    const option = buildChartOption(baselineInput({ pointStatus: () => ({ tone, label: 'Status' }) })) as { series: { data: { label: { rich: { status: { color: string; backgroundColor: string } } } }[] }[] };
    const marker = option.series[0].data[0].label.rich.status;
    expect(ratio(marker.color, marker.backgroundColor)).toBeGreaterThanOrEqual(3);
  });
});

it.each(['warning', 'danger'] as const)('backs a %s bar outline on its matching fill without changing that fill', tone => {
  const input = baselineInput({ pointStatus: () => ({ tone, label: 'Status' }) });
  const fill = readColorToken(tone === 'warning' ? 'chart-status-warn' : 'chart-status-critical');
  input.palette = { ...input.palette, series: input.palette.series.map(s => ({ ...s, fill })) };
  const option = buildChartOption(input) as { series: { id: string; data: { itemStyle: { color: string } }[] }[] };
  expect(option.series[0].data[0].itemStyle.color).toBe(fill);
  const [drawnBacking, border] = barStatusRing(option)!;
  expect(border!.stroke).toBe(fill);
  const backing = statusBacking({ tone, label: 'Status' }, fill)!;
  expect(drawnBacking!.stroke).toBe(backing);
  expect(ratio(border!.stroke, backing)).toBeGreaterThanOrEqual(3);
  expect(ratio(backing, fill)).toBeGreaterThanOrEqual(3);
});
