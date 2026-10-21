import { describe, expect, it } from 'vitest';
import { fromEngineLayout, keepStoredSizes, sameDockTree, toEngineLayout, type EngineLayout } from './engineModel';
import type { DockNode } from './schema';

const group = (panels: string[], active = panels[0]!): DockNode => ({ type: 'group', panels, active });
const row = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'row', sizes, children });
const column = (sizes: number[], ...children: DockNode[]): DockNode => ({ type: 'branch', dir: 'column', sizes, children });
const PANELS = ['a', 'b', 'c', 'd'].map(id => ({ id, title: `T${id}` }));
const MIN = { width: 100, height: 50 };

describe('engine layout round trip', () => {
  it.each<[string, DockNode]>([
    ['one group', group(['a', 'b', 'c', 'd'], 'c')],
    ['a row', row([60, 40], group(['a', 'b'], 'b'), group(['c', 'd']))],
    ['a column', column([25, 75], group(['a']), group(['b', 'c', 'd']))],
    ['nested row/column', row([30, 70], group(['a']), column([40, 60], group(['b']), row([50, 50], group(['c']), group(['d']))))],
  ])('%s survives to the engine shape and back', (_name, tree) => {
    const engine = toEngineLayout(tree, PANELS, MIN, { width: 1200, height: 800 });
    const { tree: back, measured } = fromEngineLayout(engine);
    expect(measured).toBe(true);
    expect(sameDockTree(back, tree, { sizes: true, tolerance: 0.01 })).toBe(true);
  });

  it('describes every panel as always-rendered with our components and the minimum size', () => {
    const engine = toEngineLayout(row([50, 50], group(['a']), group(['b'])), PANELS.slice(0, 2), MIN, { width: 800, height: 600 });
    expect(engine.panels.a).toEqual({ id: 'a', contentComponent: 'panel', tabComponent: 'tab', title: 'Ta', renderer: 'always', minimumWidth: 100, minimumHeight: 50 });
    expect(Object.keys(engine.panels)).toEqual(['a', 'b']);
  });

  it('puts px sizes on the engine convention: children carry the extent along their parent, the root the orthogonal one', () => {
    const engine = toEngineLayout(row([25, 75], group(['a']), group(['b'])), PANELS.slice(0, 2), MIN, { width: 800, height: 600 });
    expect(engine.grid.orientation).toBe('HORIZONTAL');
    expect(engine.grid.root.size).toBe(600);
    expect(engine.grid.root.data.map(node => node.size)).toEqual([200, 600]);
    const column = toEngineLayout({ type: 'branch', dir: 'column', sizes: [25, 75], children: [group(['a']), group(['b'])] }, PANELS.slice(0, 2), MIN, { width: 800, height: 600 });
    expect(column.grid.orientation).toBe('VERTICAL');
    expect(column.grid.root.size).toBe(800);
    expect(column.grid.root.data.map(node => node.size)).toEqual([150, 450]);
  });

  it('lays out against a nominal size while the container has none', () => {
    const engine = toEngineLayout(row([50, 50], group(['a']), group(['b'])), PANELS.slice(0, 2), MIN, { width: 0, height: 0 });
    expect(engine.grid.width).toBeGreaterThan(0);
    expect(engine.grid.root.data.every(node => node.size > 0)).toBe(true);
  });

  it('reads unmeasured splits as equal shares and says so', () => {
    const engine = toEngineLayout(row([70, 30], group(['a']), group(['b'])), PANELS.slice(0, 2), MIN, { width: 800, height: 600 });
    const zeroed: EngineLayout = JSON.parse(JSON.stringify(engine));
    zeroed.grid.root.data.forEach(node => { node.size = 0; });
    const { tree, measured } = fromEngineLayout(zeroed);
    expect(measured).toBe(false);
    expect(tree).toEqual(row([50, 50], group(['a']), group(['b'])));
  });

  it('a same-direction nest is flattened before it reaches the engine', () => {
    const engine = toEngineLayout(row([50, 50], group(['a']), row([50, 50], group(['b']), group(['c']))), PANELS.slice(0, 3), MIN, { width: 800, height: 600 });
    expect(engine.grid.root.data).toHaveLength(3);
    expect(engine.grid.root.data.map(node => node.size)).toEqual([400, 200, 200]);
  });
});

describe('sameDockTree', () => {
  const base = row([50, 50], group(['a', 'b'], 'a'), group(['c']));
  it.each<[string, DockNode, boolean]>([
    ['identical', row([50, 50], group(['a', 'b'], 'a'), group(['c'])), true],
    ['sizes differ within tolerance', row([50.4, 49.6], group(['a', 'b'], 'a'), group(['c'])), true],
    ['sizes differ beyond tolerance', row([60, 40], group(['a', 'b'], 'a'), group(['c'])), false],
    ['different active tab', row([50, 50], group(['a', 'b'], 'b'), group(['c'])), false],
    ['different tab order', row([50, 50], group(['b', 'a'], 'a'), group(['c'])), false],
    ['different direction', column([50, 50], group(['a', 'b'], 'a'), group(['c'])), false],
    ['group vs branch', group(['a', 'b', 'c']), false],
  ])('%s', (_name, other, expected) => {
    expect(sameDockTree(base, other, { sizes: true })).toBe(expected);
  });

  it('ignores sizes when asked', () => {
    expect(sameDockTree(base, row([90, 10], group(['a', 'b'], 'a'), group(['c'])), { sizes: false })).toBe(true);
  });
});

describe('keepStoredSizes (C2)', () => {
  it('keeps the stored shares of a branch whose shape is unchanged, whatever the engine measured', () => {
    expect(keepStoredSizes(row([66, 34], group(['a', 'b'], 'b'), group(['c'])), row([90, 10], group(['b', 'a'], 'a'), group(['c'])))).toEqual(row([90, 10], group(['a', 'b'], 'b'), group(['c'])));
  });

  it('gives a new or changed branch equal shares and keeps the unchanged ones inside it', () => {
    const stored = row([70, 30], group(['a']), column([80, 20], group(['b']), group(['c'])));
    const read = row([10, 90], group(['a', 'b']), column([50, 50], group(['c']), group(['d'])));
    expect(keepStoredSizes(read, stored)).toEqual(row([50, 50], group(['a', 'b']), column([50, 50], group(['c']), group(['d']))));
  });

  it('equal shares add up to 100', () => {
    const next = keepStoredSizes(row([1, 1, 1], group(['a']), group(['b']), group(['c'])), group(['z'])) as Extract<DockNode, { type: 'branch' }>;
    expect(next.sizes.reduce((sum, size) => sum + size, 0)).toBeCloseTo(100, 5);
  });
});
