import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes, House, Wrench } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type PlatformSlots } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import userEvent from '@testing-library/user-event';
import { AppShell } from './AppShell';
import { groupId, menuPermission, spaceId, type GroupId, type Permission } from '@ap/contracts';

function menu(id: string, group: GroupId, path: string, label: string, over: object = {}) {
  return { id, group, path, permission: 'platform:view' as const, primary: true, label: { ko: label, en: `${label}-en` }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'tab'], ...over };
}
function buildRegistry(opts: { startOpen?: boolean } = {}) {
  return createRegistry({
    permissions: [menuPermission('equipment:view'), menuPermission('metrics:view')],
    spaces: [
      testSpace({ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, homeMenuId: 'cycle' }),
      testSpace({ id: spaceId('bravo'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, homeMenuId: 'catalog', permission: menuPermission('metrics:view') }),
      testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'roles', permission: 'console:access' }),
    ],
    groups: [
      { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: House, space: null },
      { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notices' }, icon: House, space: null },
      { id: groupId('analytics'), label: { ko: '사이클', en: 'Cycle' }, icon: House, space: spaceId('mars') },
      { id: groupId('metrics'), label: { ko: '지표', en: 'Metric' }, icon: Boxes, space: spaceId('bravo') },
      { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: Wrench, space: spaceId('operations') },
    ],
    menus: [
      menu('start', groupId('overview'), '/', '플랫폼 홈', { permission: opts.startOpen === false ? menuPermission('equipment:view') : 'notice:view' }),
      menu('notices', groupId('noticeVoc'), '/notices', '공지', { permission: 'notice:view' }),
      menu('alerts', groupId('myActivity'), '/alerts', '알림'),
      menu('cycle', groupId('analytics'), '/cycle', '사이클'),
      menu('catalog', groupId('metrics'), '/metrics', '카탈로그', { permission: menuPermission('metrics:view') }),
      menu('definitions', groupId('metrics'), '/metrics/definitions', '정의', { permission: menuPermission('metrics:view'), primary: false }),
      menu('roles', groupId('admin'), '/ops/roles', '권한', { permission: 'console:access' }),
    ],
  });
}

const SLOT: PlatformSlots = { plannedSpaces: [{ id: 'clas', label: { ko: 'CLAS', en: 'CLAS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, icon: Boxes }, { id: 'log', label: { ko: '표준 로그 개발', en: 'Log development' }, icon: Wrench }] };

function Page() {
  const { pageParam, setPage } = usePlatform();
  const [late, setLate] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setLate(true), 30); return () => clearTimeout(timer); }, []);
  return <PlatformPage>
    <p>body</p>
    {late && pageParam('focus') && <DetailDrawer title="Detail" onClose={() => setPage({ focus: null })} tabs={[{ id: 'a', label: 'A', content: 'content' }]} />}
  </PlatformPage>;
}
// A destination that resolves late (a lazy chunk): its title mounts only when the test calls resolveLazy(), never on a
// timer, so the order "reopen, then arrive" holds on a slow runner too (#668).
let lazyMenuId: string | null = null;
let resolveLazy: () => void = () => {};
function Slow() {
  const [ready, setReady] = useState(false);
  useEffect(() => { resolveLazy = () => setReady(true); return () => { resolveLazy = () => {}; }; }, []);
  return ready ? <Page /> : null;
}
function Routes() {
  const { route, can } = usePlatform();
  if (!route || !can(route.menu.permission)) return null;
  return route.menu.id === lazyMenuId ? <Slow key={route.menu.id} /> : <Page key={route.menu.id} />;
}

function mount({ permissions = ['platform:view', menuPermission('metrics:view'), 'console:access', 'notice:view'], url = '/cycle?v=1&scopeId=MEM', registry = buildRegistry(), slots = SLOT }: {
  permissions?: Permission[]; url?: string; registry?: ReturnType<typeof buildRegistry>; slots?: PlatformSlots;
} = {}) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={slots}><AppShell><Routes /></AppShell></PlatformProvider></I18nProvider>);
}

