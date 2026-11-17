import { describe, expect, it } from 'vitest';
import { columnGroupErrors, displayedUnits } from '../columnGroups';

// N1 prepares a shared layout seam for N2; no pan interaction is shipped here.
describe('column group declaration and display units', () => {
  it.each([
    [[{ id: 'a', columnGroup: ['A'] }, { id: 'x' }, { id: 'b', columnGroup: ['A'] }], { A: 'A' }, 'non-contiguous'],
    [[{ id: 'a', columnGroup: ['A'] }], {}, 'missing label'],
    [[{ id: 'a', columnGroup: ['a'] }], { a: 'a' }, 'collides'],
    [[{ id: 'a', columnGroup: ['_select'] }], { _select: 'select' }, 'collides'],
    [[{ id: 'a', columnGroup: ['_action'] }], { _action: 'action' }, 'collides'],
    [[{ id: 'a', columnGroup: ['A', 'inner'] }, { id: 'b', columnGroup: ['B', 'inner'] }], { A: 'A', B: 'B', inner: 'Inner' }, 'parent paths'],
  ] as const)('reports invalid declaration %#', (columns, labels, reason) => {
    expect(columnGroupErrors(columns, labels).join(' ')).toContain(reason);
  });
  it('returns a top-level group or ungrouped leaf for every render path', () => {
    const items = [{ id: 'x' }, { id: 'a', columnGroup: ['A'] }, { id: 'b', columnGroup: ['A', 'inner'] }, { id: '_action' }];
    expect(displayedUnits(items, c => c.columnGroup)).toEqual([
      { kind: 'leaf', leaves: [items[0]] }, { kind: 'group', id: 'A', leaves: [items[1], items[2]] }, { kind: 'leaf', leaves: [items[3]] },
    ]);
  });
});
