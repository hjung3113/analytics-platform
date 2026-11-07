import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, type ApiResponse, type PlatformAdapter, type Quest } from '@ap/contracts';
import { manifests } from '../index';
import { MANAGE_PERMISSION, type ItemRow } from '../endpoints';
import ImprovementItems from './ImprovementItems';
import ImprovementDetail from './ImprovementDetail';
import { QuestPicker, QuestReference } from './QuestReference';
import { CreateDrawer } from './CreateDrawer';
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
  it('shows both KST analysis endpoints, the Quest snapshot on failure, and the missing action date reason', async () => {
    mount({ detail: true, overrides: { getQuest: async () => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'q' }) } });
    await screen.findByText('test problem');
    await screen.findByText('지금 확인할 수 없음');
    expect(screen.getByText('saved Quest title')).toBeTruthy();
    expect(screen.getByText('2026-11-01 00:00 – 2026-11-05 00:00 KST')).toBeTruthy();
    expect(screen.getByText('조치일을 기록하면 전후 비교를 열 수 있습니다.')).toBeTruthy();
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
  it('re-applies a restored Quest exclusion keeping its operator and IDs (C1)', async () => {
    const api = mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all&filter=questId:notIn:Q-1' });
    const input = await screen.findByLabelText('과제(Quest) ID로 찾기') as HTMLInputElement;
    await waitFor(() => expect(lastItemsParams(api).filters).toEqual(expect.arrayContaining([{ id: 'questId', op: 'notIn', value: ['Q-1'] }])));
    expect(input.value).toBe('Q-1');
    fireEvent.change(input, { target: { value: 'Q-1, Q-2' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastItemsParams(api).filters).toEqual(expect.arrayContaining([{ id: 'questId', op: 'notIn', value: ['Q-1', 'Q-2'] }])));
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

describe('unsaved-edit guard (#1388)', () => {
  function Probe({ result }: { result: { leave: () => boolean } }) {
    const { navigate, linkTo } = usePlatform();
    result.leave = () => navigate(linkTo('test-home'));
    return null;
  }
  it('holds a leave while the create drawer has typed input and releases it once the input is cleared', async () => {
    const result = {} as { leave: () => boolean };
    mount({ outcome: 'empty', children: <><ImprovementItems /><Probe result={result} /></> });
    fireEvent.click(await screen.findByRole('button', { name: '개선 아이템 남기기' }));
    const problem = await screen.findByRole('textbox', { name: /문제/ });
    fireEvent.change(problem, { target: { value: 'typed problem' } });
    await waitFor(() => expect(result.leave()).toBe(false));
    fireEvent.change(problem, { target: { value: '' } });
    await waitFor(() => expect(result.leave()).toBe(true));
  });
  it('asks before Esc or Cancel drops typed status-move input (UX-4)', async () => {
    mount({ detail: true });
    fireEvent.click(await screen.findByRole('button', { name: '조치 중' }));
    fireEvent.change(screen.getByLabelText('조치 · 필수'), { target: { value: 'repair' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: '계속 작성' }));
    expect((screen.getByLabelText('조치 · 필수') as HTMLTextAreaElement).value).toBe('repair');
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '버리고 닫기' }));
    await waitFor(() => expect(screen.queryByLabelText('조치 · 필수')).toBeNull());
  });
  it('holds a same-menu Back that only drops focus=new while the draft is typed (UX-1)', async () => {
    mount({ outcome: 'empty' });
    fireEvent.click(await screen.findByRole('button', { name: '개선 아이템 남기기' }));
    fireEvent.change(await screen.findByRole('textbox', { name: /문제/ }), { target: { value: 'back test' } });
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('new');
    window.history.back();
    // The guard restores the address it held; without it the drawer would close and the draft vanish.
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe('new'));
    expect((screen.getByRole('textbox', { name: /문제/ }) as HTMLTextAreaElement).value).toBe('back test');
  });
});


