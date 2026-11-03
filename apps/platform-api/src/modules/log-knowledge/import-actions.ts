// Catalog import staging actions (#1195 a, design v0.6 §6.2 ②–③): `importMap` stores the column mapping and
// `importValidate` computes every row's normalized form, errors and plan state. Right: `knowledge.catalog.import`
// (workspace-scoped; Admin passes through the module bypass). Staging only — no catalog table and no audit row is
// written here (apply is node b). A job of another workspace answers `not_found` (the engine's version read). The
// answers carry counts and ids, never rows (replay cap 128 KiB).

import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { CATALOG_MENU_PERMISSION } from './catalog-actions.js';
import { mappingShapeErrors, validateMapping } from './domain/import-mapping.js';
import {
  type NormalizedRow,
  type PlanInput,
  normalizeRow,
  planRows,
  statusAfterValidate,
} from './domain/import-plan.js';
import {
  countByPlanState,
  getJob,
  loadCatalogSnapshot,
  readRowsForValidation,
  saveMapping,
  saveValidation,
} from './repositories/import-repo.js';

export const IMPORT_CAPABILITY = 'knowledge.catalog.import';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read endpoints (same menu) that show a job; the engine invalidates only within the action's menu. */
const INVALIDATES = ['logKnowledge.importDetail'] as const;
const EDITABLE = new Set(['uploaded', 'mapped', 'validated', 'review_required']);
const VALIDATABLE = new Set(['mapped', 'validated', 'review_required']);

export interface ImportActionDeps {
  checkService: CheckService;
}

/** The module's capability check with the Admin bypass (the same rule as the catalog actions). */
export function importAuthorizer(checkService: CheckService) {
  return async (actor: PlatformActor, tx: Tx): Promise<boolean> =>
    applyAdminModuleBypass(
      actor.role_level,
      IMPORT_CAPABILITY,
      await checkService.checkCapability(actor, IMPORT_CAPABILITY, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;
}

const jobIdErrors = (input: Record<string, unknown>): FieldError[] =>
  typeof input.jobId === 'string' && UUID_PATTERN.test(input.jobId) ? [] : [{ path: ['jobId'], code: 'required' }];

export function importActions(deps: ImportActionDeps): MenuActionDeclaration[] {
  const authorize = importAuthorizer(deps.checkService);

  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const job = await getJob(tx, actor.workspace_id, input.jobId as string, true);
    return job ? String(job.rowVersion) : null;
  };

  const importMap: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importMap',
      menuId: LOG_KNOWLEDGE_MENU_ID,
      inputKeys: ['jobId', 'mapping'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: (input) => [...jobIdErrors(input), ...mappingShapeErrors(input.mapping)],
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const job = await getJob(tx, ws, input.jobId as string, true);
      if (!job) throw new Error('action importMap: currentVersion judged not_found first');
      if (!EDITABLE.has(job.status)) throw new MenuActionInvalidError([{ path: ['jobId'], code: 'state' }]);
      const mapping = input.mapping as Record<string, string>;
      const errors = validateMapping(job.entityType, job.headers, mapping);
      if (errors.length > 0) throw new MenuActionInvalidError(errors);
      const saved = await saveMapping(tx, ws, job.id, actor.actor_id, mapping);
      return {
        data: { jobId: saved.id, status: saved.status, planVersion: saved.planVersion },
        version: String(saved.rowVersion),
      };
    },
  };

  const importValidate: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importValidate',
      menuId: LOG_KNOWLEDGE_MENU_ID,
      inputKeys: ['jobId'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: (input) => jobIdErrors(input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const job = await getJob(tx, ws, input.jobId as string, true);
      if (!job) throw new Error('action importValidate: currentVersion judged not_found first');
      if (!VALIDATABLE.has(job.status) || !job.mapping) {
        throw new MenuActionInvalidError([{ path: ['jobId'], code: 'state' }]);
      }
      const mapping = job.mapping;
      const stored = await readRowsForValidation(tx, ws, job.id);
      const normalizedByRow = new Map<number, NormalizedRow>();
      const inputs: PlanInput[] = stored.map((row) => {
        const { normalized, errors } = normalizeRow(job.entityType, row.raw, mapping);
        normalizedByRow.set(row.rowNo, normalized);
        // Parse errors are immutable and always count: they come first and force `error`.
        return { rowNo: row.rowNo, normalized, errors: [...row.parseErrors, ...errors] };
      });
      const catalog = await loadCatalogSnapshot(tx, ws, job.entityType);
      const results = planRows(job.entityType, inputs, catalog);
      const status = statusAfterValidate(tallyOf(results));
      const saved = await saveValidation(
        tx,
        ws,
        job.id,
        actor.actor_id,
        results.map((r) => ({ ...r, normalized: normalizedByRow.get(r.rowNo) ?? null })),
        status,
      );
      const counts = await countByPlanState(tx, ws, job.id);
      return {
        data: { jobId: saved.id, status: saved.status, planVersion: saved.planVersion, counts },
        version: String(saved.rowVersion),
      };
    },
  };

  return [importMap, importValidate];
}

function tallyOf(results: readonly { planState: keyof ReturnType<typeof emptyCounts> }[]) {
  const counts = emptyCounts();
  for (const r of results) counts[r.planState] += 1;
  return counts;
}
const emptyCounts = () => ({ pending: 0, new: 0, unchanged: 0, update: 0, conflict: 0, error: 0 });
