// Staging side of the catalog import (#1195 a): `knowledge.catalog_import_*` only. Nothing here writes a catalog
// table; the catalog is read through `loadCatalogSnapshot`. Every statement is scoped to the actor's workspace. The
// caller owns the transaction. Bulk statements run in chunks (a job holds up to 5,000 rows).

import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import {
  catalogImportJobs,
  catalogImportRows,
  equipmentModels,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { ParseError } from '../domain/import-file.js';
import type { ImportEntity } from '../domain/import-mapping.js';
import type {
  CatalogRef,
  CatalogSnapshot,
  ModelRef,
  PlanResult,
  PlanState,
  RowError,
} from '../domain/import-plan.js';

const CHUNK = 500;

export type ImportJobStatus =
  | 'uploaded'
  | 'mapped'
  | 'validated'
  | 'review_required'
  | 'applying'
  | 'completed'
  | 'partial_failure'
  | 'failed'
  | 'cancelled';

export interface ImportJob {
  id: string;
  entityType: ImportEntity;
  fileName: string;
  fileSize: number;
  fileType: 'csv' | 'xlsx';
  fileSha256: string;
  headers: string[];
  mapping: Record<string, string> | null;
  status: ImportJobStatus;
  planVersion: number;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

const toJob = (row: typeof catalogImportJobs.$inferSelect): ImportJob => ({
  id: row.id,
  entityType: row.entityType as ImportEntity,
  fileName: row.fileName,
  fileSize: row.fileSize,
  fileType: row.fileType as 'csv' | 'xlsx',
  fileSha256: row.fileSha256,
  headers: row.headers as string[],
  mapping: (row.mappingJson as Record<string, string> | null) ?? null,
  status: row.status as ImportJobStatus,
  planVersion: row.planVersion,
  rowVersion: row.rowVersion,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function insertJob(
  tx: Tx,
  input: {
    workspaceId: string;
    actorId: string;
    entityType: ImportEntity;
    fileName: string;
    fileSize: number;
    fileType: 'csv' | 'xlsx';
    fileSha256: string;
    headers: string[];
  },
): Promise<string> {
  const [row] = await tx
    .insert(catalogImportJobs)
    .values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileType: input.fileType,
      fileSha256: input.fileSha256,
      headers: input.headers,
      createdBy: input.actorId,
      updatedBy: input.actorId,
    })
    .returning({ id: catalogImportJobs.id });
  if (!row) throw new Error('catalog import job insert returned no row');
  return row.id;
}

export async function insertRows(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  rows: readonly { rowNo: number; raw: Record<string, string>; parseErrors: ParseError[] }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(catalogImportRows).values(
      rows.slice(i, i + CHUNK).map((r) => ({
        workspaceId,
        jobId,
        rowNo: r.rowNo,
        rawJson: r.raw,
        parseErrors: r.parseErrors,
      })),
    );
  }
}

/** The job, optionally locked `FOR UPDATE`; null when it is not in the workspace. */
export async function getJob(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  lock = false,
): Promise<ImportJob | null> {
  const query = tx
    .select()
    .from(catalogImportJobs)
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)));
  const [row] = await (lock ? query.for('update') : query);
  return row ? toJob(row) : null;
}

const bump = (actorId: string) => ({
  planVersion: sql`${catalogImportJobs.planVersion} + 1`,
  rowVersion: sql`${catalogImportJobs.rowVersion} + 1`,
  updatedAt: sql`now()`,
  updatedBy: actorId,
});

/** Stores the mapping, bumps the plan version and clears every earlier validation result (never `parse_errors`). */
export async function saveMapping(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  actorId: string,
  mapping: Record<string, string>,
): Promise<ImportJob> {
  const [row] = await tx
    .update(catalogImportJobs)
    .set({ mappingJson: mapping, status: 'mapped', ...bump(actorId) })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)))
    .returning();
  if (!row) throw new Error('catalog import job vanished under its lock');
  await tx
    .update(catalogImportRows)
    .set({
      normalizedJson: null,
      validationErrors: [],
      planState: 'pending',
      targetId: null,
      targetVersion: null,
      planHash: null,
    })
    .where(and(eq(catalogImportRows.workspaceId, workspaceId), eq(catalogImportRows.jobId, jobId)));
  return toJob(row);
}

export interface StoredRow {
  rowNo: number;
  raw: Record<string, string>;
  parseErrors: ParseError[];
}

export async function readRowsForValidation(tx: Tx, workspaceId: string, jobId: string): Promise<StoredRow[]> {
  const rows = await tx
    .select({
      rowNo: catalogImportRows.rowNo,
      raw: catalogImportRows.rawJson,
      parseErrors: catalogImportRows.parseErrors,
    })
    .from(catalogImportRows)
    .where(and(eq(catalogImportRows.workspaceId, workspaceId), eq(catalogImportRows.jobId, jobId)))
    .orderBy(asc(catalogImportRows.rowNo));
  return rows as StoredRow[];
}

export interface ValidatedRow extends PlanResult {
  normalized: unknown;
}