describe('owner-decided create drawer (#1408)', () => {
  const source = { menuId: 'improvement-items', context: { selection: ['EQ-1'], roomNames: ['PHOTO'], metricId: 'catalog-id', metricVersion: '3', page: { q: 'source problem' } } };
  it('labels Selection and process separately and uses catalog and Registry names', async () => {
    const query = vi.fn(async () => response({ metric: { name: { ko: '실제 카탈로그 지표', en: 'Catalog metric' } } }));
    mount({ overrides: { menuQuery: query }, children: <CreateDrawer origin={source} onClose={() => {}} /> });
    const context = await screen.findByRole('region', { name: '분석에서 가져온 Context' });
    await within(context).findByText('실제 카탈로그 지표 · v3');
    expect(within(context).getByText('개선 아이템')).toBeTruthy();
    expect(within(context).getByText('설비 선택')).toBeTruthy();
    expect(within(context).getByText('공정')).toBeTruthy();
    expect(within(context).getByText('PHOTO')).toBeTruthy();
    expect(within(context).queryByText('대상')).toBeNull();
    expect(within(context).queryByText('catalog-id')).toBeNull();
    expect(query).toHaveBeenCalledWith({ endpoint: 'metrics.definition', context: {}, params: { metricId: 'catalog-id', version: '3' } }, expect.anything());
  });
  it('keeps problem, action and Quest in approved order, before the expandable target editor', async () => {
    mount({ children: <CreateDrawer origin={source} onClose={() => {}} /> });
    const problem = await screen.findByLabelText('문제 · 필수');
    const action = screen.getByLabelText('조치');
    const quest = screen.getByRole('region', { name: '과제(Quest)' });
    const targets = screen.getByRole('region', { name: '대상' });
    expect(problem.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action.compareDocumentPosition(quest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quest.compareDocumentPosition(targets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '외부 키' })).toBeNull();
  });
  it('prefills removable target suggestions and saves their removal without changing Selection', async () => {
    const action = vi.fn(async () => ({ outcome: 'error' as const, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    mount({ overrides: { menuAction: action }, children: <CreateDrawer origin={source} onClose={() => {}} /> });
    fireEvent.click(await screen.findByRole('button', { name: 'EQ-1 제거' }));
    expect(screen.queryByRole('button', { name: 'EQ-1 제거' })).toBeNull();
    fireEvent.change(screen.getByLabelText('문제 · 필수'), { target: { value: 'problem' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ targets: [], origin: expect.objectContaining({ context: expect.objectContaining({ selection: ['EQ-1'] }) }) }) })));
  });
  it('shows per-kind help below an empty key field without placeholder examples', async () => {
    mount({ children: <CreateDrawer origin={null} onClose={() => {}} /> });
    const key = await screen.findByLabelText('외부 키');
    expect(key.getAttribute('placeholder')).toBeNull();
    expect(screen.getByText('EquipmentID를 그대로 입력')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: '공정' }));
    expect(screen.getByText('공정 이름, 예: PHOTO')).toBeTruthy();
    expect(screen.queryByText('EquipmentID를 그대로 입력')).toBeNull();
  });
  it('stores no source page keys when originPage is absent', async () => {
    const action = vi.fn(async () => ({ outcome: 'error' as const, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    mount({ url: '/improvement-items?v=1&scopeId=MEM&view=all&q=source&focus=new&origin=improvement-items', overrides: { menuAction: action } });
    fireEvent.change(await screen.findByLabelText('문제 · 필수'), { target: { value: 'problem' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ origin: expect.objectContaining({ context: expect.objectContaining({ page: {} }) }) }) })));
  });
  it('shows readable detail fallbacks and restores the saved page keys', async () => {
    const saved = { ...row, origin: { ...source, context: { ...source.context, metricId: 'unknown-id' } } };
    mount({ detail: true, overrides: { menuQuery: async r => response(r.endpoint === 'improvement.itemDetail' ? saved : r.endpoint === 'metrics.definition' ? { metric: null } : { rows: [], total: 0 }) } });
    await screen.findByText('test problem');
    expect(screen.getByText('알 수 없는 지표 · v3')).toBeTruthy();
    expect(screen.queryByText('unknown-id')).toBeNull();
    const href = screen.getByRole('link', { name: '분석 화면 열기' }).getAttribute('href')!;
    expect(new URL(href, window.location.origin).searchParams.get('q')).toBe('source problem');
  });
  it('retains a draft on Escape and lets the user resume editing', async () => {
    const close = vi.fn();
    mount({ children: <CreateDrawer origin={source} onClose={close} /> });
    fireEvent.change(await screen.findByLabelText('문제 · 필수'), { target: { value: 'draft' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: '계속 작성' }));
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByLabelText('문제 · 필수') as HTMLTextAreaElement).value).toBe('draft');
  });
});