const trigger = () => screen.getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ });
function open() {
  fireEvent.click(trigger());
  return screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
}
const cardOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('localStorage', memoryStorage());
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  sessionStorage.clear();
});
afterEach(() => { lazyMenuId = null; resolveLazy = () => {}; cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('SystemSwitcher button (15 §3.2)', () => {
  it('names the button and its visible tooltip with the current system', async () => {
    mount();
    expect(trigger()).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('시스템 및 플랫폼 메뉴 · 현재: MARS');
  });

  it('drops the current system outside a space and keeps the button', async () => {
    mount({ url: '/?v=1' });
    expect(trigger()).toHaveAccessibleName('시스템 및 플랫폼 메뉴');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^시스템 및 플랫폼 메뉴$/);
  });

  it('has an English name', () => {
    localStorage.setItem('platform:lang', 'en');
    mount();
    expect(screen.getByRole('button', { name: 'Systems and platform menu · current: MARS' })).toBeTruthy();
  });
});

describe('SystemSwitcher popover', () => {
  it('focuses the current card on open, and the first card outside a space', () => {
    mount();
    open();
    expect(cardOf('MARS')).toHaveFocus();
    expect(cardOf('MARS')).toHaveAttribute('aria-current', 'true');
    expect(within(cardOf('MARS')).getByText('현재')).toBeTruthy();
    cleanup();
    mount({ url: '/?v=1' });
    open();
    expect(screen.getAllByRole('button', { name: /^(MARS|BRAVO|운영 콘솔)/ })[0]).toHaveFocus();
    expect(cardOf('MARS')).toHaveFocus();
    expect(screen.queryByRole('button', { name: /현재/ })).toBeNull();
  });

  it('writes 시작 for a system without a restored screen and 이어서 for one with', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ bravo: '/metrics/definitions?v=1' }));
    mount();
    open();
    expect(within(cardOf('MARS')).getByText('이어서: 사이클')).toBeTruthy();
    expect(within(cardOf('BRAVO')).getByText('이어서: 정의')).toBeTruthy();
    expect(within(cardOf('운영 콘솔')).getByText('시작: 권한')).toBeTruthy();
  });

  it('keeps registry order and shows only accessible systems', () => {
    mount({ permissions: ['platform:view', menuPermission('metrics:view')] });
    open();
    const names = within(screen.getByRole('dialog')).getAllByRole('button').map(button => button.textContent ?? '');
    expect(names.some(text => text.startsWith('운영 콘솔'))).toBe(false);
    expect(names.findIndex(text => text.startsWith('MARS'))).toBeLessThan(names.findIndex(text => text.startsWith('BRAVO')));
  });

  it('lists planned rows that are focusable, announce they are unavailable and never navigate', async () => {
    mount();
    const dialog = open();
    expect(within(dialog).getByText('준비 중')).toBeTruthy();
    const row = within(dialog).getByRole('button', { name: /표준 로그 개발/ });
    expect(within(row).getByText('아직 사용할 수 없습니다')).toBeTruthy();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    row.focus();
    expect(row).toHaveFocus();
    const before = window.location.href;
    fireEvent.click(row);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(window.location.href).toBe(before);
    expect(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeTruthy();
  });

  it('shows the subtitle on its own line in real and planned rows when declared, and not for a space without one', () => {
    mount();
    const dialog = open();
    expect(within(cardOf('MARS')).getByText('생산성 분석')).toBeTruthy();
    expect(within(cardOf('BRAVO')).getByText('지표관리')).toBeTruthy();
    expect(within(cardOf('운영 콘솔')).queryByText(/생산성 분석|지표관리/)).toBeNull();
    const clas = within(dialog).getByRole('button', { name: /^CLAS/ });
    expect(within(clas).getByText('생산성 분석')).toBeTruthy();
    expect(within(clas).getByText('아직 사용할 수 없습니다')).toBeTruthy();
    const logRow = within(dialog).getByRole('button', { name: /표준 로그 개발/ });
    expect(within(logRow).queryByText('생산성 분석')).toBeNull();
  });

  it('writes the English subtitle in English', () => {
    localStorage.setItem('platform:lang', 'en');
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Systems and platform menu/ }));
    expect(within(cardOf('MARS')).getByText('Productivity analysis')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^CLAS/ })).getByText('Productivity analysis')).toBeTruthy();
  });

  it('keeps the subtitle out of the trigger name, its tooltip and the current badge', async () => {
    mount();
    expect(trigger()).toHaveAccessibleName('시스템 및 플랫폼 메뉴 · 현재: MARS');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).not.toHaveTextContent('생산성 분석');
  });

  it('omits the planned area without the slot', () => {
    mount({ slots: {} });
    expect(within(open()).queryByText('준비 중')).toBeNull();
  });

  it('shows 홈 in the platform menu only when / can be opened', () => {
    mount();
    expect(within(within(open()).getByRole('navigation', { name: '플랫폼 메뉴' })).getByRole('link', { name: '홈' })).toBeTruthy();
    cleanup();
    mount({ permissions: ['platform:view', menuPermission('metrics:view'), 'console:access', 'notice:view'], registry: buildRegistry({ startOpen: false }) });
    expect(within(within(open()).getByRole('navigation', { name: '플랫폼 메뉴' })).queryByRole('link', { name: '홈' })).toBeNull();
    expect(screen.queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
  });

  it('lists the platform destinations in group order with 홈 first, none of them a system card', () => {
    mount();
    const dialog = open();
    const nav = within(dialog).getByRole('navigation', { name: '플랫폼 메뉴' });
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['홈', '알림', '공지']);
    expect(within(nav).queryAllByRole('button')).toHaveLength(0);
    expect(within(dialog).getByText('업무 시스템')).toBeTruthy();
    expect(dialog.querySelectorAll('[data-switcher-card]')).toHaveLength(3);
  });

  it('omits a platform destination whose permission is missing', () => {
    mount({ permissions: ['notice:view'], url: '/?v=1' });
    const nav = within(open()).getByRole('navigation', { name: '플랫폼 메뉴' });
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['홈', '공지']);
  });

  it('marks the current platform destination with aria-current', () => {
    mount({ url: '/alerts?v=1' });
    const nav = within(open()).getByRole('navigation', { name: '플랫폼 메뉴' });
    expect(within(nav).getByRole('link', { name: '알림' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });

  it('focuses the current card inside a space even with a platform section', () => {
    mount();
    open();
    expect(cardOf('MARS')).toHaveFocus();
  });

  it('with no accessible system, focuses the first platform link and states the empty case', () => {
    mount({ permissions: ['notice:view'], url: '/?v=1' });
    const dialog = open();
    expect(within(dialog).getByText('접근 가능한 업무 시스템이 없습니다')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /MARS/ })).toBeNull();
    expect(within(dialog).getByRole('link', { name: '홈' })).toHaveFocus();
    expect(within(dialog).getByRole('navigation', { name: '플랫폼 메뉴' })).toBeTruthy();
  });

  it('with no system and no platform destination, focuses the empty notice', () => {
    mount({ permissions: [], url: '/?v=1', registry: buildRegistry({ startOpen: false }) });
    const dialog = open();
    expect(within(dialog).queryByRole('link')).toBeNull();
    expect(within(dialog).getByText('접근 가능한 업무 시스템이 없습니다')).toHaveFocus();
  });

  it('shows one card and no hidden system for a single-system user', () => {
    mount({ permissions: ['platform:view'] });
    const dialog = open();
    expect(within(dialog).getAllByRole('button', { name: /^(MARS|BRAVO|운영 콘솔)/ })).toHaveLength(1);
    expect(within(dialog).queryByText(/운영 콘솔/)).toBeNull();
  });
});

