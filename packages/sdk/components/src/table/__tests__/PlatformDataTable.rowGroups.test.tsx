import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, groupPage, spaceId, type ApiResponse, type GroupedPageResult, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';

// #556d: server row groups (ADR-0104) — opt-in `groupable` column; the table renders the server's groups, never groups or sums a page itself.
void memoryStorage;
afterEach(cleanup);

type Row = { id: string; line: string | null; qty: number };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const downloads: Blob[] = [];
beforeAll(() => {
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

const data: Row[] = [
  { id: 'a1', line: 'A', qty: 1 }, { id: 'a2', line: 'A', qty: 2 }, { id: 'a3', line: 'A', qty: 3 },
  { id: 'b1', line: 'B', qty: 10 }, { id: 'b2', line: 'B', qty: 20 }, { id: 'c1', line: null, qty: 100 },
];
const columns: PlatformColumn<Row>[] = [
  { id: 'line', header: '라인', groupable: true },
  { id: 'qty', header: '수량', align: 'right', subtotal: true },
];
const plainColumns: PlatformColumn<Row>[] = [{ id: 'line', header: '라인' }, { id: 'qty', header: '수량' }];
const ok = (d: GroupedPageResult<Row>): ApiResponse<GroupedPageResult<Row>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: d });
/** A server that answers like the mock endpoint: grouped when `groupBy` is sent (no `groups` otherwise). */
const makeLoad = (opts: { omitGroups?: boolean } = {}) => vi.fn(async (q: TableQuery, _s: AbortSignal) => {
  if (!q.groupBy) return ok({ rows: data.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: data.length });
  const out = groupPage(data, { groupBy: q.groupBy, sorting: q.sorting, subtotalColumns: ['qty'], page: q.page, pageSize: q.pageSize });
  return ok(opts.omitGroups ? { rows: out.rows, total: out.total } : out);
});

function Harness(props: { loadPage: (q: TableQuery, s: AbortSignal) => Promise<ApiResponse<GroupedPageResult<Row>>>; columns?: PlatformColumn<Row>[]; pageSize?: number; selectable?: boolean }) {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={props.columns ?? columns} getRowId={r => r.id} loadPage={props.loadPage}
      filterKey="f" preferenceKey="test-row-groups" pageSize={props.pageSize ?? 25} height={300}
      bulkActions={props.selectable ? ids => <span data-testid="ids-action">{ids.length}</span> : undefined} />
  </PlatformProvider></I18nProvider>;
}
const lastQuery = (fn: ReturnType<typeof makeLoad>) => fn.mock.calls.at(-1)![0];
const groupSelect = () => screen.getByRole('combobox', { name: '그룹' }) as HTMLSelectElement;
const choose = (id: string) => fireEvent.change(groupSelect(), { target: { value: id } });
const headerRows = (c: HTMLElement) => [...c.querySelectorAll('[data-group-row]')] as HTMLElement[];

