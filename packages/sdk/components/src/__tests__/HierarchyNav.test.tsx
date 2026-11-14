import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, HierarchyFailure, isHierarchyFailure, type HierarchyNode, type HierarchySource } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { TooltipProvider } from '@ap/ui';
import { HierarchyNav } from '../hierarchy/HierarchyNav';
import { createSyntheticHierarchySource, stubHierarchyGeometry } from '../testing';
const node = (id: string, hasChildren = false): HierarchyNode => ({ id, label: id, kind: 'item', hasChildren, target: { menuId: 'fixture-home', page: { object: id } } });
const fixtureMenu: PlatformMenuEntry = { id: 'fixture-home', path: '/fixture', primary: true, group: groupId('fixture-group'), label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['object'] };
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'fixture-home' })], groups: [{ id: groupId('fixture-group'), space: spaceId('mars'), label: { ko: '그룹', en: 'Group' }, icon: House }], menus: [fixtureMenu, { ...fixtureMenu, id: 'fixture-denied', path: '/denied', primary: false, permission: 'features:access' }, { ...fixtureMenu, id: 'fixture-detail', path: '/fixture/:detailId', primary: false, parent: 'fixture-home', navHidden: true }] });
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
function mount(source: HierarchySource, props: Partial<React.ComponentProps<typeof HierarchyNav>> = {}) {
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><TooltipProvider><HierarchyNav menuId="fixture-home" label="Items" source={source} {...props} /></TooltipProvider></PlatformProvider></I18nProvider>);
}
let restore: () => void;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); window.history.replaceState(null, '', '/fixture?v=1'); restore = stubHierarchyGeometry(); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('HierarchyNav (#1448)', () => {
  it('checks failures structurally across package copies', () => {
    expect(isHierarchyFailure({ name: 'HierarchyFailure', kind: 'forbidden' })).toBe(true);
    expect(isHierarchyFailure({ name: 'AbortError', kind: 'error' })).toBe(false);
  });
  it('loads just one 50-node page from 5000 nodes and mounts a nonzero bounded virtual window', async () => {
    const source = createSyntheticHierarchySource({ nodes: 5000, depth: 6 });
    const list = vi.spyOn(source, 'listChildren');
    const { container } = mount(source);
    await waitFor(() => expect(container.querySelectorAll('[data-hierarchy-node]').length).toBeGreaterThan(0));
    expect(container.querySelectorAll('[data-hierarchy-node]').length).toBeLessThan(25);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0][0]).toMatchObject({ parentId: null, limit: 50 });
    expect(screen.queryByRole('button', { name: '뒤로' })).toBeNull();
  });
  it('drops late superseded drill results, aborts its own signal and deduplicates pages', async () => {
    let oldResolve!: (page: { nodes: HierarchyNode[] }) => void;
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn(({ parentId }) => parentId === 'a' ? new Promise<{ nodes: HierarchyNode[] }>(resolve => { oldResolve = resolve; }) : Promise.resolve({ nodes: parentId === null ? [node('a', true), node('b', true)] : [node('new')] })) };
    mount(source);
    fireEvent.click(await screen.findByRole('button', { name: 'a 펼치기' }));
    await waitFor(() => expect(oldResolve).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    fireEvent.click(await screen.findByRole('button', { name: 'b 펼치기' }));
    await screen.findByRole('link', { name: 'new' });
    await act(async () => oldResolve({ nodes: [node('old')] }));
    expect(screen.queryByRole('link', { name: 'old' })).toBeNull();
    const calls = vi.mocked(source.listChildren).mock.calls;
    expect(calls.find(([args]) => args.parentId === 'a')?.[0].signal?.aborted).toBe(true);
  });
  it.each(['forbidden', 'deleted', 'error'] as const)('renders explicit %s deep-link failure with retry', async kind => {
    mount({ listChildren: async () => ({ nodes: [node('gone')] }), resolveAncestors: vi.fn().mockRejectedValueOnce(new HierarchyFailure(kind)).mockResolvedValue([]) }, { currentNodeId: 'gone' });
    await screen.findByText(kind === 'forbidden' ? '표시할 수 있는 항목이 없습니다. 접근 권한을 확인하세요.' : kind === 'deleted' ? '삭제되었거나 이동된 항목입니다.' : '항목을 불러오지 못했습니다.');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('link', { name: 'gone' });
  });
  it('restores ancestors, marks location and scrolls without autofocus or tooltips', async () => {
    const source: HierarchySource = { resolveAncestors: async () => [node('parent', true)], listChildren: async () => ({ nodes: [node('selected')] }) };
    const { container } = mount(source, { currentNodeId: 'selected' });
    const selected = await screen.findByRole('link', { name: 'selected' });
    expect(selected.getAttribute('aria-current')).toBe('location');
    expect(container.contains(document.activeElement)).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
  it('supports tree keyboard navigation, expansion, parent, Home/End and activation', async () => {
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: async ({ parentId }) => ({ nodes: parentId === null ? [node('parent', true), node('last')] : [node('child')] }) };
    mount(source, { mode: 'tree' });
    const parent = await screen.findByRole('treeitem', { name: 'parent' });
    parent.focus(); fireEvent.keyDown(parent, { key: 'ArrowRight' });
    const child = await screen.findByRole('treeitem', { name: 'child' });
    expect(parent.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(parent, { key: 'ArrowDown' }); expect(document.activeElement).toBe(child);
    fireEvent.keyDown(child, { key: 'ArrowLeft' }); expect(document.activeElement).toBe(parent);
    fireEvent.keyDown(parent, { key: 'End' }); expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'last' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' }); expect(document.activeElement).toBe(parent);
    fireEvent.keyDown(parent, { key: ' ' });
    expect(window.location.search).toContain('object=parent');
  });
  it('treats unrelated AbortError as an error and recovers on retry', async () => {
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn().mockRejectedValueOnce(new DOMException('adapter timeout', 'AbortError')).mockResolvedValue({ nodes: [node('recovered')] }) };
    mount(source);
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await screen.findByRole('link', { name: 'recovered' });
  });
  it.each(['drill', 'tree'] as const)('finds a deep target beyond the first cursor page in %s mode', async mode => {
    const source: HierarchySource = { resolveAncestors: async () => [node('parent', true)], listChildren: async ({ parentId, cursor }) => ({ nodes: parentId === null ? [node('parent', true)] : cursor ? [node('selected')] : [node('first')], nextCursor: parentId === 'parent' && !cursor ? 'next' : undefined }) };
    mount(source, { currentNodeId: 'selected', mode });
    await screen.findByRole('link', { name: 'selected' });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
  it('shows deleted when a restored path no longer contains the requested node', async () => {
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [] }) }, { currentNodeId: 'missing' });
    await screen.findByText('삭제되었거나 이동된 항목입니다.');
  });
  it('debounces search, aborts superseded queries and drops late results', async () => {
    let late!: (page: { nodes: HierarchyNode[] }) => void;
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node('root')] }), searchNodes: vi.fn(({ query }) => query === 'old' ? new Promise<{ nodes: HierarchyNode[] }>(resolve => { late = resolve; }) : Promise.resolve({ nodes: [node('latest')] })) };
    mount(source);
    const input = await screen.findByRole('searchbox');
    fireEvent.change(input, { target: { value: 'old' } });
    expect(source.searchNodes).not.toHaveBeenCalled();
    await waitFor(() => expect(late).toBeTruthy());
    fireEvent.change(input, { target: { value: 'new' } });
    await screen.findByRole('link', { name: 'latest' });
    await act(async () => late({ nodes: [node('stale')] }));
    expect(screen.queryByRole('link', { name: 'stale' })).toBeNull();
    expect(vi.mocked(source.searchNodes!).mock.calls[0][0].signal?.aborted).toBe(true);
    fireEvent.keyDown(input, { key: 'Escape' });
    await screen.findByRole('link', { name: 'root' });
  });
  it('caps calls at 200, deduplicates cursor pages and keeps unknown count unknown', async () => {
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn(async ({ cursor }) => ({ nodes: cursor ? [node('one'), node('two')] : [node('one')], nextCursor: cursor ? undefined : 'next' })) };
    mount(source, { pageSize: 900, mode: 'tree' });
    expect((await screen.findByRole('treeitem', { name: 'one' })).getAttribute('aria-setsize')).toBe('-1');
    fireEvent.click(await screen.findByRole('button', { name: '더 불러오기' }));
    await screen.findByRole('link', { name: 'two' });
    expect(screen.getAllByRole('link', { name: 'one' })).toHaveLength(1);
    expect(vi.mocked(source.listChildren).mock.calls.every(([args]) => args.limit === 200)).toBe(true);
  });
  it.each(['unknown-menu', 'fixture-denied', 'fixture-detail'])('renders invalid or denied target %s as a plain row without href', async menuId => {
    const invalid = { ...node('unknown'), target: { menuId } };
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [invalid] }) });
    await screen.findByText('unknown');
    expect(screen.queryByRole('link', { name: 'unknown' })).toBeNull();
  });

  it('opens a tooltip only for a measured clipped label on keyboard focus', async () => {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node('long-label')] }) });
    const link = await screen.findByRole('link', { name: 'long-label' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => link.focus());
    await screen.findByRole('tooltip');
    expect(link.querySelector('[title]')).toBeNull();
  });

  it('opens the clipped-label tooltip when the tree row (focus owner) is keyboard-focused, not for fitting labels', async () => {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node('long-label')] }) }, { mode: 'tree' });
    const row = await screen.findByRole('treeitem', { name: 'long-label' });
    act(() => row.focus());
    await screen.findByRole('tooltip');
    act(() => row.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('does not open a tooltip on tree-row focus when the label fits', async () => {
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node('short')] }) }, { mode: 'tree' });
    const short = await screen.findByRole('treeitem', { name: 'short' });
    act(() => short.focus());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('uses the secondary text token (>= 4.5:1 on default/hover/selected rows) for the search ancestor path', async () => {
    const source: HierarchySource = { resolveAncestors: async () => [node('parent', true)], listChildren: async () => ({ nodes: [] }), searchNodes: async () => ({ nodes: [node('hit')] }) };
    mount(source);
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'hit' } });
    await screen.findByRole('link', { name: 'hit' });
    const path = await screen.findByText('parent');
    expect(path.className).toContain('text-text-secondary');
    expect(path.className).not.toContain('text-text-muted');
  });

  it('renders tree root loading/error status at content height outside the fixed virtual list', async () => {
    const { container } = mount({ resolveAncestors: async () => [], listChildren: () => new Promise(() => {}) }, { mode: 'tree' });
    const status = await screen.findByRole('status');
    const tree = container.querySelector<HTMLElement>('[role=tree]')!;
    expect(tree.contains(status)).toBe(false);
    expect(tree.style.getPropertyValue('--hierarchy-height')).toBe('0px');
  });

  it('reveals a deep target outside the initial virtual window without focus', async () => {
    const source = createSyntheticHierarchySource();
    mount(source, { currentNodeId: 'node-0125' });
    await screen.findByText('Item 125');
    await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    expect(document.activeElement).toBe(document.body);
  });

  it('aborts hidden descendant requests when a tree branch is collapsed', async () => {
    let signal: AbortSignal | undefined;
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: async args => {
      if (args.parentId === 'child') { signal = args.signal; return new Promise(() => {}); }
      return { nodes: [args.parentId === null ? node('parent', true) : node('child', true)] };
    } };
    mount(source, { mode: 'tree' });
    fireEvent.click(await screen.findByRole('button', { name: 'parent 펼치기' }));
    fireEvent.click(await screen.findByRole('button', { name: 'child 펼치기' }));
    await waitFor(() => expect(signal).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'parent 접기' }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it('keeps exactly one Tab entry when virtualization unmounts the first and roving rows', async () => {
    const source = createSyntheticHierarchySource();
    const { container } = mount(source, { currentNodeId: 'node-0125', mode: 'tree' });
    await screen.findByText('Item 125');
    await waitFor(() => expect(container.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1));
    expect(container.querySelector('[data-hierarchy-node="node-0001"]')).toBeNull();
  });

  it('Retry after a deleted path reloads the exhausted page', async () => {
    let present = false;
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn(async () => ({ nodes: present ? [node('selected')] : [node('other')] })) };
    mount(source, { currentNodeId: 'selected' });
    await screen.findByText('삭제되었거나 이동된 항목입니다.');
    present = true;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('link', { name: 'selected' });
    expect(vi.mocked(source.listChildren)).toHaveBeenCalledTimes(2);
  });

  it.each(['constructor', 'toString', '__proto__'])('restores a node whose id is the reserved property name %s', async id => {
    mount({ resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node(id)] }) }, { currentNodeId: id });
    expect((await screen.findByRole('link', { name: id })).getAttribute('aria-current')).toBe('location');
  });

  it('stops an A/B/A cursor cycle with a retryable error and a bounded call count', async () => {
    const cursors = [undefined, 'A', 'B'];
    const next: Record<string, string> = { start: 'A', A: 'B', B: 'A' };
    const source: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn(async ({ cursor }) => ({ nodes: [node(`n-${cursor ?? 'start'}`)], nextCursor: next[cursor ?? 'start'] })) };
    mount(source, { currentNodeId: 'missing' });
    await screen.findByText('항목을 불러오지 못했습니다.');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(vi.mocked(source.listChildren)).toHaveBeenCalledTimes(cursors.length);
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

});

