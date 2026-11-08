// Read side of the validation request queue (#1445 d). These reads are the ROUND requests': every list and detail joins the round, so a
// request whose subject is a suite run item (#1479, no round) is never listed or opened here; its run is read through log-datasets.
// Every read filters by the session workspace; an unknown or foreign
// id answers null (the dispatch has no `not_found` outcome). List responses expose `hasExcerpt` only: the excerpt body is
// read by `readExcerpt` alone, which the endpoint gates on the source owner's right and audits per read.

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import {
  developmentProjects,
  executionAttempts,
  executionRequests,
  ruleResultExcerpts,
  ruleResults,
  validationRounds,
} from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { RequestListQuery, RuleResultListQuery } from '../domain/queue-params.js';

const q = executionRequests;
const a = executionAttempts;
const rr = ruleResults;
const iso = (d: Date) => d.toISOString();

interface Page<T> {
  total: number;
  rows: T[];
}

export async function countRuleResults(tx: Tx, attemptId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(rr).where(eq(rr.attemptId, attemptId));
  return Number(row?.n ?? 0);
}

export interface RequestRowOut {
  id: string;
  roundId: string;
  projectId: string;
  modelId: string;
  priority: number;
  immediate: boolean;
  state: string;
  attemptCount: number;
  maxAttempts: number;
  leaseExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  requestedBy: { id: string; displayName: string };
  createdAt: string;
  endedAt: string | null;
  latestVerdict: string | null;
  version: string;
}

const verdictOfLatest = sql<string | null>`(select ea.verdict from log_lifecycle.execution_attempt ea where ea.request_id = ${q.id} order by ea.attempt_no desc limit 1)`;

/** The request queue, newest first, with the immediate share of the filtered set (the admin's abuse view). */
export async function listRequests(
  tx: Tx,
  workspaceId: string,
  query: RequestListQuery,
): Promise<Page<RequestRowOut> & { immediateTotal: number }> {
  const who = alias(actors, 'requester');
  const p = developmentProjects;
  const where = and(
    eq(q.workspaceId, workspaceId),
    query.states ? inArray(q.state, [...query.states]) : undefined,
    query.priority === undefined ? undefined : eq(q.priority, query.priority),
    query.immediate === undefined ? undefined : eq(q.immediate, query.immediate),
    query.roundId ? eq(q.roundId, query.roundId) : undefined,
    query.modelId ? eq(p.modelId, query.modelId) : undefined,
    query.from ? sql`${q.createdAt} >= ${query.from}` : undefined,
    query.to ? sql`${q.createdAt} < ${query.to}` : undefined,
  );
  const base = tx
    .select({ request: q, projectId: validationRounds.projectId, modelId: p.modelId, requesterName: who.displayName, latestVerdict: verdictOfLatest })
    .from(q)
    .innerJoin(validationRounds, and(eq(validationRounds.workspaceId, q.workspaceId), eq(validationRounds.id, q.roundId)))
    .innerJoin(p, and(eq(p.workspaceId, validationRounds.workspaceId), eq(p.id, validationRounds.projectId)))
    .leftJoin(who, and(eq(who.id, q.requestedByActorId), eq(who.workspaceId, q.workspaceId)))
    .where(where);
  const rows = await base
    .orderBy(desc(q.createdAt), desc(q.id))
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
  const [totals] = await tx
    .select({ n: count(), imm: sql<number>`count(*) filter (where ${q.immediate})::int` })
    .from(q)
    .innerJoin(validationRounds, and(eq(validationRounds.workspaceId, q.workspaceId), eq(validationRounds.id, q.roundId)))
    .innerJoin(p, and(eq(p.workspaceId, validationRounds.workspaceId), eq(p.id, validationRounds.projectId)))
    .where(where);
  return {
    total: Number(totals?.n ?? 0),
    immediateTotal: Number(totals?.imm ?? 0),
    rows: rows.map((r) => ({
      id: r.request.id,
      roundId: r.request.roundId as string, // the inner join on the round: a suite subject has none and never appears here
      projectId: r.projectId,
      modelId: r.modelId,
      priority: r.request.priority,
      immediate: r.request.immediate,
      state: r.request.state,
      attemptCount: r.request.attemptCount,
      maxAttempts: r.request.maxAttempts,
      leaseExpiresAt: r.request.leaseExpiresAt ? iso(r.request.leaseExpiresAt) : null,
      lastHeartbeatAt: r.request.lastHeartbeatAt ? iso(r.request.lastHeartbeatAt) : null,
      requestedBy: { id: r.request.requestedByActorId, displayName: r.requesterName ?? '' },
      createdAt: iso(r.request.createdAt),
      endedAt: r.request.endedAt ? iso(r.request.endedAt) : null,
      latestVerdict: r.latestVerdict,
      version: String(r.request.rowVersion),
    })),
  };
}

