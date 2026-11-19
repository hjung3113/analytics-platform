import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuery, defineEndpoint, type PlatformAdapter, groupId, spaceId } from '@ap/contracts';
import { PlatformPage, QueryBarExtensionContext, QueryView, useFocusContextEditor, type QueryBarExtension } from '@ap/components';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft, useMenuQuery, useSavedViewSupport } from '@ap/kernel';
import { useHostPlatform, PaneQueryDraftProvider, PaneScreenProvider } from '@ap/kernel/host';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar, contextBarVisible } from '../GlobalContextBar';
import { QueryBar } from '../QueryBar';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', prcGroup: 'apply' }, query: { mode: 'apply', required: { context: ['time', 'roomNames'] } }, pageKeys: ['grain'], pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false } }] });
const endpoint = defineEndpoint<null, unknown>({ id: 'fixture.query', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: true, context: { time: 'apply', roomNames: 'apply' }, requiredContext: ['time', 'roomNames'], kinds: ['collection'], mergeTimeDomain: false });
const send = vi.fn(async () => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
let draft: ReturnType<typeof useQueryDraft>;
let platform: ReturnType<typeof useHostPlatform>;
function Probe() { draft = useQueryDraft(); platform = useHostPlatform(); useMenuQuery(endpoint, null); return null; }
const evaluate = vi.fn();
function mount(query = '', overrides: Partial<PlatformAdapter> = {}, history = true, extension?: QueryBarExtension, savedViews?: ReturnType<typeof createFakeSavedViewStore>) {
  window.history.replaceState(null, '', `/?scopeId=MEM${query}`);
  const session = testSession(['platform:view']);
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={savedViews} equipmentAxes={[{ id: 'vendor', label: { ko: '공급사', en: 'Vendor' }, membershipHistory: history }, { id: 'model', label: { ko: '모델', en: 'Model' }, membershipHistory: true, dependsOn: 'vendor' }]} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', evaluateSelection: evaluate, menuQuery: send, listEquipmentFacts: async () => ({ version: '1', items: [ { equipmentId: 'E1', room: 'PHOTO', axes: { vendor: ['V1'], model: ['M1'], prcGroups: ['P1'] } }, { equipmentId: 'E2', room: 'ETCH', axes: { vendor: ['V2'], model: ['M2'], prcGroups: ['P2'] } } ] }), ...overrides })}><Probe /><QueryBarExtensionContext.Provider value={extension}><GlobalContextBar /></QueryBarExtensionContext.Provider></PlatformProvider></I18nProvider>);
  return push;
}
beforeEach(() => { send.mockClear(); evaluate.mockClear(); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('edits a page/global draft without URL writes, counts raw keys, applies once and does not use legacy evaluation', async () => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(document.querySelector('[data-query-bar]')).toHaveAttribute('data-canvas-band');
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  const room = screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ });
  expect(room).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById(room.getAttribute('aria-describedby')!)).toHaveTextContent('공정');
  expect(screen.getByRole('button', { name: '공정을 선택하세요' })).toBeVisible();
  fireEvent.click(room);
  await screen.findByRole('button', { name: '조건 적용 · 2대' });
  fireEvent.click(screen.getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(screen.getByRole('button', { name: 'PHOTO만 선택' }));
  fireEvent.click(await screen.findByRole('button', { name: '조건 적용 · 1대' }));
  expect(draft.draft.global.roomNames).toEqual(['PHOTO']);
  expect(platform.global.roomNames).toBeNull();
  act(() => draft.setDraftPage({ grain: 'day' }));
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByText(`미적용 변경 ${draft.dirty.length}개 · 공유에서 제외`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  expect(bar()).toHaveAttribute('data-query-bar-collapsed');
  expect(within(bar()).queryByRole('button', { name: '적용' })).toBeNull();
  expect(push).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(evaluate).not.toHaveBeenCalled();
});
it('keeps Apply in place, focusable and inert (aria-disabled), with the page-supplied hint, while the page applies from its own surface (#2339)', async () => {
  const push = mount('', {}, true, { pageSummary: [], issues: [], applyHint: '층에서 적용합니다' });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => { draft.setDraftGlobal({ roomNames: ['PHOTO'] }); draft.setDraftPage({ grain: 'day' }); });
  const apply = screen.getByRole('button', { name: '적용' });
  expect(apply).toHaveAttribute('aria-disabled', 'true');
  expect(apply).not.toBeDisabled();
  apply.focus();
  expect(apply).toHaveFocus();
  expect(apply).toHaveAccessibleDescription(expect.stringContaining('층에서 적용합니다'));
  fireEvent.click(apply);
  expect(push).not.toHaveBeenCalled();
});
it('preserves draft values across close/expand, restores focus and uses anchor calendar arithmetic', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(screen.getByRole('button', { name: '오늘' }));
  expect(draft.draft.global).toMatchObject({ from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00' });
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  expect(draft.draft.global.from).toBe('2025-12-25T09:31:22');
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(screen.getByRole('button', { name: '최근 24시간' })).toHaveFocus();
  expect(draft.draft.global.from).toBe('2025-12-25T09:31:22');
});
it('shows the period as one readable range and no ISO interval (#913)', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const group = screen.getByRole('group', { name: '기간' });
  expect(group).toHaveTextContent('12-31 09:31 → 01-01 09:31 (24h)');
  expect(document.body.textContent).not.toMatch(/\[2026-|\[2025-/);
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  expect(screen.getByRole('group', { name: '기간' })).toHaveTextContent('12-25 09:31 → 01-01 09:31 (7일)');
});
it('does not count the seeded default period as a change, before or after Revert (#913)', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.queryByText(/미적용 변경/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  expect(screen.getByText('미적용 변경 1개 · 공유에서 제외')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '초안 되돌리기' }));
  expect(screen.queryByText(/미적용 변경/)).toBeNull();
  expect(screen.queryByText(/기간을 선택하세요/)).toBeNull();
  expect(screen.getByRole('group', { name: '기간' })).toHaveTextContent('12-31 09:31 → 01-01 09:31 (24h)');
  // `오늘` moves both ends of the period: still one change (#913 UX-2).
  fireEvent.click(screen.getByRole('button', { name: '오늘' }));
  expect(screen.getByText('미적용 변경 1개 · 공유에서 제외')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '초안 되돌리기' }));
  // Not counted, yet not applied: the collapsed summary still says the period is being edited until Apply.
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(bar().querySelector('summary')?.textContent).toMatch(/^편집 중 · /);
  expect(within(bar()).getByRole('button', { name: '적용' })).toBeVisible();
});
it('marks the preset equal to the draft range as pressed and the mode pair follows the editor mode (#913)', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const pressed = () => ['최근 24시간', '최근 7일', '오늘', '기준일', '직접 범위'].map(name => screen.getByRole('button', { name }).getAttribute('aria-pressed'));
  expect(pressed()).toEqual(['true', 'false', 'false', 'false', 'true']);
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  expect(pressed()).toEqual(['false', 'true', 'false', 'false', 'true']);
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  expect(pressed()).toEqual(['false', 'true', 'false', 'true', 'false']);
  fireEvent.click(screen.getByRole('button', { name: '직접 범위' }));
  fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '2025-12-30T08:00:00' } });
  expect(pressed()).toEqual(['false', 'false', 'false', 'false', 'true']);
});
it('retains child axes and IDs outside candidates with nonblocking explanations', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], condition: { vendor: ['V1'], model: ['M1'] }, selection: ['EQ-X'] }));
  act(() => draft.setDraftGlobal({ condition: { vendor: ['V2'], model: ['M1'] } }));
  expect(draft.draft.global.condition?.model).toEqual(['M1']);
  expect(screen.getByRole('button', { name: /대상 고정 1대.*빈 선택/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^대상 고정/ }));
  expect(await screen.findByRole('checkbox', { name: /EQ-X/ })).toBeChecked();
  fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
  expect(draft.canApply).toBe(true);
});
it('derives bar visibility from menu capabilities only, not from carried values', () => {
  expect(contextBarVisible(noContext)).toBe(false);
  expect(contextBarVisible({ ...noContext, time: 'reference' })).toBe(true);
  expect(contextBarVisible({ ...noContext, time: 'apply' })).toBe(true);
});

