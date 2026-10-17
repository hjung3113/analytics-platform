/**
 * Page-fit row area, right-pinned action column and selection gate (ADR-0037, #384). jsdom has no layout, so the
 * geometry below is a hand-built model: scroll container (main) > page root > [sticky header, page content > [upstream
 * sibling, table, trailing sibling]]. It proves the wiring (what is measured, when it re-measures); real intrinsic
 * heights are checked in the browser.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, PageQuery, PageResult } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PlatformDataTable, type PlatformDataTableProps } from './PlatformDataTable';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';

afterEach(cleanup);

const registryWith = (exportFeature: boolean) => createRegistry({
  spaces: [testSpace({ homeMenuId: 'fit-menu' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'fit-menu', group: 'overview', primary: true, label: { ko: '맞춤', en: 'Fit' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: exportFeature, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });

type Row = { id: string; status: string };
const columns: PlatformDataTableProps<Row>['columns'] = [{ id: 'status', header: 'Status', cell: row => row.status }, { id: 'other', header: 'Other', value: r => r.id }];
const okPage = (n = 3) => async (): Promise<ApiResponse<PageResult<Row>>> => ({
  outcome: 'ok', data: { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, status: `s${i}` })), total: n }, assessments: [], trust: null, correlationId: 'c',
});

// Geometry model (CSS px). Everything is derived from these, like a real flow layout.
const geo = { containerHeight: 1000, scrollTop: 0, upstream: 0, trailing: 0, stickyHeight: 60, viewportWidth: 1000 };
const PAD_TOP = 28, PAD_BOTTOM = 36, CHROME = 100, PAGER = 50, GAP = 16, STRETCH = 300;
const contentTop = () => geo.stickyHeight - geo.scrollTop; // first pixel after the sticky header, in container coordinates
const viewportTop = () => contentTop() + PAD_TOP + geo.upstream + CHROME;
const VIEWPORT_H = 160;
const trailingBottom = () => viewportTop() + VIEWPORT_H + PAGER + GAP + geo.trailing;
const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, width: 800, right: 800, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

function geometryOf(el: Element): DOMRect {
  const id = el.getAttribute('data-geo') ?? '';
  if (el.getAttribute('role') === 'row') return rect(0, 32);
  if (id === 'scroller') return rect(0, geo.containerHeight);
  if (id === 'sticky' || el.hasAttribute('data-page-sticky-header')) return rect(0, geo.stickyHeight);
  if (el.hasAttribute('data-platform-page-content')) return rect(contentTop(), trailingBottom() + PAD_BOTTOM + STRETCH - contentTop()); // stretched by flex-1
  if (id === 'upstream') return rect(contentTop() + PAD_TOP, geo.upstream);
  if (id === 'trailing') return rect(trailingBottom() - geo.trailing, geo.trailing);
  if (el.getAttribute('aria-label') === '스크롤 가능한 행 영역') return rect(viewportTop(), VIEWPORT_H);
  return rect(0, 0);
}

type Entry = { callback: (entries: unknown[]) => void; targets: Set<Element> };
const observers = new Set<Entry>();
class FakeResizeObserver {
  private entry: Entry;
  constructor(callback: Entry['callback']) { this.entry = { callback, targets: new Set() }; observers.add(this.entry); }
  observe(target: Element) { this.entry.targets.add(target); }
  unobserve() {}
  disconnect() { observers.delete(this.entry); this.entry.targets.clear(); }
}
/** Fires every live observer that watches `matches` (an observer-only change: no window resize event). */
const fireObservers = (matches: (el: Element) => boolean = () => true) => act(() => {
  // The virtualizer shares this fake and reads `borderBoxSize` from the first entry.
  const entries = [{ borderBoxSize: [{ inlineSize: 800, blockSize: 420 }], contentRect: { width: 800, height: 420 } }];
  for (const o of [...observers]) if ([...o.targets].some(matches)) o.callback(entries);
});

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const originalScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get() { return (this as Element).getAttribute('data-geo') === 'scroller' ? geo.containerHeight : 0; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return (this as Element).getAttribute('aria-label') === '스크롤 가능한 행 영역' ? geo.viewportWidth : 0; } });
  Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get() { return (this as Element).getAttribute('data-geo') === 'scroller' ? geo.scrollTop : 0; }, set() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return geometryOf(this); });
});
afterAll(() => {
  vi.restoreAllMocks();
  for (const [name, proto, original] of [['offsetHeight', HTMLElement.prototype, originalOffsetHeight], ['offsetWidth', HTMLElement.prototype, originalOffsetWidth], ['clientHeight', Element.prototype, originalClientHeight], ['clientWidth', Element.prototype, originalClientWidth], ['scrollTop', Element.prototype, originalScrollTop]] as const) {
    if (original) Object.defineProperty(proto, name, original); else delete (proto as unknown as Record<string, unknown>)[name];
  }
});
beforeEach(() => {
  Object.assign(geo, { containerHeight: 1000, scrollTop: 0, upstream: 0, trailing: 0, stickyHeight: 60, viewportWidth: 1000 });
  observers.clear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // This environment has no localStorage; the table's column preferences go to a stub.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
});
afterEach(() => { vi.unstubAllGlobals(); });

