/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { stageDatasetBaseline, stageDatasetSuiteRun } from './datasets';
const datasetSamples: Record<string, () => Record<string, unknown>> = {
    baselineApprove: () => ({ id: stageDatasetBaseline(), reason: '적합성 승인' }),
    suiteRun: () => ({ suiteId: stageDatasetSuiteRun(), idempotencyKey: crypto.randomUUID() }),
    reviewLabelAdd: () => ({ suiteRunId: '14810000-0000-4000-8000-000000000401', datasetRevisionId: '14810000-0000-4000-8000-000000000101', ruleId: 'R-01', label: 'needs_review', reason: '적합성 검토' }),
  };

export const logRulesWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...datasetSamples }).map(([name, sample]) => [`logDataset.${name}`, sample]),
);
