// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { TEST_AXES } from '../test-axes';

// ADR-0037 compact action column: a scrollport between 192px and 248px keeps 상세 pinned as an icon link with today's name.
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const slow = { equipmentId: 'EQ-1', room: 'PHOTO', recipe: 'R', lotId: 'L', ppid: 'P', anchor: '2456001', startedAt: '2026-09-26T01:02:03', cycleMin: 90, quality: 'review', delta: 5 };
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (req: MenuQuery) => req.endpoint === 'analytics.cycle.slow'
    ? { outcome: 'ok', data: { rows: [slow], total: 1 }, assessments, trust: null, correlationId: 'fixture' } as unknown as ApiResponse<never>
    : empty,
});

let restoreGeometry: () => void;
beforeEach(() => {
  restoreGeometry = stubCompactTableGeometry();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => {
  cleanup(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('CycleTimeDrilldown compact action', () => {
  it('shows 상세 as an icon link with the same name and the execution-detail href', async () => {
    window.history.replaceState(null, '', '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    // The default layout keeps the slow list in a background tab behind the distribution.
    fireEvent.keyDown(await screen.findByRole('tab', { name: '느린 실행' }), { key: 'Enter' });
    // The first render of this page exceeds the 1s default wait under parallel load (#434, #437).
    const link = await screen.findByRole('link', { name: 'EQ-1 · 2026-09-26 01:02:03 상세' }, { timeout: 8000 });
    expect(link.getAttribute('href')).toContain('EQ-1');
    // The row link carries the RecordSequence, never the start time.
    const query = new URL(link.getAttribute('href')!, 'http://x').searchParams;
    expect(query.get('anchor')).toBe('2456001');
    expect(query.get('entityType')).toBe('job');
  });
});