it('distinguishes explicit empty selection/rooms, removes the last Condition key and enables PRC-only history', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], selection: [], condition: { vendor: ['V1'] } }));
  expect(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ })).toHaveTextContent('빈 선택');
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
  expect(draft.draft.global.roomNames).toEqual([]);
  expect(draft.draft.global.selection).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  fireEvent.click(within(screen.getByRole('group', { name: '공급사' })).getByRole('checkbox', { name: '전체' }));
  fireEvent.click(await screen.findByRole('button', { name: '조건 적용 · 2대' }));
  expect(draft.draft.global.condition).toBeNull();
  expect(draft.draft.global.selection).toBeNull();
  // The menu requires the room: applying "all" writes every authorized room instead of clearing the required key.
  expect(draft.draft.global.roomNames).toEqual(['ETCH', 'PHOTO']);
  act(() => draft.setDraftGlobal({ roomNames: [], prcGroups: ['P1'] }));
  expect(draft.canApply).toBe(true);
  expect(screen.getByRole('radio', { name: /그 시점 소속/ })).toBeEnabled();
});
it('shows metadata transport failures without dropping selections or blocking valid draft application', async () => {
  const facts = vi.fn(async () => { throw new Error('equipment unavailable'); });
  mount('', { listEquipmentFacts: facts });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], selection: ['EQ-X'] }));
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('설비 기본 정보를 불러오지 못했습니다.');
  expect(screen.queryByRole('table')).toBeNull();
  await waitFor(() => expect(facts).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(facts).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
  expect(draft.draft.global.selection).toEqual(['EQ-X']);
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
});
it('retains incomplete period input across closing and prevents an unrelated edit from enabling Apply', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [] }));
  fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(screen.getByLabelText('시작 시각')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '대상 지우기' }));
  act(() => draft.setDraftGlobal({ roomNames: [] }));
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
});

