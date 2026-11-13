import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type HierarchySource } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../../routing/RouteOutlet';

// #1876: a stale lazy shell chunk after a deploy (board host, sidebar hierarchy nav) rejects its import; the region shows a retry, not an empty root.
const { chunkError } = vi.hoisted(() => ({ chunkError: () => new TypeError('Failed to fetch dynamically imported module: /assets/fixture-chunk.js') }));
vi.mock('../SidebarHierarchyNav', () => { throw chunkError(); });
vi.mock('../../board/BoardHost', () => { throw chunkError(); });

const source: HierarchySource = { listChildren: async () => ({ nodes: [], nextCursor: null }), resolveAncestors: async () => [] } as unknown as HierarchySource;
function Source({ children }: { children: (source: HierarchySource) => ReactNode }) { return children(source); }
const menu = (id: string, over: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({ id, group: groupId('fixture-space'), path: `/${id}`, primary: false, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: true, board: true } as PlatformMenuEntry['features'], pageKeys: [], component: (() => <p>screen content</p>) as unknown as PlatformMenuEntry['component'], ...over });
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'fixture-home' })],
  groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }],
  menus: [menu('fixture-home', { primary: true, navTree: { label: { ko: '동적 항목', en: 'Dynamic items' }, Source } }), menu('fixture-other')],
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const mount = () => {
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
};

// The first test of the file mounts the whole shell cold; under a loaded machine that alone passes 5s.
describe('lazy shell chunk failures (#1876)', { timeout: 15_000 }, () => {
  // Vitest wraps a throwing mock factory's error, so the reload-on-retry rule for a chunk failure is pinned in AppShell.boundaries.test.tsx.
  it('a rejected sidebar hierarchy chunk shows a retry in its section; the rail, menu list and screen stay', async () => {
    window.history.replaceState(null, '', '/mars/fixture-home');
    mount();
    expect(await screen.findByText('screen content')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '동적 항목' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '시스템 레일' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'fixture-other' })).toBeInTheDocument();
  });

  it('a rejected board host chunk shows a retry instead of an empty root', async () => {
    window.history.replaceState(null, '', '/board');
    mount();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '시스템 레일' })).toBeInTheDocument();
  });
});
