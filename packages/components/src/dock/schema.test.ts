import { describe, expect, it } from 'vitest';
import { isValidDockTree, normalizeDockTree, type DockNode } from './schema';

const group = (panels: string[], active = panels[0]!): DockNode => ({ type: 'group', panels, active });
const row = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes, children });
const column = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'column', sizes, children });
const IDS = ['a', 'b', 'c'];

describe('normalizeDockTree', () => {
  it.each<[string, unknown, DockNode]>([
    ['garbage: null', null, group(['a', 'b', 'c'])],
    ['garbage: a string', 'tree', group(['a', 'b', 'c'])],
    ['garbage: an unknown node type', { type: 'tab' }, group(['a', 'b', 'c'])],
    ['garbage: a branch without children', { type: 'branch', dir: 'row', sizes: [], children: 'x' }, group(['a', 'b', 'c'])],
    ['garbage: a group whose panels are not an array', { type: 'group', panels: 'a', active: 'a' }, group(['a', 'b', 'c'])],
    ['valid tree is kept', row([60, 40], group(['a', 'b'], 'b'), group(['c'])), row([60, 40], group(['a', 'b'], 'b'), group(['c']))],
    ['unknown id dropped', group(['a', 'zzz', 'b', 'c']), group(['a', 'b', 'c'])],
    ['duplicate id in one group dropped', group(['a', 'a', 'b', 'c']), group(['a', 'b', 'c'])],
    ['duplicate id across groups keeps the first', row([50, 50], group(['a', 'b']), group(['b', 'c'])), row([50, 50], group(['a', 'b']), group(['c']))],
    ['empty group removed, sizes renormalised', row([20, 30, 50], group(['a']), group([]), group(['b', 'c'])), row([(20 / 70) * 100, (50 / 70) * 100], group(['a']), group(['b', 'c']))],
    ['one-child branch collapses to the child', row([100], group(['a', 'b', 'c'])), group(['a', 'b', 'c'])],
    ['group emptied by unknown ids is removed and the branch collapses', row([50, 50], group(['a', 'b', 'c']), group(['zzz'])), group(['a', 'b', 'c'])],
    ['same-direction nesting flattens', row([50, 50], group(['a']), row([40, 60], group(['b']), group(['c']))), row([50, 20, 30], group(['a']), group(['b']), group(['c']))],
    ['bad sizes: NaN', row([Number.NaN, 50], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad sizes: negative', row([-10, 110], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad sizes: zero', row([0, 100], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad sizes: wrong count', row([100], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad sizes: sum is not 100', row([30, 30], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad sizes: not numbers', row(['1', '2'] as unknown as number[], group(['a']), group(['b', 'c'])), row([50, 50], group(['a']), group(['b', 'c']))],
    ['bad active repaired to the first panel', group(['a', 'b', 'c'], 'zzz'), group(['a', 'b', 'c'], 'a')],
    ['missing ids appended to the first group depth-first', column([50, 50], row([50, 50], group(['a']), group(['b'])), group(['zzz'])), row([50, 50], group(['a', 'c']), group(['b']))],
  ])('%s', (_name, raw, expected) => {
    const tree = normalizeDockTree(raw, IDS);
    expect(tree).toEqual(expected);
    expect(isValidDockTree(tree, IDS)).toBe(true);
  });

  it('never throws on hostile input and always returns a valid tree', () => {
    const cyclic: Record<string, unknown> = { type: 'branch', dir: 'row', sizes: [50, 50] };
    cyclic.children = [cyclic, { type: 'group', panels: ['a'], active: 'a' }];
    for (const raw of [undefined, 42, [], {}, cyclic, { type: 'group', panels: [null, 1, {}], active: {} }]) {
      expect(isValidDockTree(normalizeDockTree(raw, IDS), IDS)).toBe(true);
    }
  });

  it('keeps ids in the given order and ignores duplicate ids in the input list', () => {
    expect(normalizeDockTree(undefined, ['b', 'a', 'b'])).toEqual(group(['b', 'a']));
  });
});

describe('isValidDockTree', () => {
  it.each<[string, unknown, boolean]>([
    ['one group of all ids', group(['a', 'b', 'c']), true],
    ['nested row/column', row([50, 50], group(['a']), column([30, 70], group(['b']), group(['c']))), true],
    ['sum within tolerance', row([33.333, 66.667], group(['a']), group(['b', 'c'])), true],
    ['missing id', group(['a', 'b']), false],
    ['extra id', group(['a', 'b', 'c', 'd']), false],
    ['duplicate id', row([50, 50], group(['a', 'b']), group(['b', 'c'])), false],
    ['active outside its group', group(['a', 'b', 'c'], 'x'), false],
    ['empty group', row([50, 50], group([], ''), group(['a', 'b', 'c'])), false],
    ['one-child branch', row([100], group(['a', 'b', 'c'])), false],
    ['size count differs from children', row([100], group(['a']), group(['b', 'c'])), false],
    ['negative size', row([-1, 101], group(['a']), group(['b', 'c'])), false],
    ['NaN size', row([Number.NaN, 50], group(['a']), group(['b', 'c'])), false],
    ['sum is not 100', row([40, 40], group(['a']), group(['b', 'c'])), false],
    ['unknown direction', { type: 'branch', dir: 'diagonal', sizes: [50, 50], children: [group(['a']), group(['b', 'c'])] }, false],
    ['not an object', 'tree', false],
    ['null', null, false],
  ])('%s', (_name, tree, expected) => {
    expect(isValidDockTree(tree, IDS)).toBe(expected);
  });
});