/** Writes the validation results (chunked `UPDATE … FROM jsonb_to_recordset`) and moves the job to `status`. */
export async function saveValidation(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  actorId: string,
  results: readonly ValidatedRow[],
  status: 'validated' | 'review_required',
): Promise<ImportJob> {
  for (let i = 0; i < results.length; i += CHUNK) {
    const payload = JSON.stringify(
      results.slice(i, i + CHUNK).map((r) => ({
        row_no: r.rowNo,
        normalized: r.normalized,
        errors: r.errors,
        plan_state: r.planState,
        target_id: r.targetId,
        target_version: r.targetVersion,
      })),
    );
    await tx.execute(sql`
      UPDATE knowledge.catalog_import_row AS r
      SET normalized_json = v.normalized,
          validation_errors = v.errors,
          plan_state = v.plan_state,
          target_id = v.target_id,
          target_version = v.target_version
      FROM jsonb_to_recordset(${payload}::jsonb)
        AS v(row_no int, normalized jsonb, errors jsonb, plan_state text, target_id uuid, target_version int)
      WHERE r.workspace_id = ${workspaceId} AND r.job_id = ${jobId} AND r.row_no = v.row_no
    `);
  }
  const [row] = await tx
    .update(catalogImportJobs)
    .set({ status, ...bump(actorId) })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)))
    .returning();
  if (!row) throw new Error('catalog import job vanished under its lock');
  return toJob(row);
}

export async function countByPlanState(
  tx: Tx,
  workspaceId: string,
  jobId: string,
): Promise<Record<PlanState, number>> {
  const counts: Record<PlanState, number> = { pending: 0, new: 0, unchanged: 0, update: 0, conflict: 0, error: 0 };
  const rows = await tx
    .select({ state: catalogImportRows.planState, n: sql<number>`count(*)::int` })
    .from(catalogImportRows)
    .where(and(eq(catalogImportRows.workspaceId, workspaceId), eq(catalogImportRows.jobId, jobId)))
    .groupBy(catalogImportRows.planState);
  for (const r of rows) counts[r.state as PlanState] = r.n;
  return counts;
}

export interface ImportRowView {
  rowNo: number;
  raw: Record<string, string>;
  normalized: unknown;
  errors: RowError[];
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
}

export async function listRows(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  query: { page: number; pageSize: number; planStates: { op: 'in' | 'notIn'; values: string[] } | null; desc: boolean },
): Promise<{ rows: ImportRowView[]; total: number }> {
  const where = and(
    eq(catalogImportRows.workspaceId, workspaceId),
    eq(catalogImportRows.jobId, jobId),
    query.planStates
      ? (query.planStates.op === 'in' ? inArray : notInArray)(catalogImportRows.planState, query.planStates.values)
      : undefined,
  );
  const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogImportRows).where(where);
  const rows = await tx
    .select()
    .from(catalogImportRows)
    .where(where)
    .orderBy(query.desc ? sql`${catalogImportRows.rowNo} desc` : asc(catalogImportRows.rowNo))
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
  return {
    total: count?.n ?? 0,
    rows: rows.map((r) => ({
      rowNo: r.rowNo,
      raw: r.rawJson as Record<string, string>,
      normalized: r.normalizedJson ?? null,
      errors: r.validationErrors as RowError[],
      planState: r.planState as PlanState,
      targetId: r.targetId,
      targetVersion: r.targetVersion,
    })),
  };
}

const ref = (r: { id: string; name: string; active: boolean; rowVersion: number }): CatalogRef => ({
  id: r.id,
  name: r.name,
  active: r.active,
  rowVersion: r.rowVersion,
});

/** The workspace's catalog rows the plan of `entity` needs (read only). */
export async function loadCatalogSnapshot(tx: Tx, workspaceId: string, entity: ImportEntity): Promise<CatalogSnapshot> {
  const vendorMap = new Map<string, CatalogRef>();
  const processMap = new Map<string, CatalogRef>();
  const modelMap = new Map<string, ModelRef>();
  const softwareMap = new Map<string, CatalogRef>();

  const vendorRows = await tx.select().from(vendors).where(eq(vendors.workspaceId, workspaceId));
  for (const v of vendorRows) vendorMap.set(v.codeKey, ref(v));

  if (entity === 'process' || entity === 'model') {
    const rows = await tx.select().from(processCategories).where(eq(processCategories.workspaceId, workspaceId));
    for (const p of rows) processMap.set(p.codeKey, ref(p));
  }
  if (entity === 'model' || entity === 'software') {
    const models = await tx.select().from(equipmentModels).where(eq(equipmentModels.workspaceId, workspaceId));
    const mappings =
      entity === 'model'
        ? await tx.select().from(modelProcesses).where(eq(modelProcesses.workspaceId, workspaceId))
        : [];
    const byModel = new Map<string, Set<string>>();
    for (const m of mappings) {
      const set = byModel.get(m.modelId) ?? new Set<string>();
      set.add(m.processId);
      byModel.set(m.modelId, set);
    }
    for (const m of models) {
      modelMap.set(`${m.vendorId}|${m.codeKey}`, { ...ref(m), processIds: byModel.get(m.id) ?? new Set() });
    }
  }
  if (entity === 'software') {
    const rows = await tx.select().from(softwareVersions).where(eq(softwareVersions.workspaceId, workspaceId));
    for (const s of rows) softwareMap.set(`${s.modelId}|${s.versionKey}`, ref(s));
  }
  return { vendors: vendorMap, processes: processMap, models: modelMap, softwares: softwareMap };
}
