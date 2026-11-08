// Read side of the comparison (#1480 D-d): `log_datasets.*` only; the item requests' states and the observed rule results come from the two
// lifecycle barrel ports the caller passes in, on the caller's transaction (no lifecycle table is selected here). Every statement is scoped to
// the session's workspace; an item whose dataset the actor cannot see is `restricted` (no id, name, digest or rules), so a private dataset's
// results never leak. The comparison is COMPUTED here at read time from the pinned baseline of the run item and the latest `succeeded`
// attempt's rule results — nothing is copied or stored. Output: rule ids, classifications, counts and ids; no log text, no excerpt.

import { and, asc, eq, sql } from 'drizzle-orm';

import { datasetRevisions, datasets, expectedBaselines, suiteReviewLabels, suiteRunItems, suiteRuns } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { SuiteRequestPort, SuiteResultReadPort } from '../../log-lifecycle/index.js';
import {
  type ClassificationCounts,
  type Coverage,
  type Expected,
  type ExpectationIn,
  type Observed,
  type ObservedIn,
  type RuleComparison,
  compareRules,
  computeCoverage,
  countClassifications,
} from '../domain/comparison.js';
import type { ReviewLabel } from '../domain/review-label-input.js';
import { type RequestStateCounts, type SuiteRunState, countRequestStates, deriveRunState } from '../domain/suite-state.js';

const d = datasets;
const r = datasetRevisions;
const b = expectedBaselines;
const i = suiteRunItems;
const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

export interface LabelOut {
  label: ReviewLabel;
  reason: string;
  actorId: string;
  at: string;
}

export interface RunHead {
  id: string;
  suiteId: string;
  requestedByActorId: string;
  createdAt: string;
  state: SuiteRunState;
  counts: RequestStateCounts;
}

export type ComparedItem =
  | { ordinal: number; restricted: true }
  | {
      ordinal: number;
      restricted: false;
      datasetId: string;
      datasetName: string;
      datasetRevisionId: string;
      revisionSeq: number;
      baselineId: string;
      baselineSeq: number;
      baselineStale: unknown;
      requestId: string;
      requestState: string | null;
      /** The attempt whose results were compared; `null` while the item has no succeeded attempt (nothing is classified then). */
      observed: { attemptId: string; attemptNo: number; ruleSetRevision: string | null } | null;
      rules: RuleComparison[];
      counts: ClassificationCounts;
      coverage: Coverage | null;
      /** Latest label per rule id of this item's revision in this run. */
      labels: Map<string, LabelOut>;
      labelCount: number;
    };

export interface ComparedRun {
  run: RunHead;
  items: ComparedItem[];
}

const isExpected = (v: unknown): v is Expected => ['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE', 'EXPECTED_UNSUPPORTED'].includes(v as string);

function expectationsOf(raw: unknown): ExpectationIn[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpectationIn[] = [];
  for (const e of raw as { ruleId?: unknown; expected?: unknown }[]) if (typeof e?.ruleId === 'string' && isExpected(e.expected)) out.push({ ruleId: e.ruleId, expected: e.expected });
  return out;
}
const scopeOf = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);

