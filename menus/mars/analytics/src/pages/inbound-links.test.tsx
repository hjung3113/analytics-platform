// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, NO_FEATURES, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { PERMISSION } from '../permission';
import { TEST_AXES } from '../test-axes';
import ExecutionDetail from './ExecutionDetail';
import ProductivityOverview from './ProductivityOverview';

const registry = createRegistry({
  permissions: [PERMISSION],
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '분석', en: 'Analysis' }, icon: Timer, space: spaceId('mars') }],
  menus: [...manifests, ...['equipment-detail', 'other'].map(id => ({
    id, group: groupId('analytics'), label: { ko: id === 'other' ? '다른 설비 화면' : '설비 상세', en: id }, description: { ko: '', en: '' },
    path: `/${id}/:equipmentId`, icon: Timer, permission: PERMISSION, requiresScope: false,
    pageType: 'management' as const, context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'], opensObject: { equipment: { param: 'equipmentId' } },
  })), { id: 'voc', group: groupId('analytics'), label: { ko: 'VOC', en: 'VOC' }, description: { ko: '', en: '' }, path: '/voc', icon: Timer, permission: PERMISSION, requiresScope: false, pageType: 'workflow', context: contextCapabilities(), features: NO_FEATURES, pageKeys: [] }],
});
const session = testSession(['analytics:view', 'platform:view']);
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({ session: () => session, menuQuery: async req => req.endpoint === 'analytics.productivity.attention'
  ? { ...empty, outcome: 'ok', assessments: ['collection', 'processing_delay', 'coverage'].map(kind => ({ kind, state: 'clear' })), data: [{ kind: 'p95', equipmentId: 'E1', room: 'PHOTO', stgroup: 'STG', p95Min: 10, jobs: 3 }] } as unknown as ApiResponse<never> : empty });
function mount(page: React.ReactNode, url: string) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}>{page}</PlatformProvider></I18nProvider>);
}
afterEach(cleanup);
describe('analytics inbound links (#1930)', () => {
  it('execution declares a route-param header subject and removes its fixed equipment link', async () => {
    mount(<ExecutionDetail params={{ equipmentId: 'E1' }} />, '/analytics/executions/E1?v=1&scopeId=MEM&entityType=job&anchor=2456001');
    fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
    const group = await screen.findByRole('group', { name: 'E1 다른 화면에서 열기' });
    expect(within(group).getByRole('button', { name: '설비 상세' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '설비 상세' })).toBeNull();
  });
  it('productivity equipment rows adopt the list while cycle-time keeps its Selection intent', async () => {
    mount(<ProductivityOverview params={{}} />, '/analytics/productivity?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    const row = await screen.findByRole('button', { name: 'E1 다른 화면에서 열기' });
    const cycle = screen.getByRole('link', { name: '사이클타임 상세 →' });
    expect(new URL(cycle.getAttribute('href')!, 'http://localhost').searchParams.get('selectedEquipmentIds')).toBe('E1');
    fireEvent.click(row);
    expect(await screen.findByRole('button', { name: '설비 상세' })).toBeTruthy();
    expect(registry.menuById('productivity-overview').subjectLinks).toBeUndefined();
  });
});
