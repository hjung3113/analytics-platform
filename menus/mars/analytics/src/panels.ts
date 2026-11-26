import { EQUIPMENT_SELECTION_DIMENSION, type PanelDeclaration, type PanelInputs } from '@ap/contracts';
import { CYCLE_EQUIPMENT_SELECTION_KEY, cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, cycleTrendEndpoint } from './endpoints';
import { ANALYTICS_MESSAGES as M } from './messages';

const context = ['scopeId', 'time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'] as const;
/** `conditionSet` narrows the global Condition before every endpoint call (condition preset), so every panel reads it. */
const inputs = (keys: readonly string[] = []): PanelInputs => ({ context, page: ['conditionSet', ...keys].map(key => ({ key })) });

/** Inputs reflect actual endpoint parameters; emphasis and controls remain page-owned. */
export const CYCLE_EQUIPMENT_OUTPUT = { panelId: 'slow', key: CYCLE_EQUIPMENT_SELECTION_KEY } as const;

export const cycleTimePanels: readonly PanelDeclaration[] = [
  { id: 'summary', title: M.cycleTimeDrilldownCycleTimeSummary, queryInputs: inputs(), displayInputs: {}, outputs: [], grain: 'populationStat', endpoints: [cycleKpiEndpoint] },
  { id: 'trend', title: M.cycleTimeDrilldownCycleTimeTrend, queryInputs: inputs(['granularity']), displayInputs: {},
    outputs: [{ key: 'bucket', action: 'drill' }, { key: 'page', action: 'page' }], grain: 'bucketStat', endpoints: [cycleTrendEndpoint] },
  { id: 'distribution', title: M.cycleTimeDrilldownCycleTimeDistribution, queryInputs: { context, page: [{ key: 'conditionSet' }, { key: CYCLE_EQUIPMENT_OUTPUT.key, selection: 'filter' }] }, displayInputs: {},
    outputs: [{ key: 'bin', action: 'drill' }, { key: 'page', action: 'page' }], grain: 'binStat', endpoints: [cycleDistEndpoint] },
  { id: CYCLE_EQUIPMENT_OUTPUT.panelId, title: M.cycleTimeDrilldownSlowExecutions2, queryInputs: inputs(['granularity', 'percentile', 'sort', 'bucket', 'bin', 'page']), displayInputs: {},
    outputs: [{ key: 'sort', action: 'sort' }, { key: 'page', action: 'page' }, { key: 'bucket', action: 'drill' }, { key: 'bin', action: 'drill' }, { key: 'percentile', action: 'verdict' },
      { key: CYCLE_EQUIPMENT_OUTPUT.key, action: 'select', selection: { shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION, label: { ko: '설비', en: 'Equipment' }, objectKind: 'equipment' } }],
    grain: 'execution', endpoints: [cycleSlowPageEndpoint, cycleExportEndpoint, cycleKpiEndpoint] },
];
