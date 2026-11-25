import { lazy, Suspense } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId, type MenuMeta } from '@ap/contracts';
import { House } from 'lucide-react';
import { PlatformPage, useFocusContextEditor } from '@ap/components';
import { createRegistry, I18nProvider, PlatformLink, PlatformProvider, usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar } from '../GlobalContextBar';
import { ScreenOutlet } from '../../routing/RouteOutlet';

const group = groupId('overview');
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: group, label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group, primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/',
    icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply', condition: 'apply' },
    pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['view', 'returnTo'],
    conditionPresets: [{ id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['team'] }, { id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker'] }],
    conditionPreset: { key: 'view', default: 'org' },
  }],
});

const longValue = 'LongValueThatNeedsTruncation';
let laneWidth: number;
const bar = () => screen.getByRole('region', { name: '전역 Context' });
const period = () => within(bar()).getByRole('button', { name: /^기간 / });

function mount({ returnTo, condition, savedViews, scopeId }: {
  returnTo?: string;
  condition?: Record<string, string[]>;
  savedViews?: ReturnType<typeof createFakeSavedViewStore>;
  scopeId?: string;
} = {}) {
  let url = `/?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&ppid=${longValue}`;
  if (condition) url += `&equipmentGroup=${encodeURIComponent(JSON.stringify(condition))}`;
  if (scopeId) url += `&scopeId=${encodeURIComponent(scopeId)}`;
  window.history.replaceState(null, '', returnTo ? `${url}&returnTo=${encodeURIComponent(returnTo)}` : url);
  const session = returnTo || scopeId ? testSession(['platform:view']) : undefined;
  return render(<I18nProvider><PlatformProvider registry={registry} savedViews={savedViews} slots={{ contextBar: <GlobalContextBar /> }}
    equipmentAxes={[{ id: 'team', label: { ko: '팀', en: 'Team' }, membershipHistory: false }, { id: 'maker', label: { ko: '제조사', en: 'Maker' }, membershipHistory: false }]}
    adapter={testAdapter(session ? { session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [
      { equipmentId: 'E1', room: 'PHOTO', axes: { team: ['T1'] } },
      { equipmentId: 'E2', room: 'PHOTO', axes: { team: ['T2'] } },
    ] }) } : {})}>
    <PlatformPage contextExtension={<input aria-label="집계 단위 입력" />}
      queryBarExtension={{ appliedPageSummary: [{ key: 'grain', label: '집계 단위', value: '시간' }] }}>
      <p>본문</p>
    </PlatformPage>
  </PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  laneWidth = 2000;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let width = 0;
    if (this.hasAttribute('data-context-chip-lane')) width = laneWidth;
    if (this.parentElement?.hasAttribute('data-context-chip-measure')) width = this.textContent?.startsWith('+') ? 30 : 100;
    return { width, height: 32, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 32, toJSON() {} };
  });
});

it.each(['floating', 'pinned'])('keeps the %s live editor open and focused after one preset push, preserving carried axes', async mode => {
  const condition = { team: ['T1'], maker: ['A'] };
  mount({ condition });
  const user = userEvent.setup();
  const push = vi.spyOn(window.history, 'pushState');
  const line = within(bar());
  await user.click(line.getByRole('button', { name: '조건 묶음 조직 기준' }));
  let editor = screen.getByRole('dialog', { name: '전역 Context' });
  if (mode === 'pinned') {
    await user.click(within(editor).getByRole('button', { name: '편집기 고정' }));
    editor = screen.getByRole('button', { name: '편집기 고정 해제' }).closest<HTMLElement>('[data-context-editor-pinned]')!;
  }
  const presets = within(editor).getByRole('radiogroup', { name: '조건 묶음' });
  const organization = within(presets).getByRole('radio', { name: '조직 기준' });
  const equipment = within(presets).getByRole('radio', { name: '설비 기준' });
  expect(organization).toBeChecked();
  organization.focus();
  await user.keyboard('{ArrowRight}');
  expect(push).toHaveBeenCalledTimes(1);
  const params = new URLSearchParams(location.search);
  expect(params.get('view')).toBe('eqp');
  expect(JSON.parse(params.get('equipmentGroup')!)).toEqual(condition);
  expect(equipment).toHaveFocus();
  expect(equipment).toBeChecked();
  expect(editor).toBeVisible();
  expect(line.getByRole('button', { name: '조건 묶음 설비 기준' })).toBeVisible();
  expect(line.getByRole('button', { name: /^팀 T1.*설비 기준/ })).toBeVisible();
});

