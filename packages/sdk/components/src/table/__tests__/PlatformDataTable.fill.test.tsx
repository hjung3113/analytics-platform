/** Width fill, right-pinned edge, header wrapping and pane chrome (#1166). jsdom has no layout: the scrollport width is the stubbed `clientWidth`. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PageResult } from '@ap/contracts';
import { PageDensityProvider } from '../../pageDensity';
import { EmbeddedPane } from '../../workspace/panelContext';
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
      expect(el).toHaveClass('border-l', 'border-l-border-control');
      expect(el.style.position).toBe('sticky');
      expect(el.style.right).toBe('0px');
      expect(el.style.width).toBe('128px');
    }
    const lastData = document.querySelector('[role="columnheader"][data-column="b"]') as HTMLElement;
    expect(lastData.nextElementSibling).toBe(header);
  });
});

describe('header wrapping (#1166)', () => {
  it('never breaks a header word mid-word and names the full label in title; body cells keep wrapping anywhere', async () => {
    mount(800);
    await screen.findByRole('table', { name: 'table' });
    const header = document.querySelector('[role="columnheader"][data-column="b"]') as HTMLElement;
    expect(header.className).not.toContain('overflow-wrap:anywhere');
    expect(header).toHaveClass('[overflow-wrap:normal]', 'overflow-hidden');
    expect(header).toHaveAttribute('title', 'ROOM_NAME');
    const cell = within(tableEl()).getAllByRole('cell')[1];
    expect(cell).toHaveClass('[overflow-wrap:anywhere]');
    expect(cell).not.toHaveClass('overflow-hidden');
  });
});

describe('embedded chrome follows the container, not the density (#1166)', () => {
  it.each(['comfortable', 'compact'] as const)('a %s board pane draws the table without a border or radius, with a visible title', async density => {
    mount(800, {}, n => <PageDensityProvider value={density}><EmbeddedPane>{n}</EmbeddedPane></PageDensityProvider>);
    const section = (await screen.findByRole('table', { name: 'table' })).closest('section')!;
    expect(section).toHaveClass('border-0', 'rounded-none');
    expect(screen.getByRole('heading', { name: 'T' }).classList.contains('sr-only')).toBe(false);
  });
  it('a stand-alone card keeps its border', async () => {
    mount(800);
    const section = (await screen.findByRole('table', { name: 'table' })).closest('section')!;
    expect(section).toHaveClass('border', 'rounded-lg');
    expect(section).not.toHaveClass('border-0');
  });
});
