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
  KnowledgeModelRef,
  KnowledgeSoftwareRef,
  SpecPin,
} from './knowledge-lookup.js';
