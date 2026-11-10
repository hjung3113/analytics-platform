import { withReplayAccess } from './replay-access.js';
// The four paged catalog reads of the log knowledge hub as menu-dispatch declarations (#1193,
// design v0.6 §7.1, ADR-0107). Read right: every active workspace session (`platform:view`, the rule the
// Home menu uses). The workspace is the session actor's, never a param. A value the endpoint cannot
// honour (an unknown filter field or operator, a wrong value shape, a duplicate field) is a `validate`
// refusal (`error`), not an empty page. Filters are the table's `filters` param (ADR-0105); with no `active`
// condition every row answers (the client pins its own default).

import type {
  EndpointHandlerArgs,
  MenuDispatchContribution,
  MenuEndpointDeclaration,
  ParamsJudgment,
} from '../menu-dispatch/types.js';
import type { LogKnowledgeDeps } from './deps.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { CATALOG_MENU_PERMISSION, CATALOG_PERMISSION, catalogActions } from './catalog-actions.js';
import type { Viewer } from './repositories/access-visibility.js';
import { CATALOG_FILTER_SPECS, type CatalogEndpointName } from './domain/catalog-filters.js';
import { PAGE_SIZE_MAX, Q_MAX, parseListParams } from '../../lib/list-params/list-params.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { ITEM_MENU_PERMISSION, ITEM_PERMISSION, itemActions } from './item-actions.js';
import { SPEC_MENU_PERMISSION, SPEC_PERMISSION, specActions } from './spec-actions.js';
import { specChangeActions } from './spec-change-actions.js';
import { conceptActions } from './concept-actions.js';
import { conceptEndpoints } from './concept-endpoints.js';
import { subjectEndpoints } from './subject-endpoints.js';
import { itemEndpoints } from './item-endpoints.js';
import { topViewEndpoints } from './topview-endpoints.js';
import { topViewActions } from './topview-actions.js';
import { DRAFT_MENU_PERMISSION, DRAFT_PERMISSION, draftActions } from './draft-actions.js';
import { reviewActions } from './review-actions.js';
import { draftEndpoints } from './draft-endpoints.js';
import { specEndpoints } from './spec-endpoints.js';
import { specCoverageEndpoint } from './spec-coverage-endpoint.js';
import { importActions } from './import-actions.js';
import { importIntakeActions } from './import-intake-actions.js';
import { importEndpoints } from './import-endpoints.js';
import { ACCESS_MENU_PERMISSION, ACCESS_PERMISSION, accessActions } from './access-actions.js';
import { accessEndpoints } from './access-endpoints.js';
import { searchEndpoints } from './search-endpoints.js';
import { searchIndexActions, searchIndexEndpoints } from './search-index-ops.js';
export { LOG_KNOWLEDGE_MENU_ID };
import {
  type ListQuery,
  MODEL_SORT_IDS,
  PROCESS_SORT_IDS,
  SOFTWARE_SORT_IDS,
  VENDOR_SORT_IDS,
  listModels,
  listProcesses,
  listSoftwareVersions,
  listVendors,
} from './repositories/catalog-read.js';

export { PAGE_SIZE_MAX, Q_MAX, parseListParams };
export type { LogKnowledgeDeps };


function declare(
  deps: LogKnowledgeDeps,
  name: CatalogEndpointName,
  sortIds: readonly string[],
  run: (args: EndpointHandlerArgs, query: ListQuery, viewer: Viewer) => Promise<{ rows: unknown[]; total: number }>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logKnowledge.${name}`,
      menuId: LOG_KNOWLEDGE_MENU_ID,
      paramKeys: ['q', 'page', 'pageSize', 'sorting', 'filters'],
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) =>
      holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const parsed = parseListParams(params, sortIds, CATALOG_FILTER_SPECS[name]);
      return parsed.ok ? { ok: true } : parsed;
    },
    async handle(args) {
      const parsed = parseListParams(args.params, sortIds, CATALOG_FILTER_SPECS[name]);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const query = { ...parsed.value, workspaceId: args.actor.workspace_id };
      const page = await run(args, query, { workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id });
      // A page with no rows is still a page ({ rows: [], total: 0 }): the table needs `total`, so it is `ok`.
      return { outcome: 'ok', data: page };
    },
  };
}

export function logKnowledgeContribution(deps: LogKnowledgeDeps): MenuDispatchContribution {
  return {
    actions: [
      ...catalogActions({ checkService: deps.checkService }),
      ...itemActions({ checkService: deps.checkService }),
      ...draftActions({ checkService: deps.checkService }),
      ...reviewActions({ checkService: deps.checkService }),
      ...specActions({ checkService: deps.checkService }),
      ...specChangeActions({ checkService: deps.checkService }),
      ...conceptActions({ checkService: deps.checkService }),
      ...importActions({ checkService: deps.checkService }),
      ...importIntakeActions(deps),
      ...accessActions({ checkService: deps.checkService }),
      ...searchIndexActions({ checkService: deps.checkService }),
      ...topViewActions(deps.eqvRead ? { checkService: deps.checkService, eqvRead: deps.eqvRead } : { checkService: deps.checkService }),
    ].map(withReplayAccess),
    permissions: [
      { permission: CATALOG_MENU_PERMISSION, capability: CATALOG_PERMISSION },
      { permission: ITEM_MENU_PERMISSION, capability: ITEM_PERMISSION },
      { permission: SPEC_MENU_PERMISSION, capability: SPEC_PERMISSION },
      { permission: DRAFT_MENU_PERMISSION, capability: DRAFT_PERMISSION },
      { permission: ACCESS_MENU_PERMISSION, capability: ACCESS_PERMISSION },
    ],
    endpoints: [
      declare(deps, 'vendors', VENDOR_SORT_IDS, (_a, q, v) => listVendors(deps.db, q, v)),
      declare(deps, 'processes', PROCESS_SORT_IDS, (_a, q, v) => listProcesses(deps.db, q, v)),
      declare(deps, 'models', MODEL_SORT_IDS, (_a, q, v) => listModels(deps.db, q, v)),
      declare(deps, 'softwareVersions', SOFTWARE_SORT_IDS, (_a, q, v) => listSoftwareVersions(deps.db, q, v)),
      ...itemEndpoints(deps),
      ...topViewEndpoints(deps),
      ...draftEndpoints(deps),
      ...specEndpoints(deps),
      specCoverageEndpoint(deps),
      ...conceptEndpoints(deps),
      ...subjectEndpoints(deps),
      ...importEndpoints(deps),
      ...accessEndpoints(deps),
      ...searchIndexEndpoints(deps),
      ...searchEndpoints(deps),
    ],
  };
}
