// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';

// 06 §6.1/§15 + ADR-0034: an invalid sort/page value shows the shared warning in place of the table, never a substitute.
const registry = createRegistry({
  permissions: [menuPermission('equipment:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('equipment:view'), homeMenuId: 'equipment-master' }],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['equipment:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const queries: MenuQuery[] = [];
const adapter = testAdapter({
  menuQuery: async req => { queries.push(req); return empty; },
  session: () => session,
  saveAnnotation: async () => empty,
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
});

beforeEach(() => {
  queries.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no layout: a wide container keeps the filter rail expanded (the narrow layout hides it in a popover).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {},
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(search: string) {
  window.history.replaceState(null, '', `/equipment${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><EquipmentMaster /></PlatformProvider></I18nProvider>);
}

const makerQueries = () => queries.filter(q => q.endpoint === 'equipment.master.makers');

describe('EquipmentMaster invalid sort/page (ADR-0034)', () => {
  // The sentences and Reset are owned by tableUrlWarning.test.tsx; this file keeps what the screen adds.
  it('keeps the filter slot and asks no makers while sort/page is invalid', async () => {
    mount('?v=1&scopeId=MEM&sort=nope&page=0');
    await screen.findByText('정렬·페이지 값이 올바르지 않습니다');
    expect(screen.getByLabelText('설비 ID 검색')).toBeTruthy();
    expect(screen.getByLabelText('상태')).toBeTruthy();
    // Let the scope check settle: a request would have gone out by now if the gate were open.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(makerQueries()).toHaveLength(0);
  });

  it('control: a valid sort/page does request the makers', async () => {
    mount('?v=1&scopeId=MEM&sort=status:desc&page=2');
    await vi.waitFor(() => expect(makerQueries().length).toBeGreaterThan(0));
    expect(screen.queryByText('정렬·페이지 값이 올바르지 않습니다')).toBeNull();
  });
});
