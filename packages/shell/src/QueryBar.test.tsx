import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineEndpoint, type PlatformAdapter, groupId, spaceId } from '@ap/contracts';
import { QueryBarExtensionContext, type QueryBarExtension } from '@ap/components';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft, useMenuQuery } from '@ap/kernel';
import { useHostPlatform, PaneQueryDraftProvider, PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar, contextBarVisible } from './GlobalContextBar';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', prcGroup: 'apply' }, query: { mode: 'apply', required: { context: ['time', 'roomNames'] } }, pageKeys: ['grain'], pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false } }] });
const endpoint = defineEndpoint<null, unknown>({ id: 'fixture.query', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: true, context: { time: 'apply', roomNames: 'apply' }, requiredContext: ['time', 'roomNames'], kinds: ['collection'], mergeTimeDomain: false });
const send = vi.fn(async () => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
let draft: ReturnType<typeof useQueryDraft>;
let platform: ReturnType<typeof useHostPlatform>;
function Probe() { draft = useQueryDraft(); platform = useHostPlatform(); useMenuQuery(endpoint, null); return null; }
const evaluate = vi.fn();
function mount(query = '', overrides: Partial<PlatformAdapter> = {}, history = true, extension?: QueryBarExtension) {
  window.history.replaceState(null, '', `/?scopeId=MEM${query}`);
  const session = testSession(['platform:view']);
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={[{ id: 'vendor', label: { ko: '공급사', en: 'Vendor' }, membershipHistory: history }, { id: 'model', label: { ko: '모델', en: 'Model' }, membershipHistory: true, dependsOn: 'vendor' }]} adapter={testAdapter({ session: () => session, defaultRangeTo: () => '2026-01-01T09:31:22', evaluateSelection: evaluate, menuQuery: send, ...overrides })}><Probe /><QueryBarExtensionContext.Provider value={extension}><GlobalContextBar /></QueryBarExtensionContext.Provider></PlatformProvider></I18nProvider>);
  return push;
}
beforeEach(() => { send.mockClear(); evaluate.mockClear(); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('edits a page/global draft without URL writes, counts raw keys, applies once and does not use legacy evaluation', async () => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  const room = screen.getByRole('button', { name: '공정' });
  expect(room).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById(room.getAttribute('aria-describedby')!)).toHaveTextContent('공정');
  act(() => { draft.setDraftGlobal({ roomNames: ['PHOTO'] }); draft.setDraftPage({ grain: 'day' }); });
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByText(`적용 안 된 변경 ${draft.dirty.length}개`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  expect(push).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(evaluate).not.toHaveBeenCalled();
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
it('retains child axes and IDs outside candidates with nonblocking explanations', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], condition: { vendor: ['V1'], model: ['M1'] }, selection: ['EQ-X'] }));
  act(() => draft.setDraftGlobal({ condition: { vendor: ['V2'], model: ['M1'] } }));
  expect(draft.draft.global.condition?.model).toEqual(['M1']);
  expect(screen.getAllByText(/현재 후보에 없음/).length).toBeGreaterThan(0);
  expect(draft.canApply).toBe(true);
});
it('keeps visibility semantics for reference-only, carried unsupported, absent and apply values', () => {
  const g = { scopeId: null, from: null, to: null, roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null };
  expect(contextBarVisible(noContext, g)).toBe(false);
  expect(contextBarVisible({ ...noContext, time: 'reference' }, g)).toBe(true);
  expect(contextBarVisible(noContext, { ...g, lotIds: ['L'] })).toBe(true);
  expect(contextBarVisible({ ...noContext, time: 'apply' }, g)).toBe(true);
});

