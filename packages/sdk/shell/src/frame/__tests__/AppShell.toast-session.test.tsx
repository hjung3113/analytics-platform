import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformMenuEntry } from '@ap/kernel';
import { useHostPlatform, type HostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type PlatformAdapter, type Session } from '@ap/contracts';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../../routing/RouteOutlet';

// #2075 C2: a toast can carry the previous user's data (a private saved-view name). The visible stack and both sr-only live regions belong to
// one session generation (adapter, revision, user): a new generation drops them, and a toast call from an older generation shows nothing.
// A menu screen that announces its own closing from a layout cleanup, with the current user's private view name.
const LEAVING = 'u1 private view';
function LeavingPage() {
  const { toast } = useHostPlatform();
  useLayoutEffect(() => () => { toast(LEAVING); }, [toast]);
  return <p>leaving page</p>;
}
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], component: LeavingPage as unknown as PlatformMenuEntry['component'] }],
});

let host!: HostPlatform;
function Probe() { host = useHostPlatform(); return null; }

function sessionAdapter(initial: Session) {
  let session = initial;
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  const change = (next: Session) => act(async () => { session = next; listeners.forEach(l => l()); });
  return { adapter, change };
}
const tree = (adapter: PlatformAdapter) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AppShell><Probe /></AppShell></PlatformProvider></I18nProvider>;

const SECRET = '비공개 보기 u1-secret-view 저장됨';
const raise = () => act(() => {
  host.toast(SECRET, 'info');
  host.toast(`${SECRET} 실패`, 'danger');
  host.toast(SECRET, 'info', undefined, { action: { label: '되돌리기', onAction: () => {} } });
});
const items = () => [...document.querySelectorAll('[data-toast-item]')].map(e => e.textContent ?? '');
const spoken = () => [...document.querySelectorAll('[data-toast-stack] [aria-live]')].map(e => e.textContent ?? '').join('|');
function expectRaised() {
  expect(items().some(text => text.includes(SECRET))).toBe(true);
  expect(spoken()).toContain(SECRET);
}
function expectGone() {
  expect(items()).toEqual([]);
  expect(spoken()).not.toContain(SECRET);
  expect(document.body.textContent).not.toContain('u1-secret-view');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shell toasts belong to one session generation (#2075)', () => {
  it.each([
    ['another user', testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } })],
    ['changed permissions of the same user', testSession(['platform:view', 'console:access'])],
    ['a changed Scope grant of the same user', testSession(['platform:view'], { scopes: [{ id: 's1', label: 's1', grantedRooms: 1, totalRooms: 2 }] })],
  ])('a session change notice (%s) clears the visible toasts and their sr-only copies', async (_name, next) => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    raise();
    expectRaised();
    await change(next);
    expectGone();
  });

  it('an adapter swap that keeps the same user (revision starts over at 0) clears them too', () => {
    const first = sessionAdapter(testSession(['platform:view']));
    const { rerender } = render(tree(first.adapter));
    raise();
    expectRaised();
    rerender(tree(sessionAdapter(testSession(['platform:view', 'console:access'])).adapter));
    expectGone();
  });

  // C2: the old screen's layout cleanup runs in the swap commit before the Provider's own cleanup, after the render that dropped the list.
  it.each([
    ['another user', testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } })],
    ['the same user with fewer permissions', testSession(['platform:view'])],
  ])('a toast the old screen raises from its layout cleanup during an adapter swap (%s) never reaches the new session', (_name, next) => {
    const routed = (adapter: PlatformAdapter) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AppShell><Probe /><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>;
    const { rerender } = render(routed(sessionAdapter(testSession(['platform:view', 'console:access'])).adapter));
    expect(screen.getByText('leaving page')).toBeTruthy();
    rerender(routed(sessionAdapter(next).adapter));
    expect(screen.getByText('leaving page')).toBeTruthy();
    act(() => {});
    expect(items().join('|')).not.toContain(LEAVING);
    expect(spoken()).not.toContain(LEAVING);
    expect(document.body.textContent).not.toContain(LEAVING);
    // The new generation's own toast is still shown.
    act(() => { host.toast('새 세대 알림'); });
    expect(items()).toEqual([expect.stringContaining('새 세대 알림')]);
  });

  it('a toast call from an older generation (a late callback) shows and says nothing', async () => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    const lateToast = host.toast;
    await change(testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } }));
    act(() => { lateToast(SECRET, 'info'); lateToast(SECRET, 'danger'); });
    expectGone();
    // The new generation's own toast still works and is said.
    act(() => { host.toast('새 세대 알림'); });
    expect(items()).toEqual([expect.stringContaining('새 세대 알림')]);
    expect(spoken()).toContain('새 세대 알림');
  });

  it('a dropped toast leaves no timer behind: the next generation\'s toast keeps its full 5 s', async () => {
    vi.useFakeTimers();
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    act(() => { host.toast(SECRET, 'info', undefined, { durationMs: 1000 }); });
    await change(testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } }));
    act(() => { host.toast('새 세대 알림'); });
    act(() => { vi.advanceTimersByTime(4900); });
    expect(items()).toEqual([expect.stringContaining('새 세대 알림')]);
    act(() => { vi.advanceTimersByTime(200); });
    expect(items()).toEqual([]);
  });

  it('keeps the toasts across a re-render and an endpoint refresh of the same session', () => {
    const { adapter } = sessionAdapter(testSession(['platform:view']));
    const { rerender } = render(tree(adapter));
    raise();
    const stack = document.querySelector('[data-toast-stack]');
    rerender(tree(adapter));
    act(() => { host.refreshEpochs.bump(['fixture.query']); });
    expectRaised();
    expect(items()).toHaveLength(3);
    expect(document.querySelector('[data-toast-stack]')).toBe(stack);
    // Still dismissable as before.
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' })[0]!);
    expect(items()).toHaveLength(2);
  });
});
