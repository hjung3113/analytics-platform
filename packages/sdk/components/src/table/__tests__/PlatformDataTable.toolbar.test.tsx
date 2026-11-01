import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, groupPage, spaceId, type ApiResponse, type GroupedPageResult, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';
import { stubCompactTableGeometry } from '../../testing';
import { PageDensityProvider } from '../../pageDensity';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';
import { COLLAPSE_BELOW, COLLAPSE_ORDER, collapsedControls } from '../tableToolbar';

// Node 1217c (06 §15): the one-line toolbar, the always-present result line, the `⋯` overflow and the quick search slot.
type Row = { id: string; line: string; qty: number };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const data: Row[] = [{ id: 'a1', line: 'A', qty: 1 }, { id: 'a2', line: 'B', qty: 2 }];
const columns: PlatformColumn<Row>[] = [{ id: 'line', header: '라인', groupable: true }, { id: 'qty', header: '수량' }];
const ok = (d: GroupedPageResult<Row>): ApiResponse<GroupedPageResult<Row>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: d });
const makeLoad = () => vi.fn(async (q: TableQuery, _s: AbortSignal) => q.groupBy
  ? ok(groupPage(data, { groupBy: q.groupBy, sorting: q.sorting, subtotalColumns: [], page: q.page, pageSize: q.pageSize }))
  : ok({ rows: data, total: data.length }));