it('keeps pane drafts independent and closes the anchored editor with focus restored', async () => {
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const screens = { p1: { menuId: 'home', params: {}, query: '?scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' }, p2: { menuId: 'home', params: {}, query: '?scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00' } };
  function Board() {
    const [selected, select] = useState<'p1' | 'p2'>('p1');
    return <PaneQueryDraftProvider screens={screens}><button onClick={() => select('p1')}>Pane one</button><button onClick={() => select('p2')}>Pane two</button><PaneScreenProvider key={selected} paneId={selected} screen={screens[selected]} onChange={() => {}} onLeave={() => {}}><GlobalContextBar /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  window.history.replaceState(null, '', '/?scopeId=MEM');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Board /></PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
  expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: '최근 7일' }), { key: 'Escape' });
  await waitFor(() => expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toHaveFocus());
  expect(screen.getByText('미적용 변경 1개 · 공유에서 제외')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pane two' }));
  expect(screen.queryByText(/미적용 변경/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Pane one' }));
  expect(screen.getByText('미적용 변경 1개 · 공유에서 제외')).toBeTruthy();
});

it('ignores unused history-incapable axes, then disables asOf when one becomes used', async () => {
  mount('', {}, false);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], prcGroups: ['P'] }));
  expect(screen.getByRole('radio', { name: /그 시점 소속/ })).toBeEnabled();
  act(() => draft.setDraftGlobal({ condition: { vendor: ['V'] } }));
  expect(screen.getByRole('radio', { name: /그 시점 소속/ })).toBeDisabled();
  expect(screen.getByText(/설비 조건이나 PRC 그룹을 선택하고 소속 이력을 확인하세요/)).toBeTruthy();
});
it('merges consumer page diagnostics into the only Apply gate', async () => {
  mount('&roomNames=PHOTO', {}, true, { pageSummary: [{ key: 'grain', label: '집계', value: 'unknown' }], issues: [{ key: 'grain', label: '집계', reason: '허용되지 않은 값' }] });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(draft.canApply).toBe(true);
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  expect(screen.getByText('집계: 허용되지 않은 값')).toBeTruthy();
  const gate = screen.getByText('집계: 허용되지 않은 값').closest('[role]') as HTMLElement;
  expect(gate).toHaveAttribute('role', 'status');
  expect(screen.getByRole('region', { name: '조회 조건' })).toContainElement(gate);
  expect(gate.parentElement).toHaveClass('px-3');
});

