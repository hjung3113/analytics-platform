import { describe, expect, it } from 'vitest';
import { isStoredColumnGroupItem, isStoredColumnGroups } from '@ap/contracts';
import { columnGroupErrors, displayedUnits, sanitizeColumnGroups } from '../columnGroups';

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

// #2514 Q3: one item rule in contracts; the saved-view guard rejects the snapshot, the screen's sanitize drops the item.
describe('stored column-group item rule', () => {
  const good = { id: 'u:a', label: ' 비교 ', members: ['x', 'x', 'y'], width: 60 };
  it.each([
    ['empty id', { id: '', members: [] }],
    ['long id', { id: 'g'.repeat(201), members: [] }],
    ['too many members', { id: 'g', members: Array.from({ length: 501 }, (_, i) => `c${i}`) }],
    ['empty member', { id: 'g', members: [''] }],
    ['blank label', { id: 'g', label: '  ', members: [] }],
    ['long label', { id: 'g', label: 'l'.repeat(61), members: [] }],
    ['unlabelled u: group', { id: 'u:g', members: [] }],
    ['narrow width', { id: 'g', members: [], width: 59 }],
    ['infinite width', { id: 'g', members: [], width: Infinity }],
  ])('rejects an item with %s on both sides', (_name, bad) => {
    expect(isStoredColumnGroupItem(bad)).toBe(false);
    expect(isStoredColumnGroups({ basis: 'b', items: [good, bad] })).toBe(false);
    expect(sanitizeColumnGroups({ basis: 'b', items: [good, bad] })).toEqual({ basis: 'b', items: [{ id: 'u:a', label: '비교', members: ['x', 'y'], width: 60 }] });
  });
  it('an unknown key or a repeated id fails the saved-view guard; on screen the extra key is ignored and only the later duplicate is dropped', () => {
    expect(isStoredColumnGroupItem({ ...good, extra: 1 })).toBe(true);
    expect(isStoredColumnGroups({ basis: 'b', items: [good, { id: 'g', members: [], extra: 1 }] })).toBe(false);
    expect(isStoredColumnGroups({ basis: 'b', items: [good, good] })).toBe(false);
    expect(sanitizeColumnGroups({ basis: 'b', items: [good, good, { id: 'g', members: ['z'], extra: 1 }] })?.items).toEqual([{ id: 'u:a', label: '비교', members: ['x', 'y'], width: 60 }, { id: 'g', members: ['z'] }]);
  });
  it('rejects an unknown key and skips a repeated id before reading the other fields', () => {
    const throwing = (extra: object) => Object.defineProperty({ id: 'u:a', ...extra }, 'members', { enumerable: true, get() { throw new Error('read members'); } });
    expect(isStoredColumnGroups({ basis: 'b', items: [throwing({ extra: 1 })] })).toBe(false);
    expect(isStoredColumnGroups({ basis: 'b', items: [good, throwing({})] })).toBe(false);
    expect(sanitizeColumnGroups({ basis: 'b', items: [good, throwing({})] })?.items.map(i => i.id)).toEqual(['u:a']);
  });
});