describe('SystemSwitcher keyboard and focus (06 §26, ADR-0032)', () => {
  it('keeps Tab inside the popover in both directions', () => {
    mount();
    const dialog = open();
    const home = within(dialog).getAllByRole('link')[0]!;
    const last = within(dialog).getByRole('button', { name: /표준 로그 개발/ });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(home).toHaveFocus();
    fireEvent.keyDown(home, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  // jsdom does not turn Enter/Space on a button into a click; the browser does, so the test sends both.
  it.each([['Enter'], [' ']])('moves with %j on a card, closes first and leaves focus on the new title', async key => {
    mount();
    open();
    cardOf('BRAVO').focus();
    fireEvent.keyDown(document.activeElement!, { key });
    fireEvent.click(document.activeElement!);
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull();
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('follows the 홈 link of the platform menu, closes first and lands on the home title', async () => {
    mount();
    fireEvent.click(within(open()).getByRole('link', { name: '홈' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '플랫폼 홈' })).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull();
  });

  it('does nothing when the current card is chosen again, closes and returns to the button', async () => {
    mount();
    const push = vi.spyOn(window.history, 'pushState');
    open();
    fireEvent.click(cardOf('MARS'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cycle');
  });

  it('returns to the button on Escape, on an outside press and on pressing the button again', async () => {
    mount();
    fireEvent.keyDown(open(), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull();
    (document.activeElement as HTMLElement).blur();

    open();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    (document.activeElement as HTMLElement).blur();

    const button = trigger();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('starts every open fresh: a cancelled choice never leaks into the next open', async () => {
    mount();
    open();
    fireEvent.click(cardOf('BRAVO'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    const pushes = vi.spyOn(window.history, 'pushState');
    fireEvent.keyDown(open(), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(pushes).not.toHaveBeenCalled();
    open();
    expect(cardOf('BRAVO')).toHaveFocus();
    expect(cardOf('BRAVO')).toHaveAttribute('aria-current', 'true');
  });

  it('does not steal the title from a restored focus= detail that opens late, and leaves no tooltip', async () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ bravo: '/metrics?v=1&focus=entity' }));
    mount();
    open();
    fireEvent.click(cardOf('BRAVO'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    const title = await screen.findByRole('heading', { name: '카탈로그' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(await screen.findByRole('dialog', { name: 'Detail' })).toBeTruthy();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(title).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('SystemSwitcher focus ownership and lifecycle (ADR-0032)', () => {
  it.each([['back', -1], ['forward', 1]] as const)('keeps the new title focus when %s arrives while open', async (_name, step) => {
    mount();
    open();
    fireEvent.click(cardOf('BRAVO'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    if (step === 1) {
      window.history.back();
      await waitFor(() => expect(screen.getByRole('heading', { name: '사이클' })).toHaveFocus());
    }
    open();
    window.history.go(step === 1 ? 1 : -1);
    const arrival = step === 1 ? '카탈로그' : '사이클';
    await waitFor(() => expect(screen.getByRole('heading', { name: arrival })).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '시스템 및 플랫폼 메뉴' })).toBeNull();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.getByRole('heading', { name: arrival })).toHaveFocus();
    expect(trigger()).not.toHaveFocus();
  });

  it('lets a lazy arrival keep the title when the switcher is reopened before it resolves', async () => {
    lazyMenuId = 'catalog';
    mount();
    open();
    fireEvent.click(cardOf('BRAVO'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    open();
    expect(screen.queryByRole('heading', { name: '카탈로그', hidden: true })).toBeNull();
    act(() => resolveLazy());
    // Outside the modal popover the page is aria-hidden, so the title is found by the hidden option here.
    const title = await screen.findByRole('heading', { name: '카탈로그', hidden: true });
    expect(title).not.toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' }), { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    expect(trigger()).not.toHaveFocus();
  });

  it('runs a chosen card exactly once', async () => {
    mount();
    const push = vi.spyOn(window.history, 'pushState');
    open();
    fireEvent.click(cardOf('BRAVO'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('drops a queued card choice when the switcher unmounts before the close timers flush', async () => {
    const view = mount();
    const push = vi.spyOn(window.history, 'pushState');
    open();
    fireEvent.click(cardOf('BRAVO'));
    view.unmount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cycle');
  });

  it('drops a queued card choice when the Provider session is replaced before the close timers flush', async () => {
    window.history.replaceState(null, '', '/cycle?v=1&scopeId=MEM');
    let current = testSession(['platform:view', 'metrics:view', 'console:access', 'notice:view']);
    const listeners = new Set<() => void>();
    const adapter = testAdapter({ session: () => current, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={buildRegistry()} slots={SLOT}><AppShell><Routes /></AppShell></PlatformProvider></I18nProvider>);
    const push = vi.spyOn(window.history, 'pushState');
    open();
    fireEvent.click(cardOf('BRAVO'));
    current = testSession(['platform:view', 'metrics:view', 'console:access', 'notice:view']);
    act(() => { listeners.forEach(listener => listener()); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cycle');
  });
});


describe('notifications slot (ADR-0070 decision 4)', () => {
  let unread: number | null = 3;
  const slot = (): PlatformSlots => ({ ...SLOT, notifications: { menuId: 'alerts', UnreadCount: ({ children }) => <>{children(unread)}</>, Recent: () => <p>recent body</p> } });
  const bell = () => screen.getByRole('button', { name: /^알림/ });
  beforeEach(() => { unread = 3; });

  it('draws no bell without the slot', () => {
    mount();
    expect(screen.queryByRole('button', { name: /^알림/ })).toBeNull();
  });

  it.each([
    [null, '알림', null],
    [3, '알림, 읽지 않음 3건', '3'],
    [120, '알림, 읽지 않음 120건', '99+'],
  ] as const)('names the rail bell for %j unread', (count, name, pill) => {
    unread = count;
    mount({ slots: slot() });
    expect(bell()).toHaveAccessibleName(name);
    if (pill === null) expect(bell().textContent).toBe('');
    else expect(bell().textContent).toBe(pill);
  });

  it('opens with Enter, focuses the dialog, shows the header and body, and Esc returns focus to the bell', async () => {
    const user = userEvent.setup();
    mount({ slots: slot() });
    screen.getByRole('button', { name: /^메뉴 검색/ }).focus();
    await user.tab();
    if (document.activeElement !== bell()) await user.tab();
    expect(bell()).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: '알림' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole('heading', { name: '알림' }).parentElement).toHaveTextContent('읽지 않음 3');
    expect(within(dialog).getByText('recent body')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '알림' })).toBeNull());
    expect(bell()).toHaveFocus();
  });

  it.each([['/cycle?v=1&scopeId=MEM'], ['/alerts?v=1']])('모두 보기 from %s closes the popover and leaves focus with the destination', async url => {
    mount({ slots: slot(), url });
    fireEvent.click(bell());
    const dialog = await screen.findByRole('dialog', { name: '알림' });
    fireEvent.click(within(dialog).getByRole('link', { name: '모두 보기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '알림' })).toBeNull());
    expect(window.location.pathname).toBe('/alerts');
    if (url.startsWith('/cycle')) {
      await waitFor(() => expect(screen.getByRole('heading', { name: '알림' })).toHaveFocus());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      expect(screen.getByRole('heading', { name: '알림' })).toHaveFocus();
    } else {
      await waitFor(() => expect(bell()).toHaveFocus());
    }
  });

  it.each([[3, '알림, 읽지 않음 3건', '3'], [null, '알림', null]] as const)('badges the switcher link and the platform sidebar for %j unread', (count, name, pill) => {
    unread = count;
    mount({ slots: slot(), url: '/alerts?v=1' });
    const nav = within(open()).getByRole('navigation', { name: '플랫폼 메뉴' });
    const link = within(nav).getByRole('link', { name });
    if (pill !== null) expect(link).toHaveTextContent(pill);
    fireEvent.keyDown(screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' }), { key: 'Escape' });
    const sidebar = () => within(screen.getByRole('navigation', { name: '플랫폼 메뉴' })).getByRole('link', { name });
    expect(sidebar()).toHaveAttribute('aria-current', 'page');
    fireEvent.keyDown(document.body, { key: '[' });
    expect(sidebar()).toBeTruthy();
  });
});