it('allows an optional-Scope apply menu to commit without a Scope', async () => {
  const unscoped = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: registry.menus.map(menu => ({ ...menu, requiresScope: false, context: { ...noContext, time: 'apply' as const }, query: { mode: 'apply' as const } })) });
  window.history.replaceState(null, '', '/');
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider registry={unscoped} adapter={testAdapter()}><GlobalContextBar /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: '적용' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  expect(window.location.search).toContain('from=');
  expect(window.location.search).not.toContain('scopeId');
});
function mountFirstEntry(autoApplyDefault: boolean) {
  const menu = registry.menus[0];
  if (menu.module !== undefined) throw new Error('Expected a platform menu');
  const support = { menuId: menu.id, menuSchemaVersion: 1, contextKeys: ['time'] as const, pageKeys: [] };
  const chosen = createRegistry({
    spaces: registry.spaces, groups: registry.groups,
    menus: [{ ...menu, requiresScope: false, savedViewSupport: support, features: { ...menu.features, savedView: true }, query: { mode: 'apply', autoApplyDefault } }],
  });
  const session = testSession(['platform:view']);
  const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
  const store = createFakeSavedViewStore([testSavedView({ id: 'default', menuId: menu.id, context: period })], { [session.user.id + ':' + menu.id]: 'default' });
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const lookup = vi.spyOn(store, 'getDefaultId').mockImplementationOnce(async () => { await held; return 'default'; });
  function Page() {
    useSavedViewSupport(support);
    draft = useQueryDraft();
    return <GlobalContextBar />;
  }
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={chosen} adapter={testAdapter({ session: () => session })} savedViews={store}><Page /></PlatformProvider></I18nProvider>);
  return { release, lookup, period };
}
it('disables period inputs, target, membership and Apply while the first-entry lookup is held', async () => {
  const { lookup } = mountFirstEntry(true);
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  expect(window.location.search).toBe('');
  expect(screen.getByRole('button', { name: '조회 조건 접기' })).toBeVisible();
  expect(screen.getByLabelText('시작 시각')).toBeDisabled();
  expect(screen.getByLabelText('종료 시각 (제외)')).toBeDisabled();
  expect(screen.getByRole('button', { name: '최근 7일' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ })).toBeDisabled();
  expect(screen.getAllByRole('radio')[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
});
it('applies the personal default, folds the bar and enables the controls after release', async () => {
  const { release, lookup, period } = mountFirstEntry(true);
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  await act(async () => release());
  const params = new URLSearchParams(window.location.search);
  expect(params.get('from')).toBe(period.from);
  expect(params.get('to')).toBe(period.to);
  expect(draft.dirty).toEqual([]);
  expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
  expect(screen.getByLabelText('시작 시각')).toBeEnabled();
  expect(screen.getByLabelText('종료 시각 (제외)')).toBeEnabled();
  expect(screen.getByRole('button', { name: '최근 7일' })).toBeEnabled();
});
it('unlocks at the three-second default-read deadline and discards the late default', async () => {
  vi.useFakeTimers();
  try {
    const { release, lookup } = mountFirstEntry(true);
    const replace = vi.spyOn(window.history, 'replaceState');
    await act(async () => {});
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2999));
    expect(window.location.search).toBe('');
    expect(screen.getByLabelText('시작 시각')).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(new URLSearchParams(window.location.search).get('from')).toBe('2026-09-25T09:00:00');
    expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
    expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
    expect(screen.getByLabelText('시작 시각')).toBeEnabled();
    const applied = window.location.search;
    await act(async () => release());
    expect(window.location.search).toBe(applied);
    expect(replace).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
it('leaves period and Apply enabled with a held Saved View lookup on a non-opt-in menu', async () => {
  const { lookup } = mountFirstEntry(false);
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  expect(window.location.search).toBe('');
  expect(screen.getByLabelText('시작 시각')).toBeEnabled();
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
});
it('keeps a blank reference date invalid across unrelated edits and collapse until a valid preset replaces it', async () => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [] }));
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  fireEvent.change(screen.getByLabelText('기준일'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '대상 지우기' }));
  act(() => draft.setDraftGlobal({ roomNames: [] }));
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  const input = screen.getByLabelText('기준일');
  expect(input).toHaveValue('');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('유효한');
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  expect(screen.getByLabelText('기준일')).toHaveValue('2025-12-25');
  expect(screen.getByLabelText('기준일')).not.toHaveAttribute('aria-invalid');
});
it.each([false, true])('clears the last editable asOf owner atomically (another owner: %s)', async otherOwner => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], condition: { vendor: ['V1'] }, prcGroups: otherOwner ? ['P1'] : null, membershipBasis: 'asOf' }));
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  await screen.findByRole('button', { name: /조건 적용/ });
  fireEvent.click(within(screen.getByRole('group', { name: '공급사' })).getByRole('checkbox', { name: '전체' }));
  fireEvent.click(await screen.findByRole('button', { name: /조건 적용/ }));
  expect(draft.draft.global.condition).toBeNull();
  expect(draft.draft.global.membershipBasis).toBe(otherOwner ? 'asOf' : null);
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it('keeps customGroup plus asOf in the draft, disables Apply and explains the unsupported pairing', async () => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ condition: { customGroup: ['group-1'] }, membershipBasis: 'asOf' }));
  expect(draft.draft.global.condition).toEqual({ customGroup: ['group-1'] });
  expect(draft.draft.global.membershipBasis).toBe('asOf');
  expect(draft.canApply).toBe(false);
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  expect(screen.getAllByText('커스텀 조회 그룹은 지금 소속 기준에서만 조회할 수 있습니다.').length).toBeGreaterThan(0);
  act(() => draft.apply());
  expect(push).not.toHaveBeenCalled();
});
it('explains a chosen custom group that cannot be used in the query notes, with its ID and a short Korean reason, and blocks Apply on it alone (#2390)', async () => {
  mount('', {}, true, undefined, createFakeSavedViewStore());
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: ['PHOTO'], condition: { customGroup: ['gone-9'] } }));
  expect(await screen.findByText('커스텀 조회 그룹 gone-9: 없는 그룹. 대상에서 빼거나 다른 그룹을 고르세요.')).toBeVisible();
  expect(screen.queryByText(/not-found/)).toBeNull();
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  act(() => draft.setDraftGlobal({ condition: null }));
  await waitFor(() => expect(screen.queryByText(/커스텀 조회 그룹 gone-9/)).toBeNull());
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
});
it('keeps the blocked-group note and the disabled Apply when the bar folds, starts folded, or the group is removed while folded (#2390)', async () => {
  localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'true');
  mount('', {}, true, undefined, createFakeSavedViewStore());
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toBeTruthy();
  act(() => draft.setDraftGlobal({ roomNames: ['PHOTO'], condition: { customGroup: ['gone-9'] } }));
  // Folded from the start: the target picker never mounted, yet the reason is said and Apply stays off.
  expect(await screen.findByText('커스텀 조회 그룹 gone-9: 없는 그룹. 대상에서 빼거나 다른 그룹을 고르세요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(screen.getByText('커스텀 조회 그룹 gone-9: 없는 그룹. 대상에서 빼거나 다른 그룹을 고르세요.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(screen.getByText('커스텀 조회 그룹 gone-9: 없는 그룹. 대상에서 빼거나 다른 그룹을 고르세요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  act(() => draft.setDraftGlobal({ condition: null }));
  await waitFor(() => expect(screen.queryByText(/커스텀 조회 그룹 gone-9/)).toBeNull());
  expect(screen.getByRole('button', { name: '적용' })).toBeEnabled();
});
it.each(['reference', 'unsupported'] as const)('lets a carried custom group under %s Condition block nothing and never looks it up (#2390)', async capability => {
  const carried = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: registry.menus.map(menu => ({ ...menu, context: { ...menu.context, condition: capability } })) });
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const store = createFakeSavedViewStore();
  const list = vi.spyOn(store, 'list');
  render(<I18nProvider><PlatformProvider registry={carried} savedViews={store} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', menuQuery: send })}><Probe /><GlobalContextBar /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: ['PHOTO'], condition: { customGroup: ['gone-9'] } }));
  await waitFor(() => expect(screen.getByRole('button', { name: '적용' })).toBeEnabled());
  expect(screen.queryByText(/커스텀 조회 그룹 gone-9:/)).toBeNull();
  expect(draft.draft.global.condition).toEqual({ customGroup: ['gone-9'] });
  expect(list).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'custom-group' }));
});
it.each([['reference', true], ['reference', false], ['unsupported', true], ['unsupported', false]] as const)('removes carried asOf owners under %s capability (Condition first: %s) without applying', async (capability, conditionFirst) => {
  const carried = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: registry.menus.map(menu => ({ ...menu, context: { ...menu.context, condition: capability, prcGroup: capability } })) });
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider registry={carried} equipmentAxes={[{ id: 'vendor', label: { ko: '공급사', en: 'Vendor' }, membershipHistory: true }]} adapter={testAdapter({ session: () => session, menuQuery: send })}><Probe /><GlobalContextBar /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], condition: { vendor: ['V1'] }, prcGroups: ['P1'], membershipBasis: 'asOf' }));
  fireEvent.click(screen.getByRole('button', { name: conditionFirst ? '지우기 공급사' : '지우기 PRC 그룹' }));
  expect(conditionFirst ? draft.draft.global.condition : draft.draft.global.prcGroups).toBeNull();
  expect(draft.draft.global.membershipBasis).toBe('asOf');
  fireEvent.click(screen.getByRole('button', { name: conditionFirst ? '지우기 PRC 그룹' : '지우기 공급사' }));
  expect(draft.draft.global.condition).toBeNull();
  expect(draft.draft.global.prcGroups).toBeNull();
  expect(draft.draft.global.membershipBasis).toBeNull();
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it('keeps named compact field groups and content-sized native date-time inputs, and uses product membership copy', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.getByRole('group', { name: '기간과 Scope' }).tagName).toBe('DIV');
  expect(screen.getByRole('group', { name: '설비 조건' }).tagName).toBe('DIV');
  expect(screen.getByRole('group', { name: '기간' })).not.toHaveClass('basis-full', 'flex-1');
  for (const name of ['시작 시각', '종료 시각 (제외)']) {
    expect(screen.getByLabelText(name)).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText(name)).not.toHaveClass('flex-1');
  }
  expect(screen.getByText('설비 조건이나 PRC 그룹을 선택하고 소속 이력을 확인하세요.')).toBeTruthy();
  expect(screen.getByRole('region', { name: '조회 조건' }).textContent).not.toMatch(/Condition|축|Draft/);
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(screen.getByRole('region', { name: '조회 조건' })).toHaveClass('sticky', 'top-[50px]');
});
it('keeps membership single-choice, explains the disabled history option and changes only the draft', async () => {
  const user = userEvent.setup();
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const membership = screen.getByRole('radiogroup', { name: '소속 기준' });
  const current = within(membership).getByRole('radio', { name: '지금 소속' });
  const historical = within(membership).getByRole('radio', { name: /그 시점 소속/ });
  expect(current).toBeChecked();
  expect(historical).toBeDisabled();
  expect(historical).toHaveAccessibleDescription('설비 조건이나 PRC 그룹을 선택하고 소속 이력을 확인하세요.');
  fireEvent.click(historical);
  expect(draft.draft.global.membershipBasis).toBeNull();
  await user.click(current);
  await user.keyboard('{ArrowRight}');
  expect(current).toHaveFocus();
  expect(current).toBeChecked();
  act(() => draft.setDraftGlobal({ condition: { vendor: ['V1'] } }));
  expect(historical).toBeEnabled();
  await user.keyboard('{ArrowRight}');
  await waitFor(() => expect(historical).toBeChecked());
  expect(historical).toHaveFocus();
  expect(current).not.toBeChecked();
  expect(draft.draft.global.membershipBasis).toBe('asOf');
  await user.keyboard('{ArrowLeft}');
  await waitFor(() => expect(current).toBeChecked());
  expect(draft.draft.global.membershipBasis).toBeNull();
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(current, { key: 'Escape' });
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toHaveFocus();
});
it('keeps expanded action order and puts revert and reset in the folded overflow', async () => {
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}>
    <QueryBar historySlot={<button>History fixture</button>} viewSlot={<button>View fixture</button>} />
  </PlatformProvider></I18nProvider>);
  const names = () => within(screen.getByRole('group', { name: '조회 조건 동작' })).getAllByRole('button').map(button => button.textContent);
  await waitFor(() => expect(names()).toEqual(['초안 되돌리기', '조건 초기화', 'History fixture', 'View fixture', '적용']));
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(names()).toEqual(['History fixture', 'View fixture', '적용', '']);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '조회 조건 동작' }));
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['초안 되돌리기', '조건 초기화', '현재 조건 공유']);
});
it('searches the facts locally without calling the removed equipment search port (#823)', async () => {
  const searchEquipment = vi.fn();
  mount('', { searchEquipment });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(screen.getByRole('button', { name: /^대상 (전체|조건|고정)/ }));
  await screen.findByRole('button', { name: '조건 적용 · 2대' });
  const input = screen.getByRole('textbox', { name: /검색/ });
  for (const text of ['E', 'E1']) fireEvent.change(input, { target: { value: text } });
  expect(searchEquipment).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toHaveTextContent('E1');
});

