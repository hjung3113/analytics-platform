// The four paged catalog reads of the log knowledge hub as menu-dispatch declarations (#1193,
// design v0.6 §7.1, ADR-0107). Read right: every active workspace session (`platform:view`, the rule the
// Home menu uses). The workspace is the session actor's, never a param. A value the endpoint cannot
// honour (an unknown filter field or operator, a wrong value shape, a duplicate field) is a `validate`
// refusal (`error`), not an empty page. Filters are the table's `filters` param (ADR-0105); with no `active`
// condition every row answers (the client pins its own default).

import type { Db } from '../../db/client.js';
import type {
  EndpointHandlerArgs,
  MenuDispatchContribution,
  MenuEndpointDeclaration,
  ParamsJudgment,
} from '../menu-dispatch/types.js';
import type { CheckService } from '../permissions/check-service.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { unsafeText } from '../platform-port/text-safety.js';
import { catalogActions } from './catalog-actions.js';
import {
  CATALOG_FILTER_SPECS,
  type CatalogEndpointName,
  type CatalogFilterFieldSpec,
  parseCatalogFilters,
} from './domain/catalog-filters.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
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

export const PAGE_SIZE_MAX = 200;
export const Q_MAX = 200;
const SORT_KEYS_MAX = 3;

export interface LogKnowledgeDeps {
  db: Db;
  checkService: CheckService;
}

type Parsed = { ok: true; value: ListQuery } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Parses the common list params; an absent key takes its default, an explicit null is a refusal (except q, where null means no search). `filterSpecs` are the endpoint's filter fields (ADR-0105); no `filters` = every row. */
export function parseListParams(
  params: Record<string, unknown>,
  sortIds: readonly string[],
  filterSpecs: Readonly<Record<string, CatalogFilterFieldSpec>>,
): Parsed {
  const q = params.q ?? null;
  if (q !== null && (typeof q !== 'string' || q.length > Q_MAX || unsafeText(q))) {
    return fail(`q must be a string of at most ${Q_MAX} characters or null`);
  }
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return fail('page must be a non-negative integer (0-based)');
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return fail(`pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`);
  }
  const sorting = params.sorting === undefined ? [] : params.sorting;
  if (!Array.isArray(sorting) || sorting.length > SORT_KEYS_MAX) {
    return fail(`sorting must be a list of at most ${SORT_KEYS_MAX} sort keys`);
  }
  const seen = new Set<string>();
  const sorts: { id: string; desc: boolean }[] = [];
  for (const entry of sorting as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return fail('a sort key must be an object');
    const { id, desc, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length > 0 || typeof id !== 'string' || typeof desc !== 'boolean') {
      return fail('a sort key is { id: string, desc: boolean }');
    }
    if (!sortIds.includes(id)) return fail(`sorting by ${id} is not supported`);
    if (seen.has(id)) return fail(`sorting by ${id} twice`);
    seen.add(id);
    sorts.push({ id, desc });
  }
  const filters = parseCatalogFilters(params.filters, filterSpecs);
  if (!filters.ok) return filters;
  return {
    ok: true,
    value: {
      workspaceId: '',
      q: q as string | null,
      conditions: filters.value,
      page,
      pageSize,
      sorting: sorts.length > 0 ? sorts : [{ id: sortIds[0] as string, desc: false }],
    },
  };
}

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
    actions: catalogActions({ checkService: deps.checkService }),
    endpoints: [
      declare(deps, 'vendors', VENDOR_SORT_IDS, (_a, q) => listVendors(deps.db, q)),
      declare(deps, 'processes', PROCESS_SORT_IDS, (_a, q) => listProcesses(deps.db, q)),
      declare(deps, 'models', MODEL_SORT_IDS, (_a, q) => listModels(deps.db, q)),
      declare(deps, 'softwareVersions', SOFTWARE_SORT_IDS, (_a, q) => listSoftwareVersions(deps.db, q)),
    ],
  };
}
