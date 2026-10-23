import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformSlots, type VocComposeProps } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { useDetailPanelContent } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
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

function mount(url = '/?v=1&granularity=day&q=x&scopeId=MEM', slots: PlatformSlots = SLOTS) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>
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

  it('sits between the analysis board and the bell position in DOM order and toggles aria-expanded', () => {
    mount();
    const names = rail().getAllByRole('button').map(button => button.getAttribute('aria-label'));
    expect(names.indexOf('VOC 등록')).toBeGreaterThan(names.indexOf('메뉴 검색…'));
    expect(names.indexOf('VOC 등록')).toBeLessThan(names.indexOf('도움말'));
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