it('no server anchor (defaultRangeTo null): no default period is invented, relative presets are off, the gate asks for a period', async () => {
  mount('', { defaultRangeTo: () => null });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(platform.defaultRangeTo).toBeNull();
  expect(draft.draft.global.from).toBeNull();
  expect(draft.draft.global.to).toBeNull();
  expect(window.location.search).not.toMatch(/from=|to=/);
  for (const name of ['최근 24시간', '최근 7일', '오늘']) expect(screen.getByRole('button', { name })).toBeDisabled();
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  expect(draft.missing.length).toBeGreaterThan(0);
  expect(send).not.toHaveBeenCalled();
});

it('no server anchor: an explicit period in the address still applies and queries', async () => {
  mount('&from=2026-01-01T00:00:00&to=2026-01-02T00:00:00&roomNames=PHOTO', { defaultRangeTo: () => null });
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(platform.global.from).toBe('2026-01-01T00:00:00');
  expect(platform.global.to).toBe('2026-01-02T00:00:00');
  fireEvent.click(await screen.findByRole('button', { name: '조회 조건 펼치기' })); // an applied address starts collapsed (#1892)
  expect(screen.getByRole('button', { name: '최근 24시간' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '최근 24시간' })).toHaveAttribute('aria-pressed', 'false');
});

