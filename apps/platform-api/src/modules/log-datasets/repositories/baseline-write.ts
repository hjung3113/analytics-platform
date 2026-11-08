// Write side of the expected baselines (#1478 D-b): `log_datasets.expected_baseline` and the append-only `baseline_event`. Every statement
// is scoped to the session's workspace and runs on the caller's transaction. LOCK ORDER (one order everywhere, so two writers cannot
// deadlock): the dataset row FIRST (`lockDataset`, which also judges visibility), then the baseline rows. The dataset lock is what
// serialises `seq` allocation and the approve/supersede pair of one dataset; the partial unique index `expected_baseline_one_approved_uq`
// is the wall behind it. `platform_app` holds INSERT + a column-limited UPDATE; the guard trigger refuses every other change.

import { and, eq, sql } from 'drizzle-orm';

import { baselineEvents, datasetRevisions, expectedBaselines } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { BaselineSnapshot } from '../domain/baseline-state.js';

export type BaselineRow = typeof expectedBaselines.$inferSelect;
export type RevisionRow = typeof datasetRevisions.$inferSelect;

const b = expectedBaselines;
const r = datasetRevisions;

/** A revision of the workspace (plain read; the revision table is immutable and takes no lock). The dataset's visibility is judged by the caller. */
export async function findRevision(tx: Tx, workspaceId: string, revisionId: string): Promise<RevisionRow | null> {
  const [row] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revisionId)));
  return row ?? null;
}

/** The revision and dataset ids of a baseline (plain read, no lock): the first step of the lock order. */
export async function findBaselineOwner(tx: Tx, workspaceId: string, baselineId: string): Promise<{ datasetId: string; revisionId: string } | null> {
  const [row] = await tx
    .select({ datasetId: r.datasetId, revisionId: r.id })
    .from(b)
    .innerJoin(r, and(eq(r.workspaceId, b.workspaceId), eq(r.id, b.datasetRevisionId)))
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId)));
  return row ?? null;
}

export async function lockBaseline(tx: Tx, workspaceId: string, baselineId: string): Promise<BaselineRow | null> {
  const [row] = await tx
    .select()
    .from(b)
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId)))
    .for('update');
  return row ?? null;
}

/** The approved baseline of a revision, locked; at most one exists. */
export async function lockApprovedOf(tx: Tx, workspaceId: string, revisionId: string): Promise<BaselineRow | null> {
  const [row] = await tx
    .select()
    .from(b)
    .where(and(eq(b.workspaceId, workspaceId), eq(b.datasetRevisionId, revisionId), eq(b.status, 'approved')))
    .for('update');
  return row ?? null;
}

export async function insertDraft(tx: Tx, v: { workspaceId: string; actorId: string; revisionId: string }): Promise<BaselineRow> {
  const [next] = await tx
    .select({ n: sql<number>`coalesce(max(${b.seq}), 0) + 1` })
    .from(b)
    .where(and(eq(b.workspaceId, v.workspaceId), eq(b.datasetRevisionId, v.revisionId)));
  const [row] = await tx
    .insert(b)
    .values({ workspaceId: v.workspaceId, datasetRevisionId: v.revisionId, seq: Number(next?.n ?? 1), authorActorId: v.actorId })
    .returning();
  if (!row) throw new Error('baseline insert returned no row');
  return row;
}

/** The editable columns of a draft (the column grant lists these plus the status/approval columns). */
export interface DraftPatch {
  profilePin?: unknown;
  expectedScope?: unknown;
  expectations?: unknown;
  parserGoldenRef?: unknown;
}

/** One UPDATE of a draft: the patch plus the row_version bump. Returns the new row version. */
export async function patchDraft(tx: Tx, workspaceId: string, baselineId: string, patch: DraftPatch): Promise<number> {
  const [row] = await tx
    .update(b)
    .set({
      ...(patch.profilePin === undefined ? {} : { profilePin: patch.profilePin }),
      ...(patch.expectedScope === undefined ? {} : { expectedScope: patch.expectedScope }),
      ...(patch.expectations === undefined ? {} : { expectations: patch.expectations }),
      ...(patch.parserGoldenRef === undefined ? {} : { parserGoldenRef: patch.parserGoldenRef }),
      rowVersion: sql`${b.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId), eq(b.status, 'draft')))
    .returning({ v: b.rowVersion });
  if (!row) throw new Error('baseline draft update matched no row');
  return row.v;
}

/** approved -> superseded. Content and approval are untouched (the trigger refuses otherwise). */
export async function markSuperseded(tx: Tx, workspaceId: string, baselineId: string): Promise<number> {
  const [row] = await tx
    .update(b)
    .set({ status: 'superseded', supersededAt: sql`now()`, rowVersion: sql`${b.rowVersion} + 1`, updatedAt: sql`now()` })
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId), eq(b.status, 'approved')))
    .returning({ v: b.rowVersion });
  if (!row) throw new Error('baseline supersede matched no row');
  return row.v;
}

/** draft -> approved with the approver. Content is untouched. */
export async function markApproved(tx: Tx, workspaceId: string, baselineId: string, approverActorId: string): Promise<number> {
  const [row] = await tx
    .update(b)
    .set({ status: 'approved', approvedByActorId: approverActorId, approvedAt: sql`now()`, rowVersion: sql`${b.rowVersion} + 1`, updatedAt: sql`now()` })
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId), eq(b.status, 'draft')))
    .returning({ v: b.rowVersion });
  if (!row) throw new Error('baseline approve matched no row');
  return row.v;
}

export interface NewBaselineEvent {
  workspaceId: string;
  baselineId: string;
  kind: 'created' | 'updated' | 'approved' | 'superseded';
  before: BaselineSnapshot | null;
  /** The snapshot, plus a few named facts of the change (`changed`, `bySeq`, `supersededSeq`). */
  after: BaselineSnapshot | (BaselineSnapshot & { changed?: string[]; bySeq?: number; supersededSeq?: number | null });
  reason?: string | null;
  actorId: string;
  selfApproved?: boolean;
}

/** Appends one history row, in the same transaction as the change it records. */
export async function appendEvent(tx: Tx, v: NewBaselineEvent): Promise<void> {
  await tx.insert(baselineEvents).values({
    workspaceId: v.workspaceId,
    baselineId: v.baselineId,
    kind: v.kind,
    before: v.before,
    after: v.after,
    reason: v.reason ?? null,
    actorId: v.actorId,
    selfApproved: v.selfApproved ?? false,
    // `clock_timestamp()`, not the transaction's `now()`: events written in one transaction keep their order.
    at: sql`clock_timestamp()`,
  });
}

