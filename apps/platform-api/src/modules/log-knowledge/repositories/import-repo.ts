// Staging side of the catalog import (#1195 a): `knowledge.catalog_import_*` only. Nothing here writes a catalog
// table; the catalog is read through `loadCatalogSnapshot`. Every statement is scoped to the actor's workspace. The
// caller owns the transaction. Bulk statements run in chunks (a job holds up to 5,000 rows).

import { and, asc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';

import {
  catalogImportJobs,
  catalogImportResolutions,
  catalogImportRows,
  equipmentModels,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, ref as accessRef, visibleModelSql, visibleSoftwareSql } from './access-visibility.js';
import type { ParseError } from '../domain/import-file.js';
import type { ImportEntity } from '../domain/import-mapping.js';
import { toCodeKey } from '../domain/code-key.js';
import type {
  CatalogRef,
  Creates,
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
  validationGeneration: number;
  applyPass: number;
  sealedPlanHash: string | null;
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
  validationGeneration: row.validationGeneration,
  applyPass: row.applyPass,
  sealedPlanHash: row.sealedPlanHash,
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
    /** The server's own recognition of the headers (model sheets): the job starts `mapped`, no `importMap` needed. */
    mapping?: Record<string, string>;
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
      ...(input.mapping ? { mappingJson: input.mapping, status: 'mapped' } : {}),
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

/** A mapping or validation makes every earlier resolution stale (they referred to the old plan). */
const nextGeneration = { validationGeneration: sql`${catalogImportJobs.validationGeneration} + 1` };

/** Bumps both versions (a resolution changes the plan) without touching the generation. */
export async function touchPlan(tx: Tx, workspaceId: string, jobId: string, actorId: string): Promise<ImportJob> {
  const [row] = await tx
    .update(catalogImportJobs)
    .set(bump(actorId))
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)))
    .returning();
  if (!row) throw new Error('catalog import job vanished under its lock');
  return toJob(row);
}

/** Moves the job to `status` (cancel); both versions move, the generation does not. */
export async function setJobStatus(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  actorId: string,
  status: ImportJobStatus,
): Promise<ImportJob> {
  const [row] = await tx
    .update(catalogImportJobs)
    .set({ status, ...bump(actorId) })
    .where(and(eq(catalogImportJobs.workspaceId, workspaceId), eq(catalogImportJobs.id, jobId)))
    .returning();
  if (!row) throw new Error('catalog import job vanished under its lock');
  return toJob(row);
}

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
    .set({ mappingJson: mapping, status: 'mapped', ...bump(actorId), ...nextGeneration })
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
    .set({ status, ...bump(actorId), ...nextGeneration })
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
  /** The resolution written for the job's current validation; null when none (or a stale one). */
  resolution: string | null;
  mapTargetId: string | null;
  applyStatus: string | null;
  applyError: string | null;
  resultTargetId: string | null;
  /** Model rows: the parents the plan would create (`normalized.creates`); null when none. */
  creates: Creates | null;
}

export interface ListRowsQuery {
  page: number;
  pageSize: number;
  planStates: { op: 'in' | 'notIn'; values: string[] } | null;
  applyStatuses: { op: 'in' | 'notIn'; values: string[] } | null;
  desc: boolean;
}