it('no server anchor: the custom range editor starts blank', async () => {
  mount('', { defaultRangeTo: () => null });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(screen.getByRole('button', { name: '직접 범위' }));
  for (const label of ['시작 시각', '종료 시각 (제외)']) expect(screen.getByLabelText(label)).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  expect(screen.getByLabelText('기준일')).toHaveValue('');
});

function Body() { const query = useMenuQuery(endpoint, null); return <QueryView query={query}>{() => <span>result</span>}</QueryView>; }
function mountPage(query: string, collapsed: boolean, completed = false, options?: { defaultRangeTo?: PlatformAdapter['defaultRangeTo'] }) {
  window.history.replaceState(null, '', `/?scopeId=MEM${query}`);
  if (collapsed) localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'true');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} slots={{ contextBar: <GlobalContextBar /> }} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', menuQuery: send, listEquipmentFacts: async () => ({ version: '1', items: [{ equipmentId: 'E1', room: 'PHOTO', axes: {} }] }), ...options })}><Probe /><PlatformPage layout="fill" queryResult={completed ? { status: 'done', completedAt: 1_800_000_000_000 } : undefined}><Body /></PlatformPage></PlatformProvider></I18nProvider>);
}
const STRIP = { name: '적용된 조회 조건' };
const idleBody = () => screen.getAllByRole('status').find(node => node.textContent?.includes('아직 조회하지 않았습니다'))!;
it.each([['bar', barRegion], ['body', idleBody]] as const)('opens the process facet from the %s missing-condition button', async (_place, region) => {
  mountPage('&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00', true);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const opener = within(region()).getByRole('button', { name: '공정을 선택하세요' });
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  expect(await within(dialog).findByRole('button', { name: 'PHOTO만 선택' })).toBeVisible();
  expect(within(dialog).getByRole('button', { name: /공정 전체/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
  await waitFor(() => expect(within(region()).getByRole('button', { name: '공정을 선택하세요' })).toHaveFocus());
});
function barRegion() { return screen.getByRole('region', { name: '조회 조건' }); }
it('moves focus to a genuinely missing period from the idle body', async () => {
  mountPage('', true, false, { defaultRangeTo: () => null });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(within(idleBody()).getByRole('button', { name: '기간을 선택하세요' }));
  expect(screen.getByLabelText('시작 시각')).toHaveFocus();
});
it('idle: the seeded default period is missing from the applied values but not from the bar, so the list stays (#1170)', async () => {
  mountPage('', false);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const idle = screen.getAllByRole('status').find(node => node.textContent?.includes('아직 조회하지 않았습니다'))!;
  expect(idle).toHaveTextContent('기간을 조회에 사용하려면 적용을 누르세요.');
  expect(idle).not.toHaveTextContent('기간을 선택하세요');
  expect(idle).not.toHaveTextContent('위 조회 조건의 안내를 확인하세요.');
});
it('idle: a draft that fixed the missing item but is not applied no longer covers the applied list, so the list stays (#1170)', async () => {
  mountPage('&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00', false);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => { draft.setDraftGlobal({ roomNames: ['PHOTO'], from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00' }); });
  const idle = screen.getAllByRole('status').find(node => node.textContent?.includes('아직 조회하지 않았습니다'))!;
  expect(within(idle).getAllByRole('listitem').length).toBeGreaterThan(0);
  expect(idle).not.toHaveTextContent('위 조회 조건의 안내를 확인하세요.');
});
it('folded workspace: result time is in the query bar and applied values remain in its summary (#1941)', async () => {
  mountPage('&roomNames=PHOTO&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00', true, true);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.queryByRole('region', STRIP)).toBeNull();
  expect(document.querySelector('[data-workspace-query-row]')).toHaveTextContent('요약 조회 완료');
  expect(document.querySelector('summary')).toHaveTextContent('공정 PHOTO');
});
it('folded workspace: edits stay in the query bar and expanding restores applied values with time (#1941)', async () => {
  mountPage('&roomNames=PHOTO&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00', true, true);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => { draft.setDraftGlobal({ roomNames: ['ETCH'] }); });
  expect(screen.queryByRole('region', STRIP)).toBeNull();
  expect(document.querySelector('[data-workspace-query-row]')).toHaveTextContent('요약 조회 완료');
  act(() => { draft.revert(); });
  expect(screen.queryByRole('region', STRIP)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  expect(screen.getByRole('region', STRIP)).toHaveTextContent(/공정 PHOTO.*요약 조회 완료/);
});
function OpenEditor() { const focus = useFocusContextEditor(); return <button type="button" onClick={focus}>조건 편집 열기</button>; }
it('opens a folded Context editor through the function the bar registers, with no markup search (#2361)', async () => {
  window.history.replaceState(null, '', '/?scopeId=MEM');
  localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'true');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} slots={{ contextBar: <GlobalContextBar /> }} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', menuQuery: send })}><Probe /><PlatformPage layout="fill" queryResult={undefined}><OpenEditor /></PlatformPage></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '조건 편집 열기' }));
  expect(screen.getByRole('button', { name: '조회 조건 접기' })).toBeVisible();
  expect(screen.getByRole('button', { name: '최근 24시간' })).toHaveFocus();
});
it.each([['compact', 'px-4'], ['comfortable', 'px-3']] as const)('%s page: the collapsed query bar row insets %s so it lines up with the content (#1166)', async (density, inset) => {
  window.history.replaceState(null, '', '/?scopeId=MEM');
  localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'true');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} slots={{ contextBar: <GlobalContextBar /> }} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', menuQuery: send })}><Probe /><PlatformPage density={density}><Body /></PlatformPage></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  const row = screen.getByRole('button', { name: '조회 조건 펼치기' }).parentElement as HTMLElement;
  expect(row.className).toContain(inset);
  expect(row.className).not.toContain(inset === 'px-4' ? 'px-3' : 'px-4');
  const content = document.querySelector('[data-platform-page-content]') as HTMLElement;
  if (density === 'compact') expect(content.className).toContain('px-4');
});

const APPLIED = '&roomNames=PHOTO&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00';
const bar = () => screen.getByRole('region', { name: '조회 조건' });
describe('initial disclosure (#1892)', () => {
  it('starts collapsed when the incoming URL already carries an applied query', async () => {
    mount(APPLIED);
    await waitFor(() => expect(bar()).toHaveAttribute('data-query-bar-collapsed'));
    expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toBeTruthy();
  });
  it('starts expanded while required conditions are missing, and stays expanded after validation settles', async () => {
    mount('');
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(bar()).not.toHaveAttribute('data-query-bar-collapsed');
    expect(screen.getByRole('button', { name: '조회 조건 접기' })).toBeTruthy();
  });
  it('opens once validation settles when the address has a period but a required condition is missing', async () => {
    mount('&from=2026-01-01T01:00:00&to=2026-01-02T01:00:00');
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await waitFor(() => expect(bar()).not.toHaveAttribute('data-query-bar-collapsed'));
  });
  it('draws an applied address collapsed on the first commit, with no open-then-fold flash', () => {
    mount(APPLIED);
    expect(bar()).toHaveAttribute('data-query-bar-collapsed');
  });
  it.each([['forbidden', async () => ({ status: 'forbidden' as const, grantedRooms: [] })], ['unknown_scope', async () => ({ status: 'unknown_scope' as const, grantedRooms: [] })], ['error', async () => { throw new Error('offline'); }]])('opens an applied address whose Scope ends as %s, because no query can run', async (status, validateScope) => {
    mount(APPLIED, { validateScope });
    await waitFor(() => expect(platform.scope.status).toBe(status));
    await waitFor(() => expect(bar()).not.toHaveAttribute('data-query-bar-collapsed'));
  });
  it('keeps the bar open after an edit made while Scope validation is still pending, also once validation completes', async () => {
    let finish: (value: { status: 'valid'; grantedRooms: string[] }) => void = () => {};
    mount(APPLIED, { validateScope: () => new Promise(resolve => { finish = resolve; }) });
    await waitFor(() => expect(platform.scope.status).toBe('validating'));
    expect(bar()).toHaveAttribute('data-query-bar-collapsed');
    act(() => { draft.setDraftGlobal({ roomNames: ['ETCH'] }); });
    await waitFor(() => expect(bar()).not.toHaveAttribute('data-query-bar-collapsed'));
    await act(async () => { finish({ status: 'valid', grantedRooms: [] }); });
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(bar()).not.toHaveAttribute('data-query-bar-collapsed');
  });
  it('keeps a manual choice made while Scope validation is pending', async () => {
    let finish: (value: { status: 'valid'; grantedRooms: string[] }) => void = () => {};
    mount(APPLIED, { validateScope: () => new Promise(resolve => { finish = resolve; }) });
    await waitFor(() => expect(platform.scope.status).toBe('validating'));
    fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
    await act(async () => { finish({ status: 'valid', grantedRooms: [] }); });
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(bar()).not.toHaveAttribute('data-query-bar-collapsed');
  });
  it('lets a stored expanded choice win over an applied URL, and a stored collapsed choice over a bare one', async () => {
    localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'false');
    mount(APPLIED);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(bar()).not.toHaveAttribute('data-query-bar-collapsed');
    cleanup();
    localStorage.setItem('platform:query-bar-collapsed:v1:u1:home', 'true');
    mount('');
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(bar()).toHaveAttribute('data-query-bar-collapsed');
  });
  it('keeps the bar open once the user edits, and a toggle is remembered per menu', async () => {
    mount(APPLIED);
    await waitFor(() => expect(bar()).toHaveAttribute('data-query-bar-collapsed'));
    fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
    expect(bar()).not.toHaveAttribute('data-query-bar-collapsed');
    expect(localStorage.getItem('platform:query-bar-collapsed:v1:u1:home')).toBe('false');
  });
});

