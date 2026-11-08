// Read side of the expected baselines (#1478 D-b): `log_datasets.*` and `core.actors` (display names) only. Every statement is scoped to the
// session's workspace AND to what the actor may see: a baseline belongs to a revision of a dataset, and a `private` dataset's baselines are
// its owner's alone (`datasetVisibleTo`), so an invisible id is the same absence as a missing one. Nothing here writes. The 기준 낡음 badge
// is computed by the caller (it needs the Source and the knowledge catalog); a row here carries the pin and the revision it is judged on.

import { and, asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import { baselineEvents, datasetRevisions, datasets, expectedBaselines } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { ProfilePin } from '../domain/baseline-input.js';
import type { SampleSet } from '../domain/sample-manifest.js';
import { datasetVisibleTo } from './dataset-write.js';

const b = expectedBaselines;
const r = datasetRevisions;
const d = datasets;
const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();
const isoOrNull = (value: Date | string | null): string | null => (value === null ? null : iso(value));
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

export interface Person {
  id: string;
  displayName: string;
}

export interface BaselineListRow {
  id: string;
  datasetRevisionId: string;
  seq: number;
  status: string;
  profilePin: ProfilePin;
  expectationCount: number;
  scopeCount: number;
  hasParserGolden: boolean;
  author: Person;
  approvedBy: Person | null;
  approvedAt: string | null;
  supersededAt: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

/** The revision a reader asks about, when the dataset behind it is visible to them. */
export interface VisibleRevision {
  revisionId: string;
  datasetId: string;
  datasetStatus: string;
  seq: number;
  sampleSet: SampleSet;
}

export async function getVisibleRevision(tx: Tx, workspaceId: string, actorId: string, revisionId: string): Promise<VisibleRevision | null> {
  const [row] = await tx
    .select({ revisionId: r.id, datasetId: r.datasetId, datasetStatus: d.status, seq: r.seq, sampleSet: r.sampleSet })
    .from(r)
    .innerJoin(d, and(eq(d.workspaceId, r.workspaceId), eq(d.id, r.datasetId)))
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revisionId), datasetVisibleTo(actorId)));
  return row ? { ...row, sampleSet: row.sampleSet as SampleSet } : null;
}

const author = alias(actors, 'baseline_author');
const approver = alias(actors, 'baseline_approver');
const eventActor = alias(actors, 'baseline_event_actor');

const personOrNull = (id: string | null, name: string | null): Person | null => (id === null ? null : { id, displayName: name ?? '' });

