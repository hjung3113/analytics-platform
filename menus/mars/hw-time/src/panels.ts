import type { PanelDeclaration } from '@ap/contracts';
import { hwTime, hwTimeOverview } from './endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_STEPPED_MESSAGES as S } from './messages';

/** HW Time adds two menu-only fields the SDK neither reads nor validates: `kind` (rendered form,
 * for the panel recipe) and `csvExport` (table CSV opt-in shared with the renderer).
 */
export type HwTimePanelDeclaration = PanelDeclaration & { readonly kind?: string; readonly csvExport?: boolean };

const common = ['scopeId', 'time', 'roomNames', 'condition', 'selection'] as const;
const checks = [{ key: 'module' }, { key: 'motion' }] as const;
const verdictDisplay = [...checks, { key: 'verdict' }] as const;
const runInputs = { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }, { key: 'trend' }] } as const;
// The workspace still uses the availability override for its compound trend target. Lending binds the individual parts.
const trendInputs = { ...runInputs, page: runInputs.page.map(input => input.key === 'trend' ? input : { ...input, required: true }) };
/** Run panels that read the same linked population as the scatter: drill plus verdict/date. */
const linkedRunInputs = { ...runInputs, page: [...runInputs.page, { key: 'verdict' }, { key: 'date' }] } as const;
const pointAvailability = { requires: [{ anyOf: ['drillModule', 'trend'] }], disabledReason: S.needsPoint } as const;

/** Menu-owned declarations shared by the manifest and workspace. */
export const panelDeclarations = {
  heatmap: { id: 'heatmap', kind: 'heatmap', title: S.heatmap,
    queryInputs: { context: common, page: [{ key: 'moduleType', required: true }] }, displayInputs: { page: [...verdictDisplay, { key: 'drillMotion' }] },
    outputs: [{ key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix],
    availability: { requires: [{ anyOf: ['moduleType'] }], disabledReason: S.needsType }, pieces: ['AnalysisChart', 'QueryView'] },
  trend: { id: 'trend', kind: 'line', title: S.trend, queryInputs: trendInputs, displayInputs: { page: [...checks, { key: 'date' }] }, outputs: [],
    grain: 'dailyStat', endpoints: [hwTimeOverview.runs], availability: pointAvailability, pieces: ['AnalysisChartFrame', 'AnalysisChart', 'FilterLine', 'QueryView'] },
  scatter: { id: 'scatter', kind: 'scatter', title: S.scatter, queryInputs: linkedRunInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'run', endpoints: [hwTimeOverview.runs], availability: pointAvailability, pieces: ['AnalysisChart', 'FilterLine', 'QueryView'] },
  distribution: { id: 'distribution', kind: 'histogram', title: S.distributionCatalog, queryInputs: linkedRunInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'run', endpoints: [hwTimeOverview.distribution], availability: pointAvailability, pieces: ['AnalysisChart', 'QueryView'] },
  motionTable: { id: 'motionTable', kind: 'table', csvExport: false, title: S.motionTable,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule', required: true }] }, displayInputs: { page: [{ key: 'motion' }] },
    outputs: [{ key: 'drillMotion', action: 'drill' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }],
    grain: 'motionStat', endpoints: [hwTimeOverview.motionStats],
    availability: { requires: [{ anyOf: ['drillModule'] }], disabledReason: S.needsModule }, pieces: ['PlatformDataTable', 'RowAction', 'QueryView'] },
  moduleMotions: { id: 'moduleMotions', kind: 'bar-horizontal', title: S.moduleMotions,
    queryInputs: { context: common, page: [{ key: 'moduleType' }] },
    displayInputs: { page: [...verdictDisplay, { key: 'drillModule' }, { key: 'row' }, { key: 'barsSort' }, { key: 'barsGroup' }, { key: 'barsMinMax' }, { key: 'align' }] },
    outputs: [{ key: 'trend', action: 'drill' }, { key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix],
    availability: { requires: [{ anyOf: ['step4'] }], disabledReason: S.needsStep4 }, pieces: ['AnalysisChartFrame', 'PanelOptions', 'PanelOptionChips', 'QueryView'] },
  table: { id: 'table', kind: 'table', csvExport: true, title: S.table,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'page' }, { key: 'sort' }, { key: 'focus' }] }, displayInputs: { page: checks },
    outputs: [{ key: 'moduleType', action: 'drill' }, { key: 'drillMotion', action: 'drill' }, { key: 'drillModule', action: 'drill' },
      { key: 'row', action: 'highlight' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }, { key: 'page', action: 'page' }, { key: 'sort', action: 'sort' }],
    grain: 'rootAggregate', endpoints: [hwTime.levelRows, hwTime.tableRows, hwTime.exportRows, hwTime.trend], pieces: ['PlatformDataTable', 'RowAction', 'DetailDrawer', 'QueryView', 'StateMessage'] },
  donut: { id: 'donut', kind: 'donut', title: N.donut, queryInputs: { context: common, page: [{ key: 'moduleType' }] }, displayInputs: { page: [...checks, { key: 'verdict' }] },
    outputs: [{ key: 'verdict', action: 'verdict' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix], pieces: ['AnalysisChart:donut', 'QueryView'] },
  pareto: { id: 'pareto', kind: 'pareto', title: N.pareto, queryInputs: { context: common, page: [{ key: 'moduleType' }] }, displayInputs: { page: checks },
    outputs: [], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix], pieces: ['AnalysisChart:pareto', 'QueryView'] },
  equipmentDays: { id: 'equipmentDays', kind: 'heatmap', title: N.equipmentDays,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }] }, displayInputs: { page: [{ key: 'verdict' }] },
    outputs: [{ key: 'date', action: 'date' }], grain: 'equipmentDay', endpoints: [hwTimeOverview.equipmentDays], pieces: ['AnalysisChart:heatmap', 'QueryView'] },
  boundHistory: { id: 'boundHistory', kind: 'audit', title: N.boundHistory,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }] }, displayInputs: {},
    outputs: [], grain: 'auditEvent', endpoints: [hwTimeOverview.boundHistory], pieces: ['AuditTimeline', 'QueryView'] },
} as const satisfies Readonly<Record<string, HwTimePanelDeclaration>>;
