import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, GlobalContext, PageSort, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useI18n, usePlatform } from '@ap/kernel';
import { toColumnDef } from './columnDef';
import * as publicApi from './index';
import { readXlsx } from './xlsxTestReader';
import { PlatformDataTable, type PageQuery, type PageResult, type PlatformDataTableProps, type TableUrlState } from './PlatformDataTable';

afterEach(cleanup);

const unstubbedOffsetWidth = document.createElement('div').offsetWidth;

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
  menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
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
  listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  reportClientError: async () => ({ accepted: true }),
  subscribe: () => () => {},
};

type Row = { id: string; status: string };
const columns: PlatformDataTableProps<Row>['columns'] = [
  { id: 'status', header: 'Status', cell: row => String(row.status) },
];

function makeLoadPage(total: number) {
  return vi.fn(async (q: PageQuery): Promise<ApiResponse<PageResult<Row>>> => ({
    outcome: 'ok',
    data: { rows: Array.from({ length: Math.min(3, total) }, (_, i) => ({ id: `r${q.page * q.pageSize + i + 1}`, status: `s${i}` })), total },
    assessments: [], trust: null, correlationId: 'c',
  }));
}

function Harness(props: { page: number | null; sorting: PageSort[]; onChange: TableUrlState['onChange']; loadPage: PlatformDataTableProps<Row>['loadPage']; filterKey?: string }) {
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

describe('PlatformColumn conversion defaults (#160)', () => {
  // jsdom reports zero layout, so @tanstack/react-virtual computes an empty virtual range and no
  // table row renders (the tests outside this block only assert the footer/header). Small fixed
  // metrics — rows 32px, other elements 420px/800px — keep getVirtualItems() populated for the
  // cell-render assertions below, scoped to this block and restored after it. observeElementRect
  // reads offsetWidth/Height; measureElement reads getBoundingClientRect.
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const height = this.getAttribute('role') === 'row' ? 32 : 420;
      return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterAll(() => {
    vi.restoreAllMocks();
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
  });

  type Plain = { id: string; status: string | null; visits: number };
  const plainRows: Plain[] = [
    { id: 'r1', status: 's1', visits: 3 },
    { id: 'r2', status: null, visits: 4 },
  ];
  // No value/cell: the defaults must read row[id] and render String(value), '' for null.
  const plainColumns: PlatformDataTableProps<Plain>['columns'] = [
    { id: 'status', header: 'Status' },
    { id: 'visits', header: 'Visits', align: 'right' },
    { id: 'fixed', header: 'Fixed', sortable: false, hideable: false },
  ];

  function PlainHarness(props: { onChange?: TableUrlState['onChange'] }) {
    const loadPage = vi.fn(async (): Promise<ApiResponse<PageResult<Plain>>> => ({
      outcome: 'ok', data: { rows: plainRows, total: plainRows.length }, assessments: [], trust: null, correlationId: 'c',
    }));
    return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformDataTable<Plain>
        title="T" ariaLabel="table" columns={plainColumns} getRowId={r => r.id}
        loadPage={loadPage} filterKey="f" preferenceKey="plain-table" pageSize={25} height={200}
        urlState={{ page: null, sorting: [], onChange: props.onChange ?? (() => {}) }}
      />
    </PlatformProvider></I18nProvider>;
  }

  const cellOf = (rowId: string, column: string) => document.querySelector(`[data-row-id="${rowId}"] [data-column="${column}"]`);

  it('cell defaults to String(row[id]) with "" for null; align right renders the tabular class', async () => {
    render(<PlainHarness />);
    expect(await screen.findByText('s1')).toBeTruthy(); // value default row[id], cell default String(value)
    expect(cellOf('r2', 'status')!.textContent).toBe(''); // null/undefined renders ''
    expect(screen.getByText('3')).toBeTruthy(); // number renders via String(), not raw ReactNode
    expect(cellOf('r1', 'visits')!.className).toContain('justify-end text-right tabular');
  });

  it('sortable: false renders no sort button; hideable: false stays out of the column menu', async () => {
    render(<PlainHarness />);
    await screen.findByText('s1');
    expect(screen.queryByRole('button', { name: 'Fixed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
    const menu = (await screen.findByText('컬럼 설정 (브라우저에 저장)')).parentElement!;
    expect(within(menu).queryByText('Fixed')).toBeNull();
    expect(within(menu).getByText('Status')).toBeTruthy();
  });

  it('a header sort gesture reports the column id as PageSort[]', async () => {
    const onChange = vi.fn();
    render(<PlainHarness onChange={onChange} />);
    await screen.findByText('s1');
    fireEvent.click(screen.getByRole('button', { name: 'Visits' }));
    expect(onChange).toHaveBeenCalledWith({ sorting: [{ id: 'visits', desc: true }] satisfies PageSort[], page: null }, 'user');
  });
});

describe('PlatformColumn size default (#160 review P3-1)', () => {
  it('a column without size carries no own size key, so the table defaultColumn.size applies', () => {
    expect(Object.prototype.hasOwnProperty.call(toColumnDef({ id: 'a', header: 'A' }), 'size')).toBe(false);
    expect(toColumnDef({ id: 'b', header: 'B', size: 90 }).size).toBe(90);
  });

  // #160 review N1: the conversion stays internal — the public entry never exposes an engine type.
  it('keeps toColumnDef out of the public @ap/components entry', () => {
    expect('toColumnDef' in publicApi).toBe(false);
  });
});

describe('jsdom layout stub stays scoped to the #160 block (review P3-3)', () => {
  it('offsetWidth and getBoundingClientRect are restored after the block', () => {
    expect(document.createElement('div').offsetWidth).toBe(unstubbedOffsetWidth);
    expect(vi.isMockFunction(Element.prototype.getBoundingClientRect)).toBe(false);
  });
});

// ---- table-owned export (#173) ----

const exportRegistry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'export-menu' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'export-menu', group: 'overview', primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

/** 조회 정보 global rows (#173 P2-3): same menu shape, but it applies every Context key the sheet must render. */
const contextRegistry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'export-menu' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'export-menu', group: 'overview', primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false,
    context: { ...none, roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' },
    pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

/** File-name sanitize (#173 P3-12): a menu id with a space and a dot must become a safe file name base. */
const dirtyMenuRegistry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'ex port.menu' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'ex port.menu', group: 'overview', primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

/** Sets the global Context once on mount (initial) and on click (context-change abort tests). */
function GlobalControls({ initial }: { initial?: Partial<GlobalContext> }) {
  const { setGlobal } = usePlatform();
  useEffect(() => { if (initial) setGlobal(initial); }, []);
  return <button type="button" onClick={() => setGlobal({ ppid: 'PP-CHANGED' })}>bump-ppid</button>;
}

/** Switches the I18nProvider to English on mount (storage is not writable in this environment). */
function SetLangEn() {
  const { setLang } = useI18n();
  useEffect(() => { setLang('en'); }, []);
  return null;
}

type Download = { name: string; blob: Blob };
const downloads: Download[] = [];
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function ToastProbe() {
  const { toasts } = usePlatform();
  return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.text}</p>)}</div>;
}

function ExportHarness(props: {
  loadPage: PlatformDataTableProps<Row>['loadPage'];
  exportRows?: PlatformDataTableProps<Row>['exportRows'];
  exportNote?: string;
  exportFilterSummary?: PlatformDataTableProps<Row>['exportFilterSummary'];
  filterKey?: string;
  /** Controlled sort (§6.1): the export request must carry the table's active sorting (#173 UX P2-6). */
  sorting?: PageSort[];
  registry?: typeof exportRegistry;
  /** Rendered inside the same PlatformProvider (global-Context controls for export tests). */
  probe?: ReactNode;
  columns?: PlatformDataTableProps<Row>['columns'];
}) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={props.registry ?? exportRegistry}>
    <PlatformDataTable<Row>
      title="T" ariaLabel="table" columns={props.columns ?? columns} getRowId={r => r.id}
      loadPage={props.loadPage} filterKey={props.filterKey ?? 'f'} preferenceKey="test-export-table"
      pageSize={25} height={200} exportRows={props.exportRows} exportNote={props.exportNote}
      exportFilterSummary={props.exportFilterSummary}
      urlState={props.sorting === undefined ? undefined : { page: null, sorting: props.sorting, onChange: () => {} }}
    />
    {props.probe}
    <ToastProbe />
  </PlatformProvider></I18nProvider>;
}

const ok = (rows: Row[], trust?: ApiResponse<Row[]>['trust']): ApiResponse<Row[]> => ({ outcome: 'ok', data: rows, assessments: [], trust: trust ?? null, correlationId: 'c' });
const refused = (outcome: 'forbidden' | 'too_large' | 'error' | 'timeout'): ApiResponse<Row[]> => ({ outcome, data: null, assessments: [], trust: null, correlationId: 'c' });

// Same scoped jsdom layout stubs as the #160 block: without them the virtualizer renders no rows, so the
// row checkboxes (selection) never appear. Restored in this block's afterAll.
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});
const emptyEnvelope: ApiResponse<Row[]> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' };
// FileReader.readAsText goes through the UTF-8 decoder, which consumes the BOM — so text assertions compare
// the payload and the BOM itself is asserted from the raw leading bytes (EF BB BF).
const blobHasBom = (blob: Blob) => new Promise<boolean>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer).slice(0, 3).toString() === '239,187,191');
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});

