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
import { viewerOf } from './repositories/access-visibility.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { CATALOG_MENU_PERMISSION } from './catalog-actions.js';
import { RESOLUTIONS, type Resolution } from './domain/import-apply.js';
import { mappingShapeErrors, validateMapping } from './domain/import-mapping.js';
import {
  type NormalizedRow,
  PARENT_CONFLICT_CODES,
  type PlanInput,
  normalizeRow,
  resolveVendor,
  planRows,
  statusAfterValidate,
} from './domain/import-plan.js';
import { lockRow } from './repositories/catalog-write.js';
import { readPlanRows, upsertResolutions, type ResolutionWrite } from './repositories/import-apply-repo.js';
import {
  countByPlanState,
  getJob,
  loadCatalogSnapshot,
  readRowsForValidation,
  saveMapping,
  saveValidation,
  setJobStatus,
  touchPlan,
} from './repositories/import-repo.js';

export const IMPORT_CAPABILITY = 'knowledge.catalog.import';
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read endpoints (same menu) that show a job; the engine invalidates only within the action's menu. */
const INVALIDATES = ['logKnowledge.importDetail'] as const;
const EDITABLE = new Set(['uploaded', 'mapped', 'validated', 'review_required']);
const VALIDATABLE = new Set(['mapped', 'validated', 'review_required']);
const RESOLVABLE = new Set(['validated', 'review_required']);
const CANCELLABLE = new Set(['uploaded', 'mapped', 'validated', 'review_required']);
export const RESOLVE_MAX = 500;

interface ResolveItem {
  rowNo: number;
  resolution: string;
  mapTargetId?: unknown;
}

