import { describe, expect, it } from 'vitest';
import { columnGroupBasis, effectiveColumnGroups, type StoredColumnGroups } from '../columnGroups';
import { createColumnGroup, materializeColumnGroups, renameColumnGroup, setColumnGroupMembers, setColumnGroupWidth, ungroupColumns } from '../columnGroupEdits';
import { groupedOrder, groupedPins } from '../columnOrder';
import { toGroupedColumnDefs } from '../columnDef';

const columns = [
  { id: 'a', header: 'A', columnGroup: ['D', 'X'] },
  { id: 'b', header: 'B', columnGroup: ['D', 'X'] },
  { id: 'c', header: 'C' }, { id: 'd', header: 'D' },
];
const labels = { D: { label: 'Declared', width: 320 }, X: 'Nested' };
const snapshot = (items: StoredColumnGroups['items']): StoredColumnGroups => ({ basis: columnGroupBasis(columns, labels), items });

describe('editable column group effective model', () => {
  it('absent and basis mismatch use the declared pair, and plain columns/labels/widths do not change basis', () => {
    for (const stored of [undefined, { basis: 'old', items: [] }]) expect(effectiveColumnGroups(columns, labels, stored)).toEqual({ columns, columnGroups: labels });
    expect(columnGroupBasis([...columns, { id: 'new', header: 'New' }], { ...labels, D: 'Translated' })).toBe(columnGroupBasis(columns, labels));
    expect(columnGroupBasis(columns.map(c => ({ ...c, columnGroup: undefined })), labels)).not.toBe(columnGroupBasis(columns, labels));
  });
  it('keeps nested paths, follows declared labels/widths unless overridden, and accepts mixed depth in the engine', () => {
    const stored = snapshot([{ id: 'D', members: ['a', 'b', 'c'] }]);
    const effective = effectiveColumnGroups(columns, labels, stored);
    expect(effective.columns.map(c => c.columnGroup)).toEqual([['D', 'X'], ['D', 'X'], ['D'], undefined]);
    expect(effective.columnGroups).toEqual(labels);
    expect(toGroupedColumnDefs(effective.columns, effective.columnGroups)[0]).toMatchObject({ id: 'D', columns: [{ id: 'X' }, { id: 'c' }] });
    const renamed = effectiveColumnGroups(columns, labels, snapshot([{ id: 'D', label: 'Custom', width: 180, members: ['a', 'b'] }]));
    expect(renamed.columnGroups?.D).toEqual({ label: 'Custom', width: 180 });
  });
  it('drops unknowns, duplicate members, empty groups and column/reserved id collisions without mutating the snapshot', () => {
    const stored = snapshot([
      { id: 'c', label: 'Collision', members: ['c'] }, { id: '_select', label: 'Reserved', members: ['d'] },
      { id: 'u:first', label: 'First', members: ['b', 'unknown'] },
      { id: 'D', members: ['a', 'b'] }, { id: 'u:empty', label: 'Empty', members: ['unknown'] },
    ]);
    const before = JSON.stringify(stored);
    const effective = effectiveColumnGroups(columns, labels, stored);
    expect(effective.columns.map(c => c.columnGroup)).toEqual([['D', 'X'], ['u:first'], undefined, undefined]);
    expect(JSON.stringify(stored)).toBe(before);
  });
  it('falls back atomically on a merged parent-path error, including order, pin and engine/export inputs', () => {
    const stored = snapshot([{ id: 'u:X', label: 'Bad', members: ['a'] }, { id: 'D', members: ['b'] }, { id: 'X', label: 'Collision with nested group', members: ['c'] }]);
    const effective = effectiveColumnGroups(columns, labels, stored);
    expect(effective.columns).toBe(columns);
    expect(effective.columnGroups).toBe(labels);
    expect(groupedOrder(effective.columns, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'b', 'd']);
    expect(groupedPins(effective.columns, ['a'], ['a', 'b', 'c', 'd'], {}, false)).toEqual(['a', 'b']);
  });
  it('an explicit empty snapshot ungroups everything', () => {
    expect(effectiveColumnGroups(columns, labels, snapshot([])).columns.every(c => !c.columnGroup)).toBe(true);
  });
  it('drops a stored group whose id became a newly declared plain column id without a basis change', () => {
    const stored = snapshot([{ id: 'u:later', label: 'Later', members: ['c', 'd'] }]);
    const effective = effectiveColumnGroups([...columns, { id: 'u:later', header: 'New column' }], labels, stored);
    expect(effective.columns.every(c => !c.columnGroup)).toBe(true);
  });
});

describe('pure column group edits', () => {
  it('materializes membership only, replaces stale snapshots and keeps explicit empty distinct from absent', () => {
    expect(materializeColumnGroups(columns, labels, undefined)).toEqual(snapshot([{ id: 'D', members: ['a', 'b'] }]));
    expect(materializeColumnGroups(columns, labels, { basis: 'old', items: [] })).toEqual(materializeColumnGroups(columns, labels, undefined));
    expect(materializeColumnGroups(columns, labels, snapshot([]))).toEqual(snapshot([]));
  });
  it('creates with injectable collision-safe ids, takes members from other groups and retains singletons', () => {
    const base = materializeColumnGroups(columns, labels, undefined);
    const next = createColumnGroup(base, ' Compare ', ['a', 'd'], [...columns.map(c => c.id), ...Object.keys(labels), 'u:D'], () => 'D');
    expect(next.items[0]).toEqual({ id: 'D', members: ['b'] });
    expect(next.items[1]).toMatchObject({ label: 'Compare', members: ['a', 'd'] });
    expect(next.items[1].id).toMatch(/^u:/);
    expect(next.items[1].id).toBe('u:D:1');
    expect(createColumnGroup(base, 'One', ['a'], [], () => 'id')).toBe(base);
  });
  it('renames, changes members, ungroups, sets/clears widths and rejects empty members/invalid names', () => {
    const base = materializeColumnGroups(columns, labels, undefined);
    const renamed = renameColumnGroup(base, 'D', ' Renamed ');
    expect(renamed.items[0].label).toBe('Renamed');
    expect(renameColumnGroup(base, 'D', ' ')).toBe(base);
    expect(setColumnGroupMembers(base, 'D', []).items[0].members).toEqual(['a', 'b']);
    expect(setColumnGroupMembers(base, 'D', ['c']).items[0].members).toEqual(['c']);
    const width = setColumnGroupWidth(renamed, 'D', 20);
    expect(width.items[0].width).toBe(60);
    expect(setColumnGroupWidth(width, 'D', undefined).items[0]).not.toHaveProperty('width');
    expect(ungroupColumns(base, 'D')).toEqual(snapshot([]));
  });
});
