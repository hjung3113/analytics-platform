// Apply side of the catalog import (#1195 b): resolutions, the seal, per-row bookkeeping, the lookups an apply
// needs and the identity map. Catalog rows themselves are written through `catalog-write.ts`. Every statement is
// scoped to the actor's workspace; the caller owns the transaction.

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import {
  catalogImportJobs,
  catalogImportResolutions,
  catalogImportRows,
  equipmentModels,
  externalIdentityMaps,
  processCategories,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import {
  type ApplyCounts,
  type ApplyStatus,
  type Resolution,
  type ResolutionInput,
  emptyApplyCounts,
} from '../domain/import-apply.js';
import type { PlanState } from '../domain/import-plan.js';
import type { CatalogKind } from './catalog-write.js';
import { type ImportJob, getJob } from './import-repo.js';

const CHUNK = 500;

/** The job row locked `FOR UPDATE` (seal, pass start, finish) or `FOR SHARE` (every row transaction). */
export async function lockJob(tx: Tx, workspaceId: string, jobId: string, mode: 'update' | 'share'): Promise<ImportJob | null> {
  if (mode === 'update') return getJob(tx, workspaceId, jobId, true);
  const [row] = await tx
    .select({ id: catalogImportJobs.id })
    .from(catalogImportJobs)
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)))
    .for('share');
  return row ? getJob(tx, workspaceId, jobId) : null;
}

// ---- resolve --------------------------------------------------------------------------------------------------

export interface PlanRow {
  rowNo: number;
  normalized: unknown;
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
}

export async function readPlanRows(tx: Tx, workspaceId: string, jobId: string, rowNos?: readonly number[]): Promise<PlanRow[]> {
  const rows = await tx
    .select({
      rowNo: catalogImportRows.rowNo,
      normalized: catalogImportRows.normalizedJson,
      planState: catalogImportRows.planState,
      targetId: catalogImportRows.targetId,
      targetVersion: catalogImportRows.targetVersion,
    })
    .from(catalogImportRows)
    .where(
      and(
        eq(catalogImportRows.workspaceId, workspaceId),
        eq(catalogImportRows.jobId, jobId),
        rowNos ? inArray(catalogImportRows.rowNo, [...rowNos]) : undefined,
      ),
    )
    .orderBy(asc(catalogImportRows.rowNo));
  return rows as PlanRow[];
}

export interface ResolutionWrite {
  rowNo: number;
  resolution: Resolution;
  mapTargetId: string | null;
  expectedTargetVersion: number | null;
}

export async function upsertResolutions(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  actorId: string,
  generation: number,
  writes: readonly ResolutionWrite[],
): Promise<void> {
  for (let i = 0; i < writes.length; i += CHUNK) {
    await tx
      .insert(catalogImportResolutions)
      .values(
        writes.slice(i, i + CHUNK).map((w) => ({
          workspaceId,
          jobId,
          rowNo: w.rowNo,
          resolution: w.resolution,
          mapTargetId: w.mapTargetId,
          expectedTargetVersion: w.expectedTargetVersion,
          basedOnValidation: generation,
          resolvedBy: actorId,
        })),
      )
      .onConflictDoUpdate({
        target: [catalogImportResolutions.workspaceId, catalogImportResolutions.jobId, catalogImportResolutions.rowNo],
        set: {
          resolution: sql`excluded.resolution`,
          mapTargetId: sql`excluded.map_target_id`,
          expectedTargetVersion: sql`excluded.expected_target_version`,
          basedOnValidation: sql`excluded.based_on_validation`,
          resolvedBy: sql`excluded.resolved_by`,
          resolvedAt: sql`now()`,
        },
      });
  }
}

