import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, spaceId, type ColumnFilter } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { StatusBadge } from '@ap/ui';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn, type TableLoadPage } from '../PlatformDataTable';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const rows = [
  { id: 'a', count: 42, at: '2026-11-26 09:18', status: 'active', reason: '긴 사유 전체 문장', actor: null },
  { id: 'b', count: 7, at: '2026-11-26 10:19', status: 'active', reason: '짧은 사유', actor: 'admin' },
];
type Row = typeof rows[number];

let restore: () => void;
beforeEach(() => {
  window.history.replaceState(null, '', '/?v=1');
  restore = stubCompactTableGeometry(240);
});
afterEach(() => { cleanup(); restore(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(columns: PlatformColumn<Row>[], { total = rows.length, filters, action }: { total?: number; filters?: ColumnFilter[]; action?: boolean } = {}) {
  const loadPage: TableLoadPage<Row> = async () => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'table', data: { rows, total } });
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <PlatformDataTable title="T" ariaLabel="table" columns={[{ id: 'id', header: 'ID', size: 280 }, ...columns]}
      getRowId={row => row.id} loadPage={loadPage} preferenceKey="column-kinds" pageSize={2}
      urlState={filters ? { page: null, sorting: [], filters, onChange: vi.fn() } : undefined}
      rowAction={action ? row => <button type="button">Open {row.id}</button> : undefined} />
  </PlatformProvider></I18nProvider>);
}

const cell = (text: string) => screen.getAllByText(text)[0].closest<HTMLElement>('[role="cell"]');

it.each([
  { cellKind: undefined, right: true },
  { cellKind: 'text' as const, right: false },
])('aligns numeric filters by default and honors a cellKind override ($cellKind)', async ({ cellKind, right }) => {
  mount([{ id: 'count', header: 'Count', cellKind, filter: { kind: 'number' } }]);
  await screen.findByText('42');
  expect(cell('42')?.classList.contains('text-right')).toBe(right);
  expect(cell('42')?.classList.contains('tabular')).toBe(right);
});

it.each([
  { cellKind: undefined, width: 136 },
  { cellKind: 'instant-seconds' as const, width: 176 },
])('keeps date-time cells at least $width px wide and on one line', async ({ cellKind, width }) => {
  mount([{ id: 'at', header: 'At', size: 90, filter: { kind: 'instant' }, cellKind }]);
  await screen.findByText(rows[0].at);
  expect(cell(rows[0].at)).toHaveStyle({ width: `${width}px` });
  expect(cell(rows[0].at)).toHaveClass('whitespace-nowrap', 'tabular');
});

it('honors a saved narrow width and keeps a dragged width across table sizes', async () => {
  const storage = memoryStorage();
  storage.setItem(`platform:columns:v1:${session.user.id}:column-kinds`, JSON.stringify({ sizing: { at: 100 }, visibility: {}, pinning: { left: [], right: [] }, order: [] }));
  vi.stubGlobal('localStorage', storage);
  mount([{ id: 'at', header: 'At', size: 90, filter: { kind: 'instant' } }]);
  await screen.findByText(rows[0].at);
  expect(cell(rows[0].at)).toHaveStyle({ width: '100px' });
  const resizer = document.querySelector('[data-column="at"] [data-column-resizer]')!;
  fireEvent.mouseDown(resizer, { clientX: 100 });
  fireEvent.mouseMove(document, { clientX: 140 });
  fireEvent.mouseUp(document, { clientX: 140 });
  expect(cell(rows[0].at)).toHaveStyle({ width: '140px' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /표 크기/ }));
  await user.click(await screen.findByRole('menuitemradio', { name: '크게' }));
  expect(cell(rows[0].at)).toHaveStyle({ width: '140px' });
});

