import { describe, expect, it } from 'vitest';
import { movePanel } from '../dock/commands';
import { column, group, row } from '../dock/__tests__/harness';
import type { DockNode } from '../dock/schema';
import { canMoveBelow, clampRow, enterRows, moveToNewRow, NEW_ROW_HEIGHT, reconcileRows, rowMinimumOf, ROW_MIN_HEIGHT, topLevelRows, withRowShares } from './workspaceRows';

const min200 = () => ROW_MIN_HEIGHT;
const ids = (tree: DockNode): string[] => (tree.type === 'group' ? tree.panels : tree.children.flatMap(ids));
const rowsOf = (tree: DockNode) => topLevelRows(tree).map(ids);

describe('topLevelRows', () => {
  it.each<[string, DockNode, string[][]]>([
    ['a root column is its children', column([50, 50], group(['a']), group(['b'])), [['a'], ['b']]],
    ['a root row is one row', row([50, 50], group(['a']), group(['b'])), [['a', 'b']]],
    ['a root group is one row', group(['a', 'b']), [['a', 'b']]],
  ])('%s', (_name, tree, expected) => { expect(rowsOf(tree)).toEqual(expected); });
});

describe('rowMinimumOf', () => {
  const minimums = new Map([['tall', { minHeight: 300 }], ['short', { minHeight: 100 }]]);
  it.each<[string, DockNode, number]>([
    ['a group floors at 200 (160 default + the 40px strip)', group(['plain']), 200],
    ['the tallest tab of a group plus one strip', group(['plain', 'tall']), 340],
    ['a small panel never goes under 200', group(['short']), 200],
    ['side by side takes the tallest part', row([50, 50], group(['plain']), group(['tall'])), 340],
    ['nested vertical splits add up with a strip each', column([50, 50], group(['tall']), group(['short'])), 340 + 140],
  ])('%s', (_name, tree, expected) => { expect(rowMinimumOf(minimums)(tree)).toBe(expected); });
});

describe('clampRow', () => {
  it.each([[500, 200, 700, 500], [100, 200, 700, 200], [900, 200, 700, 700], [900, 800, 700, 800]])('%i within [%i, %i] is %i (a minimum above the maximum wins)', (px, low, high, expected) => {
    expect(clampRow(px, low, high)).toBe(expected);
  });
});

describe('enterRows (fit -> stack)', () => {
  it.each<[string, DockNode, number, number, number[]]>([
    ['row share x the fit height', column([40, 60], group(['a']), group(['b'])), 1000, 2000, [400, 600]],
    ['a short fit height is raised to rows x 360 first', column([50, 50], group(['a']), group(['b'])), 500, 2000, [360, 360]],
    ['a non-column root is one row of the fit height', row([50, 50], group(['a']), group(['b'])), 800, 2000, [800]],
    ['a root group is one row, at least 360', group(['a']), 100, 2000, [360]],
    ['a row never goes above the visible area', column([80, 20], group(['a']), group(['b'])), 2000, 700, [700, 400]],
    ['a row never goes under its minimum', column([5, 95], group(['a']), group(['b'])), 1000, 2000, [200, 950]],
  ])('%s', (_name, tree, baseline, maximum, expected) => { expect(enterRows(tree, baseline, min200, maximum)).toEqual(expected); });
});

