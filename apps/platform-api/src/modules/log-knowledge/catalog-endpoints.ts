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
import { catalogActions } from './catalog-actions.js';
import { CATALOG_FILTER_SPECS, type CatalogEndpointName } from './domain/catalog-filters.js';
import { PAGE_SIZE_MAX, Q_MAX, parseListParams } from './domain/list-params.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { itemActions } from './item-actions.js';
import { specActions } from './spec-actions.js';
import { itemEndpoints } from './item-endpoints.js';
import { specEndpoints } from './spec-endpoints.js';
import { importActions } from './import-actions.js';
import { importIntakeActions } from './import-intake-actions.js';
import { importEndpoints } from './import-endpoints.js';
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
  run: (args: EndpointHandlerArgs, query: ListQuery) => Promise<{ rows: unknown[]; total: number }>,
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
      const page = await run(args, query);
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
      ...specActions({ checkService: deps.checkService }),
      ...importActions({ checkService: deps.checkService }),
      ...importIntakeActions(deps),
    ],
    endpoints: [
      declare(deps, 'vendors', VENDOR_SORT_IDS, (_a, q) => listVendors(deps.db, q)),
      declare(deps, 'processes', PROCESS_SORT_IDS, (_a, q) => listProcesses(deps.db, q)),
      declare(deps, 'models', MODEL_SORT_IDS, (_a, q) => listModels(deps.db, q)),
      declare(deps, 'softwareVersions', SOFTWARE_SORT_IDS, (_a, q) => listSoftwareVersions(deps.db, q)),
      ...itemEndpoints(deps),
      ...specEndpoints(deps),
      ...importEndpoints(deps),
    ],
  };
}
