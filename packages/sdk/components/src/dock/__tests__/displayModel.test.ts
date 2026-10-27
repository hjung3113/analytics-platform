import { describe, expect, it } from 'vitest';
import { dockBoundaries, pairBounds, stackedTree, visiblePanelIds } from '../displayModel';
import type { DockNode } from '../schema';

const group = (panels: string[], active = panels[0]!): DockNode => ({ type: 'group', panels, active });
const row = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes, children });
const column = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'column', sizes, children });
const MIN = { width: 240, height: 160 };

describe('stackedTree (narrow display)', () => {
  const layout = row([50, 50], group(['a', 'b'], 'b'), column([50, 50], group(['c']), group(['d'], 'd')));
  it.each<[string, string | undefined, DockNode]>([
    ['one group of every panel in depth-first order, the first group\'s active tab', undefined, group(['a', 'b', 'c', 'd'], 'b')],
    ['the local choice', 'd', group(['a', 'b', 'c', 'd'], 'd')],
    ['an unknown local choice is ignored', 'zzz', group(['a', 'b', 'c', 'd'], 'b')],
  ])('%s', (_name, choice, expected) => {
    expect(stackedTree(layout, choice)).toEqual(expected);
  });
});

describe('stackedTree order', () => {
  const layout = row([50, 50], group(['a', 'b'], 'b'), column([50, 50], group(['c']), group(['d'], 'd')));
  it('puts the tabs in the caller\'s order when it has one, and keeps the active tab', () => {
    expect(stackedTree(layout, undefined, ['d', 'c', 'b', 'a'])).toEqual(group(['d', 'c', 'b', 'a'], 'b'));
    expect(stackedTree(layout, 'c', ['a', 'b', 'c', 'd'])).toEqual(group(['a', 'b', 'c', 'd'], 'c'));
  });
});

describe('visiblePanelIds', () => {
  const layout = row([50, 50], group(['a', 'b'], 'b'), group(['c']));
  it.each<[string, string | null, string[]]>([
    ['the active tab of every group', null, ['b', 'c']],
    ['only the maximized group, showing its active tab', 'c', ['c']],
    ['a background tab maximizes its group (the group\'s active tab shows)', 'a', ['b']],
    ['an unknown maximized id changes nothing', 'zzz', ['b', 'c']],
  ])('%s', (_name, maximized, expected) => {
    expect([...visiblePanelIds(layout, maximized)].sort()).toEqual(expected);
  });
});

describe('dockBoundaries', () => {
  it('lists one boundary per adjacent pair with panels and minimum extents along the split', () => {
    const boundaries = dockBoundaries(row([30, 30, 40], group(['a']), column([50, 50], group(['b']), group(['c'])), group(['d'])), MIN);
    expect(boundaries.map(item => [item.dir, item.path, item.index, item.before, item.after])).toEqual([
      ['row', [], 0, ['a'], ['b', 'c']],
      ['row', [], 1, ['b', 'c'], ['d']],
      ['column', [1], 0, ['b'], ['c']],
    ]);
    expect(boundaries[0]).toMatchObject({ beforePercent: 30, pairPercent: 60, minBefore: 240, minAfter: 240, beforeControl: 'a', afterControl: 'b' });
    expect(boundaries[2]).toMatchObject({ minBefore: 160, minAfter: 160 });
  });

  it('sums minimums of siblings along the axis', () => {
    const [boundary] = dockBoundaries(column([50, 50], group(['a']), row([50, 50], group(['b']), group(['c']))), MIN);
    expect(boundary).toMatchObject({ dir: 'column', minBefore: 160, minAfter: 160 });
    const [wide] = dockBoundaries(row([50, 50], group(['a']), column([50, 50], group(['b']), row([50, 50], group(['c']), group(['d'])))), MIN);
    expect(wide).toMatchObject({ minAfter: 480 });
  });

  it('uses a panel\'s own minimum, the largest of a group\'s tabs, so keyboard limits match the engine', () => {
    const own = new Map([['a', { minWidth: 480 }], ['c', { minWidth: 100 }]]);
    const [boundary] = dockBoundaries(row([50, 50], group(['a', 'x']), group(['c'])), MIN, own);
    expect(boundary).toMatchObject({ minBefore: 480, minAfter: 100 });
    expect(pairBounds({ ...boundary!, beforePercent: 50, pairPercent: 100 }, 1000)).toMatchObject({ min: 48, max: 90 });
  });

  it('has none for a single group', () => {
    expect(dockBoundaries(group(['a', 'b']), MIN)).toEqual([]);
  });
});

describe('pairBounds', () => {
  const [boundary] = dockBoundaries(row([50, 50], group(['a']), group(['b'])), MIN);
  it.each<[string, number, { min: number; max: number; now: number }]>([
    ['unmeasured pairs fall back to 10–90', 0, { min: 10, max: 90, now: 50 }],
    ['the minimum extents against the measured pair', 1200, { min: 20, max: 80, now: 50 }],
    ['a pair too small for both minimums pins the value', 400, { min: 50, max: 50, now: 50 }],
  ])('%s', (_name, pairPx, expected) => {
    expect(pairBounds(boundary!, pairPx)).toEqual(expected);
  });
});
