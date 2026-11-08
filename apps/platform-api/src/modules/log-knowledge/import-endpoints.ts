// Read side of the catalog import staging (#1195 a): `logKnowledge.importDetail`, one job with a page of its rows.
// Menu right `platform:view` like the other reads; the handler also requires `knowledge.catalog.import`
// (`forbidden` envelope of the query engine otherwise). The outcome set has no `not_found`: an unknown job and
// another workspace's job answer the same `error` with `data: null` and message `not_found`.

import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { importAuthorizer, UUID_PATTERN } from './import-actions.js';
import type { LogKnowledgeDeps } from './deps.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import type { CatalogFilterFieldSpec } from '../../lib/list-params/catalog-filters.js';
import { parseListParams } from '../../lib/list-params/list-params.js';
import { APPLY_STATUSES } from './domain/import-apply.js';
import { IMPORT_PLAN_STATES } from './domain/import-plan.js';
import { applyCounts } from './repositories/import-apply-repo.js';
import { type ImportJob, getJob, listRows } from './repositories/import-repo.js';
import { visibleModelIds, visibleSoftwareIds } from './repositories/access-visibility.js';

export const IMPORT_ROW_SORT_IDS = ['rowNo'] as const;
export const IMPORT_ROW_FILTER_SPECS = {
  planState: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: IMPORT_PLAN_STATES },
  applyStatus: { ops: ['in', 'notIn'], multiple: true, cell: 'scalar', values: 'enum', allowed: APPLY_STATUSES },
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

/** The job as the screen sees it: no seal hash, no internal generation. */
const publicJob = ({ validationGeneration: _g, applyPass: _p, sealedPlanHash: _s, ...rest }: ImportJob) => rest;

async function hideRestrictedTargets<R extends { targetId: string | null; targetVersion: number | null; mapTargetId: string | null; resultTargetId: string | null }>(
  db: LogKnowledgeDeps['db'],
  viewer: { workspaceId: string; actorId: string },
  entityType: string,
  rows: R[],
): Promise<R[]> {
  if (entityType !== 'model' && entityType !== 'software') return rows;
  const ids = [...new Set(rows.flatMap((r) => [r.targetId, r.mapTargetId, r.resultTargetId]).filter((id): id is string => id !== null))];
  const visible = entityType === 'model' ? await visibleModelIds(db, viewer, ids) : await visibleSoftwareIds(db, viewer, ids);
  const hide = (id: string | null) => (id !== null && !visible.has(id) ? null : id);
  return rows.map((r) =>
    [r.targetId, r.mapTargetId, r.resultTargetId].some((id) => id !== null && !visible.has(id))
      ? { ...r, targetId: hide(r.targetId), targetVersion: hide(r.targetId) === null ? null : r.targetVersion, mapTargetId: hide(r.mapTargetId), resultTargetId: hide(r.resultTargetId) }
      : r,
  );
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
        const asFilter = (f: (typeof judged.query.conditions)[string] | undefined) =>
          f && (f.op === 'in' || f.op === 'notIn') ? { op: f.op, values: f.values } : null;
        const page = await listRows(deps.db, ws, job.id, job.validationGeneration, {
          page: judged.query.page,
          pageSize: judged.query.pageSize,
          planStates: asFilter(judged.query.conditions.planState),
          applyStatuses: asFilter(judged.query.conditions.applyStatus),
          desc: judged.query.sorting[0]?.desc ?? false,
        });
        const counts = await applyCounts(deps.db, ws, job.id, job.applyPass);
        // A staged plan can name a model / SW version that became hidden after it was planned: its ids are not shown (#1504).
        const rows = await hideRestrictedTargets(deps.db, { workspaceId: ws, actorId: actor.actor_id }, job.entityType, page.rows);
        return { outcome: 'ok', data: { job: publicJob(job), rows, total: page.total, applyCounts: counts } };
      },
    },
  ];
}
