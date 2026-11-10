import { describe, expect, it } from 'vitest';
import type { EChartsCoreOption } from 'echarts/core';
import { buildChartOption } from '../buildChartOption';
import { setOptionMode } from '../EChartImpl';
import { baselineInput } from '../__fixtures__/baselineInput';
import type { ChartSeries } from '../AnalysisChartFrame';

const X = ['2026-09-01T00:00:00', '2026-09-02T00:00:00'] as const;
const time = (id: string, axis?: 'left' | 'right'): ChartSeries => ({ id, name: id, color: 'chart-blue', axis, points: [[X[0], 1], [X[1], 2]] });
const vertical = (extra = {}, displayed = [time('a'), time('b', 'right')]) => buildChartOption(baselineInput({
  displayed, xType: 'time', horizontal: false, stacked: false, rowPitch: undefined, activeCategory: undefined, extremes: undefined, markLines: [{ y: 5, label: '목표' }], categories: [], ...extra,
})) as unknown as { yAxis: unknown; grid: { right: number }; series: { id: string; yAxisIndex?: number; tooltip?: { valueFormatter: (v: number | null) => string }; markLine?: { data: Record<string, unknown>[] } }[]; tooltip: { valueFormatter: (v: number | null) => string } };

describe('right value axis (#1657)', () => {
  it('keeps one y axis and no yAxisIndex without rightAxis', () => {
    const o = vertical();
    expect(Array.isArray(o.yAxis)).toBe(false);
    expect(o.series.every(s => s.yAxisIndex === undefined && s.tooltip === undefined)).toBe(true);
  });

  it('adds a second y axis with the right unit and draws only axis:right series on it', () => {
    const o = vertical({ unit: 's', rightAxis: { unit: '%', valueFormat: (v: number) => `${v}!` } });
    const axes = o.yAxis as { name: string; position?: string; min: number }[];
    expect(axes).toHaveLength(2);
    expect(axes.map(a => a.name)).toEqual(['s', '%']);
    expect(axes[1].position).toBe('right');
    expect(o.series.find(s => s.id === 'a')!.yAxisIndex).toBeUndefined();
    expect(o.series.find(s => s.id === 'b')!.yAxisIndex).toBe(1);
  });

  it('gives each series its own axis unit and format in the tooltip', () => {
    const o = vertical({ unit: 's', rightAxis: { unit: '%', valueFormat: (v: number) => `${v}!` }, valueFormat: (v: number) => `${v}`, lang: 'en' });
    expect(o.tooltip.valueFormatter(3)).toBe('3 s');
    const right = o.series.find(s => s.id === 'b')!.tooltip!.valueFormatter;
    expect(right(3)).toBe('3! %');
    expect(right(null)).toBe('Unknown');
  });

  it('leaves reference lines on the left axis and makes room on the right', () => {
    const o = vertical({ rightAxis: { unit: '%', valueFormat: String } });
    const markLine = o.series.find(s => s.id === '__overlay')!.markLine!;
    expect(markLine.data[0]).toEqual({ name: '목표', yAxis: 5 });
    expect(o.grid.right).toBeGreaterThan(vertical().grid.right);
  });

  it('lets setOptionMode merge a one-axis option into a two-axis one without a rebuild', () => {
    const before = vertical() as unknown as EChartsCoreOption;
    const after = vertical({ rightAxis: { unit: '%', valueFormat: String } }) as unknown as EChartsCoreOption;
    const mode = setOptionMode(before, after);
    expect(mode).toEqual({ replaceMerge: expect.arrayContaining(['yAxis', 'series']) });
  });
});
