import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ColumnFilter, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { useRowsSource } from '../useRowsSource';
import { PlatformDataTable, type PlatformColumn, type TableUrlState } from '../PlatformDataTable';

// #1672: the `rows` input — the table filters, groups, sorts and pages rows the page already holds.
type Row = { id: string; score: number; line: string; qty: number };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const exportRegistry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
let restore: (() => void) | undefined;
beforeEach(() => { restore = stubCompactTableGeometry(800); });
afterEach(() => { cleanup(); restore?.(); vi.restoreAllMocks(); });

const make = (...scores: number[]): Row[] => scores.map((score, i) => ({ id: `r${i + 1}`, score, line: i % 2 ? 'B' : 'A', qty: 10 * (i + 1) }));
// `rank` is not a property of Row: the column's value reads `score`.
const columns: PlatformColumn<Row>[] = [
  { id: 'rank', header: 'Rank', value: r => r.score, cell: r => r.id },
  { id: 'line', header: 'Line', cell: r => r.line, groupable: true, filter: { kind: 'text' } },
  { id: 'qty', header: 'Qty', subtotal: true },
];
const controlled = (over: Partial<TableUrlState> = {}): TableUrlState => ({ page: 1, sorting: [], onChange: () => {}, ...over });

type ExportRows = NonNullable<Parameters<typeof PlatformDataTable<Row>>[0]['exportRows']>;
type Extra = { rowsLoading?: boolean; urlState?: TableUrlState; externalPagination?: { summary: string; controls: string }; columns?: PlatformColumn<Row>[]; pageSize?: number; filterKey?: string; exportRows?: ExportRows };
function Harness({ rows, ...extra }: { rows: readonly Row[] } & Extra) {
  return <I18nProvider><PlatformProvider {...(extra.exportRows ? { equipmentAxes: axes } : {})} adapter={adapter} registry={extra.exportRows ? exportRegistry : registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={extra.columns ?? columns} getRowId={r => r.id} rows={rows} rowsLoading={extra.rowsLoading}
      urlState={extra.urlState} externalPagination={extra.externalPagination} filterKey={extra.filterKey} exportRows={extra.exportRows} preferenceKey="rows-table" pageSize={extra.pageSize ?? 2} height={300}
      bulkActions={ids => <span data-testid="ids">{ids.join(',')}</span>} />
  </PlatformProvider></I18nProvider>;
}
const shownIds = () => screen.getAllByRole('row').map(r => /r\d+/.exec(r.textContent ?? '')?.[0]).filter(Boolean);

describe('PlatformDataTable rows', () => {
  it('sorts by the column value (not the id property) and pages locally', async () => {
    const rows = make(30, 10, 20, 40);
    const view = render(<Harness rows={rows} urlState={controlled({ sorting: [{ id: 'rank', desc: false }] })} />);
    await waitFor(() => expect(shownIds()).toEqual(['r2', 'r3']));
    view.rerender(<Harness rows={rows} urlState={controlled({ sorting: [{ id: 'rank', desc: true }], page: 2 })} />);
    await waitFor(() => expect(shownIds()).toEqual(['r3', 'r2']));
  });

  it('a new rows reference keeps page and selection and shows the new rows', async () => {
    const view = render(<Harness rows={make(1, 2, 3, 4, 5)} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(shownIds()).toEqual(['r3', 'r4']));
    expect(screen.getAllByRole('row').some(r => r.textContent?.includes('40'))).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r3' }));
    // r4's visible qty changes (40 → 99) on the page being shown; the extra row only lengthens the set.
    view.rerender(<Harness rows={[...make(1, 2, 3, 4, 5).map(r => r.id === 'r4' ? { ...r, qty: 99 } : r), { id: 'r9', score: 9, line: 'A', qty: 1 }]} />);
    await waitFor(() => expect(screen.getAllByRole('row').some(r => r.textContent?.includes('99'))).toBe(true));
    expect(screen.getByText(/2\/3/)).toBeTruthy();
    expect(shownIds()).toEqual(['r3', 'r4']);
    expect(screen.getByTestId('ids')).toHaveTextContent('r3');
  });

  it('a filterKey change still returns to page 1 and clears the selection', async () => {
    const rows = make(1, 2, 3, 4, 5);
    const view = render(<Harness rows={rows} filterKey="a" />);
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(shownIds()).toEqual(['r3', 'r4']));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r3' }));
    view.rerender(<Harness rows={rows} filterKey="b" />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2']));
    expect(screen.queryByTestId('ids')).toBeNull();
  });

  it('rowsLoading shows the loading state and its end shows the rows', async () => {
    const rows = make(1, 2);
    const view = render(<Harness rows={[]} rowsLoading />);
    expect(await screen.findByText('불러오는 중…')).toBeTruthy();
    view.rerender(<Harness rows={rows} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2']));
  });

  it('externalPagination shows every given row in the given order', async () => {
    render(<Harness rows={make(3, 1, 2, 9, 5)} externalPagination={{ summary: '5건', controls: 'ctl' }} urlState={controlled({ sorting: [{ id: 'rank', desc: false }] })} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']));
    expect(screen.getByText('5건')).toBeTruthy();
  });

  it('column filters narrow the rows', async () => {
    const filters: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'B' }];
    render(<Harness rows={make(1, 2, 3, 4)} urlState={controlled({ filters })} pageSize={10} />);
    await waitFor(() => expect(shownIds()).toEqual(['r2', 'r4']));
  });

  it('a filter that fails validateFilters shows the error state', async () => {
    const filters: ColumnFilter[] = [{ id: 'line', op: 'gt', value: 1 }];
    render(<Harness rows={make(1, 2)} urlState={controlled({ filters })} />);
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('groupable groups with subtotal columns', async () => {
    const user = userEvent.setup();
    const view = render(<Harness rows={make(1, 2, 3, 4)} pageSize={10} />);
    await waitFor(() => expect(shownIds()).toHaveLength(4));
    await user.click(screen.getByRole('button', { name: /^그룹: / }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Line' }));
    await waitFor(() => expect(view.container.querySelectorAll('[data-group-row]')).toHaveLength(2));
    const [a, b] = [...view.container.querySelectorAll('[data-group-row]')];
    expect(a.textContent).toContain('2행 (전체 결과)');
    expect(a.textContent).toContain('40');
    expect(b.textContent).toContain('60');
  });

  it('with externalPagination, filter, filterFields and groupable render no control and warn once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<Harness rows={make(1, 2)} externalPagination={{ summary: '2건', controls: 'ctl' }} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2']));
    view.rerender(<Harness rows={make(1, 2, 3)} externalPagination={{ summary: '3건', controls: 'ctl' }} />);
    await waitFor(() => expect(shownIds()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /^그룹: / })).toBeNull();
    expect(screen.queryByRole('button', { name: /필터/ })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('with externalPagination, controlled filters do not change identity: the selection survives a filter change', async () => {
    const rows = make(1, 2, 3, 4);
    const ext = { summary: '4건', controls: 'ctl' };
    const f1: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'A' }];
    const f2: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'B' }];
    const view = render(<Harness rows={rows} externalPagination={ext} urlState={controlled({ filters: f1 })} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2', 'r3', 'r4']));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    view.rerender(<Harness rows={rows} externalPagination={ext} urlState={controlled({ filters: f2 })} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2', 'r3', 'r4']));
    expect(screen.getByTestId('ids')).toHaveTextContent('r2');
  });

  it('with externalPagination and no rows, controlled filters the table ignores do not offer «조건 초기화» (#1940)', async () => {
    const onChange = vi.fn();
    const filters: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'B' }];
    render(<Harness rows={[]} externalPagination={{ summary: '0건', controls: 'ctl' }} urlState={{ ...controlled({ filters }), onChange }} />);
    await screen.findByText('조건에 맞는 결과가 없습니다');
    expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with externalPagination, controlled filters are neither sent to exportRows nor described', async () => {
    const exportRows = vi.fn(async (..._args: unknown[]) => ({ outcome: 'ok' as const, data: make(1, 2), assessments: [], trust: null, correlationId: 'c' }));
    window.history.replaceState(null, '', '/'); // earlier tests leave the address elsewhere; the export menu resolves its route from it
    const filters: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'B' }];
    render(<Harness rows={make(1, 2)} externalPagination={{ summary: '2건', controls: 'ctl' }} urlState={controlled({ filters })} exportRows={exportRows} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2']));
    fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^필터 결과 전체 \d+행을 Excel/ }));
    await waitFor(() => expect(exportRows).toHaveBeenCalledTimes(1));
    expect(exportRows.mock.calls[0][0]).toEqual({ scope: { kind: 'filtered' }, sorting: [] });
  });

  it('switching filtered local rows to externalPagination shows every row', async () => {
    const rows = make(1, 2, 3, 4);
    const filters: ColumnFilter[] = [{ id: 'line', op: 'equals', value: 'B' }];
    const view = render(<Harness rows={rows} urlState={controlled({ filters })} pageSize={10} />);
    await waitFor(() => expect(shownIds()).toEqual(['r2', 'r4']));
    view.rerender(<Harness rows={rows} urlState={controlled({ filters })} pageSize={10} externalPagination={{ summary: '4건', controls: 'ctl' }} />);
    await waitFor(() => expect(shownIds()).toEqual(['r1', 'r2', 'r3', 'r4']));
  });

  it('a pending rowsLoading read rejects with AbortError when its signal aborts', async () => {
    let load: ((query: TableQuery, signal: AbortSignal) => Promise<unknown>) | undefined;
    function Probe() {
      const source = useRowsSource<Row>({ rows: [], rowsLoading: true, external: true, columns, filterFields: undefined });
      load = source.loadPage as typeof load;
      return null;
    }
    render(<Probe />);
    const query = { page: 1, pageSize: 2 } as TableQuery;
    const controller = new AbortController();
    const pending = load!(query, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const already = new AbortController(); already.abort();
    await expect(load!(query, already.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it.each([false, true])('external rows only offer sorting with urlState (%s)', async controlledSort => {
  const onChange = vi.fn();
  const view = render(<Harness rows={make(3, 1, 2)} columns={[columns[0]]}
    externalPagination={{ summary: '3건', controls: 'ctl' }}
    urlState={controlledSort ? controlled({ onChange }) : undefined} />);
  await waitFor(() => expect(shownIds()).toHaveLength(3));
  const header = screen.getByRole('columnheader', { name: /Rank/ });
  const button = header.querySelector('button');
  if (controlledSort) {
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sorting: [{ id: 'rank', desc: true }] }), 'user');
  } else {
    expect(button).toBeNull();
    fireEvent.click(header);
    expect(view.container.querySelector('[aria-sort="ascending"]')).toBeNull();
  }
  expect(shownIds()).toEqual(['r1', 'r2', 'r3']);
});
