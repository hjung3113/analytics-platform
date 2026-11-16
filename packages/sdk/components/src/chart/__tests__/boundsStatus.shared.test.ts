import { describe, expect, it, vi } from 'vitest';
import { chartTheme } from '../EChart';
import { projectChartBounds } from '../chartBounds';
import { legendColor, scatterData } from '../analysisChartKinds';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';

describe('shared bounds and status projection (#2362)', () => {
  it('drops reversed Frame bounds and clears the previous step with a diagnostic', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const p = projectChartBounds({ ...baselineInput(), horizontal: false, bounds: new Map([
        ['R1', { lower: 1, upper: 8 }], ['R2', { lower: 9, upper: 2 }], ['R3', { lower: NaN, upper: 6 }],
      ]) })!;
      expect(p.at('R2')).toEqual({});
      expect(p.at('R3')).toEqual({ upper: 6 });
      expect(p.extent).toEqual({ min: 1, max: 8 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('reversed'));
    } finally { error.mockRestore(); }
  });
  it('uses the Frame reference colour for scatter bounds and legend keys', () => {
    const p = scatterData({ kind: 'scatter', xUnit: '', xLabel: 'Cell', yLabel: 'Value',
      points: [{ id: 'a', x: null, y: 3, category: 'a' }],
      xCategories: { order: ['a'], bounds: new Map([['a', { lower: 1, upper: 8 }]]) },
    }, 'en', 's');
    const color = chartTheme().referenceLine.lineStyle.color;
    expect(p.option([])).toMatchObject({ series: [expect.objectContaining({
      markArea: expect.objectContaining({ itemStyle: expect.objectContaining({ color }) }),
      markLine: expect.objectContaining({ data: expect.arrayContaining([
        [expect.objectContaining({ lineStyle: expect.objectContaining({ color }) }), expect.anything()],
      ]) }),
    })] });
    expect(p.legend.slice(-3).map(item => legendColor(item.color))).toEqual([color, color, color]);
    expect(p.legend.slice(-3).map(item => item.label)).toEqual(['Upper bound', 'Lower bound', 'Bound range']);
  });
  it('uses Frame number formatting without a unit in scatter bound table cells', () => {
    const p = scatterData({ kind: 'scatter', xUnit: '', xLabel: 'Cell', yLabel: 'Value',
      points: [{ id: 'a', x: null, y: 3, category: 'a' }],
      xCategories: { order: ['a'], bounds: new Map([['a', { lower: 1000.25, upper: 2000.25 }]]) },
    }, 'en', 's');
    expect(p.tableValues[0].slice(-2)).toEqual(['1,000.3', '2,000.3']);
    expect(p.csvValues[0].slice(-2)).toEqual([1000.25, 2000.25]);
  });
  it('uses the supplied statuses without invoking a point callback again', () => {
    const pointStatus = vi.fn(() => ({ tone: 'danger' as const, label: 'High' }));
    const input = baselineInput({ pointStatus });
    const statuses = new Map([['["a","R1"]', pointStatus()]]);
    pointStatus.mockClear();
    const option = buildChartOption({ ...input, statuses, ...{ pointStatus } });
    expect(pointStatus).not.toHaveBeenCalled();
    expect(option).toMatchObject({ series: expect.arrayContaining([
      expect.objectContaining({ id: 'a', data: expect.arrayContaining([expect.objectContaining({ label: expect.objectContaining({ formatter: expect.stringContaining('{status|■}') }) })]) }),
    ]) });
  });
});
