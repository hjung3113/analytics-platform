// The Hub's Top View pointers (#1656): reads for the model profile and the writes of link / unlink. The pointer table is the Hub's;
// the Revision document is read through the eqv read service, never copied. Every statement is scoped to the workspace and goes through
// the object-access rule (a hidden model or SW version answers like a missing one).
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { equipmentModels, modelTopviewLinks, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, ref, visibleSoftwareSql } from './access-visibility.js';

export interface TopViewSoftware {
  id: string;
  version: string;
  releaseOrder: number;
}

export interface TopViewLinkRow {
  id: string;
  fromSoftwareId: string | null;
  fromSoftwareVersion: string | null;
  fromReleaseOrder: number | null;
  layoutId: string;
  revision: string;
  version: number;
}

/** SW versions of the model the viewer may see, oldest release first (ties by id). */
export async function visibleModelSoftware(tx: Tx, viewer: Viewer, modelId: string): Promise<TopViewSoftware[]> {
  const rows = await tx
    .select({ id: softwareVersions.id, version: softwareVersions.versionLabel, releaseOrder: softwareVersions.releaseOrder })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.modelId, modelId), visibleSoftwareSql(viewer, ref(softwareVersions.id))))
    .orderBy(asc(softwareVersions.releaseOrder), asc(softwareVersions.id));
  return rows;
}

/** The model's pointers whose start SW (when set) the viewer may see: a hidden SW leaves no id, version or row here. */
export async function listModelLinks(tx: Tx, viewer: Viewer, modelId: string): Promise<TopViewLinkRow[]> {
  const l = modelTopviewLinks;
  const rows = await tx
    .select({
      id: l.id,
      fromSoftwareId: l.fromSoftwareId,
      fromSoftwareVersion: softwareVersions.versionLabel,
      fromReleaseOrder: softwareVersions.releaseOrder,
      layoutId: l.layoutId,
      revision: l.layoutRevision,
      version: l.version,
    })
    .from(l)
    .leftJoin(softwareVersions, and(eq(softwareVersions.workspaceId, l.workspaceId), eq(softwareVersions.id, l.fromSoftwareId)))
    .where(and(eq(l.workspaceId, viewer.workspaceId), eq(l.modelId, modelId), sql`(${l.fromSoftwareId} is null or ${visibleSoftwareSql(viewer, ref(softwareVersions.id))})`))
    .orderBy(asc(softwareVersions.releaseOrder), asc(l.id));
  return rows;
}

/** The software version `softwareId` when it belongs to `modelId` and the viewer may see it; `null` otherwise. */
export async function softwareOfModel(tx: Tx, viewer: Viewer, modelId: string, softwareId: string): Promise<TopViewSoftware | null> {
  const [row] = await tx
    .select({ id: softwareVersions.id, version: softwareVersions.versionLabel, releaseOrder: softwareVersions.releaseOrder, modelId: softwareVersions.modelId })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, softwareId), visibleSoftwareSql(viewer, ref(softwareVersions.id))));
  return row && row.modelId === modelId ? { id: row.id, version: row.version, releaseOrder: row.releaseOrder } : null;
}


/**
 * The concurrency token of a pointer: `<linkId>:<version>`. The id is never reused, so a token read from a row that was unlinked can
 * never match a row created later at the same key. `'0'` means "no row" and is not a token.
 */
export const linkVersionToken = (row: { id: string; version: number }): string => `${row.id}:${row.version}`;

/**
 * Locks the model row (serialises link writes of one model) and returns the pointer for (model, start SW), if any.
 * A start SW the viewer cannot see (or of another model) answers like a missing one: no row, no version, nothing to delete. The SW is
 * locked for share and judged again under the locks, so a concurrent access change cannot slip between check and read.
 */
export async function lockedLink(tx: Tx, viewer: Viewer, modelId: string, fromSoftwareId: string | null) {
  const l = modelTopviewLinks;
  await tx
    .select({ id: equipmentModels.id })
    .from(equipmentModels)
    .where(and(eq(equipmentModels.workspaceId, viewer.workspaceId), eq(equipmentModels.id, modelId)))
    .for('update');
  if (fromSoftwareId !== null) {
    await tx
      .select({ id: softwareVersions.id })
      .from(softwareVersions)
      .where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, fromSoftwareId)))
      .for('share');
    if (!(await softwareOfModel(tx, viewer, modelId, fromSoftwareId))) return null;
  }
  const [row] = await tx
    .select()
    .from(l)
    .where(and(eq(l.workspaceId, viewer.workspaceId), eq(l.modelId, modelId), fromSoftwareId === null ? isNull(l.fromSoftwareId) : eq(l.fromSoftwareId, fromSoftwareId)))
    .for('update');
  return row ?? null;
}

export async function insertLink(tx: Tx, v: { workspaceId: string; modelId: string; fromSoftwareId: string | null; layoutId: string; revision: string; actorId: string }) {
  const [row] = await tx
    .insert(modelTopviewLinks)
    .values({
      workspaceId: v.workspaceId,
      modelId: v.modelId,
      fromSoftwareId: v.fromSoftwareId,
      layoutId: v.layoutId,
      layoutRevision: v.revision,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning();
  return row as NonNullable<typeof row>;
}

export async function updateLink(tx: Tx, v: { id: string; workspaceId: string; layoutId: string; revision: string; actorId: string }) {
  const l = modelTopviewLinks;
  const [row] = await tx
    .update(l)
    .set({ layoutId: v.layoutId, layoutRevision: v.revision, version: sql`${l.version} + 1`, updatedAt: sql`now()`, updatedBy: v.actorId })
    .where(and(eq(l.workspaceId, v.workspaceId), eq(l.id, v.id)))
    .returning();
  return row as NonNullable<typeof row>;
}

export async function deleteLink(tx: Tx, workspaceId: string, id: string): Promise<void> {
  await tx.delete(modelTopviewLinks).where(and(eq(modelTopviewLinks.workspaceId, workspaceId), eq(modelTopviewLinks.id, id)));
}

