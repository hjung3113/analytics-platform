// Write side of the regression suites and their runs (#1479 D-c): `log_datasets.regression_suite`, `suite_run`, `suite_run_item`. Every
// statement is scoped to the session's workspace and runs on the caller's transaction. A suite names datasets; the datasets an actor
// may name or run are the ones they can SEE (`datasetVisibleTo`), so a private dataset of another owner is the same absence as a missing
// one. `platform_app` holds INSERT on the three tables and a column-limited UPDATE on the suite; a run and its items are immutable (trigger).
// The execution requests of the items are NOT written here: log-datasets calls the lifecycle port (`deps.lifecycleRequests`).

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { datasetRevisions, datasets, expectedBaselines, regressionSuites, suiteRunItems, suiteRuns } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { ProfilePin } from '../domain/baseline-input.js';
import type { SampleSet } from '../domain/sample-manifest.js';
import type { SuiteItem } from '../domain/suite-input.js';
import { datasetVisibleTo } from './dataset-write.js';

export type SuiteRow = typeof regressionSuites.$inferSelect;
export type SuiteRunRow = typeof suiteRuns.$inferSelect;

const s = regressionSuites;
const d = datasets;
const r = datasetRevisions;
const b = expectedBaselines;

export interface NewSuite {
  workspaceId: string;
  actorId: string;
  name: string;
  items: SuiteItem[];
  engineProfileRef: string | null;
  requiredPin: ProfilePin;
}

export async function insertSuite(tx: Tx, v: NewSuite): Promise<SuiteRow> {
  const [row] = await tx
    .insert(s)
    .values({ workspaceId: v.workspaceId, name: v.name, items: v.items, engineProfileRef: v.engineProfileRef, requiredPin: v.requiredPin, createdBy: v.actorId, updatedBy: v.actorId })
    .returning();
  if (!row) throw new Error('suite insert returned no row');
  return row;
}

export async function lockSuite(tx: Tx, workspaceId: string, suiteId: string): Promise<SuiteRow | null> {
  const [row] = await tx
    .select()
    .from(s)
    .where(and(eq(s.workspaceId, workspaceId), eq(s.id, suiteId)))
    .for('update');
  return row ?? null;
}

/** The mutable columns of `regression_suite` (the column grant lists exactly these plus the audit columns). */
export interface SuitePatch {
  name?: string;
  items?: SuiteItem[];
  engineProfileRef?: string | null;
  requiredPin?: ProfilePin;
}

/** One UPDATE: the patch plus the row_version bump and the audit columns. Returns the new row version. */
export async function patchSuite(tx: Tx, workspaceId: string, suiteId: string, actorId: string, patch: SuitePatch): Promise<number> {
  const [row] = await tx
    .update(s)
    .set({ ...patch, rowVersion: sql`${s.rowVersion} + 1`, updatedAt: sql`now()`, updatedBy: actorId })
    .where(and(eq(s.workspaceId, workspaceId), eq(s.id, suiteId)))
    .returning({ v: s.rowVersion });
  if (!row) throw new Error('suite update matched no row');
  return row.v;
}

/** Why an item cannot be named in a suite: reported as a field error at `items.<i>.<field>`. */
export type ItemRefProblem = { field: 'datasetId' | 'datasetRevisionId' | 'baselineId'; code: 'not_found' };

/**
 * Checks, for one suite item, that the dataset is visible to the actor and that a named revision / baseline belongs to it (existence only:
 * whether the baseline is approved is judged when the suite RUNS). Plain reads, no locks.
 */
export async function checkItemRefs(tx: Tx, workspaceId: string, actorId: string, item: SuiteItem): Promise<ItemRefProblem[]> {
  const [dataset] = await tx
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, item.datasetId), datasetVisibleTo(actorId)));
  if (!dataset) return [{ field: 'datasetId', code: 'not_found' }];
  const problems: ItemRefProblem[] = [];
  if (item.datasetRevisionId !== undefined) {
    const [rev] = await tx.select({ id: r.id }).from(r).where(and(eq(r.workspaceId, workspaceId), eq(r.id, item.datasetRevisionId), eq(r.datasetId, item.datasetId)));
    if (!rev) problems.push({ field: 'datasetRevisionId', code: 'not_found' });
  }
  if (item.baselineId !== undefined) {
    const [base] = await tx
      .select({ id: b.id, revisionId: b.datasetRevisionId })
      .from(b)
      .innerJoin(r, and(eq(r.workspaceId, b.workspaceId), eq(r.id, b.datasetRevisionId)))
      .where(and(eq(b.workspaceId, workspaceId), eq(b.id, item.baselineId), eq(r.datasetId, item.datasetId)));
    // A named revision and a named baseline must agree: the baseline is of that revision.
    if (!base || (item.datasetRevisionId !== undefined && base.revisionId !== item.datasetRevisionId)) problems.push({ field: 'baselineId', code: 'not_found' });
  }
  return problems;
}

/** What one suite item resolved to at run time: pinned in the run. */
export interface ResolvedItem {
  datasetId: string;
  datasetName: string;
  revisionId: string;
  revisionSeq: number;
  sampleSet: SampleSet;
  sampleManifestDigest: string;
  baselineId: string;
  baselineSeq: number;
  profilePin: ProfilePin;
  expectedScope: unknown;
  expectations: unknown;
}

