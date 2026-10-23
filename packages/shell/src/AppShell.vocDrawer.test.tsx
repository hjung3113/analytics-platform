import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots, type VocComposeProps } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Popover, PopoverContent, PopoverTrigger, useDetailPanelContent } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import type { Session } from '@ap/contracts';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from './AppShell';

const menu = (id: string, label: string, path: string, pageKeys: string[]) => ({
  id, group: groupId('overview'), primary: id === 'home', label: { ko: label, en: label }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys,
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [menu('home', '홈', '/', ['focus', 'granularity', 'q']), menu('other', '다른 화면', '/other', [])],
});

/** Every props object the fake Compose rendered with, and how often it mounted. */
const seen: { props: VocComposeProps[]; mounts: number } = { props: [], mounts: 0 };
const last = () => seen.props.at(-1)!;
function FakeCompose(props: VocComposeProps) {
  const [text, setText] = useState('');
  useEffect(() => { seen.mounts += 1; }, []);
  seen.props.push(props);
  return <div>
    <input aria-label="내용" value={text} onChange={event => { setText(event.target.value); props.onDirtyChange(event.target.value !== ''); }} />
    <input aria-label="Esc를 막는 입력" onKeyDown={event => { if (event.key === 'Escape') event.preventDefault(); }} />
    <button type="button" onClick={props.onCancel}>작성 취소</button>
    <button type="button" onClick={() => props.onSubmitted({ vocId: 'v1', displayId: 'VOC-1' })}>제출</button>
    {createPortal(<button type="button">떠 있는 선택지</button>, document.body)}
  </div>;
}
const SLOTS: PlatformSlots = { vocCompose: { Compose: FakeCompose } };

/** A screen whose detail passes a fresh node on every render, like ModuleScreen/PageShell (the activation rule must ignore it). */
function Screen() {
  const { pageParam, setPage, navigate } = useHostPlatform();
  const [second, setSecond] = useState(false);
  const [typed, setTyped] = useState('');
  useDetailPanelContent(pageParam('focus') ? <p>상세 본문</p> : undefined);
  return <>
    <button type="button" onClick={() => setPage({ focus: 'E-9' })}>상세 열기</button>
    <button type="button" onClick={() => navigate('/other?v=1')}>다른 화면으로</button>
    <button type="button" onClick={() => setSecond(true)}>다른 상세 등록</button>
    {second && <SecondDetail />}
    <input aria-label="본문 입력" value={typed} onChange={event => setTyped(event.target.value)} />
  </>;
}
function SecondDetail() { useDetailPanelContent(<p>다른 상세 본문</p>); return null; }

function mount(url = '/?v=1&granularity=day&q=x&scopeId=MEM', slots: PlatformSlots = SLOTS, reg = registry) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={reg} slots={slots}>
    <AppShell><Screen /></AppShell>
  </PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  seen.props = []; seen.mounts = 0;
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const rail = () => within(screen.getByRole('navigation', { name: '앱 레일' }));
const railButton = () => rail().getByRole('button', { name: /^VOC 등록/ });
const drawer = () => document.querySelector<HTMLElement>('aside[aria-label="VOC 등록"]')!;
const detailAside = () => document.querySelector<HTMLElement>('aside[aria-label="상세 패널"]')!;
const heading = () => within(drawer()).getByRole('heading', { name: 'VOC 등록' });
const openDrawer = () => fireEvent.click(railButton());
const makeDirty = async () => { await userEvent.setup().type(within(drawer()).getByLabelText('내용'), 'a'); };
const urlKeys = () => new URLSearchParams(window.location.search);
const CONFIRM = '작성 중인 내용을 버릴까요?';