it('announces only the excluded axis when a saved custom group is selected', async () => {
  const savedViews = createFakeSavedViewStore([
    testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo set', savedScopeId: 'MEM', target: { fixed: ['E1'] } }),
  ]);
  mount({ condition: { customGroup: ['g1'], team: ['T1'] }, savedViews, scopeId: 'MEM' });
  await within(bar()).findByRole('button', { name: '커스텀 조회 그룹 Photo set' });
  const user = userEvent.setup();
  await user.click(period());
  const editor = screen.getByRole('dialog', { name: '전역 Context' });
  await user.click(within(editor).getByRole('radio', { name: '설비 기준' }));
  expect(within(editor).getByRole('status')).toHaveTextContent('조건 묶음: 설비 기준. 1개 조건은 이 보기에서 미적용입니다.');
});

it('operates the owned target dialog and returns focus to its trigger on Escape', async () => {
  mount({ scopeId: 'MEM' });
  const user = userEvent.setup();
  await user.click(period());
  const editor = screen.getByRole('dialog', { name: '전역 Context' });
  const target = within(editor).getByRole('button', { name: '대상 전체' });
  const id = target.getAttribute('aria-controls');
  await user.click(target);
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  expect(id).toBeTruthy();
  expect(dialog).toHaveAttribute('id', id);
  const search = within(dialog).getByRole('textbox');
  await waitFor(() => expect(search).toBeEnabled());
  await user.type(search, 'E1');
  expect(search).toHaveValue('E1');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(target).toHaveFocus());
  expect(editor).toBeVisible();
  await user.click(target);
  expect(await screen.findByRole('dialog', { name: '대상' })).toHaveAttribute('id', id);
});

it.each([2000, 140])('uses the saved custom-group label at lane width %d and keeps its ID in the URL', async width => {
  laneWidth = width;
  const condition = { customGroup: ['g1'] };
  const savedViews = createFakeSavedViewStore([
    testSavedView({ id: 'g1', kind: 'custom-group', name: 'Photo set', savedScopeId: 'MEM', target: { fixed: ['E1'] } }),
  ]);
  mount({ condition, savedViews, scopeId: 'MEM' });
  let surface = bar();
  const more = within(surface).queryByRole('button', { name: /^조건 \d+개 더 보기$/ });
  if (more) {
    fireEvent.click(more);
    surface = await screen.findByRole('dialog', { name: '나머지 조건' });
  }
  expect(await within(surface).findByRole('button', { name: '커스텀 조회 그룹 Photo set' })).toBeVisible();
  expect(JSON.parse(new URLSearchParams(location.search).get('equipmentGroup')!)).toEqual(condition);
});

it('shows the stored ID as a fallback for an unresolved custom group', async () => {
  const savedViews = createFakeSavedViewStore();
  mount({ condition: { customGroup: ['missing-group'] }, savedViews, scopeId: 'MEM' });
  expect(within(bar()).getByRole('button', { name: '커스텀 조회 그룹 missing-group' })).toBeVisible();
  fireEvent.click(period());
  const editor = await screen.findByRole('dialog', { name: '전역 Context' });
  expect(await within(editor).findByRole('button', { name: /missing-group · 없는 그룹/ })).toBeVisible();
  expect(within(bar()).getByRole('button', { name: '커스텀 조회 그룹 missing-group' })).toBeVisible();
});

