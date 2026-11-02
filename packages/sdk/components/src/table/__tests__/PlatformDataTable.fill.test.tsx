/** Width fill, right-pinned edge, header wrapping and pane chrome (#1166). jsdom has no layout: the scrollport width is the stubbed `clientWidth`. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PageResult } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformDataTableProps } from '../PlatformDataTable';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
type Row = { id: string; a: string; b: string };
const columns: PlatformDataTableProps<Row>['columns'] = [
  { id: 'a', header: 'A', size: 100, cell: r => r.a },
  { id: 'b', header: 'ROOM_NAME', size: 300, cell: r => r.b },
];
const loadPage = async (): Promise<ApiResponse<PageResult<Row>>> => ({ outcome: 'ok', data: { rows: [{ id: 'r1', a: 'x', b: 'y' }], total: 1 }, assessments: [], trust: null, correlationId: 'c' });

let restore: () => void;
let storage = memoryStorage();
beforeEach(() => { storage = memoryStorage(); });
afterEach(() => restore?.());
function mount(width: number, extra: Partial<PlatformDataTableProps<Row>> = {}, wrap: (n: React.ReactElement) => React.ReactElement = n => n) {
  const unstub = stubCompactTableGeometry(width);
  vi.stubGlobal('localStorage', storage);
  restore = unstub;
  return render(wrap(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={loadPage} filterKey="f" preferenceKey="fill-table" pageSize={25} height={200} {...extra} />
  </PlatformProvider></I18nProvider>));
}
const widthOf = (id: string) => (document.querySelector(`[role="columnheader"][data-column="${id}"]`) as HTMLElement).style.width;
const tableEl = () => screen.getByRole('table', { name: 'table' });

describe('table width fill (#1166)', () => {
  it('hands leftover width to the columns in proportion to their size', async () => {
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    expect(widthOf('a')).toBe('200px'); // 100 + 400 * 100/400
    expect(widthOf('b')).toBe('600px'); // 300 + 400 * 300/400
    expect(tableEl().style.width).toBe('800px');
  });
  it('scrolls horizontally instead of shrinking when the container is narrower', async () => {
    mount(220);
    await screen.findByRole('table', { name: 'table' });
    expect(widthOf('a')).toBe('100px');
    expect(widthOf('b')).toBe('300px');
    expect(tableEl().style.width).toBe('400px');
  });
  it('keeps a user-resized width and grows only the other columns', async () => {
    storage.setItem('fill-table', JSON.stringify({ sizing: { b: 200 }, visibility: {}, pinning: { left: [], right: [] } }));
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    expect(widthOf('b')).toBe('200px');
    expect(widthOf('a')).toBe('600px'); // 100 + (800 - 300)
    expect(tableEl().style.width).toBe('800px');
  });
});

describe('resizing after fill (#1166)', () => {
  const resizer = (id: string) => document.querySelector(`[role="columnheader"][data-column="${id}"] [data-column-resizer]`) as HTMLElement;
  const bodyWidth = (id: string) => (document.querySelector(`[role="cell"][data-column="${id}"]`) as HTMLElement).style.width;
  it('a grown column follows the pointer from its rendered width and only that width is stored', async () => {
    const view = mount(800);
    await screen.findByRole('table', { name: 'table' });
    fireEvent.mouseDown(resizer('a'), { clientX: 200 });
    // TanStack's engine reports each move one event late (its size info is a queued updater), so a pointer holds for a second event.
    fireEvent.mouseMove(document, { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 200 });
    expect(widthOf('a')).toBe('200px'); // no jump on the first move
    fireEvent.mouseMove(document, { clientX: 210 });
    fireEvent.mouseMove(document, { clientX: 210 });
    expect(widthOf('a')).toBe('210px');
    expect(bodyWidth('a')).toBe('210px');
    expect(widthOf('b')).toBe('590px'); // the unfixed column takes the rest
    expect(tableEl().style.width).toBe('800px');
    fireEvent.mouseUp(document, { clientX: 210 });
    view.unmount();
    expect(JSON.parse(storage.getItem('fill-table')!).sizing).toEqual({ a: 210 });
  });
  it('the touch path starts from the rendered width too', async () => {
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    fireEvent.touchStart(resizer('a'), { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 220 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 220 }] });
    expect(widthOf('a')).toBe('220px');
    expect(widthOf('b')).toBe('580px');
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 220 }] });
  });
});

describe('resize bounds from the rendered width (#1166 C1)', () => {
  const resizer = (id: string) => document.querySelector(`[role="columnheader"][data-column="${id}"] [data-column-resizer]`) as HTMLElement;
  const bodyWidth = (id: string) => (document.querySelector(`[role="cell"][data-column="${id}"]`) as HTMLElement).style.width;
  const drag = (id: string, from: number, to: number) => {
    fireEvent.mouseDown(resizer(id), { clientX: from });
    fireEvent.mouseMove(document, { clientX: from });
    fireEvent.mouseMove(document, { clientX: to });
    fireEvent.mouseMove(document, { clientX: to });
  };
  it('a shrink past the engine base width reaches the 60px minimum in one gesture', async () => {
    const view = mount(800);
    await screen.findByRole('table', { name: 'table' });
    drag('a', 200, 60); // rendered 200 (base 100): 140px left
    expect(widthOf('a')).toBe('60px');
    expect(bodyWidth('a')).toBe('60px');
    expect(widthOf('b')).toBe('740px');
    fireEvent.mouseUp(document, { clientX: 60 });
    view.unmount();
    expect(JSON.parse(storage.getItem('fill-table')!).sizing).toEqual({ a: 60 });
  });
  it('a column grown above 600px follows the pointer from its rendered width and clamps at the maximum', async () => {
    const view = mount(1200); // b: base 300 → rendered 900
    await screen.findByRole('table', { name: 'table' });
    expect(widthOf('b')).toBe('900px');
    drag('b', 1200, 900); // 300px left: 900 → 600
    expect(widthOf('b')).toBe('600px');
    fireEvent.mouseUp(document, { clientX: 900 });
    drag('b', 1200, 1210); // +10 from the stored 600 stays at the 600 maximum
    expect(widthOf('b')).toBe('600px');
    expect(bodyWidth('b')).toBe('600px');
    fireEvent.mouseUp(document, { clientX: 1210 });
    view.unmount();
    expect(JSON.parse(storage.getItem('fill-table')!).sizing).toEqual({ b: 600 });
  });
  it('the touch path shrinks to the minimum in one gesture too', async () => {
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    fireEvent.touchStart(resizer('a'), { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 40 }] });
    fireEvent.touchMove(document, { touches: [{ clientX: 40 }] });
    expect(widthOf('a')).toBe('60px');
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 40 }] });
  });
});

describe('indivisible width (#1166)', () => {
  it('assigns the pixel remainder so the cells add up to the scrollport', async () => {
    mount(801);
    await screen.findByRole('table', { name: 'table' });
    expect(parseInt(widthOf('a')) + parseInt(widthOf('b'))).toBe(801);
    expect(widthOf('a')).toBe('200px');
    expect(widthOf('b')).toBe('601px');
    expect(tableEl().style.width).toBe('801px');
  });
});

describe('right-pinned action column (#1166)', () => {
  it('is the last cell, pinned at right 0, with a visible edge and the fill leaves it at its own width', async () => {
    mount(800, { rowAction: row => <button type="button">{row.id}</button> });
    await screen.findByRole('table', { name: 'table' });
    const header = document.querySelector('[role="columnheader"][data-column="_action"]') as HTMLElement;
    const cell = document.querySelector('[role="cell"][data-column="_action"]') as HTMLElement;
    for (const el of [header, cell]) {
      expect(el.style.position).toBe('sticky');
      expect(el.style.right).toBe('0px');
      expect(el.style.width).toBe('128px');
    }
    const lastData = document.querySelector('[role="columnheader"][data-column="b"]') as HTMLElement;
    expect(lastData.nextElementSibling).toBe(header);
  });
});

describe('trust line in a narrow pane (#1166)', () => {
  const trusted = async (): Promise<ApiResponse<PageResult<Row>>> => ({ outcome: 'ok', data: { rows: [{ id: 'r1', a: 'x', b: 'y' }], total: 1 }, assessments: [{ kind: 'coverage', state: 'unknown', reason: 'check_failed', statusSource: 'fixture', observedAt: null }], trust: { updatedAt: '2026-10-16T09:00:00', dataThrough: null, coverage: 0.98, source: 'fixture', provisional: true, sourceLogicVersions: ['v1', 'v2'] }, correlationId: 'c' } as unknown as ApiResponse<PageResult<Row>>);
  type Probe = { statusWidth: number; probeWidth: number };
  const observers: Array<{ cb: ResizeObserverCallback; target: Element }> = [];
  function mountAt(measure: Probe) {
    restore = stubCompactTableGeometry(800);
    observers.length = 0;
    const widthOfTarget = (target: Element) => (target as HTMLElement).hasAttribute('data-table-status-line') ? measure.statusWidth
      : (target as HTMLElement).hasAttribute('data-trust-probe') ? measure.probeWidth
        : target.parentElement?.hasAttribute('data-table-status-line') ? 60 : 800;
    vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { observers.push({ cb: this.cb, target }); this.cb([{ target, contentRect: { width: widthOfTarget(target), height: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
    vi.stubGlobal('localStorage', storage);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformDataTable title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={trusted} filterKey="f" preferenceKey="trust-table" pageSize={25} height={200} /></PlatformProvider></I18nProvider>);
    return (next: Partial<Probe>) => {
      Object.assign(measure, next);
      act(() => { for (const o of observers) o.cb([{ target: o.target, contentRect: { width: widthOfTarget(o.target), height: 100 } } as ResizeObserverEntry], {} as ResizeObserver); });
    };
  }
  it('collapses to dot + short status + 자세히 when the full line does not fit, full items stay in the popover', async () => {
    mountAt({ statusWidth: 400, probeWidth: 450 });
    const trigger = await screen.findByRole('button', { name: /데이터 신뢰 · 일부 미확인 · 자세히/ });
    expect(within(trigger).getByText('자세히')).toBeTruthy();
    expect(within(trigger).queryByText('잠정')).toBeNull();
    fireEvent.click(trigger);
    expect(await screen.findByText('원천 로직 버전')).toBeTruthy();
  });
  it('shows the full line whenever it fits, even in a narrow line', async () => {
    mountAt({ statusWidth: 400, probeWidth: 300 }); // needs 300 + 16 + 60 + 8 = 384 ≤ 400
    const trigger = await screen.findByRole('button', { name: /데이터 신뢰/ });
    expect(within(trigger).queryByText('자세히')).toBeNull();
    expect(within(trigger).getByText('잠정')).toBeTruthy();
  });
  it.each([[383, true], [384, false]])('a full line needing 384px against %ipx collapses=%s (result count and gaps are subtracted)', async (statusWidth, collapsed) => {
    mountAt({ statusWidth, probeWidth: 300 });
    const trigger = await screen.findByRole('button', { name: /데이터 신뢰/ });
    expect(!!within(trigger).queryByText('자세히')).toBe(collapsed);
  });
  it('different full contents need different widths, and the choice follows both the line and the content', async () => {
    const resize = mountAt({ statusWidth: 500, probeWidth: 300 });
    const trigger = await screen.findByRole('button', { name: /데이터 신뢰/ });
    expect(within(trigger).queryByText('자세히')).toBeNull();
    resize({ probeWidth: 460 }); // longer content in the same line
    expect(await screen.findByText('자세히')).toBeTruthy();
    resize({ statusWidth: 700 }); // wide again
    expect(screen.queryByText('자세히')).toBeNull();
    resize({ statusWidth: 380, probeWidth: 300 }); // narrow again
    expect(screen.queryByText('자세히')).toBeTruthy();
  });
  it('with a filter line sharing the result line, the trust summary fits against what the filter block leaves (F4)', async () => {
    const withFilter: PlatformDataTableProps<Row>['columns'] = [{ ...columns[0], filter: { kind: 'text' as const } }, ...columns.slice(1)];
    restore = stubCompactTableGeometry(800);
    const w = (target: Element) => (target as HTMLElement).hasAttribute('data-table-status-line') ? 700
      : (target as HTMLElement).hasAttribute('data-trust-probe') ? 300
        : target.parentElement?.hasAttribute('data-table-status-line') ? 60 : 800;
    vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width: w(target), height: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
    vi.stubGlobal('localStorage', storage);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformDataTable title="T" ariaLabel="table" columns={withFilter} getRowId={r => r.id} loadPage={trusted} filterKey="f" preferenceKey="trust-table-f" pageSize={25} height={200} /></PlatformProvider></I18nProvider>);
    // 300 + 16 + 60 + 8 = 384 fits 700, but not 700 - 320 - 8 = 372 left beside the filter block.
    const trigger = await screen.findByRole('button', { name: /데이터 신뢰/ });
    expect(within(trigger).getByText('자세히')).toBeTruthy();
  });
  it('the measuring probe is hidden from assistive tech and focus, and is not the shown text', async () => {
    mountAt({ statusWidth: 400, probeWidth: 450 });
    await screen.findByRole('button', { name: /데이터 신뢰/ });
    const probe = document.querySelector('[data-trust-probe]')!;
    expect(probe.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(probe.querySelector('button, a, [tabindex]')).toBeNull();
    expect(screen.getAllByRole('button', { name: /데이터 신뢰/ })).toHaveLength(1);
  });
});

describe('header on one line (#1166)', () => {
  it('keeps a header on one line with an ellipsis, names the full label in title, insets 16px; body cells keep wrapping anywhere', async () => {
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    const header = document.querySelector('[role="columnheader"][data-column="b"]') as HTMLElement;
    expect(header.querySelector('button span.truncate')?.textContent).toBe('ROOM_NAME');
    expect(header).toHaveAttribute('title', 'ROOM_NAME');
  });
});
