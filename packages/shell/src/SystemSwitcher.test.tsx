import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes, House, Wrench } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupId, Permission } from '@ap/contracts';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type PlatformSlots } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from './AppShell';

function menu(id: string, group: GroupId, path: string, label: string, over: object = {}) {
  return { id, group, path, permission: 'platform:view' as const, primary: true, label: { ko: label, en: `${label}-en` }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'tab'], ...over };
}
function buildRegistry(opts: { startOpen?: boolean } = {}) {
  return createRegistry({
    spaces: [
      testSpace({ id: 'analytics', label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, homeMenuId: 'cycle' }),
      testSpace({ id: 'metrics', label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, homeMenuId: 'catalog', permission: 'metrics:view' }),
      testSpace({ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations' }, homeMenuId: 'roles', permission: 'console:access' }),
    ],
    groups: [
      { id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
      { id: 'analytics', label: { ko: '사이클', en: 'Cycle' }, icon: House, space: 'analytics' },
      { id: 'metrics', label: { ko: '지표', en: 'Metric' }, icon: Boxes, space: 'metrics' },
      { id: 'admin', label: { ko: '관리', en: 'Admin' }, icon: Wrench, space: 'operations' },
    ],
    menus: [
      menu('start', 'overview', '/', '플랫폼 홈', { permission: opts.startOpen === false ? 'equipment:view' : 'notice:view' }),
      menu('cycle', 'analytics', '/cycle', '사이클'),
      menu('catalog', 'metrics', '/metrics', '카탈로그', { permission: 'metrics:view' }),
      menu('definitions', 'metrics', '/metrics/definitions', '정의', { permission: 'metrics:view', primary: false }),
      menu('roles', 'admin', '/ops/roles', '권한', { permission: 'console:access' }),
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
// A destination that resolves late (a lazy chunk): its title only mounts after `lazyDelay` ms.
let lazyMenuId: string | null = null;
function Slow() {
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 60); return () => clearTimeout(timer); }, []);
  return ready ? <Page /> : null;
}
function Routes() {
  const { route, can } = usePlatform();
  if (!route || !can(route.menu.permission)) return null;
  return route.menu.id === lazyMenuId ? <Slow key={route.menu.id} /> : <Page key={route.menu.id} />;
}

function mount({ permissions = ['platform:view', 'metrics:view', 'console:access', 'notice:view'], url = '/cycle?v=1&scopeId=MEM', registry = buildRegistry(), slots = SLOT }: {
  permissions?: Permission[]; url?: string; registry?: ReturnType<typeof buildRegistry>; slots?: PlatformSlots;
} = {}) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={slots}><AppShell><Routes /></AppShell></PlatformProvider></I18nProvider>);
}

const trigger = () => screen.getByRole('button', { name: /^업무 시스템 전환/ });
function open() {
  fireEvent.click(trigger());
  return screen.getByRole('dialog', { name: '업무 시스템 전환' });
}
const cardOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  const local = new Map<string, string>();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('localStorage', { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value), removeItem: (key: string) => local.delete(key), clear: () => local.clear() });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  sessionStorage.clear();
});
afterEach(() => { lazyMenuId = null; cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('SystemSwitcher button (15 §3.2)', () => {
  it('names the button and its visible tooltip with the current system', async () => {
    mount();
    expect(trigger()).toHaveAccessibleName('업무 시스템 전환 · 현재: MARS');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('업무 시스템 전환 · 현재: MARS');
  });

  it('drops the current system outside a space and keeps the button', async () => {
    mount({ url: '/?v=1' });
    expect(trigger()).toHaveAccessibleName('업무 시스템 전환');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^업무 시스템 전환$/);
  });

  it('has an English name', () => {
    localStorage.setItem('platform:lang', 'en');
    mount();
    expect(screen.getByRole('button', { name: 'Switch business system · current: MARS' })).toBeTruthy();
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
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics/definitions?v=1' }));
    mount();
    open();
    expect(within(cardOf('MARS')).getByText('이어서: 사이클')).toBeTruthy();
    expect(within(cardOf('BRAVO')).getByText('이어서: 정의')).toBeTruthy();
    expect(within(cardOf('운영 콘솔')).getByText('시작: 권한')).toBeTruthy();
  });

  it('keeps registry order and shows only accessible systems', () => {
    mount({ permissions: ['platform:view', 'metrics:view'] });
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
    expect(screen.getByRole('dialog', { name: '업무 시스템 전환' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: /^Switch business system/ }));
    expect(within(cardOf('MARS')).getByText('Productivity analysis')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^CLAS/ })).getByText('Productivity analysis')).toBeTruthy();
  });

  it('keeps the subtitle out of the trigger name, its tooltip and the current badge', async () => {
    mount();
    expect(trigger()).toHaveAccessibleName('업무 시스템 전환 · 현재: MARS');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).not.toHaveTextContent('생산성 분석');
  });

  it('omits the planned area without the slot', () => {
    mount({ slots: {} });
    expect(within(open()).queryByText('준비 중')).toBeNull();
  });

  it('shows the platform home only when / can be opened', () => {
    mount();
    expect(within(open()).getByRole('link', { name: '플랫폼 홈' })).toBeTruthy();
    cleanup();
    mount({ permissions: ['platform:view', 'metrics:view', 'console:access', 'notice:view'], registry: buildRegistry({ startOpen: false }) });
    expect(within(open()).queryByRole('link', { name: '플랫폼 홈' })).toBeNull();
  });

  it('with no accessible system, focuses the home link and states the empty case', () => {
    mount({ permissions: ['notice:view'], url: '/?v=1' });
    const dialog = open();
    expect(within(dialog).getByText('접근 가능한 업무 시스템이 없습니다')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /MARS/ })).toBeNull();
    expect(within(dialog).getByRole('link', { name: '플랫폼 홈' })).toHaveFocus();
  });

  it('with no system and no home, focuses the empty notice', () => {
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
    const home = within(dialog).getByRole('link', { name: '플랫폼 홈' });
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
    expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull();
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('MEM');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('follows the platform home link and lands on the home title', async () => {
    mount();
    fireEvent.click(within(open()).getByRole('link', { name: '플랫폼 홈' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '플랫폼 홈' })).toHaveFocus());
  });

  it('does nothing when the current card is chosen again, closes and returns to the button', async () => {
    mount();
    const push = vi.spyOn(window.history, 'pushState');
    open();
    fireEvent.click(cardOf('MARS'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/cycle');
  });

  it('returns to the button on Escape, on an outside press and on pressing the button again', async () => {
    mount();
    fireEvent.keyDown(open(), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull();
    (document.activeElement as HTMLElement).blur();

    open();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull());
    await waitFor(() => expect(trigger()).toHaveFocus());
    (document.activeElement as HTMLElement).blur();

    const button = trigger();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '업무 시스템 전환' })).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull());
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
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics?v=1&focus=entity' }));
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
    expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull();
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
    // Outside the modal popover the page is aria-hidden, so the title is found by the hidden option here.
    const title = await screen.findByRole('heading', { name: '카탈로그', hidden: true });
    expect(title).not.toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '업무 시스템 전환' }), { key: 'Escape' });
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