/** The resolutions that count: written for the job's current validation generation. */
export async function readResolutions(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  generation: number,
  rowNo?: number,
): Promise<Map<number, ResolutionInput>> {
  const rows = await tx
    .select()
    .from(catalogImportResolutions)
    .where(
      and(
        eq(catalogImportResolutions.workspaceId, workspaceId),
        eq(catalogImportResolutions.jobId, jobId),
        eq(catalogImportResolutions.basedOnValidation, generation),
        rowNo === undefined ? undefined : eq(catalogImportResolutions.rowNo, rowNo),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.rowNo,
      { resolution: r.resolution as Resolution, mapTargetId: r.mapTargetId, expectedTargetVersion: r.expectedTargetVersion },
    ]),
  );
}

// ---- seal -----------------------------------------------------------------------------------------------------

export interface SealEntry {
  rowNo: number;
  planHash: string;
  /** Set for rows that never write (excluded, unresolved, skipped, unchanged); null for rows still to apply. */
  finalStatus: ApplyStatus | null;
}

export async function sealRows(tx: Tx, workspaceId: string, jobId: string, entries: readonly SealEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += CHUNK) {
    const payload = JSON.stringify(
      entries.slice(i, i + CHUNK).map((e) => ({ row_no: e.rowNo, plan_hash: e.planHash, apply_status: e.finalStatus })),
    );
    await tx.execute(sql`
      UPDATE knowledge.catalog_import_row AS r
      SET plan_hash = v.plan_hash,
          apply_status = v.apply_status,
          applied_at = CASE WHEN v.apply_status IS NULL THEN NULL ELSE now() END
      FROM jsonb_to_recordset(${payload}::jsonb) AS v(row_no int, plan_hash text, apply_status text)
      WHERE r.workspace_id = ${workspaceId} AND r.job_id = ${jobId} AND r.row_no = v.row_no
    `);
  }
}

export async function markJobSealed(tx: Tx, workspaceId: string, jobId: string, actorId: string, hash: string): Promise<void> {
  await tx
    .update(catalogImportJobs)
    .set({
      status: 'applying',
      sealedPlanHash: hash,
      applyPass: 1,
      rowVersion: sql`${catalogImportJobs.rowVersion} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actorId,
    })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)));
}

// ---- passes ---------------------------------------------------------------------------------------------------

/** Eligible in `pass`: not yet decided, or failed in an earlier pass. */
const eligible = (workspaceId: string, jobId: string, pass: number) =>
  and(
    eq(catalogImportRows.workspaceId, workspaceId),
    eq(catalogImportRows.jobId, jobId),
    sql`(${catalogImportRows.applyStatus} is null or ${catalogImportRows.applyStatus} = 'failed')`,
    sql`coalesce(${catalogImportRows.applyPass}, 0) < ${pass}`,
  );

export async function nextEligibleRow(tx: Tx, workspaceId: string, jobId: string, pass: number): Promise<number | null> {
  const [row] = await tx
    .select({ rowNo: catalogImportRows.rowNo })
    .from(catalogImportRows)
    .where(eligible(workspaceId, jobId, pass))
    .orderBy(asc(catalogImportRows.rowNo))
    .limit(1);
  return row?.rowNo ?? null;
}

/** `remaining` = rows eligible in `pass`; before the seal (pass 0) that is every undecided row. */
export async function applyCounts(tx: Tx, workspaceId: string, jobId: string, jobPass: number): Promise<ApplyCounts> {
  const pass = Math.max(jobPass, 1);
  const counts = emptyApplyCounts();
  const rows = await tx
    .select({ status: catalogImportRows.applyStatus, n: sql<number>`count(*)::int` })
    .from(catalogImportRows)
    .where(and(eq(catalogImportRows.workspaceId, workspaceId), eq(catalogImportRows.jobId, jobId)))
    .groupBy(catalogImportRows.applyStatus);
  for (const r of rows) if (r.status !== null) counts[r.status as ApplyStatus] = r.n;
  const [remaining] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(catalogImportRows)
    .where(eligible(workspaceId, jobId, pass));
  counts.remaining = remaining?.n ?? 0;
  return counts;
}

export async function startRetryPass(tx: Tx, workspaceId: string, jobId: string, actorId: string): Promise<void> {
  await tx
    .update(catalogImportJobs)
    .set({
      status: 'applying',
      applyPass: sql`${catalogImportJobs.applyPass} + 1`,
      rowVersion: sql`${catalogImportJobs.rowVersion} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actorId,
    })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)));
}