it('drops cached pages when the supplied source changes (#2028 SHE-25)', async () => {
  const old: HierarchySource = { resolveAncestors: async () => [], listChildren: async () => ({ nodes: [node('Old scope')] }) };
  const next: HierarchySource = { resolveAncestors: async () => [], listChildren: vi.fn(async () => ({ nodes: [node('New scope')] })) };
  const view = mount(old);
  await screen.findByRole('link', { name: 'Old scope' });
  view.rerender(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><TooltipProvider><HierarchyNav menuId="fixture-home" label="Items" source={next} /></TooltipProvider></PlatformProvider></I18nProvider>);
  await screen.findByRole('link', { name: 'New scope' });
  expect(screen.queryByRole('link', { name: 'Old scope' })).toBeNull();
  expect(next.listChildren).toHaveBeenCalledOnce();
});

it('aborts in-flight requests and ignores late completions when the supplied source is replaced (#2028 SHE-25)', async () => {
  let oldSignal: AbortSignal | undefined;
  let resolveOld!: (page: { nodes: HierarchyNode[] }) => void;
  const old: HierarchySource = {
    resolveAncestors: async () => [],
    listChildren: vi.fn(({ signal }) => {
      oldSignal = signal;
      return new Promise<{ nodes: HierarchyNode[] }>(resolve => { resolveOld = resolve; });
    }),
  };
  const next: HierarchySource = {
    resolveAncestors: async () => [],
    listChildren: vi.fn(async () => ({ nodes: [node('New scope')] })),
  };
  const view = mount(old);
  await waitFor(() => expect(oldSignal).toBeTruthy());
  expect(oldSignal?.aborted).toBe(false);

  view.rerender(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><TooltipProvider><HierarchyNav menuId="fixture-home" label="Items" source={next} /></TooltipProvider></PlatformProvider></I18nProvider>);
  await screen.findByRole('link', { name: 'New scope' });
  expect(oldSignal?.aborted).toBe(true);

  await act(async () => resolveOld({ nodes: [node('Late old scope')] }));
  expect(screen.queryByRole('link', { name: 'Late old scope' })).toBeNull();
  expect(screen.getByRole('link', { name: 'New scope' })).toBeTruthy();
});
