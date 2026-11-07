import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import type { LogLifecycleDeps } from './deps.js';
import { lifecycleEndpoints } from './lifecycle-endpoints.js';
import { projectActions } from './project-actions.js';
import { requestActions } from './request-actions.js';
import { requestEndpoints } from './request-endpoints.js';
import { roundActions } from './round-actions.js';

export function logLifecycleContribution(deps: LogLifecycleDeps): MenuDispatchContribution {
  return {
    endpoints: [...lifecycleEndpoints(deps), ...requestEndpoints(deps)],
    actions: [...projectActions(deps), ...roundActions(deps), ...requestActions(deps)],
  };
}

export { roundAttachmentParent } from './attachment-parent.js';
export type { LogLifecycleDeps } from './deps.js';
export { sampleManifestDigest, parseSampleSet } from './domain/sample-set.js';
export type { SampleSet } from './domain/sample-set.js';
export { LOG_MODELS_MENU_ID, LOG_VALIDATION_REQUESTS_MENU_ID } from './menu.js';
export { VALIDATION_QUEUE_ROUTE_PREFIX, VALIDATION_WORKER_SCOPE, workerRoutes } from './worker-routes.js';
export { createQueueService } from './queue-service.js';
export type { QueueService } from './queue-service.js';
export { LIFECYCLE_PROJECT_MENU_PERMISSION, LIFECYCLE_PROJECT_PERMISSION } from './project-actions.js';
export { LIFECYCLE_ROUND_MENU_PERMISSION, LIFECYCLE_ROUND_PERMISSION } from './round-actions.js';
export { readRoundEvidenceLinks, type RoundEvidenceLink } from './round-evidence-links.js';
export { EXCERPT_PURGE_CRON, EXCERPT_PURGE_QUEUE, purgeExpiredExcerpts, registerExcerptPurge } from './excerpt-purge-job.js';