describe('rail button (S3)', () => {
  it('draws no button without the slot', () => {
    mount('/?v=1', {});
    expect(rail().queryByRole('button', { name: /^VOC 등록/ })).toBeNull();
    expect(drawer()).toBeNull();
  });

  it('sits between the analysis board and the bell in DOM order and toggles aria-expanded', () => {
    const boardMenu = { ...menu('home', '홈', '/', ['focus', 'granularity', 'q']), features: { export: false, savedView: false, annotate: false, compare: false, board: true } };
    const withBell = createRegistry({
      spaces: [testSpace({ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
      groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
      menus: [boardMenu, menu('alerts', '알림', '/alerts', [])],
    });
    mount('/?v=1', { ...SLOTS, notifications: { menuId: 'alerts', UnreadCount: ({ children }) => <>{children(0)}</>, Recent: () => <p>recent body</p> } }, withBell);
    const names = rail().getAllByRole('button').map(button => button.getAttribute('aria-label'));
    expect(names).toEqual(expect.arrayContaining(['분석 보드', 'VOC 등록', '알림']));
    expect(names.indexOf('분석 보드')).toBeLessThan(names.indexOf('VOC 등록'));
    expect(names.indexOf('VOC 등록')).toBeLessThan(names.indexOf('알림'));
    expect(railButton()).toHaveAttribute('aria-expanded', 'false');
    expect(railButton()).toHaveAttribute('aria-controls', drawer().id);
    openDrawer();
    expect(railButton()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(railButton());
    expect(railButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('is named 작성 중 with a dot while a dirty draft is hidden', async () => {
    mount();
    openDrawer();
    await makeDirty();
    expect(railButton()).toHaveAccessibleName('VOC 등록');
    fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    expect(drawer().hidden).toBe(true);
    expect(railButton()).toHaveAccessibleName('VOC 등록 (작성 중)');
    expect(railButton().querySelector('[data-draft-dot]')).not.toBeNull();
  });
});

describe('chips and the frozen Context (S2, S4)', () => {
  it('removing chips drops them from items and from the attached address, which is built from the frozen Context', async () => {
    mount('/?v=1&granularity=day&q=x&scopeId=MEM&selectedEquipmentIds=e1&selectedEquipmentIds=e2');
    fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    expect(urlKeys().get('focus')).toBe('E-9');
    openDrawer();
    expect(last().context.items.map(item => item.id)).toEqual(expect.arrayContaining(['menu', 'page:focus', 'page:q', 'global:selection']));
    // The live URL moves on after the freeze; the address must still come from the frozen Context.
    fireEvent.click(within(drawer()).getByRole('button', { name: 'q: x 제거' }));
    fireEvent.click(screen.getByRole('button', { name: '다른 화면으로' }));
    fireEvent.click(within(drawer()).getByRole('button', { name: '상세: E-9 제거' }));
    fireEvent.click(within(drawer()).getByRole('button', { name: '설비 선택: e1, e2 제거' }));
    const { items, href } = last().context;
    const removedIds = new Set(['page:focus', 'page:q', 'global:selection']);
    expect(items.some(item => removedIds.has(item.id))).toBe(false);
    const params = new URL(href!).searchParams;
    expect([params.has('focus'), params.has('q'), params.has('selectedEquipmentIds')]).toEqual([false, false, false]);
    expect(new URL(href!).pathname).toBe('/');
    expect([params.get('granularity'), params.get('scopeId')]).toEqual(['day', 'MEM']);
  });

  it('keeps the frozen Context across navigation while open, and refreezes after a clean close', () => {
    mount();
    openDrawer();
    const frozen = last().context;
    fireEvent.click(screen.getByRole('button', { name: '다른 화면으로' }));
    expect(window.location.pathname).toBe('/other');
    expect(last().context).toEqual(frozen);
    fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }));
    openDrawer();
    expect(last().context.items[0]).toEqual({ id: 'menu', label: '화면', value: '분석 · 다른 화면' });
    expect(new URL(last().context.href!).pathname).toBe('/other');
  });

  it('keeps one Compose instance and its Context while the detail takes the position and the drawer comes back', async () => {
    mount();
    openDrawer();
    const frozen = last().context;
    await makeDirty();
    fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '다른 화면으로' }));
    openDrawer();
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
    expect(seen.mounts).toBe(1);
    expect(last().context).toEqual(frozen);
  });
});

describe('one right panel (S5, S9)', () => {
  it('opening the drawer hides the detail and keeps focus in the URL; closing shows the detail again', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    expect(detailAside().hidden).toBe(false);
    openDrawer();
    expect(detailAside().hidden).toBe(true);
    expect(drawer().hidden).toBe(false);
    expect(urlKeys().get('focus')).toBe('E-9');
    fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }));
    expect(drawer().hidden).toBe(true);
    expect(detailAside().hidden).toBe(false);
    expect(within(detailAside()).getByText('상세 본문')).toBeTruthy();
  });

  it('a newly registered detail hides the drawer with the draft kept, and the rail button brings it back', async () => {
    mount();
    openDrawer();
    await makeDirty();
    fireEvent.click(screen.getByRole('button', { name: '다른 상세 등록' }));
    expect(drawer().hidden).toBe(true);
    expect(detailAside().hidden).toBe(false);
    expect(within(detailAside()).getByText('다른 상세 본문')).toBeTruthy();
    openDrawer();
    expect(drawer().hidden).toBe(false);
    expect(detailAside().hidden).toBe(true);
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
  });

  it('a screen that passes a fresh detail node on every render does not push the open drawer away', () => {
    mount('/?v=1&focus=E-9');
    openDrawer();
    expect(drawer().hidden).toBe(false);
    fireEvent.change(within(drawer()).getByLabelText('내용'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('본문 입력'), { target: { value: 'y' } });
    expect(drawer().hidden).toBe(false);
    expect(detailAside().hidden).toBe(true);
  });
});