/** Shape of `resolutions`: an array of at most 500 `{rowNo, resolution, mapTargetId?}`; `abort` is not offered. */
function resolveShapeErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value) || value.length === 0) return [{ path: ['resolutions'], code: 'required' }];
  if (value.length > RESOLVE_MAX) return [{ path: ['resolutions'], code: 'too_many' }];
  const errors: FieldError[] = [];
  const seen = new Set<number>();
  value.forEach((raw, i) => {
    const item = raw as Partial<ResolveItem> | null;
    if (typeof item !== 'object' || item === null) return void errors.push({ path: ['resolutions', String(i)], code: 'invalid' });
    if (!Number.isInteger(item.rowNo) || (item.rowNo as number) < 1) errors.push({ path: ['resolutions', String(i), 'rowNo'], code: 'invalid' });
    else if (seen.has(item.rowNo as number)) errors.push({ path: ['resolutions', String(i), 'rowNo'], code: 'duplicate' });
    else seen.add(item.rowNo as number);
    if (!(RESOLUTIONS as readonly unknown[]).includes(item.resolution)) {
      errors.push({ path: ['resolutions', String(i), 'resolution'], code: 'invalid' });
    } else if (item.resolution === 'map') {
      if (typeof item.mapTargetId !== 'string' || !UUID_PATTERN.test(item.mapTargetId)) {
        errors.push({ path: ['resolutions', String(i), 'mapTargetId'], code: 'required' });
      }
    } else if (item.mapTargetId !== undefined && item.mapTargetId !== null) {
      errors.push({ path: ['resolutions', String(i), 'mapTargetId'], code: 'invalid' });
    }
  });
  return errors;
}

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
      const catalog = await loadCatalogSnapshot(tx, viewerOf(actor), job.entityType);
      const results = planRows(job.entityType, inputs, catalog);
      const status = statusAfterValidate(tallyOf(results));
      const saved = await saveValidation(
        tx,
        ws,
        job.id,
        actor.actor_id,
        results.map((r) => {
          const normalized = normalizedByRow.get(r.rowNo) ?? null;
          // The parents a model row would create are part of its sealed plan (`normalized.creates`).
          return { ...r, normalized: r.creates && normalized ? { ...normalized, creates: r.creates } : normalized };
        }),
        status,
      );
      const counts = await countByPlanState(tx, ws, job.id);
      return {
        data: { jobId: saved.id, status: saved.status, planVersion: saved.planVersion, counts },
        version: String(saved.rowVersion),
      };
    },
  };

  const importResolve: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importResolve',
      menuId: LOG_KNOWLEDGE_MENU_ID,
      inputKeys: ['jobId', 'resolutions'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: (input) => [...jobIdErrors(input), ...resolveShapeErrors(input.resolutions)],
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const job = await getJob(tx, ws, input.jobId as string, true);
      if (!job) throw new Error('action importResolve: currentVersion judged not_found first');
      if (!RESOLVABLE.has(job.status)) throw new MenuActionInvalidError([{ path: ['jobId'], code: 'state' }]);
      const items = input.resolutions as { rowNo: number; resolution: Resolution; mapTargetId?: string }[];
      const rows = new Map((await readPlanRows(tx, ws, job.id, items.map((i) => i.rowNo))).map((r) => [r.rowNo, r]));
      const needsCatalog = items.some((i) => i.resolution === 'map');
      const catalog = needsCatalog ? await loadCatalogSnapshot(tx, viewerOf(actor), job.entityType) : null;
      const errors: FieldError[] = [];
      const writes: ResolutionWrite[] = [];
      for (const [i, item] of items.entries()) {
        const at = (leaf: string) => ['resolutions', String(i), leaf];
        const row = rows.get(item.rowNo);
        if (!row) {
          errors.push({ path: at('rowNo'), code: 'not_found' });
          continue;
        }
        if (item.resolution === 'skip') {
          writes.push({ rowNo: item.rowNo, resolution: 'skip', mapTargetId: null, expectedTargetVersion: null });
          continue;
        }
        if (row.planState !== 'new' && (item.resolution === 'create' || row.planState !== 'conflict')) {
          errors.push({ path: at('resolution'), code: 'not_allowed' });
          continue;
        }
        if (item.resolution === 'map' && row.errors?.some((e) => PARENT_CONFLICT_CODES.includes(e.code))) {
          // A wrong parent is fixed in the catalog and the file re-validated; a model target cannot stand in for it.
          errors.push({ path: at('resolution'), code: 'not_allowed' });
          continue;
        }
        if (item.resolution === 'create') {
          writes.push({ rowNo: item.rowNo, resolution: 'create', mapTargetId: null, expectedTargetVersion: null });
          continue;
        }
        const target = await lockRow(tx, job.entityType, viewerOf(actor), item.mapTargetId as string);
        if (!target) errors.push({ path: at('mapTargetId'), code: 'not_found' });
        else if (!target.active) errors.push({ path: at('mapTargetId'), code: 'inactive' });
        else if (target.parentId !== expectedParent(job.entityType, row.normalized, catalog)) {
          errors.push({ path: at('mapTargetId'), code: 'scope' });
        } else {
          writes.push({
            rowNo: item.rowNo,
            resolution: 'map',
            mapTargetId: target.id,
            expectedTargetVersion: target.rowVersion,
          });
        }
      }
      if (errors.length > 0) throw new MenuActionInvalidError(errors);
      await upsertResolutions(tx, ws, job.id, actor.actor_id, job.validationGeneration, writes);
      const saved = await touchPlan(tx, ws, job.id, actor.actor_id);
      return {
        data: { jobId: saved.id, status: saved.status, planVersion: saved.planVersion, resolved: writes.length },
        version: String(saved.rowVersion),
      };
    },
  };

  const importCancel: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.importCancel',
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
      if (!job) throw new Error('action importCancel: currentVersion judged not_found first');
      if (!CANCELLABLE.has(job.status)) throw new MenuActionInvalidError([{ path: ['jobId'], code: 'state' }]);
      const saved = await setJobStatus(tx, ws, job.id, actor.actor_id, 'cancelled');
      return {
        data: { jobId: saved.id, status: saved.status, planVersion: saved.planVersion },
        version: String(saved.rowVersion),
      };
    },
  };

  return [importMap, importValidate, importResolve, importCancel];
}

function tallyOf(results: readonly { planState: keyof ReturnType<typeof emptyCounts> }[]) {
  const counts = emptyCounts();
  for (const r of results) counts[r.planState] += 1;
  return counts;
}
const emptyCounts = () => ({ pending: 0, new: 0, unchanged: 0, update: 0, conflict: 0, error: 0 });

/** The parent id a map target must have: the row's resolved vendor (model) or model (software); null for vendor/process. */
function expectedParent(
  entity: string,
  normalized: unknown,
  catalog: Awaited<ReturnType<typeof loadCatalogSnapshot>> | null,
): string | null {
  if (!catalog) return null;
  const n = normalized as { vendorKey?: string; vendorNameKey?: string; modelKey?: string; codeKey?: string };
  const vendor = n.vendorKey
    ? entity === 'model'
      ? resolveVendor(catalog, { vendorKey: n.vendorKey, ...(n.vendorNameKey ? { vendorNameKey: n.vendorNameKey } : {}) })
      : catalog.vendors.get(n.vendorKey)
    : undefined;
  if (entity === 'model') return vendor?.id ?? '';
  if (entity === 'software') return (vendor && n.modelKey ? catalog.models.get(`${vendor.id}|${n.modelKey}`)?.id : undefined) ?? '';
  return null;
}
