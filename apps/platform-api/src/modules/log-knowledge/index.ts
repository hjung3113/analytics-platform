export { logKnowledgeContribution, type LogKnowledgeDeps } from './catalog-endpoints.js';
export { toCodeKey } from './domain/code-key.js';
export { LOG_KNOWLEDGE_ROUTE_PREFIX, importRoutes } from './import-routes.js';
export { createApplyRunnerPool } from './import-admission.js';
export { IMPORT_APPLY_BUDGET_MS } from './import-apply-service.js';
export type { ImportApplyHooks } from './import-apply-service.js';
export { knowledgeLookup } from './knowledge-lookup.js';
export type {
  EffectiveRequirement,
  EffectiveRequirements,
  KnowledgeLookup,
  KnowledgeModelOption,
  KnowledgeModelRef,
  KnowledgeSoftwareOption,
  KnowledgeSoftwareRef,
  SpecPin,
} from './knowledge-lookup.js';
export { draftEvidenceIntake } from './draft-evidence-intake.js';
export type {
  DraftEvidenceAppendInput,
  DraftEvidenceCreateInput,
  DraftEvidenceIntake,
  DraftEvidenceIntakeDeps,
  DraftEvidenceResult,
} from './draft-evidence-intake.js';
export type { DraftEvidenceRefInput } from './domain/evidence-intake.js';

export { lockOwnerAccess, viewerOf, ref, visibleModelSql, visibleSoftwareSql } from './repositories/access-visibility.js';
export type { Viewer } from './repositories/access-visibility.js';
export { registerSearchIndexJobs, SEARCH_BACKFILL_QUEUE, SEARCH_DRAIN_QUEUE } from './search-index-jobs.js';