it('opens a collapsed required target editor before focusing its invalid key (#1408)', async () => {
  mount({ children: <CreateDrawer origin={null} onClose={() => {}} /> });
  fireEvent.change(await screen.findByLabelText('문제 · 필수'), { target: { value: 'problem' } });
  fireEvent.click(screen.getByRole('button', { name: /대상 ·/ }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '외부 키' })));
});


it('saves a drilled-equipment suggestion while retaining the original Selection (#1408)', async () => {
  const action = vi.fn(async () => ({ outcome: 'error' as const, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
  const origin = { menuId: 'improvement-items', context: { selection: ['EQ-1'], page: { drillEquipment: 'EQ-2' } } };
  mount({ overrides: { menuAction: action }, children: <CreateDrawer origin={origin} onClose={() => {}} /> });
  expect(await screen.findByRole('button', { name: 'EQ-2 제거' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: '분석에서 가져온 Context' })).getByText('EQ-1')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('문제 · 필수'), { target: { value: 'problem' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ targets: [{ kind: 'equipment', externalKey: 'EQ-2', displayName: 'EQ-2' }], origin }) })));
});

it('uses neutral names when the menu is retired and the metric catalog fails (#1408)', async () => {
  mount({ overrides: { menuQuery: async () => response(null, 'error') }, children: <CreateDrawer origin={{ menuId: 'retired-menu-id', context: { metricId: 'retired-metric-id' } }} onClose={() => {}} /> });
  const context = await screen.findByRole('region', { name: '분석에서 가져온 Context' });
  expect(within(context).getByText('알 수 없는 분석 메뉴')).toBeTruthy();
  expect(within(context).getByText('알 수 없는 지표')).toBeTruthy();
  expect(within(context).queryByText('retired-menu-id')).toBeNull();
  expect(within(context).queryByText('retired-metric-id')).toBeNull();
  expect(within(context).queryByRole('link')).toBeNull();
});


it('keeps automatic target suggestions within the existing 50-target input limit (#1408)', async () => {
  const selection = Array.from({ length: 51 }, (_, i) => `EQ-${i + 1}`);
  mount({ children: <CreateDrawer origin={{ menuId: 'improvement-items', context: { selection } }} onClose={() => {}} /> });
  const targets = await screen.findByRole('region', { name: '저장할 대상' });
  expect(within(targets).getAllByRole('button', { name: /EQ-.* 제거/ })).toHaveLength(50);
  expect(within(targets).getByText('설비 선택 중 처음 50개를 대상으로 제안했습니다. 필요 없는 대상은 제거하세요.')).toBeTruthy();
});


