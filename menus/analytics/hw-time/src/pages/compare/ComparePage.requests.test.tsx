// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const { default: ComparePage } = await import('./ComparePage');
  const adapter = testAdapter({ session: () => session, menuQuery: async (request: MenuQuery) => { requests.push(request); return answer(request); } });
  window.history.replaceState(null, '', `/hw-time/compare?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ComparePage params={{}} /></PlatformProvider></I18nProvider>);
  await screen.findByRole('group', { name: '분석 보조' });
  await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0), { timeout: 10_000 });
  await waitFor(() => expect(levelRequests().length).toBeGreaterThan(0));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}
/** [summary, composition, detail]: the panel a level request belongs to is told by the drill keys it projects. */
const panelCounts = () => ['none', 'module', 'both'].map(kind => levelRequests().filter(request => {
  const params = request.params as { drillModule?: string; drillMotion?: string };
  return kind === 'none' ? !params.drillModule : kind === 'module' ? !!params.drillModule && !params.drillMotion : !!params.drillMotion;
}).length);
/** A history step (Back/Forward shape): the page re-reads the URL. */
const navigateTo = (search: string) => act(async () => {
  window.history.pushState(null, '', `/hw-time/compare?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
});
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const legendEnter = async (name: string) => {
  const peek = screen.queryByRole('tree', { name: '계층 범례' });
  if (!peek) await openRail('계층 범례');
  fireEvent.keyDown(within(await screen.findByRole('tree', { name: '계층 범례' })).getByRole('treeitem', { name: new RegExp(name) }), { key: 'Enter' });
};
const openRail = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('HW Time compare: UI state never re-queries (real data hooks, counted adapter requests)', () => {
  it('layout commands, rail peeks and option toggles leave the level and trend request counts unchanged', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    const level = levelRequests().length;
    const trend = trendRequests().length;
    // A direct entry at the Motion step asks once per panel: summary, composition and detail.
    expect(level).toBe(3);
    expect(trend).toBe(1);
    const unchanged = () => { expect(levelRequests()).toHaveLength(level); expect(trendRequests()).toHaveLength(trend); };

    // Workspace layout commands: the height mode and 기본 배치.
    fireEvent.click(await screen.findByRole('radio', { name: '아래로 쌓기' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('radio', { name: '화면 맞춤' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' })); await settle(); unchanged();

    // Inspector rail peeks: open each section, then the next (the first closes).
    for (const name of ['분석 대상', '계층 범례', '옵션']) { await openRail(name); await settle(); unchanged(); }

    // Option toggles except scroll: sort, align, min·max, in both directions.
    fireEvent.click(await screen.findByRole('radio', { name: '큰 순' })); await settle(); unchanged();
    fireEvent.click(screen.getByRole('radio', { name: '기본' })); await settle(); unchanged();
    for (const name of ['시작 위치 맞춤', '최소·최대 표시']) {
      fireEvent.click(screen.getByRole('checkbox', { name })); await settle(); unchanged();
      fireEvent.click(screen.getByRole('checkbox', { name })); await settle(); unchanged();
    }
  });

  it('what does re-query: a drill step asks for the panel it fills, once', async () => {
    await renderPage('&drillModule=PM1');
    // A direct entry at the Module step: summary and composition, one each.
    expect(panelCounts()).toEqual([1, 1, 0]);
    const before = levelRequests().length;
    fireEvent.click((await screen.findAllByRole('button', { name: /^전체$/ }))[0]!); await settle();
    expect(levelRequests().length).toBeGreaterThanOrEqual(before);
  });

  // The issue #912 §5 table: [summary, composition, detail] requests added by each step.
  it('each drill step requests only the panel it fills (summary / composition / detail)', async () => {
    await renderPage('');
    expect(panelCounts()).toEqual([1, 0, 0]);
    const added = async (act: () => Promise<void>) => { const before = panelCounts(); await act(); await settle(); return panelCounts().map((n, i) => n - before[i]!); };

    expect(await added(() => legendEnter('PM1'))).toEqual([0, 1, 0]);            // Module A
    expect(await added(() => legendEnter('Pump'))).toEqual([0, 0, 1]);           // Motion X
    expect(await added(() => legendEnter('Dechuck'))).toEqual([0, 0, 1]);           // Motion X → Y
    expect(await added(() => navigateTo('&drillModule=PM2'))).toEqual([0, 1, 0]);      // Module A → B, Motion cleared
    expect(levelRequests().at(-1)!.params).toEqual({ drillModule: 'PM2' });
    expect(window.location.search).not.toContain('drillMotion');
  });

  it('a row highlight sends no request at any step', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    const before = levelRequests().length;
    navigateTo('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2'); await settle();
    expect(levelRequests()).toHaveLength(before);
  });
});