export async function finishJob(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  actorId: string,
  status: 'completed' | 'partial_failure',
): Promise<void> {
  await tx
    .update(catalogImportJobs)
    .set({
      status,
      appliedAt: sql`now()`,
      rowVersion: sql`${catalogImportJobs.rowVersion} + 1`,
      updatedAt: sql`now()`,
      updatedBy: actorId,
    })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)));
}

// ---- one row --------------------------------------------------------------------------------------------------

export interface ApplyRow extends PlanRow {
  planHash: string | null;
  applyStatus: string | null;
}

export async function lockApplyRow(tx: Tx, workspaceId: string, jobId: string, rowNo: number): Promise<ApplyRow | null> {
  const [row] = await tx
    .select({
      rowNo: catalogImportRows.rowNo,
      normalized: catalogImportRows.normalizedJson,
      planState: catalogImportRows.planState,
      targetId: catalogImportRows.targetId,
      targetVersion: catalogImportRows.targetVersion,
      planHash: catalogImportRows.planHash,
      applyStatus: catalogImportRows.applyStatus,
    })
    .from(catalogImportRows)
    .where(
      and(
        eq(catalogImportRows.workspaceId, workspaceId),
        eq(catalogImportRows.jobId, jobId),
        eq(catalogImportRows.rowNo, rowNo),
      ),
    )
    .for('update');
  return (row as ApplyRow | undefined) ?? null;
}

export async function setRowResult(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  rowNo: number,
  pass: number,
  result: { status: ApplyStatus; error?: string | null; resultTargetId?: string | null },
): Promise<void> {
  await tx
    .update(catalogImportRows)
    .set({
      applyStatus: result.status,
      applyError: result.error ?? null,
      applyPass: pass,
      appliedAt: sql`now()`,
      resultTargetId: result.resultTargetId ?? null,
    })
    .where(
      and(
        eq(catalogImportRows.workspaceId, workspaceId),
        eq(catalogImportRows.jobId, jobId),
        eq(catalogImportRows.rowNo, rowNo),
      ),
    );
}

// ---- lookups an apply needs -----------------------------------------------------------------------------------

/** The parent a new row hangs under, found by comparison key and locked `FOR SHARE`. */
export async function findVendorByKey(tx: Tx, workspaceId: string, key: string): Promise<{ id: string; active: boolean } | null> {
  const [row] = await tx
    .select({ id: vendors.id, active: vendors.active })
    .from(vendors)
    .where(and(eq(vendors.workspaceId, workspaceId), eq(vendors.codeKey, key)))
    .for('share');
  return row ?? null;
}

export async function findModelByKey(
  tx: Tx,
  workspaceId: string,
  vendorId: string,
  key: string,
): Promise<{ id: string; active: boolean } | null> {
  const [row] = await tx
    .select({ id: equipmentModels.id, active: equipmentModels.active })
    .from(equipmentModels)
    .where(
      and(
        eq(equipmentModels.workspaceId, workspaceId),
        eq(equipmentModels.vendorId, vendorId),
        eq(equipmentModels.codeKey, key),
      ),
    )
    .for('share');
  return row ?? null;
}

/** Process rows by comparison key, locked `FOR SHARE`. */
export async function findProcessesByKeys(
  tx: Tx,
  workspaceId: string,
  keys: readonly string[],
): Promise<Map<string, { id: string; active: boolean }>> {
  if (keys.length === 0) return new Map();
  const rows = await tx
    .select({ id: processCategories.id, key: processCategories.codeKey, active: processCategories.active })
    .from(processCategories)
    .where(and(eq(processCategories.workspaceId, workspaceId), inArray(processCategories.codeKey, [...keys])))
    .for('share');
  return new Map(rows.map((r) => [r.key, { id: r.id, active: r.active }]));
}

// ---- identity map ---------------------------------------------------------------------------------------------