export type ResolveProblem = 'not_found' | 'archived' | 'no_approved_baseline' | 'baseline_not_approved';

/**
 * Resolves one item to an APPROVED baseline and its revision: a named baseline must be approved; otherwise a named revision's approved
 * baseline; otherwise the latest revision that has an approved baseline. A dataset the actor cannot see is `not_found`, an archived one
 * `archived`. Plain reads: the revision and an approved baseline never change, so what is pinned stays true whatever happens next.
 */
export async function resolveItem(tx: Tx, workspaceId: string, actorId: string, item: SuiteItem): Promise<ResolvedItem | ResolveProblem> {
  const [dataset] = await tx
    .select({ id: d.id, name: d.name, status: d.status })
    .from(d)
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, item.datasetId), datasetVisibleTo(actorId)));
  if (!dataset) return 'not_found';
  if (dataset.status === 'archived') return 'archived';
  const pick = {
    revisionId: r.id,
    revisionSeq: r.seq,
    sampleSet: r.sampleSet,
    sampleManifestDigest: r.sampleManifestDigest,
    baselineId: b.id,
    baselineSeq: b.seq,
    baselineStatus: b.status,
    profilePin: b.profilePin,
    expectedScope: b.expectedScope,
    expectations: b.expectations,
  };
  const joined = () => tx.select(pick).from(b).innerJoin(r, and(eq(r.workspaceId, b.workspaceId), eq(r.id, b.datasetRevisionId)));
  let row;
  if (item.baselineId !== undefined) {
    [row] = await joined().where(and(eq(b.workspaceId, workspaceId), eq(b.id, item.baselineId), eq(r.datasetId, item.datasetId)));
    if (!row || (item.datasetRevisionId !== undefined && row.revisionId !== item.datasetRevisionId)) return 'not_found';
    if (row.baselineStatus !== 'approved') return 'baseline_not_approved';
  } else if (item.datasetRevisionId !== undefined) {
    const [rev] = await tx.select({ id: r.id }).from(r).where(and(eq(r.workspaceId, workspaceId), eq(r.id, item.datasetRevisionId), eq(r.datasetId, item.datasetId)));
    if (!rev) return 'not_found';
    [row] = await joined().where(and(eq(b.workspaceId, workspaceId), eq(b.datasetRevisionId, rev.id), eq(b.status, 'approved')));
    if (!row) return 'no_approved_baseline';
  } else {
    [row] = await joined()
      .where(and(eq(b.workspaceId, workspaceId), eq(r.datasetId, item.datasetId), eq(b.status, 'approved')))
      .orderBy(desc(r.seq))
      .limit(1);
    if (!row) return 'no_approved_baseline';
  }
  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    revisionId: row.revisionId,
    revisionSeq: row.revisionSeq,
    sampleSet: row.sampleSet as SampleSet,
    sampleManifestDigest: row.sampleManifestDigest,
    baselineId: row.baselineId,
    baselineSeq: row.baselineSeq,
    profilePin: row.profilePin as ProfilePin,
    expectedScope: row.expectedScope,
    expectations: row.expectations,
  };
}

export async function findRunByKey(tx: Tx, workspaceId: string, suiteId: string, actorId: string, key: string): Promise<SuiteRunRow | null> {
  const [row] = await tx
    .select()
    .from(suiteRuns)
    .where(and(eq(suiteRuns.workspaceId, workspaceId), eq(suiteRuns.suiteId, suiteId), eq(suiteRuns.requestedByActorId, actorId), eq(suiteRuns.idempotencyKey, key)));
  return row ?? null;
}

export async function insertRun(
  tx: Tx,
  v: { workspaceId: string; suiteId: string; actorId: string; idempotencyKey: string; engineProfileRef: string | null; requiredPin: ProfilePin },
): Promise<SuiteRunRow> {
  const [row] = await tx
    .insert(suiteRuns)
    .values({ workspaceId: v.workspaceId, suiteId: v.suiteId, requestedByActorId: v.actorId, idempotencyKey: v.idempotencyKey, engineProfileRef: v.engineProfileRef, requiredPin: v.requiredPin })
    .returning();
  if (!row) throw new Error('suite run insert returned no row');
  return row;
}

export interface NewRunItem {
  id: string;
  workspaceId: string;
  suiteRunId: string;
  ordinal: number;
  datasetId: string;
  datasetRevisionId: string;
  baselineId: string;
  sampleManifestDigest: string;
  baselineDigest: string;
  baselineStale: unknown;
  requestId: string;
}

export async function insertRunItem(tx: Tx, v: NewRunItem): Promise<void> {
  await tx.insert(suiteRunItems).values(v);
}

export async function runItemIds(tx: Tx, workspaceId: string, runIds: readonly string[]) {
  if (runIds.length === 0) return [];
  return tx
    .select({ id: suiteRunItems.id, suiteRunId: suiteRunItems.suiteRunId, ordinal: suiteRunItems.ordinal, requestId: suiteRunItems.requestId })
    .from(suiteRunItems)
    .where(and(eq(suiteRunItems.workspaceId, workspaceId), inArray(suiteRunItems.suiteRunId, [...runIds])));
}
