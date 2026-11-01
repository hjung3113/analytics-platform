import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PageResult, type PlatformColumn, type TableSelection } from '../PlatformDataTable';

// #556c: select all results (ADR-0104) — opt-in `selectAllResults`; the selection is an exclusion set, never an id list.
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
  // jsdom has no revokeObjectURL; a download's 1 s revoke timer may still be pending after the file ends (#1217b CI).
  URL.revokeObjectURL = originalRevoke ?? (() => {});
});
beforeEach(() => { downloads.length = 0; window.history.replaceState(null, '', '/'); });

const columns: PlatformColumn<Row>[] = [
  { id: 'status', header: '상태', filter: { kind: 'enum', options: [{ value: 'active', label: '사용중' }] } },
  { id: 'name', header: '이름', filter: { kind: 'text' } },
];
const pageOf = (total: number, rows = 3): ApiResponse<PageResult<Row>> => ({
  outcome: 'ok', assessments: [], trust: null, correlationId: 'c',
  data: { rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i + 1}`, status: 'active', name: `n${i + 1}`, n: i, d: '2026-01-05' })), total },
});
const makeLoad = (total = 54, rows = 3) => vi.fn(async (_q: TableQuery, _s: AbortSignal) => pageOf(total, rows));
const exportOk: ApiResponse<Row[]> = { outcome: 'ok', data: [{ id: 'r1', status: 'active', name: 'n1', n: 0, d: '2026-01-05' }], assessments: [], trust: null, correlationId: 'c' };
type Extra = { selectAllResults?: boolean; bulkActions?: boolean; seen?: TableSelection[]; exportRows?: Parameters<typeof PlatformDataTable<Row>>[0]['exportRows']; filterKey?: string };
function Harness(props: { loadPage: (q: TableQuery, s: AbortSignal) => Promise<ApiResponse<PageResult<Row>>> } & Extra) {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={props.loadPage}
      filterKey={props.filterKey ?? 'f'} preferenceKey="test-select-all" pageSize={25} height={200} exportRows={props.exportRows}
      selectAllResults={props.selectAllResults}
      bulkActions={props.bulkActions ? ids => <span data-testid="ids-action">{ids.length}</span> : undefined}
      bulkSelectionActions={props.seen ? sel => { props.seen!.push(sel); return <span data-testid="sel-action">{sel.kind}</span>; } : undefined} />
  </PlatformProvider></I18nProvider>;
}
const header = () => screen.getByRole('checkbox', { name: /현재 페이지 전체 선택|필터 결과 전체 선택 해제/ });
const bar = () => screen.queryByTestId('select-all-bar');
async function selectPage() {
  await screen.findByText(/1\/3/);
  fireEvent.click(header());
}
async function widen() {
  await selectPage();
  fireEvent.click(await screen.findByRole('button', { name: '필터 결과 전체 54행 선택' }));
}

describe('PlatformDataTable select all results (#556c)', () => {
  it('shows the bar only with selectAllResults, a fully selected page and more results behind it', async () => {
    const view = render(<Harness loadPage={makeLoad()} selectAllResults bulkActions />);
    await screen.findByText(/1\/3/);
    expect(bar()).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    expect(bar()).toBeNull(); // page not fully selected
    fireEvent.click(header());
    expect(bar()?.textContent).toContain('이 쪽의 3행을 선택했습니다');
    expect(screen.getByRole('button', { name: '필터 결과 전체 54행 선택' })).toBeTruthy();
    view.unmount();

    const noMore = render(<Harness loadPage={makeLoad(3)} selectAllResults bulkActions />);
    await screen.findByText(/1\/1/);
    fireEvent.click(header());
    expect(bar()).toBeNull(); // the page is the whole result
    noMore.unmount();

    render(<Harness loadPage={makeLoad()} bulkActions />);
    await selectPage();
    expect(bar()).toBeNull();
    expect(screen.getByTestId('ids-action').textContent).toBe('3');
    expect(screen.getByTestId('selected-count').textContent).toBe('3행 선택');
  });

  it('widening switches to the all selection: counts, bulkSelectionActions input and bulkActions hidden', async () => {
    const seen: TableSelection[] = [];
    render(<Harness loadPage={makeLoad()} selectAllResults bulkActions seen={seen} />);
    await widen();
    expect(bar()?.textContent).toContain('필터 결과 전체 54행을 선택했습니다');
    expect(screen.getByTestId('selected-count').textContent).toBe('전체 54행 선택');
    expect(screen.queryByTestId('ids-action')).toBeNull();
    expect(screen.getByTestId('sel-action').textContent).toBe('all');
    expect(seen.at(-1)).toEqual({ kind: 'all', excludedIds: [], total: 54 });
    expect(seen.some(s => s.kind === 'ids')).toBe(true); // before widening the same slot got the ids selection
  });

  it('without bulkSelectionActions an all selection shows no bulk action; the clear button lives in the bar', async () => {
    render(<Harness loadPage={makeLoad()} selectAllResults bulkActions />);
    await widen();
    expect(screen.queryByTestId('ids-action')).toBeNull();
    expect(screen.getAllByRole('button', { name: '선택 해제' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(bar()).toBeNull();
    expect(screen.queryByTestId('selected-count')).toBeNull();
  });

  it('unchecking adds exclusions, re-checking removes them, and the header turns indeterminate', async () => {
    const seen: TableSelection[] = [];
    render(<Harness loadPage={makeLoad()} selectAllResults seen={seen} />);
    await widen();
    expect(header().getAttribute('data-state')).toBe('checked');
    expect(screen.getByRole('checkbox', { name: '선택 r2' }).getAttribute('data-state')).toBe('checked');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    expect(screen.getByTestId('selected-count').textContent).toBe('전체 54행 중 1행 제외');
    expect(seen.at(-1)).toEqual({ kind: 'all', excludedIds: ['r2'], total: 54 });
    expect(header().getAttribute('data-state')).toBe('indeterminate');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    expect(screen.getByTestId('selected-count').textContent).toBe('전체 54행 선택');
    expect(seen.at(-1)).toEqual({ kind: 'all', excludedIds: [], total: 54 });
  });

  it('the header checkbox clears an all selection', async () => {
    render(<Harness loadPage={makeLoad()} selectAllResults bulkActions />);
    await widen();
    fireEvent.click(header());
    expect(bar()).toBeNull();
    expect(screen.queryByTestId('selected-count')).toBeNull();
    expect(screen.getByRole('checkbox', { name: '선택 r1' }).getAttribute('data-state')).toBe('unchecked');
  });

  it('keeps the selection across pages with constant state: rows of the next page are checked, no id list exists', async () => {
    const seen: TableSelection[] = [];
    const load = makeLoad(100_000);
    render(<Harness loadPage={load} selectAllResults seen={seen} />);
    await screen.findByText(/1\/4,?000/);
    fireEvent.click(header());
    fireEvent.click(await screen.findByRole('button', { name: '필터 결과 전체 100,000행 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(load.mock.calls.at(-1)![0].page).toBe(1));
    await screen.findByText(/2\/4,?000/);
    expect(screen.getByRole('checkbox', { name: '선택 r1' }).getAttribute('data-state')).toBe('checked');
    expect(screen.getByTestId('selected-count').textContent).toBe('전체 100,000행 선택');
    expect(seen.at(-1)).toEqual({ kind: 'all', excludedIds: [], total: 100_000 });
  });

  it('a sort keeps the all selection; a column filter change resets it', async () => {
    const load = makeLoad();
    render(<Harness loadPage={load} selectAllResults bulkActions />);
    await widen();
    fireEvent.click(screen.getAllByRole('button', { name: /^상태/ })[0]);
    await waitFor(() => expect(load.mock.calls.at(-1)![0].sorting).toEqual([{ id: 'status', desc: false }]));
    await screen.findByText(/1\/3/);
    expect(screen.getByTestId('selected-count').textContent).toBe('전체 54행 선택');
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: 'n' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(screen.queryByTestId('selected-count')).toBeNull());
    expect(bar()).toBeNull();
  });

  it('a filterKey change resets the all selection', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} selectAllResults bulkActions />);
    await widen();
    view.rerender(<Harness loadPage={load} selectAllResults bulkActions filterKey="other" />);
    await waitFor(() => expect(screen.queryByTestId('selected-count')).toBeNull());
    expect(bar()).toBeNull();
  });

  it('copy is disabled for an all selection with the reason', async () => {
    render(<Harness loadPage={makeLoad()} selectAllResults exportRows={vi.fn(async () => exportOk)} />);
    await widen();
    const copy = screen.getByRole('button', { name: '복사' });
    expect(copy.getAttribute('aria-disabled')).toBe('true');
    fireEvent.focus(copy);
    expect((await screen.findAllByText(/복사는 불러온 행만 읽습니다/)).length).toBeGreaterThan(0);
  });

  it('exports the all scope with the exclusions and the sort', async () => {
    const exportRows = vi.fn(async (..._args: unknown[]) => exportOk);
    render(<Harness loadPage={makeLoad()} selectAllResults exportRows={exportRows} />);
    await widen();
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r3' }));
    fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '선택 53행을 CSV로 내보내기' }));
    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
    expect(exportRows.mock.calls[0][0]).toEqual({ scope: { kind: 'all', excludedIds: ['r3'] }, sorting: [] });
  });
  it('keeps the same focused checkbox element while the select-all state changes (first exclusion, last re-inclusion, header clear)', async () => {
    render(<Harness loadPage={makeLoad()} selectAllResults bulkActions />);
    await widen();
    const row = screen.getByRole('checkbox', { name: '선택 r2' });
    row.focus();
    fireEvent.click(row); // header: all → partial
    const afterExclude = screen.getByRole('checkbox', { name: '선택 r2' });
    expect(afterExclude).toBe(row);
    expect(row.isConnected).toBe(true);
    expect(document.activeElement).toBe(row);
    fireEvent.click(row); // header: partial → all
    expect(screen.getByRole('checkbox', { name: '선택 r2' })).toBe(row);
    expect(document.activeElement).toBe(row);

    const head = header();
    head.focus();
    fireEvent.click(row); // header label stays «전체 선택 해제»; state all → partial
    expect(header()).toBe(head);
    fireEvent.click(row);
    expect(header()).toBe(head);
    expect(document.activeElement).toBe(head);
    head.focus();
    fireEvent.click(head); // clear: header label flips back to «현재 페이지 전체 선택»
    expect(header().isConnected).toBe(true);
    expect(header()).toBe(head);
    expect(document.activeElement).toBe(head);
  });

  it('the live status bar names the exclusions and returns to the all-selected text at zero', async () => {
    render(<Harness loadPage={makeLoad()} selectAllResults bulkActions />);
    await widen();
    expect(bar()?.textContent).toContain('필터 결과 전체 54행을 선택했습니다');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    expect(bar()?.textContent).toContain('필터 결과 전체 54행 중 1행 제외');
    expect(bar()?.textContent).not.toContain('선택했습니다');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    expect(bar()?.textContent).toContain('필터 결과 전체 54행을 선택했습니다');
  });
});