describe('review fixes (#1408 round 2)', () => {
  it('separates the source focus/tab from the create focus between different menus', async () => {
    const source = { ...manifests[0]!, id: 'equipment-master', path: '/equipment-master', label: { ko: '설비 마스터', en: 'Equipment master' }, pageKeys: ['focus', 'tab'], contextResetKeys: [], primary: false, hiddenPageKeys: [], repeatedPageKeys: [] };
    const localRegistry = createRegistry({ spaces: registry.spaces, menus: [...registry.menus, source], groups: registry.groups, permissions: [MANAGE_PERMISSION] });
    const sourcePage = JSON.stringify({ focus: 'EQ-1', tab: 'validity' });
    window.history.replaceState(null, '', `/improvement-items?v=1&view=all&focus=new&origin=equipment-master&originPage=${encodeURIComponent(sourcePage)}`);
    const action = vi.fn(async () => ({ outcome: 'error' as const, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    const session = testSession(['platform:view', MANAGE_PERMISSION]);
    const api = testAdapter({ session: () => session, menuAction: action });
    render(<I18nProvider><PlatformProvider adapter={api} registry={localRegistry}><ImprovementItems /></PlatformProvider></I18nProvider>);
    const drawer = await screen.findByRole('dialog');
    const href = within(drawer).getByRole('link', { name: '분석 화면 열기' }).getAttribute('href')!;
    expect(new URL(href, window.location.origin).searchParams.get('focus')).toBe('EQ-1');
    expect(new URL(href, window.location.origin).searchParams.get('tab')).toBe('validity');
    fireEvent.change(within(drawer).getByLabelText('문제 · 필수'), { target: { value: 'problem' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ origin: expect.objectContaining({ menuId: 'equipment-master', context: expect.objectContaining({ page: { focus: 'EQ-1', tab: 'validity' } }) }) }) })));
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('new');
  });
  it('blocks an oversized origin and preserves problem, action, Quest and targets after removing it', async () => {
    const action = vi.fn(async () => ({ outcome: 'error' as const, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'c' }));
    const origin = { menuId: 'improvement-items', context: { selection: ['EQ-1'], page: { q: '한'.repeat(3000) } } };
    mount({ overrides: { menuAction: action, searchQuests: async () => response({ supported: true, items: [{ id: 'Q-1', title: 'Chosen Quest', status: 'Open' }], page: 0, hasMore: false }) }, children: <CreateDrawer origin={origin} onClose={() => {}} /> });
    fireEvent.change(await screen.findByLabelText('문제 · 필수'), { target: { value: 'draft problem' } });
    fireEvent.change(screen.getByLabelText('조치'), { target: { value: 'draft action' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Q-1 · Chosen Quest · Open' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText('분석 출처가 8KiB를 초과했습니다. 출처를 제외하고 저장할 수 있습니다. 입력한 내용은 유지됩니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '분석 출처 제외' }));
    expect((screen.getByLabelText('문제 · 필수') as HTMLTextAreaElement).value).toBe('draft problem');
    expect((screen.getByLabelText('조치') as HTMLTextAreaElement).value).toBe('draft action');
    expect(screen.getByRole('button', { name: 'EQ-1 제거' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ problem: 'draft problem', action: 'draft action', questId: 'Q-1', targets: [{ kind: 'equipment', externalKey: 'EQ-1', displayName: 'EQ-1' }], origin: null }) })));
  });
  it('displays server origin.context:too_long and offers recovery while retaining the draft', async () => {
    const action = vi.fn(async () => ({ outcome: 'invalid' as const, data: null, version: null, fieldErrors: [{ path: ['origin', 'context'], code: 'too_long' }], replayed: false, correlationId: 'c' }));
    mount({ overrides: { menuAction: action }, children: <CreateDrawer origin={{ menuId: 'improvement-items', context: {} }} onClose={() => {}} /> });
    fireEvent.change(await screen.findByLabelText('문제 · 필수'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('분석 출처가 8KiB를 초과했습니다. 출처를 제외하고 저장할 수 있습니다. 입력한 내용은 유지됩니다.');
    fireEvent.click(screen.getByRole('button', { name: '분석 출처 제외' }));
    expect((screen.getByLabelText('문제 · 필수') as HTMLTextAreaElement).value).toBe('draft');
    expect(screen.getByRole('textbox', { name: '외부 키' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getAllByRole('alert').some(node => node.textContent!.includes('입력한 대상을 추가하세요'))).toBe(true);
  });
  it('keeps target removal before the result list when Quest has many long titles', async () => {
    mount({ overrides: { searchQuests: async () => response({ supported: true, items: Array.from({ length: 10 }, (_, i) => ({ id: `Q-${i}`, title: '긴 과제 제목 '.repeat(50), status: 'Open' })), page: 0, hasMore: false }) }, children: <CreateDrawer origin={{ menuId: 'improvement-items', context: { selection: ['EQ-1'] } }} onClose={() => {}} /> });
    const result = await screen.findByRole('button', { name: /^Q-0 ·/ });
    const remove = screen.getByRole('button', { name: 'EQ-1 제거' });
    expect(remove.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(remove);
    expect(screen.queryByRole('button', { name: 'EQ-1 제거' })).toBeNull();
  });
});

it('rejects a malformed separate source page and recovers by explicitly clearing the source', async () => {
  mount({ url: '/improvement-items?v=1&view=all&focus=new&origin=improvement-items&originPage=%7B' });
  await screen.findByText('분석 출처를 확인할 수 없습니다. 출처를 지우고 대상을 입력하세요.');
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  await screen.findByRole('dialog');
  expect(new URLSearchParams(window.location.search).has('originPage')).toBe(false);
  expect(new URLSearchParams(window.location.search).has('origin')).toBe(false);
  expect(screen.getByRole('textbox', { name: '외부 키' })).toBeTruthy();
});
