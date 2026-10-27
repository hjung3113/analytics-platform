import { describe, expect, it } from 'vitest';
import { activatePanel, addPanel, groupOf, movePanel, panelOrder, removePanel, resizeBoundary, type DockDropPosition } from '../commands';
import { isValidDockTree, type DockNode } from '../schema';

const group = (panels: string[], active = panels[0]!): DockNode => ({ type: 'group', panels, active });
const row = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes, children });
const column = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'column', sizes, children });
const ids = (tree: DockNode) => panelOrder(tree);
const frozen = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const TWO = row([60, 40], group(['a', 'b']), group(['c']));
const NESTED = row([50, 50], group(['a']), column([30, 70], group(['b']), group(['c', 'd'], 'd')));

describe('movePanel', () => {
  it.each<[string, DockNode, string, { panelId: string; position: DockDropPosition }, DockNode]>([
    ['centre joins the target group as the active tab', TWO, 'c', { panelId: 'a', position: 'center' }, group(['a', 'b', 'c'], 'c')],
    ['centre with the emptied source group removed', row([60, 40], group(['a']), group(['b'])), 'a', { panelId: 'b', position: 'center' }, group(['b', 'a'], 'a')],
    ['centre inside the own group only activates', TWO, 'a', { panelId: 'b', position: 'center' }, row([60, 40], group(['a', 'b'], 'a'), group(['c']))],
    ['edge splits the target group, same-direction sibling', TWO, 'a', { panelId: 'c', position: 'right' }, row([60, 20, 20], group(['b']), group(['c']), group(['a']))],
    ['edge to the left puts the new group before', TWO, 'a', { panelId: 'c', position: 'left' }, row([60, 20, 20], group(['b']), group(['a']), group(['c']))],
    ['edge in the other axis wraps the target in a branch', TWO, 'a', { panelId: 'c', position: 'bottom' }, row([60, 40], group(['b']), column([50, 50], group(['c']), group(['a'])))],
    ['top puts the new group first', TWO, 'a', { panelId: 'c', position: 'top' }, row([60, 40], group(['b']), column([50, 50], group(['a']), group(['c'])))],
    ['own group split: a tab leaves its siblings', TWO, 'b', { panelId: 'a', position: 'right' }, row([30, 30, 40], group(['a']), group(['b']), group(['c']))],
    ['a lone panel cannot split off itself', row([60, 40], group(['a']), group(['b'])), 'a', { panelId: 'a', position: 'right' }, row([60, 40], group(['a']), group(['b']))],
    ['emptied source group in a nested branch collapses it', NESTED, 'b', { panelId: 'a', position: 'center' }, row([50, 50], group(['a', 'b'], 'b'), group(['c', 'd'], 'd'))],
    ['emptied source flattens into the same-direction parent', NESTED, 'a', { panelId: 'd', position: 'center' }, column([30, 70], group(['b']), group(['c', 'd', 'a'], 'a'))],
    ['edge split next to a nested group joins its same-direction branch', NESTED, 'a', { panelId: 'c', position: 'bottom' }, column([30, 70 / 2, 70 / 2], group(['b']), group(['c', 'd'], 'd'), group(['a']))],
  ])('%s', (_name, tree, panelId, target, expected) => {
    const before = frozen(tree);
    const next = movePanel(tree, panelId, target);
    expect(tree).toEqual(before);
    expect(next).toEqual(expected);
    expect(isValidDockTree(next, ids(tree))).toBe(true);
  });

  it('throws on unknown panels', () => {
    expect(() => movePanel(TWO, 'x', { panelId: 'a', position: 'center' })).toThrow(RangeError);
    expect(() => movePanel(TWO, 'a', { panelId: 'x', position: 'center' })).toThrow(RangeError);
  });
});

describe('addPanel', () => {
  it.each<[string, DockNode, { panelId: string; position: 'center' | 'right' | 'bottom' }, DockNode]>([
    ['centre adds a tab to the near group and activates it', TWO, { panelId: 'c', position: 'center' }, row([60, 40], group(['a', 'b']), group(['c', 'x'], 'x'))],
    ['right adds a sibling group', TWO, { panelId: 'c', position: 'right' }, row([60, 20, 20], group(['a', 'b']), group(['c']), group(['x']))],
    ['bottom wraps a column', TWO, { panelId: 'c', position: 'bottom' }, row([60, 40], group(['a', 'b']), column([50, 50], group(['c']), group(['x'])))],
    ['nested near panel', NESTED, { panelId: 'b', position: 'right' }, row([50, 50], group(['a']), column([30, 70], row([50, 50], group(['b']), group(['x'])), group(['c', 'd'], 'd')))],
  ])('%s', (_name, tree, near, expected) => {
    const next = addPanel(tree, 'x', near);
    expect(next).toEqual(expected);
    expect(isValidDockTree(next, [...ids(tree), 'x'])).toBe(true);
  });

  it('throws on a duplicate or an unknown neighbour', () => {
    expect(() => addPanel(TWO, 'a', { panelId: 'c', position: 'center' })).toThrow(RangeError);
    expect(() => addPanel(TWO, 'x', { panelId: 'zzz', position: 'center' })).toThrow(RangeError);
  });
});