export interface AttemptOut {
  id: string;
  attemptNo: number;
  workerActorId: string;
  startedAt: string;
  endedAt: string | null;
  outcome: string;
  executorVersion: string | null;
  executorDigest: string | null;
  ruleSetRevision: string | null;
  inputManifestDigest: string;
  /** The worker's manifest equals the request's; false = the verdict is `incomplete`. */
  manifestMatches: boolean;
  resultDigest: string | null;
  verdict: string | null;
  ruleCount: number;
  /** Rule results by result value, e.g. `{ PASS: 8, FAIL: 1 }`. */
  counts: Record<string, number>;
}

export interface RequestDetail extends RequestRowOut {
  requestDigest: string;
  engineProfileRef: string | null;
  cancelReason: string | null;
  round: { id: string; seq: number; status: string; sampleManifestDigest: string; sourceOwner: string };
  attempts: AttemptOut[];
}

export async function getRequestDetail(tx: Tx, workspaceId: string, requestId: string): Promise<RequestDetail | null> {
  const list = await listRequestsById(tx, workspaceId, requestId);
  if (!list) return null;
  const [roundRow] = await tx
    .select()
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.id, list.request.roundId as string)));
  if (!roundRow) return null;
  const attempts = await tx
    .select()
    .from(a)
    .where(and(eq(a.workspaceId, workspaceId), eq(a.requestId, requestId)))
    .orderBy(a.attemptNo);
  const tallies = await tx
    .select({ attemptId: rr.attemptId, result: rr.result, n: count() })
    .from(rr)
    .innerJoin(a, and(eq(a.workspaceId, rr.workspaceId), eq(a.id, rr.attemptId)))
    .where(and(eq(rr.workspaceId, workspaceId), eq(a.requestId, requestId)))
    .groupBy(rr.attemptId, rr.result);
  const sourceOwner = (roundRow.sampleSet as { sourceOwner?: string }).sourceOwner ?? '';
  return {
    ...list.row,
    requestDigest: list.request.requestDigest,
    engineProfileRef: list.request.engineProfileRef,
    cancelReason: list.request.cancelReason,
    round: { id: roundRow.id, seq: roundRow.seq, status: roundRow.status, sampleManifestDigest: roundRow.sampleManifestDigest, sourceOwner },
    attempts: attempts.map((x) => {
      const mine = tallies.filter((t) => t.attemptId === x.id);
      return {
        id: x.id,
        attemptNo: x.attemptNo,
        workerActorId: x.workerActorId,
        startedAt: iso(x.startedAt),
        endedAt: x.endedAt ? iso(x.endedAt) : null,
        outcome: x.outcome,
        executorVersion: x.executorVersion,
        executorDigest: x.executorDigest,
        ruleSetRevision: x.ruleSetRevision,
        inputManifestDigest: x.inputManifestDigest,
        manifestMatches: x.inputManifestDigest === roundRow.sampleManifestDigest,
        resultDigest: x.resultDigest,
        verdict: x.verdict,
        ruleCount: mine.reduce((s, t) => s + Number(t.n), 0),
        counts: Object.fromEntries(mine.map((t) => [t.result, Number(t.n)])),
      };
    }),
  };
}

