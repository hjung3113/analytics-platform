import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import { datasetActions } from './dataset-actions.js';
import { datasetEndpoints } from './dataset-endpoints.js';
import type { LogDatasetsDeps } from './deps.js';

export function logDatasetsContribution(deps: LogDatasetsDeps): MenuDispatchContribution {
  return {
    endpoints: datasetEndpoints(deps),
    actions: datasetActions(deps),
  };
}

export type { LogDatasetsDeps } from './deps.js';
export { calculateAvailability } from './domain/availability.js';
export type { Availability, FileCheckState } from './domain/availability.js';
export { SCENARIO_TAGS } from './domain/scenario-tags.js';
export type { ScenarioTag } from './domain/scenario-tags.js';
export { DATASET_MANAGE_MENU_PERMISSION, DATASET_MANAGE_PERMISSION } from './dataset-actions.js';
export { LOG_DATASETS_MENU_ID } from './menu.js';
export type { DatasetSourceRead, FileHashReader } from './source-check.js';
