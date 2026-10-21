import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildQuery, emptyGlobal, type QueryHistoryStore } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar } from './GlobalContextBar';
const menu = { id: 'home', group: 'overview' as const, primary: true, path: '/', icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['filter'], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: menu.label, icon: House, space: 'analytics' }], menus: [menu] });
const global = { ...emptyGlobal, from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
let draft: ReturnType<typeof useQueryDraft>;
function Probe() { draft = useQueryDraft(); return null; }
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
it('opens the confirmed history slot, restores draft with keyboard, and returns focus on Escape', async () => {
  mount();
  const trigger = screen.getByRole('button', { name: '최근 조건' });
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: /own-history/ });
  act(() => option.focus());
  fireEvent.keyDown(option, { key: 'Enter' });
  await waitFor(() => expect(draft.draft.page).toEqual([['filter', 'own-history']]));
  expect(window.location.search).not.toContain('own-history');
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger);
  fireEvent.keyDown(await screen.findByRole('listbox'), { key: 'Escape' });
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('masks unavailable values, keeps remove outside options and cancels clear confirmation', async () => {
  const store = mount();
  fireEvent.click(screen.getByRole('button', { name: '최근 조건' }));
  await screen.findByRole('option', { name: /현재 사용할 수 없음/ });
  expect(document.body.innerHTML).not.toContain('SECRET');
  expect(screen.getAllByRole('option').every(option => option.querySelector('button') === null)).toBe(true);
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
  fireEvent.click(screen.getByRole('button', { name: '최근 조건' }));
  await screen.findByRole('option', { name: /own-history/ });
  expect(screen.getByText('방금')).toBeVisible();
});

it('keeps keyboard focus through clear confirmation, cancellation and the empty list', async () => {
  const store = mount();
  vi.mocked(store.clear).mockImplementation(async () => { vi.mocked(store.list).mockResolvedValue([]); });
  fireEvent.click(screen.getByRole('button', { name: '최근 조건' }));
  await screen.findByRole('option', { name: /own-history/ });
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
  expect(screen.getByRole('listbox')).toHaveFocus();
});
