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
      testSpace({ id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, homeMenuId: 'cycle' }),
      testSpace({ id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, homeMenuId: 'catalog', permission: 'metrics:view' }),
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

const SLOT: PlatformSlots = { plannedSpaces: [{ id: 'log', label: { ko: '표준 로그 개발', en: 'Log development' }, icon: Wrench }] };

function Page() {
  const { pageParam, setPage } = usePlatform();
  const [late, setLate] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setLate(true), 30); return () => clearTimeout(timer); }, []);
  return <PlatformPage>
    <p>body</p>
    {late && pageParam('focus') && <DetailDrawer title="Detail" onClose={() => setPage({ focus: null })} tabs={[{ id: 'a', label: 'A', content: 'content' }]} />}
  </PlatformPage>;
}
function Routes() {
  const { route, can } = usePlatform();
  return route && can(route.menu.permission) ? <Page key={route.menu.id} /> : null;
}

function mount({ permissions = ['platform:view', 'metrics:view', 'console:access', 'notice:view'], url = '/cycle?v=1&scopeId=ICH', registry = buildRegistry(), slots = SLOT }: {
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('SystemSwitcher button (15 §3.2)', () => {
  it('names the button and its visible tooltip with the current system', async () => {
    mount();
    expect(trigger()).toHaveAccessibleName('업무 시스템 전환 · 현재: 생산성 분석');
    fireEvent.focus(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('업무 시스템 전환 · 현재: 생산성 분석');
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
    expect(screen.getByRole('button', { name: 'Switch business system · current: Productivity' })).toBeTruthy();
  });
});

describe('SystemSwitcher popover', () => {
  it('focuses the current card on open, and the first card outside a space', () => {
    mount();
    open();
    expect(cardOf('생산성 분석')).toHaveFocus();
    expect(cardOf('생산성 분석')).toHaveAttribute('aria-current', 'true');
    expect(within(cardOf('생산성 분석')).getByText('현재')).toBeTruthy();
    cleanup();
    mount({ url: '/?v=1' });
    open();
    expect(screen.getAllByRole('button', { name: /^(생산성 분석|지표관리|운영 콘솔)/ })[0]).toHaveFocus();
    expect(cardOf('생산성 분석')).toHaveFocus();
    expect(screen.queryByRole('button', { name: /현재/ })).toBeNull();
  });

  it('writes 시작 for a system without a restored screen and 이어서 for one with', () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics/definitions?v=1' }));
    mount();
    open();
    expect(within(cardOf('생산성 분석')).getByText('이어서: 사이클')).toBeTruthy();
    expect(within(cardOf('지표관리')).getByText('이어서: 정의')).toBeTruthy();
    expect(within(cardOf('운영 콘솔')).getByText('시작: 권한')).toBeTruthy();
  });

  it('keeps registry order and shows only accessible systems', () => {
    mount({ permissions: ['platform:view', 'metrics:view'] });
    open();
    const names = within(screen.getByRole('dialog')).getAllByRole('button').map(button => button.textContent ?? '');
    expect(names.some(text => text.startsWith('운영 콘솔'))).toBe(false);
    expect(names.findIndex(text => text.startsWith('생산성 분석'))).toBeLessThan(names.findIndex(text => text.startsWith('지표관리')));
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
    expect(within(dialog).queryByRole('button', { name: /생산성 분석/ })).toBeNull();
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
    expect(within(dialog).getAllByRole('button', { name: /^(생산성 분석|지표관리|운영 콘솔)/ })).toHaveLength(1);
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
    cardOf('지표관리').focus();
    fireEvent.keyDown(document.activeElement!, { key });
    fireEvent.click(document.activeElement!);
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: '업무 시스템 전환' })).toBeNull();
    expect(new URLSearchParams(window.location.search).get('scopeId')).toBe('ICH');
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
    fireEvent.click(cardOf('생산성 분석'));
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
    fireEvent.click(cardOf('지표관리'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '카탈로그' })).toHaveFocus());
    const pushes = vi.spyOn(window.history, 'pushState');
    fireEvent.keyDown(open(), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveFocus());
    expect(pushes).not.toHaveBeenCalled();
    open();
    expect(cardOf('지표관리')).toHaveFocus();
    expect(cardOf('지표관리')).toHaveAttribute('aria-current', 'true');
  });

  it('does not steal the title from a restored focus= detail that opens late, and leaves no tooltip', async () => {
    sessionStorage.setItem('platform:space-last:u1', JSON.stringify({ metrics: '/metrics?v=1&focus=entity' }));
    mount();
    open();
    fireEvent.click(cardOf('지표관리'));
    await waitFor(() => expect(window.location.pathname).toBe('/metrics'));
    const title = await screen.findByRole('heading', { name: '카탈로그' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(await screen.findByRole('dialog', { name: 'Detail' })).toBeTruthy();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(title).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