export const IDENTITY_SOURCE_SYSTEM = 'catalog_import';

export interface IdentityRow {
  targetKind: string;
  targetId: string;
  mappingState: string;
}

export async function findIdentity(
  tx: Tx,
  workspaceId: string,
  sourceType: CatalogKind,
  externalKey: string,
): Promise<IdentityRow | null> {
  const [row] = await tx
    .select({
      targetKind: externalIdentityMaps.targetKind,
      targetId: externalIdentityMaps.targetId,
      mappingState: externalIdentityMaps.mappingState,
    })
    .from(externalIdentityMaps)
    .where(
      and(
        eq(externalIdentityMaps.workspaceId, workspaceId),
        eq(externalIdentityMaps.sourceSystem, IDENTITY_SOURCE_SYSTEM),
        eq(externalIdentityMaps.sourceType, sourceType),
        eq(externalIdentityMaps.externalKey, externalKey),
      ),
    )
    .for('update');
  return row ?? null;
}

/**
 * Claims the identity key for `targetId` in one statement (`ON CONFLICT DO NOTHING`), so two jobs racing for the same
 * key cannot raise a unique violation. `accepted_by/at` are the stored resolution's `resolved_by/at` (the person who
 * decided the mapping); created_by/updated_by are the caller who applies it. `claimed` is false when a mapping for the
 * key already exists: `existing` is then the winner (a concurrent claim is waited for until it commits).
 */
export async function claimIdentity(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  jobId: string,
  rowNo: number,
  sourceType: CatalogKind,
  externalKey: string,
  targetId: string,
): Promise<{ claimed: true } | { claimed: false; existing: IdentityRow }> {
  const inserted = await tx.execute(sql`
    INSERT INTO knowledge.external_identity_map
      (workspace_id, source_system, source_type, external_key, target_kind, target_id, mapping_state,
       accepted_by, accepted_at, created_by, updated_by)
    SELECT r.workspace_id, ${IDENTITY_SOURCE_SYSTEM}, ${sourceType}, ${externalKey}, ${sourceType}, ${targetId}::uuid,
           'accepted', r.resolved_by, r.resolved_at, ${actorId}::uuid, ${actorId}::uuid
    FROM knowledge.catalog_import_resolution r
    WHERE r.workspace_id = ${workspaceId}::uuid AND r.job_id = ${jobId}::uuid AND r.row_no = ${rowNo}
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  if (inserted.rows.length > 0) return { claimed: true };
  const existing = await findIdentity(tx, workspaceId, sourceType, externalKey);
  if (!existing) throw new Error('catalog import identity claim neither inserted nor found');
  return { claimed: false, existing };
}

// ---- report ---------------------------------------------------------------------------------------------------

export interface ReportRow {
  rowNo: number;
  planState: string;
  resolution: string | null;
  applyStatus: string | null;
  applyError: string | null;
  resultTargetId: string | null;
  raw: Record<string, string>;
}

export async function readReportRows(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  generation: number,
): Promise<ReportRow[]> {
  const rows = await tx
    .select({
      rowNo: catalogImportRows.rowNo,
      planState: catalogImportRows.planState,
      resolution: catalogImportResolutions.resolution,
      applyStatus: catalogImportRows.applyStatus,
      applyError: catalogImportRows.applyError,
      resultTargetId: catalogImportRows.resultTargetId,
      raw: catalogImportRows.rawJson,
    })
    .from(catalogImportRows)
    .leftJoin(
      catalogImportResolutions,
      and(
        eq(catalogImportResolutions.workspaceId, catalogImportRows.workspaceId),
        eq(catalogImportResolutions.jobId, catalogImportRows.jobId),
        eq(catalogImportResolutions.rowNo, catalogImportRows.rowNo),
        eq(catalogImportResolutions.basedOnValidation, generation),
      ),
    )
    .where(and(eq(catalogImportRows.workspaceId, workspaceId), eq(catalogImportRows.jobId, jobId)))
    .orderBy(asc(catalogImportRows.rowNo));
  return rows as ReportRow[];
}
