import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import { comparisonEndpoints } from './comparison-endpoints.js';
import { baselineActions } from './baseline-actions.js';
import { baselineEndpoints } from './baseline-endpoints.js';
import { datasetActions } from './dataset-actions.js';
import { datasetEndpoints } from './dataset-endpoints.js';
import { reviewLabelActions } from './review-label-actions.js';
import { suiteActions } from './suite-actions.js';
import { suiteEndpoints } from './suite-endpoints.js';
import type { LogDatasetsDeps } from './deps.js';

export function logDatasetsContribution(deps: LogDatasetsDeps): MenuDispatchContribution {
  return {
    endpoints: [...datasetEndpoints(deps), ...baselineEndpoints(deps), ...suiteEndpoints(deps), ...comparisonEndpoints(deps)],
    actions: [...datasetActions(deps), ...baselineActions(deps), ...suiteActions(deps), ...reviewLabelActions(deps)],
  };
}

export type { LogDatasetsDeps } from './deps.js';
export { calculateAvailability } from './domain/availability.js';
export type { Availability, FileCheckState } from './domain/availability.js';
export { SCENARIO_TAGS } from './domain/scenario-tags.js';
export type { ScenarioTag } from './domain/scenario-tags.js';
export { DATASET_MANAGE_MENU_PERMISSION, DATASET_MANAGE_PERMISSION } from './dataset-actions.js';
export { BASELINE_APPROVE_MENU_PERMISSION, BASELINE_APPROVE_PERMISSION } from './baseline-actions.js';
export { SUITE_RUN_LIMIT_CODE, SUITE_RUN_MENU_PERMISSION, SUITE_RUN_PERMISSION } from './suite-actions.js';
export { LOG_DATASETS_MENU_ID } from './menu.js';
export type { DatasetSourceRead, FileHashReader } from './source-check.js';