/** The run, its items with the comparison computed, or `null` for an unknown / other-workspace run or one with no item the actor may see. */
export async function compareRun(
  tx: Tx,
  ports: { requests: SuiteRequestPort; results: SuiteResultReadPort },
  workspaceId: string,
  actorId: string,
  runId: string,
): Promise<ComparedRun | null> {
  const [run] = await tx.select().from(suiteRuns).where(and(eq(suiteRuns.workspaceId, workspaceId), eq(suiteRuns.id, runId)));
  if (!run) return null;
  const rows = await tx
    .select({
      item: i,
      datasetName: d.name,
      visible: sql<boolean>`(${d.shareScope} = 'workspace' or ${d.ownerActorId} = ${actorId})`,
      revisionSeq: r.seq,
      baselineSeq: b.seq,
      expectedScope: b.expectedScope,
      expectations: b.expectations,
    })
    .from(i)
    .innerJoin(d, and(eq(d.workspaceId, i.workspaceId), eq(d.id, i.datasetId)))
    .innerJoin(r, and(eq(r.workspaceId, i.workspaceId), eq(r.id, i.datasetRevisionId)))
    .innerJoin(b, and(eq(b.workspaceId, i.workspaceId), eq(b.id, i.baselineId)))
    .where(and(eq(i.workspaceId, workspaceId), eq(i.suiteRunId, runId)))
    .orderBy(asc(i.ordinal));
  if (!rows.some((x) => x.visible)) return null;

  // Only the items of datasets the actor may see feed any state, count or result: a restricted item's execution state must not leak through the aggregates.
  const visibleRequestIds = rows.filter((x) => x.visible).map((x) => x.item.requestId);
  const states = await ports.requests.requestStates(tx, workspaceId, visibleRequestIds);
  const observedByRequest = await ports.results.latestSucceeded(tx, workspaceId, visibleRequestIds);

  const labelRows = await tx
    .select()
    .from(suiteReviewLabels)
    .where(and(eq(suiteReviewLabels.workspaceId, workspaceId), eq(suiteReviewLabels.suiteRunId, runId)))
    .orderBy(asc(suiteReviewLabels.at), asc(suiteReviewLabels.id));

  const items: ComparedItem[] = rows.map((x) => {
    if (!x.visible) return { ordinal: x.item.ordinal, restricted: true };
    const seen = observedByRequest.get(x.item.requestId);
    const results: ObservedIn[] = (seen?.rules ?? []).map((rule) => ({ ruleId: rule.ruleId, result: rule.result as Observed, required: rule.required }));
    const rules = seen ? compareRules(expectationsOf(x.expectations), results) : [];
    const labels = new Map<string, LabelOut>();
    let labelCount = 0;
    for (const l of labelRows) {
      if (l.datasetRevisionId !== x.item.datasetRevisionId) continue;
      labelCount += 1;
      labels.set(l.ruleId, { label: l.label as ReviewLabel, reason: l.reason, actorId: l.actorId, at: iso(l.at) });
    }
    return {
      ordinal: x.item.ordinal,
      restricted: false,
      datasetId: x.item.datasetId,
      datasetName: x.datasetName,
      datasetRevisionId: x.item.datasetRevisionId,
      revisionSeq: x.revisionSeq,
      baselineId: x.item.baselineId,
      baselineSeq: x.baselineSeq,
      baselineStale: x.item.baselineStale,
      requestId: x.item.requestId,
      requestState: states.get(x.item.requestId)?.state ?? null,
      observed: seen ? { attemptId: seen.attemptId, attemptNo: seen.attemptNo, ruleSetRevision: seen.ruleSetRevision } : null,
      rules,
      counts: countClassifications(rules),
      coverage: seen ? computeCoverage(scopeOf(x.expectedScope), results) : null,
      labels,
      labelCount,
    };
  });

  const counts = countRequestStates(rows.filter((x) => x.visible).map((x) => states.get(x.item.requestId)?.state ?? ''));
  return {
    run: { id: run.id, suiteId: run.suiteId, requestedByActorId: run.requestedByActorId, createdAt: iso(run.createdAt), state: deriveRunState(counts), counts },
    items,
  };
}

/** Everything a label write must check about a run item, in one statement: the item of that run with this revision, and its dataset's visibility. */
export async function findLabelTarget(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  runId: string,
  revisionId: string,
): Promise<{ requestId: string; baselineId: string } | null> {
  const [row] = await tx
    .select({ requestId: i.requestId, baselineId: i.baselineId })
    .from(i)
    .innerJoin(d, and(eq(d.workspaceId, i.workspaceId), eq(d.id, i.datasetId)))
    .where(
      and(
        eq(i.workspaceId, workspaceId),
        eq(i.suiteRunId, runId),
        eq(i.datasetRevisionId, revisionId),
        sql`(${d.shareScope} = 'workspace' or ${d.ownerActorId} = ${actorId})`,
      ),
    )
    .orderBy(asc(i.ordinal))
    .limit(1);
  return row ?? null;
}

/** Whether the run exists in the workspace and holds at least one item whose dataset the actor may see (the same absence otherwise). */
export async function runVisibleTo(tx: Tx, workspaceId: string, actorId: string, runId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: i.id })
    .from(i)
    .innerJoin(d, and(eq(d.workspaceId, i.workspaceId), eq(d.id, i.datasetId)))
    .where(and(eq(i.workspaceId, workspaceId), eq(i.suiteRunId, runId), sql`(${d.shareScope} = 'workspace' or ${d.ownerActorId} = ${actorId})`))
    .limit(1);
  return Boolean(row);
}

/** The baseline's rule ids (scope and expectations) of a run item: a label may name any of them. */
export async function baselineRuleIds(tx: Tx, workspaceId: string, baselineId: string): Promise<Set<string>> {
  const [row] = await tx.select({ scope: b.expectedScope, expectations: b.expectations }).from(b).where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId)));
  return new Set([...scopeOf(row?.scope), ...expectationsOf(row?.expectations).map((e) => e.ruleId)]);
}

export async function insertLabel(
  tx: Tx,
  v: { workspaceId: string; actorId: string; suiteRunId: string; ruleId: string; datasetRevisionId: string; label: ReviewLabel; reason: string },
): Promise<{ id: string; at: string }> {
  const [row] = await tx
    .insert(suiteReviewLabels)
    .values({ workspaceId: v.workspaceId, actorId: v.actorId, suiteRunId: v.suiteRunId, ruleId: v.ruleId, datasetRevisionId: v.datasetRevisionId, label: v.label, reason: v.reason })
    .returning({ id: suiteReviewLabels.id, at: suiteReviewLabels.at });
  if (!row) throw new Error('insertLabel: no row returned');
  return { id: row.id, at: iso(row.at) };
}