it('updates the target chip in one push and keeps the live editor open after target Apply', async () => {
  mount({ scopeId: 'MEM' });
  const user = userEvent.setup();
  await user.click(period());
  const editor = screen.getByRole('dialog', { name: '전역 Context' });
  await user.click(within(editor).getByRole('button', { name: '대상 전체' }));
  const target = await screen.findByRole('dialog', { name: '대상' });
  await within(target).findByRole('table');
  await user.click(within(target).getByRole('button', { name: /^팀 2개/ }));
  await user.click(within(target).getByRole('button', { name: 'T1만 선택' }));
  const push = vi.spyOn(window.history, 'pushState');
  await user.click(await within(target).findByRole('button', { name: '조건 적용 · 1대' }));
  expect(push).toHaveBeenCalledOnce();
  expect(within(bar()).getByRole('button', { name: '팀 T1' })).toBeVisible();
  expect(editor).toBeVisible();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows the applied query, preset and page chips on one line with share and reset in the actions popover', async () => {
  mount();
  expect(await screen.findByText('본문')).toBeVisible();
  expect(bar().querySelectorAll('[data-workspace-query-row]')).toHaveLength(1);
  expect(period()).toHaveAttribute('aria-expanded', 'false');
  expect(within(bar()).getByRole('button', { name: '조건 묶음 조직 기준' })).toBeVisible();
  const page = within(bar()).getByRole('button', { name: '집계 단위 시간' });
  expect(screen.queryByRole('textbox', { name: '집계 단위 입력' })).toBeNull();
  fireEvent.click(page);
  expect(await screen.findByRole('textbox', { name: '집계 단위 입력' })).toBeVisible();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(page).toHaveFocus());
  fireEvent.click(within(bar()).getByRole('button', { name: '조회 조건 동작' }));
  expect(await screen.findByRole('button', { name: '현재 조건 공유' })).toBeVisible();
  expect(screen.getByRole('button', { name: '조건 초기화' })).toBeVisible();
});

it('applies a period edit immediately in one navigation and refreshes the chip', async () => {
  mount();
  const push = vi.spyOn(window.history, 'pushState');
  fireEvent.click(period());
  const editor = await screen.findByRole('dialog', { name: '전역 Context' });
  fireEvent.click(within(editor).getByRole('button', { name: /^기간:/ }));
  const range = await screen.findByRole('dialog', { name: '기간' });
  fireEvent.change(range.querySelector('input[type="date"]')!, { target: { value: '2026-09-24' } });
  fireEvent.click(within(range).getByRole('button', { name: '적용' }));
  expect(push).toHaveBeenCalledTimes(1);
  expect(new URLSearchParams(location.search).get('from')).toContain('2026-09-24');
  expect(period()).toHaveAccessibleName(/09-24/);
});

it('folds chips by measured width and exposes the full value in the overflow', async () => {
  laneWidth = 140;
  mount();
  expect(period()).toBeVisible();
  expect(within(bar()).queryByRole('button', { name: new RegExp(longValue) })).toBeNull();
  const more = within(bar()).getByRole('button', { name: /^조건 \d+개 더 보기$/ });
  fireEvent.click(more);
  const carried = await screen.findByRole('button', { name: new RegExp(longValue) });
  expect(carried).toHaveAttribute('title', expect.stringContaining(longValue));
  fireEvent.click(carried);
  expect(await screen.findByRole('dialog', { name: '전역 Context' })).toBeVisible();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(more).toHaveFocus());
});

it('keeps the period dialog open for Apply after a pointer click on a preset', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(period());
  const editor = screen.getByRole('dialog', { name: '전역 Context' });
  await user.click(within(editor).getByRole('button', { name: /^기간:/ }));
  const range = screen.getByRole('dialog', { name: /^기간$/ });
  await user.click(within(range).getByRole('button', { name: '최근 7일' }));
  const apply = within(screen.getByRole('dialog', { name: /^기간$/ })).getByRole('button', { name: '적용' });
  expect(apply).toBeEnabled();
  expect(new URLSearchParams(location.search).get('from')).toBe('2026-09-25T09:00:00');
  await user.click(apply);
  expect(new URLSearchParams(location.search).get('from')).toBe('2026-09-20T00:00:00');
});

it('keeps the return row first with the live editor closed or pinned', async () => {
  mount({ returnTo: '/mars/home?v=1' });
  const body = document.querySelector('[data-platform-page-body]')!;
  const row = body.querySelector('[data-return-row]');
  expect(row).toBeInTheDocument();
  expect(body.firstElementChild).toBe(row);
  fireEvent.click(period());
  fireEvent.click(await screen.findByRole('button', { name: '편집기 고정' }));
  const pinned = body.querySelector<HTMLElement>('[data-context-editor-pinned]');
  expect(pinned).toBeInTheDocument();
  expect(body.firstElementChild).toBe(row);
  expect(row!.nextElementSibling).toContainElement(pinned);
});

