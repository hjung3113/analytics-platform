// Read side of the catalog import staging (#1195 a): `logKnowledge.importDetail`, one job with a page of its rows.
// Menu right `platform:view` like the other reads; the handler also requires `knowledge.catalog.import`
// (`forbidden` envelope of the query engine otherwise). The outcome set has no `not_found`: an unknown job and
// another workspace's job answer the same `error` with `data: null` and message `not_found`.

import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { importAuthorizer, UUID_PATTERN } from './import-actions.js';
import type { LogKnowledgeDeps } from './deps.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import type { CatalogFilterFieldSpec } from './domain/catalog-filters.js';
import { parseListParams } from './domain/list-params.js';
import { IMPORT_PLAN_STATES } from './domain/import-plan.js';
import { getJob, listRows } from './repositories/import-repo.js';

export const IMPORT_ROW_SORT_IDS = ['rowNo'] as const;
export const IMPORT_ROW_FILTER_SPECS = {
  planState: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: IMPORT_PLAN_STATES },
} as const satisfies Record<string, CatalogFilterFieldSpec>;

const PARAM_KEYS = ['jobId', 'page', 'pageSize', 'sorting', 'filters'] as const;

function judge(params: Record<string, unknown>) {
  if (typeof params.jobId !== 'string' || !UUID_PATTERN.test(params.jobId)) {
    return { ok: false as const, message: 'jobId must be a uuid string' };
  }
  const rest = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'jobId'));
  const parsed = parseListParams(rest, IMPORT_ROW_SORT_IDS, IMPORT_ROW_FILTER_SPECS);
  return parsed.ok ? { ok: true as const, jobId: params.jobId, query: parsed.value } : parsed;
}

export function importEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  const authorizeImport = importAuthorizer(deps.checkService);
  return [
    {
      spec: {
        id: 'logKnowledge.importDetail',
        menuId: LOG_KNOWLEDGE_MENU_ID,
        paramKeys: PARAM_KEYS,
        permission: 'platform:view',
        requiresScope: false,
        context: {},
        mergeTimeDomain: false,
      },
      authorize: (actor, tx) =>
        holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
      validate(params): ParamsJudgment {
        const judged = judge(params);
        return judged.ok ? { ok: true } : judged;
      },
      async handle({ actor, params }) {
        const judged = judge(params);
        if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
        if (!(await authorizeImport(actor, deps.db))) {
          return { outcome: 'forbidden', data: null, message: 'No permission knowledge.catalog.import' };
        }
        const ws = actor.workspace_id;
        const job = await getJob(deps.db, ws, judged.jobId);
        if (!job) return { outcome: 'error', data: null, message: 'not_found' };
        const filter = judged.query.conditions.planState;
        const page = await listRows(deps.db, ws, job.id, {
          page: judged.query.page,
          pageSize: judged.query.pageSize,
          planStates: filter && (filter.op === 'in' || filter.op === 'notIn') ? { op: filter.op, values: filter.values } : null,
          desc: judged.query.sorting[0]?.desc ?? false,
        });
        return { outcome: 'ok', data: { job, rows: page.rows, total: page.total } };
      },
    },
  ];
}
