import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { DEFAULT_EQUIPMENT, DEFAULT_LEVELS, EQUIPMENT, EXPORT_LIMIT, LEVELS, ROW_COUNT, TREE_WINDOW, type TreeParams } from '../endpoints';
import { configurationMock, compareTree, makeRow, navigateTree } from './index';

const params: TreeParams = { eq: DEFAULT_EQUIPMENT, mode: 'all', ref: 'EQ01', status: 'all', q: '', asOf: 'latest', levels: DEFAULT_LEVELS, expanded: ['collapsed'], offset: 0, limit: TREE_WINDOW, filters: [] };
function orders(values: string[]): string[][] {
  return values.flatMap((value, at) => [[value], ...orders(values.filter((_, index) => index !== at)).map(rest => [value, ...rest])]);
}

describe('Configuration synthetic matrix', () => {
  it('K2 groups by Module/Category by default and retains item leaves with filename notes', () => {
    expect(DEFAULT_LEVELS).toEqual(['module', 'category']);
    expect(LEVELS.map(level => level.id)).toEqual(['module', 'category', 'item', 'filename']);
    const result = compareTree({ ...params, expanded: [] });
    const leaf = result.nodes.find(node => node.kind === 'leaf')!;
    expect(leaf.level).toBe(2); expect(leaf.label).toBe(leaf.item!.item);
    expect(leaf.item!.filename).toBeTruthy();
    expect(result.nodes.filter(node => node.kind === 'group').every(node => ['module', 'category'].includes(node.axis!))).toBe(true);
  });
  it('C6 materializes only enough rows for the server to detect an oversized export and permits a narrowed result', () => {
    const endpoint = configurationMock.find(endpoint => endpoint.spec.id === 'configuration.export')!;
    const read = (query: TreeParams) => endpoint.handle({ params: query, context: emptyGlobal, equipment: [], actor: 'engineer' });
    expect(read(params)).toHaveLength(EXPORT_LIMIT + 1);
    const rows = read({ ...params, q: 'Auxiliary Chamber' }) as unknown[];
    expect(rows.length).toBeGreaterThan(0); expect(rows.length).toBeLessThan(EXPORT_LIMIT);
  });
  it('is deterministic, bounded to 80 rows, and counts all 90k items', () => {
    const result = compareTree(params);
    expect(result).toEqual(compareTree(params));
    expect(result.totalItems).toBe(ROW_COUNT);
    expect(result.counts.all).toBe(ROW_COUNT);
    expect(result.nodes.length).toBeLessThanOrEqual(TREE_WINDOW);
    expect(EQUIPMENT.length).toBeGreaterThanOrEqual(20);
    expect(result.nodes.reduce((sum, node) => sum + node.count!, 0)).toBe(ROW_COUNT);
    expect(makeRow(24, params).values.EQ01.value).toBe(0);
    expect(makeRow(25, { ...params, mode: 'reference' }).notComparable).toBe(true);
    expect(makeRow(15, params)).toMatchObject({ diff: false, violation: true });
  });
  it.each(orders(LEVELS.map(level => level.id)))('regroups and recounts the hierarchy for %j', (...levels) => {
    const regroup = { ...params, q: 'Auxiliary Chamber', filters: [{ id: 'module', op: 'equals' as const, value: 'LL-B' }] };
    const root = compareTree({ ...regroup, levels });
    expect(root.nodes.every(node => node.axis === levels[0])).toBe(true);
    const parent = root.nodes[0];
    const expanded = compareTree({ ...regroup, levels, expanded: [parent.id] });
    const children = expanded.nodes.filter(node => node.parentId === parent.id);
    expect(children.length).toBeGreaterThan(0);
    expect(children.reduce((sum, node) => sum + node.count!, 0)).toBe(parent.count);
    expect(children.reduce((sum, node) => sum + node.differences, 0)).toBe(parent.differences);
  });
  it('filters the full result, including rows outside the loaded window, with server counts', () => {
    const filtered = compareTree({ ...params, filters: [{ id: 'module', op: 'equals', value: 'LL-B' }] });
    expect(filtered.counts.all).toBe(15_000);
    expect(filtered.totalItems).toBe(15_000);
    expect(filtered.nodes[0].label).toBe('LL-B');
    const numeric = compareTree({ ...params, filters: [{ id: 'value.EQ03.number', op: 'gt', value: 130 }] });
    expect(numeric.counts.all).toBeGreaterThan(TREE_WINDOW);
    expect(numeric.counts.all).toBeLessThan(ROW_COUNT);
    const text = compareTree({ ...params, filters: [{ id: 'value.EQ03.text', op: 'equals', value: 'MANUAL' }] });
    expect(text.counts.all).toBeGreaterThan(0);
    expect(text.counts.all).toBeLessThan(numeric.counts.all);
  });
  it('finds unchanged equipment over the full filtered result and always retains the reference', () => {
    const narrow = { ...params, mode: 'reference' as const, q: '', filters: [{ id: 'item', op: 'equals' as const, value: 'Valve Mode' }] };
    const result = compareTree(narrow);
    expect(result.sameColumns.length).toBeGreaterThan(0);
    expect(result.sameColumns).not.toContain('EQ01');
    const all = compareTree({ ...params, eq: EQUIPMENT });
    const expanded = compareTree({ ...params, eq: EQUIPMENT, expanded: [all.nodes[0].id] });
    expect(expanded.sameColumns).toEqual(all.sameColumns);
    expect(compareTree({ ...params, q: 'no-synthetic-item' }).sameColumns).toEqual([]);
  });
  it('returns a next/previous difference offset that reveals the leaf in the requested hierarchy', () => {
    const request = { ...params, status: 'review' as const, levels: ['filename', 'module'] };
    const target = navigateTree({ ...request, focus: null, direction: 'next' });
    expect(target).not.toBeNull();
    const result = compareTree({ ...request, expanded: target!.expanded, offset: target!.offset });
    expect(result.nodes.find(node => node.id === target!.focus)?.item?.diff).toBe(true);
    const next = navigateTree({ ...request, focus: target!.focus, expanded: target!.expanded, direction: 'next' });
    expect(next!.ordinal).toBe(2);
    expect(navigateTree({ ...request, focus: next!.focus, direction: 'previous' })?.focus).toBe(target!.focus);
    expect(navigateTree({ ...request, focus: target!.focus, direction: 'previous' })).toBeNull();
  });

  it('steps back to the original difference in the default hierarchy and expansion', () => {
    const request = { ...params, status: 'review' as const, expanded: [] };
    const first = navigateTree({ ...request, focus: null, direction: 'next' })!;
    const second = navigateTree({ ...request, ...first, direction: 'next' })!;
    const previous = navigateTree({ ...request, ...second, direction: 'previous' })!;
    expect(second.ordinal).toBe(2);
    expect(previous).toMatchObject({ focus: first.focus, ordinal: 1 });
    expect(compareTree({ ...request, ...previous }).nodes.some(node => node.id === first.focus)).toBe(true);
  });
});