function toListRow(row: typeof b.$inferSelect, authorName: string | null, approverName: string | null): BaselineListRow {
  return {
    id: row.id,
    datasetRevisionId: row.datasetRevisionId,
    seq: row.seq,
    status: row.status,
    profilePin: row.profilePin as ProfilePin,
    expectationCount: count(row.expectations),
    scopeCount: count(row.expectedScope),
    hasParserGolden: row.parserGoldenRef !== null,
    author: { id: row.authorActorId, displayName: authorName ?? '' },
    approvedBy: personOrNull(row.approvedByActorId, approverName),
    approvedAt: isoOrNull(row.approvedAt),
    supersededAt: isoOrNull(row.supersededAt),
    version: String(row.rowVersion),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Every baseline of a revision, newest seq first. The caller has judged that the revision is visible. */
export async function listBaselinesOf(tx: Tx, workspaceId: string, revisionId: string): Promise<BaselineListRow[]> {
  const rows = await tx
    .select({ row: b, authorName: author.displayName, approverName: approver.displayName })
    .from(b)
    .leftJoin(author, eq(author.id, b.authorActorId))
    .leftJoin(approver, eq(approver.id, b.approvedByActorId))
    .where(and(eq(b.workspaceId, workspaceId), eq(b.datasetRevisionId, revisionId)))
    .orderBy(desc(b.seq));
  return rows.map((x) => toListRow(x.row, x.authorName, x.approverName));
}

export interface BaselineEventRow {
  id: string;
  kind: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  actor: Person;
  selfApproved: boolean;
  at: string;
}

export interface BaselineDetailRow extends BaselineListRow {
  expectedScope: unknown;
  expectations: unknown;
  parserGoldenRef: unknown;
  revision: VisibleRevision;
  events: BaselineEventRow[];
}

/** One baseline with its history, when its dataset is visible to the actor; null otherwise (missing, another workspace's, private to another owner). */
export async function getBaselineDetail(tx: Tx, workspaceId: string, actorId: string, baselineId: string): Promise<BaselineDetailRow | null> {
  const [found] = await tx
    .select({ row: b, authorName: author.displayName, approverName: approver.displayName })
    .from(b)
    .innerJoin(r, and(eq(r.workspaceId, b.workspaceId), eq(r.id, b.datasetRevisionId)))
    .innerJoin(d, and(eq(d.workspaceId, r.workspaceId), eq(d.id, r.datasetId)))
    .leftJoin(author, eq(author.id, b.authorActorId))
    .leftJoin(approver, eq(approver.id, b.approvedByActorId))
    .where(and(eq(b.workspaceId, workspaceId), eq(b.id, baselineId), datasetVisibleTo(actorId)));
  if (!found) return null;
  const revision = await getVisibleRevision(tx, workspaceId, actorId, found.row.datasetRevisionId);
  if (!revision) return null;
  const events = await tx
    .select({ row: baselineEvents, actorName: eventActor.displayName })
    .from(baselineEvents)
    .leftJoin(eventActor, eq(eventActor.id, baselineEvents.actorId))
    .where(and(eq(baselineEvents.workspaceId, workspaceId), eq(baselineEvents.baselineId, baselineId)))
    .orderBy(asc(baselineEvents.at), asc(baselineEvents.id));
  return {
    ...toListRow(found.row, found.authorName, found.approverName),
    expectedScope: found.row.expectedScope,
    expectations: found.row.expectations,
    parserGoldenRef: found.row.parserGoldenRef,
    revision,
    events: events.map((e) => ({
      id: e.row.id,
      kind: e.row.kind,
      before: e.row.before,
      after: e.row.after,
      reason: e.row.reason,
      actor: { id: e.row.actorId, displayName: e.actorName ?? '' },
      selfApproved: e.row.selfApproved,
      at: iso(e.row.at),
    })),
  };
}

/** Cheap per-revision counts for the dataset detail: how many baselines of each status, and the approved one's id and seq. */
export async function baselineCountsByRevision(tx: Tx, workspaceId: string, datasetId: string): Promise<Map<string, { draft: number; superseded: number; approved: { id: string; seq: number } | null }>> {
  const rows = await tx
    .select({ revisionId: b.datasetRevisionId, id: b.id, seq: b.seq, status: b.status })
    .from(b)
    .innerJoin(r, and(eq(r.workspaceId, b.workspaceId), eq(r.id, b.datasetRevisionId)))
    .where(and(eq(b.workspaceId, workspaceId), eq(r.datasetId, datasetId)));
  const out = new Map<string, { draft: number; superseded: number; approved: { id: string; seq: number } | null }>();
  for (const row of rows) {
    const entry = out.get(row.revisionId) ?? { draft: 0, superseded: 0, approved: null };
    if (row.status === 'draft') entry.draft += 1;
    else if (row.status === 'superseded') entry.superseded += 1;
    else entry.approved = { id: row.id, seq: row.seq };
    out.set(row.revisionId, entry);
  }
  return out;
}

/** The profile pin of the approved baseline of a revision (for the dataset detail's badge), when there is one. */
export async function approvedPinOf(tx: Tx, workspaceId: string, revisionId: string): Promise<ProfilePin | undefined> {
  const [row] = await tx
    .select({ pin: b.profilePin })
    .from(b)
    .where(and(eq(b.workspaceId, workspaceId), eq(b.datasetRevisionId, revisionId), eq(b.status, 'approved')));
  return row ? (row.pin as ProfilePin) : undefined;
}
