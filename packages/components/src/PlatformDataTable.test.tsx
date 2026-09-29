import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SortingState } from '@tanstack/react-table';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PlatformDataTable, type PageQuery, type PageResult, type PlatformDataTableProps, type TableUrlState } from './PlatformDataTable';

afterEach(cleanup);

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const session: Session = {
  user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view'] }, scopes: [],
};
const adapter: PlatformAdapter = {
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }),
  auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  recordUsage: async () => ({ accepted: 0 }),
  usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  myVocHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  mySurveyHistory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  reportClientError: async () => ({ accepted: true }),
  subscribe: () => () => {},
};

type Row = { id: string; status: string };
const columns: PlatformDataTableProps<Row>['columns'] = [
  { accessorKey: 'status', header: 'Status', sortDescFirst: false, cell: info => String(info.getValue()) },
];

function makeLoadPage(total: number) {
  return vi.fn(async (q: PageQuery): Promise<ApiResponse<PageResult<Row>>> => ({
    outcome: 'ok',
    data: { rows: Array.from({ length: Math.min(3, total) }, (_, i) => ({ id: `r${q.page * q.pageSize + i + 1}`, status: `s${i}` })), total },
    assessments: [], trust: null, correlationId: 'c',
  }));
}

function Harness(props: { page: number | null; sorting: SortingState; onChange: TableUrlState['onChange']; loadPage: PlatformDataTableProps<Row>['loadPage']; filterKey?: string }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable
      title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
      loadPage={props.loadPage} filterKey={props.filterKey ?? 'f'} preferenceKey="test-table"
      pageSize={25} height={200}
      urlState={{ page: props.page, sorting: props.sorting, onChange: props.onChange }}
    />
  </PlatformProvider></I18nProvider>;
}

function UncontrolledHarness(props: { loadPage: PlatformDataTableProps<Row>['loadPage'] }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable
      title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
      loadPage={props.loadPage} filterKey="f" preferenceKey="test-table" pageSize={25} height={200}
    />
  </PlatformProvider></I18nProvider>;
}

describe('PlatformDataTable controlled mode (urlState)', () => {
  it('renders the given sort and page, and loadPage receives the 0-based page', async () => {
    const loadPage = makeLoadPage(30);
    render(<Harness page={2} sorting={[{ id: 'status', desc: false }]} onChange={vi.fn()} loadPage={loadPage} />);
    expect(await screen.findByText(/2\/2/)).toBeTruthy(); // pager shows 1-based page 2 of 2
    const header = screen.getByRole('columnheader', { name: /Status/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(loadPage).toHaveBeenCalledWith({ page: 1, pageSize: 25, sorting: [{ id: 'status', desc: false }] }, expect.anything());
  });

  it('header click reports the next sorting with page reset to null, reason user', async () => {
    const onChange = vi.fn();
    render(<Harness page={2} sorting={[]} onChange={onChange} loadPage={makeLoadPage(30)} />);
    await screen.findByText(/2\/2/);
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ sorting: [{ id: 'status', desc: false }], page: null }, 'user');
  });

  it('Next reports the same sorting with the 1-based page, Previous from page 2 reports null', async () => {
    const onChange = vi.fn();
    const loadPage = makeLoadPage(30);
    const view = render(<Harness page={null} sorting={[{ id: 'status', desc: true }]} onChange={onChange} loadPage={loadPage} />);
    await screen.findByText(/1\/2/);
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(loadPage).toHaveBeenCalledWith(expect.objectContaining({ page: 0 }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ sorting: [{ id: 'status', desc: true }], page: 2 }, 'user');

    view.rerender(<Harness page={2} sorting={[{ id: 'status', desc: true }]} onChange={onChange} loadPage={loadPage} />);
    await screen.findByText(/2\/2/);
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ sorting: [{ id: 'status', desc: true }], page: null }, 'user');
  });

  it('a filterKey change does not call onChange — the page owns resets', async () => {
    const onChange = vi.fn();
    const loadPage = makeLoadPage(30);
    const view = render(<Harness page={2} sorting={[{ id: 'status', desc: false }]} onChange={onChange} loadPage={loadPage} />);
    await screen.findByText(/2\/2/);
    view.rerender(<Harness page={2} sorting={[{ id: 'status', desc: false }]} onChange={onChange} loadPage={loadPage} filterKey="g" />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2)); // refetches under the new context identity
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PlatformDataTable uncontrolled (no urlState) keeps internal state', () => {
  it('sort and page changes stay internal and loadPage is refetched', async () => {
    const loadPage = makeLoadPage(30);
    render(<UncontrolledHarness loadPage={loadPage} />);
    expect(await screen.findByText(/1\/2/)).toBeTruthy();
    const header = screen.getByRole('columnheader', { name: /Status/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Status' }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()); // sort refetch settles
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText(/2\/2/)).toBeTruthy();
    expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }), expect.anything());
  });
});
