// Write side of the attempt opinions (#1778, ADR-0117 amendment 2). Every statement is scoped to a workspace and runs on the
// caller's transaction, under the attempt row lock the service holds (per-attempt totals and the resend check are read under it).
// `attempt_opinion` is insert-only for the runtime role; nothing here touches `rule_result`, `execution_attempt` or a verdict.

import { and, eq, inArray, sql } from 'drizzle-orm';

import { attemptOpinions, ruleResults } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { OpinionEvidence, ParsedOpinion } from '../domain/opinion-input.js';

export interface StoredOpinionContent {
  itemKey: string;
  grade: string;
  mark: string | null;
  note: string | null;
  evidence: OpinionEvidence[];
  inputRevision: string | null;
  producer: string | null;
}

/** `rule_id -> rule_result.id` of the attempt, for the item keys that name a rule result of this attempt. */
export async function ruleResultIdsByRuleId(tx: Tx, workspaceId: string, attemptId: string, itemKeys: readonly string[]): Promise<Map<string, string>> {
  if (itemKeys.length === 0) return new Map();
  const rows = await tx
    .select({ id: ruleResults.id, ruleId: ruleResults.ruleId })
    .from(ruleResults)
    .where(and(eq(ruleResults.workspaceId, workspaceId), eq(ruleResults.attemptId, attemptId), inArray(ruleResults.ruleId, [...itemKeys])));
  return new Map(rows.map((r) => [r.ruleId, r.id]));
}

/** Rows and note bytes already stored for the attempt (the per-attempt caps, judged under the attempt row lock). */
export async function attemptOpinionTotals(tx: Tx, workspaceId: string, attemptId: string): Promise<{ rows: number; noteBytes: number }> {
  const [row] = await tx
    .select({ rows: sql<number>`count(*)::int`, noteBytes: sql<number>`coalesce(sum(octet_length(${attemptOpinions.note})), 0)::int` })
    .from(attemptOpinions)
    .where(and(eq(attemptOpinions.workspaceId, workspaceId), eq(attemptOpinions.attemptId, attemptId)));
  return { rows: Number(row?.rows ?? 0), noteBytes: Number(row?.noteBytes ?? 0) };
}

/** What this actor already stored under `submissionId` for the attempt, by item key (the resend check). */
export async function opinionsOfSubmission(
  tx: Tx,
  workspaceId: string,
  attemptId: string,
  actorId: string,
  submissionId: string,
  itemKeys: readonly string[],
): Promise<Map<string, StoredOpinionContent>> {
  const rows = await tx
    .select()
    .from(attemptOpinions)
    .where(
      and(
        eq(attemptOpinions.workspaceId, workspaceId),
        eq(attemptOpinions.attemptId, attemptId),
        eq(attemptOpinions.actorId, actorId),
        eq(attemptOpinions.submissionId, submissionId),
        inArray(attemptOpinions.itemKey, [...itemKeys]),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.itemKey,
      {
        itemKey: r.itemKey,
        grade: r.grade,
        mark: r.mark,
        note: r.note,
        evidence: Array.isArray(r.evidence) ? (r.evidence as OpinionEvidence[]) : [],
        inputRevision: r.inputRevision,
        producer: r.producer,
      },
    ]),
  );
}

/**
 * Inserts new rows. `created_at` is `clock_timestamp()`, not the transaction start: two submissions for one item are serialised by
 * the attempt lock, so the later commit must also carry the later time (the current opinion is the latest row).
 */
export async function insertOpinions(
  tx: Tx,
  v: { workspaceId: string; attemptId: string; actorId: string; tokenId: string | null; submissionId: string; rows: readonly (ParsedOpinion & { ruleResultId: string | null })[] },
): Promise<void> {
  if (v.rows.length === 0) return;
  await tx.insert(attemptOpinions).values(
    v.rows.map((o) => ({
      workspaceId: v.workspaceId,
      attemptId: v.attemptId,
      itemKey: o.itemKey,
      ruleResultId: o.ruleResultId,
      actorId: v.actorId,
      tokenId: v.tokenId,
      submissionId: v.submissionId,
      grade: o.grade,
      mark: o.mark,
      note: o.note,
      evidence: o.evidence,
      inputRevision: o.inputRevision,
      producer: o.producer,
      createdAt: sql`clock_timestamp()`,
    })),
  );
}
