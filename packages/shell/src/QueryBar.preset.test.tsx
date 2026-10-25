import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineEndpoint, groupId, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useMenuQuery, useQueryDraft } from '@ap/kernel';
import { PaneQueryDraftProvider, PaneScreenProvider, useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar } from './GlobalContextBar';

// Condition presets in the QueryBar (06 §6.4, §11, ADR-0083): the switcher edits the draft, Apply sends the narrowed Condition.
const axes = [['maker', '제조사'], ['model', '모델'], ['stgroup', '스테이션 그룹'], ['team', '팀']].map(([id, ko]) => ({ id, label: { ko, en: id }, membershipHistory: false }));
const presetFields = {
  conditionPresets: [
    { id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker', 'model'] },
    { id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['stgroup', 'team'] },
  ],
  conditionPreset: { key: 'view', default: 'eqp' },
};
const menuOf = (withPresets: boolean) => ({ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const, condition: 'apply' as const }, query: { mode: 'apply' as const, required: { context: ['time' as const] } }, pageKeys: withPresets ? ['view'] : [], pageType: 'analysis' as const, features: { export: false, savedView: false, annotate: false, compare: false }, ...(withPresets ? presetFields : {}) });
const registryOf = (withPresets = true) => createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }], menus: [menuOf(withPresets)] });
const endpoint = defineEndpoint<null, unknown>({ id: 'fixture.preset-bar', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: false, context: { time: 'apply', condition: 'apply' }, requiredContext: ['time'], kinds: ['collection'], mergeTimeDomain: false });
const send = vi.fn(async (_request: { context: { condition?: unknown } }) => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
let draft: ReturnType<typeof useQueryDraft>;
let platform: ReturnType<typeof useHostPlatform>;
function Probe() { draft = useQueryDraft(); platform = useHostPlatform(); useMenuQuery(endpoint, null); return null; }
const period = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const groupParam = (condition: Record<string, string[]>) => `&equipmentGroup=${encodeURIComponent(JSON.stringify(condition))}`;
const condition = { maker: ['TEL'], team: ['T1'] };
const sentConditions = () => send.mock.calls.map(([request]) => request.context.condition);
function mount(query: string, withPresets = true) {
  window.history.replaceState(null, '', `/?${query}`);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider registry={registryOf(withPresets)} equipmentAxes={axes} adapter={testAdapter({ session: () => session, menuQuery: send as never })}><Probe /><GlobalContextBar /></PlatformProvider></I18nProvider>);
}
beforeEach(() => { send.mockClear(); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows the switcher first in the equipment fieldset with only the active preset\'s axes, and lists the rest as carried', async () => {
  mount(period + groupParam(condition));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(sentConditions()).toEqual([{ maker: ['TEL'] }]);
  const fieldset = screen.getByRole('group', { name: '설비 조건' });
  const switcher = within(fieldset).getByRole('radiogroup', { name: '조건 묶음' });
  expect(switcher.compareDocumentPosition(within(fieldset).getByRole('button', { name: '제조사' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(switcher).getByRole('radio', { name: '설비 기준' })).toBeChecked();
  expect(within(fieldset).queryByRole('button', { name: '팀' })).toBeNull();
  const carried = screen.getByRole('group', { name: '전달된 조건' });
  expect(carried).toHaveTextContent('팀 T1 · 설비 기준에서 미적용');
  expect(within(carried).getByRole('button', { name: /팀/ })).toBeTruthy();
});

it('switching only edits the draft; Apply sends one narrowed request and the applied text drops the outside values', async () => {
  const { container } = mount(period + groupParam(condition));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('radio', { name: '조직 기준' }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(draft.draft.page).toEqual([['view', 'org']]);
  expect(screen.getAllByText('조건 묶음: 조직 기준. 1개 조건은 이 보기에서 미적용입니다.')).toHaveLength(1);
  expect(screen.getByRole('group', { name: '전달된 조건' })).toHaveTextContent('제조사 TEL · 조직 기준에서 미적용');
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(sentConditions().at(-1)).toEqual({ team: ['T1'] });
  expect(platform.global.condition).toEqual(condition);
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  const [editing, applied] = Array.from(container.querySelectorAll('details p')).map(node => node.textContent ?? '');
  expect(editing).toContain('조건 묶음 조직 기준');
  expect(applied).toContain('팀 T1');
  expect(applied).toContain('조건 묶음 조직 기준');
  expect(applied).not.toContain('제조사 TEL');
  expect(applied).not.toContain('view org');
});

it('summaries use the draft preset for editing text and the applied preset for applied text', async () => {
  const { container } = mount(period + groupParam(condition));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('radio', { name: '조직 기준' }));
  fireEvent.click(screen.getByRole('button', { name: '조회 조건 접기' }));
  const [editing, applied] = Array.from(container.querySelectorAll('details p')).map(node => node.textContent ?? '');
  expect(editing).toContain('조건 묶음 조직 기준');
  expect(editing).toContain('팀 T1');
  expect(applied).toContain('조건 묶음 설비 기준');
  expect(applied).toContain('제조사 TEL');
  expect(applied).not.toContain('팀 T1');
});

it('adds the outside-count sentence only when the switch leaves conditions out', async () => {
  mount(period + groupParam({ maker: ['TEL'] }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('radio', { name: '조직 기준' }));
  expect(screen.getAllByText('조건 묶음: 조직 기준. 1개 조건은 이 보기에서 미적용입니다.')).toHaveLength(1);
  fireEvent.click(screen.getByRole('radio', { name: '설비 기준' }));
  expect(screen.getAllByText('조건 묶음: 설비 기준.')).toHaveLength(1);
});

it('clearing an outside value from the carried group removes it from the global Condition', async () => {
  mount(period + groupParam(condition));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  fireEvent.click(within(screen.getByRole('group', { name: '전달된 조건' })).getByRole('button', { name: /팀/ }));
  expect(draft.draft.global.condition).toEqual({ maker: ['TEL'] });
});

it('has no switcher and no carried chip on a menu without presets', async () => {
  mount(period + groupParam(condition), false);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('radiogroup', { name: '조건 묶음' })).toBeNull();
  expect(sentConditions()).toEqual([condition]);
  expect(screen.queryByRole('group', { name: '전달된 조건' })).toBeNull();
});

it('the disclosure trigger keeps its name and shows a chevron that follows aria-expanded', () => {
  mount(period);
  const open = screen.getByRole('button', { name: '조회 조건 접기' });
  expect(open).toHaveAttribute('aria-expanded', 'true');
  expect(open).toHaveTextContent('조회 조건');
  expect(open.querySelector('svg.lucide-chevron-down')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(open);
  const closed = screen.getByRole('button', { name: '조회 조건 펼치기' });
  expect(closed).toHaveAttribute('aria-expanded', 'false');
  expect(closed.querySelector('svg.lucide-chevron-right')).toBeTruthy();
});

it('board pane: same switcher and notice in the popover, the draft stays per pane, chevron on the trigger', async () => {
  const screens = { p1: { menuId: 'home', params: {}, query: `?${period}${groupParam(condition)}` } };
  const session = testSession(['platform:view']);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registryOf()} equipmentAxes={axes} adapter={testAdapter({ session: () => session, menuQuery: send as never })}>
    <PaneQueryDraftProvider screens={screens}><PaneScreenProvider paneId="p1" screen={screens.p1} onChange={() => {}} onLeave={() => {}}><Probe /><GlobalContextBar /></PaneScreenProvider></PaneQueryDraftProvider>
  </PlatformProvider></I18nProvider>);
  const trigger = screen.getByRole('button', { name: '조회 조건 펼치기' });
  expect(trigger.querySelector('svg.lucide-chevron-right')).toBeTruthy();
  fireEvent.click(trigger);
  const switcher = await screen.findByRole('radiogroup', { name: '조건 묶음' });
  expect(within(switcher).getByRole('radio', { name: '설비 기준' })).toBeChecked();
  expect(screen.getByRole('button', { name: '조회 조건 접기' }).querySelector('svg.lucide-chevron-down')).toBeTruthy();
  act(() => { fireEvent.click(within(switcher).getByRole('radio', { name: '조직 기준' })); });
  expect(draft.draft.page).toEqual([['view', 'org']]);
  expect(screen.getAllByText('조건 묶음: 조직 기준. 1개 조건은 이 보기에서 미적용입니다.')).toHaveLength(1);
  expect(screen.getByText(/^편집 중 조건 · .*조건 묶음 조직 기준/)).toBeTruthy();
  expect(screen.getByText(/^적용 조건 · .*조건 묶음 설비 기준/)).toBeTruthy();
});