function Page(props: Partial<PlatformDataTableProps<Row>> & { exportOn?: boolean; withTrailing?: boolean }) {
  const { exportOn = false, withTrailing = true, ...table } = props;
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(exportOn)}>
    <main data-geo="scroller" style={{ overflowY: 'auto' }}>
      <div data-platform-page>
        <div data-page-sticky-header />
        <div data-platform-page-content style={{ paddingBottom: PAD_BOTTOM }}>
          <div data-geo="upstream" />
          <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={okPage()} filterKey="f" preferenceKey="fit-table" pageSize={25} {...table} />
          {withTrailing && <div data-geo="trailing" />}
        </div>
      </div>
    </main>
  </PlatformProvider></I18nProvider>;
}
const viewportEl = () => screen.getByLabelText('스크롤 가능한 행 영역');
const maxHeight = () => viewportEl().style.maxHeight;
// R = container − (sticky + padding-top + upstream + chrome) − (pager + gap + trailing + padding-bottom)
const expected = () => geo.containerHeight - (geo.stickyHeight + PAD_TOP + geo.upstream + CHROME) - (PAGER + GAP + geo.trailing + PAD_BOTTOM);

describe('page-fit row area cap (ADR-0037)', () => {
  it('uses the explicit height prop as the cap', async () => {
    render(<Page height={200} />);
    await screen.findByText('s0');
    expect(maxHeight()).toBe('200px');
    expect(viewportEl().style.height).toBe('');
  });

  it('without height the cap is the room left on the page, from the page-content end (not its stretched bottom)', async () => {
    render(<Page />);
    await screen.findByText('s0');
    expect(maxHeight()).toBe(`${expected()}px`); // 1000 − 188 − 102 = 710
  });

  it('identifies auto-fit peer viewports and excludes explicit height viewports', async () => {
    const view = render(<Page />);
    await screen.findByText('s0');
    expect(viewportEl()).toHaveAttribute('data-table-auto-fit');
    view.rerender(<Page height={200} />);
    expect(viewportEl()).not.toHaveAttribute('data-table-auto-fit');
  });

  it('a trailing sibling of known height + gap lowers the cap after its observer fires', async () => {
    render(<Page />);
    await screen.findByText('s0');
    geo.trailing = 24;
    fireObservers(el => el.hasAttribute('data-platform-page-content'));
    expect(maxHeight()).toBe(`${expected()}px`);
    expect(expected()).toBe(710 - 24);
  });

  it('an upstream sibling that grows re-measures with no window resize and fixed table/container sizes', async () => {
    render(<Page />);
    await screen.findByText('s0');
    const before = maxHeight();
    const resize = vi.fn(); window.addEventListener('resize', resize);
    geo.upstream = 90;
    fireObservers(el => el.hasAttribute('data-platform-page-content'));
    window.removeEventListener('resize', resize);
    expect(resize).not.toHaveBeenCalled();
    expect(maxHeight()).toBe(`${expected()}px`);
    expect(maxHeight()).not.toBe(before);
  });

  it('a taller sticky header (Context bar) re-measures', async () => {
    render(<Page />);
    await screen.findByText('s0');
    geo.stickyHeight = 120;
    fireObservers(el => el.hasAttribute('data-page-sticky-header'));
    expect(maxHeight()).toBe(`${expected()}px`);
  });

  it('the scroll container resizing re-measures; the floor holds when the page leaves less than 240px', async () => {
    render(<Page />);
    await screen.findByText('s0');
    geo.containerHeight = 500;
    fireObservers(el => el.getAttribute('data-geo') === 'scroller');
    expect(maxHeight()).toBe('240px');
  });

  it('a nonzero starting scrollTop does not change the cap, and scrolling later does not either', async () => {
    geo.scrollTop = 150;
    render(<Page />);
    await screen.findByText('s0');
    expect(maxHeight()).toBe('710px');
    geo.scrollTop = 40;
    fireObservers(el => el.getAttribute('data-geo') === 'scroller');
    expect(maxHeight()).toBe('710px');
  });

  it('error → retry → ok recreates the viewport node and measures it fresh; retry-settle focus lands on it', async () => {
    let calls = 0;
    const loadPage = vi.fn(async (_q: PageQuery): Promise<ApiResponse<PageResult<Row>>> => {
      calls += 1;
      return calls === 1
        ? { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'x' }
        : { outcome: 'ok', data: { rows: [{ id: 'r1', status: 's0' }], total: 1 }, assessments: [], trust: null, correlationId: 'c' };
    });
    render(<Page loadPage={loadPage} />);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.queryByLabelText('스크롤 가능한 행 영역')).toBeNull();
    act(() => retry.focus());
    geo.upstream = 50; // the page changed while the viewport did not exist
    fireEvent.click(retry);
    await screen.findByText('s0');
    expect(maxHeight()).toBe(`${expected()}px`);
    expect(viewportEl()).toHaveFocus();
  });
});

