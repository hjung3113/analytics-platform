// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { encodeFilterParams, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION, vendorsEndpoint } from '../endpoints';
import { chosenIds } from './catalogModel';
import { filterSpecsFor } from './CatalogTable';
import { useOptionPicker } from './useCatalogOptions';
import CatalogManagement from './CatalogManagement';
import { knowledgeRegistry, mountWith } from './test-support';

const registry = knowledgeRegistry(['knowledge:catalog-manage'], { description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-knowledge-catalog', permission: CATALOG_MANAGE_PERMISSION });
const session = testSession(['knowledge:catalog-manage', 'platform:view'], { user: { id: 'admin', name: 'admin', title: { ko: '관리자', en: 'Admin' } } });
const at = '2026-10-01T00:00:00.000Z';
const stamps = { version: '3', createdAt: at, updatedAt: at };
const vendorRow = { ...stamps, id: '00000001-0000-4000-8000-000000000001', code: 'ALPHA', name: 'Alpha Semicap', active: true, modelCount: 2 };
const modelRow = { ...stamps, id: '00000003-0000-4000-8000-000000000004', code: 'A-100', name: 'Alpha 100', active: true, vendorId: vendorRow.id, vendorName: 'Alpha Semicap', processes: [{ id: 'p1', name: 'Etch' }], softwareCount: 2, latestSoftwareLabel: 'v2.0' };
const retiredRow = { ...modelRow, id: '00000003-0000-4000-8000-000000000005', code: 'B-30', name: 'Beta 30', active: false, softwareCount: 0, latestSoftwareLabel: null };
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;

let queries: MenuQuery[] = [];
let writes: MenuAction[] = [];
let answer: () => Partial<ActionResponse<unknown>> = () => ({ outcome: 'ok' });
/** What the server holds by id (tests change it to play a concurrent edit) and optional gates that hold a by-id answer back. */
const held = new Map<string, Record<string, unknown>>();
const gates = new Map<string, Promise<void>>();
const extraVendors = Array.from({ length: 120 }, (_, i) => ({ ...vendorRow, id: `00000009-0000-4000-8000-${String(i).padStart(12, '0')}`, code: `V${i}`, name: `Vendor ${i}`, modelCount: 0 }));
const zeta = { ...vendorRow, id: '0000000a-0000-4000-8000-000000000001', code: 'ZETA', name: 'Zeta Corp' };
type Params = { q?: string | null; page?: number; pageSize?: number; filters?: { id: string; op: string; value?: string[] }[] };
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    queries.push(req);
    const p = req.params as Params;
    const byId = p.filters?.find(f => f.id === 'id');
    if (byId) {
      await gates.get(byId.value?.[0] ?? '');
      const rows = (byId.value ?? []).flatMap(id => (held.has(id) ? [held.get(id)!] : []));
      return ok({ rows, total: rows.length });
    }
    if (req.endpoint === 'logKnowledge.vendors') {
      const pool = p.q ? [zeta] : [vendorRow, ...extraVendors];
      const size = p.pageSize ?? 50;
      if (p.pageSize === 25) return ok({ rows: [vendorRow], total: 1 });
      return ok({ rows: pool.slice((p.page ?? 0) * size, ((p.page ?? 0) + 1) * size), total: pool.length });
    }
    if (req.endpoint === 'logKnowledge.models') return ok({ rows: [held.get(modelRow.id), retiredRow], total: 2 });
    return ok({ rows: [], total: 0 });
  },
  menuAction: async (req: MenuAction) => {
    writes.push(req);
    return { outcome: 'ok', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'fixture', ...answer() } as ActionResponse<never>;
  },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => { queries = []; writes = []; held.clear(); gates.clear(); for (const r of [vendorRow, modelRow, retiredRow, zeta]) held.set(r.id, r); answer = () => ({ outcome: 'ok' }); restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });

function mount(search: string) {
  window.history.replaceState(null, '', `/log/knowledge/catalog?v=1${search}`);
  mountWith({ registry, adapter, ui: <CatalogManagement />, slot: true, slotLabel: '상세 패널' });
}
const url = () => new URLSearchParams(window.location.search);
/** The table's last read of an endpoint (a 25-row page; the drawer's by-id lookups and the pickers read other sizes). */
const lastRead = (endpoint: string) => queries.filter(q => q.endpoint === endpoint && (q.params as { pageSize?: number }).pageSize === 25).at(-1)?.params as { filters?: unknown } | undefined;
const activeOnly = (...more: { id: string; op: 'in'; value: string[] }[]) => encodeFilterParams([{ id: 'active', op: 'in', value: ['true'] }, ...more]).map(f => `&filter=${encodeURIComponent(f)}`).join('');
const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 20000 });

