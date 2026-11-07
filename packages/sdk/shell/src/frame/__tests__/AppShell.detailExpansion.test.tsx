import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useUnsavedGuard, type VocComposeProps } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { AppShell } from '../AppShell';
import { buildShareLink } from '../../context/shareLink';

const group = { id: groupId('overview'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') };
const registry = createRegistry({ spaces: [testSpace()], groups: [group], menus: [{ id: 'home', primary: true, group: group.id, label: { ko: '화면', en: 'Screen' }, description: { ko: '', en: '' }, path: '/mars/home', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, compare: false, annotate: false, board: true }, pageKeys: ['focus'] }] });
const session = testSession(['platform:view']);
let host: ReturnType<typeof useHostPlatform>;
function Editor() {
  host = useHostPlatform(); const [draft, setDraft] = useState(''); const [late, setLate] = useState(false);
  useUnsavedGuard(draft !== '', { leaves: 'address' });
  const open = host.pageParam('focus') !== null || late;
  return <PlatformPage primaryAction={<button onClick={() => setLate(true)}>상세 열기</button>}><button>본문 동작</button>{open && <DetailDrawer title="편집 상세" onClose={() => { setLate(false); host.setPage({ focus: null }); }} tabs={[{ id: 'one', label: '상세', content: <input aria-label="상세 입력" value={draft} onChange={event => setDraft(event.target.value)} /> }]} />}</PlatformPage>;
}
function Compose(props: VocComposeProps) { const [value, setValue] = useState(''); return <><input aria-label="VOC 입력" value={value} onChange={e => { setValue(e.target.value); props.onDirtyChange(e.target.value !== ''); }} /><button onClick={props.onCancel}>작성 취소</button></>; }
const slots = { vocCompose: { Compose } };
const paneChange = vi.fn();
function mount(url: string, pane = false) {
  history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} slots={slots}><AppShell>{pane ? <PaneScreenProvider paneId="p" screen={{ menuId: 'home', params: {}, query: '?v=1&focus=x' }} onChange={paneChange} onLeave={() => {}}><Editor /></PaneScreenProvider> : <Editor />}</AppShell></PlatformProvider></I18nProvider>);
}
const key = () => new URLSearchParams(location.search).get('expand');
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); paneChange.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('restores a late detail without clearing the leftover key or focusing the toggle; only the covered body becomes inert', () => {
  mount('/mars/home?v=1&expand=1');
  const body = document.querySelector('[data-platform-page-body]')!;
  expect(key()).toBe('1'); expect(body.hasAttribute('inert')).toBe(false);
  const heading = screen.getByRole('heading', { name: '화면' }); act(() => heading.focus());
  fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBeTruthy(); expect(body.hasAttribute('inert')).toBe(true);
  expect(screen.getByRole('button', { name: '원래 크기로' })).not.toHaveFocus(); expect(heading.closest('[inert]')).toBeNull(); expect(screen.getByRole('navigation', { name: '시스템 레일' }).closest('[inert]')).toBeNull();
});
it('reloads expanded and retains input through collapse; Escape then uses the existing Kernel discard guard', async () => {
  mount('/mars/home?v=1&focus=x&expand=1');
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBeTruthy();
  const input = screen.getByRole('textbox', { name: '상세 입력' }); fireEvent.change(input, { target: { value: 'unsaved' } });
  fireEvent.keyDown(input, { key: 'Escape' }); expect(key()).toBeNull(); expect(screen.queryByRole('alertdialog')).toBeNull();
  fireEvent.keyDown(input, { key: 'Escape' }); expect(await screen.findByRole('alertdialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '머무르기' })); expect(screen.getByLabelText('상세 입력')).toBe(input); expect(input).toHaveValue('unsaved');
});
it('VOC uses the same expansion, preserves its input node, and never attaches the platform key as Context', () => {
  mount('/mars/home?v=1&expand=1');
  fireEvent.click(screen.getByRole('button', { name: /^VOC 등록/ }));
  const drawer = screen.getByRole('complementary', { name: 'VOC 등록' }); const ui = within(drawer);
  const input = ui.getByLabelText('VOC 입력'); fireEvent.change(input, { target: { value: 'draft' } });
  const toggle = ui.getByRole('button', { name: '원래 크기로' }); act(() => toggle.focus()); fireEvent.click(toggle);
  expect(key()).toBeNull(); fireEvent.click(ui.getByRole('button', { name: '크게 보기' })); expect(key()).toBe('1'); expect(toggle).toHaveFocus();
  expect(ui.getByLabelText('VOC 입력')).toBe(input); expect(input).toHaveValue('draft');
  expect(ui.getByRole('region', { name: '첨부할 화면 정보' }).textContent).not.toContain('expand');
  const link = buildShareLink({ kind: 'conditions', route: host.route, global: host.global, page: host.page, absoluteUrl: host.absoluteUrl });
  expect(JSON.stringify(link)).not.toContain('expand');
  fireEvent.keyDown(input, { key: 'Escape' }); expect(key()).toBeNull();
  fireEvent.keyDown(input, { key: 'Escape' }); expect(ui.getByRole('alert')).toBeTruthy();
});
it('clears the URL key only when an open expanded surface closes', () => {
  mount('/mars/home?v=1&focus=x&expand=1');
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' })); expect(key()).toBeNull();
});
it.each(['/board?sheet=s', '/mars/home?v=1'])('pane expansion stays in memory without a pane query or board store write (%s)', url => {
  mount(url, true);
  const storage = vi.spyOn(localStorage, 'setItem'); const before = location.href;
  fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBeTruthy(); expect(location.href).toBe(before);
  expect(paneChange).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
});

it('measures the real sticky header and updates the content-region geometry after resize', () => {
  let bottom = 62;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-board-window-area')) return { left: 292, top: 0, right: 1440, bottom: 900, width: 1148, height: 900, x: 292, y: 0, toJSON() {} };
    return { left: 292, top: 0, right: 1440, bottom, width: 1148, height: bottom, x: 292, y: 0, toJSON() {} };
  });
  mount('/mars/home?v=1&focus=x&expand=1');
  const detail = screen.getByRole('complementary', { name: '상세 패널' });
  expect(detail.style.getPropertyValue('--detail-left')).toBe('292px');
  expect(detail.style.getPropertyValue('--detail-width')).toBe('1148px');
  expect(detail.style.getPropertyValue('--detail-top')).toBe('62px');
  expect(detail.style.getPropertyValue('--detail-height')).toBe('838px');
  bottom = 80; act(() => window.dispatchEvent(new Event('resize')));
  expect(detail.style.getPropertyValue('--detail-top')).toBe('80px');
  expect(detail.style.getPropertyValue('--detail-height')).toBe('820px');
});

