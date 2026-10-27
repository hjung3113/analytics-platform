import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../../routing/RouteOutlet';

// #824: the shell's own toast, palette and recent-visit state wakes its leaf parts, never the menu page it frames.

let pageRenders = 0;
let host: ReturnType<typeof useHostPlatform>;
function Page() { usePlatform(); pageRenders++; return <p>menu page</p>; }
function Controls() { host = useHostPlatform(); return null; }
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view',
    requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...{ component: Page } as Record<string, unknown>,
  }],
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  window.history.replaceState(null, '', '/');
  pageRenders = 0;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AppShell leaf state', () => {
  it('a toast, its dismissal, a palette open and a palette close render the menu page zero times', () => {
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Controls /><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
    expect(screen.getByText('menu page')).toBeTruthy();
    const before = pageRenders;
    let id = 0;
    act(() => { id = host.toast('hello'); });
    expect(screen.getByText('hello')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('hello')).toBeNull();
    act(() => { host.dismissToast(id); });
    act(() => { host.setPaletteOpen(true); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => { host.setPaletteOpen(false); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pageRenders - before).toBe(0);
  });
});
