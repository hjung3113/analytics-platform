import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type TableQuery } from '@ap/contracts';
import { useState } from 'react';
import { PlatformDataTable, type PageResult, type PlatformColumn, type TableUrlState } from '../PlatformDataTable';
import { readXlsx } from './xlsxTestReader';

// #556b: column filters (ADR-0104, 06 §15) — opt-in per column; the table only sends them to the server.
void memoryStorage;
afterEach(cleanup);

type Row = { id: string; status: string; name: string; n: number; d: string };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];

const filterable: PlatformColumn<Row>[] = [
  { id: 'status', header: '상태', filter: { kind: 'enum', options: [{ value: 'active', label: '사용중' }, { value: 'idle', label: '대기' }] } },
  { id: 'name', header: '이름', filter: { kind: 'text' } },
  { id: 'n', header: '수량', filter: { kind: 'number' } },
  { id: 'd', header: '일자', filter: { kind: 'date' } },
  { id: 'plain', header: '메모', value: () => '-' },
];
const plain: PlatformColumn<Row>[] = [{ id: 'status', header: '상태' }, { id: 'name', header: '이름' }];

const pageOf = (total: number, rows = 3): ApiResponse<PageResult<Row>> => ({
  outcome: 'ok', assessments: [], trust: null, correlationId: 'c',
  data: { rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i + 1}`, status: 'active', name: `n${i + 1}`, n: i, d: '2026-01-05' })), total },
});
const makeLoad = (total = 3) => vi.fn(async (_q: TableQuery, _s: AbortSignal) => pageOf(total));
const exportOk: ApiResponse<Row[]> = { outcome: 'ok', data: [{ id: 'r1', status: 'active', name: 'n1', n: 0, d: '2026-01-05' }], assessments: [], trust: null, correlationId: 'c' };

function Harness(props: { columns: PlatformColumn<Row>[]; loadPage: (q: TableQuery, s: AbortSignal) => Promise<ApiResponse<PageResult<Row>>>; exportRows?: Parameters<typeof PlatformDataTable<Row>>[0]['exportRows']; filterKey?: string }) {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={props.columns} getRowId={r => r.id} loadPage={props.loadPage}
      filterKey={props.filterKey ?? 'f'} preferenceKey="test-column-filters" pageSize={25} height={200} exportRows={props.exportRows} />
  </PlatformProvider></I18nProvider>;
}

const calls = (fn: ReturnType<typeof makeLoad>) => fn.mock.calls.map(c => c[0]);
const lastQuery = (fn: ReturnType<typeof makeLoad>) => calls(fn).at(-1)!;
async function applyText(column: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: `${column} 필터` }));
  fireEvent.change(await screen.findByLabelText('값'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '적용' })).toBeNull());
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const downloads: Blob[] = [];
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); // Radix Checkbox inside the popover
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  URL.createObjectURL = (blob: Blob) => { downloads.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});
beforeEach(() => { downloads.length = 0; window.history.replaceState(null, '', '/'); });

describe('PlatformDataTable column filters (#556b)', () => {
  it('only filter-declared columns get a header filter button; a table without filter has no button and no chip row', async () => {
    const view = render(<Harness columns={filterable} loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    expect([...view.container.querySelectorAll('[data-column-filter]')].map(b => b.getAttribute('aria-label'))).toEqual(['상태 필터', '이름 필터', '수량 필터', '일자 필터']);
    expect(view.container.querySelector('[data-filter-line]')).not.toBeNull();
    expect(view.container.querySelector('[data-column="plain"] [data-column-filter]')).toBeNull();
    view.unmount();
    const bare = render(<Harness columns={plain} loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    expect(bare.container.querySelector('[data-column-filter]')).toBeNull();
    expect(bare.container.querySelector('[data-filter-line]')).toBeNull();
  });

  it('applying calls loadPage with filters; clearing calls it without the key; no filters key before any filter', async () => {
    const load = makeLoad();
    render(<Harness columns={filterable} loadPage={load} />);
    await screen.findByText(/1\/1/);
    expect(lastQuery(load)).not.toHaveProperty('filters');
    await applyText('이름', 'abc');
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'name', op: 'contains', value: 'abc' }]));
    fireEvent.click(screen.getByRole('button', { name: '이름 필터 지우기' }));
    await waitFor(() => expect(lastQuery(load)).not.toHaveProperty('filters'));
    expect(Object.keys(lastQuery(load)).sort()).toEqual(['page', 'pageSize', 'sorting']);
  });

  it('each kind sends its typed shape: enum in, number between, date inclusive 「~까지」 as an exclusive +1 day', async () => {
    const load = makeLoad();
    render(<Harness columns={filterable} loadPage={load} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('button', { name: '상태 필터' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '대기' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'status', op: 'in', value: ['idle'] }]));

    fireEvent.click(screen.getByRole('button', { name: '수량 필터' }));
    fireEvent.keyDown(await screen.findByRole('combobox', { name: '연산자' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '범위' }));
    fireEvent.change(screen.getByLabelText('최솟값'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('최댓값'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toContainEqual({ id: 'n', op: 'between', value: [2, 9] }));

    fireEvent.click(screen.getByRole('button', { name: '일자 필터' }));
    fireEvent.change(await screen.findByLabelText('~부터'), { target: { value: '2026-01-30' } });
    fireEvent.change(screen.getByLabelText('~까지 (포함)'), { target: { value: '2026-01-31' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toContainEqual({ id: 'd', op: 'between', value: { from: '2026-01-30', to: '2026-02-01' } }));
    // The chip reads the user's inclusive end, not the wire's exclusive bound.
    expect(screen.getByText('2026-01-30 ~ 2026-01-31')).toBeTruthy();
  });

  it('a change returns to page 1 and clears the selection', async () => {
    const load = makeLoad(60);
    render(<Harness columns={filterable} loadPage={load} exportRows={vi.fn(async (..._args: unknown[]) => exportOk)} />);
    await screen.findByText(/1\/3/);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText(/2\/3/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    expect(screen.getByTestId('selected-count')).toBeTruthy();
    await applyText('이름', 'x');
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ page: 0, filters: [{ id: 'name', op: 'contains', value: 'x' }] }));
    await screen.findByText(/1\/3/);
    expect(screen.queryByTestId('selected-count')).toBeNull();
  });

  it('the filter dialog is named by its visible title, and each date input has a visible label (ko)', async () => {
    render(<Harness columns={filterable} loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('button', { name: '일자 필터' }));
    // The editor is named by the field label (ADR-0105); the funnel button keeps 「‹label› 필터」.
    const dialog = await screen.findByRole('dialog', { name: '일자' });
    expect(within(dialog).getByText('일자')).toBeTruthy();
    expect(within(dialog).getByText('~부터').tagName).toBe('LABEL');
    expect(within(dialog).getByText('~까지 (포함)').tagName).toBe('LABEL');
    expect((within(dialog).getByLabelText('~부터') as HTMLInputElement).type).toBe('date');
    expect((within(dialog).getByLabelText('~까지 (포함)') as HTMLInputElement).type).toBe('date');
  });

  it('a controlled table on page 2 returns to page 1 once per filter change, never from fresh equivalent urlState objects', async () => {
    const load = makeLoad(60);
    const onChange = vi.fn();
    function Owner() {
      const [state, setState] = useState<{ page: number | null }>({ page: 2 });
      // A fresh urlState object on every render: equivalent content, new identity.
      const urlState: TableUrlState = { page: state.page, sorting: [{ id: 'name', desc: false }], onChange: (next, reason) => { onChange(next, reason); setState({ page: next.page }); } };
      return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
        <PlatformDataTable<Row> title="T" ariaLabel="table" columns={filterable} getRowId={r => r.id} loadPage={load} filterKey="f"
          preferenceKey="test-column-filters" pageSize={25} height={200} urlState={urlState} />
      </PlatformProvider></I18nProvider>;
    }
    render(<Owner />);
    await screen.findByText(/2\/3/);
    expect(calls(load).every(q => q.page === 1)).toBe(true);
    await applyText('이름', 'x');
    await screen.findByText(/1\/3/);
    expect(onChange.mock.calls).toEqual([[{ sorting: [{ id: 'name', desc: false }], page: null }, 'reset']]);
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ page: 0, sorting: [{ id: 'name', desc: false }], filters: [{ id: 'name', op: 'contains', value: 'x' }] }));
    const loadsAfterFirst = load.mock.calls.length;
    // Already on page 1: another filter change and the chip actions notify nothing and refetch exactly once per change.
    await applyText('이름', 'y');
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'name', op: 'contains', value: 'y' }]));
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText(/2\/3/);
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.click(within(screen.getByRole('group', { name: '필터' })).getByRole('button', { name: '이름 필터 지우기' }));
    await screen.findByText(/1\/3/);
    expect(onChange.mock.calls.at(-1)).toEqual([{ sorting: [{ id: 'name', desc: false }], page: null }, 'reset']);
    await waitFor(() => expect(lastQuery(load)).not.toHaveProperty('filters'));
    const settled = load.mock.calls.length;
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(load.mock.calls.length).toBe(settled);
    expect(settled - loadsAfterFirst).toBeLessThan(6);
  });

  it('chips remove one filter or all of them; the page-filter key change keeps column filters', async () => {
    const load = makeLoad();
    const view = render(<Harness columns={filterable} loadPage={load} />);
    await screen.findByText(/1\/1/);
    await applyText('이름', 'a');
    fireEvent.click(screen.getByRole('button', { name: '수량 필터' }));
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    const chips = await screen.findByRole('group', { name: '필터' });
    expect(chips.querySelectorAll('[data-column-filter-chip]')).toHaveLength(2);
    view.rerender(<Harness columns={filterable} loadPage={load} filterKey="other" />);
    expect(screen.getByRole('group', { name: '필터' }).querySelectorAll('[data-column-filter-chip]')).toHaveLength(2);
    await waitFor(() => expect(lastQuery(load).filters).toHaveLength(2));
    fireEvent.click(within(screen.getByRole('group', { name: '필터' })).getByRole('button', { name: '이름 필터 지우기' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'n', op: 'eq', value: 3 }]));
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
    await waitFor(() => expect(lastQuery(load)).not.toHaveProperty('filters'));
    expect(view.container.querySelector('[data-column-filter-chip]')).toBeNull();
  });

  it('a filtered export carries the filters at the request top level and the XLSX 조회 정보 lists them; a selection export does not', async () => {
    const load = makeLoad();
    const exportRows = vi.fn(async (..._args: unknown[]) => exportOk);
    render(<Harness columns={filterable} loadPage={load} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    await applyText('이름', 'abc');
    await waitFor(() => expect(lastQuery(load).filters).toBeDefined());
    await screen.findByText(/1\/1/);
    const trigger = () => screen.getByRole('button', { name: /^내보내기/ });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^필터 결과 전체 \d+행을 Excel/ }));
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'filtered' }, sorting: [], filters: [{ id: 'name', op: 'contains', value: 'abc' }] }, expect.anything());
    const info = (await readXlsx(downloads[0])).sheets[1] as Record<string, unknown>;
    const rows = Object.fromEntries(Object.keys(info).filter(k => k.startsWith('A')).map(k => [String(info[k]), info['B' + k.slice(1)]]));
    expect(rows['필터 · 이름']).toBe('포함 "abc"');

    exportRows.mockClear();
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '선택 1행을 CSV로 내보내기' }));
    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
    expect(exportRows.mock.calls[0][0]).toEqual({ scope: { kind: 'selected', ids: ['r1'] }, sorting: [] });
  });

  it('an unfiltered filtered export has no filters key', async () => {
    const exportRows = vi.fn(async (..._args: unknown[]) => exportOk);
    render(<Harness columns={filterable} loadPage={makeLoad()} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^필터 결과 전체 \d+행을 CSV/ }));
    await waitFor(() => expect(exportRows).toHaveBeenCalled());
    expect(exportRows.mock.calls[0][0]).toEqual({ scope: { kind: 'filtered' }, sorting: [] });
  });
});
void act;
