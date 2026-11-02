import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';
import { groupId, spaceId } from '@ap/contracts';

const registry = createRegistry({
  spaces: [
    testSpace({ id: spaceId('mars'), homeMenuId: 'a-home' }),
    testSpace({ id: spaceId('free'), homeMenuId: 'b-home', scopePresentation: 'hidden' }),
  ],
  groups: [
    { id: groupId('ga'), label: { ko: 'A', en: 'A' }, icon: House, space: spaceId('mars') },
    { id: groupId('gb'), label: { ko: 'B', en: 'B' }, icon: House, space: spaceId('free') },
  ],
  menus: ([['a-home', 'ga', '/mars/a'], ['b-home', 'gb', '/free/b']] as const).map(([id, group, path]) => ({
    id, group: groupId(group), path, permission: 'platform:view' as const, primary: true, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House,
    requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  })),
});

const Own: ComponentType<{ collapsed: boolean }> = () => <p>own scope control</p>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('localStorage', memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(url: string, collapsed: boolean, slots: PlatformSlots = {}) {
  window.history.replaceState(null, '', url);
  localStorage.setItem('platform:sidebar-collapsed', collapsed ? '1' : '0');
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}><AppShell><p>body</p></AppShell></PlatformProvider></I18nProvider>);
}
const selector = () => screen.queryByRole('button', { name: /^Scope:/ });

describe('SpaceDef.scopePresentation (#1251)', () => {
  it.each([[false], [true]])('hidden space without a slot draws no Scope surface (collapsed=%s)', collapsed => {
    mount('/free/b', collapsed);
    expect(selector()).toBeNull();
  });

  it.each([[false], [true]])('hidden space whose slot returns null draws nothing (collapsed=%s)', collapsed => {
    mount('/free/b', collapsed, { scopeControl: { For: () => null } });
    expect(selector()).toBeNull();
    expect(screen.queryByText('own scope control')).toBeNull();
  });

  it('hidden space whose slot returns a component still renders it', () => {
    mount('/free/b', false, { scopeControl: { For: () => Own } });
    expect(screen.getByText('own scope control')).toBeInTheDocument();
    expect(selector()).toBeNull();
  });

  it('default space keeps the analytics ScopeSelector', () => {
    mount('/mars/a', false);
    expect(selector()).not.toBeNull();
  });

  it('default space keeps its slot component', () => {
    mount('/mars/a', false, { scopeControl: { For: () => Own } });
    expect(screen.getByText('own scope control')).toBeInTheDocument();
    expect(selector()).toBeNull();
  });
});
