import { useLayoutEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformMenuEntry, type PlatformSlots } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../AppShell';
import { reloadApp } from '../reload';

// #1876: code the shell mounts outside the menu screen (a menu's navTree Source, injected slots) must not blank the whole root.
vi.mock('../reload', () => ({ reloadApp: vi.fn() }));
function Boom(): ReactNode { throw new Error('fixture region failure'); }
let failWith: Error | null = null;
function FlakySource(): ReactNode { if (failWith) throw failWith; return <p>fixture section recovered</p>; }
const BoomSource = FlakySource as unknown as NonNullable<PlatformMenuEntry['navTree']>['Source'];
const menu = (id: string, over: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({ id, group: groupId('fixture-space'), path: `/${id}`, primary: false, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over });
const registry = (navTree: boolean) => createRegistry({
  spaces: [testSpace({ homeMenuId: 'fixture-home' })],
  groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }],
  menus: [menu('fixture-home', { primary: true, ...(navTree ? { navTree: { label: { ko: '동적 항목', en: 'Dynamic items' }, Source: BoomSource } } : {}) }), menu('fixture-other')],
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  failWith = new Error('fixture region failure');
  vi.mocked(reloadApp).mockClear();
  window.history.replaceState(null, '', '/mars/fixture-home');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount({ navTree = false, slots = {} }: { navTree?: boolean; slots?: PlatformSlots } = {}) {
  const session = testSession(['platform:view']);
  const reportClientError = vi.fn(async () => ({ accepted: true }));
  render(<I18nProvider><PlatformProvider registry={registry(navTree)} adapter={testAdapter({ session: () => session, reportClientError })} slots={{ topBarTools: <span>fixture tools</span>, ...slots }}>
    <AppShell><p>screen content</p></AppShell>
  </PlatformProvider></I18nProvider>);
  return { reportClientError };
}

async function expectFrameStands() {
  expect(await screen.findByText('screen content')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '시스템 레일' })).toBeInTheDocument();
  expect(screen.getByText('fixture tools')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'fixture-other' })).toBeInTheDocument();
}

// The first test of the file mounts the whole shell cold; under a loaded machine that alone passes 5s.
describe('shell region boundaries (#1876)', { timeout: 15_000 }, () => {
  it('a throwing navTree Source hides only its own section: the rail, the menu list and the screen stay, and the failure is reported', async () => {
    const { reportClientError } = mount({ navTree: true });
    await expectFrameStands();
    expect(screen.getByText('항목을 불러오지 못했습니다.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    await waitFor(() => expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({ menuId: 'fixture-home', name: 'Error' })));
  });

  it('retry reloads after a chunk failure and remounts the region after any other failure', async () => {
    failWith = new TypeError('Failed to fetch dynamically imported module: /assets/fixture-chunk.js');
    mount({ navTree: true });
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(reloadApp).toHaveBeenCalledTimes(1);
    cleanup();
    failWith = new Error('fixture region failure');
    mount({ navTree: true });
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    failWith = null;
    fireEvent.click(retry);
    expect(await screen.findByText('fixture section recovered')).toBeInTheDocument();
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it.each<[string, PlatformSlots]>([
    ['notifications', { notifications: { menuId: 'fixture-other', UnreadCount: Boom, Recent: Boom } }],
    ['scopeControl', { scopeControl: { For: () => Boom } }],
    ['navCounts', { navCounts: { For: () => Boom } }],
    ['spaceNavSection', { spaceNavSection: { For: () => ({ label: { ko: '공간 구역', en: 'Space section' }, Body: Boom }) } }],
    ['features', { features: { entriesFor: () => { throw new Error('fixture region failure'); } } }],
    // C1: the selector itself throws, not the component it returns.
    ['navCounts For', { navCounts: { For: () => { throw new Error('fixture region failure'); } } }],
    ['spaceNavSection For', { spaceNavSection: { For: () => { throw new Error('fixture region failure'); } } }],
    ['scopeControl For', { scopeControl: { For: () => { throw new Error('fixture region failure'); } } }],
  ])('one throwing slot (%s) leaves the rail, the other slots, the menu list and the screen', async (_name, slots) => {
    mount({ slots });
    await expectFrameStands();
  });

  it('a throwing topBarTools slot drops only the tools: the rail, the menu list and the screen stay', async () => {
    mount({ slots: { topBarTools: <Boom /> } });
    expect(await screen.findByText('screen content')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '시스템 레일' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'fixture-other' })).toBeInTheDocument();
  });

  it('a throwing VOC compose form leaves the rail, the menu list and the screen', async () => {
    mount({ slots: { vocCompose: { Compose: Boom } } });
    await expectFrameStands();
    fireEvent.click(screen.getByRole('button', { name: 'VOC 등록' }));
    await expectFrameStands();
    expect(screen.getByRole('button', { name: 'VOC 등록' })).toBeInTheDocument();
  });

  it('a section failing in one space does not hide a healthy section of the next space', async () => {
    const section = (Body: () => ReactNode) => ({ label: { ko: '공간 구역', en: 'Space section' }, Body });
    const Healthy = () => <p>healthy section body</p>;
    const spaces = { mars: section(Boom as () => ReactNode), venus: section(Healthy) };
    const reg = createRegistry({
      spaces: [testSpace({ homeMenuId: 'fixture-home' }), testSpace({ id: spaceId('venus'), homeMenuId: 'venus-home' })],
      groups: [{ id: groupId('fixture-space'), space: spaceId('mars'), label: { ko: '공간', en: 'Space' }, icon: House }, { id: groupId('venus-group'), space: spaceId('venus'), label: { ko: '금성', en: 'Venus' }, icon: House }],
      menus: [menu('fixture-home', { primary: true }), menu('venus-home', { group: groupId('venus-group'), primary: true })],
    });
    window.history.replaceState(null, '', '/mars/fixture-home');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider registry={reg} adapter={testAdapter({ session: () => session })} slots={{ spaceNavSection: { For: id => (spaces as Record<string, ReturnType<typeof section>>)[id] ?? null } }}>
      <AppShell><p>screen content</p></AppShell>
    </PlatformProvider></I18nProvider>);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    act(() => { window.history.pushState(null, '', '/venus/venus-home'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByText('healthy section body')).toBeInTheDocument();
  });

  it('a shell region failure does not cancel the arrival focus request of a healthy screen', async () => {
    const cancelSpy = vi.fn();
    // Listed before the shell, so its layout effect runs before the boundary's first componentDidCatch.
    function CancelSpy() {
      const pageNavigation = useHostPlatform().pageNavigation as unknown as { cancel: () => void };
      useLayoutEffect(() => { const original = pageNavigation.cancel; pageNavigation.cancel = () => { cancelSpy(); original(); }; return () => { pageNavigation.cancel = original; }; }, [pageNavigation]);
      return null;
    }
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider registry={registry(true)} adapter={testAdapter({ session: () => session })}><CancelSpy /><AppShell><p>screen content</p></AppShell></PlatformProvider></I18nProvider>);
    await screen.findByRole('button', { name: '다시 시도' });
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
