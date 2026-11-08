// Write side of the SW change rows (#1196 c, design v0.6 §15.2): `knowledge.spec_sw_change` only, every statement scoped
// to the actor's workspace, no delete. The caller owns the transaction and the audit row. LOCK ORDER everywhere:
// revision row, then the model's advisory lock (`lockModelChanges`), then change rows. The advisory lock serialises
// adds, replacements and the publish flag step of one model, so a change written against revision N is flagged by the
// publish of N+1 or reads N+1 as its basis, never neither.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { modelSpecRevisions, softwareVersions, specSwChanges } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, canSeeModel, ref, visibleSoftwareSql } from './access-visibility.js';
import type { OrderRange } from '../domain/spec-range.js';

const c = specSwChanges;

export interface ChangeRow {
  id: string;
  modelId: string;
  softwareId: string;
  endsBeforeSoftwareId: string | null;
  targetKind: string;
  targetKey: string;
  changeKind: string;
  changeJson: unknown;
  note: string | null;
  basedOnRevNo: number;
  evidenceRef: string | null;
  needsRevalidation: boolean;
  revalidationRevNo: number | null;
  retiredAt: Date | null;
  retiredBy: string | null;
  retiredByChangeId: string | null;
  createdBy: string;
  createdAt: Date;
  rowVersion: number;
}

export const changeColumns = {
  id: c.id,
  modelId: c.modelId,
  softwareId: c.softwareId,
  endsBeforeSoftwareId: c.endsBeforeSoftwareId,
  targetKind: c.targetKind,
  targetKey: c.targetKey,
  changeKind: c.changeKind,
  changeJson: c.changeJson,
  note: c.note,
  basedOnRevNo: c.basedOnRevNo,
  evidenceRef: c.evidenceRef,
  needsRevalidation: c.needsRevalidation,
  revalidationRevNo: c.revalidationRevNo,
  retiredAt: c.retiredAt,
  retiredBy: c.retiredBy,
  retiredByChangeId: c.retiredByChangeId,
  createdBy: c.createdBy,
  createdAt: c.createdAt,
  rowVersion: c.rowVersion,
};

/** The model-scoped lock of the SW change flow (a key of its own, not the draft lock). Held to the end of the transaction. The key hashes the text, so the ids go in canonical (lower-case) spelling — a mixed-case input must take the same lock as the DB's lower-case ids. */
export async function lockModelChanges(tx: Tx, workspaceId: string, modelId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spec-change:${workspaceId.toLowerCase()}:${modelId.toLowerCase()}`}, 0))`);
}

/** `model_id` of a change, read without a lock (the caller takes the model lock next, then `lockChange`). */
export async function changeModelId(tx: Tx, viewer: Viewer, id: string): Promise<string | null> {
  const [row] = await tx.select({ modelId: c.modelId }).from(c).where(and(eq(c.workspaceId, viewer.workspaceId), eq(c.id, id)));
  // A change of a hidden model is not found (#1504).
  return row && (await canSeeModel(tx, viewer, row.modelId)) ? row.modelId : null;
}

export async function lockChange(tx: Tx, viewer: Viewer, id: string): Promise<ChangeRow | null> {
  const [row] = await tx.select(changeColumns).from(c).where(and(eq(c.workspaceId, viewer.workspaceId), eq(c.id, id))).for('update');
  if (!row || !(await canSeeModel(tx, viewer, row.modelId))) return null;
  return row as ChangeRow;
}

/** The model exists in the workspace AND the viewer may see it (a hidden model is «not found», #1504). */
export async function modelExists(tx: Tx, viewer: Viewer, modelId: string): Promise<boolean> {
  return canSeeModel(tx, viewer, modelId);
}

/** The model's latest published revision (no row lock: a publish waits for the model lock this transaction holds). */
export async function currentPublished(tx: Tx, workspaceId: string, modelId: string): Promise<{ id: string; revisionNo: number } | null> {
  const r = modelSpecRevisions;
  const [row] = await tx
    .select({ id: r.id, revisionNo: r.revisionNo })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.modelId, modelId), eq(r.state, 'published')))
    .orderBy(sql`${r.revisionNo} desc`)
    .limit(1);
  return row ?? null;
}

/** `release_order` of the given software versions of THIS model; a version of another model or workspace is absent. */
export async function softwareOrders(tx: Tx, viewer: Viewer, modelId: string, ids: string[]): Promise<Map<string, number>> {
  const workspaceId = viewer.workspaceId;
  const s = softwareVersions;
  const rows = await tx
    .select({ id: s.id, order: s.releaseOrder })
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.modelId, modelId), inArray(s.id, ids), visibleSoftwareSql(viewer, ref(s.id))));
  return new Map(rows.map((r) => [r.id, r.order]));
}

