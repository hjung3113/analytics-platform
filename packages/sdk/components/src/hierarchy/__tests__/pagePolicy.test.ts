import { describe, expect, it } from 'vitest';
import { HierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';
import { HierarchyNavState } from '../hierarchyState';
import { checkHierarchyPageShape, mergeHierarchyChain, reconcileTotal } from '../pagePolicy';

const node = (id: string): HierarchyNode => ({ id, label: id, kind: 'item', hasChildren: false, parentId: null });
const page = (ids: string[], extra: Partial<HierarchyPage> = {}): HierarchyPage => ({ nodes: ids.map(node), ...extra });

describe('hierarchy paging rule (#2360)', () => {
  it('binds a chain to the first announced total and refuses a changed one', () => {
    expect(reconcileTotal(undefined, 3)).toBe(3);
    expect(reconcileTotal(3, undefined)).toBe(3);
    expect(() => reconcileTotal(3, 4)).toThrow(HierarchyFailure);
  });
  it('refuses oversized pages, repeated cursors and impossible totals', () => {
    expect(() => checkHierarchyPageShape(page(['a', 'b']), { limit: 1 })).toThrow(HierarchyFailure);
    expect(() => checkHierarchyPageShape(page(['a'], { nextCursor: 'c1' }), { limit: 5, cursor: 'c1' })).toThrow(HierarchyFailure);
    expect(() => checkHierarchyPageShape(page(['a', 'b'], { totalCount: 1 }), { limit: 5 })).toThrow(HierarchyFailure);
    expect(() => checkHierarchyPageShape(page(['a'], { totalCount: 1 }), { limit: 5 })).not.toThrow();
  });
  it('refuses a loop, a duplicate across pages (unless the sidebar asks to de-duplicate) and a last page that disagrees with the announced total', () => {
    const seen = new Set<string>();
    const first = mergeHierarchyChain({ result: page(['a'], { nextCursor: 'c1', totalCount: 2 }), seen });
    expect(() => mergeHierarchyChain({ previous: first, result: page(['a']), cursor: 'c1', seen: new Set(seen) })).toThrow(HierarchyFailure);
    expect(() => mergeHierarchyChain({ previous: first, result: page(['b'], { nextCursor: 'c1' }), cursor: 'c1', seen: new Set(seen) })).toThrow(HierarchyFailure);
    expect(() => mergeHierarchyChain({ previous: first, result: page(['b', 'c']), cursor: 'c1', seen: new Set(seen) })).toThrow(HierarchyFailure);
    expect(mergeHierarchyChain({ previous: first, result: page(['b']), cursor: 'c1', seen: new Set(seen) }).nodes.map(item => item.id)).toEqual(['a', 'b']);
  });
  it('the sidebar state reads a source the same way: a repeated cursor and a dropped total are errors, not an end', async () => {
    const source = (second: HierarchyPage): HierarchySource => ({
      listChildren: async ({ cursor }) => cursor === undefined ? page(['a'], { nextCursor: 'c1', totalCount: 2 }) : second,
      resolveAncestors: async () => [],
    });
    const run = async (second: HierarchyPage) => {
      const state = new HierarchyNavState('t');
      const src = source(second);
      state.bindSource(src);
      state.loadPage(src, 'k', null, null, 50);
      await new Promise(resolve => setTimeout(resolve, 0));
      state.loadPage(src, 'k', null, null, 50, true);
      await new Promise(resolve => setTimeout(resolve, 0));
      return state.read().pages.k;
    };
    expect((await run(page(['b'], { nextCursor: 'c1' })))?.status).toBe('error');
    expect((await run(page(['b'], { totalCount: 3 })))?.status).toBe('error');
    expect((await run(page(['b'])))?.status).toBe('ready');
  });
});
