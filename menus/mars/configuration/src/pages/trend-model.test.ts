import { expect, it } from 'vitest';
import type { ConfigHistory, HistoryPoint } from '../endpoints';
import { historyColors, pointsOnDays, resolveDay, timelineModel } from './trend-model';

const to = '2026-11-16T04:00:00';
const points = (...entries: [number, HistoryPoint['value']][]): HistoryPoint[] =>
  entries.map(([hour, value]) => ({ at: new Date(Date.UTC(2026, 10, 16, hour)).toISOString(), value }));

it('colors only trajectories outside the majority and gives the reference a distinct override', () => {
  const history: ConfigHistory = { item: 'Pressure', valueType: 'number', series: [
    { equipment: 'EQ01', points: points([0, 120], [1, 122]) },
    { equipment: 'EQ02', points: points([0, 120], [1, 122], [2, 122]) },
    { equipment: 'EQ03', points: points([0, 120], [2, 122]) },
    { equipment: 'EQ04', points: points([0, 120], [1, 122]) },
  ] };
  const colors = historyColors(history, 'EQ03');
  expect(colors.get('EQ01')).toBe('chart-remainder');
  expect(colors.get('EQ02')).toBe('chart-remainder');
  expect(colors.get('EQ04')).toBe('chart-remainder');
  expect(colors.get('EQ03')).toBe('chart-selection-outline');
  expect(historyColors(history).get('EQ03')).toBe('chart-series-1');
});

it('uses elapsed duration for the neutral string value and merges adjacent identical values', () => {
  const history: ConfigHistory = { item: 'Mode', valueType: 'string', series: [
    { equipment: 'EQ01', points: points([0, 'AUTO'], [1, 'AUTO'], [3, 'MANUAL']) },
    { equipment: 'EQ02', points: points([0, 'MANUAL'], [1, 'AUTO'], [3, null]) },
  ] };
  const result = timelineModel(history, to);
  expect(result.values).toEqual([{ value: 'AUTO', color: 'chart-remainder' }, { value: 'MANUAL', color: 'chart-series-1' }]);
  expect(result.lanes[0].segments).toHaveLength(2);
  expect(result.lanes[0].segments[0].end).toBe(Date.parse(points([3, 'MANUAL'])[0].at));
  expect(result.lanes[1].segments.at(-1)).toMatchObject({ neutral: true, end: Date.parse(to + 'Z') });
});

it('resolves received HW Time days with or without a year against the applied period (#2763)', () => {
  const period = { from: '2026-12-30T00:00:00', to: '2027-01-03T00:00:00' };
  expect(resolveDay('2026-12-31', period)).toBe('2026-12-31');
  expect(resolveDay('12-31', period)).toBe('2026-12-31');
  expect(resolveDay('01-02', period)).toBe('2027-01-02');
  expect(resolveDay('06-01', period)).toBeNull();
  expect(resolveDay('2026/12/31', period)).toBeNull();
});

it('highlights only the change points on the received days, never the period-end carry point (#2763)', () => {
  const period = { from: '2026-11-10T00:00:00', to: '2026-11-16T00:00:00' };
  const series = [
    { id: 'A', name: 'A', points: [['2026-11-10T00:00:00', 1], ['2026-11-12T09:00:00', 2], ['2026-11-16T00:00:00', 2]] },
    { id: 'B', name: 'B', points: [['2026-11-10T00:00:00', 4], ['2026-11-13T23:59:00', 5], ['2026-11-14T00:00:00', 6], ['2026-11-16T00:00:00', 6]] },
  ] as never;
  expect(pointsOnDays(series, { from: '11-12', to: '11-13' }, period)).toEqual(['2026-11-12T09:00:00', '2026-11-13T23:59:00']);
  expect(pointsOnDays(series, { from: '2026-11-15', to: '2026-11-16' }, period)).toEqual([]);
  expect(pointsOnDays(series, null, period)).toEqual([]);
  // The period-start value of each line is a snapshot, not a change (R C9).
  expect(pointsOnDays(series, { from: '11-10', to: '11-11' }, period)).toEqual([]);
  expect(pointsOnDays(series, { from: '11-14', to: '11-12' }, period)).toEqual([]);
});