function BodyOpener() {
  const [open, setOpen] = useState(false);
  return <PlatformPage><button onClick={() => setOpen(true)}>본문 열기</button>{open && <DetailDrawer title="본문 상세" onClose={() => setOpen(false)} tabs={[{ id: 'one', label: '상세', content: <p>내용</p> }]} />}</PlatformPage>;
}
it('on the board the VOC drawer alone expands and collapses in memory, and closing it leaves no latent expansion for the next surface', () => {
  history.replaceState(null, '', '/board?sheet=s'); const before = location.href;
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} slots={slots}><AppShell><p>board</p></AppShell></PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^VOC 등록/ }));
  const ui = within(screen.getByRole('complementary', { name: 'VOC 등록' }));
  const input = ui.getByLabelText('VOC 입력');
  fireEvent.click(ui.getByRole('button', { name: '크게 보기' }));
  expect(ui.getByRole('button', { name: '원래 크기로' })).toBeTruthy(); expect(ui.getByLabelText('VOC 입력')).toBe(input);
  fireEvent.click(ui.getByRole('button', { name: '원래 크기로' })); expect(ui.getByRole('button', { name: '크게 보기' })).toBeTruthy();
  fireEvent.click(ui.getByRole('button', { name: '크게 보기' })); fireEvent.click(ui.getByRole('button', { name: '작성 취소' }));
  fireEvent.click(screen.getByRole('button', { name: /^VOC 등록/ }));
  expect(within(screen.getByRole('complementary', { name: 'VOC 등록' })).getByRole('button', { name: '크게 보기' })).toBeTruthy();
  expect(location.href).toBe(before);
});
it('closing an expanded detail directly returns focus to its body opener once the body is usable again', async () => {
  // Let the previous test's dialog focus-return timers (they look up #platform-main in the live document) run before this mount.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  vi.useFakeTimers();
  try {
    history.replaceState(null, '', '/mars/home?v=1');
    render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} slots={slots}><AppShell><BodyOpener /></AppShell></PlatformProvider></I18nProvider>);
    const opener = screen.getByRole('button', { name: '본문 열기' }); act(() => opener.focus());
    fireEvent.click(opener); fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
    expect(document.querySelector('[data-platform-page-body]')!.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(document.querySelector('[data-platform-page-body]')!.hasAttribute('inert')).toBe(false);
    expect(opener).toHaveFocus();
  } finally { vi.useRealTimers(); }
});
