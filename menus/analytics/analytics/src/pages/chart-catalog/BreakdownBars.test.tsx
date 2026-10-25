// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { Activity } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import type { AnalysisChartFrameProps } from '@ap/components';
import { manifests } from '../../index';
import { TEST_AXES } from '../../test-axes';
import ChartCatalog from './ChartCatalog';

const frames = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../../../../packages/components/src/AnalysisChartFrame', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(),
  AnalysisChartFrame: (props: unknown) => { frames.push(props); return null; } }));
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '분석 목적', en: 'Analysis purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '분석', en: 'Analytics' }, icon: Activity, space: spaceId('analytics') }], menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const empty = { current: [], previous: [], previousFrom: null, previousTo: null, heatmap: { xLabels: [], yLabels: [], cells: [] }, donut: [], scatter: [], boxPlot: [], pareto: [] };
const query = vi.fn(async () => ({ outcome: 'ok' as const, data: empty, assessments: [{ kind: 'collection' as const, state: 'confirmed' as const }, { kind: 'coverage' as const, state: 'confirmed' as const }], trust: null, correlationId: 'catalog' }));
async function mount(search = '') {
  window.history.replaceState(null, '', `/analytics/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=breakdown${search}`);
  frames.length = 0;
  const view = render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={testAdapter({ session: () => session, menuQuery: query })} registry={registry}><ChartCatalog /></PlatformProvider></I18nProvider>);
  await screen.findByRole('button', { name: '최소·최대' });
  return view;
}
const last = (chartId: string) => [...frames].reverse().map(frame => frame as AnalysisChartFrameProps).find(frame => frame.chartId === chartId)!;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('breakdown bar fixtures (#580h)', () => {
  it('draws the additive measure stacked with value labels and sum reaggregation', async () => {
    await mount();
    const frame = last('chart-catalog-breakdown-stacked');
    expect(frame.stacked).toBe(true);
    expect(frame.valueLabels).toBe('both');
    expect(frame.reaggregation).toBe('sum');
    expect(frame.minMax).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '최소·최대' }));
    expect(last('chart-catalog-breakdown-stacked').minMax).toBe(true);
  });
  it('draws the ratio grouped with ratioOfSums, a server total on one row and none on another', async () => {
    await mount();
    const frame = last('chart-catalog-breakdown-ratio');
    expect(frame.stacked).toBeFalsy();
    expect(frame.reaggregation).toBe('ratioOfSums');
    expect(frame.unit).toBe('%');
    expect([...frame.serverTotals!.values()]).toEqual([100, null]);
    expect(screen.getByLabelText('서버 합계').textContent).toContain('합계 없음');
  });
  it('Enter on a drillOnly node sets the node page key and current, and keeps the visible set', async () => {
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: /정지/ }));
    const before = last('chart-catalog-breakdown-stacked').visibleSeriesIds;
    expect(before).toEqual(['run', 'idle']);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /그룹 B/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('node')).toBe('B');
    expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['라인 B1']);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /라인 B1/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('node')).toBe('B1');
    expect(screen.getByRole('treeitem', { name: /라인 B1/ }).getAttribute('aria-current')).toBeTruthy();
    expect(last('chart-catalog-breakdown-stacked').visibleSeriesIds).toEqual(before);
    expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['설비 B1-1', '설비 B1-2', '설비 B1-3']);
  });
});