describe('selection column only with a consumer (ADR-0037)', () => {
  it('has no checkbox column and no selection band without export or bulk actions', async () => {
    render(<Page height={200} />);
    await screen.findByText('s0');
    expect(document.querySelector('[data-column="_select"]')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('selected-count')).toBeNull();
  });

  it('keeps it for export (manifest + exportRows)', async () => {
    render(<Page height={200} exportOn exportRows={async () => ({ outcome: 'ok', data: [], assessments: [], trust: null, correlationId: 'c' })} />);
    await screen.findByText('s0');
    expect(document.querySelector('[data-column="_select"]')).not.toBeNull();
  });

  it('clears selection when its last consumer disappears and does not resurrect it', async () => {
    const bulkActions = (ids: string[]) => <span>{ids.length} 대상</span>;
    const view = render(<Page height={200} bulkActions={bulkActions} />);
    await screen.findByText('s0');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1행 선택');
    view.rerender(<Page height={200} />);
    expect(screen.queryByTestId('selected-count')).toBeNull();
    expect(screen.getByText('s0').closest('[role="row"]')).toHaveAttribute('aria-selected', 'false');
    view.rerender(<Page height={200} bulkActions={bulkActions} />);
    expect(screen.queryByTestId('selected-count')).toBeNull();
    expect(screen.getByRole('checkbox', { name: '선택 r1' })).not.toBeChecked();
  });

  it('keeps it for bulkActions alone and shows the band', async () => {
    render(<Page height={200} bulkActions={ids => <span>{ids.length} 대상</span>} />);
    await screen.findByText('s0');
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1행 선택');
    expect(screen.getByText('1 대상')).toBeTruthy();
  });
});

