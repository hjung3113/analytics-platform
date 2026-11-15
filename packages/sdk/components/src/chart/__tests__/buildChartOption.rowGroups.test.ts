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
    expect(option.grid.left).toBeGreaterThan(ROW_LABEL_GUTTER);
    expect(option.grid).toMatchObject({ top: 16, bottom: 44, containLabel: false });
    expect(option.series.find(s => s.id === '__rowGroups')?.data).toHaveLength(3);
  });
  it('leaves non-horizontal output unchanged', () => {
    const plain = baselineInput({ horizontal: false });
    expect(JSON.parse(JSON.stringify(buildChartOption({ ...plain, rowGroups })))).toEqual(JSON.parse(JSON.stringify(buildChartOption(plain))));
  });
});
