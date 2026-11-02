// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { encodeFilterParams, groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION } from '../endpoints';
import { manifests } from '../index';
import CatalogManagement from './CatalogManagement';

const registry = createRegistry({
  permissions: [menuPermission('knowledge:catalog-manage')],
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, permission: CATALOG_MANAGE_PERMISSION, homeMenuId: 'log-knowledge-catalog' }],
  groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
  menus: manifests,
});
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
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    queries.push(req);
    if (req.endpoint === 'logKnowledge.vendors') return ok({ rows: [vendorRow], total: 1 });
    if (req.endpoint === 'logKnowledge.models') return ok({ rows: [modelRow, retiredRow], total: 2 });
    return ok({ rows: [], total: 0 });
  },
  menuAction: async (req: MenuAction) => {
    writes.push(req);
    return { outcome: 'ok', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'fixture', ...answer() } as ActionResponse<never>;
  },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => { queries = []; writes = []; answer = () => ({ outcome: 'ok' }); restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });

function Slot() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
function mount(search: string) {
  window.history.replaceState(null, '', `/log/knowledge/catalog?v=1${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><CatalogManagement /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const url = () => new URLSearchParams(window.location.search);
/** The table's last read of an endpoint (the drawer's own row scan sends no filters). */
const lastRead = (endpoint: string) => queries.filter(q => q.endpoint === endpoint && (q.params as { filters?: unknown }).filters !== undefined).at(-1)?.params as { filters?: unknown } | undefined;
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
    expect((await screen.findByRole('tab', { name: /제조사/ }, slow)).getAttribute('aria-selected')).toBe('true');
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

  it('shows the model\'s fixed 제조사 with its hint on an existing model', async () => {
    mount(`&tab=model${activeOnly()}&focus=${modelRow.id}`);
    expect(await screen.findByText('등록 후에는 제조사를 바꿀 수 없습니다', {}, slow)).toBeTruthy();
  });
});
