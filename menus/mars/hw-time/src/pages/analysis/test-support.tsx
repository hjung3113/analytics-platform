import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { LayoutDashboard } from 'lucide-react';
import { HW_TIME_MODULE_TYPES, type HwTimeMatrix, type HwTimeMotionStats, type HwTimeRuns } from '../../endpoints';
import { manifests } from '../../index';

// Canvas is unavailable in jsdom. Keep queries, filter, URL, table and status UI real; expose the public chart callbacks and declarations.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  return { ...actual,
    PanelWorkspace: (p: import('@ap/components').PanelWorkspaceProps) => <div data-testid="workspace" data-config={JSON.stringify({ ids: p.panels.map(panel => panel.id), primary: p.panels.find(panel => panel.primary)?.id, preset: p.presets[0], reveal: p.revealRequest })}>
      {p.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`}>{panel.render()}</section>)}
    </div>,
    AnalysisChart: (p: import('@ap/components').AnalysisChartProps) => <section aria-label={String(p.title)}>
      <pre data-testid={p.chartId}>{JSON.stringify(p.spec, (_key, value: unknown) => value instanceof Map ? [...value] : value)}</pre>
      {p.spec.kind === 'heatmap' && p.spec.cells.map(cell => <button key={`${cell.x}/${cell.y}`} onClick={() => {
        if (p.spec.kind === 'heatmap') p.spec.onCellClick?.(cell.x, cell.y);
      }}>{`focus ${cell.y} ${cell.x}`}</button>)}
      {p.spec.kind === 'heatmap' && p.spec.cells.map(cell => <button key={`activate/${cell.x}/${cell.y}`} onClick={() => {
        if (p.spec.kind === 'heatmap') p.spec.cellActivation?.onActivate(cell.x, cell.y);
      }}>{`activate ${cell.y} ${cell.x}`}</button>)}
    </section>,
    AnalysisChartFrame: (p: import('@ap/components').AnalysisChartFrameProps) => <section aria-label={String(p.title)}>
      <pre data-testid={p.chartId}>{JSON.stringify({ series: p.series, activeCategory: p.activeCategory, revealActive: p.revealActive, rowPitch: p.rowPitch, startAlign: p.startAlign, emphasisFocus: p.emphasisFocus,
        rowGroups: p.rowGroups && { header: p.rowGroups.header, byCategory: [...p.rowGroups.byCategory] },
        bounds: p.bounds && [...p.bounds],
        statuses: p.series.flatMap(s => s.points.flatMap(([x, value]) => { const st = p.pointStatus?.({ x, value, seriesId: s.id }); return st ? [`${s.id}@${x}:${st.tone}`] : []; })) })}</pre>
      {p.series[0]?.points.map(([x, value]) => <button key={x} onClick={() => p.pointActivation?.onActivate({ x, value, seriesId: p.series[0]!.id })}>{`drill ${x}`}</button>)}
    </section>,
  };
});

export const requests: MenuQuery[] = [];
const normal = (value: number) => ({ value, lower: 1, upper: 7, status: 'normal' as const });
export const fixtureMatrix = (typeId: string): HwTimeMatrix => {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === typeId)!;
  const equipment = ['EQ-001', 'EQ-002'];
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
    return { id: `run-${index}`, equipmentId: `EQ-00${index + 1}`, moduleId: 'PM1', motion: 'Chuck', at: '2026-09-19T10:00:00', seconds, judgement,
      motions: Object.fromEntries(HW_TIME_MODULE_TYPES[0].motions.map(motion => [motion, judgement])), module: { ...judgement, lower: null, upper: null } };
  }), daily: [], shown: 2, total: 576,
  bounds: ['EQ-001', 'EQ-002'].map(equipmentId => ({ equipmentId, moduleId: 'PM1', motion: 'Chuck', lower: 3, upper: 4 })),
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
export async function renderOverview(search = '', respond = answer, { waitForData = true } = {}) {
  const { default: HwTimePage } = await import('../../HwTimePage');
  const adapter = testAdapter({ session: () => session, menuQuery: async request => { requests.push(request); return respond(request); } });
  window.history.replaceState(null, '', `/mars/hw-time?view=overview&v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);
  if (waitForData) await screen.findByTestId('hw-overview-matrix', {}, { timeout: 5000 });
  await settle();
}

let restoreGeometry: (() => void) | undefined;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(1200); });
afterEach(() => { restoreGeometry?.(); });