describe('action column pinned right (ADR-0037)', () => {
  const action = (row: Row) => <button type="button">{row.id} 열기</button>;

  it('header and body action cells are right-sticky with the edge border; other cells are not', async () => {
    render(<Page height={200} rowAction={action} />);
    await screen.findByText('s0');
    const cells = [...document.querySelectorAll<HTMLElement>('[data-column="_action"]')];
    expect(cells.length).toBeGreaterThan(1); // header + rows
    for (const cell of cells) {
      expect(cell.style.position).toBe('sticky');
      expect(cell.style.right).toBe('0px');
      expect(cell.className).toContain('border-l');
      expect(cell.className).toContain('border-border-subtle');
    }
    const body = document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!;
    expect(body.className).toContain('bg-surface-card');
    expect(body.className).toContain('py-0');
    const status = document.querySelector<HTMLElement>('[role="cell"][data-column="status"]')!;
    expect(status.style.position).toBe('relative');
    expect(status.className).not.toContain('py-0');
  });

  it('keeps the action as the last column and the rowAction DOM identity', async () => {
    render(<Page height={200} rowAction={action} />);
    const opener = await screen.findByRole('button', { name: 'r1 열기' });
    const row = document.querySelector('[data-row-id="r1"]')!;
    expect(row.lastElementChild).toBe(opener.parentElement);
  });

  const resize = (width: number) => { geo.viewportWidth = width; fireObservers(el => el.getAttribute('aria-label') === '스크롤 가능한 행 영역'); };
  const actionCell = () => document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!;
  const compactAction = (row: Row, { compact }: { compact: boolean }) => <button type="button" data-compact={String(compact)}>{row.id} 열기</button>;

  it.each([[248, 128, 'false'], [300, 128, 'false'], [247, 72, 'true'], [192, 72, 'true']])('at %ipx the action column is pinned at %ipx (compact=%s)', async (width, size, compact) => {
    geo.viewportWidth = width;
    render(<Page height={200} rowAction={compactAction} />);
    await screen.findByText('s0');
    expect(actionCell().style.position).toBe('sticky');
    expect(actionCell().style.width).toBe(`${size}px`);
    expect(screen.getByRole('button', { name: 'r1 열기' })).toHaveAttribute('data-compact', compact);
  });

  it('unpins below left pins + 72 + 120px and shows the normal form, and re-pins compact then full when it widens', async () => {
    geo.viewportWidth = 191;
    render(<Page height={200} rowAction={compactAction} />);
    await screen.findByText('s0');
    expect(actionCell().style.position).toBe('relative');
    expect(actionCell().style.width).toBe('128px');
    expect(actionCell().className).not.toContain('border-l');
    expect(screen.getByRole('button', { name: 'r1 열기' })).toHaveAttribute('data-compact', 'false');
    resize(200);
    expect(actionCell().style.position).toBe('sticky');
    expect(actionCell().style.width).toBe('72px');
    expect(actionCell().className).toContain('px-0');
    expect(screen.getByRole('button', { name: 'r1 열기' })).toHaveAttribute('data-compact', 'true');
    resize(600);
    expect(actionCell().style.width).toBe('128px');
    expect(actionCell().className).not.toContain('px-0');
    expect(screen.getByRole('button', { name: 'r1 열기' })).toHaveAttribute('data-compact', 'false');
  });

  it('a one-argument rowAction still works', async () => {
    geo.viewportWidth = 200;
    render(<Page height={200} rowAction={action} />);
    expect(await screen.findByRole('button', { name: 'r1 열기' })).toBeTruthy();
  });

  it('the user pin of a data column counts toward the narrow threshold and the action is never stored as a pin', async () => {
    geo.viewportWidth = 420; // 150 (pinned status) + 128 + 120 = 398 → full
    render(<Page height={200} rowAction={action} />);
    await screen.findByText('s0');
    fireEvent.click(screen.getByRole('button', { name: /컬럼/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Status 왼쪽 고정' }));
    expect(document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!.style.position).toBe('sticky');
    expect(JSON.parse(localStorage.getItem('fit-table')!).pinning).toEqual({ left: ['status'], right: [] });
    geo.viewportWidth = 380; // 150 + 72 + 120 = 342 ≤ 380 < 398 → compact, still pinned
    fireObservers(el => el.getAttribute('aria-label') === '스크롤 가능한 행 영역');
    expect(document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!.style.position).toBe('sticky');
    expect(document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!.style.width).toBe('72px');
    geo.viewportWidth = 341;
    fireObservers(el => el.getAttribute('aria-label') === '스크롤 가능한 행 영역');
    expect(document.querySelector<HTMLElement>('[role="cell"][data-column="_action"]')!.style.position).toBe('relative');
  });

  it('without rowAction there is no action column and nothing is right-pinned', async () => {
    render(<Page height={200} />);
    await screen.findByText('s0');
    expect(document.querySelector('[data-column="_action"]')).toBeNull();
  });
});
