// Writes of the eqv schema. All run in the caller's transaction (`Tx`). Revisions and Templates are insert-only: the runtime role holds
// no UPDATE or DELETE on them (migration 0121), and no function here updates one.
import { and, eq, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { layoutDrafts, layoutRevisions, templates } from '../../../db/schema/eqv.js';

/** One writer per layout id (and per Template id): a creation race waits here and then sees the first row. Held until the transaction ends. */
export async function lockKey(tx: Tx, scope: 'layout' | 'template', workspaceId: string, id: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`eqv.${scope}`}), hashtext(${`${workspaceId}:${id}`}))`);
}

export async function lockedDraft(tx: Tx, workspaceId: string, layoutId: string) {
  await lockKey(tx, 'layout', workspaceId, layoutId);
  const [row] = await tx
    .select()
    .from(layoutDrafts)
    .where(and(eq(layoutDrafts.workspaceId, workspaceId), eq(layoutDrafts.layoutId, layoutId)))
    .for('update');
  return row ?? null;
}

export async function insertDraft(tx: Tx, v: { workspaceId: string; layoutId: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .insert(layoutDrafts)
    .values({ workspaceId: v.workspaceId, layoutId: v.layoutId, document: v.document, createdBy: v.actorId, updatedBy: v.actorId })
    .returning({ id: layoutDrafts.id, version: layoutDrafts.version });
  if (!row) throw new Error('eqv draft insert returned no row');
  return row;
}

export async function updateDraft(tx: Tx, v: { id: string; workspaceId: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .update(layoutDrafts)
    .set({ document: v.document, version: sql`${layoutDrafts.version} + 1`, updatedAt: sql`now()`, updatedBy: v.actorId })
    .where(and(eq(layoutDrafts.workspaceId, v.workspaceId), eq(layoutDrafts.id, v.id)))
    .returning({ id: layoutDrafts.id, version: layoutDrafts.version });
  if (!row) throw new Error('eqv draft update returned no row');
  return row;
}

export async function findRevision(tx: Tx, workspaceId: string, layoutId: string, revision: string) {
  const [row] = await tx
    .select()
    .from(layoutRevisions)
    .where(and(eq(layoutRevisions.workspaceId, workspaceId), eq(layoutRevisions.layoutId, layoutId), eq(layoutRevisions.revision, revision)));
  return row ?? null;
}

export async function insertRevision(tx: Tx, v: { workspaceId: string; layoutId: string; revision: string; document: unknown; actorId: string }) {
  const [row] = await tx
    .insert(layoutRevisions)
    .values({ workspaceId: v.workspaceId, layoutId: v.layoutId, revision: v.revision, document: v.document, publishedBy: v.actorId })
    .returning({ id: layoutRevisions.id });
  if (!row) throw new Error('eqv revision insert returned no row');
  return row;
}

export async function templateExists(tx: Tx, workspaceId: string, templateId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.templateId, templateId)));
  return row !== undefined;
}

export async function insertTemplate(
  tx: Tx,
  v: { workspaceId: string; templateId: string; name: string; document: unknown; layoutId: string; revision: string; actorId: string },
) {
  const [row] = await tx
    .insert(templates)
    .values({
      workspaceId: v.workspaceId,
      templateId: v.templateId,
      name: v.name,
      document: v.document,
      promotedFromLayoutId: v.layoutId,
      promotedFromRevision: v.revision,
      createdBy: v.actorId,
    })
    .returning({ id: templates.id });
  if (!row) throw new Error('eqv template insert returned no row');
  return row;
}
