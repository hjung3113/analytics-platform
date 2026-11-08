import { ownerVisible } from './draft-read.js';
// Write side of the knowledge drafts (#1198 a): `knowledge.draft` and `knowledge.draft_revision` only, every statement
// scoped to the actor's workspace, no hard delete, never a `knowledge_item*` table. The caller owns the transaction
// and the audit row. The draft a write targets is locked `FOR UPDATE` by `lockDraft` (the action's `currentVersion`)
// BEFORE a revision number is allocated, so `draft_rev_no` is gapless per draft. `draft_revision` is insert-only (the
// runtime role holds no UPDATE or DELETE on it, and a trigger refuses both for every role).

import { type SQL, and, eq, sql } from 'drizzle-orm';

import { knowledgeDraftRevisions, knowledgeDrafts, knowledgeItems } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, canSeeItem } from './access-visibility.js';
import { DRAFT_SCHEMA_VERSION, type NormalizedProposal, type ValidatorRef, proposalDigest } from '../domain/draft-input.js';

export type DraftRow = typeof knowledgeDrafts.$inferSelect;

const d = knowledgeDrafts;
const dr = knowledgeDraftRevisions;

/**
 * Locks the draft `FOR UPDATE`; null when it is not in the workspace OR its owner / target item is hidden from the viewer
 * (#1504: a draft of a hidden owner is not found, even to its author).
 */
export async function lockDraft(tx: Tx, viewer: Viewer, id: string): Promise<DraftRow | null> {
  const [row] = await tx
    .select()
    .from(d)
    .where(and(eq(d.workspaceId, viewer.workspaceId), eq(d.id, id)))
    .for('update');
  if (!row) return null;
  const [visible] = await tx.select({ id: d.id }).from(d).where(and(eq(d.workspaceId, viewer.workspaceId), eq(d.id, id), ownerVisible(viewer)));
  return visible ? row : null;
}

export interface TargetItem {
  id: string;
  latestRevisionNo: number;
  publicationState: string;
  ownerModelId: string | null;
  ownerSoftwareId: string | null;
}

/** The item a revise draft targets (unlocked: the draft FK takes its own key-share lock on insert); null when it is not in the workspace or the viewer cannot see it (#1504). */
export async function readTargetItem(tx: Tx, viewer: Viewer, itemId: string): Promise<TargetItem | null> {
  const workspaceId = viewer.workspaceId;
  if (!(await canSeeItem(tx, viewer, itemId))) return null;
  const [row] = await tx
    .select({
      id: knowledgeItems.id,
      latestRevisionNo: knowledgeItems.latestRevisionNo,
      publicationState: knowledgeItems.publicationState,
      ownerModelId: knowledgeItems.ownerModelId,
      ownerSoftwareId: knowledgeItems.ownerSoftwareId,
    })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, itemId)));
  return row ?? null;
}

export interface NewDraft {
  workspaceId: string;
  actorId: string;
  proposalType: 'create' | 'revise';
  targetItemId: string | null;
  baseRevisionNo: number | null;
  ownerModelId: string | null;
  ownerSoftwareId: string | null;
  origin: 'human' | 'ai' | 'validator';
  validatorRef?: ValidatorRef | undefined;
}

/**
 * A new draft in status `draft` at revision 1 (the revision row follows via `insertDraftRevision`). With a validator ref the
 * insert is `ON CONFLICT DO NOTHING` on the ref's partial unique index and answers null when the finding already has a draft
 * (no raw 23505 is raised, so the caller's transaction is not aborted).
 */
export async function insertDraft(tx: Tx, v: NewDraft): Promise<DraftRow | null> {
  const query = tx
    .insert(d)
    .values({
      workspaceId: v.workspaceId,
      origin: v.origin,
      validatorSourceSystem: v.validatorRef?.sourceSystem ?? null,
      validatorRunId: v.validatorRef?.runId ?? null,
      validatorFindingId: v.validatorRef?.findingId ?? null,
      proposalType: v.proposalType,
      targetItemId: v.targetItemId,
      baseRevisionNo: v.baseRevisionNo,
      ownerModelId: v.ownerModelId,
      ownerSoftwareId: v.ownerSoftwareId,
      status: 'draft',
      latestDraftRev: 1,
      submitterActorId: v.actorId,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    });
  if (!v.validatorRef) {
    const [row] = await query.returning();
    if (!row) throw new Error('draft insert returned no row');
    return row;
  }
  const [row] = await query
    .onConflictDoNothing({
      target: [d.workspaceId, d.validatorSourceSystem, d.validatorRunId, d.validatorFindingId],
      where: sql`${d.validatorSourceSystem} is not null`,
    })
    .returning();
  return row ?? null;
}

/** The draft already stored for a validator finding in the workspace (workspace-scoped), or null. */
export async function findDraftByValidatorRef(tx: Tx, workspaceId: string, ref: ValidatorRef): Promise<DraftRow | null> {
  const [row] = await tx
    .select()
    .from(d)
    .where(
      and(
        eq(d.workspaceId, workspaceId),
        eq(d.validatorSourceSystem, ref.sourceSystem),
        eq(d.validatorRunId, ref.runId),
        eq(d.validatorFindingId, ref.findingId),
      ),
    );
  return row ?? null;
}

/** Appends revision `draftRevNo` (the caller computed it from the locked draft); returns the payload digest. */
export async function insertDraftRevision(
  tx: Tx,
  workspaceId: string,
  draftId: string,
  draftRevNo: number,
  actorId: string,
  proposal: NormalizedProposal,
  authorAuth: 'session' | 'token',
): Promise<string> {
  const payloadDigest = proposalDigest(proposal);
  await tx.insert(dr).values({
    workspaceId,
    draftId,
    draftRevNo,
    proposalJson: proposal,
    payloadDigest,
    schemaVersion: DRAFT_SCHEMA_VERSION,
    authorActorId: actorId,
    authorAuth,
  });
  return payloadDigest;
}

/** The digest of the draft's latest revision. */
export async function latestDigest(tx: Tx, workspaceId: string, draft: Pick<DraftRow, 'id' | 'latestDraftRev'>): Promise<string> {
  const [row] = await tx
    .select({ digest: dr.payloadDigest })
    .from(dr)
    .where(and(eq(dr.workspaceId, workspaceId), eq(dr.draftId, draft.id), eq(dr.draftRevNo, draft.latestDraftRev)));
  if (!row) throw new Error(`draft ${draft.id}: latest revision ${draft.latestDraftRev} is missing`);
  return row.digest;
}

/** The mutable columns of `draft` (the column grant lists exactly these). */
export interface DraftPatch {
  status?: string;
  latestDraftRev?: number;
  submittedAt?: Date | SQL;
  closedAt?: Date | SQL;
  closedBy?: string;
  closeReason?: string | null;
}

/** One UPDATE: the patch plus the row_version bump and the audit columns. Returns the new row. */
export async function patchDraft(tx: Tx, workspaceId: string, id: string, actorId: string, patch: DraftPatch): Promise<DraftRow> {
  const [row] = await tx
    .update(d)
    .set({ ...patch, rowVersion: sql`${d.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, id)))
    .returning();
  if (!row) throw new Error(`draft ${id}: update matched no row`);
  return row;
}