describe('removePanel', () => {
  it.each<[string, DockNode, string, DockNode]>([
    ['a tab of a group, active falls to the neighbour', row([60, 40], group(['a', 'b'], 'a'), group(['c'])), 'a', row([60, 40], group(['b']), group(['c']))],
    ['removing an inactive tab keeps the active one', TWO, 'b', row([60, 40], group(['a']), group(['c']))],
    ['the source group empties: branch collapses to the survivor', TWO, 'c', group(['a', 'b'])],
    ['sizes renormalise', row([20, 30, 50], group(['a']), group(['b']), group(['c'])), 'b', row([20 / 70 * 100, 50 / 70 * 100], group(['a']), group(['c']))],
    ['nested branch collapses and merges into the parent', NESTED, 'b', row([50, 50], group(['a']), group(['c', 'd'], 'd'))],
  ])('%s', (_name, tree, panelId, expected) => {
    const next = removePanel(tree, panelId);
    expect(next).toEqual(expected);
    expect(isValidDockTree(next, ids(tree).filter(id => id !== panelId))).toBe(true);
  });

  it('throws for the last panel and for unknown panels', () => {
    expect(() => removePanel(group(['a']), 'a')).toThrow(RangeError);
    expect(() => removePanel(TWO, 'x')).toThrow(RangeError);
  });
});

describe('activatePanel / groupOf / panelOrder', () => {
  it('activates inside its own group only', () => {
    expect(activatePanel(NESTED, 'c')).toEqual(row([50, 50], group(['a']), column([30, 70], group(['b']), group(['c', 'd'], 'c'))));
    expect(() => activatePanel(NESTED, 'x')).toThrow(RangeError);
  });

  it.each<[string, string, { panels: string[]; active: string } | undefined]>([
    ['first group', 'a', { panels: ['a'], active: 'a' }],
    ['nested group', 'c', { panels: ['c', 'd'], active: 'd' }],
    ['unknown', 'x', undefined],
  ])('groupOf: %s', (_name, panelId, expected) => {
    expect(groupOf(NESTED, panelId)).toEqual(expected);
  });

  it('panelOrder is depth-first', () => {
    expect(panelOrder(NESTED)).toEqual(['a', 'b', 'c', 'd']);
    expect(panelOrder(group(['z']))).toEqual(['z']);
  });
});

describe('resizeBoundary', () => {
  const THREE = row([20, 30, 50], group(['a']), group(['b']), group(['c']));
  it.each<[string, DockNode, number[], number, number, number, [number, number], number[]]>([
    ['moves the boundary', row([50, 50], group(['a']), group(['b'])), [], 0, 5, 0, [10, 10], [55, 45]],
    ['negative delta', row([50, 50], group(['a']), group(['b'])), [], 0, -5, 0, [10, 10], [45, 55]],
    ['only the pair changes', THREE, [], 1, 10, 0, [10, 10], [20, 40, 40]],
    ['clamps at the minimum of the first side', row([50, 50], group(['a']), group(['b'])), [], 0, -80, 0, [10, 20], [10, 90]],
    ['clamps at the minimum of the second side', row([50, 50], group(['a']), group(['b'])), [], 0, 80, 0, [10, 20], [80, 20]],
    ['an impossible pair is left alone', row([50, 50], group(['a']), group(['b'])), [], 0, 10, 0, [60, 60], [50, 50]],
  ])('%s', (_name, tree, path, index, delta, _unused, mins, expected) => {
    const next = resizeBoundary(tree, path, index, delta, mins);
    expect((next as Extract<DockNode, { type: 'branch' }>).sizes).toEqual(expected);
    expect(isValidDockTree(next, ids(tree))).toBe(true);
  });

  it('resizes a nested branch by path', () => {
    const next = resizeBoundary(NESTED, [1], 0, 10, [10, 10]) as Extract<DockNode, { type: 'branch' }>;
    expect((next.children[1] as Extract<DockNode, { type: 'branch' }>).sizes).toEqual([40, 60]);
    expect(next.sizes).toEqual([50, 50]);
  });

  it('throws for a path or index that does not exist', () => {
    expect(() => resizeBoundary(NESTED, [0], 0, 5, [10, 10])).toThrow(RangeError);
    expect(() => resizeBoundary(NESTED, [], 1, 5, [10, 10])).toThrow(RangeError);
  });
});
