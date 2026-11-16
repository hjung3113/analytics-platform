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
// #2310: element widths for the one-band fit (toolbar = `width`).
let bandFit = false;
const observers: Array<{ cb: ResizeObserverCallback; target: Element }> = [];
const measuredWidth = (target: Element) => bandFit ? (target.hasAttribute('data-table-controls') ? 400
    : target.hasAttribute('data-table-lead') ? 320
    : target.hasAttribute('data-table-page-controls') ? 120
    : target.classList.contains('tabular') ? 100 : width)
  : !trustFit ? width
  : target.hasAttribute('data-trust-probe') ? 300
  : target.hasAttribute('data-table-controls') ? 160
  : target.hasAttribute('data-table-page-controls') ? 800
  : target.hasAttribute('data-table-status-line') ? 200
  : target.classList.contains('tabular') ? 100 : width;
let restoreGeometry: () => void;
beforeEach(() => {
  width = 1440;
  trustFit = false;
  bandFit = false;
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

function Table({ hidden = true, search = false, filters = true, description = true, trusted = false, controls = false }: { hidden?: boolean; search?: boolean; filters?: boolean; description?: boolean; trusted?: boolean; controls?: boolean }) {
  const titleVisibility = { hideTitle: hidden };
  return <I18nProvider><PlatformProvider equipmentAxes={[]} adapter={adapter} registry={registry}>
    <PlatformDataTable {...titleVisibility} title="감사" subtitle={description ? '조회 기준 설명' : undefined} ariaLabel="감사 목록"
      search={search ? <input aria-label="검색" /> : undefined} pageControls={controls ? <select aria-label="보기"><option>전체</option></select> : undefined} columns={filters ? columns : [{ id: 'id', header: 'ID' }]} getRowId={row => row.id}
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

  describe('pageControls (#2299)', () => {
    const view = () => screen.getByRole('combobox', { name: '보기' });
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('sits after the quick search in the toolbar line of two bands', async () => {
      render(<Table hidden={false} search controls />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      const search = screen.getByRole('textbox', { name: '검색' });
      expect(toolbar().firstElementChild).toContainElement(view());
      expect(follows(search, view())).toBe(true);
      expect(document.querySelectorAll('section > [data-table-status-line]')).toHaveLength(1);
    });

    it('keeps the merged band and sits before the filter line', async () => {
      render(<Table controls />);
      const count = await screen.findByText(/1건 · 1\/1 페이지/);
      expect(document.querySelectorAll('section > [data-table-status-line]')).toHaveLength(0);
      expect(toolbar()).toContainElement(count);
      expect(follows(view(), document.querySelector('[data-filter-line]')!)).toBe(true);
    });

    it('lets the filters wrap under the controls instead of shrinking to nothing (#2299 review C1)', async () => {
      render(<Table controls />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      const filters = document.querySelector('[data-filter-line]')!.parentElement!;
      expect(filters).toHaveClass('basis-80');
      expect(view().closest('[data-table-page-controls]')!.parentElement).toHaveClass('flex-wrap');
    });

    it('keeps the merged left group and filter wrapper classes without page controls', async () => {
      render(<Table />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      const filters = document.querySelector('[data-filter-line]')!.parentElement!;
      expect(filters).not.toHaveClass('basis-80');
      expect(filters.parentElement).not.toHaveClass('flex-wrap');
    });

    it('stays visible in a merged band without filterable fields', async () => {
      render(<Table controls filters={false} />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(view().closest('.sr-only')).toBeNull();
    });

    it('folds the trust summary to one line when the page controls take the band width', async () => {
      trustFit = true;
      const { unmount } = render(<Table trusted />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(document.querySelector('[data-trust-short]')).toBeNull();
      unmount();
      render(<Table trusted controls />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(document.querySelector('[data-trust-short]')).not.toBeNull();
    });
  });

  describe('one band by default (#2310)', () => {
    const bands = () => document.querySelectorAll('section > [data-table-status-line]').length;
    // Needs lead 320 + 8, controls 400 + 8, the lead filter basis 160 + 8, the count reserve 120 and the trust reserve 8 + 160: 1192px; page controls add 128.
    it.each([{}, { search: true }, { search: true, controls: true }])('a titled table %j is one band when it fits, title ⓘ first', async props => {
      bandFit = true;
      render(<Table hidden={false} {...props} />);
      const count = await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(0);
      expect(toolbar()).toContainElement(count);
      expect(toolbar()).toContainElement(document.querySelector('[data-filter-line]'));
      const lead = document.querySelector('[data-table-lead]')!;
      expect(within(lead as HTMLElement).getByRole('heading', { name: '감사' })).not.toHaveClass('sr-only');
      expect(lead).toContainElement(screen.getByRole('button', { name: '설명' }));
      expect(count.closest('[data-table-status-line]')).not.toContainElement(screen.getByRole('button', { name: '설명' }));
    });

    it.each([[1192, 0], [1191, 1]])('at %ipx a titled table with filters has %i separate result band(s)', async (w, expected) => {
      bandFit = true;
      width = w;
      render(<Table hidden={false} />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(expected);
      // The live result line and its role stay the same element kind in both layouts.
      expect(document.querySelector('[data-table-status-line]')).toHaveAttribute('aria-live', 'polite');
    });

    it('subtracts measured page controls before the fit', async () => {
      bandFit = true;
      width = 1192 + 127;
      render(<Table hidden={false} controls />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(1);
    });

    it('the band does not change when rows arrive: count and trust have fixed room, so an open editor survives loading', async () => {
      bandFit = true;
      width = 1192;
      render(<Table hidden={false} trusted />);
      expect(bands()).toBe(0);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(0);
    });

    it.each([[1192, 1000], [1000, 1192]])('crossing the threshold (%ipx → %ipx) with an editor open keeps the editor and its draft; the band follows on close', async (from, to) => {
      bandFit = true;
      width = from;
      render(<Table hidden={false} />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      const before = bands();
      await userEvent.click(document.querySelector<HTMLElement>('[data-filter-body="id"]')!);
      const dialog = await screen.findByRole('dialog');
      const input = within(dialog).getByRole('textbox');
      await userEvent.type(input, 'PM1');
      act(() => {
        width = to;
        for (const { cb, target } of observers) if (target.isConnected) cb([{ target, contentRect: { width: measuredWidth(target), height: 800 } } as ResizeObserverEntry], {} as ResizeObserver);
      });
      expect(bands()).toBe(before);
      expect(input.isConnected).toBe(true);
      expect(input).toHaveValue('PM1');
      await userEvent.keyboard('{Escape}');
      expect(bands()).toBe(1 - before);
    });

    it('a hidden title without search merges at any width (R2 unchanged)', async () => {
      bandFit = true;
      width = 600;
      render(<Table />);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(0);
      expect(document.querySelector('[data-table-lead]')).toBeNull();
    });

    it('a workspace panel keeps two bands however wide', async () => {
      bandFit = true;
      render(<InWorkspacePanelProvider value><Table hidden={false} /></InWorkspacePanelProvider>);
      await screen.findByText(/1건 · 1\/1 페이지/);
      expect(bands()).toBe(1);
    });
  });
});
