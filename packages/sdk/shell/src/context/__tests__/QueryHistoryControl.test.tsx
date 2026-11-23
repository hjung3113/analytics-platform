import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildQuery, emptyGlobal, type QueryHistoryStore, groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { QueryBarExtensionContext } from '@ap/components';
import { GlobalContextBar } from '../GlobalContextBar';
const menu = { id: 'home', group: groupId('overview'), primary: true, path: '/', icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['filter'], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: menu.label, icon: House, space: spaceId('mars') }], menus: [menu] });
const global = { ...emptyGlobal, from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
let draft: ReturnType<typeof useQueryDraft>;
function Probe() { draft = useQueryDraft(); return null; }
async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: '조회 조건 동작' });
  await user.click(trigger);
  await user.click(screen.getByRole('menuitem', { name: '최근 조건' }));
  return trigger;
}
const entries = [
  { id: 'a', query: buildQuery(global, [['filter', 'own-history']]), schemaVersion: 1 as const, count: 1, lastAppliedAt: 2 },
  { id: 'b', query: buildQuery({ ...global, roomNames: ['SECRET'] }), schemaVersion: 1 as const, count: 1, lastAppliedAt: 1 },
];
function mount(enabled = true, rows = entries) {
  const store: QueryHistoryStore = { list: vi.fn(async () => rows), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  const session = testSession(['platform:view']);
  window.history.replaceState(null, '', '/' + buildQuery(global));
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} queryHistory={enabled ? store : undefined}><Probe /><GlobalContextBar /></PlatformProvider></I18nProvider>);
  return store;
}
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('opens history directly from the folded overflow and restores focus', async () => {
  const user = userEvent.setup();
  mount();
  const overflow = await openHistory(user);
  expect(await screen.findByRole('button', { name: /기간 09-01/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: '최근 조건' })).toBeNull();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(overflow).toHaveFocus());
});
it.each(['Enter', 'Space'] as const)('restores a clean draft with %s and returns focus on Escape', async key => {
  mount();
  const user = userEvent.setup();
  const trigger = await openHistory(user);
  const restore = await screen.findByRole('button', { name: /기간 09-01/ });
  act(() => restore.focus());
  await user.keyboard(key === 'Enter' ? '{Enter}' : ' ');
  await waitFor(() => expect(draft.draft.page).toEqual([['filter', 'own-history']]));
  expect(window.location.search).not.toContain('own-history');
  await waitFor(() => expect(trigger).toHaveFocus());
  await openHistory(user);
  fireEvent.keyDown(await screen.findByRole('list', { name: '최근 조회 조건' }), { key: 'Escape' });
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('does not expose raw page keys in history summaries', async () => {
  mount();
  await openHistory(userEvent.setup());
  const restore = await screen.findByRole('button', { name: /기간 09-01/ });
  expect(restore).not.toHaveTextContent('filter');
  expect(restore).not.toHaveTextContent('own-history');
});
it('masks unavailable values and cancels clear confirmation', async () => {
  const store = mount();
  await openHistory(userEvent.setup());
  const unavailable = await screen.findByRole('button', { name: /현재 사용할 수 없음/ });
  expect(unavailable).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(unavailable);
  expect(draft.draft.page).toEqual([]);
  expect(document.body.innerHTML).not.toContain('SECRET');
  fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(store.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
  fireEvent.click(screen.getByRole('button', { name: '지우기 확인' }));
  await waitFor(() => expect(store.clear).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getAllByRole('button', { name: /조건 삭제/ })[0]);
  await waitFor(() => expect(store.remove).toHaveBeenCalledWith(expect.anything(), 'a'));
});
it('has no control without an injected store', () => {
  mount(false); expect(screen.queryByRole('button', { name: '최근 조건' })).toBeNull();
});

it('labels a history entry from less than a minute ago as just now', async () => {
  mount(true, [{ ...entries[0], lastAppliedAt: Date.now() - 20_000 }]);
  await openHistory(userEvent.setup());
  await screen.findByRole('button', { name: /기간 09-01/ });
  expect(screen.getByText('방금')).toBeVisible();
});

it('keeps keyboard focus through clear confirmation, cancellation and the empty list', async () => {
  const store = mount();
  vi.mocked(store.clear).mockImplementation(async () => { vi.mocked(store.list).mockResolvedValue([]); });
  await openHistory(userEvent.setup());
  await screen.findByRole('button', { name: /기간 09-01/ });
  const clear = screen.getByRole('button', { name: '모두 지우기' });
  act(() => clear.focus());
  fireEvent.click(clear);
  const cancel = screen.getByRole('button', { name: '취소' });
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  expect(screen.getByRole('button', { name: '모두 지우기' })).toHaveFocus();
  expect(store.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
  const confirm = screen.getByRole('button', { name: '지우기 확인' });
  act(() => confirm.focus());
  fireEvent.click(confirm);
  await screen.findByText('최근 조회 조건이 없습니다.');
  expect(store.clear).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('list', { name: '최근 조회 조건' })).toHaveFocus();
});

it.each(['click', 'Enter'] as const)('confirms replacing a dirty draft selected by %s', async gesture => {
  mount();
  const user = userEvent.setup();
  const trigger = await openHistory(user);
  const restore = await screen.findByRole('button', { name: /기간 09-01/ });
  act(() => draft.setDraftPage({ filter: 'unapplied' }));
  const choose = async () => {
    if (gesture === 'click') await user.click(restore);
    else { act(() => restore.focus()); await user.keyboard('{Enter}'); }
  };

  await choose();
  expect(screen.getByRole('group', { name: '적용하지 않은 변경이 있습니다. 이 조건으로 바꿀까요?' })).toBeVisible();
  expect(draft.draft.page).toEqual([['filter', 'unapplied']]);
  const cancel = screen.getByRole('button', { name: '취소' });
  expect(cancel).toHaveFocus();
  await user.click(cancel);
  expect(draft.draft.page).toEqual([['filter', 'unapplied']]);
  expect(screen.queryByRole('button', { name: '바꾸기' })).toBeNull();
  expect(restore).toHaveFocus();

  await choose();
  await user.click(screen.getByRole('button', { name: '바꾸기' }));
  await waitFor(() => expect(draft.draft.page).toEqual([['filter', 'own-history']]));
  expect(window.location.search).not.toContain('own-history');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger).toHaveFocus();
});

it('names the history dialog', async () => {
  mount();
  await openHistory(userEvent.setup());
  expect(await screen.findByRole('dialog', { name: '최근 조건' })).toBeVisible();
});

it('pairs each restore button with its delete button and focuses the surviving row after deletion', async () => {
  const store = mount();
  vi.mocked(store.remove).mockImplementation(async () => { vi.mocked(store.list).mockResolvedValue([entries[1]]); });
  const user = userEvent.setup();
  await openHistory(user);
  const first = await screen.findByRole('button', { name: /기간 09-01/ });
  const last = await screen.findByRole('button', { name: /현재 사용할 수 없음/ });
  const list = screen.getByRole('list', { name: '최근 조회 조건' });
  const [firstRow, lastRow] = within(list).getAllByRole('listitem');
  const remove = within(firstRow).getByRole('button', { name: '1번째 조건 삭제' });
  expect(firstRow).toContainElement(first);
  expect(lastRow).toContainElement(last);
  expect(within(lastRow).getByRole('button', { name: '2번째 조건 삭제' })).toBeVisible();
  expect(list).toHaveFocus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.tab();
  expect(remove).toHaveFocus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(store.remove).toHaveBeenCalledWith(expect.anything(), 'a'));
  await waitFor(() => expect(screen.getByRole('button', { name: /현재 사용할 수 없음/ })).toHaveFocus());
});

it.each([
  ['ArrowUp', null, 1], ['ArrowDown', null, 0],
  ['ArrowUp', 1, 0], ['ArrowDown', 0, 1], ['Home', 1, 0], ['End', 0, 1],
] as const)('%s moves focus from %s to restore button %s', async (key, from, to) => {
  mount();
  const user = userEvent.setup();
  await openHistory(user);
  const first = await screen.findByRole('button', { name: /기간 09-01/ });
  const last = await screen.findByRole('button', { name: /현재 사용할 수 없음/ });
  const buttons = [first, last];
  const start = from === null ? screen.getByRole('list', { name: '최근 조회 조건' }) : buttons[from];
  act(() => start.focus());
  await user.keyboard(`{${key}}`);
  expect(buttons[to]).toHaveFocus();
});
it('leads a history row with the declared drill steps only when the page opts in (#2770)', async () => {
  const drillMenu = { ...menu, pageKeys: ['line', 'tool', 'filter'], contextResetKeys: ['line', 'tool'], drill: { levels: [
    { key: 'line', label: { ko: '라인', en: 'Line' } },
    { key: 'tool', label: { ko: '설비', en: 'Tool' }, valueLabel: (value: string) => `설비 ${value.toUpperCase()}` },
  ] } };
  const drillRegistry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: menu.label, icon: House, space: spaceId('mars') }], menus: [drillMenu] });
  const rows = [{ id: 'd', query: buildQuery(global, [['tool', 'eq-7'], ['filter', 'x'], ['line', 'L1']]), schemaVersion: 1 as const, count: 1, lastAppliedAt: 2 }];
  const store: QueryHistoryStore = { list: vi.fn(async () => rows), record: vi.fn(async () => {}), remove: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  const session = testSession(['platform:view']);
  // A menu item for a declared step key (raw `tool`) must not replace the level's `valueLabel` name.
  const own = () => [{ key: 'tool', label: '설비', value: 'eq-7' }, { key: 'filter', label: '필터', value: 'x' }];
  const mountWith = (historyDrill: boolean | undefined) => {
    window.history.replaceState(null, '', '/' + buildQuery(global));
    return render(<I18nProvider><PlatformProvider registry={drillRegistry} adapter={testAdapter({ session: () => session })} queryHistory={store}>
      <QueryBarExtensionContext.Provider value={historyDrill === undefined ? { historyPageSummary: own } : { historyDrill, historyPageSummary: own }}><GlobalContextBar /></QueryBarExtensionContext.Provider>
    </PlatformProvider></I18nProvider>);
  };
  const user = userEvent.setup();
  mountWith(true);
  await openHistory(user);
  const row = await screen.findByRole('button', { name: /기간 09-01/ });
  // Declared order (line → tool), not the candidate's pair order; the step keeps its `valueLabel` name over the menu's raw item.
  expect(row).toHaveTextContent(/라인 L1 · 설비 설비 EQ-7 · 필터 x/);
  expect(row).not.toHaveTextContent('설비 eq-7');
  for (const off of [undefined, false]) {
    cleanup();
    mountWith(off);
    await openHistory(user);
    const plain = await screen.findByRole('button', { name: /기간 09-01/ });
    expect(plain).toHaveTextContent('설비 eq-7 · 필터 x');
    expect(plain).not.toHaveTextContent('라인');
    expect(plain).not.toHaveTextContent('EQ-7');
  }
});
