import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { StrictMode, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type Permission } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type AccessRequestSlot } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform, useOverlayState } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppSidebar } from '../../frame/AppSidebar';
import { ScreenOutlet } from '../RouteOutlet';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: string, path: string, label: string, permission: Permission = 'platform:view') => ({
  id, group: groupId(group), path, label: { ko: label, en: label }, description: { ko: '', en: '' }, icon: House,
  permission, requiresScope: false, context: noContext, pageType: 'overview' as const, features, pageKeys: [],
});
const registry = createRegistry({
  spaces: [
    testSpace({ homeMenuId: 'home', label: { ko: 'MARS', en: 'MARS' } }),
    testSpace({ id: spaceId('operations'), homeMenuId: 'roles', permission: 'console:access', label: { ko: '운영 콘솔', en: 'Operations console' } }),
  ],
  groups: [
    { id: groupId('overview'), space: spaceId('mars'), label: { ko: '개요', en: 'Overview' }, icon: House },
    { id: groupId('admin'), space: spaceId('operations'), label: { ko: '관리', en: 'Admin' }, icon: House },
  ],
  menus: [
    { ...entry('home', 'overview', '/home', '홈'), primary: true },
    entry('equipment', 'overview', '/equipment', '설비 마스터', 'console:access'),
    { ...entry('metric', 'overview', '/metric', '지표 화면'), initializesMetric: true, context: { ...noContext, metric: 'apply' as const } },
    { ...entry('roles', 'admin', '/roles', '권한 관리', 'console:access'), primary: true },
  ],
});

let platform: ReturnType<typeof useHostPlatform>;
let overlay: ReturnType<typeof useOverlayState>;
function Probe() { platform = useHostPlatform(); overlay = useOverlayState(); return null; }
const blocked = [
  ['unregistered route', '/no-such-menu?v=1', '없는 화면'],
  ['contract error', '/mars/home?v=99', '주소에 쓸 수 없는 값이 있습니다'],
  ['space denied', '/operations/roles?v=1', '운영 콘솔'],
  ['menu denied', '/mars/equipment?v=1', '설비 마스터'],
] as const;

function mount(url = '/mars/home?v=1', pane = false, strict = false, menus = registry) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, publishedMetrics: () => [{ metricId: 'CT', publishedVersion: '7' }] })} registry={menus}>
    <Probe /><AppSidebar collapsed={false} onToggle={() => {}} />
    <main id="platform-main" tabIndex={-1}><ScreenOutlet /></main>
    {pane && <div data-pane-id="denied" tabIndex={-1}>
      <PaneScreenProvider paneId="denied" screen={{ menuId: 'equipment', params: {}, query: '?v=1' }} onChange={() => {}} onLeave={() => {}}><ScreenOutlet /></PaneScreenProvider>
    </div>}
  </PlatformProvider></I18nProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Holds the navigation dialog's focus gate across `act`, then returns its release. */
