import { expect, it } from 'vitest';
import { emptyGlobal, wallClockEpochMs } from '@ap/contracts';
import { DEFAULT_EQUIPMENT, type ConfigHistory } from '../endpoints';
import { configurationMock, makeRow } from './index';

const context = { ...emptyGlobal, from: '2026-11-16T00:00:00', to: '2026-11-18T00:00:00' };
const request = (itemId: string) => ({ params: { itemId, equipment: DEFAULT_EQUIPMENT }, context, equipment: [], actor: 'engineer' as const });
const endpoint = () => configurationMock.find(entry => entry.spec.id === 'configuration.history')!;
const read = (itemId: string) => endpoint().handle(request(itemId)) as ConfigHistory;

it.each([[0, 'number'], [1, 'string']] as const)('returns deterministic bounded history for item %i with a matching closing snapshot', (index, valueType) => {
  const item = makeRow(index, { eq: DEFAULT_EQUIPMENT, mode: 'all', ref: 'EQ01', status: 'all', q: '', asOf: 'latest' });
  const history = read(item.id);
  expect(history).toEqual(read(item.id));
  expect(history.valueType).toBe(valueType);
  expect(history.series.map(series => series.equipment)).toEqual(DEFAULT_EQUIPMENT);
  expect(history.series.some(series => series.points.length > 1)).toBe(true);
  for (const series of history.series) {
    expect(Date.parse(series.points[0].at)).toBe(wallClockEpochMs(context.from));
    expect(series.points.at(-1)?.value).toBe(item.values[series.equipment].value);
    series.points.forEach((point, index) => {
      expect(Date.parse(point.at)).toBeLessThan(wallClockEpochMs(context.to)!);
      if (index > 0) {
        expect(Date.parse(point.at)).toBeGreaterThan(Date.parse(series.points[index - 1].at));
        expect(point.value).not.toBe(series.points[index - 1].value);
      }
    });
  }
});

it('rejects malformed item ids, equipment and applied periods', () => {
  const input = request('cfg-000000');
  expect(endpoint().validate?.(input)).toBeNull();
  expect(endpoint().validate?.(request('cfg-999999'))).toBeTruthy();
  expect(endpoint().validate?.({ ...input, params: { ...input.params, equipment: ['EQ01', 'EQ01'] } })).toBeTruthy();
  expect(endpoint().validate?.({ ...input, context: { ...context, to: context.from } })).toBeTruthy();
});
