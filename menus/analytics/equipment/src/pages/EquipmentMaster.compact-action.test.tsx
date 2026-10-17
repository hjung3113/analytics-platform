// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';

// ADR-0037 compact action column: with the scrollport between 192px and 248px the 보기 action is an icon with the same name.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'equipment:view', homeMenuId: 'equipment-master' }],
  groups: [{ id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: 'analytics' }],
  menus: manifests,
});
const session = testSession(['equipment:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'ICH', label: 'ICH', grantedRooms: 1, totalRooms: 1 }] });
const row = { equipmentId: 'EQ-1', site: 'ICH', room: 'PHOTO', line: 'L1', stgroup: 'G', team: 'T', maker: 'M', model: 'X', chamberType: 'C', status: 'active', validFrom: '2026-01-01', validTo: null, updatedAt: '2026-01-02', updatedBy: 'u' };
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments, trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => req.endpoint === 'equipment.master.page' ? ok({ rows: [row], total: 1 }) : req.endpoint === 'equipment.master.makers' ? ok(['M']) : empty,
  session: () => session,
});

const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 1280; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return /^(스크롤 가능한 행 영역|Scrollable rows)$/.test((this as Element).getAttribute('aria-label') ?? '') ? 220 : 0; } });
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {} }));
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth); else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
});

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

describe('EquipmentMaster compact action', () => {
  it('shows an icon-only 보기 with the same name and still opens the drawer', async () => {
    window.history.replaceState(null, '', '/equipment?v=1&scopeId=ICH');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><EquipmentMaster /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    const button = await screen.findByRole('button', { name: 'EQ-1 보기' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).toBe('');
    fireEvent.click(button);
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('EQ-1');
    expect(await screen.findByRole('heading', { name: 'EQ-1' })).toBeTruthy();
  });
});
