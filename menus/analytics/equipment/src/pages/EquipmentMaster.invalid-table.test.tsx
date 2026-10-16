// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Boxes } from 'lucide-react';
import type { ApiResponse, MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { manifests } from '../index';
import EquipmentMaster from './EquipmentMaster';

// 06 §6.1/§15 + ADR-0034: an invalid sort/page value shows the shared warning in place of the table, never a substitute.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'equipment:view', homeMenuId: 'equipment-master' }],
  groups: [{ id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: Boxes, space: 'analytics' }],
  menus: manifests,
});
const session: Session = { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' }, permissions: ['equipment:view', 'platform:view'] }, scopes: [] };
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const queries: MenuQuery[] = [];
const adapter: PlatformAdapter = {
  menuQuery: async req => { queries.push(req); return empty; },
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => empty,
  recordUsage: async () => ({ accepted: 0 }),
  listAnnotations: async () => empty,
  saveAnnotation: async () => empty,
  reportClientError: async () => ({ accepted: true }),
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
  subscribe: () => () => undefined,
};

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

const SORT = '정렬 “nope”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.';
const PAGE = '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.';
const makerQueries = () => queries.filter(q => q.endpoint === 'equipment.master.makers');

describe('EquipmentMaster invalid sort/page (ADR-0034)', () => {
  it.each([
    ['sort=nope', [SORT]],
    ['page=0', [PAGE]],
    ['sort=nope&page=0', [SORT, PAGE]],
  ])('%s: states the exact sentences, keeps the filter slot, and asks no makers', async (query, sentences) => {
    mount(`?v=1&scopeId=ICH&${query}`);
    const alert = (await screen.findAllByRole('alert')).find(el => el.textContent?.includes('정렬·페이지 값이 올바르지 않습니다'))!;
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual(sentences);
    expect(alert.textContent).not.toMatch(/sort=|page=/);
    expect(screen.getByLabelText('설비 ID 검색')).toBeTruthy();
    expect(screen.getByLabelText('상태')).toBeTruthy();
    // Let the scope check settle: a request would have gone out by now if the gate were open.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(makerQueries()).toHaveLength(0);
  });

  it('control: a valid sort/page does request the makers', async () => {
    mount('?v=1&scopeId=ICH&sort=status:desc&page=2');
    await vi.waitFor(() => expect(makerQueries().length).toBeGreaterThan(0));
    expect(screen.queryByText('정렬·페이지 값이 올바르지 않습니다')).toBeNull();
  });

  it('Reset writes one navigation that drops sort and page and keeps the applied filters', async () => {
    mount('?v=1&scopeId=ICH&q=EQ&status=active&maker=ACME&sort=nope&page=0');
    const alert = (await screen.findAllByRole('alert')).find(el => el.textContent?.includes('정렬·페이지 값이 올바르지 않습니다'))!;
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(push.mock.calls.length + replace.mock.calls.length).toBe(1);
    const params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect([params.get('q'), params.get('status'), params.get('maker')]).toEqual(['EQ', 'active', 'ACME']);
  });
});
