import { expect, it } from 'vitest';

import { mergeRows } from '../merge.js';
import { MenuUpstreamError } from '../forwarder.js';

it.each([
  [[10, 2, -1], 'asc', [-1, 2, 10]],
  [['a', 'Z', '😀', '\uE000'], 'asc', ['Z', 'a', '\uE000', '😀']],
  [['a', 'aa', 'Z'], 'desc', ['aa', 'a', 'Z']],
  [[null, 2, 1], 'asc', [1, 2, null]],
  [[null, 2, 1], 'desc', [2, 1, null]],
] as const)('compares %j in %s order with null last', (values, direction, expected) => {
  const rows = values.map((value, id) => ({ value, id }));
  expect(mergeRows([rows], [{ field: 'value', direction }, { field: 'id', direction: 'asc', unique: true }])).toEqual(expected.map((value) => rows.find((row) => row.value === value)));
});
it('uses all sort keys, then the unique key', () => {
  expect(mergeRows([[{ group: 1, id: 3 }, { group: 2, id: 1 }], [{ group: 1, id: 2 }]], [{ field: 'group', direction: 'desc' }, { field: 'id', direction: 'asc', unique: true }])).toEqual([{ group: 2, id: 1 }, { group: 1, id: 2 }, { group: 1, id: 3 }]);
});
it('rejects cross-leg duplicate unique values even with different preceding keys', () => {
  expect(() => mergeRows([[{ group: 1, id: 'syn-private' }], [{ group: 2, id: 'syn-private' }]], [{ field: 'group', direction: 'asc' }, { field: 'id', direction: 'asc', unique: true }])).toThrow(new MenuUpstreamError('unavailable'));
});
it('retains declaration order then row order without sorting', () => {
  expect(mergeRows([[3, 1], [2]], undefined)).toEqual([3, 1, 2]);
});
it.each([undefined, {}, true, Number.NaN])('fails closed on an invalid sort value %j', (value) => {
  expect(() => mergeRows([[{ id: value }]], [{ field: 'id', direction: 'asc', unique: true }])).toThrow(new MenuUpstreamError('unavailable'));
});

it('refuses mixed non-null sort types with a fixed failure', () => {
  expect(() => mergeRows([[{ id: 1 }], [{ id: '2' }]], [{ field: 'id', direction: 'asc', unique: true }])).toThrow(new MenuUpstreamError('unavailable'));
});