it('exposes the full reason to keyboard and pointer only when the text is clipped', async () => {
  const user = userEvent.setup();
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.tagName === 'SPAN' && this.textContent === rows[0].reason ? 180 : 0;
  });
  mount([{ id: 'reason', header: 'Reason', cellKind: 'longText' }]);
  const clipped = await screen.findByText(rows[0].reason);
  const short = screen.getByText(rows[1].reason);
  expect(short).not.toHaveAttribute('tabindex');
  expect(clipped).toHaveAttribute('tabindex', '0');
  fireEvent.focus(short);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(clipped);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(rows[0].reason);
  fireEvent.blur(clipped);
  await user.hover(clipped);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(rows[0].reason);
});

it.each([
  { title: 'complete result', total: 2, filter: false, badges: false },
  { title: 'partial page', total: 4, filter: false, badges: true },
  { title: 'partial page with one allowed value', total: 4, filter: true, badges: false },
])('uses plain text for a known single-value badge column ($title)', async ({ total, filter, badges }) => {
  mount([{
    id: 'status', header: 'Status', cellKind: 'badge', size: 90,
    filter: { kind: 'enum', options: [{ value: 'active', label: 'Active' }] },
    cell: () => <StatusBadge tone="info">Active</StatusBadge>, exportValue: () => 'Active',
  }], { total, filters: filter ? [{ id: 'status', op: 'in', value: ['active'] }] : undefined });
  await screen.findAllByText('Active');
  const cells = screen.getAllByRole('cell').filter(el => el.dataset.column === 'status');
  expect(cells).toHaveLength(2);
  for (const el of cells) {
    expect(el).toHaveStyle({ width: '128px' });
    expect(el.firstElementChild !== null).toBe(badges);
    expect(el).toHaveTextContent('Active');
  }
});

it('keeps badges on a partial filtered page when a display accessor can differ from the filtered field', async () => {
  mount([{
    id: 'status', header: 'Status', cellKind: 'badge',
    filter: { kind: 'enum', options: [{ value: 'active', label: 'Active' }] },
    value: row => row.id === 'later-page' ? 'active (pending)' : row.status,
    cell: () => <StatusBadge tone="info">Active</StatusBadge>,
  }], { total: 4, filters: [{ id: 'status', op: 'in', value: ['active'] }] });
  await screen.findAllByText('Active');
  for (const el of screen.getAllByRole('cell').filter(el => el.dataset.column === 'status')) {
    expect(el.firstElementChild).toHaveTextContent('Active');
  }
});

it('keeps badges on a partial page filtered by a text equals, which cannot prove one raw value', async () => {
  mount([{
    id: 'status', header: 'Status', cellKind: 'badge',
    filter: { kind: 'text', caseSensitive: true },
    cell: () => <StatusBadge tone="info">Active</StatusBadge>,
  }], { total: 4, filters: [{ id: 'status', op: 'equals', value: 'active' }] });
  await screen.findAllByText('Active');
  for (const el of screen.getAllByRole('cell').filter(el => el.dataset.column === 'status')) {
    expect(el.firstElementChild).toHaveTextContent('Active');
  }
});

it('mutes the missing value without italics and retains its display label', async () => {
  mount([{ id: 'actor', header: 'Actor', isCellEmpty: row => row.actor === null, cell: row => row.actor ?? '이름 미확인' }]);
  await screen.findByText('이름 미확인');
  expect(cell('이름 미확인')).toHaveClass('text-text-muted', 'not-italic');
  expect(cell('admin')).not.toHaveClass('text-text-muted');
});

it('draws a one-pixel action border in header and body outside the scroll fade', async () => {
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(1200);
  mount([], { action: true });
  const body = (await screen.findByRole('button', { name: 'Open a' })).closest('[role="cell"]');
  const header = document.querySelector('[role="columnheader"][data-column="_action"]');
  for (const el of [header, body]) {
    expect(el).toHaveClass('border-l', 'border-l-border-strong', 'before:right-[calc(100%+1px)]', 'before:w-5');
    expect(el).not.toHaveClass('border-l-2', 'before:right-full');
  }
});
