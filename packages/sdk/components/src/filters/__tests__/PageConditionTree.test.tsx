import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HierarchyFailure, type HierarchyNode, type HierarchyPage, type HierarchySource, type PageConditionCategory } from '@ap/contracts';
import { encodePageConditions, I18nProvider, type PageConditionValues } from '@ap/kernel';
import { PageConditionCategories } from '../PageConditionCategories';
import { PageConditionTree, type PageConditionTreeProps } from '../PageConditionTree';
import { createSyntheticHierarchySource } from '../../hierarchy/syntheticHierarchy';

const category = (value: 'nodes' | 'leaves' = 'nodes'): PageConditionCategory => ({ id: 'tree', label: { ko: '계층', en: 'Hierarchy' }, kind: { type: 'tree', key: 'tree', source: 'treeSource', value } });
const node = (id: string, parentId: string | null = null, hasChildren = false): HierarchyNode => ({ id, label: id, parentId, hasChildren, kind: 'test' });
const a = { ...node('A', null, true), target: { menuId: 'must-not-navigate', page: { id: 'A' } } }, b = node('B', 'A', true), c = node('C', 'B'), d = node('D', 'B');
function sourceOf(nodes = [a, b, c, d]): HierarchySource {
  return {
    listChildren: vi.fn(async ({ parentId, cursor, limit = 50 }) => {
      const siblings = nodes.filter(item => item.parentId === parentId);
      const start = Number(cursor ?? 0);
      const end = start + limit;
      return { nodes: siblings.slice(start, end), nextCursor: end < siblings.length ? String(end) : undefined, totalCount: siblings.length };
    }),
    resolveAncestors: vi.fn(async id => {
      const path: HierarchyNode[] = [];
      let current = nodes.find(item => item.id === id);
      if (!current) throw new HierarchyFailure('deleted');
      while (current?.parentId) { current = nodes.find(item => item.id === current?.parentId); if (current) path.unshift(current); }
      return path;
    }),
    searchNodes: vi.fn(async ({ query }) => ({ nodes: nodes.filter(item => item.label.includes(query)) })),
  };
}
function mount(props: Partial<PageConditionTreeProps> = {}) {
  const onChange = vi.fn();
  const source = sourceOf();
  const options: PageConditionTreeProps = { category: category(), declaration: { categories: [category()] }, values: {}, inputsKey: 'session:scope:1', source, onChange, ...props };
  const view = render(<I18nProvider><PageConditionTree {...options} /></I18nProvider>);
  return { ...view, onChange, source, options };
}
function Controlled({ mode = 'nodes', source = sourceOf() }: { mode?: 'nodes' | 'leaves'; source?: HierarchySource }) {
  const [values, setValues] = useState<PageConditionValues>({});
  return <I18nProvider><PageConditionTree category={category(mode)} declaration={{ categories: [category(mode)] }} values={values} inputsKey="controlled" source={source}
    onChange={(_, next) => setValues(next ?? {})} /></I18nProvider>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const row = (name: string) => screen.getByRole('treeitem', { name });
async function expand(name: string) { fireEvent.keyDown(await screen.findByRole('treeitem', { name }), { key: 'ArrowRight' }); }

describe('PageConditionTree', () => {
  it('restarts aborted mount requests during StrictMode effect replay', async () => {
    render(<StrictMode><Controlled /></StrictMode>);
    expect(await screen.findByRole('treeitem', { name: 'A' })).toBeVisible();
  });
  it('shows explicit empty and exposes disabled reasons without allowing changes', async () => {
    const disabledCategory = { ...category(), disabled: { reason: { ko: '범위 제한', en: 'Scope restricted' } } };
    const { onChange } = mount({ category: disabledCategory, values: { tree: [] } });
    const item = await screen.findByRole('treeitem', { name: 'A' });
    expect(screen.getByText('선택한 항목 없음')).toBeVisible();
    expect(item).toHaveAccessibleDescription('범위 제한');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(item, { key: ' ' });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('clears selected leaves below a fully checked parent without emitting its id', async () => {
    const { onChange } = mount({ category: category('leaves'), declaration: { categories: [category('leaves')] }, values: { tree: ['C', 'D'] } });
    await expand('A'); await expand('B');
    await waitFor(() => expect(row('A')).toHaveAttribute('aria-checked', 'true'));
    fireEvent.keyDown(row('A'), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith('tree', { tree: [] });
  });
  it('integrates treeSources by declared endpoint without calling the options loader', async () => {
    const source = sourceOf();
    const loadOptions = vi.fn();
    render(<I18nProvider><PageConditionCategories declaration={{ categories: [category()] }} values={{}} inputsKey="s" treeSources={{ treeSource: source }} onChange={vi.fn()} loadOptions={loadOptions} /></I18nProvider>);
    expect(await screen.findByRole('treeitem', { name: 'A' })).toBeVisible();
    expect(loadOptions).not.toHaveBeenCalled();
  });
  it('supports roving tree keyboard navigation and Space checks without navigation', async () => {
    const { onChange } = mount();
    const tree = await screen.findByRole('tree', { name: '계층' });
    expect(tree).toHaveAttribute('aria-multiselectable', 'true');
    await expand('A'); await expand('B');
    await screen.findByRole('treeitem', { name: 'C' });
    row('A').focus();
    fireEvent.keyDown(row('A'), { key: 'ArrowDown' }); expect(row('B')).toHaveFocus();
    fireEvent.keyDown(row('B'), { key: 'ArrowRight' }); expect(row('C')).toHaveFocus();
    fireEvent.keyDown(row('C'), { key: 'End' }); expect(row('D')).toHaveFocus();
    fireEvent.keyDown(row('D'), { key: 'ArrowUp' }); expect(row('C')).toHaveFocus();
    fireEvent.keyDown(row('C'), { key: 'ArrowLeft' }); expect(row('B')).toHaveFocus();
    fireEvent.keyDown(row('B'), { key: 'Home' }); expect(row('A')).toHaveFocus();
    fireEvent.keyDown(row('A'), { key: ' ' }); expect(onChange).toHaveBeenLastCalledWith('tree', { tree: ['A'] });
    expect(within(tree).queryByRole('link')).toBeNull();
    expect(row('C')).toHaveAttribute('aria-level', '3');
  });
  it('nodes emit the ancestor alone and cover future children; covered descendants cannot remove ancestor coverage', async () => {
    render(<Controlled />);
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'A' }), { key: ' ' });
    await expand('A');
    expect(await screen.findByRole('treeitem', { name: 'B' })).toHaveAttribute('aria-checked', 'true');
    expect(row('B')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(row('B'), { key: ' ' });
    expect(row('A')).toHaveAttribute('aria-checked', 'true');
    await expand('B');
    expect(await screen.findByRole('treeitem', { name: 'C' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1개 선택')).toBeVisible();
  });
  it('shows mixed ancestors over loaded descendants and replaces descendant values when a node is checked', async () => {
    const { onChange } = mount({ values: { tree: ['C'] } });
    await expand('A'); await expand('B');
    await waitFor(() => expect(row('A')).toHaveAttribute('aria-checked', 'mixed'));
    expect(row('B')).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.keyDown(row('A'), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith('tree', { tree: ['A'] });
    expect(await screen.findByText('A › B › C')).toBeVisible();
  });
  it('leaves loads every page below a checked parent and emits only leaves', async () => {
    const source = sourceOf();
    const { onChange } = mount({ category: category('leaves'), declaration: { categories: [category('leaves')] }, source });
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'A' }), { key: ' ' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('tree', { tree: ['C', 'D'] }));
    expect(source.listChildren).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'B', limit: 50, signal: expect.any(AbortSignal) }));
  });
  it('unchecking the last value emits explicit empty (~none); category clear emits null', async () => {
    const { onChange } = mount({ values: { tree: ['A'] } });
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'A' }), { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith('tree', { tree: [] });
    expect(encodePageConditions({ pageConditions: { categories: [category()] } }, { tree: [] })).toEqual([['tree', '~none']]);
    fireEvent.click(screen.getByRole('button', { name: '계층 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('tree', null);
  });
  it.each(['nodes', 'leaves'] as const)('refuses %s selections beyond 50 without truncation', async mode => {
    const nodes = [a, ...Array.from({ length: 51 }, (_, i) => node(`leaf-${i}`, 'A'))];
    const values: PageConditionValues = mode === 'nodes' ? { tree: Array.from({ length: 50 }, (_, i) => `unknown-${i}`) } : {};
    const { onChange } = mount({ category: category(mode), declaration: { categories: [category(mode)] }, source: sourceOf(nodes), values });
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'A' }), { key: ' ' });
    expect(await screen.findByText('한 범주에서 최대 50개까지 선택할 수 있습니다.')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('checks the encoded budget across the whole declaration', async () => {
    const extra: PageConditionCategory = { id: 'query', label: { ko: '검색', en: 'Search' }, kind: { type: 'search', key: 'query' } };
    const { onChange } = mount({ declaration: { categories: [category(), extra] }, values: { query: ['x'.repeat(2390)] }, source: sourceOf([node('long-node-value')]) });
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'long-node-value' }), { key: ' ' });
    expect(await screen.findByText('페이지 조건은 인코딩 후 2400자를 넘을 수 없습니다.')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('searches and labels matches with resolved ancestor paths', async () => {
    const { source } = mount();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'C' } });
    expect(await screen.findByRole('treeitem', { name: 'C' })).toBeVisible();
    expect(await screen.findByText('A › B › C')).toBeVisible();
    expect(source.searchNodes).toHaveBeenCalledWith(expect.objectContaining({ query: 'C', limit: 50, signal: expect.any(AbortSignal) }));
  });
  it.each(['forbidden', 'deleted', 'error'] as const)('preserves unavailable deep values and shows %s distinctly', async kind => {
    const source = sourceOf();
    source.resolveAncestors = vi.fn(async () => { throw new HierarchyFailure(kind); });
    mount({ source, values: { tree: ['unknown'] } });
    const expected = { forbidden: '표시할 수 있는 항목이 없습니다. 접근 권한을 확인하세요.', deleted: '삭제되었거나 이동된 항목입니다.', error: '항목을 불러오지 못했습니다.' };
    expect(await screen.findByText(expected[kind])).toBeVisible();
    expect(screen.getByText(kind === 'deleted' ? '이 화면에서 쓸 수 없는 값: unknown' : '현재 값: unknown')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'unknown 지우기' }));
  });
  it('pages the existing deterministic 5,000-node source only on demand', async () => {
    const source = createSyntheticHierarchySource();
    const list = vi.spyOn(source, 'listChildren');
    mount({ source });
    await screen.findByRole('treeitem', { name: 'Item 50' });
    expect(list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
    await screen.findByRole('treeitem', { name: 'Item 100' });
    expect(list).toHaveBeenCalledTimes(2);
    await expand('Item 1'); await screen.findByRole('treeitem', { name: 'Item 126' });
    expect(list).toHaveBeenCalledTimes(3);
  }, 15000);
  it('aborts on identity change and ignores a late response even when the source ignores cancellation', async () => {
    let signal: AbortSignal | undefined;
    let finish!: (value: { nodes: HierarchyNode[] }) => void;
    const source = sourceOf();
    source.listChildren = vi.fn(args => { signal = args.signal; return new Promise<HierarchyPage>(resolve => { finish = resolve; }); });
    const { options, rerender } = mount({ source });
    await waitFor(() => expect(source.listChildren).toHaveBeenCalledTimes(1));
    rerender(<I18nProvider><PageConditionTree {...options} inputsKey="session:scope:2" source={sourceOf([node('New')])} /></I18nProvider>);
    expect(signal?.aborted).toBe(true);
    await screen.findByRole('treeitem', { name: 'New' });
    await act(async () => { finish({ nodes: [node('Stale')] }); });
    expect(screen.queryByRole('treeitem', { name: 'Stale' })).toBeNull();
  });
  it('preserves loaded rows while the next cursor page is pending', async () => {
    const source = sourceOf();
    let finish!: (page: HierarchyPage) => void;
    source.listChildren = vi.fn(async ({ cursor }) => {
      if (!cursor) return { nodes: [node('First')], nextCursor: 'next' };
      return new Promise<HierarchyPage>(resolve => { finish = resolve; });
    });
    mount({ source });
    await screen.findByRole('treeitem', { name: 'First' });
    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
    expect(row('First')).toBeVisible();
    await act(async () => { finish({ nodes: [node('Second')] }); });
    expect(row('First')).toBeVisible(); expect(row('Second')).toBeVisible();
  });
  it('aborts the child request when its branch is collapsed', async () => {
    const source = sourceOf();
    let signal: AbortSignal | undefined;
    source.listChildren = vi.fn(async args => {
      if (args.parentId === null) return { nodes: [a] };
      signal = args.signal;
      return new Promise<HierarchyPage>(() => {});
    });
    mount({ source });
    await expand('A');
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.keyDown(row('A'), { key: 'ArrowLeft' });
    expect(signal?.aborted).toBe(true);
  });
  it('restarts an expanded descendant request after its ancestor is collapsed and reopened', async () => {
    const source = sourceOf();
    let calls = 0;
    source.listChildren = vi.fn(async args => {
      if (args.parentId === null) return { nodes: [a] };
      if (args.parentId === 'A') return { nodes: [b] };
      calls++;
      if (calls === 1) return new Promise<HierarchyPage>(() => {});
      return { nodes: [c, d] };
    });
    mount({ source });
    await expand('A'); await expand('B');
    await waitFor(() => expect(calls).toBe(1));
    fireEvent.keyDown(row('A'), { key: 'ArrowLeft' });
    await expand('A');
    expect(await screen.findByRole('treeitem', { name: 'C' })).toBeVisible();
    expect(calls).toBe(2);
  });
  it('cancels a pending leaves transaction on clear and unmount', async () => {
    let signal: AbortSignal | undefined;
    const source = sourceOf();
    source.listChildren = vi.fn(async args => { if (args.parentId === null) return { nodes: [a] }; signal = args.signal; return new Promise<HierarchyPage>(() => {}); });
    const { onChange, unmount } = mount({ source, category: category('leaves'), declaration: { categories: [category('leaves')] }, values: { tree: ['unknown'] } });
    fireEvent.keyDown(await screen.findByRole('treeitem', { name: 'A' }), { key: ' ' });
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: '계층 지우기' }));
    expect(signal?.aborted).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith('tree', null);
    unmount();
  });
});
