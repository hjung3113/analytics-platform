// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Timer } from 'lucide-react';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
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

const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 1280; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return /^(스크롤 가능한 행 영역|Scrollable rows)$/.test((this as Element).getAttribute('aria-label') ?? '') ? 220 : 0; } });
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {} }));
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth); else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
});

describe('CycleTimeDrilldown compact action', () => {
  it('shows 상세 as an icon link with the same name and the execution-detail href', async () => {
    window.history.replaceState(null, '', '/analytics/cycle-time?v=1&scopeId=ICH&from=2026-09-26T00:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
    const link = await screen.findByRole('link', { name: 'EQ-1 · 2026-09-26 01:02:03 상세' });
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.textContent).toBe('');
    expect(link.getAttribute('href')).toContain('EQ-1');
  });
});
