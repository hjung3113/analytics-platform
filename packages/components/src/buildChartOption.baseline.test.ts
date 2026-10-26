import { describe, expect, it } from 'vitest';
import { buildChartOption } from './buildChartOption';
import { baselineInput } from './__fixtures__/baselineInput';
import main from './__fixtures__/buildChartOption.main.json';

// `buildChartOption.main.json` is the option origin/main's builder (before node 580d) produced for `baselineInput()`; functions are not in JSON and are pinned below.
describe('main-derived option (#580d, F9)', () => {
  const built = () => buildChartOption(baselineInput()) as unknown as { tooltip: { valueFormatter: (v: number | null) => string }; yAxis: { axisLabel: { formatter: (v: string) => string } } };
  it('equals what main built for an existing stacked chart while no value labels are asked for', () => {
    expect(JSON.parse(JSON.stringify(built()))).toEqual(main);
  });
  it('keeps the callbacks: tooltip value with unit and the unknown label for null, and the bold active row label', () => {
    const o = built();
    expect(o.tooltip.valueFormatter(5)).toBe('5 s');
    expect(o.tooltip.valueFormatter(null)).toBe('미확인');
    expect(o.yAxis.axisLabel.formatter('R2')).toBe('{active|R2}');
    expect(o.yAxis.axisLabel.formatter('R1')).toBe('R1');
  });
  it('differs only by the new fields when new props are given but valueLabels is unset', () => {
    expect(JSON.parse(JSON.stringify(buildChartOption(baselineInput({ totals: new Map([['R1', { value: 9, partial: false, missing: [] }]]), totalText: new Map([['R1', '9']]) }))))).toEqual(main);
  });
});

describe('horizontal value-axis ticks on a narrow plot (#914 B3)', () => {
  const xAxis = (chartWidth: number) => (buildChartOption(baselineInput({ chartWidth })) as unknown as { xAxis: { splitNumber?: number; axisLabel?: { hideOverlap?: boolean } } }).xAxis;
  it('thins the ticks and hides touching labels at drawer width', () => {
    const axis = xAxis(300);
    expect(axis.splitNumber).toBeLessThan(5);
    expect(axis.axisLabel?.hideOverlap).toBe(true);
  });
  it('leaves the default tick count on a wide plot', () => {
    expect(xAxis(600).splitNumber).toBeUndefined();
  });
  // C2: without rowPitch the grid is containLabel, so long category names narrow the numeric grid too.
  it('budgets the category-label room when there is no row pitch', () => {
    const long = ['가나다라마바사아자차카타파하 긴 범주 이름', 'R2', 'R3', 'R4'];
    const axis = (categories: string[]) => (buildChartOption(baselineInput({ rowPitch: undefined, chartWidth: 450, extremes: undefined, markLines: undefined, categories })) as unknown as { xAxis: { splitNumber?: number } }).xAxis;
    expect(axis(['R1', 'R2', 'R3', 'R4']).splitNumber).toBeUndefined();
    expect(axis(long).splitNumber).toBeLessThan(5);
  });
});
