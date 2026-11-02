// The four paged catalog reads of the log knowledge hub as menu-dispatch declarations (#1193,
// design v0.6 §7.1, ADR-0107). Read right: every active workspace session (`platform:view`, the rule the
// Home menu uses). The workspace is the session actor's, never a param. A value the endpoint cannot
// honour is a `validate` refusal (`error`), not an empty page.

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
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
export { LOG_KNOWLEDGE_MENU_ID };
import {
  type ListQuery,
  MODEL_SORT_IDS,
  PROCESS_SORT_IDS,
  SOFTWARE_SORT_IDS,
  type StatusFilter,
  VENDOR_SORT_IDS,
  listModels,
  listProcesses,
  listSoftwareVersions,
  listVendors,
} from './repositories/catalog-read.js';

export const PAGE_SIZE_MAX = 200;
export const Q_MAX = 200;
const SORT_KEYS_MAX = 3;
const STATUSES: readonly StatusFilter[] = ['active', 'inactive', 'all'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LogKnowledgeDeps {
  db: Db;
  checkService: CheckService;
}

type Parsed = { ok: true; value: ListQuery & Record<string, unknown> } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Parses the common list params; an absent key takes its default, an explicit null is a refusal (except q and the id filters, where null means no filter). `ids` is the endpoint's own optional uuid filters. */
export function parseListParams(
  params: Record<string, unknown>,
  sortIds: readonly string[],
  idFilters: readonly string[],
): Parsed {
  const q = params.q ?? null;
  if (q !== null && (typeof q !== 'string' || q.length > Q_MAX || unsafeText(q))) {
    return fail(`q must be a string of at most ${Q_MAX} characters or null`);
  }
  const status = params.status === undefined ? 'active' : params.status;
  if (!STATUSES.includes(status as StatusFilter)) return fail('status must be active, inactive or all');
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
  const filters: Record<string, string | null> = {};
  for (const key of idFilters) {
    const value = params[key] ?? null;
    if (value !== null && (typeof value !== 'string' || !UUID.test(value))) {
      return fail(`${key} must be a uuid string or null`);
    }
    filters[key] = value;
  }
  return {
    ok: true,
    value: {
      workspaceId: '',
      q: q as string | null,
      status: status as StatusFilter,
      page,
      pageSize,
      sorting: sorts.length > 0 ? sorts : [{ id: sortIds[0] as string, desc: false }],
      ...filters,
    },
  };
}

function declare(
  deps: LogKnowledgeDeps,
  name: string,
  extraKeys: readonly string[],
  sortIds: readonly string[],
  run: (args: EndpointHandlerArgs, query: ListQuery & Record<string, unknown>) => Promise<{ rows: unknown[]; total: number }>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logKnowledge.${name}`,
      menuId: LOG_KNOWLEDGE_MENU_ID,
      paramKeys: ['q', 'status', 'page', 'pageSize', 'sorting', ...extraKeys],
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) =>
      holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const parsed = parseListParams(params, sortIds, extraKeys);
      return parsed.ok ? { ok: true } : parsed;
    },
    async handle(args) {
      const parsed = parseListParams(args.params, sortIds, extraKeys);
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
      declare(deps, 'vendors', [], VENDOR_SORT_IDS, (_a, q) => listVendors(deps.db, q)),
      declare(deps, 'processes', [], PROCESS_SORT_IDS, (_a, q) => listProcesses(deps.db, q)),
      declare(deps, 'models', ['vendorId', 'processId'], MODEL_SORT_IDS, (_a, q) =>
        listModels(deps.db, { ...q, vendorId: q.vendorId as string | null, processId: q.processId as string | null }),
      ),
      declare(deps, 'softwareVersions', ['modelId'], SOFTWARE_SORT_IDS, (_a, q) =>
        listSoftwareVersions(deps.db, { ...q, modelId: q.modelId as string | null }),
      ),
    ],
  };
}
