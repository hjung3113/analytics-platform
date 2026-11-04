import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';
import { stubCompactTableGeometry } from '../../testing';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'table' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'table', group: groupId('overview'), primary: true, label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const columns: PlatformColumn<{ id: string }>[] = [{ id: 'id', header: 'ID', filter: { kind: 'text' }, filterPinned: true }];
let width = 1440;
let trustFit = false;
const observers: Array<{ cb: ResizeObserverCallback; target: Element }> = [];
const measuredWidth = (target: Element) => !trustFit ? width
  : target.hasAttribute('data-trust-probe') ? 300
  : target.hasAttribute('data-table-controls') ? 160
  : target.hasAttribute('data-table-status-line') ? 200
  : target.classList.contains('tabular') ? 100 : width;
let restoreGeometry: () => void;
beforeEach(() => {
  width = 1440;
  trustFit = false;
  observers.length = 0;
  restoreGeometry = stubCompactTableGeometry();
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) {
      observers.push({ cb: this.cb, target });
      this.cb([{ target, contentRect: { width: measuredWidth(target), height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); restoreGeometry(); });

function Table({ hidden = true, search = false, filters = true, description = true, trusted = false }: { hidden?: boolean; search?: boolean; filters?: boolean; description?: boolean; trusted?: boolean }) {
  const titleVisibility = { hideTitle: hidden };
  return <I18nProvider><PlatformProvider equipmentAxes={[]} adapter={adapter} registry={registry}>
    <PlatformDataTable {...titleVisibility} title="감사" subtitle={description ? '조회 기준 설명' : undefined} ariaLabel="감사 목록"
      search={search ? <input aria-label="검색" /> : undefined} columns={filters ? columns : [{ id: 'id', header: 'ID' }]} getRowId={row => row.id}
      loadPage={async () => ({ outcome: 'ok', assessments: [], trust: trusted ? { updatedAt: '2026-11-05T00:00:00Z', dataThrough: null, coverage: 1, source: 'fixture', provisional: false } : null, correlationId: 'c', data: { rows: [{ id: 'a' }], total: 1 } })}
      preferenceKey="hidden-title" height={300} />
  </PlatformProvider></I18nProvider>;
}

const toolbar = () => document.querySelector<HTMLElement>('[data-table-toolbar]')!;

describe('PlatformDataTable hidden page title (#1234)', () => {
  it.each([true, false])('moves ⓘ next to the result count, leaving no lone description on the left (filters: %s)', async filters => {
    render(<Table filters={filters} />);
    const count = await screen.findByText(/1건 · 1\/1 페이지/);
    const info = screen.getByRole('button', { name: '설명' });
    expect(info.closest('[data-table-status-line]')).toContainElement(count);
    expect(toolbar().firstElementChild).not.toContainElement(info);
    expect(screen.getByRole('heading', { name: '감사' })).toHaveClass('sr-only');
  });

  it('has one band containing pinned filters, + 필터, the result summary and controls', async () => {
    render(<Table />);
    const count = await screen.findByText(/1건 · 1\/1 페이지/);
    expect(document.querySelectorAll('[data-table-toolbar]')).toHaveLength(1);
    expect(toolbar()).toContainElement(document.querySelector('[data-filter-line]'));
    expect(toolbar()).toContainElement(count);
    expect(within(toolbar()).getByRole('button', { name: 'ID' })).toBeTruthy();
    expect(within(toolbar()).getByRole('button', { name: '필터 추가' })).toBeTruthy();
    expect(within(toolbar()).getByRole('button', { name: '표 크기: 보통' })).toBeTruthy();
    expect(document.querySelectorAll('section > [data-table-status-line]')).toHaveLength(0);
    expect(toolbar()).toHaveClass('min-h-14');
  });

  it('preserves the accessible description, name, link and keyboard tooltip after moving ⓘ', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await screen.findByText(/1건 · 1\/1 페이지/);
    const text = screen.getByText('조회 기준 설명');
    const info = screen.getByRole('button', { name: '설명' });
    expect(text).toHaveClass('sr-only');
    expect(screen.getByRole('region', { name: '감사 목록' })).toHaveAccessibleDescription('조회 기준 설명');
    expect(info).toHaveAccessibleDescription('조회 기준 설명');
    expect(info).toHaveAttribute('aria-describedby', text.id);
    info.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('조회 기준 설명');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each([{ hidden: false }, { search: true }])('keeps separate toolbar and filter/result bands for %j', async props => {
    render(<Table {...props} />);
    const count = await screen.findByText(/1건 · 1\/1 페이지/);
    expect(toolbar()).not.toContainElement(count);
    expect(toolbar()).not.toContainElement(document.querySelector('[data-filter-line]'));
    expect(document.querySelectorAll('section > [data-table-status-line]')).toHaveLength(1);
  });

  it('keeps workspace panel layout and its 40px toolbar at 220px', async () => {
    width = 220;
    render(<InWorkspacePanelProvider value><Table /></InWorkspacePanelProvider>);
    const count = await screen.findByText(/1건 · 1\/1 페이지/);
    expect(toolbar()).not.toContainElement(count);
    expect(toolbar()).toHaveClass('min-h-10');
    expect(within(toolbar()).getByRole('button', { name: '더보기' })).toBeTruthy();
  });

  it('uses the merged toolbar width for overflow at 220px and keeps filters and count reachable', async () => {
    width = 220;
    const user = userEvent.setup();
    render(<Table />);
    const count = await screen.findByText(/1건 · 1\/1 페이지/);
    expect(toolbar()).toContainElement(count);
    expect(within(toolbar()).getByRole('button', { name: '필터 추가' })).toBeTruthy();
    expect(within(toolbar()).queryByRole('button', { name: '컬럼' })).toBeNull();
    await user.click(within(toolbar()).getByRole('button', { name: '더보기' }));
    expect(await screen.findByRole('menuitem', { name: '컬럼' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '표 크기: 보통' })).toBeTruthy();
  });

  it('expands trust after the band grows even when the compact summary stays the same width', async () => {
    width = 640;
    trustFit = true;
    render(<Table trusted />);
    await screen.findByText(/1건 · 1\/1 페이지/);
    expect(document.querySelector('[data-trust-short]')).not.toBeNull();
    act(() => {
      width = 1440;
      for (const { cb, target } of observers) cb([{ target, contentRect: { width: measuredWidth(target), height: 800 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(document.querySelector('[data-trust-short]')).toBeNull();
    expect(document.querySelector('[data-trust-summary-details]')).not.toHaveClass('sr-only');
  });

  it('does not create a description button or link without a subtitle', async () => {
    render(<Table description={false} />);
    await screen.findByText(/1건 · 1\/1 페이지/);
    expect(screen.queryByRole('button', { name: '설명' })).toBeNull();
    expect(screen.getByRole('region', { name: '감사 목록' })).not.toHaveAttribute('aria-describedby');
  });
});