it('returns keyboard focus from overflow to its trigger while the live editor stays pinned', async () => {
  laneWidth = 140;
  mount();
  const user = userEvent.setup();
  const more = within(bar()).getByText(/^\+\d+$/, { selector: 'button' });
  await user.click(period());
  await user.click(await screen.findByRole('button', { name: '편집기 고정' }));
  const pinned = screen.getByRole('button', { name: '편집기 고정 해제' });
  more.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('dialog', { name: '나머지 조건' })).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(more).toHaveFocus());
  expect(pinned).toBeVisible();
});

it('names the keyboard-operated overflow by the number of hidden conditions', async () => {
  laneWidth = 140;
  mount();
  const user = userEvent.setup();
  const more = within(bar()).getByRole('button', { name: '조건 3개 더 보기' });
  expect(more).toHaveTextContent('+3');
  expect(more).toHaveAttribute('aria-expanded', 'false');
  more.focus();
  await user.keyboard('{Enter}');
  expect(more).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(more).toHaveAccessibleName('조건 3개 더 보기');
});

it('clears the applied target chip from context actions while preserving Scope', async () => {
  mount({ condition: { team: ['T1'] }, scopeId: 'MEM' });
  const chip = within(bar()).getByRole('button', { name: '팀 T1' });
  expect(chip).toBeVisible();
  fireEvent.click(within(bar()).getByRole('button', { name: '조회 조건 동작' }));
  fireEvent.click(await screen.findByRole('button', { name: '조건 초기화' }));
  const params = new URLSearchParams(location.search);
  expect(params.has('equipmentGroup')).toBe(false);
  expect(params.get('scopeId')).toBe('MEM');
  expect(chip).not.toBeInTheDocument();
});

it('operates the split-button menu by keyboard and returns focus to context actions', async () => {
  mount();
  const user = userEvent.setup();
  const actions = within(bar()).getByRole('button', { name: '조회 조건 동작' });
  actions.focus();
  await user.keyboard('{Enter}');
  const popover = await screen.findByRole('dialog', { name: '조회 조건 동작' });
  const choose = within(popover).getByRole('button', { name: '링크 복사 방식 선택' });
  await user.tab();
  expect(choose).toHaveFocus();
  await user.keyboard('{Enter}');
  const menu = screen.getByRole('menu');
  expect(within(menu).getByRole('menuitem', { name: '메뉴 주소 복사' })).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(choose).toHaveFocus());
  await user.keyboard('{Escape}');
  await waitFor(() => expect(actions).toHaveFocus());
});

it('moves focus between a chip and overflow when measured fit changes in both directions', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  mount();
  const carried = within(bar()).getByRole('button', { name: new RegExp(longValue) });
  carried.focus();
  laneWidth = 140;
  fireEvent(window, new Event('resize'));
  const more = within(bar()).getByRole('button', { name: '조건 3개 더 보기' });
  expect(more).toHaveFocus();
  fireEvent(window, new Event('resize'));
  expect(more).toHaveFocus();
  laneWidth = 2000;
  fireEvent(window, new Event('resize'));
  expect(more).not.toBeInTheDocument();
  const exposed = within(bar()).getByRole('button', { name: new RegExp(longValue) });
  expect(exposed).toBeVisible();
  expect(exposed).toHaveFocus();
});

it('keeps overflow closed and retains current focus when chips fold again after all fitting', async () => {
  vi.stubGlobal('ResizeObserver', undefined);
  laneWidth = 140;
  mount();
  const user = userEvent.setup();
  const more = within(bar()).getByRole('button', { name: '조건 3개 더 보기' });
  more.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('dialog', { name: '나머지 조건' })).toBeVisible();

  laneWidth = 2000;
  fireEvent(window, new Event('resize'));
  expect(more).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '나머지 조건' })).not.toBeInTheDocument();
  const actions = within(bar()).getByRole('button', { name: '조회 조건 동작' });
  actions.focus();

  laneWidth = 140;
  fireEvent(window, new Event('resize'));
  expect(within(bar()).getByRole('button', { name: '조건 3개 더 보기' })).toHaveAttribute('aria-expanded', 'false');
  expect(actions).toHaveFocus();
});