describe('Esc and focus (S6)', () => {
  it('moves focus to the heading on open; Esc inside closes it and focuses the rail button', async () => {
    const user = userEvent.setup();
    mount();
    openDrawer();
    expect(heading()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(drawer().hidden).toBe(true);
    expect(railButton()).toHaveFocus();
  });

  it('ignores Esc with focus in the main body', async () => {
    const user = userEvent.setup();
    mount();
    openDrawer();
    screen.getByLabelText('본문 입력').focus();
    await user.keyboard('{Escape}');
    expect(drawer().hidden).toBe(false);
  });

  it('ignores an Esc the content already handled', async () => {
    const user = userEvent.setup();
    mount();
    openDrawer();
    within(drawer()).getByLabelText('Esc를 막는 입력').focus();
    await user.keyboard('{Escape}');
    expect(drawer().hidden).toBe(false);
  });

  it('ignores Esc from a portaled overlay, whose React event bubbles through the aside', () => {
    mount();
    openDrawer();
    fireEvent.keyDown(screen.getByRole('button', { name: '떠 있는 선택지' }), { key: 'Escape' });
    expect(drawer().hidden).toBe(false);
  });
});

describe('closing a draft (S7, S8)', () => {
  const closers: [string, () => unknown][] = [
    ['the close button', () => fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }))],
    ['Esc', () => fireEvent.keyDown(heading(), { key: 'Escape' })],
    ['the rail toggle', () => fireEvent.click(railButton())],
    ['the content cancel', () => fireEvent.click(within(drawer()).getByRole('button', { name: '작성 취소' }))],
  ];

  it.each(closers)('asks inside the drawer before %s discards a dirty draft', async (_name, close) => {
    mount();
    openDrawer();
    await makeDirty();
    close();
    expect(within(drawer()).getByRole('alert')).toHaveTextContent(CONFIRM);
    expect(within(drawer()).getByRole('button', { name: '계속 작성' })).toHaveFocus();
    expect(drawer().hidden).toBe(false);
  });

  it.each(closers)('closes a clean draft at once with %s', (_name, close) => {
    mount();
    openDrawer();
    close();
    expect(drawer().hidden).toBe(true);
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(railButton()).toHaveFocus();
  });

  it('계속 작성 keeps the draft and returns focus to the heading', async () => {
    mount();
    openDrawer();
    await makeDirty();
    fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }));
    fireEvent.click(within(drawer()).getByRole('button', { name: '계속 작성' }));
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
    expect(heading()).toHaveFocus();
  });

  it('버리기 closes and the next open mounts a fresh Compose with a new Context', async () => {
    mount();
    openDrawer();
    await makeDirty();
    fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }));
    fireEvent.click(within(drawer()).getByRole('button', { name: '버리기' }));
    expect(drawer().hidden).toBe(true);
    expect(railButton()).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '다른 화면으로' }));
    openDrawer();
    expect(seen.mounts).toBe(2);
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('');
    expect(last().context.items[0].value).toBe('분석 · 다른 화면');
  });

  it('onSubmitted closes without asking, drops the draft and focuses the rail button', async () => {
    mount();
    openDrawer();
    await makeDirty();
    fireEvent.click(within(drawer()).getByRole('button', { name: '제출' }));
    expect(drawer().hidden).toBe(true);
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(railButton()).toHaveFocus();
    expect(railButton()).toHaveAccessibleName('VOC 등록');
    openDrawer();
    expect(seen.mounts).toBe(2);
  });
});

it('does not use an overlay: no scrim, and the body is not inert', () => {
  mount();
  openDrawer();
  expect(screen.getByRole('main').closest('[inert]')).toBeNull();
  expect(drawer().closest('[role="dialog"]')).toBeNull();
  expect(screen.getByLabelText('본문 입력')).toBeEnabled();
});

