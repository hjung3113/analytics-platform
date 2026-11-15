// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { manifests } from '../index';
import ProductivityOverview from './ProductivityOverview';
import { TEST_AXES } from '../test-axes';

// Capture the menu declaration at the Frame boundary; chart projection itself is covered by SDK tests.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <figure aria-label={props.chartId}><output>{JSON.stringify({ series: props.series, compareSeries: props.compareSeries })}</output></figure>;
  }
  return { ...actual, AnalysisChartFrame };
});
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 1200, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() {}
  disconnect() {}
}
const previousObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
beforeAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver; });
afterAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previousObserver; });

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const ASSESSMENTS = [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }] as const;
const bucket = (start: string) => ({ start, known: true, occupancyPct: 50, dwellPerJobH: 1, jobs: 3, p50: 10, p95: 20 });
const kpiSet = { equipmentCount: 2, knownBuckets: 4, occupancy: { num: 1, den: 2, pct: 50 }, dwell: { hours: 2, jobs: 2, perJobH: 1 }, cycle: { jobs: 3, p50: 10, p95: 20 }, throughput: { jobs: 3, started: 4 } };
function answer(request: MenuQuery): ApiResponse<unknown> {
  const params = request.params as { axis?: string };
  let data: unknown = [];
  if (request.endpoint.endsWith('.kpis')) data = { current: kpiSet, previous: null };
  if (request.endpoint.endsWith('.trend')) data = { equipmentCount: 2, current: [bucket('2026-09-25T09:00:00')], previous: [bucket('2026-09-23T09:00:00'), bucket('2026-09-23T10:00:00')] };
  if (request.endpoint.endsWith('.breakdown')) data = [{ key: params.axis === 'stgroup' ? 'st-01' : 'PHOTO', equipmentCount: 2, occupiedHours: 1, observableHours: 2, jobs: 3 }];
  return { outcome: 'ok', data, assessments: request.endpoint.endsWith('.kpis') ? [...ASSESSMENTS, { kind: 'time_domain', state: 'clear' }] : [...ASSESSMENTS], trust: null, correlationId: 'fixture' };
}
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps previous bucket starts and cardinality in compare series (SHE-42)', async () => {
  const adapter = testAdapter({ session: () => session, menuQuery: async request => answer(request) });
  window.history.replaceState(null, '', '/analytics/productivity?v=1&scopeId=MEM&kpi=occupancy&from=2026-09-24T09:00:00&to=2026-09-26T09:00:00');
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
  const chart = await screen.findByRole('figure', { name: 'productivity-trend-occupancy' });
  const data = JSON.parse(chart.textContent!) as { series: { points: unknown[] }[]; compareSeries: { points: unknown[] }[] };
  expect(data.series[0].points).toEqual([['2026-09-25T09:00:00', 50]]);
  expect(data.compareSeries[0].points).toEqual([['2026-09-23T09:00:00', 50], ['2026-09-23T10:00:00', 50]]);
});
