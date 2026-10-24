// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { LayoutDashboard } from 'lucide-react';
import type { HwTimeBlock, HwTimeRow } from '../../endpoints';
import { manifests } from '../../index';

// jsdom has no canvas: only the Frame is replaced (its props are not under test here). The real data hooks, the real adapter port and the real PanelWorkspace run.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <section aria-label={String(props.title)} data-chart={props.chartId}>{`${props.chartId} ${props.series.length}`}</section>;
  }
  return { ...actual, AnalysisChartFrame };
});

/** jsdom has no ResizeObserver: every observed element reports one fixed size. */
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const rect = { width: 1200, height: 600, top: 0, left: 0, right: 1200, bottom: 600, x: 0, y: 0 };
    this.callback([{ target, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
const previousObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
beforeAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver; });
afterAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver = previousObserver; });

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });

const MOTIONS = ['Chuck', 'Dechuck', 'Pump'];
const rows = (motions: string[]): HwTimeRow[] => ['H1', 'H2', 'H3'].map(item => ({
  id: `EQ-001.${item}`, equipmentId: 'EQ-001', subItem: item as 'H1', values: Object.fromEntries(motions.map(m => [m, 2])), total: 2 * motions.length,
}));
const block = (motions: string[]): HwTimeBlock => ({ series: motions.map(id => ({ id, name: id, color: 'chart-blue' })), rows: rows(motions), totals: { values: Object.fromEntries(motions.map(m => [m, 6])), total: 6 * motions.length } });
const answer = (request: MenuQuery): ApiResponse<unknown> => {
  const params = request.params as { drillModule?: string; drillMotion?: string; rowIds?: string[] };
  const data = request.endpoint === 'hwTime.trend'
    ? { limits: { maxRows: 8 }, rows: (params.rowIds ?? []).map(id => ({ id, points: [{ at: '2026-09-19', value: 1 }, { at: '2026-09-20', value: 2 }] })) }
    : params.drillMotion ? { ...block(MOTIONS), level: 2, context: block(MOTIONS), detail: block([params.drillMotion]), limits: { maxRows: 120 } }
      : { ...block(params.drillModule ? MOTIONS : ['PM1', 'PM2']), level: params.drillModule ? 1 : 0, limits: { maxRows: 120 } };
  return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'fixture' };
};

const requests: MenuQuery[] = [];
const levelRequests = () => requests.filter(request => request.endpoint === 'hwTime.levelRows');
const trendRequests = () => requests.filter(request => request.endpoint === 'hwTime.trend');

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

async function renderPage(search: string) {
  const { default: OverviewPage } = await import('./OverviewPage');
  const adapter = testAdapter({ session: () => session, menuQuery: async (request: MenuQuery) => { requests.push(request); return answer(request); } });
  window.history.replaceState(null, '', `/hw-time/overview?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><OverviewPage params={{}} /></PlatformProvider></I18nProvider>);
  await screen.findByRole('group', { name: '분석 보조' });
  await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0), { timeout: 10_000 });
  await waitFor(() => expect(levelRequests().length).toBeGreaterThan(0));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

describe('HW Time overview: UI state never re-queries (real data hooks, counted adapter requests)', () => {
  it('layout commands, rail peeks and option toggles leave the level and trend request counts unchanged', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    const level = levelRequests().length;
    const trend = trendRequests().length;
    expect(level).toBe(1);
    expect(trend).toBe(1);
    const unchanged = () => { expect(levelRequests()).toHaveLength(level); expect(trendRequests()).toHaveLength(trend); };

    // Workspace layout commands: a fresh session starts stacked, so fit first, then back; and 기본 배치.
    expect(await screen.findByRole('radio', { name: '아래로 쌓기', checked: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '화면 맞춤' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('radio', { name: '아래로 쌓기' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' })); await settle(); unchanged();

    // The legend lives in its panel: hiding and showing a series asks for nothing.
    const legend = screen.getAllByRole('checkbox').filter(box => /Chuck/.test(box.getAttribute('aria-label') ?? box.parentElement?.textContent ?? ''))[0]!;
    fireEvent.click(legend); await settle(); unchanged();
    fireEvent.click(legend); await settle(); unchanged();

    // Option toggles: sort, align, min·max, in both directions (the stack Inspector keeps its sections mounted).
    fireEvent.click(await screen.findByRole('radio', { name: '큰 순' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('radio', { name: '기본' })); await settle(); unchanged();
    for (const name of ['시작 위치 맞춤', '최소·최대 표시']) {
      fireEvent.click(screen.getByRole('checkbox', { name })); await settle(); unchanged();
      fireEvent.click(screen.getByRole('checkbox', { name })); await settle(); unchanged();
    }
  });

  it('what does re-query: a drill step asks for the next level once', async () => {
    await renderPage('&drillModule=PM1');
    const before = levelRequests().length;
    expect(before).toBe(1);
    const next = await screen.findAllByRole('button', { name: /^전체$/ });
    expect(next.length).toBeGreaterThan(0);
    fireEvent.click(next[0]!); await settle();
    expect(levelRequests().length).toBe(before + 1);
  });
});
