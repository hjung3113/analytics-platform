import { createDecisionService, type DecisionServiceDeps } from './decision-service.js';
import { createGrantAdminService } from './grant-admin-service.js';
import { createRequestService } from './request-service.js';
import { createSelectedReadService } from './selected-read-service.js';

/** Module assembly seam: boot wiring chooses the sole Scope source and supplies its catalog. */
export function createPermissionServices(deps: DecisionServiceDeps) {
  return {
    requestService: createRequestService(deps),
    decisionService: createDecisionService(deps),
    grantAdminService: createGrantAdminService(deps),
    selectedReadService: createSelectedReadService(deps),
  };
}