describe('session and slot lifecycle (C1, C3)', () => {
  const userA = testSession(['platform:view'], { user: { id: 'a', name: 'A' } });
  const userB = testSession(['platform:view'], { user: { id: 'b', name: 'B' } });
  /** An adapter whose session can be swapped under a mounted Provider, as a re-login or role switch does. */
  function mountSwitchable(slots: PlatformSlots = SLOTS) {
    window.history.replaceState(null, '', '/?v=1&q=secret');
    let current: Session = userA;
    const listeners = new Set<() => void>();
    const adapter = testAdapter({ session: () => current, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
    const tree = (s: PlatformSlots) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={s}><AppShell><Screen /></AppShell></PlatformProvider></I18nProvider>;
    const view = render(tree(slots));
    return { view, tree, switchTo: (next: Session) => { current = next; act(() => listeners.forEach(listener => listener())); } };
  }

  const userA2 = testSession(['platform:view'], { user: { id: 'a', name: 'A' } });
  it.each([['open', false, userB], ['hidden with a draft', true, userB], ['open, same user, new session object', false, userA2], ['hidden with a draft, same user, new session object', true, userA2]])('a session change while %s drops the Context and the draft, and the next open freezes fresh', async (_name, hide, next) => {
    const { switchTo } = mountSwitchable();
    openDrawer();
    await makeDirty();
    expect(last().context.items.map(item => item.id)).toContain('page:q');
    if (hide) fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    switchTo(next);
    expect(drawer().hidden).toBe(true);
    expect(within(drawer()).queryByLabelText('내용')).toBeNull();
    expect(document.body).not.toHaveTextContent('secret');
    expect(railButton()).toHaveAccessibleName('VOC 등록');
    fireEvent.click(screen.getByRole('button', { name: '다른 화면으로' }));
    openDrawer();
    expect(seen.mounts).toBe(2);
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('');
    expect(last().context.items[0].value).toBe('분석 · 다른 화면');
  });

  it('a Compose handler of the dropped draft is ignored after a session change', async () => {
    const { switchTo } = mountSwitchable();
    openDrawer();
    const staleSubmitted = last().onSubmitted;
    switchTo(userB);
    openDrawer();
    await makeDirty();
    (document.activeElement as HTMLElement | null)?.blur();
    act(() => { staleSubmitted({ vocId: 'v1', displayId: 'VOC-1' }); });
    expect(drawer().hidden).toBe(false);
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
    expect(railButton()).not.toHaveFocus();
  });

  it.each([['open', false], ['hidden with a draft', true]])('removing the slot while %s resets the drawer, and returning the slot reopens nothing', async (_name, hide) => {
    const { view, tree } = mountSwitchable();
    openDrawer();
    await makeDirty();
    if (hide) fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
    view.rerender(tree({}));
    expect(rail().queryByRole('button', { name: /^VOC 등록/ })).toBeNull();
    expect(drawer()).toBeNull();
    view.rerender(tree(SLOTS));
    expect(drawer().hidden).toBe(true);
    expect(within(drawer()).queryByLabelText('내용')).toBeNull();
    expect(railButton()).toHaveAttribute('aria-expanded', 'false');
    expect(railButton()).toHaveAccessibleName('VOC 등록');
    openDrawer();
    expect(seen.mounts).toBe(2);
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('');
  });
});

describe('a detail takes the position (C2, C4)', () => {
  /** Focuses its close button when it mounts, like DetailDrawer's arrival focus. */
  const atFocus: { detailHidden: boolean | null; drawerHidden: boolean | null } = { detailHidden: null, drawerHidden: null };
  function FocusingDetail() {
    const button = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
      // jsdom focuses inside a hidden aside too, so record the visibility the focus would meet in a browser.
      atFocus.detailHidden = button.current?.closest('aside')?.hidden ?? null;
      atFocus.drawerHidden = drawer().hidden;
      button.current?.focus();
    }, []);
    return <button ref={button} type="button">상세 닫기</button>;
  }
  function FocusScreen() {
    const [on, setOn] = useState(false);
    useDetailPanelContent(on ? <FocusingDetail /> : undefined);
    return <button type="button" onClick={() => setOn(true)}>포커스 상세 열기</button>;
  }

  it('the detail focuses its close button inside the visible aside while the drawer was open', () => {
    window.history.replaceState(null, '', '/?v=1');
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={SLOTS}>
      <AppShell><FocusScreen /></AppShell>
    </PlatformProvider></I18nProvider>);
    openDrawer();
    atFocus.detailHidden = null; atFocus.drawerHidden = null;
    fireEvent.click(screen.getByRole('button', { name: '포커스 상세 열기' }));
    expect(atFocus).toEqual({ detailHidden: false, drawerHidden: true });
    expect(detailAside().hidden).toBe(false);
    expect(drawer().hidden).toBe(true);
    expect(within(detailAside()).getByRole('button', { name: '상세 닫기' })).toHaveFocus();
  });

  it('a Popover opened from the hidden Compose is closed by a detail takeover and the form value stays', async () => {
    function PopoverCompose(props: VocComposeProps) {
      return <div>
        <FakeCompose {...props} />
        <Popover><PopoverTrigger asChild><button type="button">선택 열기</button></PopoverTrigger><PopoverContent>떠 있는 선택 목록</PopoverContent></Popover>
      </div>;
    }
    mount('/?v=1', { vocCompose: { Compose: PopoverCompose } });
    openDrawer();
    await makeDirty();
    fireEvent.click(within(drawer()).getByRole('button', { name: '선택 열기' }));
    expect(screen.getByText('떠 있는 선택 목록')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '다른 상세 등록' }));
    expect(drawer().hidden).toBe(true);
    expect(screen.queryByText('떠 있는 선택 목록')).toBeNull();
    openDrawer();
    expect(within(drawer()).getByLabelText('내용')).toHaveValue('a');
  });
});
