// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import type { AnalysisChartFrameProps } from '@ap/components';
import type { HwTimeTrendData } from '../../endpoints';
import { manifests } from '../../index';
import { useHwTimeTrend } from '../data';
import { TrendPanel } from './TrendPanel';

vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: AnalysisChartFrameProps) {
    return <div data-testid="trend-series">{props.series.map(item => item.id).join(',')}</div>;
  }
  return { ...actual, AnalysisChartFrame };
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const ASSESSMENTS = [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }] as const;

const trendPayload = (ids: string[]): HwTimeTrendData => ({
  limits: { maxRows: 8 },
  rows: ids.map(id => ({ id, points: [{ at: '2026-09-19', value: 1 }] })),
});

let pending: Array<{ params: { rowIds?: string[] }; resolve: (rows: string[]) => void }> = [];
let holdNext = false;

const adapter = testAdapter({
  session: () => session,
  menuQuery: async (request: MenuQuery): Promise<ApiResponse<unknown>> => {
    const params = request.params as { rowIds?: string[] };
    const returned = holdNext
      ? await new Promise<string[]>(resolve => { pending.push({ params, resolve }); })
      : (params.rowIds ?? []);
    return { outcome: 'ok', data: trendPayload(returned), assessments: [...ASSESSMENTS], trust: null, correlationId: 'fixture' };
  },
});

function Harness() {
  const [rowIds, setRowIds] = useState(['EQ-001.H1']);
  const query = useHwTimeTrend(rowIds);
  return <>
    <button type="button" onClick={() => setRowIds(['EQ-001.H1', 'EQ-020.H1'])}>add-b</button>
    <p data-testid="query-state">{`${query.status}:${String(query.showingPrevious)}`}</p>
    <TrendPanel chartId="hw-trend-test" title="Daily trend" rowIds={rowIds} query={query} level={1} />
  </>;
}

beforeEach(() => {
  pending = [];
  holdNext = false;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/hw-time/steps?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('TrendPanel with keepPrevious (#2077 MEN-48)', () => {
  it('keeps showing the previous result without labelling an added ID unavailable until the current result arrives', async () => {
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness /></PlatformProvider></I18nProvider>);
    await waitFor(() => expect(screen.getByTestId('trend-series').textContent).toBe('EQ-001.H1'));
    expect(screen.queryByText('현재 Scope·조건에 없는 행')).toBeNull();

    holdNext = true;
    fireEvent.click(screen.getByRole('button', { name: 'add-b' }));
    await waitFor(() => expect(screen.getByTestId('query-state').textContent).toBe('refreshing:true'));
    expect(screen.getByTestId('trend-series').textContent).toBe('EQ-001.H1');
    expect(screen.queryByText('현재 Scope·조건에 없는 행')).toBeNull();
    expect(screen.queryByRole('button', { name: '추세에서 제거 EQ-020 · H1' })).toBeNull();

    await act(async () => { pending.shift()!.resolve(['EQ-001.H1']); });
    await waitFor(() => expect(screen.getByTestId('query-state').textContent).toBe('done:false'));
    expect(screen.getByText('현재 Scope·조건에 없는 행')).toBeTruthy();
    expect(screen.getByRole('button', { name: '추세에서 제거 EQ-020 · H1' })).toBeTruthy();
  });

  it('shows both rows with no unavailable label once the current result includes the added ID', async () => {
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness /></PlatformProvider></I18nProvider>);
    await waitFor(() => expect(screen.getByTestId('trend-series').textContent).toBe('EQ-001.H1'));

    holdNext = true;
    fireEvent.click(screen.getByRole('button', { name: 'add-b' }));
    await waitFor(() => expect(screen.getByTestId('query-state').textContent).toBe('refreshing:true'));
    expect(screen.queryByText('현재 Scope·조건에 없는 행')).toBeNull();

    await act(async () => { pending.shift()!.resolve(['EQ-001.H1', 'EQ-020.H1']); });
    await waitFor(() => expect(screen.getByTestId('query-state').textContent).toBe('done:false'));
    expect(screen.getByTestId('trend-series').textContent).toBe('EQ-001.H1,EQ-020.H1');
    expect(screen.queryByText('현재 Scope·조건에 없는 행')).toBeNull();
  });
});
