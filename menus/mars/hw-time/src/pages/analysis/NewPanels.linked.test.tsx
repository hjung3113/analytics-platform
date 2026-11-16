// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { LayoutDashboard } from 'lucide-react';
import { manifests } from '../../index';
import HwTimePage from '../../HwTimePage';

vi.mock('@ap/components', async original => {
  const actual = await original<typeof import('@ap/components')>();
  return { ...actual,
    // Dock geometry is outside this test; all chart components remain real.
    PanelWorkspace: (props: import('@ap/components').PanelWorkspaceProps) => <div>{props.panels.map(panel => <section key={panel.id}>{panel.render()}</section>)}</div>,
  };
});
// The mockEchartsCanvas pattern extended to retain engine event handlers; SDK selection, Details and activation stay real.
const canvas = await vi.hoisted(async () => {
  const handlers = new Map<HTMLElement, Map<string, (params: unknown) => void>>();
  const { createRequire } = await import('node:module');
  const require = createRequire(createRequire(import.meta.url).resolve('@ap/components/testing/engines'));
  vi.doMock(require.resolve('echarts/core'), () => ({ use: vi.fn(), init: (element: HTMLElement) => {
    const events = new Map<string, (params: unknown) => void>(); handlers.set(element, events);
    return { setOption: vi.fn(), on: (name: string, callback: (params: unknown) => void) => events.set(name, callback),
      off: (name: string) => events.delete(name), dispose: vi.fn(), resize: vi.fn(), dispatchAction: vi.fn(),
      getWidth: () => 800, getHeight: () => 300, getModel: () => ({ getComponent: () => null }) };
  } }));
  return handlers;
});
function chartClick(title: string, dataIndex: number) {
  const region = screen.getAllByRole('region', { name: title })[0]!; // outer panel; a dense heatmap's scroll area shares the name
  const entry = [...canvas].find(([element]) => region.contains(element));
  expect(entry).toBeTruthy();
  act(() => entry![1].get('click')!({ componentType: 'series', seriesIndex: 0, dataIndex }));
}
function ContextControls() {
  const { setGlobal, resetContext } = usePlatform();
  return <><button onClick={() => setGlobal({ from: '2026-09-25T09:00:00' })}>Change period</button>
    <button onClick={() => setGlobal({ scopeId: 'FDRY' })}>Change Scope</button><button onClick={() => resetContext()}>Reset context</button></>;
}
const requests: MenuQuery[] = [];
const judgement = { value: 6, lower: 1, upper: 4, status: 'over' as const };
const registry = createRegistry({ spaces: [{ id: spaceId('mars'), label: { ko: 'HW', en: 'HW' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }], permissions: [menuPermission('analytics:view')], groups: [{ id: groupId('hwTime'), label: { ko: 'HW', en: 'HW' }, icon: LayoutDashboard, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
function response(request: MenuQuery): ApiResponse<unknown> {
  let data: unknown = {};
  if (request.endpoint === 'hwTime.matrix') data = { equipment: ['EQ-001'], modules: ['PM1'], motions: [{ id: 'Pump', color: 'chart-blue' }], cells: [{ equipmentId: 'EQ-001', moduleId: 'PM1', module: judgement, motions: { Pump: judgement } }], limits: { maxRows: 96 } };
  if (request.endpoint === 'hwTime.equipmentDays') data = { rows: [{ equipmentId: 'EQ-001', date: '2026-09-20', judgement }] };
  if (request.endpoint === 'hwTime.runs') data = { points: [], daily: ['2026-09-20', '2026-09-21'].map(date => ({ id: date, equipmentId: 'EQ-001', moduleId: 'PM1', motion: 'Pump', at: `${date}T00:00:00`, seconds: 6, judgement, motions: { Pump: judgement }, module: judgement })), shown: 0, total: 0, bounds: [] };
  return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'new-panels-linked' };
}
beforeEach(() => { requests.length = 0; canvas.clear(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function mount(extra = '') {
  const adapter = testAdapter({ session: () => session, menuQuery: async request => { requests.push(request); return response(request); } });
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=donut&pins=equipmentDays${extra}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /><ContextControls /></PlatformProvider></I18nProvider>);
  // The first render loads the chart engine lazily; a cold worker can need more than the 1 s default.
  await screen.findByRole('img', { name: '판정 비율 도넛' }, { timeout: 5000 });
}
const page = () => new URLSearchParams(window.location.search);
const runReads = () => requests.filter(request => request.endpoint === 'hwTime.runs');
async function readyScatter() { await screen.findByTestId('hw-overview-scatter', {}, { timeout: 5000 }); }
describe('real chart output and request boundaries', () => {
  it('selects a slice locally; Details writes verdict and refetches scatter only', async () => {
    await mount('&pins=scatter'); await readyScatter();
    const before = requests.length;
    chartClick('판정 비율 도넛', 1);
    expect(page().has('verdict')).toBe(false);
    expect(requests).toHaveLength(before);
    fireEvent.click(within(screen.getByRole('region', { name: '판정 비율 도넛' })).getByRole('button', { name: '상세' }));
    await waitFor(() => expect(requests).toHaveLength(before + 1));
    expect(page().get('verdict')).toBe('over');
    expect(requests.at(-1)).toMatchObject({ endpoint: 'hwTime.runs', params: { verdict: 'over' } });
    expect(runReads().filter(request => !('verdict' in (request.params as object)))).toHaveLength(1);
  });
  it('activates and reactivates a date cell through the real canvas; trend never refetches', async () => {
    await mount('&pins=scatter'); await readyScatter();
    await screen.findByRole('img', { name: '설비 × 날짜 히트맵' }, { timeout: 5000 });
    const before = requests.length;
    chartClick('설비 × 날짜 히트맵', 0);
    await waitFor(() => expect(page().get('date')).toBe('2026-09-20'));
    await waitFor(() => expect(requests).toHaveLength(before + 1));
    expect(requests.at(-1)).toMatchObject({ endpoint: 'hwTime.runs', params: { date: '2026-09-20' } });
    chartClick('설비 × 날짜 히트맵', 0);
    await waitFor(() => expect(page().has('date')).toBe(false));
    await waitFor(() => expect(requests).toHaveLength(before + 2));
    expect(requests.slice(before).every(request => request.endpoint === 'hwTime.runs')).toBe(true);
    expect(runReads().filter(request => !('date' in (request.params as object)))).toHaveLength(2);
  });
  it('date activation without scatter performs no new read', async () => {
    await mount();
    await screen.findByRole('img', { name: '설비 × 날짜 히트맵' }, { timeout: 5000 });
    const before = requests.length;
    chartClick('설비 × 날짜 히트맵', 0);
    await waitFor(() => expect(page().get('date')).toBe('2026-09-20'));
    expect(requests).toHaveLength(before);
  });
  it('restores URL summary, exposes focusable clears, and follows back/forward', async () => {
    await mount('&pins=scatter&verdict=over&date=2026-09-20'); await readyScatter();
    const donut = screen.getByRole('region', { name: '판정 비율 도넛' });
    expect(within(donut).getAllByText('상한 초과').length).toBeGreaterThan(0);
    expect(within(donut).getByText('1 건')).toBeTruthy();
    expect(within(donut).getByText('20%')).toBeTruthy();
    const clear = screen.getByRole('button', { name: '판정: 상한 초과 ×' });
    clear.focus(); expect(document.activeElement).toBe(clear);
    fireEvent.click(clear);
    await waitFor(() => expect(page().has('verdict')).toBe(false));
    expect(within(donut).getByText('5 건')).toBeTruthy();
    await act(async () => { window.history.back(); });
    await waitFor(() => expect(page().get('verdict')).toBe('over'));
    await waitFor(() => expect(within(donut).getByText('1 건')).toBeTruthy());
    expect(within(donut).getByText('20%')).toBeTruthy();
    await act(async () => { window.history.forward(); });
    await waitFor(() => expect(page().has('verdict')).toBe(false));
    const dateClear = screen.getByRole('button', { name: '날짜: 09-20 ×' });
    dateClear.focus(); expect(document.activeElement).toBe(dateClear);
    fireEvent.click(dateClear);
    await waitFor(() => expect(page().has('date')).toBe(false));
  });
  it('shows all four verdicts in both heatmap legends and keeps category values on each cell', async () => {
    await mount('&pins=heatmap');
    for (const name of ['설비 × Module 히트맵', '설비 × 날짜 히트맵']) {
      const region = within((await screen.findAllByRole('region', { name }))[0]!);
      for (const label of ['정상', '상한 초과', '하한 미달', '판정 불가']) expect(region.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
  it.each(['Change period', 'Change Scope', 'Reset context'])('%s clears date through the real Kernel, keeps verdict and avoids PageKeyWarning', async action => {
    await mount('&verdict=over&date=2026-09-20');
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => expect(page().has('date')).toBe(false));
    expect(page().get('verdict')).toBe('over');
    expect(screen.queryByText(/URL.*잘못/)).toBeNull();
    expect(await screen.findByRole('img', { name: '판정 비율 도넛' })).toBeTruthy();
  });
});
