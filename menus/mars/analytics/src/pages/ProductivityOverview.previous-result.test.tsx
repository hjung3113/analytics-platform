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

// Only the canvas is replaced; the frame still shows the title/description/unit it was given (what the CSV export and the reader see).
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <figure aria-label={String(props.title)} data-chart={props.chartId} data-unit={props.unit}><p>{String(props.description)}</p>{props.extraActions}</figure>;
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
  const data = request.endpoint.endsWith('.kpis') ? { current: kpiSet, previous: null }
    : request.endpoint.endsWith('.trend') ? { equipmentCount: 2, current: [bucket('2026-09-25T09:00:00')], previous: [] }
      : request.endpoint.endsWith('.breakdown') ? [{ key: params.axis === 'stgroup' ? 'st-01' : 'PHOTO', equipmentCount: 2, occupiedHours: 1, observableHours: 2, jobs: 3 }]
        : [];
  return { outcome: 'ok', data, assessments: request.endpoint.endsWith('.kpis') ? [...ASSESSMENTS, { kind: 'time_domain', state: 'clear' }] : [...ASSESSMENTS], trust: null, correlationId: 'fixture' };
}
let held = false;
const releases: Array<() => void> = [];
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (request: MenuQuery) => {
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
  await waitFor(() => expect(screen.queryByRole('button', { name: /비Process 체류/ })).not.toBeNull(), { timeout: 3000 });
  held = true;
}
beforeEach(() => { held = false; releases.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('ProductivityOverview describes the kept result by the params it was loaded with (#1365 F2)', () => {
  it('stgroup → room: the kept StGroup rows keep the StGroup title, header and have no room drill button until the room rows arrive', async () => {
    await mount('&axis=stgroup');
    const breakdown = screen.getByRole('region', { name: '점유 구성' });
    expect(within(breakdown).queryByRole('button', { name: /들어가기/ })).toBeNull();
    fireEvent.click(within(breakdown).getByRole('radio', { name: 'room_name' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('axis')).toBeNull());
    expect(within(breakdown).getByRole('radio', { name: 'room_name' }).getAttribute('aria-checked')).toBe('true');
    expect(within(breakdown).getByRole('figure').getAttribute('aria-label')).toContain('StGroup');
    expect(within(breakdown).getByText('st-01')).toBeTruthy();
    expect(within(breakdown).getByRole('button', { name: /^StGroup/ })).toBeTruthy();
    expect(within(breakdown).queryByRole('button', { name: /들어가기/ })).toBeNull();
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(within(breakdown).getByRole('figure').getAttribute('aria-label')).toContain('room_name'));
    expect(within(breakdown).getByRole('button', { name: 'PHOTO 들어가기' })).toBeTruthy();
  });

  it('room → stgroup: the kept room rows keep the room_name title and their drill buttons (the keys are rooms)', async () => {
    await mount();
    const breakdown = screen.getByRole('region', { name: '점유 구성' });
    fireEvent.click(within(breakdown).getByRole('radio', { name: 'StGroup' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('axis')).toBe('stgroup'));
    expect(within(breakdown).getByRole('figure').getAttribute('aria-label')).toContain('room_name');
    expect(within(breakdown).getByRole('button', { name: 'PHOTO 들어가기' })).toBeTruthy();
  });

  it('hour → day: the trend description still says the grain of the kept series until the new one arrives', async () => {
    await mount('&granularity=hour');
    const trend = screen.getByRole('region', { name: '주요 추세' });
    fireEvent.click(screen.getByRole('radio', { name: '일' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('granularity')).toBe('day'));
    expect(within(trend).getByRole('figure').textContent).toContain('시간');
    expect(within(trend).getByRole('figure').textContent).not.toContain('일별');
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(within(trend).getByRole('figure').textContent).toContain('일별'));
  });

  it('throughput → dwell: the kept series keep the throughput title and unit until the dwell series arrives', async () => {
    await mount();
    const trend = screen.getByRole('region', { name: '주요 추세' });
    fireEvent.click(screen.getByRole('button', { name: /비Process 체류/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('kpi')).toBe('dwell'));
    const frame = within(trend).getByRole('figure');
    expect(frame.getAttribute('data-chart')).toBe('productivity-trend-throughput');
    expect(frame.getAttribute('aria-label')).toContain('Job 처리량');
    expect(frame.getAttribute('data-unit')).toBe('Job');
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(within(trend).getByRole('figure').getAttribute('data-chart')).toBe('productivity-trend-dwell'));
  });
});
