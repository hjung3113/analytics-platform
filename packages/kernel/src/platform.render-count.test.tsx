import { useState, type ReactNode } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PaneScreenProvider, PlatformProvider, useHostPlatform, useOverlayState, useRecentVisits, useToastList, usePlatform, type PaneScreen } from './platform';
import { createRegistry } from './registry';
import { noContext, testAdapter, testSession, testSpace, useToastsForTest } from './testing';

// #824 (ADR-0076 supplement): shell-only state that changes often (toasts, palette/switcher, recent visits) lives in its own contexts, so a
// menu or pane `usePlatform()` consumer is not woken by it. These tests count renders; they were red before the split (see the issue table).

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page', 'returnTo'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main', '/main'), primary: true }, entry('plain', '/plain'), entry('board-a', '/a')],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const data = new Map<string, string>();
    vi.stubGlobal(name, {
      getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
    });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const counts = { menu: 0, pane: 0, toasts: 0, overlay: 0, recent: 0 };
let menu: ReturnType<typeof usePlatform>;
let pane: ReturnType<typeof useHostPlatform>;
let toasts: ReturnType<typeof useToastList>;
let overlay: ReturnType<typeof useOverlayState>;
let recent: ReturnType<typeof useRecentVisits>;
let hostSnapshot: ReturnType<typeof useHostPlatform>;
const stableFns = () => [hostSnapshot.toast, hostSnapshot.dismissToast, hostSnapshot.holdToast, hostSnapshot.setPaletteOpen, hostSnapshot.setSwitcherOpen, hostSnapshot.toggleFavorite, hostSnapshot.readRecent];

function MenuConsumer() { menu = usePlatform(); hostSnapshot = useHostPlatform(); counts.menu++; return null; }
function ToastConsumer() { toasts = useToastList(); counts.toasts++; return null; }
function OverlayConsumer() { overlay = useOverlayState(); counts.overlay++; return null; }
function RecentConsumer() { recent = useRecentVisits(); counts.recent++; return null; }
function PaneConsumer() { pane = useHostPlatform(); counts.pane++; return null; }

const PANE_SCREEN: PaneScreen = { menuId: 'board-a', params: {}, query: '' };
function Pane() {
  const [screen, setScreen] = useState(PANE_SCREEN);
  return <PaneScreenProvider paneId="p1" screen={screen} onLeave={() => {}} onChange={next => setScreen(next)}><PaneConsumer /></PaneScreenProvider>;
}

function mount(ui: ReactNode = <><MenuConsumer /><ToastConsumer /><OverlayConsumer /><RecentConsumer /><Pane /></>) {
  Object.assign(counts, { menu: 0, pane: 0, toasts: 0, overlay: 0, recent: 0 });
  window.history.replaceState(null, '', '/main');
  // The tree is built once: a render of the provider alone must not re-render the consumers below it.
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{ui}</PlatformProvider></I18nProvider>);
}
/** Renders each consumer caused by `act(fn)`, measured as the difference of the counters. */
function measure(fn: () => void) {
  const before = { ...counts };
  act(fn);
  return { menu: counts.menu - before.menu, pane: counts.pane - before.pane, toasts: counts.toasts - before.toasts, overlay: counts.overlay - before.overlay, recent: counts.recent - before.recent };
}

describe('menu and pane consumers are not woken by shell-only state', () => {
  it.each([
    ['toast', () => { menu.toast('hello'); }],
    ['dismissToast', () => { menu.dismissToast(1); }],
    ['palette open', () => { hostSnapshot.setPaletteOpen(true); }],
    ['palette close', () => { hostSnapshot.setPaletteOpen(false); }],
    ['switcher open', () => { hostSnapshot.setSwitcherOpen(true); }],
    ['switcher close', () => { hostSnapshot.setSwitcherOpen(false); }],
  ])('%s renders no menu and no pane consumer', (_name, action) => {
    mount();
    const delta = measure(action);
    expect(delta.menu).toBe(0);
    expect(delta.pane).toBe(0);
  });

  it('a main navigate in the same space renders the menu consumer once and the pane at most once', () => {
    mount();
    const delta = measure(() => { expect(menu.navigate('/plain')).toBe(true); });
    expect(delta.menu).toBe(1);
    expect(delta.pane).toBeLessThanOrEqual(1);
    expect(menu.pathname).toBe('/plain');
  });

  it('a main setPage renders the menu consumer once and the pane at most once', () => {
    mount();
    const delta = measure(() => { menu.setPage({ page: '2' }); });
    expect(delta.menu).toBe(1);
    expect(delta.pane).toBeLessThanOrEqual(1);
    expect(menu.pageParam('page')).toBe('2');
  });

  it('a pane setPage (echoing controlled pane) renders no menu consumer', () => {
    mount();
    const delta = measure(() => { pane.setPage({ page: '3' }); });
    expect(delta.menu).toBe(0);
    expect(pane.pageParam('page')).toBe('3');
  });
});

