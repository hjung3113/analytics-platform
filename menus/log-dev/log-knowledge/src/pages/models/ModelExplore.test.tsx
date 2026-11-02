// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { encodeFilterParams, type ColumnFilter } from '@ap/contracts';
import ModelExplore from './ModelExplore';
import { PROCESSES, VENDOR_ID, MODEL_ID, Providers, modelRows, admin, makeAdapter, viewer, type Kit } from './test-support';

let kit: Kit;
let session = admin;
let restoreGeometry: () => void;
beforeEach(() => { kit = { queries: [], profile: () => null }; session = admin; restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });

const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 20000 });
const url = () => new URLSearchParams(window.location.search);
function mount(search: string) {
  window.history.replaceState(null, '', `/log/knowledge/models?v=1${search}`);
  render(<Providers adapter={makeAdapter(kit, () => session)}><ModelExplore /></Providers>);
}
const filterQuery = (filters: Parameters<typeof encodeFilterParams>[0]) => encodeFilterParams(filters).map(f => `&filter=${encodeURIComponent(f)}`).join('');
const lastRead = () => kit.queries.filter(q => q.endpoint === 'logKnowledge.exploreModels').at(-1)?.params as { q: string | null; sorting: unknown[]; filters?: unknown[] } | undefined;
const row = (id: string) => document.querySelector(`[role="row"][data-row-id="${id}"]`) as HTMLElement;
const ACTIVE: ColumnFilter = { id: 'active', op: 'in', value: ['true'] };
const VENDOR: ColumnFilter = { id: 'vendorId', op: 'in', value: [VENDOR_ID] };
const PROCESS: ColumnFilter = { id: 'processes', op: 'in', value: [PROCESSES[0]!.id] };

describe('모델 탐색 URL state', () => {
  it('a bare address opens with 활성 and the default sort 모델명, written to the address and sent to the server', async () => {
    mount('');
    await screen.findByText('A-100', {}, slow);
    await waitFor(() => expect(url().get('sort')).toBe('name:asc'));
    // `filter` is a hidden page key: it is not in the visible address, only in what the table reads.
    expect(url().getAll('filter')).toEqual([]);
    await waitFor(() => expect(lastRead()).toMatchObject({ sorting: [{ id: 'name', desc: false }], filters: [ACTIVE] }));
  });

  it('keeps several filters together through refresh and Back/Forward', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE, VENDOR, PROCESS])}`);
    await screen.findByText('A-100', {}, slow);
    expect(lastRead()?.filters).toEqual([ACTIVE, VENDOR, PROCESS]);

    // Refresh: a new mount at the same address reads the same conditions.
    cleanup();
    kit.queries = [];
    render(<Providers adapter={makeAdapter(kit, () => session)}><ModelExplore /></Providers>);
    await screen.findByText('A-100', {}, slow);
    expect(lastRead()?.filters).toEqual([ACTIVE, VENDOR, PROCESS]);

    // A search is a history entry; Back drops it and keeps every filter, Forward brings it back.
    const box = screen.getByPlaceholderText('모델 코드·이름 검색');
    fireEvent.change(box, { target: { value: 'alpha' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(url().get('q')).toBe('alpha'));
    await waitFor(() => expect(lastRead()).toMatchObject({ q: 'alpha', filters: [ACTIVE, VENDOR, PROCESS] }));
    window.history.back();
    await waitFor(() => expect(url().get('q')).toBeNull());
    await waitFor(() => expect(lastRead()).toMatchObject({ q: null, filters: [ACTIVE, VENDOR, PROCESS] }));
    window.history.forward();
    await waitFor(() => expect(lastRead()).toMatchObject({ q: 'alpha', filters: [ACTIVE, VENDOR, PROCESS] }));
  });

  it('a cleared filter stays cleared: an address with a sort and no filter is not defaulted again', async () => {
    mount('&sort=name:asc');
    await screen.findByText('A-100', {}, slow);
    expect(lastRead()?.filters ?? []).toEqual([]);
  });

  it('refuses a sort column the server does not sort by', async () => {
    mount(`&sort=modelItemCount:asc${filterQuery([ACTIVE])}`);
    expect((await screen.findByRole('alert', {}, slow)).textContent).toContain('modelItemCount');
  });

  it('a header click sorts by that server column', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    await screen.findByText('A-100', {}, slow);
    fireEvent.click(document.querySelector('[role="columnheader"][data-column="vendorName"] button')!);
    await waitFor(() => expect(url().get('sort')).toBe('vendorName:asc'));
    await waitFor(() => expect(lastRead()?.sorting).toEqual([{ id: 'vendorName', desc: false }]));
  });
});

describe('모델 탐색 table', () => {
  it('shows the columns, 활성/제조사/공정 on the filter row and the search placeholder', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    await screen.findByText('A-100', {}, slow);
    const table = screen.getByRole('table', { name: '모델 목록' });
    for (const header of ['모델 코드', '모델명', '제조사', '공정', 'SW 버전 수', '모델 공통 Item 수', '상태', '최근 변경']) expect(within(table).getByText(header)).toBeTruthy();
    expect(screen.getByPlaceholderText('모델 코드·이름 검색')).toBeTruthy();
    for (const label of ['활성', '제조사', '공정']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('shows at most two process badges and a +N that names the rest; SW 0 is emphasized; an unmapped model reads 미분류', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    await screen.findByText('A-100', {}, slow);
    const alpha = row(MODEL_ID);
    expect(within(alpha).getByText('Etch')).toBeTruthy();
    expect(within(alpha).getByText('Deposition')).toBeTruthy();
    expect(within(alpha).queryByText('Planarization')).toBeNull();
    const more = within(alpha).getByText(/^\+1/);
    expect(more.getAttribute('title')).toBe('Planarization');
    expect(more.textContent).toContain('Planarization');
    expect(within(alpha).queryByText('SW 0')).toBeNull();
    expect(within(alpha).getByText('4')).toBeTruthy();
    const beta = row(modelRows[1]!.id);
    expect(within(beta).getByText('SW 0').className).toContain('font-semibold');
    expect(within(beta).getByText('미분류')).toBeTruthy();
  });

  it('the model code and the row action open the profile, carrying returnTo', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    const link = await screen.findByRole('link', { name: 'A-100' }, slow);
    const href = new URL(link.getAttribute('href')!, 'http://x');
    expect(href.pathname.endsWith(`/log-knowledge-model/${MODEL_ID}`)).toBe(true);
    expect(href.searchParams.get('returnTo')).toContain('log-knowledge-models');
    expect(href.search).not.toContain('Alpha');
  });
});

describe('모델 탐색 editor-only action', () => {
  it('a catalog manager sees 모델 등록 linking to the catalog models tab; a viewer does not', async () => {
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    const register = await screen.findByRole('link', { name: '모델 등록' }, slow);
    const href = new URL(register.getAttribute('href')!, 'http://x');
    expect(href.pathname.endsWith('/log-knowledge-catalog')).toBe(true);
    expect(href.searchParams.get('tab')).toBe('model');
    cleanup();
    session = viewer;
    mount(`&sort=name:asc${filterQuery([ACTIVE])}`);
    await screen.findByText('A-100', {}, slow);
    expect(screen.queryByRole('link', { name: '모델 등록' })).toBeNull();
    expect(screen.queryByText('모델 등록')).toBeNull();
  });
});
