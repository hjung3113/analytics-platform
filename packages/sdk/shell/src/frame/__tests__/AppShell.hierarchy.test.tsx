import { createContext, useContext, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type HierarchySource, type Session } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useUnsavedGuard, type PlatformMenuEntry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { createSyntheticHierarchySource, stubHierarchyGeometry } from '@ap/components/testing';
import { AppShell } from '../AppShell';
import { useHostPlatform } from '@ap/kernel/host';
function RouteControl() { const { navigate, linkTo } = useHostPlatform(); return <button onClick={() => navigate(linkTo('fixture-plain'))}>Other group</button>; }
const SourceContext = createContext<HierarchySource | null>(null);
const mounted = vi.fn();
function Source({ children }: { children: (source: HierarchySource) => ReactNode }) { mounted(); return children(useContext(SourceContext)!); }
function Dirty() { useUnsavedGuard(true, { leaves: 'address' }); return null; }
const menu = (id: string, group: ReturnType<typeof groupId>, path: string): PlatformMenuEntry => ({ id, group, path, primary: true, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['object'], hiddenPageKeys: ['object'] });
function fixtures(mode: 'drill' | 'tree' = 'drill', platform = false, visibleKey = false) {
  const navTree = { label: { ko: '동적 항목', en: 'Dynamic items' }, Source, mode, currentNodeId: (location: { page: (key: string) => string | null }) => location.page('object') };
  const home = menu('fixture-home', groupId('fixture-space'), '/fixture');
  const global = menu('fixture-platform', groupId('fixture-global'), '/global');
  return createRegistry({ spaces: [testSpace({ homeMenuId: home.id })], groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }, { id: groupId('fixture-other'), space: spaceId('mars'), label: { ko: '다른 그룹', en: 'Other' }, icon: House }, { id: groupId('fixture-global'), space: null, label: { ko: '플랫폼', en: 'Platform' }, icon: House }], menus: [{ ...home, ...(visibleKey ? { hiddenPageKeys: undefined } : {}), navTree: platform ? undefined : navTree }, { ...global, navTree: platform ? navTree : undefined }, { ...menu('fixture-plain', groupId('fixture-other'), '/other'), primary: true }, { ...menu('fixture-child', groupId('fixture-space'), '/child'), primary: false, navHidden: true, parent: home.id }] });
}
function targetSource(menuId = 'fixture-home'): HierarchySource {
  const synthetic = createSyntheticHierarchySource({ nodes: 5000, depth: 6 });
  const target = (page: Awaited<ReturnType<HierarchySource['listChildren']>>) => ({ ...page, nodes: page.nodes.map(node => ({ ...node, target: { menuId, page: { object: node.id } } })) });
  return { listChildren: async args => target(await synthetic.listChildren(args)), resolveAncestors: synthetic.resolveAncestors, searchNodes: async args => target(await synthetic.searchNodes!(args)) };
}
let restore: () => void;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); localStorage.setItem('platform:sidebar-collapsed', '0'); restore = stubHierarchyGeometry(); mounted.mockClear(); window.history.replaceState(null, '', '/fixture?v=1'); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(source = targetSource(), mode: 'drill' | 'tree' = 'drill', platform = false, dirty = false, visibleKey = false) {
  let session = testSession(['platform:view']);
  let notify = () => {};
  const adapter = testAdapter({ session: () => session, subscribe: listener => { notify = listener; return () => {}; } });
  const view = render(<SourceContext.Provider value={source}><I18nProvider><PlatformProvider registry={fixtures(mode, platform, visibleKey)} adapter={adapter}><AppShell><RouteControl />{dirty ? <Dirty /> : <input aria-label="editor" />}</AppShell></PlatformProvider></I18nProvider></SourceContext.Provider>);
  return { ...view, updateSession(next: Session) { act(() => { session = next; notify(); }); } };
}
it.each([false, true])('hosts declared hierarchy in the real AppShell (platform=%s)', async platform => {
  if (platform) window.history.replaceState(null, '', '/global?v=1');
  mount(targetSource(platform ? 'fixture-platform' : 'fixture-home'), platform ? 'tree' : 'drill', platform);
  const group = await screen.findByRole('group', { name: '동적 항목' });
  await within(group).findByRole('link', { name: 'Item 1' });
  expect(within(group).queryByRole('heading')).toBeNull();
  expect(within(group).queryByRole('region')).toBeNull();
  fireEvent.click(within(group).getByRole('link', { name: 'Item 1' }));
  await waitFor(() => expect(within(group).getByRole(platform ? 'treeitem' : 'link', { name: 'Item 1' }).getAttribute('aria-current')).toBe('location'));
  const navigation = group.closest('nav')!;
  expect(navigation.querySelectorAll('[aria-current="page"]').length).toBe(1);
  expect(navigation.querySelectorAll('[data-current-marker]').length).toBe(2);
});
it('never mounts Source for a denied declaring menu, and invalidates same-render on grant/session changes', async () => {
  const source = targetSource(); const list = vi.spyOn(source, 'listChildren');
  const view = mount(source);
  await screen.findByRole('link', { name: 'Item 1' });
  view.updateSession(testSession(['platform:view'], { user: { id: 'second' } }));
  expect(screen.queryByRole('link', { name: 'Item 1' })).toBeNull();
  await screen.findByRole('link', { name: 'Item 1' });
  expect(list).toHaveBeenCalledTimes(2);
  view.updateSession(testSession(['platform:view'], { user: { id: 'second' } }));
  expect(screen.queryByRole('link', { name: 'Item 1' })).toBeNull();
  await screen.findByRole('link', { name: 'Item 1' });
  expect(list).toHaveBeenCalledTimes(3);
  const mounts = mounted.mock.calls.length;
  view.updateSession(testSession([]));
  expect(screen.queryByRole('group', { name: '동적 항목' })).toBeNull();
  expect(mounted.mock.calls.length).toBe(mounts);
});
it('closes the rail popover on navigation, keeps it on drill and preserves cache on reopening', async () => {
  const source = targetSource(); const list = vi.spyOn(source, 'listChildren');
  mount(source);
  await screen.findByRole('link', { name: 'Item 1' });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '동적 항목' }));
  const popover = await screen.findByRole('dialog', { name: '동적 항목' });
  expect(within(popover).getByRole('link', { name: 'Item 1' })).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(1);
  fireEvent.click(within(popover).getByRole('button', { name: 'Item 1 펼치기' }));
  await within(popover).findByRole('link', { name: 'Item 126' });
  expect(screen.getByRole('dialog', { name: '동적 항목' })).toBeTruthy();
  fireEvent.click(within(popover).getByRole('link', { name: 'Item 126' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '동적 항목' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '동적 항목' }));
  await screen.findByRole('link', { name: 'Item 126' });
  expect(list).toHaveBeenCalledTimes(2);
});
it('keeps popover open when the Kernel unsaved guard refuses navigation', async () => {
  mount(targetSource('fixture-platform'), 'drill', false, true);
  await screen.findByRole('link', { name: 'Item 1' });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '동적 항목' }));
  const popover = await screen.findByRole('dialog', { name: '동적 항목' });
  fireEvent.click(within(popover).getByRole('link', { name: 'Item 1' }));
  expect(screen.queryByRole('alertdialog')).toBeTruthy();
  expect(popover.isConnected).toBe(true);
  expect(popover.getAttribute('data-state')).toBe('open');
  fireEvent.click(screen.getByRole('button', { name: '머무르기' }));
  await screen.findByRole('dialog', { name: '동적 항목' });
});
it('closes the rail popover when a guarded same-menu object move is confirmed, and keeps it when the user stays', async () => {
  window.history.replaceState(null, '', '/fixture?v=1&object=node-0002');
  mount(targetSource('fixture-home'), 'drill', false, true, true);
  await screen.findByRole('link', { name: 'Item 1' });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '동적 항목' }));
  const popover = await screen.findByRole('dialog', { name: '동적 항목' });
  fireEvent.click(within(popover).getByRole('link', { name: 'Item 1' }));
  fireEvent.click(await screen.findByRole('button', { name: '머무르기' }));
  expect(screen.getByRole('dialog', { name: '동적 항목' }).getAttribute('data-state')).toBe('open');
  fireEvent.click(within(screen.getByRole('dialog', { name: '동적 항목' })).getByRole('link', { name: 'Item 1' }));
  fireEvent.click(await screen.findByRole('button', { name: '변경 버리고 이동' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '동적 항목' })).toBeNull());
  expect(window.location.search).toContain('object=node-0001');
});
it('switches between declaring and plain groups without changing hook order', async () => {
  const error = vi.spyOn(console, 'error');
  mount();
  await screen.findByRole('link', { name: 'Item 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Other group' }));
  await waitFor(() => expect(window.location.pathname).toContain('fixture-plain'));
  expect(error.mock.calls.some(args => /order of Hooks|Rendered (more|fewer) hooks/.test(String(args[0])))).toBe(false);
});

it('restores hidden page keys on a navHidden child and keeps its parent menu current', async () => {
  window.history.replaceState(null, '', '/mars/fixture-child?v=1&object=node-0125');
  mount(targetSource('fixture-child'));
  const group = await screen.findByRole('group', { name: '동적 항목' });
  const current = await within(group).findByRole('link', { name: 'Item 125' });
  expect(current.getAttribute('aria-current')).toBe('location');
  expect(screen.getByRole('link', { name: 'fixture-home' }).getAttribute('aria-current')).toBe('page');
  expect(group.contains(document.activeElement)).toBe(false);
});
it('clears popover search with Escape before closing the popover', async () => {
  mount();
  await screen.findByRole('link', { name: 'Item 1' });
  fireEvent.click(screen.getByRole('button', { name: '사이드바 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '동적 항목' }));
  const popover = await screen.findByRole('dialog', { name: '동적 항목' });
  const search = within(popover).getByRole('searchbox') as HTMLInputElement;
  fireEvent.change(search, { target: { value: 'Item' } });
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(search.value).toBe('');
  expect(popover.isConnected).toBe(true);
  fireEvent.keyDown(search, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '동적 항목' })).toBeNull());
});