describe('each shell-only hook wakes only its own consumers', () => {
  it('useToastList follows toasts only', () => {
    mount();
    const raised = measure(() => { menu.toast('hello', 'warning'); });
    expect(raised).toMatchObject({ toasts: 1, overlay: 0, recent: 0 });
    expect(toasts.map(t => [t.text, t.tone])).toEqual([['hello', 'warning']]);
    const dismissed = measure(() => { menu.dismissToast(toasts[0]!.id); });
    expect(dismissed).toMatchObject({ toasts: 1, overlay: 0, recent: 0 });
    expect(toasts).toEqual([]);
    expect(measure(() => { hostSnapshot.setPaletteOpen(true); }).toasts).toBe(0);
    expect(measure(() => { menu.navigate('/plain'); }).toasts).toBe(0);
  });

  it('useOverlayState follows the palette and the switcher only', () => {
    mount();
    expect(overlay).toMatchObject({ paletteOpen: false, switcherOpen: false });
    const opened = measure(() => { hostSnapshot.setPaletteOpen(true); });
    expect(opened).toMatchObject({ overlay: 1, toasts: 0, recent: 0 });
    expect(overlay.paletteOpen).toBe(true);
    expect(overlay.paletteSession).not.toBeNull();
    const switched = measure(() => { hostSnapshot.setSwitcherOpen(true); });
    expect(switched).toMatchObject({ overlay: 1, toasts: 0, recent: 0 });
    expect(overlay.switcherOpen).toBe(true);
    expect(measure(() => { menu.toast('x'); }).overlay).toBe(0);
    expect(measure(() => { menu.navigate('/plain'); }).overlay).toBe(0);
  });

  it('useRecentVisits follows the main screen visits only, and readRecent is current right after a navigation', () => {
    mount();
    expect(recent.map(r => r.menuId)).toEqual(['main']);
    let read: readonly { menuId: string }[] = [];
    const moved = measure(() => { menu.navigate('/plain'); });
    expect(moved.recent).toBeGreaterThanOrEqual(1);
    expect(recent.map(r => r.menuId)).toEqual(['plain', 'main']);
    act(() => { read = hostSnapshot.readRecent(); });
    expect(read.map(r => r.menuId)).toEqual(['plain', 'main']);
    expect(measure(() => { menu.toast('x'); }).recent).toBe(0);
    expect(measure(() => { hostSnapshot.setPaletteOpen(true); }).recent).toBe(0);
  });

  it('the action functions keep one reference across toasts, overlays and navigation', () => {
    mount();
    const first = stableFns();
    act(() => { menu.toast('x'); });
    act(() => { hostSnapshot.setPaletteOpen(true); });
    act(() => { hostSnapshot.setSwitcherOpen(true); });
    act(() => { menu.navigate('/plain'); });
    const later = stableFns();
    first.forEach((fn, i) => expect(later[i]).toBe(fn));
  });
});

describe('the shell-only hooks need a provider', () => {
  it.each([
    ['useRecentVisits', useRecentVisits],
    ['useToastList', useToastList],
    ['useOverlayState', useOverlayState],
    ['useToastsForTest', useToastsForTest],
  ])('%s throws outside PlatformProvider', (_name, hook) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => hook())).toThrow();
    vi.restoreAllMocks();
  });
});
