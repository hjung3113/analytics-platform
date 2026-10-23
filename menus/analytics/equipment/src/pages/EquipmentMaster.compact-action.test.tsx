// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';

// ADR-0037 compact action column: with the scrollport between 192px and 248px the 보기 action is an icon with the same name.
const registry = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('equipment:view'), homeMenuId: 'equipment-master' }],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['equipment:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const row = { equipmentId: 'EQ-1', site: 'MEM', room: 'PHOTO', line: 'L1', stgroup: 'G', team: 'T', maker: 'M', model: 'X', chamberType: 'C', status: 'active', validFrom: '2026-01-01', validTo: null, updatedAt: '2026-01-02', updatedBy: 'u' };
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments, trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => req.endpoint === 'equipment.master.page' ? ok({ rows: [row], total: 1 }) : req.endpoint === 'equipment.master.makers' ? ok(['M']) : empty,
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => {
  restoreGeometry = stubCompactTableGeometry();
});
afterEach(() => {
  cleanup(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

describe('EquipmentMaster compact action', () => {
  it('shows an icon-only 보기 with the same name and still opens the drawer', async () => {
    window.history.replaceState(null, '', '/equipment?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><EquipmentMaster /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    // The first render of this page (page, table, accessible-name lookup) exceeds the 1s default under parallel load (#434).
    const button = await screen.findByRole('button', { name: 'EQ-1 보기' }, { timeout: 8000 });
    fireEvent.click(button);
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('EQ-1');
    expect(await screen.findByRole('heading', { name: 'EQ-1' })).toBeTruthy();
  });
});
