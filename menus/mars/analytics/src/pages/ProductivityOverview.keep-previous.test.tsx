// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { manifests } from '../index';
import ProductivityOverview from './ProductivityOverview';
import { TEST_AXES } from '../test-axes';

// jsdom has no canvas: only the Chart Frame is replaced (it still draws its title, the extra actions and which series ids it was given).
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <figure aria-label={String(props.title)} data-chart={props.chartId}>{props.extraActions}{props.series.map(s => s.id).join(',')}</figure>;
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
  const params = request.params as { kpi?: string; granularity?: string; axis?: string };
  const data = request.endpoint.endsWith('.kpis') ? { current: kpiSet, previous: null }
    : request.endpoint.endsWith('.trend') ? { equipmentCount: 2, current: [bucket('2026-09-25T09:00:00')], previous: [] }
      : request.endpoint.endsWith('.breakdown') ? [{ key: params.axis === 'stgroup' ? 'st-01' : 'PHOTO', equipmentCount: 2, occupiedHours: 1, observableHours: 2, jobs: 3 }]
        : [];
  return { outcome: 'ok', data, assessments: request.endpoint.endsWith('.kpis') ? [...ASSESSMENTS, { kind: 'time_domain', state: 'clear' }] : [...ASSESSMENTS], trust: null, correlationId: 'fixture' };
}

/** The trend and breakdown reads wait for a release after the first answer, so the window between the click and the reply can be inspected. */
let held = false;
const releases: Array<() => void> = [];
const requests: MenuQuery[] = [];
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (request: MenuQuery) => {
    requests.push(request);
    if (held && (request.endpoint.endsWith('.trend') || request.endpoint.endsWith('.breakdown'))) await new Promise<void>(resolve => { releases.push(resolve); });
    return answer(request);
  },
});

const url = (search = '') => `/analytics/productivity?v=1&scopeId=MEM&from=2026-09-24T09:00:00&to=2026-09-26T09:00:00${search}`;
async function mount(search = '') {
  window.history.replaceState(null, '', url(search));
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
  const trend = await screen.findByRole('region', { name: '주요 추세' });
  await waitFor(() => expect(within(trend).getByRole('figure')).toBeTruthy());
  await waitFor(() => expect(within(screen.getByRole('region', { name: '점유 구성' })).getByRole('figure')).toBeTruthy());
  await waitFor(() => expect(screen.queryByRole('button', { name: /비Process 체류/ }), document.querySelector('section[aria-labelledby="kpi-heading"]')?.textContent ?? 'nokpi').not.toBeNull(), { timeout: 3000 });
  held = true;
}
const skeletons = () => document.querySelectorAll('[role="status"][aria-busy]');
const refreshing = (region: HTMLElement) => within(region).queryByRole('status');

beforeEach(() => { held = false; releases.length = 0; requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('ProductivityOverview keeps the previous result while a page input changes (#1365)', () => {
  it('a KPI card click keeps the trend chart with the refreshing label and draws no skeleton, then shows the new trend', async () => {
    await mount();
    const trend = screen.getByRole('region', { name: '주요 추세' });
    fireEvent.click(screen.getByRole('button', { name: /비Process 체류/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('kpi')).toBe('dwell'));
    expect(within(trend).queryByRole('figure')).not.toBeNull();
    expect(refreshing(trend)).not.toBeNull();
    expect(skeletons().length).toBe(0);
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(refreshing(trend)).toBeNull());
    expect(within(trend).getByRole('figure').getAttribute('data-chart')).toBe('productivity-trend-dwell');
  });

  it('the granularity radio keeps the trend chart with the refreshing label and draws no skeleton', async () => {
    await mount();
    const trend = screen.getByRole('region', { name: '주요 추세' });
    fireEvent.click(screen.getByRole('radio', { name: '주' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('granularity')).toBe('week'));
    expect(within(trend).queryByRole('figure')).not.toBeNull();
    expect(refreshing(trend)).not.toBeNull();
    expect(skeletons().length).toBe(0);
  });

  it('the group axis tab keeps the occupancy breakdown with the refreshing label and draws no skeleton, and the new tab is already selected', async () => {
    await mount();
    const breakdown = screen.getByRole('region', { name: '점유 구성' });
    fireEvent.click(within(breakdown).getByRole('radio', { name: 'StGroup' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('axis')).toBe('stgroup'));
    expect(within(breakdown).queryByRole('figure')).not.toBeNull();
    expect(within(breakdown).getByRole('radio', { name: 'StGroup' }).getAttribute('aria-checked')).toBe('true');
    expect(refreshing(breakdown)).not.toBeNull();
    expect(skeletons().length).toBe(0);
  });

  it('a period change still hides the trend behind the skeleton', async () => {
    await mount();
    const trend = screen.getByRole('region', { name: '주요 추세' });
    act(() => {
      window.history.pushState(null, '', url().replace('2026-09-24T09:00:00', '2026-09-23T09:00:00'));
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(within(trend).queryByRole('figure')).toBeNull());
    expect(skeletons().length).toBeGreaterThan(0);
  });
});
