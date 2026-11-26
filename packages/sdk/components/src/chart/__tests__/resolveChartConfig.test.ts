import { CHART_CONFIG_COLORS, invalidChartConfig, type ChartConfig } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { resolveChartConfig, type ChartFieldMeta } from '../resolveChartConfig';

const meta: Record<string, ChartFieldMeta> = {
  time: { label: '시각' },
  eqp: { label: '설비' },
  yield: { label: '수율', unit: '%', reaggregation: 'ratioOfSums', metricVersion: 'v2' },
  count: { label: '건수', unit: '건', reaggregation: 'sum' },
  moves: { label: '이동', unit: '건', reaggregation: 'sum' },
  undeclared: { label: '미선언', unit: '건' },
  nounit: { label: '무단위', reaggregation: 'sum' },
  blank: { label: '빈 단위', unit: ' ', reaggregation: 'sum' },
};
const rows = [
  { time: '2026-11-01T00:00:00', eqp: 'E1', yield: 0.91, count: 3, moves: 5 },
  { time: '2026-11-01T01:00:00', eqp: 'E2', yield: null, count: 4, moves: 1 },
  { time: '2026-11-01T02:00:00', eqp: 'E1', count: 2, moves: 0 },
];
const line: ChartConfig = { version: 1, kind: 'line', x: { field: 'time', type: 'time' }, measures: [{ field: 'yield' }] };
const ok = (config: ChartConfig) => {
  expect(invalidChartConfig(config)).toBeNull();
  const result = resolveChartConfig(config, rows, meta, 'en');
  if (result.status !== 'ok') throw new Error(JSON.stringify(result));
  return result.frame;
};

