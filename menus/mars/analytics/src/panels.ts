import type { PanelDeclaration, PanelInputs } from '@ap/contracts';
import { cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, cycleTrendEndpoint } from './endpoints';
import { ANALYTICS_MESSAGES as M } from './messages';

const context = ['scopeId', 'time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'] as const;
/** `conditionSet` narrows the global Condition before every endpoint call (condition preset), so every panel reads it. */
const inputs = (keys: readonly string[] = []): PanelInputs => ({ context, page: ['conditionSet', ...keys].map(key => ({ key })) });

/** Inputs reflect actual endpoint parameters; emphasis and controls remain page-owned. */
export const cycleTimePanels: readonly PanelDeclaration[] = [
  { id: 'summary', title: M.cycleTimeDrilldownCycleTimeSummary, queryInputs: inputs(), displayInputs: {}, outputs: [], grain: 'populationStat', endpoints: [cycleKpiEndpoint] },
  { id: 'trend', title: M.cycleTimeDrilldownCycleTimeTrend, queryInputs: inputs(['granularity']), displayInputs: {},
    outputs: [{ key: 'bucket', action: 'drill' }, { key: 'page', action: 'page' }], grain: 'bucketStat', endpoints: [cycleTrendEndpoint] },
  { id: 'distribution', title: M.cycleTimeDrilldownCycleTimeDistribution, queryInputs: inputs(), displayInputs: {},
    outputs: [{ key: 'bin', action: 'drill' }, { key: 'page', action: 'page' }], grain: 'binStat', endpoints: [cycleDistEndpoint] },
  { id: 'slow', title: M.cycleTimeDrilldownSlowExecutions2, queryInputs: inputs(['granularity', 'percentile', 'sort', 'bucket', 'bin', 'page']), displayInputs: {},
    outputs: [{ key: 'sort', action: 'sort' }, { key: 'page', action: 'page' }, { key: 'bucket', action: 'drill' }, { key: 'bin', action: 'drill' }, { key: 'percentile', action: 'verdict' }],
    grain: 'execution', endpoints: [cycleSlowPageEndpoint, cycleExportEndpoint, cycleKpiEndpoint] },
];
