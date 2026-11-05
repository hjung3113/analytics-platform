// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';
import { installWorkspaceGeometry } from './workspaceTestSupport';
import { TEST_AXES } from '../test-axes';

// jsdom has no canvas: only the Chart Frame is replaced (it still draws its title and the series ids it was given).
let frameProps: import('@ap/components').AnalysisChartFrameProps | null = null;
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    if (props.chartId === 'cycle-time-trend') frameProps = props;
    return <figure aria-label={String(props.title)} data-chart={props.chartId}>{String(props.description)}</figure>;
  }
  return { ...actual, AnalysisChartFrame };
});

const restoreGeometry = installWorkspaceGeometry();
afterAll(restoreGeometry);

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '분석', en: 'Analytics' }, icon: Timer, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const ASSESSMENTS = [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }] as const;
const ok = (data: unknown): ApiResponse<unknown> => ({ outcome: 'ok', data, assessments: [...ASSESSMENTS], trust: null, correlationId: 'fixture' });
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };

let held = false;
const releases: Array<() => void> = [];
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (request: MenuQuery) => {
    if (request.endpoint.endsWith('.kpi')) return ok({ p50: 41.2, p95: 68.5, count: 10, slowCount: 2, prevP50: null, prevP95: null });
    if (request.endpoint.endsWith('.trend')) {
      if (held) await new Promise<void>(resolve => { releases.push(resolve); });
      return ok({ count: 10, populationP95: null, current: { p50: [['2026-09-25T09:00:00', 1]], p95: [['2026-09-25T09:00:00', 2]] }, previous: { p50: [], p95: [] } });
    }
    if (request.endpoint.endsWith('.dist')) return ok({ count: 10, bins: [] });
    return empty;
  },
});

function Apply() { const query = useQueryDraft(); return <button onClick={query.apply} disabled={!query.canApply}>Apply query</button>; }
const base = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const skeletons = () => document.querySelectorAll('[role="status"][aria-busy]');

beforeEach(() => {
  held = false; releases.length = 0;
  const storage = memoryStorage();
  storage.setItem('platform:page-head-collapsed:cycle-time', 'false');
  vi.stubGlobal('localStorage', storage);
  window.history.replaceState(null, '', base);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

async function mount() {
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} registry={registry} adapter={adapter} slots={{ contextBar: <Apply /> }}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByRole('figure', { name: '사이클타임 추세' })).toBeTruthy(), { timeout: 8000 });
  held = true;
}

describe('CycleTimeDrilldown describes and acts on the kept trend by its own grain (#1365 F3)', () => {
  it('while the hourly series are kept under the day grain, the description says hours and a point click is refused (F3)', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '일' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
    await waitFor(() => expect(window.location.search).toContain('granularity=day'));
    const figure = screen.getByRole('figure', { name: '사이클타임 추세' });
    expect(figure.textContent).toContain('시간');
    expect(figure.textContent).not.toContain('· 일 ·');
    act(() => { frameProps!.onPointClick!('2026-09-25T09:00:00', 'p50'); });
    expect(window.location.search).not.toContain('bucket=');
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(screen.getByRole('figure', { name: '사이클타임 추세' }).textContent).toContain('· 일 ·'));
    act(() => { frameProps!.onPointClick!('2026-09-25T09:00:00', 'p50'); });
    await waitFor(() => expect(window.location.search).toContain('bucket='));
  });
});