describe('resolveChartConfig (#2745)', () => {
  it('maps one measure to one series; unknown values stay null, never 0', () => {
    expect(ok(line)).toEqual({
      series: [{ id: 'yield', name: '수율', color: 'chart-series-1', unit: '%', kind: 'line', points: [['2026-11-01T00:00:00', 0.91], ['2026-11-01T01:00:00', null], ['2026-11-01T02:00:00', null]] }],
      unit: '%', xType: 'time', orientation: 'vertical', stackMode: 'none', reaggregation: 'ratioOfSums', metricVersion: 'v2',
    });
  });

  it('keeps a configured series token and gives the others the series tokens in order', () => {
    const frame = ok({ ...line, measures: [{ field: 'count', color: 'chart-series-3' }, { field: 'moves' }] });
    expect(frame.series.map(s => [s.id, s.color])).toEqual([['count', 'chart-series-3'], ['moves', 'chart-series-2']]);
  });

  it('splits one measure into a series per value in first-seen order and cycles the tokens', () => {
    const frame = ok({ version: 1, kind: 'bar', x: { field: 'time', type: 'time' }, measures: [{ field: 'count' }], split: { field: 'eqp' }, stack: 'stack' });
    expect(frame.series.map(s => [s.id, s.color, s.points])).toEqual([
      ['E1', 'chart-series-1', [['2026-11-01T00:00:00', 3], ['2026-11-01T01:00:00', null], ['2026-11-01T02:00:00', 2]]],
      ['E2', 'chart-series-2', [['2026-11-01T00:00:00', null], ['2026-11-01T01:00:00', 4], ['2026-11-01T02:00:00', null]]],
    ]);
    expect(frame).toMatchObject({ stackMode: 'stack', reaggregation: 'sum', unit: '건' });
  });

  it('puts right-axis measures on rightAxis with their own unit', () => {
    const frame = ok({ ...line, measures: [{ field: 'count' }, { field: 'yield', axis: 'right' }] });
    expect(frame.unit).toBe('건');
    expect(frame.rightAxis?.unit).toBe('%');
    expect(frame.series[1]).toMatchObject({ axis: 'right' });
    expect(frame.reaggregation).toBeUndefined();
  });

  it('draws a percent format as percent points, so ticks, tooltip, picker and export read one number', () => {
    const frame = ok({ ...line, measures: [{ field: 'count' }, { field: 'yield', axis: 'right' }], valueFormat: { kind: 'percent', decimals: 1 } });
    // 0.91 is drawn as 91: the axis has no formatter of its own and the CSV writes the drawn value under unit=%.
    expect(frame.series[1]?.points[0]).toEqual(['2026-11-01T00:00:00', 91]);
    expect(frame.series[0]?.points[0]).toEqual(['2026-11-01T00:00:00', 300]);
    // The Frame appends the unit, so the formatter leaves the % to it: «12.3 %», never «12.3% %».
    expect(frame.valueFormat?.(12.34)).toBe('12.3');
    expect(frame.rightAxis?.valueFormat?.(50)).toBe('50.0');
    expect([frame.unit, frame.rightAxis?.unit, ...frame.series.map(s => s.unit)]).toEqual(['%', '%', '%', '%']);
    expect(ok({ ...line, valueFormat: { kind: 'number', decimals: 0 } }).valueFormat?.(1234.5)).toBe('1,235');
  });

  it('passes orientation and area fill through', () => {
    const bars: ChartConfig = { version: 1, kind: 'bar', x: { field: 'eqp', type: 'category' }, measures: [{ field: 'count' }], orientation: 'horizontal' };
    expect(resolveChartConfig(bars, [{ eqp: 'E1', count: 1 }, { eqp: 'E2', count: 2 }], meta)).toMatchObject({ status: 'ok', frame: { orientation: 'horizontal' } });
    expect(ok({ ...line, areaFill: true }).areaFill).toBe(true);
    expect(ok({ ...line, areaFill: false }).areaFill).toBe(false);
    expect('areaFill' in ok(line)).toBe(false);
  });

  it('gives split series the tokens in order from the measure token and wraps around', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((eqp, i) => ({ time: '2026-11-01T00:00:00', eqp, count: i }));
    const config: ChartConfig = { version: 1, kind: 'bar', x: { field: 'time', type: 'time' }, measures: [{ field: 'count', color: 'chart-series-3' }], split: { field: 'eqp' } };
    const result = resolveChartConfig(config, many, meta);
    if (result.status !== 'ok') throw new Error(JSON.stringify(result));
    const colors = result.frame.series.map(s => s.color);
    const n = CHART_CONFIG_COLORS.length;
    expect(colors).toEqual(many.map((_, i) => CHART_CONFIG_COLORS[(CHART_CONFIG_COLORS.indexOf('chart-series-3') + i) % n]));
    expect(colors[0]).toBe('chart-series-3');
  });

  it('keeps a numeric category x and split value as text labels', () => {
    const config: ChartConfig = { version: 1, kind: 'bar', x: { field: 'eqp', type: 'category' }, measures: [{ field: 'count' }] };
    const result = resolveChartConfig(config, [{ eqp: 7, count: 1 }, { eqp: 'E2', count: 2 }], meta);
    expect(result).toMatchObject({ status: 'ok', frame: { series: [{ points: [['7', 1], ['E2', 2]] }] } });
  });

  it.each([
    ['a field without meta', { ...line, measures: [{ field: 'gone' }] }, { code: 'unknown-field', field: 'gone' }],
    ['a meta key inherited from Object', { ...line, x: { field: 'constructor', type: 'time' } }, { code: 'unknown-field', field: 'constructor' }],
    ['two units on one axis', { ...line, measures: [{ field: 'count' }, { field: 'yield' }] }, { code: 'mixed-units', field: 'yield' }],
    ['a measure without a unit', { ...line, measures: [{ field: 'nounit' }] }, { code: 'missing-unit', field: 'nounit' }],
    ['a blank unit', { ...line, measures: [{ field: 'blank' }] }, { code: 'missing-unit', field: 'blank' }],
    ['a measure without a unit under a percent format', { ...line, measures: [{ field: 'nounit' }], valueFormat: { kind: 'percent' } }, { code: 'missing-unit', field: 'nounit' }],
    ['a blank unit under a percent format', { ...line, measures: [{ field: 'blank' }], valueFormat: { kind: 'percent' } }, { code: 'missing-unit', field: 'blank' }],
    ['a percent format on a percent stack', { ...line, measures: [{ field: 'count' }, { field: 'moves' }], stack: 'percent', valueFormat: { kind: 'percent', decimals: 2 } }, { code: 'format-conflict', field: 'count' }],
    ['every measure on the right axis', { ...line, measures: [{ field: 'count', axis: 'right' }] }, { code: 'right-axis-only', field: 'count' }],
    ['the first measure that differs from the axis\' first', { ...line, measures: [{ field: 'count' }, { field: 'moves' }, { field: 'yield' }] }, { code: 'mixed-units', field: 'yield' }],
    ['stacking a ratio', { ...line, measures: [{ field: 'yield' }], stack: 'stack' }, { code: 'not-additive', field: 'yield' }],
    ['percent-stacking a measure with no declared reaggregation', { ...line, measures: [{ field: 'count' }, { field: 'undeclared' }], stack: 'percent' }, { code: 'not-additive', field: 'undeclared' }],
  ] as [string, ChartConfig, unknown][])('refuses %s instead of repairing it', (_label, config, problem) => {
    expect(resolveChartConfig(config, rows, meta)).toEqual({ status: 'problem', problem });
  });

  const t0 = '2026-11-01T00:00:00';
  it.each([
    ['a text measure', [{ time: t0, yield: '0.9' }], 'yield'],
    ['an infinite measure', [{ time: t0, yield: Number.POSITIVE_INFINITY }], 'yield'],
    ['a missing x', [{ yield: 1 }], 'time'],
    ['a time x that is not a wall-clock time', [{ time: '2026-11-01', yield: 1 }], 'time'],
    ['a time x that is a number', [{ time: 1_700_000_000_000, yield: 1 }], 'time'],
    ['a time x that is not a real date', [{ time: '2026-02-30T00:00:00', yield: 1 }], 'time'],
    ['an x only inherited from Object', [Object.create({ time: t0, yield: 1 }) as Record<string, number>], 'time'],
  ])('refuses %s in a row', (_label, badRows, field) => {
    expect(resolveChartConfig(line, badRows, meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field } });
  });

  it('refuses a negative measure in a percent stack only', () => {
    const config: ChartConfig = { ...line, measures: [{ field: 'count' }, { field: 'moves' }], stack: 'percent' };
    expect(resolveChartConfig(config, [{ time: t0, count: -1, moves: 2 }], meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field: 'count' } });
    expect(resolveChartConfig({ ...config, stack: 'stack' }, [{ time: t0, count: -1, moves: 2 }], meta).status).toBe('ok');
  });

  it('refuses a blank category x', () => {
    const config: ChartConfig = { version: 1, kind: 'bar', x: { field: 'eqp', type: 'category' }, measures: [{ field: 'count' }] };
    expect(resolveChartConfig(config, [{ eqp: ' ', count: 1 }], meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field: 'eqp' } });
  });

  const split: ChartConfig = { ...line, measures: [{ field: 'count' }], split: { field: 'eqp' } };
  it.each([
    ['a missing split value', [{ time: t0, count: 1 }]],
    ['a blank split value', [{ time: t0, eqp: '', count: 1 }]],
  ])('refuses %s', (_label, badRows) => {
    expect(resolveChartConfig(split, badRows, meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field: 'eqp' } });
  });

  it.each([
    ['two rows for one x without a split', line, [{ time: t0, yield: 1 }, { time: t0, yield: 2 }], 'time'],
    ['two rows for one x and split value', split, [{ time: t0, eqp: 'E1', count: 1 }, { time: t0, eqp: 'E1', count: 2 }], 'eqp'],
    ['a number and a text split value that print alike', split, [{ time: t0, eqp: 1, count: 1 }, { time: '2026-11-01T01:00:00', eqp: '1', count: 2 }], 'eqp'],
    ['a number and a text category x that print alike', { version: 1, kind: 'bar', x: { field: 'eqp', type: 'category' }, measures: [{ field: 'count' }] }, [{ eqp: 1, count: 1 }, { eqp: '1', count: 2 }], 'eqp'],
  ] as [string, ChartConfig, Record<string, unknown>[], string][])('refuses %s instead of keeping one', (_label, config, badRows, field) => {
    expect(resolveChartConfig(config, badRows as never, meta)).toEqual({ status: 'problem', problem: { code: 'duplicate-point', field } });
  });
});