it('preserves carried values and the independent page extension when Context is unsupported', async () => {
  mountRouteScreens('/mars/local?v=1&ppid=carried');
  expect(screen.queryByRole('region', { name: '전역 Context' })).toBeNull();
  expect(await screen.findByRole('textbox', { name: '독립 페이지 조건' })).toBeVisible();
  expect(new URLSearchParams(location.search).get('ppid')).toBe('carried');
});

it('replaces pinned and open editor state, summary, and recovery across live → apply → live', async () => {
  mountRouteScreens('/mars/home?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  await screen.findByRole('heading', { name: 'home' });
  fireEvent.click(period());
  fireEvent.click(await screen.findByRole('button', { name: '편집기 고정' }));
  expect(screen.getByRole('button', { name: '편집기 고정 해제' })).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'apply' }));
  expect(await screen.findByRole('heading', { name: 'apply' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '편집기 고정 해제' })).toBeNull();
  expect(screen.queryByRole('button', { name: '페이지 home' })).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'next' }));
  expect(await screen.findByRole('button', { name: '페이지 next' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '편집기 고정 해제' })).toBeNull();
  expect(screen.queryByRole('dialog', { name: '전역 Context' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '조건 열기' }));
  expect(await screen.findByRole('dialog', { name: '기간' })).toBeVisible();
});

function mountRouteScreens(url: string) {
  const component = lazy(async () => ({ default: RouteTestPage }));
  const entry = (id: string, context: MenuMeta['context']) => ({
    id, group, primary: id === 'home', label: { ko: id, en: id }, description: { ko: '', en: '' },
    path: id === 'home' ? '/' : `/${id}`, icon: House, permission: 'platform:view' as const, requiresScope: false,
    pageType: 'overview' as const, pageKeys: [], context, component,
    features: { export: false, savedView: false, annotate: false, compare: false },
  });
  const time = { ...noContext, time: 'apply' } as const;
  const menus = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: group, label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [entry('home', time), { ...entry('apply', time), query: { mode: 'apply', required: { context: ['time'] } } },
      entry('next', time), entry('local', noContext)],
  });
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={menus} adapter={testAdapter({ session: () => session })} slots={{ contextBar: <GlobalContextBar /> }}>
    <PlatformLink href="/mars/apply?v=1&amp;from=2026-09-25T09:00:00&amp;to=2026-09-26T09:00:00">apply</PlatformLink>
    <PlatformLink href="/mars/next?v=1&amp;from=2026-09-25T09:00:00&amp;to=2026-09-26T09:00:00">next</PlatformLink>
    <Suspense fallback={null}><ScreenOutlet /></Suspense>
  </PlatformProvider></I18nProvider>);
}

function RouteTestPage() {
  const id = usePlatform().route?.menu.id;
  return <PlatformPage contextExtension={<input aria-label="독립 페이지 조건" />}
    queryBarExtension={id === 'local' ? undefined : { appliedPageSummary: [{ key: 'route', label: '페이지', value: id ?? '' }] }}>
    <RecoveryButton />
  </PlatformPage>;
}

function RecoveryButton() {
  const open = useFocusContextEditor();
  return <button type="button" onClick={open}>조건 열기</button>;
}

it('returns focus on Escape and pins the editor in flow outside the sticky header', async () => {
  mount();
  const opener = period();
  opener.focus();
  fireEvent.click(opener);
  const panel = await screen.findByRole('dialog', { name: '전역 Context' });
  fireEvent.keyDown(within(panel).getByRole('button', { name: '편집기 고정' }), { key: 'Escape' });
  await waitFor(() => expect(opener).toHaveFocus());
  fireEvent.click(opener);
  fireEvent.click(await screen.findByRole('button', { name: '편집기 고정' }));
  const pinned = screen.getByRole('button', { name: '편집기 고정 해제' }).closest('[data-context-editor-pinned]');
  expect(pinned).toBeInTheDocument();
  expect(pinned?.closest('[data-page-sticky-header]')).toBeNull();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(pinned).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