/** Open changes of one key with their current order ranges (the row being retired is excluded by the caller's id). */
export async function openRangesForKey(
  tx: Tx,
  workspaceId: string,
  modelId: string,
  targetKey: string,
  excludeId: string | null,
): Promise<OrderRange[]> {
  const end = alias(softwareVersions, 'end_sw');
  const rows = await tx
    .select({ id: c.id, start: softwareVersions.releaseOrder, endBefore: end.releaseOrder })
    .from(c)
    .innerJoin(softwareVersions, and(eq(softwareVersions.workspaceId, c.workspaceId), eq(softwareVersions.id, c.softwareId)))
    .leftJoin(end, and(eq(end.workspaceId, c.workspaceId), eq(end.id, c.endsBeforeSoftwareId)))
    .where(and(eq(c.workspaceId, workspaceId), eq(c.modelId, modelId), eq(c.targetKey, targetKey), isNull(c.retiredAt)));
  return rows.filter((r) => r.id !== excludeId).map((r) => ({ start: r.start, endBefore: r.endBefore }));
}

export async function countOpen(tx: Tx, workspaceId: string, modelId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(c)
    .where(and(eq(c.workspaceId, workspaceId), eq(c.modelId, modelId), isNull(c.retiredAt)));
  return row?.n ?? 0;
}

export async function insertChange(
  tx: Tx,
  values: {
    workspaceId: string;
    actorId: string;
    modelId: string;
    softwareId: string;
    endsBeforeSoftwareId: string | null;
    targetKind: string;
    targetKey: string;
    changeKind: string;
    change: Record<string, unknown>;
    note: string | null;
    basedOnRevNo: number;
    evidenceRef: string | null;
  },
): Promise<string> {
  const [row] = await tx
    .insert(c)
    .values({
      workspaceId: values.workspaceId,
      modelId: values.modelId,
      softwareId: values.softwareId,
      endsBeforeSoftwareId: values.endsBeforeSoftwareId,
      targetKind: values.targetKind,
      targetKey: values.targetKey,
      changeKind: values.changeKind,
      changeJson: values.change,
      note: values.note,
      basedOnRevNo: values.basedOnRevNo,
      evidenceRef: values.evidenceRef,
      createdBy: values.actorId,
    })
    .returning({ id: c.id });
  if (!row) throw new Error('spec change insert returned no row');
  return row.id;
}

/** Retires an open change (clears its flag); `replacementId` is the row inserted for it in the same transaction. Returns the new version. */
export async function retireChange(tx: Tx, workspaceId: string, row: ChangeRow, actorId: string, replacementId: string | null): Promise<number> {
  const [out] = await tx
    .update(c)
    .set({
      retiredAt: sql`now()`,
      retiredBy: actorId,
      retiredByChangeId: replacementId,
      needsRevalidation: false,
      rowVersion: row.rowVersion + 1,
    })
    .where(and(eq(c.workspaceId, workspaceId), eq(c.id, row.id)))
    .returning({ rowVersion: c.rowVersion });
  if (!out) throw new Error('spec change retire returned no row');
  return out.rowVersion;
}

/** Clears the flag, content unchanged. Returns the new version. */
export async function confirmChange(tx: Tx, workspaceId: string, row: ChangeRow): Promise<number> {
  const [out] = await tx
    .update(c)
    .set({ needsRevalidation: false, rowVersion: row.rowVersion + 1 })
    .where(and(eq(c.workspaceId, workspaceId), eq(c.id, row.id)))
    .returning({ rowVersion: c.rowVersion });
  if (!out) throw new Error('spec change confirm returned no row');
  return out.rowVersion;
}

const CHUNK = 500;

/** The publish flag step: every OPEN change of the model on one of the keys is flagged with the revision that touched it. Returns how many rows. */
export async function flagTouched(tx: Tx, workspaceId: string, modelId: string, keys: readonly string[], revisionNo: number): Promise<number> {
  let flagged = 0;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const rows = await tx
      .update(c)
      .set({ needsRevalidation: true, revalidationRevNo: revisionNo, rowVersion: sql`${c.rowVersion} + 1` })
      .where(and(eq(c.workspaceId, workspaceId), eq(c.modelId, modelId), isNull(c.retiredAt), inArray(c.targetKey, keys.slice(i, i + CHUNK))))
      .returning({ id: c.id });
    flagged += rows.length;
  }
  return flagged;
}