let toolbarWidth: number | null = 1280;
let restoreGeometry: () => void;
beforeEach(() => {
  toolbarWidth = 1280;
  restoreGeometry = stubCompactTableGeometry(1280);
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) {
      const width = target.hasAttribute('data-table-toolbar') ? toolbarWidth : 1280;
      if (width !== null) this.cb([{ target, contentRect: { width, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); restoreGeometry(); });

function Harness(p: { load?: ReturnType<typeof makeLoad>; subtitle?: string; search?: React.ReactNode; cols?: PlatformColumn<Row>[]; filterable?: boolean }) {
  const cols = p.cols ?? (p.filterable ? [{ ...columns[0], filter: { kind: 'text' as const } }, columns[1]] : columns);
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="설비 목록" subtitle={p.subtitle} search={p.search} ariaLabel="table" columns={cols} getRowId={r => r.id} loadPage={p.load ?? makeLoad()}
      filterKey="f" preferenceKey="toolbar-test" pageSize={25} height={300} exportRows={async () => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data })} />
  </PlatformProvider></I18nProvider>;
}
const toolbar = () => document.querySelector('[data-table-toolbar]') as HTMLElement;

describe('PlatformDataTable one-line toolbar (1217c)', () => {
  it('lists title, search, 그룹, 컬럼, 복사, 내보내기 in that order; every control is a 32px (h-8) toolbar control; ▾ only on menus', async () => {
    render(<Harness subtitle="설명 문장" search={<input aria-label="검색" />} />);
    await screen.findByText(/1\/1/);
    const bar = toolbar();
    const order = [...bar.querySelectorAll('h2, [data-table-search], button')].map(el => el.tagName === 'H2' ? 'title' : el.hasAttribute('data-table-search') ? 'search' : el.textContent?.trim() || el.getAttribute('aria-label'));
    expect(order).toEqual(['title', '설명', 'search', '그룹: 없음', '컬럼', '복사', '내보내기']);
    for (const name of ['그룹: 없음', '컬럼', '복사', '내보내기']) expect(within(bar).getByRole('button', { name })).toHaveClass('h-8');
    // ▾ (chevron) only on the two menu buttons that pick a value or open a menu; 컬럼 (popover) and 복사 (action) have none.
    expect(within(bar).getByRole('button', { name: '그룹: 없음' }).querySelector('.lucide-chevron-down')).not.toBeNull();
    expect(within(bar).getByRole('button', { name: '내보내기' }).querySelector('.lucide-chevron-down')).not.toBeNull();
    expect(within(bar).getByRole('button', { name: '컬럼' }).querySelector('.lucide-chevron-down')).toBeNull();
    expect(within(bar).getByRole('button', { name: '복사' }).querySelector('.lucide-chevron-down')).toBeNull();
    expect(within(bar).queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('the ⓘ tooltip carries the subtitle; no second text line, and no ⓘ without a subtitle', async () => {
    const user = userEvent.setup();
    const view = render(<Harness subtitle="설명 문장" />);
    await screen.findByText(/1\/1/);
    expect(within(toolbar()).queryByText('설명 문장')).toBeNull();
    await user.hover(screen.getByRole('button', { name: '설명' }));
    expect((await screen.findAllByText('설명 문장')).length).toBeGreaterThan(0);
    view.unmount();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    expect(screen.queryByRole('button', { name: '설명' })).toBeNull();
  });

  it('a panel title stays screen-reader only: the toolbar has no visible title and no ⓘ, the subtitle is sr-only', async () => {
    render(<InWorkspacePanelProvider value><Harness subtitle="설명 문장" /></InWorkspacePanelProvider>);
    expect(await screen.findByRole('heading', { name: '설비 목록' })).toHaveClass('sr-only');
    expect(screen.queryByRole('button', { name: '설명' })).toBeNull();
    expect(screen.getByText('설명 문장')).toHaveClass('sr-only');
  });

  it('the 그룹 menu replaces the native select: keyboard opens it, ArrowDown + Enter chooses, the button names the choice', async () => {
    const user = userEvent.setup();
    const load = makeLoad();
    render(<Harness load={load} />);
    await screen.findByText(/1\/1/);
    expect(document.querySelector('select')).toBeNull();
    screen.getByRole('button', { name: '그룹: 없음' }).focus();
    await user.keyboard('{Enter}');
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map(i => i.textContent)).toEqual(['그룹 없음', '라인']);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(load.mock.calls.at(-1)![0].groupBy).toBe('line'));
    expect(screen.getByRole('button', { name: '그룹: 라인' })).toBeTruthy();
  });

  it('renders the quick search slot in the toolbar beside the title', async () => {
    render(<Harness search={<input aria-label="설비 검색" />} />);
    await screen.findByText(/1\/1/);
    expect(within(toolbar()).getByLabelText('설비 검색')).toBeTruthy();
  });
});

describe('PlatformDataTable result line (1217c)', () => {
  it('is always rendered: a table without filterable fields shows only count · page', async () => {
    render(<Harness />);
    const line = (await screen.findByText(/2건 · 1\/1 페이지/)).closest('[data-table-status-line]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.querySelector('[data-filter-line]')).toBeNull();
  });

  it('with filterable fields the filter line sits on the left of the same line, before the count', async () => {
    render(<Harness filterable />);
    const count = await screen.findByText(/2건 · 1\/1 페이지/);
    const line = count.closest('[data-table-status-line]') as HTMLElement;
    const filter = line.querySelector('[data-filter-line]')!;
    expect(filter).not.toBeNull();
    expect(filter.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelectorAll('[data-filter-line]')).toHaveLength(1);
  });
});

describe('PlatformDataTable toolbar overflow (1217c, P10)', () => {
  it('collapse order is copy, group, columns, export and each leaves at its own width', () => {
    expect([...COLLAPSE_ORDER]).toEqual(['copy', 'group', 'columns', 'export']);
    const widths = COLLAPSE_ORDER.map(k => COLLAPSE_BELOW[k]);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    expect(collapsedControls(null).size).toBe(0);
    expect([...collapsedControls(COLLAPSE_BELOW.group - 1)]).toEqual(['copy', 'group']);
  });

  it.each([
    [1280, ['그룹: 없음', '컬럼', '복사', '내보내기'], []],
    [600, ['그룹: 없음', '컬럼', '내보내기', '더보기'], ['복사']],
    [450, ['컬럼', '내보내기', '더보기'], ['그룹: 없음', '복사']],
    [350, ['내보내기', '더보기'], ['그룹: 없음', '컬럼', '복사']],
    [220, ['더보기'], ['그룹: 없음', '컬럼', '복사', '내보내기']],
  ])('at %ipx the bar keeps %j and `⋯` holds %j, listed in toolbar order', async (width, bar, moved) => {
    toolbarWidth = width;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    const inBar = within(toolbar()).getAllByRole('button').map(b => b.textContent?.trim() || b.getAttribute('aria-label'));
    expect(inBar.filter(n => n !== '설명')).toEqual(bar.map(n => n === '더보기' ? '더보기' : n));
    if (moved.length === 0) return;
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map(i => i.textContent?.trim())).toEqual(moved);
  });

  it('「컬럼」 from `⋯` opens the column popover; 「복사」 stays disabled without a selection', async () => {
    toolbarWidth = 220;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    expect(await screen.findByRole('menuitem', { name: '복사' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: '컬럼' }));
    expect(await screen.findByText('컬럼 설정 (브라우저에 저장)')).toBeTruthy();
  });

  it('Escape in the 컬럼 popover opened from `⋯` returns focus to `⋯` (F1)', async () => {
    toolbarWidth = 220;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    const more = within(toolbar()).getByRole('button', { name: '더보기' });
    more.focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: '컬럼' }));
    expect(await screen.findByText('컬럼 설정 (브라우저에 저장)')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('컬럼 설정 (브라우저에 저장)')).toBeNull());
    expect(document.activeElement).toBe(more);
  });

  it('overflow 「복사」 carries the wide button\'s reason and shortcut (F3)', async () => {
    toolbarWidth = 220;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    const item = await screen.findByRole('menuitem', { name: /복사/ });
    expect(item).toHaveAccessibleDescription('행을 선택하면 복사할 수 있습니다');
    expect(item.getAttribute('aria-keyshortcuts')).toBeNull();
  });

  it('overflow 「복사」 with a selection names the shortcut (F3)', async () => {
    toolbarWidth = 220;
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText(/1\/1/);
    await user.click(screen.getAllByRole('checkbox', { name: /선택/ })[1]);
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    const item = await screen.findByRole('menuitem', { name: /1행 복사/ });
    expect(item.getAttribute('aria-keyshortcuts')).toBe('Control+C Meta+C');
    expect(item.getAttribute('aria-describedby')).toBeTruthy();
    expect(item).toHaveAccessibleDescription(/복사할 수 있습니다\(표 안에서\)/);
  });

  it('the title truncates with its full text in title', async () => {
    toolbarWidth = 220;
    render(<Harness />);
    const h2 = await screen.findByRole('heading', { name: '설비 목록' });
    expect(h2).toHaveClass('truncate');
    expect(h2).toHaveAttribute('title', '설비 목록');
  });
});

describe('density of the toolbar band (1217c)', () => {
  it('keeps the page density classes for the band', async () => {
    render(<PageDensityProvider value="compact"><Harness /></PageDensityProvider>);
    await screen.findByText(/1\/1/);
    expect(toolbar()).toHaveClass('min-h-14', 'py-3');
  });
});
