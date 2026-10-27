import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { RouteOutlet } from '../../routing/RouteOutlet';
import { renderHook } from '@testing-library/react';
import { MAX_SHEETS, addSheet } from '../boardModel';
import { useBoardSession } from '../boardSession';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, storedLegacy as stored, V1_KEY as KEY, V2_KEY } from '../__fixtures__/legacyBoard';
import type { BoardV1 as Board } from '../boardMigrate';
import { OpenInBoardAction } from '../OpenInBoardAction';
import { groupId, spaceId, type Session } from '@ap/contracts';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const };
const Page = () => <PlatformPage><p>page body</p></PlatformPage>;
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: ['tab'], ...over,
});
const withPage = (id: string, path: string, over: Record<string, unknown> = {}) => entry(id, path, { component: Page, ...over });
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...withPage('home', '/', { features: { ...features, board: false } }), primary: true },
    withPage('alpha', '/alpha', { label: { ko: '알파', en: 'Alpha' } }),
    withPage('beta', '/beta', { label: { ko: '베타', en: 'Beta' } }),
    withPage('item', '/item/:id', { navHidden: true, label: { ko: '품목', en: 'Item' } }),
  ],
});

const w1 = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const beta = { menuId: 'beta', params: {}, query: `?${w1}` };

function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={{ boardEntry: <OpenInBoardAction /> }}><RouteOutlet /></PlatformProvider></I18nProvider>);
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(await screen.findByRole('button', { name: '분석 보드에 열기…' }));
  await settle();
  return screen.findByRole('dialog', { name: '분석 보드에 열기' });
}

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('분석 보드에 열기… (docs/16 §6)', () => {
  it('offers three destinations, defaulting to a new sheet, and writes nothing before 열기', async () => {
    seed(boardOf([sheet('a', { panes: [beta] })]));
    mount(`/alpha?${w1}&tab=x`);
    await settle();
    const dialog = await openDialog();
    const group = within(dialog).getByRole('radiogroup', { name: '열 곳' });
    expect(within(group).getAllByRole('radio').map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(within(group).getByRole('radio', { name: '새 시트' })).toBeEnabled();
    expect(within(group).getByRole('radio', { name: '기존 시트의 빈 칸' })).toBeDisabled();
    expect(within(dialog).getByText('빈 칸이 없습니다')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('radio', { name: '기존 칸 바꾸기' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'a' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: '칸 1 · 베타' }));
    expect(within(dialog).getByText('칸 1의 화면을 바꿉니다')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(boardOf([sheet('a', { panes: [beta] })]));
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/mars/alpha');
  });

  it('새 시트: adds a 1×1 sheet holding this screen with its Context and page keys, then goes to /board?sheet=', async () => {
    seed(boardOf([sheet('a')]));
    mount(`/alpha?${w1}&tab=x`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(stored().sheets).toHaveLength(2);
    const added = stored().sheets[1];
    expect(added).toMatchObject({ layout: '1x1', panes: [{ menuId: 'alpha', params: {}, query: `?${w1}&tab=x` }] });
    expect(stored().activeSheetId).toBe(added.id);
    expect(window.location.pathname).toBe('/board');
    expect(window.location.search).toBe(`?sheet=${added.id}`);
    expect(await screen.findByRole('tab', { name: added.name })).toHaveAttribute('aria-selected', 'true');
  });

  it('기존 시트의 빈 칸: lists only sheets with an empty pane and only the empty panes, and fills the chosen one', async () => {
    seed(boardOf([sheet('full', { panes: [beta] }), sheet('roomy', { name: 'roomy', layout: '1x2', panes: [beta, null] })]));
    mount(`/item/7?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 시트의 빈 칸' }));
    expect(within(dialog).getByRole('button', { name: '열기' })).toBeDisabled();
    expect(within(dialog).queryByRole('radio', { name: 'full' })).toBeNull();
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'roomy' }));
    expect(within(dialog).queryByRole('radio', { name: '칸 1 · 베타' })).toBeNull();
    fireEvent.click(await within(dialog).findByRole('radio', { name: '칸 2 · 비어 있음' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(stored().sheets[1].panes).toEqual([beta, { menuId: 'item', params: { id: '7' }, query: `?${w1}` }]);
    expect(window.location.search).toBe('?sheet=roomy');
  });

  it('기존 칸 바꾸기: replaces the chosen pane only after the confirm', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [beta, beta] })]));
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 칸 바꾸기' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'a' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: '칸 2 · 베타' }));
    expect(stored().sheets[0].panes).toEqual([beta, beta]);
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(stored().sheets[0].panes).toEqual([beta, { menuId: 'alpha', params: {}, query: `?${w1}` }]);
    expect(window.location.pathname).toBe('/board');
    expect(window.location.search).toBe('?sheet=a');
  });

  it('at 20 sheets the new-sheet option is off with its reason and the default moves on', async () => {
    seed(boardOf(Array.from({ length: MAX_SHEETS }, (_, i) => sheet(`s${i}`, { panes: [beta] }))));
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    const option = within(dialog).getByRole('radio', { name: '새 시트' });
    expect(option).toBeDisabled();
    expect(within(dialog).getByText('시트는 최대 20장입니다')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: '기존 칸 바꾸기' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('button', { name: '열기' })).toBeDisabled();
  });

  it('cancelling writes nothing, stays on the page and returns focus to 더보기', async () => {
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/mars/alpha');
    expect(screen.getByRole('button', { name: '더보기' })).toHaveFocus();
  });

  const changed = '그 칸이 바뀌었습니다 — 다시 고르세요';

  it('기존 시트의 빈 칸: a pane filled after the dialog opened is not overwritten; the dialog stays open with the reason', async () => {
    seed(boardOf([sheet('roomy', { name: 'roomy', layout: '1x2', panes: [beta, null] })]));
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 시트의 빈 칸' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'roomy' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: '칸 2 · 비어 있음' }));
    const filled = boardOf([sheet('roomy', { name: 'roomy', layout: '1x2', panes: [beta, { menuId: 'item', params: { id: '1' }, query: '' }] })]);
    seed(filled);
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(within(dialog).getByText(changed)).toBeInTheDocument();
    expect(stored()).toEqual(filled);
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/mars/alpha');
    expect(screen.getByRole('dialog', { name: '분석 보드에 열기' })).toBeInTheDocument();
  });

  it('a board with moves only in memory is never written over another tab\'s save: the dialog says the board is being edited', async () => {
    seed(boardOf([sheet('a', { panes: [beta] })]));
    mount(`/alpha?${w1}`);
    await settle();
    const live = renderHook(() => useBoardSession('u1', '시트'));
    const dialog = await openDialog();
    act(() => { live.result.current.update(board => addSheet(board, '시트'), { save: false }); });
    const other = boardOf([sheet('a', { panes: [beta] }), sheet('b', { panes: [beta] })]);
    seed(other);
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(within(dialog).getByText('보드를 편집하는 중입니다. 편집을 마친 뒤 다시 시도하세요.')).toBeInTheDocument();
    expect(stored()).toEqual(other);
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/mars/alpha');
    live.unmount();
  });

  it.each([
    ['the pane now holds another screen', (b: Board) => ({ ...b, sheets: [{ ...b.sheets[0], panes: [beta, { ...beta, query: '?tab=z' }] }] })],
    ['the pane is gone with a smaller layout', (b: Board) => ({ ...b, sheets: [{ ...b.sheets[0], layout: '1x1' as const, panes: [beta] }] })],
    ['the sheet is gone', (b: Board) => ({ ...b, sheets: [sheet('other', { panes: [beta] })], activeSheetId: 'other' })],
  ])('기존 칸 바꾸기: writes nothing when %s', async (_name, change) => {
    const start = boardOf([sheet('a', { layout: '1x2', panes: [beta, beta] })]);
    seed(start);
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 칸 바꾸기' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: 'a' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: '칸 2 · 베타' }));
    const after = change(start);
    seed(after);
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(within(dialog).getByText(changed)).toBeInTheDocument();
    expect(stored()).toEqual(after);
    expect(localStorage.getItem(V2_KEY)).toBeNull();
    expect(window.location.pathname).toBe('/mars/alpha');
  });

  it('shows only the signed-in user\'s sheets after the user changes with the dialog open', async () => {
    seed(boardOf([sheet('mine', { name: 'u1 sheet', panes: [beta] })]));
    let session: Session = testSession(['platform:view']);
    const listeners = new Set<() => void>();
    window.history.replaceState(null, '', `/alpha?${w1}`);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } })} registry={registry} slots={{ boardEntry: <OpenInBoardAction /> }}><RouteOutlet /></PlatformProvider></I18nProvider>);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 칸 바꾸기' }));
    expect(await within(dialog).findByRole('radio', { name: 'u1 sheet' })).toBeInTheDocument();
    session = testSession(['platform:view'], { user: { id: 'u2' } });
    act(() => { for (const listener of listeners) listener(); });
    await settle();
    const open = screen.getByRole('dialog', { name: '분석 보드에 열기' });
    expect(within(open).queryByText('u1 sheet')).toBeNull();
    fireEvent.click(within(open).getByRole('radio', { name: '기존 칸 바꾸기' }));
    expect(within(open).queryByRole('radio', { name: 'u1 sheet' })).toBeNull();
  });
});

describe('V1 storage (#575 D1)', () => {
  it('opening a screen over a board that is stored only as V1 writes V2, keeps every V1 sheet, leaves the V1 value alone and shows the result', async () => {
    const original = boardOf([sheet('a', { name: '내 비교', layout: '1x2', panes: [beta, beta] })]);
    seed(original);
    const raw = localStorage.getItem(KEY);
    mount(`/alpha?${w1}&tab=x`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    const written = JSON.parse(localStorage.getItem(V2_KEY)!) as { v: number; sheets: { name: string }[] };
    expect(written.v).toBe(2);
    expect(written.sheets.map(s => s.name)).toEqual(['내 비교', '시트 1']);
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(localStorage.getItem('platform:board:v1-backup:u1')).toBe(raw);
    expect(stored().sheets[0]).toMatchObject({ layout: '1x2', panes: [beta, beta] });
    expect(await screen.findByRole('tab', { name: '내 비교' })).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: '시트 1', selected: true })).toBeInTheDocument();
  });

  it('a newer board that appears after the dialog opened says it is not saved, not that the pane changed', async () => {
    seed(boardOf([sheet('a', { name: '비교', layout: '1x2', panes: [beta, null] })]));
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: '기존 시트의 빈 칸' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '비교' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '칸 2 · 비어 있음' }));
    const newer = JSON.stringify({ v: 4, anything: true });
    localStorage.setItem(V2_KEY, newer);
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('더 새 버전에서 저장한 보드라 이 화면에서는 저장하지 않습니다.');
    expect(localStorage.getItem(V2_KEY)).toBe(newer);
    expect(screen.getByRole('dialog', { name: '분석 보드에 열기' })).toBeInTheDocument();
  });

  it('over a board saved by a newer build it writes nothing, says so and keeps the dialog open', async () => {
    const newer = JSON.stringify({ v: 4, anything: true });
    localStorage.setItem(V2_KEY, newer);
    mount(`/alpha?${w1}`);
    await settle();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('더 새 버전에서 저장한 보드라 이 화면에서는 저장하지 않습니다.');
    expect(localStorage.getItem(V2_KEY)).toBe(newer);
    expect(window.location.pathname).toBe('/mars/alpha');
    expect(screen.getByRole('dialog', { name: '분석 보드에 열기' })).toBeInTheDocument();
  });
});

it('external open rereads and preserves arrangement edits made while its dialog is open', async () => {
  seed(boardOf([sheet('a', { name: '비교', layout: '1x2', panes: [beta, null] })]));
  mount(`/alpha?${w1}`); await settle();
  const dialog = await openDialog();
  fireEvent.click(within(dialog).getByRole('radio', { name: '기존 시트의 빈 칸' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: '비교' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: '칸 2 · 비어 있음' }));
  const live = stored();
  live.sheets[0].arrangement = { '1x2': { columns: [65, 35], rows: [[100], [100]], collapsed: [] } };
  seed(live);
  fireEvent.click(within(dialog).getByRole('button', { name: '열기' })); await settle();
  expect(stored().sheets[0].arrangement).toEqual(live.sheets[0].arrangement);
  expect(stored().sheets[0].panes[1]?.menuId).toBe('alpha');
});

describe('분석 보드에 열기… transition (893c, C10)', () => {
  it('opens the board with a replace, like the rail and the chip: no history entry is added', async () => {
    seed(boardOf([sheet('a', { panes: [beta] })]));
    mount(`/alpha?${w1}`);
    await settle();
    const push = vi.spyOn(window.history, 'pushState');
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(push).not.toHaveBeenCalled();
  });
});