it('distinguishes explicit empty selection/rooms, removes the last Condition key and enables PRC-only history', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], selection: ['EQ-X'], condition: { vendor: ['V1'] } }));
  fireEvent.click(screen.getByRole('button', { name: '지우기 V1' }));
  expect(draft.draft.global.condition).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: /지우기 EQ-X/ })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /지우기 EQ-X/ }));
  expect(draft.draft.global.selection).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'EquipmentID 전체 후보로 되돌리기' }));
  expect(draft.draft.global.selection).toBeNull();
  expect(screen.getByRole('button', { name: 'EquipmentID 전체 후보로 되돌리기' })).toBeDisabled();
  expect(draft.canApply).toBe(true);
  act(() => draft.setDraftGlobal({ prcGroups: ['P1'] }));
  expect(screen.getByRole('button', { name: /그 시점 소속/ })).toBeEnabled();
});
it('shows metadata transport failures without dropping selections or blocking valid draft application', async () => {
  mount('', { listAxisOptions: async () => { throw new Error('axis unavailable'); }, searchEquipment: async () => { throw new Error('equipment unavailable'); }, resolveSelection: async () => { throw new Error('resolve unavailable'); } });
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], selection: ['EQ-X'] }));
  fireEvent.click(screen.getByRole('button', { name: 'EquipmentID' }));
  await waitFor(() => expect(screen.getByText(/equipment unavailable/)).toBeTruthy());
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'EquipmentID' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '공급사' }));
  await waitFor(() => expect(screen.getByText(/axis unavailable/)).toBeTruthy());
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
  fireEvent.click(screen.getByRole('button', { name: '공정 전체 후보로 되돌리기' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'EquipmentID' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'EquipmentID' }), { key: 'Escape' });
  expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: '최근 7일' }), { key: 'Escape' });
  await waitFor(() => expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toHaveFocus());
  expect(screen.getByText('적용 안 된 변경 1개')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pane two' }));
  expect(screen.getByText('적용 안 된 변경 0개')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pane one' }));
  expect(screen.getByText('적용 안 된 변경 1개')).toBeTruthy();
});

it('ignores unused history-incapable axes, then disables asOf when one becomes used', async () => {
  mount('', {}, false);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [], prcGroups: ['P'] }));
  expect(screen.getByRole('button', { name: /그 시점 소속/ })).toBeEnabled();
  act(() => draft.setDraftGlobal({ condition: { vendor: ['V'] } }));
  expect(screen.getByRole('button', { name: /그 시점 소속/ })).toBeDisabled();
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
it('keeps a blank reference date invalid across unrelated edits and collapse until a valid preset replaces it', async () => {
  const push = mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  act(() => draft.setDraftGlobal({ roomNames: [] }));
  fireEvent.click(screen.getByRole('button', { name: '기준일' }));
  fireEvent.change(screen.getByLabelText('기준일'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '공정 전체 후보로 되돌리기' }));
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
  fireEvent.click(screen.getByRole('button', { name: '지우기 V1' }));
  expect(draft.draft.global.condition).toBeNull();
  expect(draft.draft.global.membershipBasis).toBe(otherOwner ? 'asOf' : null);
  expect(push).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
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

it('reserves a full period row and date-time input widths, and uses product membership copy', async () => {
  mount();
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  expect(screen.getByRole('group', { name: '기간' })).toHaveClass('basis-full');
  expect(screen.getByLabelText('시작 시각')).toHaveClass('min-w-64');
  expect(screen.getByLabelText('종료 시각 (제외)')).toHaveClass('min-w-64');
  expect(screen.getByText('설비 조건이나 PRC 그룹을 선택하고 소속 이력을 확인하세요.')).toBeTruthy();
  expect(screen.getByRole('region', { name: '조회 조건' }).textContent).not.toMatch(/Condition|축|Draft/);
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  expect(screen.getByRole('region', { name: '조회 조건' })).toHaveClass('sticky', 'top-[50px]');
});
it('asks the equipment port once for a typed search, after typing pauses, not per key (#823)', async () => {
  const searchEquipment = vi.fn(async () => ({ outcome: 'ok' as const, data: { items: [], nextCursor: null }, assessments: [], trust: null, correlationId: 'test' }));
  mount('', { searchEquipment } as unknown as Partial<PlatformAdapter>);
  await waitFor(() => expect(platform.scope.status).toBe('valid'));
  fireEvent.click(screen.getByRole('button', { name: 'EquipmentID' }));
  const input = screen.getByRole('combobox', { name: 'EquipmentID' });
  await waitFor(() => expect(searchEquipment).toHaveBeenCalled());
  searchEquipment.mockClear();
  // Keys 50 ms apart, like typing: each one is its own task, so the port cache's same-tick cancellation does not merge them.
  for (const text of ['E', 'EQ', 'EQ-', 'EQ-0']) { fireEvent.change(input, { target: { value: text } }); await act(() => new Promise(resolve => setTimeout(resolve, 50))); }
  await new Promise(resolve => setTimeout(resolve, 600));
  const queries = (searchEquipment.mock.calls as unknown as [{ query?: string }][]).map(([request]) => request.query);
  expect(queries).toEqual(['EQ-0']);
});