describe('reconcileRows', () => {
  const two = column([50, 50], group(['a']), group(['b']));
  it.each<[string, DockNode, DockNode, number[], number[]]>([
    ['an activation or resize inside the rows changes nothing', two, column([30, 70], group(['a']), group(['b'])), [300, 500], [300, 500]],
    ['a new row below gets 360 and the others keep their px', two, column([40, 30, 30], group(['a']), group(['b']), group(['c'])), [300, 500], [300, 500, NEW_ROW_HEIGHT]],
    ['a row that loses its last panel is dropped and the others keep their px', column([34, 33, 33], group(['a']), group(['b']), group(['c'])), column([50, 50], group(['a']), group(['c'])), [300, 500, 420], [300, 420]],
    ['a row that keeps one of its panels keeps its px', column([50, 50], group(['a', 'x']), group(['b'])), column([50, 50], group(['a']), group(['b'])), [300, 500], [300, 500]],
    ['two rows merged into one keep the larger overlap first', two, group(['a', 'b']), [300, 500], [300]],
    ['a kept row is raised to its minimum, never lowered', column([50, 50], group(['a']), group(['b'])), column([50, 50], group(['a']), group(['b'])), [120, 500], [200, 500]],
  ])('%s', (_name, from, to, rows, expected) => { expect(reconcileRows(from, rows, to, min200, 700)).toEqual(expected); });

  describe('by provenance', () => {
    const three = column([30, 40, 30], group(['a']), group(['b', 'c', 'd']), group(['e']));

    it('a panel dropped above the first row is a new row; the row it left keeps its px and no survivor loses any', () => {
      const next = movePanel(three, 'b', { panelId: 'a', position: 'top' });
      expect(rowsOf(next)).toEqual([['b'], ['a'], ['c', 'd'], ['e']]);
      expect(reconcileRows(three, [300, 600, 400], next, min200, 800)).toEqual([NEW_ROW_HEIGHT, 300, 600, 400]);
    });

    it('a panel moved below from a row of its own: the new last row replaces the old one (net = new less removed)', () => {
      const stack = column([30, 40, 30], group(['a']), group(['b']), group(['c']));
      const next = moveToNewRow(stack, 'b');
      expect(rowsOf(next)).toEqual([['a'], ['c'], ['b']]);
      expect(reconcileRows(stack, [300, 500, 400], next, min200, 800, 'b')).toEqual([300, 400, NEW_ROW_HEIGHT]);
    });

    it('without the hint a row that keeps its panels keeps its px wherever it went', () => {
      const stack = column([30, 40, 30], group(['a']), group(['b']), group(['c']));
      expect(reconcileRows(stack, [300, 500, 400], moveToNewRow(stack, 'b'), min200, 800)).toEqual([300, 400, 500]);
    });

    it('a panel taken out of a shared row into a row of its own leaves the row it left at its px', () => {
      const stack = column([30, 70], group(['a']), group(['b', 'c']));
      const next = moveToNewRow(stack, 'c');
      expect(rowsOf(next)).toEqual([['a'], ['b'], ['c']]);
      expect(reconcileRows(stack, [300, 500], next, min200, 800, 'c')).toEqual([300, 500, NEW_ROW_HEIGHT]);
    });

    it('an engine drag of a tab out of a shared row to the top: the new first row is 360 and the row it left keeps its px', () => {
      const stack = column([40, 60], group(['a']), group(['b', 'c']));
      const next = movePanel(stack, 'b', { panelId: 'a', position: 'top' });
      expect(rowsOf(next)).toEqual([['b'], ['a'], ['c']]);
      expect(reconcileRows(stack, [300, 500], next, min200, 800, 'b')).toEqual([NEW_ROW_HEIGHT, 300, 500]);
    });

    it('an engine drag of a row of its own to the top: it counts as a new row (360) and the others keep their px', () => {
      const stack = column([30, 40, 30], group(['a']), group(['b']), group(['c']));
      const next = movePanel(stack, 'c', { panelId: 'a', position: 'top' });
      expect(rowsOf(next)).toEqual([['c'], ['a'], ['b']]);
      expect(reconcileRows(stack, [300, 500, 400], next, min200, 800, 'c')).toEqual([NEW_ROW_HEIGHT, 300, 500]);
    });

    it('a drag into the tabs of an existing row creates no row: the emptied source row goes, the others keep their px', () => {
      const stack = column([30, 40, 30], group(['a']), group(['b']), group(['c']));
      const next = movePanel(stack, 'b', { panelId: 'a', position: 'center' });
      expect(rowsOf(next)).toEqual([['a', 'b'], ['c']]);
      expect(reconcileRows(stack, [300, 500, 400], next, min200, 800, 'b')).toEqual([300, 400]);
    });

    it('a split above or below a panel in the same row keeps nested shares and the other rows untouched', () => {
      const nested = column([30, 70], group(['a']), row([40, 60], group(['b']), group(['c'])));
      const next = movePanel(nested, 'c', { panelId: 'a', position: 'bottom' });
      expect(reconcileRows(nested, [300, 500], next, min200, 800, 'c')).toEqual([300, NEW_ROW_HEIGHT, 500]);
    });
  });

  it('a new row follows its bounds', () => {
    expect(reconcileRows(two, [300, 500], column([40, 30, 30], group(['a']), group(['b']), group(['c'])), () => 500, 700)).toEqual([500, 500, 500]);
    expect(reconcileRows(two, [300, 500], column([40, 30, 30], group(['a']), group(['b']), group(['c'])), min200, 300)).toEqual([300, 500, 300]);
  });
});

describe('withRowShares', () => {
  it('projects px onto the top-level shares and leaves nested shares alone', () => {
    const tree = column([50, 50], row([30, 70], group(['a']), group(['b'])), group(['c']));
    const next = withRowShares(tree, [300, 900]) as Extract<DockNode, { type: 'branch' }>;
    expect(next.sizes).toEqual([25, 75]);
    expect((next.children[0] as Extract<DockNode, { type: 'branch' }>).sizes).toEqual([30, 70]);
    expect(next.sizes.reduce((total, size) => total + size, 0)).toBe(100);
  });
  it.each<[string, DockNode, number[]]>([
    ['a root that is not a column', row([50, 50], group(['a']), group(['b'])), [300]],
    ['a row count that does not match', column([50, 50], group(['a']), group(['b'])), [300]],
  ])('returns %s as it is', (_name, tree, rows) => { expect(withRowShares(tree, rows)).toBe(tree); });
});

describe('moveToNewRow and canMoveBelow', () => {
  it.each<[string, DockNode, string, string[][]]>([
    ['a panel of a row group becomes the new last row', column([50, 50], group(['a', 'x']), group(['b'])), 'x', [['a'], ['b'], ['x']]],
    ['a panel of a split row leaves it', column([50, 50], row([50, 50], group(['a']), group(['x'])), group(['b'])), 'x', [['a'], ['b'], ['x']]],
    ['the only panel of a middle row moves to the end and its row closes', column([34, 33, 33], group(['a']), group(['x']), group(['c'])), 'x', [['a'], ['c'], ['x']]],
    ['a panel of a non-column root makes the root a column of two rows', row([50, 50], group(['a']), group(['x'])), 'x', [['a'], ['x']]],
  ])('%s', (_name, tree, panel, expected) => {
    expect(canMoveBelow(tree, panel)).toBe(true);
    expect(rowsOf(moveToNewRow(tree, panel))).toEqual(expected);
  });
  it.each<[string, DockNode, string]>([
    ['a panel alone in the last row', column([50, 50], group(['a']), group(['x'])), 'x'],
    ['the only panel of a single-group layout', group(['x']), 'x'],
    ['a panel that is not in the layout', column([50, 50], group(['a']), group(['b'])), 'nope'],
  ])('%s is already below: nothing moves', (_name, tree, panel) => { expect(canMoveBelow(tree, panel)).toBe(false); });
  it('does not mutate its input', () => {
    const tree = column([50, 50], group(['a', 'x']), group(['b']));
    const before = JSON.stringify(tree);
    moveToNewRow(tree, 'x');
    expect(JSON.stringify(tree)).toBe(before);
  });
});