it.each([['ko', '대상 지우기', '전체'], ['en', 'Clear targets', 'All']] as const)('shows target clear only for a value and resets the target to all in %s (#1995)', async (lang, clearLabel, placeholder) => {
  localStorage.setItem('platform:lang', lang);
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.queryByRole('button', { name: clearLabel })).toBeNull();
  expect(screen.getByRole('button', { name: /^(대상|Targets) / })).toHaveTextContent(placeholder);
  act(() => draft.setDraftGlobal({ selection: ['EQ-X'] }));
  const clear = screen.getByRole('button', { name: clearLabel });
  expect(clear.querySelector('svg')).toBeTruthy();
  fireEvent.click(clear);
  expect(draft.draft.global.selection).toBeNull();
  expect(screen.queryByRole('button', { name: clearLabel })).toBeNull();
});

it('derives one period error and clears reference invalidity on a mode switch (#2028 SHE-15)', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.change(screen.getByLabelText('시작 시각'), { target: { value: '' } });
  expect(screen.getAllByText('유효한 시작·종료 시각을 입력하세요.')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '최근 24시간' }));
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  fireEvent.change(screen.getByLabelText('기준일'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '직접 범위' }));
  expect(screen.queryByText('유효한 시작·종료 시각을 입력하세요.')).toBeNull();
  expect(screen.getByLabelText('시작 시각')).not.toHaveAttribute('aria-invalid');
});