describe('catalog management URL state', () => {
  it('a bare address opens 모델 with 상태 활성, and the filter goes to the server', async () => {
    mount('');
    await screen.findByText('A-100', {}, slow);
    expect(screen.getByRole('tab', { name: /모델/ }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(lastRead('logKnowledge.models')?.filters).toEqual([{ id: 'active', op: 'in', value: ['true'] }]));
  });

  it('round-trips tab, filter and the open row from the address', async () => {
    mount(`&tab=vendor${activeOnly()}&focus=${vendorRow.id}`);
    expect((await screen.findByRole('tab', { name: /설비사/ }, slow)).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'ALPHA' }, slow)).toBeTruthy();
    expect((screen.getByLabelText(/^코드/) as HTMLInputElement).value).toBe('ALPHA');
    expect(lastRead('logKnowledge.vendors')?.filters).toEqual([{ id: 'active', op: 'in', value: ['true'] }]);
  });

  it('switching tabs keeps no search, sort, page or open row of the old tab, and a count opens the child tab filtered', async () => {
    mount(`&tab=vendor${activeOnly()}&q=al&focus=${vendorRow.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha Semicap 모델 보기' }, slow));
    await waitFor(() => expect(url().get('tab')).toBe('model'));
    expect(url().get('focus')).toBeNull();
    expect(url().get('q')).toBeNull();
    await waitFor(() => expect(lastRead('logKnowledge.models')?.filters).toEqual([{ id: 'active', op: 'in', value: ['true'] }, { id: 'vendorId', op: 'in', value: [vendorRow.id] }]));
  });

  it('refuses an unknown tab instead of showing another one', async () => {
    mount('&tab=nope');
    expect((await screen.findByRole('alert', {}, slow)).textContent).toContain('nope');
  });
});

describe('catalog table rows', () => {
  it('mutes inactive rows and keeps their 상태 badge', async () => {
    mount('');
    const retired = (await screen.findByText('B-30', {}, slow)).closest('[role="row"]')!;
    expect(retired.getAttribute('data-muted')).toBe('true');
    expect(retired.textContent).toContain('비활성');
    expect((await screen.findByText('A-100')).closest('[role="row"]')!.getAttribute('data-muted')).toBeNull();
    expect(screen.getByText('v2.0')).toBeTruthy();
  });
});

describe('catalog drawer writes', () => {
  it('shows a conflict banner that reloads the row, and keeps the form on other failures', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    const name = await screen.findByLabelText(/^이름/, {}, slow);
    fireEvent.change(name, { target: { value: 'Alpha 100 v2' } });
    answer = () => ({ outcome: 'conflict', version: '4' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('다른 사람이 먼저 고쳤습니다')).toBeTruthy();
    expect(writes.at(-1)?.action).toBe('logKnowledge.modelUpdate');
    expect(writes.at(-1)?.expectedVersion).toBe('3');
    answer = () => ({ outcome: 'error', message: 'boom' });
    fireEvent.click(screen.getByRole('button', { name: '새로 불러오기' }));
    await waitFor(() => expect(screen.queryByText('다른 사람이 먼저 고쳤습니다')).toBeNull());
    fireEvent.change(await screen.findByLabelText(/^이름/), { target: { value: 'Alpha 100 v3' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('저장하지 못했습니다', { selector: '*' })).toBeTruthy();
    expect((screen.getByLabelText(/^이름/) as HTMLInputElement).value).toBe('Alpha 100 v3');
  });

  it('puts a field error under its field and keeps what was typed', async () => {
    mount(`&tab=vendor${activeOnly()}&focus=new`);
    const code = await screen.findByLabelText(/^코드/, {}, slow);
    fireEvent.change(code, { target: { value: 'alpha' } });
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: 'Again' } });
    answer = () => ({ outcome: 'invalid', fieldErrors: [{ path: ['code'], code: 'duplicate' }] });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    const message = await screen.findByText('같은 코드가 이미 있습니다');
    expect(message.getAttribute('id')).toBe(code.getAttribute('aria-describedby'));
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect((code as HTMLInputElement).value).toBe('alpha');
    expect(writes.at(-1)?.action).toBe('logKnowledge.vendorCreate');
  });

  it('asks before deactivating, naming the active children it leaves unchanged', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    fireEvent.click(await screen.findByRole('button', { name: '비활성화' }, slow));
    const impact = await screen.findByText(/활성 SW 버전 2개/, {}, slow);
    expect(impact.textContent).toContain('바뀌지 않');
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: '비활성화' }).at(-1)!);
    await waitFor(() => expect(writes.at(-1)).toMatchObject({ action: 'logKnowledge.modelSetActive', input: { id: modelRow.id, active: false }, expectedVersion: '3' }));
  });

  it('shows the model\'s fixed 설비사 with its hint on an existing model', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    expect(await screen.findByText('등록 후에는 설비사를 바꿀 수 없습니다', {}, slow)).toBeTruthy();
  });
});

const hiddenFilters = () => ((window.history.state as { apHidden?: { pairs: [string, string][] } } | null)?.apHidden?.pairs ?? []).filter(([k]) => k === 'filter').map(([, v]) => v);
function remount() {
  cleanup();
  mountWith({ registry, adapter, ui: <CatalogManagement />, slot: true, slotLabel: '상세 패널' });
}

describe('the default filter and the shared state (F1, U3)', () => {
  it('a bare address writes the tab with the default filter, so clearing the filter survives a refresh', async () => {
    mount('');
    await screen.findByText('A-100', {}, slow);
    await waitFor(() => expect(url().get('tab')).toBe('model'));
    expect(hiddenFilters()).toEqual(['active:in:true']);
    fireEvent.click(await screen.findByRole('button', { name: /모두 지우기/ }, slow));
    await waitFor(() => expect(hiddenFilters()).toEqual([]));
    remount();
    await screen.findByText('B-30', {}, slow);
    expect(url().get('tab')).toBe('model');
    expect(hiddenFilters()).toEqual([]);
    expect(lastRead('logKnowledge.models')?.filters ?? []).toEqual([]);
  });

  it('keeps a count link\'s filters in the entry state: a refresh reproduces the list, the address bar stays clean', async () => {
    mount(`&tab=vendor${activeOnly()}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha Semicap 모델 보기' }, slow));
    await waitFor(() => expect(url().get('tab')).toBe('model'));
    expect(url().getAll('filter')).toEqual([]);
    expect(hiddenFilters()).toEqual(['active:in:true', `vendorId:in:${vendorRow.id}`]);
    remount();
    await waitFor(() => expect(lastRead('logKnowledge.models')?.filters).toEqual([{ id: 'active', op: 'in', value: ['true'] }, { id: 'vendorId', op: 'in', value: [vendorRow.id] }]));
  });

  it('keeps the values the address chose in the filter row\'s options when the bounded list lacks them', () => {
    const options = { vendors: [{ value: vendorRow.id, label: 'Alpha Semicap', disabled: false }], processes: [], models: [] };
    const chosen = chosenIds([`vendorId:in:${vendorRow.id}~${zeta.id}`, 'active:in:true']);
    const spec = filterSpecsFor('model', options, chosen, new Map([[zeta.id, 'Zeta Corp']])).vendorId;
    expect(spec && 'options' in spec ? spec.options : null).toEqual([{ value: vendorRow.id, label: 'Alpha Semicap' }, { value: zeta.id, label: 'Zeta Corp' }]);
    expect(filterSpecsFor('model', options, chosen).vendorId).toMatchObject({ options: [expect.anything(), { value: zeta.id, label: zeta.id }] });
  });
});

