// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider } from '@ap/ui';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';

// ADR-0105 page wiring: 상태/Maker/column conditions are one hidden `filter` key; `status=`/`maker=` links convert and are rewritten away;
// `q` is the toolbar search (draft + Enter); the page query carries `q` + the table's `filters` and no `status`/`maker`.
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

  it('converts an old ?status=&maker= link into filter conditions, sends them in `filters` and drops the old params', async () => {
    mount('&status=active&maker=TEL');
    await vi.waitFor(() => expect(lastPageParams().filters).toEqual([{ id: 'status', op: 'in', value: ['active'] }, { id: 'maker', op: 'in', value: ['TEL'] }]), { timeout: 8000 });
    expect(Object.keys(lastPageParams())).not.toContain('status');
    expect(Object.keys(lastPageParams())).not.toContain('maker');
    // The aliases are rewritten away and the conditions are hidden page state: neither shows in the address.
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).has('status')).toBe(false));
    const address = new URLSearchParams(window.location.search);
    expect(address.has('maker')).toBe(false);
    expect(address.has('filter')).toBe(false);
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