function navigateBehindDialog(href: string) {
  act(() => { platform.setPaletteOpen(true); });
  const session = overlay.paletteSession!;
  const owner = Symbol('dialog');
  act(() => { session.claim(owner); platform.setPaletteOpen(false); platform.navigate(href, { focus: 'page' }); });
  return () => act(() => { session.release(owner); });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Kernel blocked screens (#1893, 06 §26)', () => {
  it.each(blocked)('%s has one h1 and receives the Kernel arrival focus', (_state, href, title) => {
    mount();
    act(() => { platform.navigate(href, { focus: 'page' }); });
    const main = within(screen.getByRole('main'));
    expect(main.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(main.getByRole('heading', { level: 1, name: title })).toHaveFocus();
  });

  it.each(blocked)('%s waits for the navigation dialog focus gate to release', (_state, href, title) => {
    mount();
    act(() => { platform.setPaletteOpen(true); });
    const session = overlay.paletteSession!;
    const owner = Symbol('dialog');
    act(() => { session.claim(owner); platform.setPaletteOpen(false); platform.navigate(href, { focus: 'page' }); });
    const heading = within(screen.getByRole('main')).getByRole('heading', { level: 1, name: title });
    expect(heading).not.toHaveFocus();
    act(() => { session.release(owner); });
    expect(heading).toHaveFocus();
  });

  it.each([
    ['/roles?v=1', '운영 콘솔'],
    ['/equipment?v=1', '설비 마스터'],
  ])('keeps denied-screen arrival focus through a legacy address redirect (%s)', (href, title) => {
    mount();
    act(() => { platform.navigate(href, { focus: 'page' }); });
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: title })).toHaveFocus();
  });

  it.each(blocked)('%s does not take focus on direct load or a same-path query change', (_state, href, title) => {
    mount(href);
    const main = screen.getByRole('main');
    const heading = within(main).getByRole('heading', { level: 1, name: title });
    expect(heading).not.toHaveFocus();
    const home = within(main).queryByRole('link', { name: '홈' });
    const action = home ?? within(main).getByRole('button', { name: '조건 초기화' });
    act(() => { action.focus(); platform.navigate(`${href}&lotIds=kept`); });
    expect(action).toHaveFocus();
  });

  it.each([
    ['/mars/home?v=99', 'v=99 is not supported; the bookmark is not rewritten'],
    ['/mars/home?v=1&from=garbage', 'from: use YYYY-MM-DDTHH:mm:ss'],
  ])('keeps the localized explanation and URL without client parser detail (%s)', (href, diagnostic) => {
    mount(href);
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('alert')).not.toHaveTextContent(diagnostic);
    expect(main.queryByRole('note', { name: '서버 세부' })).toBeNull();
    expect(main.getByText(href)).toBeVisible();
    expect(main.getByRole('button', { name: '조건 초기화' })).toBeVisible();
  });

  it.each([
    ['space', '/operations/roles?v=1', '운영 콘솔'],
    ['menu', '/mars/equipment?v=1', '설비 마스터'],
  ])('names the denied %s in the body', (_state, href, label) => {
    mount(href);
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(`${label}. 관리자에게 요청하세요.`);
  });

  it.each([blocked[0], blocked[2]])('uses one platform name in the fallback sidebar (%s)', (_state, href) => {
    const view = mount(href);
    const head = view.container.querySelector('aside > div')!;
    expect(Array.from(head.querySelectorAll('p')).map(node => node.textContent)).toEqual(['분석 플랫폼']);
    expect(head).not.toHaveTextContent('Analytics Platform');
    expect(head).not.toHaveTextContent('MARS');
  });

  it('keeps the board pane header and automatic focus owned by the board', () => {
    const view = mount('/mars/home?v=1', true);
    const pane = view.container.querySelector<HTMLElement>('[data-pane-id="denied"]')!;
    expect(within(pane).queryByRole('heading', { level: 1 })).toBeNull();
    act(() => { pane.focus(); });
    expect(pane).toHaveFocus();
    expect(within(pane).getByRole('status')).toHaveTextContent('설비 마스터');
  });

  it('keeps reset recovery focus on main when the contract error disappears', () => {
    mount('/mars/home?v=99');
    const button = screen.getByRole('button', { name: '조건 초기화' });
    act(() => { button.focus(); });
    fireEvent.click(button);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('leaves arrival focus for the final menu title while the metric version is stamped', () => {
    mount();
    act(() => { platform.navigate('/mars/metric?v=1&metricId=CT', { focus: 'page' }); });
    expect(new URLSearchParams(window.location.search).get('metricVersion')).toBe('7');
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: '지표 화면' })).toHaveFocus();
  });

  it('does not move focus to the new title when permission alone recovers before the dialog gate opens', () => {
    window.history.replaceState(null, '', '/mars/home?v=1');
    let session = testSession(['platform:view']);
    const listeners = new Set<() => void>();
    const adapter = testAdapter({ session: () => session, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <Probe /><main id="platform-main" tabIndex={-1}><ScreenOutlet /></main>
    </PlatformProvider></I18nProvider>);
    act(() => { platform.setPaletteOpen(true); });
    const dialog = overlay.paletteSession!;
    const owner = Symbol('dialog');
    act(() => { dialog.claim(owner); platform.setPaletteOpen(false); platform.navigate('/mars/equipment?v=1', { focus: 'page' }); });
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: '설비 마스터' })).not.toHaveFocus();
    session = testSession(['platform:view', 'console:access']);
    act(() => { listeners.forEach(listener => listener()); });
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => { outside.focus(); dialog.release(owner); });
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('keeps the gated arrival through the StrictMode effect replay', () => {
    mount('/mars/home?v=1', false, true);
    const release = navigateBehindDialog('/mars/equipment?v=1');
    const heading = within(screen.getByRole('main')).getByRole('heading', { level: 1, name: '설비 마스터' });
    expect(heading).not.toHaveFocus();
    release();
    expect(heading).toHaveFocus();
  });

  it('keeps the gated arrival when the default period rewrites the denied address', () => {
    const timed = createRegistry({
      spaces: [testSpace({ homeMenuId: 'home', label: { ko: 'MARS', en: 'MARS' } })],
      groups: [{ id: groupId('overview'), space: spaceId('mars'), label: { ko: '개요', en: 'Overview' }, icon: House }],
      menus: [
        { ...entry('home', 'overview', '/home', '홈'), primary: true },
        { ...entry('trend', 'overview', '/trend', '추이 분석', 'console:access'), context: { ...noContext, time: 'apply' as const } },
      ],
    });
    mount('/mars/home?v=1', false, false, timed);
    const release = navigateBehindDialog('/mars/trend?v=1');
    expect(new URLSearchParams(window.location.search).get('from')).not.toBeNull();
    const heading = within(screen.getByRole('main')).getByRole('heading', { level: 1, name: '추이 분석' });
    expect(heading).not.toHaveFocus();
    release();
    expect(heading).toHaveFocus();
  });
});

