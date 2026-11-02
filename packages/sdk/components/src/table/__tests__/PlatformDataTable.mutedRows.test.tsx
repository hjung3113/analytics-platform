import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PageResult, type PlatformColumn } from '../PlatformDataTable';

// Opt-in `isRowMuted`: muted rows read as secondary; a row state surface switches the cell colour to secondary (DESIGN.md contrast rule).
afterEach(cleanup);

type Row = { id: string; name: string; state: string };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'muted-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'muted-menu', group: groupId('overview'), primary: true, label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
});

const columns: PlatformColumn<Row>[] = [
  { id: 'name', header: '이름' },
  { id: 'state', header: '상태', cell: row => <span className="text-status-success">{row.state}</span> },
];
const rows: Row[] = [{ id: 'r1', name: 'alpha', state: '사용중' }, { id: 'r2', name: 'beta', state: '비활성' }];
const loadPage = async (_q: TableQuery, _s: AbortSignal): Promise<ApiResponse<PageResult<Row>>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: { rows, total: rows.length } });

function mount(extra: { isRowMuted?: (row: Row) => boolean; activeRowId?: string; action?: boolean } = {}) {
  return render(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={loadPage} filterKey="f" preferenceKey="test-muted"
      pageSize={25} height={200} exportRows={async () => ({ outcome: 'ok', data: rows, assessments: [], trust: null, correlationId: 'c' })}
      isRowMuted={extra.isRowMuted} activeRowId={extra.activeRowId} rowAction={extra.action ? row => <button type="button">{row.id} 열기</button> : undefined} />
  </PlatformProvider></I18nProvider>);
}
const rowOf = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!;
const cellOf = (id: string, column: string) => rowOf(id).querySelector<HTMLElement>(`[data-column="${column}"]`)!;
const has = (el: Element, token: string) => el.classList.contains(token);
const mutedIfInactive = (row: Row) => row.state === '비활성';

describe('PlatformDataTable isRowMuted', () => {
  it('mutes the data cells of a matching row at rest, with hover/selected text switching to secondary', async () => {
    mount({ isRowMuted: mutedIfInactive });
    await screen.findByText('beta');
    expect(rowOf('r2')).toHaveAttribute('data-muted', 'true');
    for (const column of ['name', 'state']) {
      const cell = cellOf('r2', column);
      expect(has(cell, 'text-text-muted')).toBe(true);
      expect(has(cell, 'group-hover:text-text-secondary')).toBe(true);
      expect(has(cell, 'group-aria-selected:text-text-secondary')).toBe(true);
    }
    // Content with its own colour class keeps it (the cell colour is only inherited).
    expect(screen.getByText('비활성')).toHaveClass('text-status-success');
  });

  it('leaves rows the predicate rejects, and every row without the prop, exactly as before', async () => {
    const view = mount({ isRowMuted: mutedIfInactive });
    await screen.findByText('alpha');
    expect(rowOf('r1')).not.toHaveAttribute('data-muted');
    expect(has(cellOf('r1', 'name'), 'text-text-muted')).toBe(false);
    expect(cellOf('r1', 'name').className).not.toContain('text-text-secondary');
    view.unmount();
    mount();
    await screen.findByText('beta');
    expect(rowOf('r2')).not.toHaveAttribute('data-muted');
    expect(has(cellOf('r2', 'name'), 'text-text-muted')).toBe(false);
  });

  it('an active muted row is secondary at rest, not muted', async () => {
    mount({ isRowMuted: mutedIfInactive, activeRowId: 'r2' });
    await screen.findByText('beta');
    const cell = cellOf('r2', 'name');
    expect(has(cell, 'text-text-secondary')).toBe(true);
    expect(has(cell, 'text-text-muted')).toBe(false);
  });

  it('does not mute the _select and _action cells; selection and row action still work', async () => {
    mount({ isRowMuted: mutedIfInactive, action: true });
    await screen.findByText('beta');
    for (const column of ['_select', '_action']) expect(cellOf('r2', column).className).not.toMatch(/text-text-(muted|secondary)/);
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
    expect(rowOf('r2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'r2 열기' })).toBeTruthy();
  });
});
