import { cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { formatInstant, groupId, spaceId, type ApiResponse, type ColumnFilter } from '@ap/contracts';
import { PlatformDataTable, type PageResult, type PlatformColumn, type TableUrlState } from '../PlatformDataTable';
import { describeFilter, filterInfoRows } from '../columnFilters';

// ADR-0105 (node 1217a2c): a controlled `urlState.filters` can hold an instant range; the chips and the XLSX lines show instants, never calendar-day arithmetic.
afterEach(cleanup);

type Row = { id: string; at: string };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'm' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'm', group: groupId('overview'), primary: true, label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const columns: PlatformColumn<Row>[] = [{ id: 'at', header: '시각', filter: { kind: 'instant' } }];
const ok: ApiResponse<PageResult<Row>> = { outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: { rows: [{ id: 'r1', at: '2026-01-01T00:00:00Z' }], total: 1 } };

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const range = (value: { from?: string; to?: string }): ColumnFilter => ({ id: 'at', op: 'between', value });

describe('controlled instant filters', () => {
  it.each([
    ['closed', { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00+09:00' }],
    ['open start', { to: '2026-01-02T00:00:00Z' }],
    ['open end', { from: '2026-01-01T00:00:00Z' }],
  ] satisfies [string, { from?: string; to?: string }][])('renders a %s instant range chip from urlState.filters without throwing', async (_name, value: { from?: string; to?: string }) => {
    const urlState: TableUrlState = { page: null, sorting: [], filters: [range(value)], onChange: () => {} };
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={async () => ok} filterKey="f" preferenceKey="ci" pageSize={25} height={200} urlState={urlState} />
    </PlatformProvider></I18nProvider>);
    const chips = await screen.findByRole('group', { name: '필터' });
    if (value.to) expect(within(chips).getByText(new RegExp(formatInstant(value.to, 'ko').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
  });

  it('describes and lists instant bounds in the viewer format, with no day subtraction', () => {
    const f = range({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00+09:00' });
    const text = `${formatInstant('2026-01-01T00:00:00Z', 'ko')} ~ ${formatInstant('2026-01-02T00:00:00+09:00', 'ko')}`;
    expect(describeFilter(f, { kind: 'instant' }, 'ko')).toBe(text);
    expect(filterInfoRows([f], [{ id: 'at', header: '시각', filter: { kind: 'instant' } }], 'ko')).toEqual([['필터 · 시각', text]]);
    expect(describeFilter(range({ to: '2026-01-02T00:00:00Z' }), { kind: 'instant' }, 'en')).toBe(`~ ${formatInstant('2026-01-02T00:00:00Z', 'en')}`);
  });

  it('a date range still reads inclusive (the exclusive wire end minus one day)', () => {
    expect(describeFilter({ id: 'd', op: 'between', value: { from: '2026-01-01', to: '2026-01-03' } }, { kind: 'date' }, 'ko')).toBe('2026-01-01 ~ 2026-01-02');
  });
});