async function listRequestsById(tx: Tx, workspaceId: string, requestId: string) {
  const who = alias(actors, 'requester');
  const [found] = await tx
    .select({ request: q, projectId: validationRounds.projectId, modelId: developmentProjects.modelId, requesterName: who.displayName, latestVerdict: verdictOfLatest })
    .from(q)
    .innerJoin(validationRounds, and(eq(validationRounds.workspaceId, q.workspaceId), eq(validationRounds.id, q.roundId)))
    .innerJoin(developmentProjects, and(eq(developmentProjects.workspaceId, validationRounds.workspaceId), eq(developmentProjects.id, validationRounds.projectId)))
    .leftJoin(who, and(eq(who.id, q.requestedByActorId), eq(who.workspaceId, q.workspaceId)))
    .where(and(eq(q.workspaceId, workspaceId), eq(q.id, requestId)))
    .limit(1);
  if (!found) return null;
  const r = found.request;
  const row: RequestRowOut = {
    id: r.id,
    roundId: r.roundId as string, // the inner join on the round guarantees it
    projectId: found.projectId,
    modelId: found.modelId,
    priority: r.priority,
    immediate: r.immediate,
    state: r.state,
    attemptCount: r.attemptCount,
    maxAttempts: r.maxAttempts,
    leaseExpiresAt: r.leaseExpiresAt ? iso(r.leaseExpiresAt) : null,
    lastHeartbeatAt: r.lastHeartbeatAt ? iso(r.lastHeartbeatAt) : null,
    requestedBy: { id: r.requestedByActorId, displayName: found.requesterName ?? '' },
    createdAt: iso(r.createdAt),
    endedAt: r.endedAt ? iso(r.endedAt) : null,
    latestVerdict: found.latestVerdict,
    version: String(r.rowVersion),
  };
  return { request: r, row };
}

export interface RuleResultOut {
  id: string;
  ruleId: string;
  result: string;
  required: boolean;
  expected: string | null;
  observed: string | null;
  /** `[{ fileRef, line, fileSha256, hasExcerpt }]`: the body of an excerpt is never here. */
  evidence: unknown;
  hasExcerpt: boolean;
}

/** The rule results of one attempt (server page, filter by result / required), rule id order. */
export async function listRuleResults(tx: Tx, workspaceId: string, query: RuleResultListQuery): Promise<Page<RuleResultOut>> {
  const [owner] = await tx
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.workspaceId, workspaceId), eq(a.id, query.attemptId)));
  if (!owner) return { total: 0, rows: [] };
  const where = and(
    eq(rr.workspaceId, workspaceId),
    eq(rr.attemptId, query.attemptId),
    query.results ? inArray(rr.result, [...query.results]) : undefined,
    query.required === undefined ? undefined : eq(rr.required, query.required),
  );
  const rows = await tx.select().from(rr).where(where).orderBy(rr.ruleId).limit(query.pageSize).offset(query.page * query.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(rr).where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      result: r.result,
      required: r.required,
      expected: r.expected,
      observed: r.observed,
      evidence: r.evidence,
      hasExcerpt: Array.isArray(r.evidence) && r.evidence.some((e) => (e as { hasExcerpt?: unknown }).hasExcerpt === true),
    })),
  };
}

export interface ExcerptTarget {
  attemptId: string;
  requestId: string;
  sourceOwner: string;
}

/** The chain rule result -> attempt -> request -> round for the source owner of an excerpt; null when not in the workspace. */
export async function excerptTarget(tx: Tx, workspaceId: string, ruleResultId: string): Promise<ExcerptTarget | null> {
  const [row] = await tx
    .select({ attemptId: rr.attemptId, requestId: a.requestId, sampleSet: validationRounds.sampleSet })
    .from(rr)
    .innerJoin(a, and(eq(a.workspaceId, rr.workspaceId), eq(a.id, rr.attemptId)))
    .innerJoin(q, and(eq(q.workspaceId, a.workspaceId), eq(q.id, a.requestId)))
    .innerJoin(validationRounds, and(eq(validationRounds.workspaceId, q.workspaceId), eq(validationRounds.id, q.roundId)))
    .where(and(eq(rr.workspaceId, workspaceId), eq(rr.id, ruleResultId)));
  if (!row) return null;
  return { attemptId: row.attemptId, requestId: row.requestId, sourceOwner: (row.sampleSet as { sourceOwner?: string }).sourceOwner ?? '' };
}

/** The excerpt row of one evidence entry: the text, or `deleted: true` once the retention purge removed it; null = none stored. */
export async function readExcerpt(
  tx: Tx,
  workspaceId: string,
  ruleResultId: string,
  evidenceIndex: number,
): Promise<{ excerpt: string | null; deleted: boolean } | null> {
  const [row] = await tx
    .select({ excerpt: ruleResultExcerpts.excerpt, deletedAt: ruleResultExcerpts.deletedAt })
    .from(ruleResultExcerpts)
    .where(
      and(
        eq(ruleResultExcerpts.workspaceId, workspaceId),
        eq(ruleResultExcerpts.ruleResultId, ruleResultId),
        eq(ruleResultExcerpts.evidenceIndex, evidenceIndex),
      ),
    );
  if (!row) return null;
  return row.deletedAt ? { excerpt: null, deleted: true } : { excerpt: row.excerpt, deleted: false };
}
