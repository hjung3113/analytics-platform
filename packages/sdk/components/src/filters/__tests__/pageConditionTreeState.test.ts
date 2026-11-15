import { describe, expect, it, vi } from 'vitest';
import { HierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';
import { PageConditionTreeState } from '../pageConditionTreeState';
import { createSyntheticHierarchySource } from '../../hierarchy/syntheticHierarchy';

const node = (id: string, parentId: string | null = null, hasChildren = false): HierarchyNode => ({ id, label: id, kind: 'test', parentId, hasChildren });
const sourceOf = (page: HierarchyPage): HierarchySource => ({ listChildren: vi.fn(async () => page), resolveAncestors: vi.fn(async () => []) });
const ready = async (state: PageConditionTreeState, parent: string | null = null) => {
  await vi.waitFor(() => expect(state.read().pages.get(parent)?.status).not.toBe('loading'));
  return state.read().pages.get(parent);
};
describe('page condition tree request/transaction state', () => {
  it.each([['default', 50, 50], ['cap', 900, 200], ['invalid', NaN, 50]] as const)('%s uses the ADR page limit', async (_, pageSize, expected) => {
    const source = sourceOf({ nodes: [] });
    const state = new PageConditionTreeState(source, pageSize);
    state.loadChildren(null); await ready(state);
    expect(source.listChildren).toHaveBeenCalledWith(expect.objectContaining({ limit: expected, signal: expect.any(AbortSignal) }));
    state.dispose();
  });
  it('enumerates exactly 5,000 deterministic source ids through pages at depth at least four', async () => {
    const source = createSyntheticHierarchySource();
    const all: HierarchyNode[] = [];
    const pending: { parentId: string | null; depth: number }[] = [{ parentId: null, depth: 0 }];
    let deepest = 0;
    while (pending.length) {
      const { parentId, depth } = pending.pop()!;
      deepest = Math.max(deepest, depth);
      let cursor: string | undefined;
      do {
        const page = await source.listChildren({ parentId, cursor, limit: 50 });
        expect(page.nodes.length).toBeLessThanOrEqual(50);
        all.push(...page.nodes);
        page.nodes.filter(node => node.hasChildren).forEach(node => pending.push({ parentId: node.id, depth: depth + 1 }));
        cursor = page.nextCursor;
      } while (cursor !== undefined);
    }
    expect(all).toHaveLength(5000);
    expect(new Set(all.map(node => node.id)).size).toBe(5000);
    expect(deepest).toBeGreaterThanOrEqual(4);
    expect((await createSyntheticHierarchySource().listChildren({ parentId: null })).nodes.map(node => node.id)).toEqual(all.slice(0, 50).map(node => node.id));
  });
  it.each(['forbidden', 'deleted', 'error'] as const)('preserves structurally typed %s failure and can retry', async kind => {
    const source = sourceOf({ nodes: [] });
    vi.mocked(source.listChildren).mockRejectedValueOnce({ name: 'HierarchyFailure', kind });
    const state = new PageConditionTreeState(source, 50);
    state.loadChildren(null);
    expect((await ready(state))?.status).toBe(kind);
    state.loadChildren(null, { retry: true });
    expect((await ready(state))?.status).toBe('ready');
    state.dispose();
  });
  it('treats an unowned AbortError as a visible failure', async () => {
    const source = sourceOf({ nodes: [] });
    vi.mocked(source.listChildren).mockRejectedValue(new DOMException('Timeout', 'AbortError'));
    const state = new PageConditionTreeState(source, 50);
    state.loadChildren(null);
    expect((await ready(state))?.status).toBe('error');
    state.dispose();
  });
  it('refuses oversized/duplicate/wrong-parent pages without silently dropping nodes', async () => {
    const invalidPages = [
      { nodes: Array.from({ length: 51 }, (_, i) => node(String(i))) },
      { nodes: [node('same'), node('same')] },
      { nodes: [node('child', 'wrong-parent')] },
      { nodes: [node('one')], totalCount: 2 },
    ];
    for (const page of invalidPages) {
      const state = new PageConditionTreeState(sourceOf(page), 50);
      state.loadChildren(null);
      expect((await ready(state))?.status).toBe('error');
      state.dispose();
    }
  });
  it('refuses cursor cycles instead of showing a silently shortened list', async () => {
    const source = sourceOf({ nodes: [node('one')], nextCursor: 'a' });
    vi.mocked(source.listChildren).mockResolvedValueOnce({ nodes: [node('one')], nextCursor: 'a' }).mockResolvedValueOnce({ nodes: [node('two')], nextCursor: 'b' }).mockResolvedValueOnce({ nodes: [node('three')], nextCursor: 'a' });
    const state = new PageConditionTreeState(source, 50);
    state.loadChildren(null); await ready(state);
    state.loadChildren(null, { more: true }); await ready(state);
    state.loadChildren(null, { more: true });
    expect((await ready(state))?.status).toBe('error');
    expect(source.listChildren).toHaveBeenCalledTimes(3);
    state.dispose();
  });
  it('binds an announced total to the whole cursor chain even when a later page omits it', async () => {
    const source = sourceOf({ nodes: [] });
    vi.mocked(source.listChildren).mockResolvedValueOnce({ nodes: [node('one')], nextCursor: 'a', totalCount: 3 }).mockResolvedValueOnce({ nodes: [node('two')] });
    const state = new PageConditionTreeState(source, 50);
    state.loadChildren(null); await ready(state);
    state.loadChildren(null, { more: true });
    expect((await ready(state))?.status).toBe('error');
    state.dispose();
  });
  it('never commits an incomplete leaf list when the announced total is dropped by a later page', async () => {
    const source = sourceOf({ nodes: [] });
    vi.mocked(source.listChildren).mockResolvedValueOnce({ nodes: [node('a', 'root')], nextCursor: 'more', totalCount: 3 }).mockResolvedValueOnce({ nodes: [node('b', 'root')] });
    const state = new PageConditionTreeState(source, 50);
    await expect(state.leaves(node('root', null, true), new AbortController().signal, () => undefined)).rejects.toBeInstanceOf(HierarchyFailure);
    state.dispose();
  });
  it('stops leaf traversal as soon as the candidate validator refuses and never fetches the next page', async () => {
    const source = sourceOf({ nodes: [node('leaf', 'root')], nextCursor: 'more' });
    const state = new PageConditionTreeState(source, 50);
    const accept = vi.fn(() => { throw new Error('budget'); });
    await expect(state.leaves(node('root', null, true), new AbortController().signal, accept)).rejects.toThrow('budget');
    expect(source.listChildren).toHaveBeenCalledTimes(1);
    state.dispose();
  });
  it('does not accept a late leaf response after cancellation', async () => {
    let finish!: (page: HierarchyPage) => void;
    const source = sourceOf({ nodes: [] });
    source.listChildren = vi.fn(() => new Promise<HierarchyPage>(resolve => { finish = resolve; }));
    const state = new PageConditionTreeState(source, 50);
    const controller = new AbortController();
    const accept = vi.fn();
    const task = state.leaves(node('root', null, true), controller.signal, accept);
    controller.abort(); finish({ nodes: [node('leaf', 'root')] });
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(accept).not.toHaveBeenCalled();
    state.dispose();
  });
  it('rejects an empty hasChildren list and malformed ancestor paths as incomplete', async () => {
    const source = sourceOf({ nodes: [] });
    source.resolveAncestors = async () => [node('loop', 'loop', true)];
    const state = new PageConditionTreeState(source, 50);
    await expect(state.leaves(node('root', null, true), new AbortController().signal, vi.fn())).rejects.toBeInstanceOf(HierarchyFailure);
    state.resolve('leaf');
    await vi.waitFor(() => expect(state.read().paths.get('leaf')?.status).toBe('error'));
    state.dispose();
  });
});