describe('PlatformDataTable row groups (#556d)', () => {
  it('offers 「그룹」 only with a groupable column; a table without one renders as before (rowcount, no group UI)', async () => {
    const plain = render(<Harness loadPage={makeLoad()} columns={plainColumns} />);
    await screen.findByText(/1\/1/);
    expect(screen.queryByRole('combobox', { name: '그룹' })).toBeNull();
    expect(plain.container.querySelector('[role="table"]')!.getAttribute('aria-rowcount')).toBe('7');
    plain.unmount();
    render(<Harness loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    expect(groupSelect().value).toBe('');
    expect([...groupSelect().options].map(o => o.text)).toEqual(['그룹 없음', '라인']);
  });

  it('choosing a group sends groupBy (absent for 「그룹 없음」); the flat table has no header rows', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} />);
    await screen.findByText(/1\/1/);
    expect(lastQuery(load)).not.toHaveProperty('groupBy');
    expect(Object.keys(lastQuery(load)).sort()).toEqual(['page', 'pageSize', 'sorting']);
    choose('line');
    await waitFor(() => expect(lastQuery(load).groupBy).toBe('line'));
    await waitFor(() => expect(headerRows(view.container)).toHaveLength(3));
    choose('');
    await waitFor(() => expect(lastQuery(load)).not.toHaveProperty('groupBy'));
    await waitFor(() => expect(headerRows(view.container)).toHaveLength(0));
  });

  it('header rows show label, result-wide count and subtotals labelled as whole-result; rowcount is -1 and rowindex follows rendered order', async () => {
    const view = render(<Harness loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    choose('line');
    await waitFor(() => expect(headerRows(view.container)).toHaveLength(3));
    const [a, b, none] = headerRows(view.container);
    expect(a.textContent).toContain('A');
    expect(a.textContent).toContain('3행 (전체 결과)');
    expect(b.textContent).toContain('2행 (전체 결과)');
    expect(none.textContent).toContain('(값 없음)');
    const subtotal = a.querySelector('[data-group-subtotal]')!;
    expect(subtotal.getAttribute('title')).toBe('전체 결과 기준 합계');
    expect(subtotal.textContent).toContain('전체 결과 합계');
    expect(subtotal.textContent).toContain('6');
    expect(b.querySelector('[data-group-subtotal]')!.textContent).toContain('30');
    expect(view.container.querySelector('[role="table"]')!.getAttribute('aria-rowcount')).toBe('-1');
    const indices = [...view.container.querySelectorAll('[role="rowgroup"]:last-of-type [role="row"]')].map(r => r.getAttribute('aria-rowindex'));
    expect(indices).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10'].slice(0, indices.length));
    expect(indices.length).toBe(9); // 3 headers + 6 rows
  });

  it('a group continuing from the previous page repeats its header with (이어서), counts stay result-wide', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} pageSize={4} />);
    await screen.findByText(/1\/2/);
    choose('line');
    await waitFor(() => expect(headerRows(view.container).length).toBeGreaterThan(0));
    expect(view.container.textContent).not.toContain('(이어서)');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ page: 1, groupBy: 'line' }));
    await waitFor(() => expect(view.container.querySelector('[data-group-row="B"]')).toBeTruthy());
    const b = view.container.querySelector('[data-group-row="B"]')!;
    expect(b.textContent).toContain('(이어서)');
    expect(b.textContent).toContain('2행 (전체 결과)'); // 1 row on this page, 2 in the result
    expect(view.container.querySelector('[data-group-row=""]')!.textContent).not.toContain('(이어서)');
  });

  it('collapse/expand by keyboard hides only that group\'s rows (aria-expanded + named button)', async () => {
    const view = render(<Harness loadPage={makeLoad()} />);
    await screen.findByText(/1\/1/);
    choose('line');
    await waitFor(() => expect(headerRows(view.container)).toHaveLength(3));
    const button = screen.getByRole('button', { name: 'A 그룹 접기' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.focus();
    // Enter/Space on a native button fire click; jsdom does not synthesise it, so the keyboard path is the button being focusable + clicked.
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    const reopened = screen.getByRole('button', { name: 'A 그룹 펼치기' });
    expect(reopened.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(reopened); // same node: the header is keyed group:A and stays mounted
    expect(view.container.querySelector('[data-row-id="a1"]')).toBeNull();
    expect(view.container.querySelector('[data-row-id="b1"]')).toBeTruthy();
    fireEvent.click(reopened);
    expect(view.container.querySelector('[data-row-id="a1"]')).toBeTruthy();
  });

  it('changing the group returns to page 1 and expands every group, but keeps the selection', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} pageSize={4} selectable />);
    await screen.findByText(/1\/2/);
    choose('line');
    await waitFor(() => expect(headerRows(view.container).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 a1' }));
    fireEvent.click(screen.getByRole('button', { name: 'B 그룹 접기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(lastQuery(load).page).toBe(1));
    choose('');
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ page: 0 }));
    await waitFor(() => expect(view.container.querySelector('[data-row-id="b1"]')).toBeTruthy());
    expect(screen.getByTestId('selected-count').textContent).toBe('1행 선택');
    choose('line');
    await waitFor(() => expect(screen.getByRole('button', { name: 'B 그룹 접기' })).toBeTruthy()); // collapse state was reset
  });

  it('page selection still covers rows of a collapsed group, and the count says so', async () => {
    const view = render(<Harness loadPage={makeLoad()} selectable />);
    await screen.findByText(/1\/1/);
    choose('line');
    await waitFor(() => expect(headerRows(view.container)).toHaveLength(3));
    fireEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 전체 선택' }));
    expect(screen.getByTestId('selected-count').textContent).toBe('6행 선택');
    expect(screen.queryByTestId('selected-collapsed-note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A 그룹 접기' }));
    expect(screen.getByTestId('selected-count').textContent).toBe('6행 선택');
    expect(screen.getByTestId('selected-collapsed-note').textContent).toBe('접힌 그룹의 3행 포함');
  });

  it('a response without groups renders flat even when a group is chosen (rows as before, rowcount unchanged)', async () => {
    const view = render(<Harness loadPage={makeLoad({ omitGroups: true })} />);
    await screen.findByText(/1\/1/);
    choose('line');
    await waitFor(() => expect(view.container.querySelector('[data-row-id="a1"]')).toBeTruthy());
    expect(headerRows(view.container)).toHaveLength(0);
    expect(view.container.querySelector('[role="table"]')!.getAttribute('aria-rowcount')).toBe('7');
  });
});
