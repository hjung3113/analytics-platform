import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import { GlobalContextBar } from '../GlobalContextBar';

const menu = (id: string, over: { context: typeof noContext; query?: { mode: 'apply'; required: { context: ['time'] } } }) => ({
  id, group: groupId('overview'), primary: id === 'live', label: { ko: id, en: id }, description: { ko: '', en: '' }, path: `/${id}`, icon: House, permission: 'platform:view' as const,
  requiresScope: false, pageType: 'analysis' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['grain'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'live' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [
    menu('live', { context: { ...noContext, time: 'apply', roomNames: 'apply' } }),
    menu('query', { context: { ...noContext, time: 'apply', roomNames: 'apply' }, query: { mode: 'apply', required: { context: ['time'] } } }),
  ],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', scopeId: 'MEM', grantedRooms: ['PHOTO'] }) });
let platform: ReturnType<typeof useHostPlatform>;
function Probe() {
  platform = useHostPlatform();
  const toasts = useToastsForTest();
  return <ul data-testid="toasts">{toasts.map(toast => <li key={toast.id}>{toast.tone}:{toast.text}</li>)}</ul>;
}
const SUCCESS_CONDITIONS = '현재 적용된 조건의 링크를 복사했습니다. 편집 중인 변경은 제외됩니다.';
const SUCCESS_MENU = '조건 없는 메뉴 주소를 복사했습니다.';
const toasts = () => screen.getByTestId('toasts').textContent ?? '';

function mount(path: string) {
  window.history.replaceState(null, '', path);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Probe /><GlobalContextBar /></PlatformProvider></I18nProvider>);
}
function clipboard(write: (text: string) => Promise<void>) {
  const writeText = vi.fn(write);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}
const main = () => screen.getByRole('button', { name: '현재 조건 공유' });
const chevron = () => screen.getByRole('button', { name: '링크 복사 방식 선택' });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  localStorage.setItem('platform:lang', 'ko');
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'isSecureContext'); Reflect.deleteProperty(navigator, 'clipboard');
});

