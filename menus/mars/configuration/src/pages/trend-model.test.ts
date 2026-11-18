import { expect, it } from 'vitest';
import type { ConfigHistory, HistoryPoint } from '../endpoints';
import { historyColors, timelineModel } from './trend-model';

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
