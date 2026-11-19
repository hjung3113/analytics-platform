// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession, useToastsForTest } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';

// ADR-0105 page wiring: 상태/Maker/column conditions are one hidden `filter` key;
// `q` is the toolbar search (draft + Enter); the page query carries `q` + the table's `filters`.
const registry = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('equipment:view'), homeMenuId: 'equipment-master' }],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['equipment:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const row = { equipmentId: 'EQ-1', site: 'MEM', room: 'PHOTO', line: 'L1', stgroup: 'G', team: 'T', maker: 'TEL', model: 'X', chamberType: 'C', status: 'active', validFrom: '2026-01-01', validTo: null, updatedAt: '2026-01-02', updatedBy: 'u' };
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments, trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const queries: MenuQuery[] = [];
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => { queries.push(req); return req.endpoint === 'equipment.master.page' ? ok({ rows: [row], total: 1 }) : req.endpoint === 'equipment.master.makers' ? ok(['AMAT', 'TEL']) : empty; },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => { queries.length = 0; restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(search: string) {
  window.history.replaceState(null, '', `/equipment?v=1&scopeId=MEM${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><EquipmentMaster /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const pageQueries = () => queries.filter(q => q.endpoint === 'equipment.master.page');
const lastPageParams = () => pageQueries().at(-1)!.params as Record<string, unknown>;

describe('EquipmentMaster filter model (ADR-0105)', () => {
  it('pins 상태 before Maker on the filter line (R2 order), not in column order', async () => {
    mount('');
    await vi.waitFor(() => expect(pageQueries().length).toBeGreaterThan(0), { timeout: 8000 });
    const line = document.querySelector('[data-filter-line]')!;
    expect([...line.querySelectorAll('[data-filter-body]')].map(b => b.getAttribute('data-filter-body'))).toEqual(['status', 'maker']);
  });

  it('a bad filter in the address names the filter in the warning title, not sort/page', async () => {
    mount('&filter=ghost:contains:x');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).not.toContain('정렬·페이지');
  });

  // The old single keys left with the alias release (#1217 follow-up): `status=`/`maker=` are now unregistered extras,
  // ignored exactly like any unknown key — no condition, no warning, no rewrite; the pair stays in the address.
  it.each([
    ['old status key', 'status', 'active'],
    ['old maker key', 'maker', 'TEL'],
    ['never-registered key', 'zz', '1'],
  ])('%s is ignored like any unknown key', async (_name, key, value) => {
    mount(`&${key}=${value}`);
    await vi.waitFor(() => expect(pageQueries().length).toBeGreaterThan(0), { timeout: 8000 });
    expect(lastPageParams()).not.toHaveProperty('filters');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(new URLSearchParams(window.location.search).get(key)).toBe(value);
  });

  it('reads a shared ?filter= link: conditions reach the server and leave the address', async () => {
    mount('&filter=status:in:idle~retired&filter=model:contains:X');
    await vi.waitFor(() => expect(lastPageParams().filters).toEqual([{ id: 'status', op: 'in', value: ['idle', 'retired'] }, { id: 'model', op: 'contains', value: 'X' }]), { timeout: 8000 });
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).has('filter')).toBe(false));
  });

  it('sends only q (no status/maker, no filters) when no condition is set, and the search applies on Enter', async () => {
    mount('');
    const box = await screen.findByLabelText('설비 ID 검색', undefined, { timeout: 8000 });
    await vi.waitFor(() => expect(pageQueries().length).toBeGreaterThan(0));
    expect(lastPageParams()).toMatchObject({ q: '' });
    expect(lastPageParams()).not.toHaveProperty('filters');
    fireEvent.change(box, { target: { value: 'etch' } });
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull(); // a draft until Enter
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('etch');
    await vi.waitFor(() => expect(lastPageParams()).toMatchObject({ q: 'etch' }));
    fireEvent.change(box, { target: { value: '' } }); // clearing applies at once
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
  });

  it('does not apply an Enter that belongs to an IME composition', async () => {
    mount('');
    const box = await screen.findByLabelText('설비 ID 검색', undefined, { timeout: 8000 });
    fireEvent.change(box, { target: { value: '설비' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(new URLSearchParams(window.location.search).get('q')).toBeNull();
  });

  it('shows no filter rail: the page gives ManagementLayout no filter', async () => {
    mount('');
    await screen.findByLabelText('설비 ID 검색', undefined, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /^적용/ })).toBeNull();
    expect(screen.queryByLabelText('상태', { selector: 'select' })).toBeNull();
  });
});


describe('EquipmentMaster wall-clock display', () => {
  it('shows validity dates and change time at minute precision', async () => {
    window.history.replaceState(null, '', '/equipment?v=1&scopeId=MEM');
    const datesAdapter = testAdapter({
      session: () => session,
      menuQuery: async req => req.endpoint === 'equipment.master.page'
        ? ok({ rows: [{ ...row, validFrom: '2025-12-24T00:00:00', validTo: '2026-09-14T00:00:00', updatedAt: '2026-09-14T10:32:00' }], total: 1 })
        : req.endpoint === 'equipment.master.makers' ? ok(['TEL']) : empty,
    });
    render(<I18nProvider><PlatformProvider adapter={datesAdapter} registry={registry}><DetailPanelSlotProvider><EquipmentMaster /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('2025-12-24')).toBeTruthy();
    expect(screen.getByText('2026-09-14')).toBeTruthy();
    expect(screen.getByText('2026-09-14 10:32')).toBeTruthy();
    expect(screen.queryByText(/2025-12-24T|2026-09-14T/)).toBeNull();
  });
});

function DrawerHost() {
  const slot = useDetailPanelSlotHost();
  const toasts = useToastsForTest();
  return <><aside ref={slot.ref} /><div role="log">{toasts.map(toast => <p key={toast.id}>{toast.text}</p>)}</div></>;
}

function mountDrawer(id: string, options: { search?: string; url?: URL; readPage?: () => Promise<ApiResponse<never>>; readMembership?: () => Promise<ApiResponse<never>> } = {}) {
  window.history.replaceState(null, '', options.url ?? `/mars/equipment-master?v=1&scopeId=MEM&focus=${id}${options.search ?? ''}`);
  const scopedAdapter = testAdapter({
    session: () => session,
    getEntity: async ref => ref.id === row.equipmentId ? ok(row) : empty,
    menuQuery: async req => {
      queries.push(req);
      const query = req.params as { q?: string };
      if (req.endpoint === 'equipment.master.page') return query.q && options.readPage ? options.readPage() : ok(query.q ? { rows: [], total: 0 } : { rows: [row], total: 1 });
      if (req.endpoint === 'equipment.master.export') return query.q ? options.readMembership?.() ?? { ...empty, assessments } : ok([row]);
      return ok(['TEL']);
    },
  });
  render(<I18nProvider><PlatformProvider adapter={scopedAdapter} registry={registry}>
    <DetailPanelSlotProvider><EquipmentMaster /><DrawerHost /></DetailPanelSlotProvider>
  </PlatformProvider></I18nProvider>);
}

it('closes a filtered-out Equipment detail, keeps the applied search, and focuses and announces the list', async () => {
  mountDrawer('EQ-1');
  await within(await screen.findByRole('dialog')).findByRole('link', { name: 'X' });
  const search = screen.getByRole('searchbox', { name: '설비 ID 검색' });
  fireEvent.change(search, { target: { value: 'ETCH' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const params = new URLSearchParams(window.location.search);
  expect(params.has('focus')).toBe(false);
  expect(params.get('q')).toBe('ETCH');
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: '설비 목록' })));
  expect(screen.getByRole('log').textContent).toContain('열린 항목이 목록에서 빠져 닫았습니다');
});

it('clears the missing Equipment ID using the shared recovery action', async () => {
  mountDrawer('NOPE-999');
  const drawer = await screen.findByRole('dialog', { name: 'NOPE-999' });
  expect(await within(drawer).findByText('이 항목을 찾을 수 없습니다 — 삭제되었거나 볼 권한이 없습니다')).toBeTruthy();
  expect(within(drawer).getByRole('heading', { name: 'NOPE-999' }).className).toContain('t-mono');
  expect(within(drawer).getAllByRole('button').map(button => button.textContent || button.getAttribute('aria-label'))).toEqual(['상세 닫기', '선택 해제']);
  fireEvent.click(within(drawer).getByRole('button', { name: '선택 해제' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
});

it('copies applied hidden Equipment filters and excludes extras, return navigation and expansion', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
  mountDrawer('EQ-1', { search: '&filter=status:in:active&filter=model:contains:X&extra=hidden&expand=1&returnTo=%2Fmars%2Fequipment-master' });
  const link = await screen.findByRole('link', { name: 'X' });
  expect(new URLSearchParams(window.location.search).has('filter')).toBe(false);
  const drawer = link.closest<HTMLElement>('[role="dialog"]')!;
  fireEvent.click(within(drawer).getByRole('button', { name: '링크 복사' }));
  expect(writeText).toHaveBeenCalledTimes(1);
  const copied = new URL(writeText.mock.calls[0]![0]);
  expect(copied.pathname).toBe('/mars/equipment-master');
  expect(copied.searchParams.get('focus')).toBe('EQ-1');
  expect(copied.searchParams.getAll('filter')).toEqual(['status:in:active', 'model:contains:X']);
  for (const key of ['extra', 'expand', 'returnTo']) expect(copied.searchParams.has(key)).toBe(false);
  cleanup();
  queries.length = 0;
  mountDrawer('EQ-1', { url: copied });
  await waitFor(() => expect(lastPageParams().filters).toEqual([
    { id: 'status', op: 'in', value: ['active'] },
    { id: 'model', op: 'contains', value: 'X' },
  ]));
});

it('reports an oversized Equipment share without writing a shorter link', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
  mountDrawer('EQ-1', {
    search: `&q=${'X'.repeat(4000)}`,
    readPage: async () => ok({ rows: [row], total: 1 }),
    readMembership: async () => ok([row]),
  });
  const link = await screen.findByRole('link', { name: 'X' });
  const drawer = link.closest<HTMLElement>('[role="dialog"]')!;
  fireEvent.click(within(drawer).getByRole('button', { name: '링크 복사' }));
  expect(await screen.findByText('조건 링크가 너무 길어 복사하지 못했습니다. 조건을 줄인 뒤 다시 시도하세요.')).toBeTruthy();
  expect(writeText).not.toHaveBeenCalled();
});

it.each(['button', 'Escape'])('restores a manually closed Equipment drawer with Back (%s)', async gesture => {
  mountDrawer('EQ-1');
  const link = await screen.findByRole('link', { name: 'X' });
  const drawer = link.closest<HTMLElement>('[role="dialog"]')!;
  const close = within(drawer).getByRole('button', { name: '상세 닫기' });
  const priorLength = window.history.length;
  if (gesture === 'button') fireEvent.click(close);
  else fireEvent.keyDown(close, { key: 'Escape' });
  expect(window.history.length).toBe(priorLength + 1);
  expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
  window.history.back();
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe('EQ-1'));
  expect(await screen.findByRole('link', { name: 'X' })).toBeTruthy();
  window.history.forward();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
});

it.each([true, false])('waits for a successful Equipment page before automatic closure (success=%s)', async success => {
  const page = deferred<ApiResponse<never>>();
  const membership = deferred<ApiResponse<never>>();
  const readPage = vi.fn(() => page.promise);
  const readMembership = vi.fn(() => membership.promise);
  mountDrawer('EQ-1', { readPage, readMembership });
  const link = await screen.findByRole('link', { name: 'X' });
  const search = screen.getByRole('searchbox', { name: '설비 ID 검색' });
  fireEvent.change(search, { target: { value: 'ETCH' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await waitFor(() => { expect(readPage).toHaveBeenCalled(); expect(readMembership).toHaveBeenCalled(); });
  await act(async () => membership.resolve({ ...empty, assessments }));
  expect(screen.getByRole('link', { name: 'X' })).toBe(link);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe('EQ-1');
  expect(screen.getByRole('log').textContent).toBe('');
  await act(async () => page.resolve(success ? ok({ rows: [], total: 0 }) : { ...empty, outcome: 'error', message: 'Page unavailable', recovery: { retryable: true } }));
  if (success) {
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(screen.getByRole('log')).getAllByText('열린 항목이 목록에서 빠져 닫았습니다')).toHaveLength(1);
    expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
  } else {
    // A transient page failure keeps the drawer open and offers retry (#2535: retry only for a confirmed transient error).
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'X' })).toBe(link);
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('EQ-1');
  }
});