describe.each([
  ['live bar', '/mars/live'],
  ['query bar', '/mars/query'],
])('ShareControl in the %s', (_name, path) => {
  const url = `${path}?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&grain=day&returnTo=%2Forigin&variant=b&x=1`;

  it('is a named group with the exact button names, and the main button is described by the applied-only rule', () => {
    mount(url);
    const group = screen.getByRole('group', { name: '링크 복사' });
    expect(within(group).getByRole('button', { name: '현재 조건 공유' })).toHaveTextContent('현재 조건 공유');
    expect(main()).toHaveAccessibleDescription('적용된 조건의 링크를 복사합니다. 편집 중인 변경은 제외합니다.');
    expect(within(group).getByRole('button', { name: '링크 복사 방식 선택' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '링크 복사' })).toBeNull();
  });

  it('main button copies the applied conditions without returnTo/variant/extras; success only after the write', async () => {
    let release: (() => void) | undefined;
    const writeText = clipboard(() => new Promise<void>(resolve => { release = resolve; }));
    mount(url);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    fireEvent.click(main());
    expect(writeText).toHaveBeenCalledTimes(1);
    fireEvent.click(main()); // duplicate activation while pending
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toasts()).toBe('');
    const written = new URL(String(writeText.mock.calls[0]?.[0]));
    expect(written.pathname).toBe(path);
    expect(written.searchParams.get('v')).toBe('1');
    expect(written.searchParams.get('grain')).toBe('day');
    expect(written.searchParams.get('scopeId')).toBe('MEM');
    for (const key of ['returnTo', 'variant', 'x']) expect(written.searchParams.has(key)).toBe(false);
    act(() => release?.());
    await waitFor(() => expect(toasts()).toContain(`info:${SUCCESS_CONDITIONS}`));
    expect(main()).not.toHaveAttribute('aria-disabled');
  });

  it('menu item copies the bare path and says so; the main button is not changed to the last choice', async () => {
    const user = userEvent.setup();
    const writeText = clipboard(async () => {});
        mount(url);
    await user.click(chevron());
    const items = screen.getAllByRole('menuitem');
    expect(items.map(item => item.textContent)).toEqual([
      '현재 조건 공유적용된 조건의 링크를 복사합니다. 편집 중인 변경은 제외합니다.',
      '메뉴 주소 복사조건 없이 메뉴 주소만 복사합니다.',
    ]);
    await user.click(screen.getByRole('menuitem', { name: '메뉴 주소 복사' }));
    await waitFor(() => expect(toasts()).toContain(`info:${SUCCESS_MENU}`));
    expect(writeText).toHaveBeenCalledWith(window.location.origin + path);
    expect(main()).toHaveTextContent('현재 조건 공유');
  });

  it('keyboard: Enter/Space on the chevron opens without copying, arrows + Enter select once, Escape closes to the chevron without copying', async () => {
    const user = userEvent.setup();
    const writeText = clipboard(async () => {});
        mount(url);
    chevron().focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeVisible();
    expect(writeText).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(chevron()).toHaveFocus();
    expect(writeText).not.toHaveBeenCalled();
    await user.keyboard(' ');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0]?.[0])).not.toContain('?');
    main().focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it('a refused write shows the intent-specific failure, the exact link in a read-only field and a retry — never the address-bar advice', async () => {
    const writeText = clipboard(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    mount(url);
    fireEvent.click(main());
    const field = await screen.findByRole('textbox', { name: '복사할 링크' });
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveValue(String(writeText.mock.calls[0]?.[0]));
    expect(toasts()).toContain('warning:현재 조건 링크를 복사하지 못했습니다.');
    expect(toasts()).not.toContain('주소창');
    expect(toasts()).not.toContain(SUCCESS_CONDITIONS);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it('Retry copies the retained link A, never a rebuilt B, and the field always equals what is copied', async () => {
    const writeText = clipboard(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    mount(url);
    fireEvent.click(main());
    const field = await screen.findByRole('textbox', { name: '복사할 링크' });
    const linkA = String(writeText.mock.calls[0]?.[0]);
    expect(field).toHaveValue(linkA);
    act(() => { window.history.pushState(null, '', url.replace('grain=day', 'grain=week')); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '복사할 링크' })).toBeNull());
    for (const call of writeText.mock.calls) expect(String(call[0])).toBe(linkA);
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('Retry on an unchanged state writes exactly the retained link', async () => {
    const writeText = clipboard(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    mount(url);
    fireEvent.click(main());
    const field = await screen.findByRole('textbox', { name: '복사할 링크' });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1]?.[0]).toBe(writeText.mock.calls[0]?.[0]);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '복사할 링크' })).toHaveValue(String(writeText.mock.calls[1]?.[0])));
    expect(field).toBeDefined();
  });

  it('closing the failure overlay returns focus to the initiating control (Escape, Close, Retry; main and chevron)', async () => {
    const user = userEvent.setup();
    clipboard(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    mount(url);
    fireEvent.click(main());
    await screen.findByRole('textbox', { name: '복사할 링크' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(main()).toHaveFocus());
    fireEvent.click(main());
    await screen.findByRole('textbox', { name: '복사할 링크' });
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(main()).toHaveFocus());
    await user.click(chevron());
    await user.click(screen.getByRole('menuitem', { name: '메뉴 주소 복사' }));
    await screen.findByRole('textbox', { name: '복사할 링크' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(chevron()).toHaveFocus());
    await user.click(chevron());
    await user.click(screen.getByRole('menuitem', { name: '메뉴 주소 복사' }));
    await screen.findByRole('textbox', { name: '복사할 링크' });
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(chevron()).toHaveFocus());
  });

  it('a completed Retry returns focus to the initiating control', async () => {
    const user = userEvent.setup();
    let fail = true;
    clipboard(async () => { if (fail) throw new DOMException('denied', 'NotAllowedError'); });
    mount(url);
    fireEvent.click(main());
    await screen.findByRole('textbox', { name: '복사할 링크' });
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '복사할 링크' })).toBeNull());
    await waitFor(() => expect(main()).toHaveFocus());
  });

  it('a refused menu write names the menu intent and offers the bare address', async () => {
    const user = userEvent.setup();
    clipboard(async () => { throw new Error('denied'); });
        mount(url);
    await user.click(chevron());
    await user.click(screen.getByRole('menuitem', { name: '메뉴 주소 복사' }));
    expect(await screen.findByRole('textbox', { name: '복사할 링크' })).toHaveValue(window.location.origin + path);
    expect(toasts()).toContain('warning:메뉴 주소를 복사하지 못했습니다.');
  });

  it('an over-long conditions link is refused: message, no write, no link field, menu copy still works', async () => {
    const user = userEvent.setup();
    const writeText = clipboard(async () => {});
    const ids = Array.from({ length: 700 }, (_, index) => `EQP-${String(index).padStart(5, '0')}`).join(',');
        mount(`${path}?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&selectedEquipmentIds=${ids}`);
    fireEvent.click(main());
    await waitFor(() => expect(toasts()).toContain('warning:조건 링크가 너무 길어 복사하지 못했습니다. 조건을 줄인 뒤 다시 시도하세요.'));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '복사할 링크' })).toBeNull();
    expect(toasts()).not.toContain('info:');
    await user.click(chevron());
    await user.click(screen.getByRole('menuitem', { name: '메뉴 주소 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });
});

describe('QueryBar sharing', () => {
  it('copies the applied state only while the draft has unapplied changes, and says so in the status slot', async () => {
    const writeText = clipboard(async () => {});
    mount('/mars/query?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
    expect(screen.getByText(/^미적용 변경 \d+개 · 공유에서 제외$/)).toBeVisible();
    fireEvent.click(main());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const written = new URL(String(writeText.mock.calls[0]?.[0]));
    expect(written.searchParams.get('from')).toBe('2026-09-25T09:00:00');
    expect(written.searchParams.get('to')).toBe('2026-09-26T09:00:00');
  });

  it('says the query was never applied and shares only the actual applied state', async () => {
    const writeText = clipboard(async () => {});
    mount('/mars/query?v=1&scopeId=MEM');
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(screen.getByText('아직 조회 조건을 적용하지 않았습니다.')).toBeVisible();
    fireEvent.click(main());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(new URL(String(writeText.mock.calls[0]?.[0])).searchParams.has('from')).toBe(false);
  });
});