describe('Kernel blocked screens: next actions (#1940)', () => {
  const targets: unknown[] = [];
  const slot: AccessRequestSlot = {
    Pending: ({ target, children }) => { targets.push(target); return <>{children({ pending: null, statusHref: '/permission-requests' })}</>; },
    Dialog: () => null,
  };
  const mountWith = (url: string, slots?: { accessRequest: AccessRequestSlot }) => {
    window.history.replaceState(null, '', url);
    const session = testSession(['platform:view']);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>
      <Probe /><main id="platform-main" tabIndex={-1}><ScreenOutlet /></main>
    </PlatformProvider></I18nProvider>);
  };

  it('unregistered route: 메뉴 검색 button opens the palette beside 홈', () => {
    mountWith('/no-such-menu?v=1');
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: '홈' })).toBeTruthy();
    expect(overlay.paletteOpen).toBe(false);
    fireEvent.click(main.getByRole('button', { name: /^메뉴 검색 \((⌘K|Ctrl\+K)\)$/ }));
    expect(overlay.paletteOpen).toBe(true);
  });

  it('menu denied: 권한 요청 goes to the address the slot gives, asked for the missing permission', () => {
    targets.length = 0;
    mountWith('/mars/equipment?v=1', { accessRequest: slot });
    const link = within(screen.getByRole('main')).getByRole('link', { name: '권한 요청' });
    expect(link.getAttribute('href')).toBe('/permission-requests');
    expect(targets).toContainEqual({ kind: 'permission', permission: 'console:access' });
  });

  it.each([
    ['no slot', undefined],
    ['a slot with no address', { accessRequest: { ...slot, Pending: ({ children }: ComponentProps<AccessRequestSlot['Pending']>) => <>{children({ pending: null, statusHref: null })}</> } }],
  ])('menu denied with %s draws no 권한 요청', (_name, slots) => {
    mountWith('/mars/equipment?v=1', slots);
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('설비 마스터');
    expect(screen.queryByText('권한 요청')).toBeNull();
  });

  it('a slot that throws while rendering leaves the denial, the home link and the page (reported like any shell region)', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing: AccessRequestSlot = { Pending: () => { throw new Error('slot failed'); }, Dialog: () => null };
    mountWith('/mars/equipment?v=1', { accessRequest: throwing });
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('status')).toHaveTextContent('설비 마스터');
    expect(main.getByRole('link', { name: '홈' })).toBeTruthy();
    expect(screen.queryByText('권한 요청')).toBeNull();
    quiet.mockRestore();
  });

  it('other blocked screens do not get either new button', () => {
    mountWith('/operations/roles?v=1', { accessRequest: slot });
    expect(screen.queryByText('권한 요청')).toBeNull();
    expect(screen.queryByRole('button', { name: /^메뉴 검색/ })).toBeNull();
  });
});

it.each([
  ['ko', '없는 화면', '등록되지 않은 경로입니다'],
  ['en', 'Page not found', 'Unregistered route'],
] as const)('separates the %s unknown-route heading from the body card (#1995)', (lang, heading, body) => {
  localStorage.setItem('platform:lang', lang);
  mount('/no-such-menu?v=1');
  expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
  expect(within(screen.getByRole('main')).getByText(body)).toBeTruthy();
});
