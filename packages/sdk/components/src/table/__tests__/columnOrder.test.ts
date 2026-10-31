import { describe, expect, it } from 'vitest';
import { effectiveOrder, moveWithinGroup, pinnedInOrder } from '../columnOrder';

describe('effectiveOrder (#556a)', () => {
  const declared = ['a', 'b', 'c', 'd'];
  it('an empty saved order is the declaration order', () => expect(effectiveOrder(declared, [])).toEqual(declared));
  it('follows the saved order (fails if the saved order is ignored)', () => expect(effectiveOrder(declared, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b']));
  it('drops unknown ids and repeats', () => expect(effectiveOrder(declared, ['x', 'b', 'a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd']));
  it('inserts a column the saved list lacks after its declared predecessor', () => {
    expect(effectiveOrder(declared, ['d', 'b', 'a'])).toEqual(['d', 'b', 'c', 'a']);
    expect(effectiveOrder(['a', 'n', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'n', 'b']);
  });
  it('a new first column goes first', () => expect(effectiveOrder(['n', 'a', 'b'], ['b', 'a'])).toEqual(['n', 'b', 'a']));
});

describe('pinnedInOrder / moveWithinGroup (#556a)', () => {
  it('pins follow the pinning order without a saved order and the effective order with one', () => {
    expect(pinnedInOrder(['c', 'a'], ['a', 'b', 'c'], false)).toEqual(['c', 'a']);
    expect(pinnedInOrder(['c', 'a', 'gone'], ['a', 'b', 'c'], true)).toEqual(['a', 'c']);
  });
  it('moves inside the group and leaves other slots alone', () => {
    expect(moveWithinGroup(['a', 'b', 'c', 'd'], ['a', 'c'], 'a', 1)).toEqual(['c', 'b', 'a', 'd']);
    expect(moveWithinGroup(['a', 'b', 'c', 'd'], ['b', 'd'], 'd', 0)).toEqual(['a', 'd', 'c', 'b']);
  });
  it('clamps the target index', () => expect(moveWithinGroup(['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']));
});