it('shares the query bar list with one menu query on each Apply (#2470)', async () => {
  const store = createFakeSavedViewStore([testSavedView({ id: 'g1', kind: 'custom-group', savedScopeId: 'MEM', target: { fixed: ['E1'] } })]);
  let release!: () => void;
  store.listHold = new Promise<void>(resolve => { release = resolve; });
  const list = vi.spyOn(store, 'list');
  const groupedEndpoint = defineEndpoint<null, unknown>({ ...endpoint, context: { time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply' } });
  let query!: ReturnType<typeof useMenuQuery>;
  function GroupQuery() { query = useMenuQuery(groupedEndpoint, null); return null; }
  window.history.replaceState(null, '', '/' + buildQuery({ scopeId: 'MEM', from: '2026-01-01T00:00:00', to: '2026-01-02T00:00:00', roomNames: ['PHOTO'], lineNames: null, prcGroups: null, condition: { customGroup: ['g1'] }, membershipBasis: null, selection: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null }));
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, menuQuery: send, listEquipmentFacts: async () => ({ version: '1', items: [{ equipmentId: 'E1', room: 'PHOTO', axes: {} }] }) })}><GroupQuery /><QueryBar /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(query.status).toBe('loading'));
  await act(async () => { release(); });
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(list).toHaveBeenCalledTimes(1);
  act(() => query.refetch());
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(list).toHaveBeenCalledTimes(2);
});


it('folds a pane editor after the controlled address acknowledges Apply', async () => {
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const initial = { menuId: 'home', params: {}, query: `?${APPLIED.slice(1)}&scopeId=MEM` };
  let acknowledge: (() => void) | undefined;
  function Board() {
    const [current, setCurrent] = useState(initial);
    return <PaneQueryDraftProvider screens={{ p1: current }}><PaneScreenProvider paneId="p1" screen={current}
      onChange={next => { acknowledge = () => setCurrent(next); }} onLeave={() => {}}><Probe /><GlobalContextBar /></PaneScreenProvider></PaneQueryDraftProvider>;
  }
  window.history.replaceState(null, '', '/?scopeId=MEM');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Board /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 펼치기' }));
  act(() => draft.setDraftGlobal({ roomNames: ['ETCH'] }));
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(draft.applying).toBe(false));
  expect(acknowledge).toBeDefined();
  expect(screen.getByRole('button', { name: '조회 조건 접기' })).toBeVisible();
  act(() => acknowledge?.());
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toBeVisible();
  expect(platform.global.roomNames).toEqual(['ETCH']);
});