export async function listRows(
  tx: Tx,
  workspaceId: string,
  jobId: string,
  generation: number,
  query: ListRowsQuery,
): Promise<{ rows: ImportRowView[]; total: number }> {
  const applyFilter = query.applyStatuses
    ? query.applyStatuses.op === 'in'
      ? inArray(catalogImportRows.applyStatus, query.applyStatuses.values)
      : or(isNull(catalogImportRows.applyStatus), notInArray(catalogImportRows.applyStatus, query.applyStatuses.values))
    : undefined;
  const where = and(
    eq(catalogImportRows.workspaceId, workspaceId),
    eq(catalogImportRows.jobId, jobId),
    query.planStates
      ? (query.planStates.op === 'in' ? inArray : notInArray)(catalogImportRows.planState, query.planStates.values)
      : undefined,
    applyFilter,
  );
  const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(catalogImportRows).where(where);
  const rows = await tx
    .select({
      row: catalogImportRows,
      resolution: catalogImportResolutions.resolution,
      mapTargetId: catalogImportResolutions.mapTargetId,
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
    .where(where)
    .orderBy(query.desc ? sql`${catalogImportRows.rowNo} desc` : asc(catalogImportRows.rowNo))
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
  return {
    total: count?.n ?? 0,
    rows: rows.map(({ row: r, resolution, mapTargetId }) => ({
      rowNo: r.rowNo,
      raw: r.rawJson as Record<string, string>,
      normalized: r.normalizedJson ?? null,
      errors: r.validationErrors as RowError[],
      planState: r.planState as PlanState,
      targetId: r.targetId,
      targetVersion: r.targetVersion,
      resolution,
      mapTargetId,
      applyStatus: r.applyStatus,
      applyError: r.applyError,
      resultTargetId: r.resultTargetId,
      creates: (r.normalizedJson as { creates?: Creates } | null)?.creates ?? null,
    })),
  };
}

const ref = (r: { id: string; name: string; active: boolean; rowVersion: number }): CatalogRef => ({
  id: r.id,
  name: r.name,
  active: r.active,
  rowVersion: r.rowVersion,
});

/**
 * The workspace's catalog rows the plan of `entity` needs (read only). Models and SW versions the viewer cannot see are left
 * out (#1504): a plan must not show their id, name or version. A row that names one is planned as new.
 */
export async function loadCatalogSnapshot(tx: Tx, viewer: Viewer, entity: ImportEntity): Promise<CatalogSnapshot> {
  const workspaceId = viewer.workspaceId;
  const vendorMap = new Map<string, CatalogRef>();
  const processMap = new Map<string, CatalogRef>();
  const modelMap = new Map<string, ModelRef>();
  const softwareMap = new Map<string, CatalogRef>();

  const vendorNames = new Map<string, CatalogRef[]>();
  const processNames = new Map<string, CatalogRef[]>();
  const modelNames = new Map<string, ModelRef[]>();
  const addName = <T extends CatalogRef>(index: Map<string, T[]>, scope: string, row: T, name: string) => {
    const key = `${scope}${toCodeKey(name)}`;
    index.set(key, [...(index.get(key) ?? []), row]);
  };

  const vendorRows = await tx.select().from(vendors).where(eq(vendors.workspaceId, workspaceId));
  for (const v of vendorRows) {
    vendorMap.set(v.codeKey, ref(v));
    addName(vendorNames, '', ref(v), v.name);
  }

  if (entity === 'process' || entity === 'model') {
    const rows = await tx.select().from(processCategories).where(eq(processCategories.workspaceId, workspaceId));
    for (const p of rows) {
      processMap.set(p.codeKey, ref(p));
      addName(processNames, '', ref(p), p.name);
    }
  }
  if (entity === 'model' || entity === 'software') {
    const models = await tx.select().from(equipmentModels).where(and(eq(equipmentModels.workspaceId, workspaceId), visibleModelSql(viewer, accessRef(equipmentModels.id))));
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
      const modelRef = { ...ref(m), processIds: byModel.get(m.id) ?? new Set<string>() };
      modelMap.set(`${m.vendorId}|${m.codeKey}`, modelRef);
      addName(modelNames, `${m.vendorId}|`, modelRef, m.name);
    }
  }
  if (entity === 'software') {
    const rows = await tx.select().from(softwareVersions).where(and(eq(softwareVersions.workspaceId, workspaceId), visibleSoftwareSql(viewer, accessRef(softwareVersions.id))));
    for (const s of rows) softwareMap.set(`${s.modelId}|${s.versionKey}`, ref(s));
  }
  return { vendors: vendorMap, processes: processMap, models: modelMap, softwares: softwareMap, vendorNames, processNames, modelNames };
}
