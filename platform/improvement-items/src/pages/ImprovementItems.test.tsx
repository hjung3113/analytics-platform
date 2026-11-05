import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, type ApiResponse, type PlatformAdapter, type Quest } from '@ap/contracts';
import { manifests } from '../index';
import { MANAGE_PERMISSION, type ItemRow } from '../endpoints';
import ImprovementItems from './ImprovementItems';
import ImprovementDetail from './ImprovementDetail';
import { QuestPicker, QuestReference } from './QuestReference';
const row: ItemRow = { id: '13280000-0000-4000-8000-000000000001', itemNo: 1, problem: 'test problem', action: null, actionDate: null, status: 'open', assignee: null, quest: { id: 'Q1', titleSnapshot: 'saved Quest title' }, origin: { menuId: 'improvement-items', context: { from: '2026-11-01T00:00', to: '2026-11-05T00:00' } }, targets: [], effectResult: null, effectNote: null, effectCompareLink: null, dropReason: null, version: '1', createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z', createdBy: 'admin', updatedBy: 'admin' };
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'test-home' })], menus: [...manifests, { ...manifests[0]!, id: 'test-home', path: '/test-home', group: groupId('test'), primary: true }], groups: [{ id: groupId('test'), label: { ko: '테스트', en: 'Test' }, icon: manifests[0]!.icon, space: testSpace().id }, { id: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Improvement items' }, icon: manifests[0]!.icon, space: null }], permissions: [MANAGE_PERMISSION] });
function response<T>(data: T | null, outcome: ApiResponse<T>['outcome'] = 'ok'): ApiResponse<T> { return { outcome, data, assessments: [], trust: null, correlationId: 'fixture' }; }
function mount({ detail = false, outcome = 'ok', loading = false, allowed = true, overrides = {}, children, url }: { children?: ReactNode; url?: string; detail?: boolean; outcome?: ApiResponse<unknown>['outcome']; loading?: boolean; allowed?: boolean; overrides?: Partial<PlatformAdapter> } = {}) {
  window.history.replaceState(null, '', url ?? (detail ? '/improvement-items/13280000-0000-4000-8000-000000000001?v=1&scopeId=MEM' : '/improvement-items?v=1&scopeId=MEM&view=all&q=retained'));
  const session = testSession(allowed ? ['platform:view', MANAGE_PERMISSION] : ['platform:view']);
  const api = testAdapter({ session: () => session,
    menuQuery: vi.fn(async r => loading ? new Promise<ApiResponse<unknown>>(() => {}) : response(outcome !== 'ok' ? null : r.endpoint === 'improvement.itemDetail' ? row : { rows: r.endpoint === 'improvement.items' ? [row] : [], total: r.endpoint === 'improvement.items' ? 1 : 0 }, outcome)),
    ...overrides,
  });
  render(<I18nProvider><PlatformProvider adapter={api} registry={registry}>{children ?? (detail ? <ImprovementDetail /> : <ImprovementItems />)}</PlatformProvider></I18nProvider>);
  return api;
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('improvement screens', () => {
  it('retains search, filters and enabled create on an empty list', async () => {
    mount({ outcome: 'empty' });
    await screen.findByText('조건에 맞는 결과가 없습니다');
    expect((screen.getByPlaceholderText('문제·조치 검색') as HTMLInputElement).value).toBe('retained');
    expect(screen.getByRole('button', { name: '조건 지우기' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '내 담당' })).toBeTruthy();
    expect((screen.getByRole('button', { name: '개선 아이템 남기기' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '조건 지우기' }));
    await waitFor(() => expect((screen.getByPlaceholderText('문제·조치 검색') as HTMLInputElement).value).toBe(''));
    expect(window.location.search).toContain('view=all');
  });
  it.each(['loading', 'error', 'forbidden', 'empty'] as const)('renders list %s without losing its search', async state => {
    mount({ loading: state === 'loading', outcome: state === 'loading' ? 'ok' : state });
    await waitFor(() => expect(screen.getByPlaceholderText('문제·조치 검색')).toBeTruthy());
    if (state === 'loading') expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    else await waitFor(() => expect(document.body.textContent).toContain(state === 'error' ? '데이터를 불러오지 못했습니다' : state === 'forbidden' ? '권한' : '조건에 맞는 결과가 없습니다'));
  });
  it.each(['loading', 'error', 'forbidden', 'empty'] as const)('renders detail %s with a way back', async state => {
    mount({ detail: true, loading: state === 'loading', outcome: state === 'loading' ? 'ok' : state });
    expect(screen.getByRole('link', { name: '목록' })).toBeTruthy();
    await waitFor(() => expect(document.body.textContent).toContain(state === 'loading' ? '불러오는 중' : state === 'error' ? '데이터를 불러오지 못했습니다' : state === 'forbidden' ? '권한' : '조건에 맞는 결과가 없습니다'));
  });
  it('shows both KST analysis endpoints, the Quest snapshot on failure, and the explicit unbuilt effect region', async () => {
    mount({ detail: true, overrides: { getQuest: async () => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'q' }) } });
    await screen.findByText('test problem');
    await screen.findByText('지금 확인할 수 없음');
    expect(screen.getByText('saved Quest title')).toBeTruthy();
    expect(screen.getByText('2026-11-01 00:00 – 2026-11-05 00:00 KST')).toBeTruthy();
    expect(screen.getByText(/전후 비교 미구현/)).toBeTruthy();
  });
  it('requires confirmation, retains draft on conflict, and never retries with an unseen version', async () => {
    const action = vi.fn(async () => ({ outcome: 'conflict' as const, data: null, version: '2', fieldErrors: [], replayed: false, correlationId: 'c' }));
    mount({ detail: true, overrides: { menuAction: action } });
    fireEvent.click(await screen.findByRole('button', { name: '조치 중' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('조치 · 필수'), { target: { value: 'repair' } });
    fireEvent.click(screen.getByRole('button', { name: '상태 변경 확인' }));
    await screen.findByText('다른 사람이 먼저 고쳤습니다. 입력을 보관했습니다. 최신 내용을 확인한 뒤 다시 시도하세요.');
    expect(action).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('조치 · 필수') as HTMLTextAreaElement).value).toBe('repair');
  });
  it('keeps denied creation separate from no-match and refuses blank problem before sending', async () => {
    const action = vi.fn();
    mount({ overrides: { menuAction: action } });
    fireEvent.click(screen.getByRole('button', { name: '개선 아이템 남기기' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(action).not.toHaveBeenCalled();
    // The fix round adds field-level alerts next to the umbrella one, so assert across all of them.
    expect(screen.getAllByRole('alert').some(a => a.textContent!.includes('문제'))).toBe(true);
  });
  it('creates with the source menu and Context in separate fields', async () => {
    const action = vi.fn(async () => ({ outcome: 'ok' as const, data: { itemId: row.id, itemNo: 1, version: '1' }, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all&focus=new&origin=improvement-items&from=2026-11-01T00:00:00&to=2026-11-05T00:00:00', overrides: { menuAction: action } });
    await screen.findByRole('dialog');
    expect(screen.getByText('분석에서 가져온 Context')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('문제 · 필수'), { target: { value: 'recorded problem' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ action: 'improvement.itemCreate', input: expect.objectContaining({ problem: 'recorded problem', origin: expect.objectContaining({ menuId: 'improvement-items', context: expect.objectContaining({ scopeId: 'MEM' }) }) }) })));
  });
  it('does not offer creation without improvement.manage', async () => {
    mount({ allowed: false });
    await screen.findByText('개선 아이템을 만들거나 상태를 바꾸려면 improvement.manage 권한이 필요합니다.');
    expect(screen.queryByRole('button', { name: '개선 아이템 남기기' })).toBeNull();
  });
});

describe('saved views and Quest adapter outcomes', () => {
  it('sends restored arbitrary Quest and source filters through the table model', async () => {
    const api = mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all&filter=questId:in:Q-123&filter=origin:in:cycle-time' });
    await waitFor(() => expect(api.menuQuery).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ filters: [{ id: 'questId', op: 'in', value: ['Q-123'] }, { id: 'origin', op: 'in', value: ['cycle-time'] }] }) }), expect.anything()));
  });
  it('switches saved views using the same table filter wire model', async () => {
    const api = mount();
    await screen.findByRole('tab', { name: '내 담당' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '내 담당' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(api.menuQuery).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ filters: [{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }] }) }), expect.anything()));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '과제(Quest) 미연결' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(api.menuQuery).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ filters: [{ id: 'questLinked', op: 'in', value: ['false'] }] }) }), expect.anything()));
  });
  it.each(['ok', 'empty', 'error', 'forbidden'] as const)('renders actual Quest %s with no invented link', async outcome => {
    mount({ overrides: { getQuest: async () => response<Quest>(outcome === 'ok' ? { id: 'Q1', title: 'current title', status: 'Active' } : null, outcome) }, children: <QuestReference id="Q1" snapshot="stored title" /> });
    await screen.findByText(outcome === 'ok' ? 'current title' : outcome === 'empty' ? 'BRAVO에서 확인되지 않음' : outcome === 'forbidden' ? '과제(Quest)를 볼 권한이 없습니다.' : '지금 확인할 수 없음');
    expect(screen.getByText(outcome === 'ok' ? 'current title' : 'stored title')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('falls back to direct ID when search is unsupported and selects a verified Quest', async () => {
    const select = vi.fn();
    mount({ overrides: { searchQuests: async () => response({ supported: false, items: [], page: 0, hasMore: false }), getQuest: async id => response({ id, title: 'picked title', status: 'Active' }) }, children: <QuestPicker selected={null} onSelect={select} /> });
    fireEvent.change(await screen.findByLabelText('과제(Quest) ID 직접 입력'), { target: { value: 'Q1' } });
    fireEvent.click(screen.getByRole('button', { name: '과제(Quest) 확인' }));
    await waitFor(() => expect(select).toHaveBeenCalledWith({ id: 'Q1', title: 'picked title' }));
  });
  it('can return to search after the unsupported-search fallback', async () => {
    mount({ overrides: { searchQuests: async input => response({ supported: input.query !== 'Q-NOSEARCH', items: [], page: 0, hasMore: false }) }, children: <QuestPicker selected={null} onSelect={() => {}} /> });
    const search = await screen.findByRole('searchbox', { name: '과제(Quest) 제목 또는 ID 검색' });
    fireEvent.change(search, { target: { value: 'Q-NOSEARCH' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await screen.findByLabelText('과제(Quest) ID 직접 입력');
    fireEvent.click(screen.getByRole('button', { name: '과제(Quest) 제목 또는 ID 검색' }));
    await screen.findByRole('searchbox', { name: '과제(Quest) 제목 또는 ID 검색' });
  });
  it('refuses a stale Quest lookup after the ID changes', async () => {
    let complete!: (r: ApiResponse<Quest>) => void;
    const select = vi.fn();
    mount({ overrides: { searchQuests: async () => response({ supported: false, items: [], page: 0, hasMore: false }), getQuest: () => new Promise(resolve => { complete = resolve; }) }, children: <QuestPicker selected={null} onSelect={select} /> });
    const input = await screen.findByLabelText('과제(Quest) ID 직접 입력');
    fireEvent.change(input, { target: { value: 'Q1' } });
    fireEvent.click(screen.getByRole('button', { name: '과제(Quest) 확인' }));
    fireEvent.change(input, { target: { value: 'Q2' } });
    complete(response({ id: 'Q1', title: 'stale', status: 'Active' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '과제(Quest) 확인' })).toBeTruthy());
    expect(select).not.toHaveBeenCalled();
  });
});

describe('fix round (1328 d)', () => {
  /** The vi.fn `menuQuery` the mount helper passes through `overrides`, shaped for call inspection. */
  type MenuQueryCalls = Array<[{ endpoint: string; params: { filters?: unknown[] } }]>;
  const createButton = () => screen.getByRole('button', { name: '개선 아이템 남기기' }) as HTMLButtonElement;
  const lastItemsParams = (api: { menuQuery: unknown }) => {
    const calls = (api.menuQuery as { mock: { calls: MenuQueryCalls } }).mock.calls;
    return calls.filter(([r]) => r.endpoint === 'improvement.items').at(-1)![0].params;
  };
  /** The `defaultPrevented` state after React's root handlers ran (a document bubble listener reads it last). */
  const enterDefaultPrevented = (box: HTMLElement) => {
    let prevented = false;
    const watcher = (event: KeyboardEvent) => { prevented = event.defaultPrevented; };
    document.addEventListener('keydown', watcher);
    fireEvent.keyDown(box, { key: 'Enter' });
    document.removeEventListener('keydown', watcher);
    return prevented;
  };
  const drawerUrl = '/improvement-items?v=1&scopeId=MEM&view=all&focus=new&origin=improvement-items&from=2026-11-01T00:00:00&to=2026-11-05T00:00:00';

  it('applies the analysis source filter from selectable values and offers no Quest ID editor (C1)', async () => {
    const api = mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all' });
    await screen.findByRole('table', { name: '개선 아이템' });
    fireEvent.click(document.querySelector('[data-filter-add]')!);
    const add = await screen.findByRole('dialog', { name: '필터 추가' });
    expect(within(add).queryByRole('button', { name: '과제(Quest) ID' })).toBeNull();
    fireEvent.click(within(add).getByRole('button', { name: '분석 출처' }));
    const editor = await screen.findByRole('dialog', { name: '분석 출처' });
    fireEvent.click(within(editor).getByRole('checkbox', { name: '사이클타임 상세' }));
    fireEvent.click(within(editor).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastItemsParams(api).filters).toEqual(expect.arrayContaining([{ id: 'origin', op: 'in', value: ['cycle-time'] }])));
  });
  it('applies and clears a Quest ID filter through its own entry (C1)', async () => {
    const api = mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all' });
    const input = await screen.findByLabelText('과제(Quest) ID로 찾기');
    fireEvent.change(input, { target: { value: 'Q-123, Q-9' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastItemsParams(api).filters).toEqual(expect.arrayContaining([{ id: 'questId', op: 'in', value: ['Q-123', 'Q-9'] }])));
    fireEvent.change(screen.getByLabelText('과제(Quest) ID로 찾기'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastItemsParams(api).filters).toBeUndefined());
  });
  it('keeps a cleared preset cleared across a refresh (C4)', async () => {
    const api = mount({ url: '/improvement-items?v=1&scopeId=MEM' });
    await waitFor(() => expect(lastItemsParams(api).filters).toEqual([{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }]));
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
    await waitFor(() => expect(window.location.search).toContain('view=all'));
    expect(window.location.search).not.toContain('filter=');
    const again = mount({ url: `/improvement-items${window.location.search}` });
    await waitFor(() => expect((again.menuQuery as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0));
    expect(lastItemsParams(again).filters).toBeUndefined();
  });
  it('does not submit creation on Enter in the Quest search and still commits the search (A2)', async () => {
    const search = vi.fn(async () => response({ supported: true, items: [], page: 0, hasMore: false }));
    const action = vi.fn(async () => ({ outcome: 'ok' as const, data: { itemId: row.id, itemNo: 1, version: '1' }, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    mount({ url: drawerUrl, overrides: { menuAction: action, searchQuests: search } });
    const box = await screen.findByRole('searchbox', { name: '과제(Quest) 제목 또는 ID 검색' });
    fireEvent.change(box, { target: { value: 'Q' } });
    expect(enterDefaultPrevented(box)).toBe(true);
    await waitFor(() => expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'Q' }), expect.anything()));
    expect(action).not.toHaveBeenCalled();
  });
  it('does not submit creation on Enter in the direct Quest ID entry and runs the lookup (A2)', async () => {
    const getQuest = vi.fn(async () => response<Quest>({ id: 'Q1', title: 'picked', status: 'Active' }));
    const action = vi.fn();
    mount({ url: drawerUrl, overrides: { menuAction: action, searchQuests: async () => response({ supported: false, items: [], page: 0, hasMore: false }), getQuest } });
    const input = await screen.findByLabelText('과제(Quest) ID 직접 입력');
    fireEvent.change(input, { target: { value: 'Q1' } });
    expect(enterDefaultPrevented(input)).toBe(true);
    await waitFor(() => expect(getQuest).toHaveBeenCalledWith('Q1', expect.anything()));
    expect(action).not.toHaveBeenCalled();
  });
  it('shows the problem guidance next to the field and focuses it on a failed save (A3)', async () => {
    const action = vi.fn();
    mount({ overrides: { menuAction: action } });
    fireEvent.click(await screen.findByRole('button', { name: '개선 아이템 남기기' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some(a => a.textContent!.includes('문제를 입력하세요'))).toBe(true));
    expect((screen.getByLabelText('문제 · 필수') as HTMLTextAreaElement).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('문제 · 필수'));
    expect(action).not.toHaveBeenCalled();
  });
  it('explains an unadded target draft and focuses the target key on a failed save (A3)', async () => {
    const action = vi.fn();
    // The no-source flow: without analysis Context the entered target must be added before saving.
    mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all&focus=new', overrides: { menuAction: action } });
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('문제 · 필수'), { target: { value: 'recorded problem' } });
    fireEvent.change(screen.getByLabelText('외부 키'), { target: { value: 'EQ-99' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some(a => a.textContent!.includes('입력한 대상을 추가하세요'))).toBe(true));
    expect(document.activeElement).toBe(screen.getByLabelText('외부 키'));
    expect(action).not.toHaveBeenCalled();
  });
  it('returns focus to the create button on a clean close (UX1)', async () => {
    mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all' });
    fireEvent.click(await screen.findByRole('button', { name: '개선 아이템 남기기' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(createButton()));
  });
  it('returns focus to the create button after the dirty-discard path (UX1)', async () => {
    mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all' });
    fireEvent.click(await screen.findByRole('button', { name: '개선 아이템 남기기' }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('문제 · 필수'), { target: { value: 'draft' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: '버리고 닫기' }));
    await waitFor(() => expect(document.activeElement).toBe(createButton()));
  });
  it('announces the drawer and discard close controls in English (UX3)', async () => {
    // The kernel owns web storage; the language preference goes through a storage instance like other screens' tests.
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    mount({ url: drawerUrl });
    await screen.findByRole('dialog');
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Problem · Required'), { target: { value: 'draft' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const dialogs = await screen.findAllByRole('dialog');
    const discard = dialogs[dialogs.length - 1]!;
    expect(within(discard).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(within(discard).getByRole('button', { name: 'Discard and close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('announces the status dialog close control in English (UX3)', async () => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    mount({ detail: true });
    fireEvent.click(await screen.findByRole('button', { name: 'In progress' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThanOrEqual(1);
  });
});
