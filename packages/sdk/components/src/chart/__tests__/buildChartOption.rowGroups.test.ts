import { describe, expect, it } from 'vitest';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { ROW_LABEL_GUTTER } from '../analysisChartGeometry';

const rowGroups = { header: '설비', byCategory: new Map([
  ['R1', { group: 'EQ-001', label: 'PM1' }], ['R2', { group: 'EQ-001', label: 'PM2' }],
  ['R3', { group: 'EQ-002', label: 'PM1' }], ['R4', { group: 'EQ-001', label: 'PM3' }],
]) };

describe('read-only horizontal row group labels (#2326)', () => {
  it.each([26, undefined])('draws one label per consecutive run with rowPitch=%s without changing category identity', rowPitch => {
    const option = buildChartOption(baselineInput({ rowGroups, rowPitch })) as {
      grid: { left: number; top: number; bottom: number; containLabel: boolean };
      yAxis: { data: string[]; axisLabel: { formatter: (value: string) => string } };
      series: { id: string; data: unknown[] }[];
    };
    expect(option.yAxis.data).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(option.yAxis.axisLabel.formatter('R1')).toBe('PM1');
    expect(option.yAxis.axisLabel.formatter('R2')).toBe('{active|PM2}');
    // #2356: the gutter is the group column plus the row-label column, both sized to their text; short row labels leave no gap.
    expect(option.grid.left).toBeLessThan(ROW_LABEL_GUTTER);
    expect(option.grid).toMatchObject({ top: 16, bottom: 44, containLabel: false });
    expect(option.series.find(s => s.id === '__rowGroups')?.data).toHaveLength(3);
  });
  it('leaves non-horizontal output unchanged', () => {
    const plain = baselineInput({ horizontal: false });
    expect(JSON.parse(JSON.stringify(buildChartOption({ ...plain, rowGroups })))).toEqual(JSON.parse(JSON.stringify(buildChartOption(plain))));
  });
});

it.each([26, undefined])('keeps row groups and category coordinates in startAlign, rowPitch=%s', rowPitch => {
  const option = buildChartOption(baselineInput({ startAlign: true, rowGroups, rowPitch })) as {
    yAxis: { data: string[]; axisLabel: { formatter: (x: string) => string } };
    series: { id: string; data: unknown[] }[];
  };
  expect(option.yAxis.data).toEqual(['R1', 'R2', 'R3', 'R4']);
  expect(option.yAxis.axisLabel.formatter('R2')).toBe('{active|PM2}');
  expect(option.series.find(s => s.id === '__rowGroups')!.data).toEqual([[0, 1], [2, 2], [3, 3]]);
  expect(option.series.filter(s => s.id.startsWith('__spacer-'))).toHaveLength(1);
});

describe('row group gutter fits its labels (#2356)', () => {
  const layoutOf = (labels: Map<string, { group: string; label?: string }>) => buildChartOption(baselineInput({ rowGroups: { header: '설비', byCategory: labels }, rowPitch: 26 })) as {
    grid: { left: number }; yAxis: { axisLabel: { width: number } };
  };
  it('keeps no slack between short group and row labels, and still fits the bold active row label', () => {
    const option = layoutOf(rowGroups.byCategory);
    // EQ-001 (6 glyphs) + PM1 (3 glyphs): about 100px, not the 140px plain-row gutter plus the group column.
    expect(option.grid.left).toBeLessThanOrEqual(110);
    expect(option.yAxis.axisLabel.width).toBeGreaterThanOrEqual(3 * 8);
  });
  it('grows the row-label column for long labels instead of truncating them', () => {
    const long = new Map([['R1', { group: 'EQ-001', label: 'Load lock chamber A' }]]);
    const option = layoutOf(long);
    expect(option.yAxis.axisLabel.width).toBeGreaterThanOrEqual('Load lock chamber A'.length * 7);
  });
});
