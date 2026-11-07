import { expect, it } from 'vitest';
import { intervalShape, orderTicks, orderX, visibleOrderedItems } from '../orderedIntervalGeometry';
import type { OrderedTrackItem } from '../orderedIntervalTypes';
const items: OrderedTrackItem[] = [
  { id: 'later-clock', laneKey: 'a', orderStart: 1, orderEnd: 4, state: 'ok', label: '12:00' },
  { id: 'earlier-clock', laneKey: 'a', orderStart: 5, orderEnd: 8, state: 'ok', label: '11:00' },
  { id: 'open', laneKey: 'b', orderStart: 7, state: 'ok', label: 'Open' },
  { id: 'point', kind: 'point', laneKey: 'b', orderStart: 9, state: 'ok', label: 'Point' },
];
it('positions by ordinal, preserving inverted display times', () => {
  expect(orderX(5, [0, 10], 100)).toBe(162);
  expect(visibleOrderedItems(items, [0, 10], ['a']).map((item) => item.id)).toEqual([
    'later-clock',
    'earlier-clock',
  ]);
});
it('windows both lanes and ranges including carryover and open intervals', () => {
  expect(visibleOrderedItems(items, [8, 10], ['b']).map((item) => item.id)).toEqual([
    'open',
    'point',
  ]);
  expect(visibleOrderedItems(items, [2, 3], ['a']).map((item) => item.id)).toEqual(['later-clock']);
});
it.each([
  [0, 12000, 1000, [0, 2000, 4000, 6000, 8000, 10000, 12000]],
  [3900, 4450, 700, [3900, 4000, 4100, 4200, 4300, 4400]],
])('uses integer 1/2/5 ticks for %i–%i', (from, to, width, expected) => {
  expect(orderTicks([from as number, to as number], width as number)).toEqual(expected);
});
it('distinguishes open ends and skips ordinary outlines below four pixels', () => {
  expect(intervalShape(items[2], [0, 10], 100)).toMatchObject({
    open: true,
    outline: true,
    width: 30,
  });
  expect(
    intervalShape({ ...items[0], kind: 'interval', orderEnd: 1.2 }, [0, 10], 100),
  ).toMatchObject({ open: false, outline: false });
});
