// Read side of the regression suites and runs (#1479 D-c): `log_datasets.*` and `core.actors` (display names) only; the states of the
// items' requests come from the lifecycle port the caller passes in. Every statement is scoped to the session's workspace. A suite and its
// runs are readable by every member; an ITEM whose dataset the actor cannot see (a `private` dataset of another owner) is returned as
// `restricted` with no id, name or digest, so a suite never leaks a private dataset. Nothing here writes. Never log text: ids, ordinals,
// seqs, digests and state names.

import { and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import { datasetRevisions, datasets, expectedBaselines, regressionSuites, suiteRunItems, suiteRuns } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { ListQuery, Page } from '../../../lib/list-params/types.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import type { ProfilePin } from '../domain/baseline-input.js';
import { type RequestStateCounts, type SuiteRunState, countRequestStates, deriveRunState } from '../domain/suite-state.js';
import type { SuiteItem } from '../domain/suite-input.js';
import type { SuiteRequestPort } from '../../log-lifecycle/index.js';
import { type ResolvedItem, type ResolveProblem, resolveItem } from './suite-write.js';

const s = regressionSuites;
const d = datasets;
const r = datasetRevisions;
const b = expectedBaselines;
const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

export interface SuiteListRow {
  id: string;
  name: string;
  itemCount: number;
  engineProfileRef: string | null;
  lastRunAt: string | null;
  createdBy: { id: string; displayName: string };
  version: string;
  createdAt: string;
  updatedAt: string;
}

export async function listSuites(tx: Tx, q: ListQuery): Promise<Page<SuiteListRow>> {
  const text = q.q === null || q.q.trim() === '' ? undefined : `%${escapeLikePattern(q.q.trim())}%`;
  const where = and(eq(s.workspaceId, q.workspaceId), text ? ilike(s.name, text) : undefined);
  const sortable = { updatedAt: s.updatedAt, name: s.name, createdAt: s.createdAt } as const;
  const creator = alias(actors, 'suite_creator');
  const lastRun = sql<Date | null>`(select max(sr.created_at) from ${suiteRuns} sr where sr.workspace_id = ${s.workspaceId} and sr.suite_id = ${s.id})`;
  const order = q.sorting.map((x) => {
    const column = sortable[x.id as keyof typeof sortable];
    return x.desc ? desc(column) : asc(column);
  });
  const rows = await tx
    .select({ row: s, creatorName: creator.displayName, lastRun })
    .from(s)
    .leftJoin(creator, eq(creator.id, s.createdBy))
    .where(where)
    .orderBy(...order, asc(s.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [total] = await tx.select({ n: count() }).from(s).where(where);
  return {
    total: Number(total?.n ?? 0),
    rows: rows.map((x) => ({
      id: x.row.id,
      name: x.row.name,
      itemCount: Array.isArray(x.row.items) ? x.row.items.length : 0,
      engineProfileRef: x.row.engineProfileRef,
      lastRunAt: x.lastRun ? iso(x.lastRun) : null,
      createdBy: { id: x.row.createdBy, displayName: x.creatorName ?? '' },
      version: String(x.row.rowVersion),
      createdAt: iso(x.row.createdAt),
      updatedAt: iso(x.row.updatedAt),
    })),
  };
}

export type SuiteDetailItem =
  | { ordinal: number; restricted: true }
  | {
      ordinal: number;
      restricted: false;
      datasetId: string;
      datasetName: string;
      datasetRevisionId: string | null;
      baselineId: string | null;
      /** What the item would pin if the suite ran now, or why it cannot run. */
      resolvesTo:
        | { ok: true; revisionId: string; revisionSeq: number; baselineId: string; baselineSeq: number }
        | { ok: false; problem: ResolveProblem };
    };

export interface SuiteDetail {
  id: string;
  name: string;
  engineProfileRef: string | null;
  requiredPin: ProfilePin;
  items: SuiteDetailItem[];
  createdBy: { id: string; displayName: string };
  version: string;
  createdAt: string;
  updatedAt: string;
}

const visibleExpr = (actorId: string) => sql<boolean>`(${d.shareScope} = 'workspace' or ${d.ownerActorId} = ${actorId})`;

/** One suite with its items; an item of a dataset the actor cannot see is `restricted`. */
export async function getSuiteDetail(tx: Tx, workspaceId: string, actorId: string, suiteId: string): Promise<SuiteDetail | null> {
  const creator = alias(actors, 'suite_creator');
  const [found] = await tx
    .select({ row: s, creatorName: creator.displayName })
    .from(s)
    .leftJoin(creator, eq(creator.id, s.createdBy))
    .where(and(eq(s.workspaceId, workspaceId), eq(s.id, suiteId)));
  if (!found) return null;
  const stored = (Array.isArray(found.row.items) ? found.row.items : []) as SuiteItem[];
  const items: SuiteDetailItem[] = [];
  for (const [index, item] of stored.entries()) {
    const ordinal = index + 1;
    const [dataset] = await tx
      .select({ name: d.name, visible: visibleExpr(actorId) })
      .from(d)
      .where(and(eq(d.workspaceId, workspaceId), eq(d.id, item.datasetId)));
    if (!dataset || !dataset.visible) {
      items.push({ ordinal, restricted: true });
      continue;
    }
    const resolved = await resolveItem(tx, workspaceId, actorId, item);
    items.push({
      ordinal,
      restricted: false,
      datasetId: item.datasetId,
      datasetName: dataset.name,
      datasetRevisionId: item.datasetRevisionId ?? null,
      baselineId: item.baselineId ?? null,
      resolvesTo:
        typeof resolved === 'string'
          ? { ok: false, problem: resolved }
          : { ok: true, revisionId: resolved.revisionId, revisionSeq: resolved.revisionSeq, baselineId: resolved.baselineId, baselineSeq: resolved.baselineSeq },
    });
  }
  return {
    id: found.row.id,
    name: found.row.name,
    engineProfileRef: found.row.engineProfileRef,
    requiredPin: found.row.requiredPin as ProfilePin,
    items,
    createdBy: { id: found.row.createdBy, displayName: found.creatorName ?? '' },
    version: String(found.row.rowVersion),
    createdAt: iso(found.row.createdAt),
    updatedAt: iso(found.row.updatedAt),
  };
}

export interface RunItemOut {
  ordinal: number;
  restricted: boolean;
  datasetId?: string;
  datasetName?: string;
  datasetRevisionId?: string;
  revisionSeq?: number;
  baselineId?: string;
  baselineSeq?: number;
  sampleManifestDigest?: string;
  baselineDigest?: string;
  baselineStale?: unknown;
  requestId?: string;
  /** The state of the item's request (the derived-state input); `null` when the request is unknown to the queue. */
  requestState: string | null;
  attemptCount: number | null;
  latestVerdict: string | null;
}

export interface RunOut {
  id: string;
  suiteId: string;
  requestedBy: { id: string; displayName: string };
  engineProfileRef: string | null;
  requiredPin: ProfilePin;
  createdAt: string;
  /** Derived from the requests' states, never stored. */
  state: SuiteRunState;
  counts: RequestStateCounts;
  items: RunItemOut[];
}

/** The runs of one suite, newest first, with derived state, state counts and the pinned items (restricted ones carry no dataset detail). */
export async function listRuns(
  tx: Tx,
  lifecycle: SuiteRequestPort,
  workspaceId: string,
  actorId: string,
  v: { suiteId: string; page: number; pageSize: number },
): Promise<(Page<RunOut> & { suiteId: string }) | null> {
  const [suite] = await tx.select({ id: s.id }).from(s).where(and(eq(s.workspaceId, workspaceId), eq(s.id, v.suiteId)));
  if (!suite) return null;
  const who = alias(actors, 'run_requester');
  const where = and(eq(suiteRuns.workspaceId, workspaceId), eq(suiteRuns.suiteId, v.suiteId));
  const runs = await tx
    .select({ row: suiteRuns, requesterName: who.displayName })
    .from(suiteRuns)
    .leftJoin(who, eq(who.id, suiteRuns.requestedByActorId))
    .where(where)
    .orderBy(desc(suiteRuns.createdAt), desc(suiteRuns.id))
    .limit(v.pageSize)
    .offset(v.page * v.pageSize);
  const [total] = await tx.select({ n: count() }).from(suiteRuns).where(where);
  const runIds = runs.map((x) => x.row.id);
  const items =
    runIds.length === 0
      ? []
      : await tx
          .select({ item: suiteRunItems, datasetName: d.name, visible: visibleExpr(actorId), revisionSeq: r.seq, baselineSeq: b.seq })
          .from(suiteRunItems)
          .innerJoin(d, and(eq(d.workspaceId, suiteRunItems.workspaceId), eq(d.id, suiteRunItems.datasetId)))
          .innerJoin(r, and(eq(r.workspaceId, suiteRunItems.workspaceId), eq(r.id, suiteRunItems.datasetRevisionId)))
          .innerJoin(b, and(eq(b.workspaceId, suiteRunItems.workspaceId), eq(b.id, suiteRunItems.baselineId)))
          .where(and(eq(suiteRunItems.workspaceId, workspaceId), sql`${suiteRunItems.suiteRunId} in (${sql.join(runIds.map((id) => sql`${id}::uuid`), sql`, `)})`))
          .orderBy(asc(suiteRunItems.suiteRunId), asc(suiteRunItems.ordinal));
  const states = await lifecycle.requestStates(tx, workspaceId, items.map((x) => x.item.requestId));
  const rows: RunOut[] = runs.map((run) => {
    const mine = items.filter((x) => x.item.suiteRunId === run.row.id);
    const outItems: RunItemOut[] = mine.map((x) => {
      const st = states.get(x.item.requestId);
      const base = { ordinal: x.item.ordinal, requestState: st?.state ?? null, attemptCount: st?.attemptCount ?? null, latestVerdict: st?.latestVerdict ?? null };
      if (!x.visible) return { ...base, restricted: true };
      return {
        ...base,
        restricted: false,
        datasetId: x.item.datasetId,
        datasetName: x.datasetName,
        datasetRevisionId: x.item.datasetRevisionId,
        revisionSeq: x.revisionSeq,
        baselineId: x.item.baselineId,
        baselineSeq: x.baselineSeq,
        sampleManifestDigest: x.item.sampleManifestDigest,
        baselineDigest: x.item.baselineDigest,
        baselineStale: x.item.baselineStale,
        requestId: x.item.requestId,
      };
    });
    const counts = countRequestStates(outItems.map((i) => i.requestState ?? ''));
    return {
      id: run.row.id,
      suiteId: run.row.suiteId,
      requestedBy: { id: run.row.requestedByActorId, displayName: run.requesterName ?? '' },
      engineProfileRef: run.row.engineProfileRef,
      requiredPin: run.row.requiredPin as ProfilePin,
      createdAt: iso(run.row.createdAt),
      state: deriveRunState(counts),
      counts,
      items: outItems,
    };
  });
  return { suiteId: v.suiteId, total: Number(total?.n ?? 0), rows };
}

/** A run just written or replayed: the pinned items in order (for the action's answer). */
export async function runItems(tx: Tx, workspaceId: string, runId: string) {
  return tx
    .select({
      id: suiteRunItems.id,
      ordinal: suiteRunItems.ordinal,
      datasetId: suiteRunItems.datasetId,
      datasetRevisionId: suiteRunItems.datasetRevisionId,
      baselineId: suiteRunItems.baselineId,
      requestId: suiteRunItems.requestId,
      baselineStale: suiteRunItems.baselineStale,
    })
    .from(suiteRunItems)
    .where(and(eq(suiteRunItems.workspaceId, workspaceId), eq(suiteRunItems.suiteRunId, runId)))
    .orderBy(asc(suiteRunItems.ordinal));
}

export type { ResolvedItem };
