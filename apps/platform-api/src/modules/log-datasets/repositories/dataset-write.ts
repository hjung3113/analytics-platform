// Write side of the log test datasets (#1477 D-a): every statement is scoped to the session's workspace and runs on the caller's
// transaction. A dataset the actor cannot see (another workspace's, or another owner's `private` one) is the same absence as a missing
// id. The dataset row is locked FOR UPDATE before a revision `seq` is allocated, so the seqs are gapless per dataset.
// `platform_app` holds INSERT on the three tables and a column-limited UPDATE on dataset and candidate; the guard triggers refuse a
// missing `row_version` bump, an identity change, an edit of an archived dataset or a decided candidate, and any edit of a revision.

import { type SQL, and, eq, or, sql } from 'drizzle-orm';

import { datasetCandidates, datasetRevisions, datasets } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';

export type DatasetRow = typeof datasets.$inferSelect;
export type RevisionRow = typeof datasetRevisions.$inferSelect;
export type CandidateRow = typeof datasetCandidates.$inferSelect;

const d = datasets;
const r = datasetRevisions;
const c = datasetCandidates;

/** A private dataset is its owner's alone; a workspace one is every member's. Always together with the workspace equality. */
export const datasetVisibleTo = (actorId: string): SQL => or(eq(d.shareScope, 'workspace'), eq(d.ownerActorId, actorId)) as SQL;

export async function lockDataset(tx: Tx, workspaceId: string, actorId: string, datasetId: string): Promise<DatasetRow | null> {
  const [row] = await tx
    .select()
    .from(d)
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, datasetId), datasetVisibleTo(actorId)))
    .for('update');
  return row ?? null;
}

export interface NewDataset {
  workspaceId: string;
  actorId: string;
  ownerActorId: string;
  name: string;
  purpose: string;
  shareScope: string;
  modelIds: string[];
  scenarioTags: string[];
  synthetic: boolean;
}

export async function insertDataset(tx: Tx, v: NewDataset): Promise<DatasetRow> {
  const [row] = await tx
    .insert(d)
    .values({
      workspaceId: v.workspaceId,
      name: v.name,
      purpose: v.purpose,
      ownerActorId: v.ownerActorId,
      shareScope: v.shareScope,
      modelIds: v.modelIds,
      scenarioTags: v.scenarioTags,
      synthetic: v.synthetic,
      createdBy: v.actorId,
      updatedBy: v.actorId,
    })
    .returning();
  if (!row) throw new Error('dataset insert returned no row');
  return row;
}

/** The mutable columns of `dataset` (the column grant lists exactly these plus the audit columns). */
export interface DatasetPatch {
  name?: string;
  purpose?: string;
  shareScope?: string;
  modelIds?: string[];
  scenarioTags?: string[];
  status?: string;
}

/** One UPDATE: the patch plus the row_version bump and the audit columns. Returns the new row version. */
export async function patchDataset(tx: Tx, workspaceId: string, datasetId: string, actorId: string, patch: DatasetPatch): Promise<number> {
  const [row] = await tx
    .update(d)
    .set({ ...patch, rowVersion: sql`${d.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, datasetId)))
    .returning({ v: d.rowVersion });
  if (!row) throw new Error('dataset update matched no row');
  return row.v;
}

export async function countRevisions(tx: Tx, workspaceId: string, datasetId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.datasetId, datasetId)));
  return Number(row?.n ?? 0);
}

export interface NewRevision {
  workspaceId: string;
  actorId: string;
  datasetId: string;
  sampleSet: unknown;
  sampleManifestDigest: string;
  inputMeta: Record<string, unknown>;
  note: string | null;
}

/** Inserts the next revision (seq = max + 1 under the dataset lock). A repeated digest of the dataset violates `REVISION_DIGEST_CONSTRAINT`. */
export async function insertRevision(tx: Tx, v: NewRevision): Promise<RevisionRow> {
  const [next] = await tx
    .select({ n: sql<number>`coalesce(max(${r.seq}), 0) + 1` })
    .from(r)
    .where(and(eq(r.workspaceId, v.workspaceId), eq(r.datasetId, v.datasetId)));
  const [row] = await tx
    .insert(r)
    .values({
      workspaceId: v.workspaceId,
      datasetId: v.datasetId,
      seq: Number(next?.n ?? 1),
      sampleSet: v.sampleSet,
      sampleManifestDigest: v.sampleManifestDigest,
      inputMeta: v.inputMeta,
      note: v.note,
      createdBy: v.actorId,
    })
    .returning();
  if (!row) throw new Error('dataset revision insert returned no row');
  return row;
}

export interface NewCandidate {
  workspaceId: string;
  actorId: string;
  origin: string;
  sourceRef: Record<string, unknown>;
  proposal: Record<string, unknown>;
}

export async function insertCandidate(tx: Tx, v: NewCandidate): Promise<CandidateRow> {
  const [row] = await tx
    .insert(c)
    .values({ workspaceId: v.workspaceId, origin: v.origin, sourceRef: v.sourceRef, proposal: v.proposal, proposedBy: v.actorId })
    .returning();
  if (!row) throw new Error('dataset candidate insert returned no row');
  return row;
}

export async function lockCandidate(tx: Tx, workspaceId: string, candidateId: string): Promise<CandidateRow | null> {
  const [row] = await tx
    .select()
    .from(c)
    .where(and(eq(c.workspaceId, workspaceId), eq(c.id, candidateId)))
    .for('update');
  return row ?? null;
}

export async function decideCandidate(
  tx: Tx,
  workspaceId: string,
  candidateId: string,
  v: { status: 'approved' | 'rejected'; reviewerActorId: string; reason: string | null; datasetId: string | null },
): Promise<number> {
  const [row] = await tx
    .update(c)
    .set({
      status: v.status,
      reviewerActorId: v.reviewerActorId,
      reason: v.reason,
      datasetId: v.datasetId,
      decidedAt: sql`now()`,
      rowVersion: sql`${c.rowVersion} + 1`,
    })
    .where(and(eq(c.workspaceId, workspaceId), eq(c.id, candidateId)))
    .returning({ v: c.rowVersion });
  if (!row) throw new Error('dataset candidate update matched no row');
  return row.v;
}

/** The pg error behind a driver or drizzle wrapper. */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, ...(typeof e.constraint === 'string' ? { constraint: e.constraint } : {}) };
    }
    current = e.cause;
  }
  return null;
}

/** A violated unique index, by NAME only: the same content twice in one dataset is the race the service check cannot close. */
export const REVISION_DIGEST_CONSTRAINT = 'dataset_revision_dataset_digest_uq';

export async function mapUnique<T>(work: () => Promise<T>, constraint: string, toInvalid: () => Error): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const pg = pgError(error);
    if (pg?.code === '23505' && pg.constraint === constraint) throw toInvalid();
    throw error;
  }
}
