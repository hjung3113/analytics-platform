// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Timer } from 'lucide-react';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';

// ADR-0037 compact action column: a scrollport between 192px and 248px keeps 상세 pinned as an icon link with today's name.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }],
  groups: [{ id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: 'analytics' }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'ICH', label: 'ICH', grantedRooms: 1, totalRooms: 1 }] });
const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const slow = { equipmentId: 'EQ-1', room: 'PHOTO', recipe: 'R', lotId: 'L', ppid: 'P', anchor: '2026-09-26T01:02:03', cycleMin: 90, quality: 'review', delta: 5 };
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
    window.history.replaceState(null, '', '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    // The first render of this page exceeds the 1s default wait under parallel load (#434, #437).
    const link = await screen.findByRole('link', { name: 'EQ-1 · 2026-09-26 01:02:03 상세' }, { timeout: 8000 });
    expect(link.getAttribute('href')).toContain('EQ-1');
  });
});
