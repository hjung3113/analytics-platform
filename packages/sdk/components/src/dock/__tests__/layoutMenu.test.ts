import { describe, expect, it } from 'vitest';
import { dockLayoutMenu } from '../layoutMenu';
import type { DockNode } from '../schema';

const group = (...panels: string[]): DockNode => ({ type: 'group', panels, active: panels[0]! });
const row = (...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes: children.map(() => 100 / children.length), children });
const number = (id: string) => Number(id.slice(1));

describe('dockLayoutMenu', () => {
  it('offers only restore while maximized', () => {
    expect(dockLayoutMenu(row(group('p1', 'p2'), group('p3')), 'p1', { maximized: true, orderOf: () => 0 })).toEqual({ maximized: true });
  });

  it('splits against the group\'s other panel, and not at all for a group of one', () => {
    const tree = row(group('p1', 'p2'), group('p3'));
    expect(dockLayoutMenu(tree, 'p2', { maximized: false, orderOf: () => 0 })).toMatchObject({ split: 'p1' });
    expect(dockLayoutMenu(tree, 'p3', { maximized: false, orderOf: () => 0 })).toMatchObject({ split: null });
  });

  it('orders the move targets by the caller\'s key, not by position', () => {
    const tree = row(group('p4'), group('p1'), group('p2', 'p3'));
    const menu = dockLayoutMenu(tree, 'p4', { maximized: false, orderOf: g => Math.min(...g.panels.map(number)) });
    expect(menu.maximized === false && menu.moves.map(move => [move.order, move.target])).toEqual([[1, 'p1'], [2, 'p2']]);
    const reversed = dockLayoutMenu(tree, 'p4', { maximized: false, orderOf: g => -Math.min(...g.panels.map(number)) });
    expect(reversed.maximized === false && reversed.moves.map(move => move.target)).toEqual(['p2', 'p1']);
  });

  it('offers nothing for an unknown panel', () => {
    expect(dockLayoutMenu(group('p1'), 'zz', { maximized: false, orderOf: () => 0 })).toEqual({ maximized: false, split: null, moves: [] });
  });
});
