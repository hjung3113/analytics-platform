// Review side of the knowledge drafts (#1198 b): `knowledge.draft_review` (insert-only, the runtime role holds no UPDATE
// or DELETE and a trigger refuses both) and the reads of a draft's revisions the decision needs. Every statement is
// scoped to the actor's workspace. The caller owns the transaction, the draft row lock and the audit rows.

import { and, desc, eq } from 'drizzle-orm';

import { knowledgeDraftReviews, knowledgeDraftRevisions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';

const rv = knowledgeDraftReviews;
const dr = knowledgeDraftRevisions;

export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

export interface LatestRevision {
  draftRevNo: number;
  payloadDigest: string;
  proposalJson: unknown;
}

/** The draft's latest revision (the one a reviewer judges). */
export async function readRevision(tx: Tx, workspaceId: string, draftId: string, draftRevNo: number): Promise<LatestRevision> {
  const [row] = await tx
    .select({ draftRevNo: dr.draftRevNo, payloadDigest: dr.payloadDigest, proposalJson: dr.proposalJson })
    .from(dr)
    .where(and(eq(dr.workspaceId, workspaceId), eq(dr.draftId, draftId), eq(dr.draftRevNo, draftRevNo)));
  if (!row) throw new Error(`draft ${draftId}: revision ${draftRevNo} is missing`);
  return row;
}

/** How the reviewer took part in the draft: the `author_auth` of every revision they wrote (empty = not an author). */
export async function authorAuthsOf(tx: Tx, workspaceId: string, draftId: string, actorId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ auth: dr.authorAuth })
    .from(dr)
    .where(and(eq(dr.workspaceId, workspaceId), eq(dr.draftId, draftId), eq(dr.authorActorId, actorId)));
  return new Set(rows.map((r) => r.auth));
}

export interface NewReview {
  workspaceId: string;
  draftId: string;
  reviewedDraftRevNo: number;
  decision: ReviewDecision;
  approvedDigest: string | null;
  selfApproval: boolean;
  rationale: string | null;
  postedItemId: string | null;
  postedRevisionNo: number | null;
  reviewerActorId: string;
}

/** Inserts one decision; returns its id. A second final decision on the draft violates `draft_review_final_uq` (23505). */
export async function insertReview(tx: Tx, v: NewReview): Promise<string> {
  const [row] = await tx.insert(rv).values(v).returning({ id: rv.id });
  if (!row) throw new Error('draft review insert returned no row');
  return row.id;
}

export interface ReviewRow {
  id: string;
  decision: string;
  reviewedDraftRevNo: number;
  approvedDigest: string | null;
  selfApproval: boolean;
  rationale: string | null;
  postedItemId: string | null;
  postedRevisionNo: number | null;
  reviewerActorId: string;
  reviewedAt: Date;
}

/** The draft's decisions, newest first. */
export async function listReviews(tx: Tx, workspaceId: string, draftId: string): Promise<ReviewRow[]> {
  return tx
    .select({
      id: rv.id,
      decision: rv.decision,
      reviewedDraftRevNo: rv.reviewedDraftRevNo,
      approvedDigest: rv.approvedDigest,
      selfApproval: rv.selfApproval,
      rationale: rv.rationale,
      postedItemId: rv.postedItemId,
      postedRevisionNo: rv.postedRevisionNo,
      reviewerActorId: rv.reviewerActorId,
      reviewedAt: rv.reviewedAt,
    })
    .from(rv)
    .where(and(eq(rv.workspaceId, workspaceId), eq(rv.draftId, draftId)))
    .orderBy(desc(rv.reviewedAt), desc(rv.id));
}
