// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
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
function ContextProbe() {
  const { setGlobal } = usePlatform();
  return <button type="button" onClick={() => setGlobal({ to: '2026-09-26T10:00:00' })}>probe-change-period</button>;
}
async function mount(search = '', ready = 'checkbox') {
  window.history.replaceState(null, '', `/analytics/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=breakdown${search}`);
  frames.length = 0;
  const view = render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={testAdapter({ session: () => session, menuQuery: query })} registry={registry}><ChartCatalog /><ContextProbe /></PlatformProvider></I18nProvider>);
  if (ready === 'checkbox') await screen.findByRole('checkbox', { name: '최소·최대 표시' }); else await screen.findByText(/이 조건에서 없는 값/);
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
    fireEvent.click(screen.getByRole('checkbox', { name: '최소·최대 표시' }));
    expect(last('chart-catalog-breakdown-stacked').minMax).toBe(true);
  });
  it('draws a truly non-additive ratio: shift utilization grouped, server total = ratio of sums, one row without', async () => {
    await mount();
    const frame = last('chart-catalog-breakdown-ratio');
    expect(frame.stacked).toBeFalsy();
    expect(frame.reaggregation).toBe('ratioOfSums');
    expect(frame.valueLabels).toBeUndefined();
    expect(frame.unit).toBe('%');
    expect(frame.series.map(item => item.id)).toEqual(['day', 'swing', 'night']);
    const [first] = frame.series.map(item => item.points[0][1] as number);
    const values = frame.series.map(item => item.points[0][1] as number);
    // Group A: Σ numerator / Σ denominator over its two processes and three shifts = 2270 / 3000 (not the sum or mean of the three values).
    const total = frame.serverTotals!.get('그룹 A')!;
    expect(total).toBe(75.7);
    expect(values.reduce((all, value) => all + value, 0)).not.toBeCloseTo(total, 0);
    expect(values.reduce((all, value) => all + value, 0) / 3).not.toBeCloseTo(total, 1);
    expect(first).toBeLessThan(100);
    expect([...frame.serverTotals!.values()].filter(value => value !== null)).toHaveLength(1);
    expect([...frame.serverTotals!.values()].filter(value => value === null).length).toBeGreaterThan(0);
  });
  it('lists the server totals inside the ratio card, found by a data hook, with no aria-label', async () => {
    await mount();
    const caption = document.querySelector('[data-breakdown-server-total]')!;
    expect(caption.textContent).toMatch(/^서버 합계 — 그룹 A 75\.7% · 그룹 B 없음/);
    expect(caption.hasAttribute('aria-label')).toBe(false);
  });
  it('shows 4–6 rows at the root so Min/Max marks only some segments', async () => {
    await mount();
    const count = last('chart-catalog-breakdown-stacked').series[0].points.length;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
  });
  it('a deep link opens the ancestors so the current item is shown', async () => {
    await mount('&node=A1a');
    const current = screen.getByRole('treeitem', { name: /공정 A1a/ });
    expect(current.getAttribute('aria-current')).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /라인 A1/ })).toBeTruthy();
    expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['설비 A1a-1', '설비 A1a-2', '설비 A1a-3', '설비 A1a-4']);
  });
  it('an unknown node is rejected explicitly, not shown as the root; absent means root', async () => {
    await mount('&node=not-a-place', 'status');
    expect(screen.getByText('이 조건에서 없는 값: not-a-place')).toBeTruthy();
    expect(screen.getByText('다른 값으로 바꾸지 않습니다.')).toBeTruthy();
    expect(frames.some(frame => (frame as AnalysisChartFrameProps).chartId === 'chart-catalog-breakdown-stacked')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('node')).toBe('not-a-place');
    fireEvent.click(screen.getByRole('button', { name: '전체로 돌아가기' }));
    expect(new URLSearchParams(window.location.search).has('node')).toBe(false);
    await waitFor(() => expect(last('chart-catalog-breakdown-stacked').series[0].points.length).toBeGreaterThanOrEqual(4));
  });
  it('an empty node value is rejected too', async () => {
    cleanup();
    window.history.replaceState(null, '', '/analytics/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=breakdown&node=');
    frames.length = 0;
    render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={testAdapter({ session: () => session, menuQuery: query })} registry={registry}><ChartCatalog /></PlatformProvider></I18nProvider>);
    await screen.findByText(/이 조건에서 없는 값/);
    expect(frames).toHaveLength(0);
  });
  it('series grouping rows have no drill button and no Enter drill; place rows do', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /상태.*단계로 이동/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /^상태/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).has('node')).toBe(false);
    expect(screen.getAllByRole('button', { name: /단계로 이동/ }).length).toBeGreaterThan(0);
  });
  it('a Context change clears node and Back restores it', async () => {
    await mount();
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /그룹 B/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('node')).toBe('B');
    fireEvent.click(screen.getByRole('button', { name: 'probe-change-period' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('node')).toBe(false));
    expect(new URLSearchParams(window.location.search).get('to')).toBe('2026-09-26T10:00:00');
    window.history.back();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('node')).toBe('B'));
    await waitFor(() => expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['라인 B1']));
  });
  it('Enter on a drillOnly node sets the node page key and current, and keeps the visible set', async () => {
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: /정지/ }));
    const before = last('chart-catalog-breakdown-stacked').visibleSeriesIds;
    expect(before).toEqual(['run', 'idle']);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /그룹 B/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('node')).toBe('B');
    expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['라인 B1']);
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /그룹 B/ }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /라인 B1/ }), { key: 'Enter' });
    expect(new URLSearchParams(window.location.search).get('node')).toBe('B1');
    expect(screen.getByRole('treeitem', { name: /라인 B1/ }).getAttribute('aria-current')).toBeTruthy();
    expect(last('chart-catalog-breakdown-stacked').visibleSeriesIds).toEqual(before);
    expect(last('chart-catalog-breakdown-stacked').series[0].points.map(([x]) => x)).toEqual(['설비 B1-1', '설비 B1-2', '설비 B1-3', '설비 B1-4']);
  });
});
