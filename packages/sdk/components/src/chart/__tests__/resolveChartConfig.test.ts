import { invalidChartConfig, type ChartConfig } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { resolveChartConfig, type ChartFieldMeta } from '../resolveChartConfig';

const meta: Record<string, ChartFieldMeta> = {
  time: { label: '시각' },
  eqp: { label: '설비' },
  yield: { label: '수율', unit: '%', reaggregation: 'ratioOfSums', metricVersion: 'v2' },
  count: { label: '건수', unit: '건', reaggregation: 'sum' },
  moves: { label: '이동', unit: '건', reaggregation: 'sum' },
  undeclared: { label: '미선언', unit: '건' },
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

  it('turns the format descriptor into the formatter for both axes', () => {
    const frame = ok({ ...line, measures: [{ field: 'count' }, { field: 'yield', axis: 'right' }], valueFormat: { kind: 'percent', decimals: 1 } });
    expect(frame.valueFormat?.(0.1234)).toBe('12.3%');
    expect(frame.rightAxis?.valueFormat?.(0.5)).toBe('50.0%');
    expect(ok({ ...line, valueFormat: { kind: 'number', decimals: 0 } }).valueFormat?.(1234.5)).toBe('1,235');
  });

  it('passes orientation and area fill through', () => {
    expect(ok({ version: 1, kind: 'bar', x: { field: 'eqp', type: 'category' }, measures: [{ field: 'count' }], orientation: 'horizontal' }).orientation).toBe('horizontal');
    expect(ok({ ...line, areaFill: true }).areaFill).toBe(true);
  });

  it.each([
    ['a field without meta', { ...line, measures: [{ field: 'gone' }] }, { code: 'unknown-field', field: 'gone' }],
    ['a meta key inherited from Object', { ...line, x: { field: 'constructor', type: 'time' } }, { code: 'unknown-field', field: 'constructor' }],
    ['two units on one axis', { ...line, measures: [{ field: 'count' }, { field: 'yield' }] }, { code: 'mixed-units', field: 'yield' }],
    ['stacking a ratio', { ...line, measures: [{ field: 'yield' }], stack: 'stack' }, { code: 'not-additive', field: 'yield' }],
    ['percent-stacking a measure with no declared reaggregation', { ...line, measures: [{ field: 'count' }, { field: 'undeclared' }], stack: 'percent' }, { code: 'not-additive', field: 'undeclared' }],
  ] as [string, ChartConfig, unknown][])('refuses %s instead of repairing it', (_label, config, problem) => {
    expect(resolveChartConfig(config, rows, meta)).toEqual({ status: 'problem', problem });
  });

  it.each([
    ['a text measure', [{ time: 't', yield: '0.9' }], 'yield'],
    ['an infinite measure', [{ time: 't', yield: Number.POSITIVE_INFINITY }], 'yield'],
    ['a missing x', [{ yield: 1 }], 'time'],
  ])('refuses %s in a row', (_label, badRows, field) => {
    expect(resolveChartConfig(line, badRows, meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field } });
  });

  it('refuses a missing split value', () => {
    const config: ChartConfig = { ...line, measures: [{ field: 'count' }], split: { field: 'eqp' } };
    expect(resolveChartConfig(config, [{ time: 't', count: 1 }], meta)).toEqual({ status: 'problem', problem: { code: 'bad-value', field: 'eqp' } });
  });

  it('refuses two rows for one x and split value instead of keeping one', () => {
    const config: ChartConfig = { ...line, measures: [{ field: 'count' }], split: { field: 'eqp' } };
    const twice = [{ time: 't', eqp: 'E1', count: 1 }, { time: 't', eqp: 'E1', count: 2 }];
    expect(resolveChartConfig(config, twice, meta)).toEqual({ status: 'problem', problem: { code: 'duplicate-point', field: 'eqp' } });
  });
});
