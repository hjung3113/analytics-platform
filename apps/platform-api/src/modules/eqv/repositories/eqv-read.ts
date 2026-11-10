// Reads of the eqv schema. Every statement is scoped to the workspace of the actor.
import { and, asc, desc, eq } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { equipment, layoutDrafts, layoutRevisions, templates } from '../../../db/schema/eqv.js';

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

export async function listDrafts(db: Tx, workspaceId: string) {
  const rows = await db
    .select({ id: layoutDrafts.id, layoutId: layoutDrafts.layoutId, version: layoutDrafts.version, updatedAt: layoutDrafts.updatedAt })
    .from(layoutDrafts)
    .where(eq(layoutDrafts.workspaceId, workspaceId))
    .orderBy(asc(layoutDrafts.layoutId));
  return rows.map((r) => ({ id: r.id, layoutId: r.layoutId, version: String(r.version), updatedAt: iso(r.updatedAt) }));
}

export async function getDraft(db: Tx, workspaceId: string, layoutId: string) {
  const [r] = await db
    .select()
    .from(layoutDrafts)
    .where(and(eq(layoutDrafts.workspaceId, workspaceId), eq(layoutDrafts.layoutId, layoutId)));
  return r
    ? { id: r.id, layoutId: r.layoutId, version: String(r.version), document: r.document, updatedAt: iso(r.updatedAt) }
    : null;
}

export async function listRevisions(db: Tx, workspaceId: string, layoutId: string) {
  const rows = await db
    .select({ id: layoutRevisions.id, revision: layoutRevisions.revision, publishedAt: layoutRevisions.publishedAt })
    .from(layoutRevisions)
    .where(and(eq(layoutRevisions.workspaceId, workspaceId), eq(layoutRevisions.layoutId, layoutId)))
    .orderBy(desc(layoutRevisions.publishedAt), asc(layoutRevisions.revision));
  return rows.map((r) => ({ id: r.id, layoutId, revision: r.revision, publishedAt: iso(r.publishedAt) }));
}

export async function getRevision(db: Tx, workspaceId: string, layoutId: string, revision: string) {
  const [r] = await db
    .select()
    .from(layoutRevisions)
    .where(and(eq(layoutRevisions.workspaceId, workspaceId), eq(layoutRevisions.layoutId, layoutId), eq(layoutRevisions.revision, revision)));
  return r
    ? { id: r.id, layoutId: r.layoutId, revision: r.revision, document: r.document, publishedAt: iso(r.publishedAt) }
    : null;
}

/** Every published Revision of the workspace, newest first, at most `limit` rows (no document). */
export async function listPublishedRevisions(db: Tx, workspaceId: string, limit: number) {
  const rows = await db
    .select({ layoutId: layoutRevisions.layoutId, revision: layoutRevisions.revision, publishedAt: layoutRevisions.publishedAt })
    .from(layoutRevisions)
    .where(eq(layoutRevisions.workspaceId, workspaceId))
    .orderBy(desc(layoutRevisions.publishedAt), asc(layoutRevisions.layoutId), asc(layoutRevisions.revision))
    .limit(limit);
  return rows.map((r) => ({ layoutId: r.layoutId, revision: r.revision, publishedAt: iso(r.publishedAt) }));
}

export async function listTemplates(db: Tx, workspaceId: string) {
  const rows = await db
    .select({
      id: templates.id,
      templateId: templates.templateId,
      name: templates.name,
      promotedFromLayoutId: templates.promotedFromLayoutId,
      promotedFromRevision: templates.promotedFromRevision,
      createdAt: templates.createdAt,
    })
    .from(templates)
    .where(eq(templates.workspaceId, workspaceId))
    .orderBy(asc(templates.templateId));
  return rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
}

export async function getTemplate(db: Tx, workspaceId: string, templateId: string) {
  const [r] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.templateId, templateId)));
  return r ? { ...r, createdAt: iso(r.createdAt) } : null;
}

/** Equipment the viewer can pick. `dataRange` is `[from, to)` and stays `null` until step 9 reads recorded data. At most 1000 options. */
export async function equipmentOptions(db: Tx, workspaceId: string) {
  const rows = await db
    .select({ id: equipment.equipmentId, label: equipment.label })
    .from(equipment)
    .where(eq(equipment.workspaceId, workspaceId))
    .orderBy(asc(equipment.label), asc(equipment.equipmentId))
    .limit(1000);
  return rows.map((r) => ({ id: r.id, label: r.label, dataRange: null as { from: string; to: string } | null }));
}
