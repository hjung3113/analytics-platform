import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import type { LogLifecycleDeps } from './deps.js';
import { lifecycleEndpoints } from './lifecycle-endpoints.js';
import { projectActions } from './project-actions.js';
import { roundActions } from './round-actions.js';

export function logLifecycleContribution(deps: LogLifecycleDeps): MenuDispatchContribution {
  return {
    endpoints: lifecycleEndpoints(deps),
    actions: [...projectActions(deps), ...roundActions(deps)],
  };
}

export type { LogLifecycleDeps } from './deps.js';
export { sampleManifestDigest, parseSampleSet } from './domain/sample-set.js';
export type { SampleSet } from './domain/sample-set.js';
export { LOG_MODELS_MENU_ID } from './menu.js';
export { LIFECYCLE_PROJECT_MENU_PERMISSION, LIFECYCLE_PROJECT_PERMISSION } from './project-actions.js';
export { LIFECYCLE_ROUND_MENU_PERMISSION, LIFECYCLE_ROUND_PERMISSION } from './round-actions.js';