describe('the open row is looked up by id, scoped to its kind and focus (F2, F4)', () => {
  it('reads one row with `id in [focus]` instead of scanning pages', async () => {
    mount(`&tab=vendor${activeOnly()}&focus=${zeta.id}`);
    expect(await screen.findByRole('heading', { name: 'ZETA' }, slow)).toBeTruthy();
    const lookups = queries.filter(q => (q.params as Params).filters?.some(f => f.id === 'id'));
    expect(lookups).toHaveLength(1);
    expect(lookups[0]!.params).toMatchObject({ page: 0, pageSize: 1, filters: [{ id: 'id', op: 'in', value: [zeta.id] }] });
  });

  it('says the row is missing only when the server answers no row for that id', async () => {
    mount(`&tab=vendor${activeOnly()}&focus=00000009-0000-4000-8000-00000000dead`);
    expect((await screen.findByText(/항목을 찾을 수 없습니다/, {}, slow))).toBeTruthy();
  });

  it('never shows or enables the form of the previous row while the next row is still loading', async () => {
    mount(`&tab=vendor${activeOnly()}&focus=${vendorRow.id}`);
    fireEvent.change(await screen.findByLabelText(/^이름/, {}, slow), { target: { value: 'Alpha edited' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => expect(queries.filter(q => (q.params as Params).filters?.some(f => f.id === 'id')).length).toBeGreaterThan(1));
    let release!: () => void;
    gates.set(zeta.id, new Promise<void>(resolve => { release = resolve; }));
    const before = writes.length;
    act(() => { window.history.pushState(null, '', `/log/knowledge/catalog?v=1&tab=vendor&focus=${zeta.id}`); window.dispatchEvent(new PopStateEvent('popstate')); });
    await screen.findByText('불러오는 중…', {}, slow);
    expect(screen.queryByLabelText(/^이름/)).toBeNull();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    release();
    expect(((await screen.findByLabelText(/^이름/, {}, slow)) as HTMLInputElement).value).toBe('Zeta Corp');
    expect(writes).toHaveLength(before);
  });
});

describe('conflict reload (F5)', () => {
  it('resets the draft to the server\'s changed row and the next save sends its version', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    fireEvent.change(await screen.findByLabelText(/^이름/, {}, slow), { target: { value: 'My draft' } });
    answer = () => ({ outcome: 'conflict', version: '4' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('다른 사람이 먼저 고쳤습니다');
    held.set(modelRow.id, { ...modelRow, version: '4', name: 'Changed by someone' });
    fireEvent.click(screen.getByRole('button', { name: '새로 불러오기' }));
    await waitFor(() => expect((screen.getByLabelText(/^이름/) as HTMLInputElement).value).toBe('Changed by someone'));
    answer = () => ({ outcome: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes.at(-1)?.expectedVersion).toBe('4'));
  });
});

describe('option pickers search the server (F3)', () => {
  it('finds a 설비사 beyond the first page by typing, the text going to the read as q', async () => {
    mount(`&tab=model${activeOnly()}&focus=new`);
    fireEvent.click(await screen.findByRole('combobox', { name: /설비사/ }, slow));
    fireEvent.change(await screen.findByPlaceholderText('설비사 검색'), { target: { value: 'zeta' } });
    expect(await screen.findByRole('option', { name: 'Zeta Corp' }, slow)).toBeTruthy();
    const read = queries.find(q => q.endpoint === 'logKnowledge.vendors' && (q.params as Params).q === 'zeta')!.params as Params;
    expect(read.filters).toEqual([{ id: 'active', op: 'in', value: ['true'] }]);
  });

  it('pages the read on load-more and drops a stale page when the text changed', async () => {
    window.history.replaceState(null, '', '/log/knowledge/catalog?v=1&tab=model');
    const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
    const { result } = renderHook(() => useOptionPicker(vendorsEndpoint), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(50));
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.options).toHaveLength(100));
    expect(queries.some(q => (q.params as Params).page === 1 && (q.params as Params).pageSize === 50)).toBe(true);
    act(() => result.current.setSearch('zeta'));
    await waitFor(() => expect(result.current.options.map(o => o.label)).toEqual(['Zeta Corp']));
    expect(result.current.hasMore).toBe(false);
  });
});

describe('screen details (U2, U4, U5)', () => {
  it('writes the other versions as 외 n next to the latest label', async () => {
    mount('');
    expect(await screen.findByRole('button', { name: /SW 버전 2개 보기/ }, slow)).toBeTruthy();
    expect((await screen.findByRole('button', { name: /SW 버전 2개 보기/ })).textContent).toBe('외 1');
  });

  it('puts 코드 and 이름 side by side and the actions in a pinned footer', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    const code = await screen.findByLabelText(/^코드/, {}, slow), name = screen.getByLabelText(/^이름/);
    expect(code.closest('div.grid-cols-2')).toBe(name.closest('div.grid-cols-2'));
    expect(code.closest('div.grid-cols-2')).not.toBeNull();
    const save = screen.getByRole('button', { name: '저장' });
    expect(save.closest('div.sticky')?.className).toContain('bottom-0');
  });

  it('shows the inactive notice with 다시 활성화 and the new-link note', async () => {
    held.set(vendorRow.id, { ...vendorRow, active: false });
    mount(`&tab=vendor&focus=${vendorRow.id}`);
    const notice = (await screen.findByText(/새 연결을 만들 수 없습니다/, {}, slow)).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(notice).getByRole('button', { name: '다시 활성화' }));
    await waitFor(() => expect(writes.at(-1)).toMatchObject({ action: 'logKnowledge.vendorSetActive', input: { active: true } }));
  });
});
