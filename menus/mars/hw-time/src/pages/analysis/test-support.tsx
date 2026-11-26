import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { AnalysisSelectionChipZone } from '@ap/components';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { LayoutDashboard } from 'lucide-react';
import { HW_TIME_MODULE_TYPES, type HwTimeMatrix, type HwTimeMotionStats, type HwTimeRuns } from '../../endpoints';
import { manifests } from '../../index';

const RealWorkspace = createContext(false);
const RealChart = createContext<string | undefined>(undefined);
export const chartRenders = vi.fn<(chartId: string) => void>();

export async function openPanelPicker(trigger = screen.getByRole('button', { name: '패널 추가' })) {
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: '패널 추가' });
}

// Canvas is unavailable in jsdom. Keep queries, filter, URL, table and status UI real; expose the public chart callbacks and declarations.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  return { ...actual,
    PanelWorkspace: function WorkspaceHarness(p: import('@ap/components').PanelWorkspaceProps) {
      const [active, setActive] = useState('current');
      const seq = p.revealRequest?.seq, panelId = p.revealRequest?.panelId;
      useEffect(() => { if (panelId) setActive(panelId); }, [seq, panelId]);
      if (useContext(RealWorkspace)) return <actual.PanelWorkspace {...p} />;
      return <div data-testid="workspace" data-config={JSON.stringify({ revealRequest: p.revealRequest, ids: p.panels.map(panel => panel.id), primary: p.panels.find(panel => panel.primary)?.id, preset: p.presets[0], persistKey: p.persistKey, placement: Object.fromEntries(p.panels.map(panel => [panel.id, panel.placement])), pins: Object.fromEntries(p.panels.map(panel => [panel.id, panel.pin?.pinned])), keep: p.panels.flatMap(panel => panel.keep ? [panel.id] : []), titles: Object.fromEntries(p.panels.map(panel => [panel.id, panel.title.ko])) })}>
      <div role="tablist" aria-label="workspace test tabs">{p.panels.map(panel => <button key={panel.id} role="tab" aria-description={panel.badge?.description.ko} data-count={panel.badge?.count} aria-selected={active === panel.id} onClick={() => setActive(panel.id)}>{panel.id}</button>)}</div>
      <div data-testid="workspace-actions">{p.toolbarActions}</div>
      {p.analysisPanelAddition && <button onClick={() => p.analysisPanelAddition!.onAdd({ source: 'hw-time/table', mode: 'hold', inputs: { motionEquipment: { shape: 'set', values: ['MEM-PHOTO-0105'] } } })}>hold table</button>}
      {p.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`}>{panel.pin && <button onClick={panel.pin.onToggle}>{`pin ${panel.id}`}</button>}{panel.onRemove && <button onClick={panel.onRemove}>{`remove ${panel.id}`}</button>}{panel.render()}</section>)}
    </div>;
    },
    AnalysisChart: (p: import('@ap/components').AnalysisChartProps) => <section aria-label={String(p.title)}>
      <pre data-testid={p.chartId}>{JSON.stringify(p.spec, (_key, value: unknown) => value instanceof Map ? [...value] : value)}</pre>
      {p.spec.kind === 'heatmap' && p.spec.cells.map(cell => <button key={`${cell.x}/${cell.y}`} onClick={() => {
        if (p.spec.kind === 'heatmap') p.spec.onCellClick?.(cell.x, cell.y);
      }}>{`focus ${cell.y} ${cell.x}`}</button>)}
      {p.spec.kind === 'heatmap' && p.spec.cells.map(cell => <button key={`activate/${cell.x}/${cell.y}`} onClick={() => {
        if (p.spec.kind === 'heatmap') p.spec.cellActivation?.onActivate(cell.x, cell.y);
      }}>{`activate ${cell.y} ${cell.x}`}</button>)}
    </section>,
    AnalysisChartFrame: (p: import('@ap/components').AnalysisChartFrameProps) => {
      const real = useContext(RealChart) === p.chartId;
      chartRenders(p.chartId);
      return <section aria-label={p.chartId}>
      {p.title}{p.toolbarStart != null && <div data-chart-toolbar-start>{p.toolbarStart}</div>}{p.extraActions}
      <pre data-testid={p.chartId}>{JSON.stringify({ series: p.series, activeCategory: p.activeCategory, revealActive: p.revealActive, rowPitch: p.rowPitch, startAlign: p.startAlign, minMax: p.minMax, legend: p.legend, activation: p.pointActivation?.on,
        highlightedValues: p.highlightedValues,
        optionKeys: ((p.toolbarStart ?? p.extraActions) as import('react').ReactElement<import('@ap/components').PanelOptionsProps> | undefined)?.props.options.filter(option => !option.hidden).map(option => option.id),
        actions: (typeof p.pointActions === 'function' && p.series[0]?.points[0] ? p.pointActions({ x: p.series[0].points[0][0], value: p.series[0].points[0][1], seriesId: p.series[0].id }) : []).map(action => action.label), emphasisFocus: p.emphasisFocus,
        rowGroups: p.rowGroups && { header: p.rowGroups.header, byCategory: [...p.rowGroups.byCategory] },
        bounds: p.bounds && [...p.bounds],
        statuses: p.series.flatMap(s => s.points.flatMap(([x, value]) => { const st = p.pointStatus?.({ x, value, seriesId: s.id }); return st ? [`${s.id}@${x}:${st.tone}`] : []; })) })}</pre>
      {real ? <actual.AnalysisChartFrame {...p} /> : <>
      {p.series[0]?.points.map(([x, value]) => <span key={x}>
        <button onClick={() => p.onActiveCategoryChange?.(x, 'pointer')}>{`select ${p.chartId} ${x}`}</button>
        {p.chartId === 'hw-module-motions' && <button onClick={() => p.onActiveCategoryChange?.(x, 'keyboard')}>{`browse ${x}`}</button>}
        <button onDoubleClick={() => p.pointActivation?.onActivate({ x, value, seriesId: p.series[0]!.id })}>{`activate ${p.chartId} ${x}`}</button>
      </span>)}
      {p.series[0]?.points[0] && (typeof p.pointActions === 'function' ? p.pointActions({ x: p.series[0].points[0][0], value: p.series[0].points[0][1], seriesId: p.series[0].id }) : []).map(action => <button key={action.id} disabled={action.disabled}
        onClick={() => action.onSelect({ x: p.series[0]!.points[0]![0], value: p.series[0]!.points[0]![1], seriesId: p.series[0]!.id })}>{`point action ${p.chartId} ${action.id}`}</button>)}
      </>}
    </section>;
    },
  };
});

export const requests: MenuQuery[] = [];
const normal = (value: number) => ({ value, lower: 1, upper: 7, status: 'normal' as const });
export const fixtureMatrix = (typeId: string): HwTimeMatrix => {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === typeId)!;
  const equipment = ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'];
  const modules = type.modules.slice(0, 2);
  return { equipment, modules, motions: type.motions.map((id, i) => ({ id, color: i === 0 ? 'chart-blue' : 'chart-teal' })),
    cells: equipment.flatMap(equipmentId => modules.map(moduleId => ({ equipmentId, moduleId,
      motions: Object.fromEntries(type.motions.map((motion, i) => [motion, { ...normal(i + 2), status: 'unjudgeable', reason: 'recipe-unsplit' }])),
      module: { value: 20, lower: null, upper: null, status: 'unjudgeable', reason: 'recipe-unsplit' },
    }))), limits: { maxRows: 96 } };
};
export const stats: HwTimeMotionStats = { rows: [
  { motion: 'Chuck', judgement: { value: 2, lower: 3, upper: 4, status: 'under' } },
  { motion: 'Dechuck', judgement: { value: 8, lower: 3, upper: 4, status: 'over' } },
  { motion: 'Pump', judgement: { value: 3, lower: 2, upper: 4, status: 'normal' } },
] };
const runFixture: HwTimeRuns = {
  points: [9, 2].map((seconds, index) => {
    const judgement = { value: seconds, lower: 3, upper: 4, status: index === 0 ? 'over' as const : 'under' as const };
    return { id: `run-${index}`, equipmentId: ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'][index]!, moduleId: 'PM1', motion: 'Chuck', at: '2026-09-19T10:00:00', seconds, judgement,
      motions: Object.fromEntries(HW_TIME_MODULE_TYPES[0].motions.map(motion => [motion, judgement])), module: { ...judgement, lower: null, upper: null } };
  }), daily: [], shown: 2, total: 576,
  bounds: ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'].map(equipmentId => ({ equipmentId, moduleId: 'PM1', motion: 'Chuck', lower: 3, upper: 4 })),
};
runFixture.daily = runFixture.points.map(point => ({ ...point, at: '2026-09-19T00:00:00' }));
export const answer = (request: MenuQuery): ApiResponse<unknown> => {
  const params = request.params as { moduleType: string };
  const data = request.endpoint === 'hwTime.matrix' ? fixtureMatrix(params.moduleType)
    : request.endpoint === 'hwTime.motionStats' ? stats : request.endpoint === 'hwTime.runs' ? runFixture
    : request.endpoint === 'hwTime.levelRows' ? { level: 0, series: [], rows: [], totals: { values: {}, total: null }, limits: { maxRows: 120 } } : { rows: [], total: 0 };
  return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'overview-fixture' };
};

export const registry = createRegistry({
  
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
export const session = testSession(['analytics:view', 'platform:view']);
export const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
function DetailSlot() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}
export async function renderOverview(search = '', respond: (request: MenuQuery) => ApiResponse<unknown> | Promise<ApiResponse<unknown>> = answer, { waitForData = true, showSelectionChips = false, realWorkspace = false, realChart, showDetail = false, savedViews, children }: { waitForData?: boolean; showSelectionChips?: boolean; realWorkspace?: boolean; realChart?: string; showDetail?: boolean; savedViews?: ComponentProps<typeof PlatformProvider>['savedViews']; children?: ReactNode } = {}) {
  const { default: HwTimePage } = await import('../../HwTimePage');
  const adapter = testAdapter({ session: () => session, menuQuery: async request => { requests.push(request); return respond(request); } });
  window.history.replaceState(null, '', `/mars/hw-time?view=overview&v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  const page = showDetail ? <DetailPanelSlotProvider><HwTimePage params={{}} /><DetailSlot /></DetailPanelSlotProvider> : <HwTimePage params={{}} />;
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} savedViews={savedViews}>{children}{showSelectionChips && <AnalysisSelectionChipZone />}<RealChart.Provider value={realChart}>{realWorkspace ? <RealWorkspace.Provider value>{page}</RealWorkspace.Provider> : page}</RealChart.Provider></PlatformProvider></I18nProvider>);
  if (waitForData) await screen.findByTestId('hw-current', {}, { timeout: 5000 });
  await settle();
}

let restoreGeometry: (() => void) | undefined;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(1200); });
afterEach(() => { restoreGeometry?.(); });