const exportTrigger = () => screen.getByRole('button', { name: /^내보내기/ });
/** Toolbar D: open [내보내기 ▾] with the keyboard (Radix opens on Enter) and choose the item by its accessible name. */
async function exportVia(name: string | RegExp) {
  fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}
const FILTERED_CSV = /^필터 결과 전체 \d+행을 CSV로 내보내기$/;

describe('PlatformDataTable table-owned export (#173)', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const height = this.getAttribute('role') === 'row' ? 32 : 420;
      return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    URL.createObjectURL = (blob: Blob) => { downloads.push({ name: '', blob }); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      const last = downloads[downloads.length - 1];
      if (last) last.name = this.download;
    });
  });
  afterAll(() => {
    vi.restoreAllMocks();
    if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
    if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
  beforeEach(() => { downloads.length = 0; });
  it('shows the button only when exportRows is given AND the manifest declares features.export', async () => {
    const loadPage = makeLoadPage(3);
    const { unmount } = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
        loadPage={loadPage} filterKey="f" preferenceKey="test-export-table" pageSize={25} height={200}
        exportRows={(_request, _signal) => Promise.resolve(ok([]))} />
    </PlatformProvider></I18nProvider>);
    await screen.findByText(/1\/1/);
    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull(); // features.export false in this registry
    unmount();

    render(<ExportHarness loadPage={loadPage} />); // no exportRows
    await screen.findByText(/1\/1/);
    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull();
  });

  it('exports the filtered set when nothing is selected: BOM + CRLF CSV from the column definitions, count toast', async () => {
    const exportRows = vi.fn(async () => ok([{ id: 'r1', status: 'a' }, { id: 'r2', status: 'b' }]));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'filtered' }, sorting: [] }, expect.anything());
    expect(downloads[0].name).toMatch(/^export-menu-\d{8}-\d{4}\.csv$/);
    expect(await blobText(downloads[0].blob)).toBe('Status\r\na\r\nb\r\n');
    expect(await blobHasBom(downloads[0].blob)).toBe(true);
    expect(screen.getByText('필터 결과 전체 2행을 CSV 파일로 내보냈습니다')).toBeTruthy();
  });

  it('exports only the selection, reconciles by getRowId and says which selected rows are gone', async () => {
    const exportRows = vi.fn(async (request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] }) =>
      request.scope.kind === 'selected' ? ok([{ id: 'r1', status: 'a' }]) : ok([]));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    await exportVia('선택 2행을 CSV로 내보내기');
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'selected', ids: ['r1', 'r2'] }, sorting: [] }, expect.anything());
    expect(await blobText(downloads[0].blob)).toBe('Status\r\na\r\n');
    expect(screen.getByText('선택 2행 중 1행 — 1행은 현재 결과에 없음')).toBeTruthy();
    expect(screen.getByText('선택 1행을 CSV 파일로 내보냈습니다')).toBeTruthy();
  });

  it('builds no file for forbidden/too_large/error/timeout and toasts the reason', async () => {
    for (const outcome of ['forbidden', 'too_large', 'error', 'timeout'] as const) {
      const view = render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => refused(outcome))} />);
      await screen.findByText(/1\/1/);
      await exportVia(FILTERED_CSV);
      await waitFor(() => expect(screen.getByTestId('toast-probe').textContent).toContain('내보'));
      expect(downloads.length).toBe(0);
      const text = screen.getByTestId('toast-probe').textContent ?? '';
      expect(text).toContain(outcome === 'too_large' ? '내보내기 상한을 넘었습니다' : outcome === 'forbidden' ? '거부' : outcome === 'timeout' ? '시간 초과' : '수행하지 못했습니다');
      view.unmount();
      downloads.length = 0;
    }
  });

  it('empty outcome writes a header-only file', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => emptyEnvelope)} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(await blobText(downloads[0].blob)).toBe('Status\r\n');
    expect(screen.getByText('필터 결과 전체 0행을 CSV 파일로 내보냈습니다')).toBeTruthy();
  });

  it('suffixes -provisional before the extension and tells the data-through time in the toast; unknown stays unknown', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([{ id: 'r1', status: 'a' }], { updatedAt: '2026-10-02T09:00:00+09:00', dataThrough: null, coverage: null, provisional: true, source: 'mart' }))} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(downloads[0].name).toMatch(/^export-menu-\d{8}-\d{4}-provisional\.csv$/);
    // dataThrough is null → “기준 시각 미확인”; updatedAt is never substituted as the data-through time.
    expect(screen.getByText('필터 결과 전체 1행을 CSV 파일로 내보냈습니다 — 잠정 데이터(기준 시각 미확인)')).toBeTruthy();
    expect(screen.getByTestId('toast-probe').textContent).not.toContain('2026-10-02 09:00');
  });

  it('appends exportNote to the completion toast', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([]))} exportNote="페이지 필터가 적용된 목록입니다" />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(screen.getByText(/페이지 필터가 적용된 목록입니다/)).toBeTruthy());
    expect(screen.getByText('필터 결과 전체 0행을 CSV 파일로 내보냈습니다 — 페이지 필터가 적용된 목록입니다')).toBeTruthy();
  });

  it('refuses to build a file over the defensive client cap and says why', async () => {
    const rows = Array.from({ length: 100_001 }, (_, i) => ({ id: `r${i}`, status: 's' }));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok(rows))} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(screen.getByTestId('toast-probe').textContent).toContain('100,000'));
    expect(downloads.length).toBe(0);
  });

  it('aborts an in-flight export on filterKey change, marks the trigger aria-disabled while running, and stays silent', async () => {
    let signal: AbortSignal | undefined;
    const exportRows = vi.fn((_request: unknown, s: AbortSignal) => new Promise<ApiResponse<Row[]>>(resolve => {
      signal = s;
      s.addEventListener('abort', () => resolve(refused('error')));
    }));
    const loadPage = makeLoadPage(3);
    const view = render(<ExportHarness loadPage={loadPage} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    const button = exportTrigger() as HTMLButtonElement;
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(exportRows).toHaveBeenCalled());
    // aria-disabled + aria-busy, never native disabled: the trigger must stay focusable (UX P2-2).
    expect(button).not.toBeDisabled();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');

    view.rerender(<ExportHarness loadPage={loadPage} exportRows={exportRows} filterKey="g" />);
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await waitFor(() => expect(exportTrigger().getAttribute('aria-disabled')).toBeNull());
    expect(downloads.length).toBe(0);
    expect(screen.getByTestId('toast-probe').textContent).toBe('');
  });

  // ---- toolbar D export menu (#173 step 2, #172 confirmed D) ----
  it('without a selection the menu has one group "필터 결과 전체 N행" with Excel then CSV, names carrying the target', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([]))} />);
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(item => item.getAttribute('aria-label')))
      .toEqual(['필터 결과 전체 3행을 Excel(.xlsx)로 내보내기', '필터 결과 전체 3행을 CSV로 내보내기']);
    expect(within(menu).getByText('필터 결과 전체 3행')).toBeTruthy();
    expect(within(menu).queryByText(/^선택/)).toBeNull();
  });

  it('with a selection the menu offers 선택 N행 and 필터 결과 전체 N행; choosing all-filtered exports {kind:filtered} without clearing the selection', async () => {
    const exportRows = vi.fn(async (_request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] }) => ok([{ id: 'r1', status: 'a' }, { id: 'r2', status: 'b' }, { id: 'r3', status: 'c' }]));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(item => item.getAttribute('aria-label'))).toEqual([
      '선택 1행을 Excel(.xlsx)로 내보내기', '선택 1행을 CSV로 내보내기',
      '필터 결과 전체 3행을 Excel(.xlsx)로 내보내기', '필터 결과 전체 3행을 CSV로 내보내기',
    ]);
    expect(within(menu).getByRole('separator')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: '필터 결과 전체 3행을 CSV로 내보내기' }));
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'filtered' }, sorting: [] }, expect.anything());
    expect(await blobText(downloads[0].blob)).toBe('Status\r\na\r\nb\r\nc\r\n');
    expect(screen.getByTestId('selected-count').textContent).toBe('1행 선택'); // selection kept (UX P3-1: row unit)
    expect(screen.getByText('필터 결과 전체 3행을 CSV 파일로 내보냈습니다')).toBeTruthy();
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([]))} />);
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(exportTrigger());
  });

  it('selection Excel export: .xlsx with numbers kept, 조회 정보 from the response trust, Excel toast', async () => {
    const trust = { updatedAt: '2026-10-02T09:00:00+09:00', dataThrough: '2026-10-02T08:00:00+09:00', coverage: 0.97, metricVersion: '3', provisional: true, source: 'mart' };
    const exportRows = vi.fn(async () => ({ ...ok([{ id: 'r1', status: '=1+1' }, { id: 'r2', status: 'b' }], trust), correlationId: 'corr-1' }));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    await exportVia('선택 2행을 Excel(.xlsx)로 내보내기');
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'selected', ids: ['r1', 'r2'] }, sorting: [] }, expect.anything());
    expect(downloads[0].name).toMatch(/^export-menu-\d{8}-\d{4}-provisional\.xlsx$/);
    const { sheetNames, sheets: [data, info] } = await readXlsx(downloads[0].blob);
    expect(sheetNames).toEqual(['데이터', '조회 정보']);
    expect([data.A1, data.A2, data.A3]).toEqual(['Status', '=1+1', 'b']);
    const rows = Object.fromEntries(Object.keys(info).filter(k => k.startsWith('A')).map(k => [info[k], info['B' + k.slice(1)]]));
    // Values render like the screen (#173 P3-1): space-separated times, coverage as a "97.0%" string.
    expect(rows).toMatchObject({
      메뉴: 'export-menu', 대상: '선택 2행', '갱신 시각': '2026-10-02 09:00:00+09:00', '데이터 기준 시각': '2026-10-02 08:00:00+09:00',
      커버리지: '97.0%', '지표 버전': '3', '잠정 여부': '잠정', 원천: 'mart', 'Correlation ID': 'corr-1',
    });
    expect(rows.Scope).toBeUndefined(); // no Scope in this Context → empty, never invented
    expect(rows['내보낸 시각']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(screen.getByText('선택 2행을 Excel 파일로 내보냈습니다 — 잠정 데이터(데이터 기준 시각 2026-10-02 08:00)')).toBeTruthy();
  });

  // ---- #173 review fixes ----

  it('carries the table’s active sorting in the export request, so the export can follow the screen order (UX P2-6)', async () => {
    const exportRows = vi.fn(async () => ok([]));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} sorting={[{ id: 'status', desc: true }]} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(exportRows).toHaveBeenCalledWith({ scope: { kind: 'filtered' }, sorting: [{ id: 'status', desc: true }] }, expect.anything());
  });

  it('a column producing a Date is a serializer error, not a server failure: dev console.error names the column, no file', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const dateColumns: PlatformDataTableProps<Row>['columns'] = [...columns, { id: 'badAt', header: 'At', value: () => new Date('2026-10-02T00:00:00Z') }];
      render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([{ id: 'r1', status: 'a' }]))} columns={dateColumns} />);
      await screen.findByText(/1\/1/);
      await exportVia(FILTERED_CSV);
      await waitFor(() => expect(screen.getByTestId('toast-probe').textContent).toContain('내보내기를 수행하지 못했습니다'));
      expect(downloads.length).toBe(0);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain('badAt');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('releases the object URL after the click settles, not synchronously (Safari cancels synchronous revokes)', async () => {
    const revocations: string[] = [];
    const stubbedRevoke = URL.revokeObjectURL;
    const stubbedCreate = URL.createObjectURL;
    // A URL unique to this test: earlier tests release their own URLs on the same 1s timers.
    URL.revokeObjectURL = (url: string) => { revocations.push(url); };
    URL.createObjectURL = (blob: Blob) => { downloads.push({ name: '', blob }); return 'blob:revoke-test'; };
    try {
      render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([{ id: 'r1', status: 'a' }]))} />);
      await screen.findByText(/1\/1/);
      await exportVia(FILTERED_CSV);
      await waitFor(() => expect(downloads.length).toBeGreaterThanOrEqual(1));
      expect(revocations).not.toContain('blob:revoke-test'); // synchronous revoke would race the download
      await new Promise(resolve => setTimeout(resolve, 1050));
      expect(revocations).toContain('blob:revoke-test');
    } finally {
      URL.revokeObjectURL = stubbedRevoke;
      URL.createObjectURL = stubbedCreate;
    }
  });

  it('while a delayed export runs the trigger keeps focus and announces the target; a second item run is refused', async () => {
    let finish: ((response: ApiResponse<Row[]>) => void) | undefined;
    const exportRows = vi.fn(() => new Promise<ApiResponse<Row[]>>(resolve => { finish = resolve; }));
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    const trigger = exportTrigger() as HTMLButtonElement;
    await exportVia('선택 1행을 Excel(.xlsx)로 내보내기');
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).toBe('true'));
    // Radix returns focus to the trigger after the item runs — possible only because it is not natively disabled.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByRole('status').textContent).toBe('선택 1행을 Excel 파일로 준비 중입니다');

    await exportVia('선택 1행을 CSV로 내보내기'); // busy: runExport guards re-entry
    expect(exportRows).toHaveBeenCalledTimes(1);

    finish!(ok([{ id: 'r1', status: 'a' }]));
    await waitFor(() => expect(downloads.length).toBe(1));
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('without an ok result the filtered group label shows no count, and item names follow', async () => {
    const errorPage: PlatformDataTableProps<Row>['loadPage'] = async () => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'c', message: 'boom' });
    render(<ExportHarness loadPage={errorPage} exportRows={vi.fn(async () => ok([]))} />);
    await screen.findByText('데이터를 불러오지 못했습니다');
    fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('필터 결과 전체')).toBeTruthy(); // no “0행”: the count is unknown, not zero
    expect(within(menu).getAllByRole('menuitem').map(item => item.getAttribute('aria-label')))
      .toEqual(['필터 결과 전체를 Excel(.xlsx)로 내보내기', '필터 결과 전체를 CSV로 내보내기']);
  });

  it('sanitizes the file name base: only [A-Za-z0-9._-] survives (P3-12)', async () => {
    render(<ExportHarness registry={dirtyMenuRegistry} loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([]))} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(downloads.length).toBe(1));
    expect(downloads[0].name).toMatch(/^ex-port\.menu-\d{8}-\d{4}\.csv$/); // 'ex port.menu' → 'ex-port.menu'
  });

  it('조회 정보 carries the menu’s filter summary and the applied global Context keys, readably (P2-3)', async () => {
    const initial = {
      roomNames: ['PH-101', 'ET-102'],
      condition: { axis: 'stgroup', id: 'Etch-A' } as GlobalContext['condition'],
      selection: Array.from({ length: 12 }, (_, i) => `EQ-${i}`),
      lotIds: ['LOT-1'],
      ppid: 'PP-9',
      recipeIds: ['RCP-1'],
      metricId: 'cycle_time',
      metricVersion: '4',
    };
    render(<ExportHarness
      registry={contextRegistry}
      loadPage={makeLoadPage(3)}
      exportRows={vi.fn(async () => ok([{ id: 'r1', status: 'a' }]))}
      exportFilterSummary={[['검색어', 'etch'], ['상태', '사용중'], ['Maker', 'ACME']]}
      probe={<GlobalControls initial={initial} />}
    />);
    await screen.findByText(/1\/1/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'bump-ppid' })).toBeTruthy());
    await exportVia('필터 결과 전체 3행을 Excel(.xlsx)로 내보내기');
    await waitFor(() => expect(downloads.length).toBe(1));
    const { sheets: [, info] } = await readXlsx(downloads[0].blob);
    const rows = Object.fromEntries(Object.keys(info).filter(k => k.startsWith('A')).map(k => [info[k], info['B' + k.slice(1)]]));
    // The kernel normalizes id sets (sorted unique) before the sheet sees them.
    const sortedRooms = [...initial.roomNames].sort();
    const sortedSelection = [...initial.selection].sort();
    expect(rows).toMatchObject({
      검색어: 'etch', 상태: '사용중', Maker: 'ACME',
      room_name: sortedRooms.join(', '), '그룹 조건': 'StGroup: Etch-A',
      '설비 선택': `12행: ${sortedSelection.slice(0, 10).join(', ')} …`,
      Lot: '1행: LOT-1', PPID: 'PP-9', Recipe: '1행: RCP-1', '지표·버전': 'cycle_time v4',
    });
  });

  it('applied global keys outside the menu’s capabilities are omitted, never invented', async () => {
    // exportRegistry applies no Context key at all, yet the global Context is full → none of the rows appear.
    render(<ExportHarness
      loadPage={makeLoadPage(3)}
      exportRows={vi.fn(async () => ok([]))}
      probe={<GlobalControls initial={{ roomNames: ['PH-101'], ppid: 'PP-9', metricId: 'cycle_time', metricVersion: '4' }} />}
    />);
    await screen.findByText(/1\/1/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'bump-ppid' })).toBeTruthy());
    await exportVia('필터 결과 전체 3행을 Excel(.xlsx)로 내보내기');
    await waitFor(() => expect(downloads.length).toBe(1));
    const { sheets: [, info] } = await readXlsx(downloads[0].blob);
    const labels = Object.keys(info).filter(k => k.startsWith('A')).map(k => String(info[k]));
    expect(labels).not.toContain('room_name');
    expect(labels).not.toContain('PPID');
    expect(labels).not.toContain('지표·버전');
  });

  it('aborts an in-flight export on unmount and on a global-Context change', async () => {
    const signals: AbortSignal[] = [];
    const exportRows = vi.fn((_request: unknown, s: AbortSignal) => {
      signals.push(s);
      return new Promise<ApiResponse<Row[]>>((resolve) => {
        s.addEventListener('abort', () => resolve(refused('error')));
      });
    });
    const loadPage = makeLoadPage(3);
    let view = render(<ExportHarness loadPage={loadPage} exportRows={exportRows} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(exportRows).toHaveBeenCalled());
    view.unmount();
    expect(signals[0].aborted).toBe(true);
    expect(downloads.length).toBe(0);

    view = render(<ExportHarness loadPage={loadPage} exportRows={exportRows} probe={<GlobalControls />} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(signals.length).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: 'bump-ppid' }));
    await waitFor(() => expect(signals[1].aborted).toBe(true));
    expect(downloads.length).toBe(0);
    expect(screen.getByTestId('toast-probe').textContent).toBe(''); // cancelled exports stay silent
  });

  it('an error refusal appends the response correlationId and names the next action', async () => {
    const withCorrelation: ApiResponse<Row[]> = { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'corr-9x' };
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => withCorrelation)} />);
    await screen.findByText(/1\/1/);
    await exportVia(FILTERED_CSV);
    await waitFor(() => expect(screen.getByTestId('toast-probe').textContent).toContain('관리자에게 문의하세요'));
    expect(screen.getByTestId('toast-probe').textContent).toContain('(correlationId: corr-9x)');
  });

  it('English refusal texts also name the next action (forbidden does not claim a cause)', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => refused('forbidden'))} probe={<SetLangEn />} />);
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Export/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Export all 3 filtered rows as CSV$/ }));
    await waitFor(() => expect(screen.getByTestId('toast-probe').textContent).toContain('Check the current scope and your access rights.'));
  });

  it('menu items get this menu’s visible focus ring (inset, focus token) on top of the soft background (UX P2-1)', async () => {
    render(<ExportHarness loadPage={makeLoadPage(3)} exportRows={vi.fn(async () => ok([]))} />);
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(exportTrigger(), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    for (const item of within(menu).getAllByRole('menuitem')) {
      expect(item.className).toContain('focus-visible:ring-focus-ring');
      expect(item.className).toContain('focus-visible:ring-inset');
      expect(item.className).toContain('focus:bg-accent-primary-soft');
    }
  });
});
