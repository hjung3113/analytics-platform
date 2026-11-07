// Write side of the validation request queue (#1445 d, ADR-0117). Every statement is scoped to a workspace and runs on
// the caller's transaction. Time is the database's (`now()`), so a lease and its expiry never depend on an app clock;
// only the run-window judgment takes an app `Date` (the injected clock). `platform_app` holds INSERT + a column-limited
// UPDATE on request and attempt, INSERT only on rule results and excerpts (migration 0104); the guard triggers refuse a
// missing `row_version` bump, an illegal state pair and any edit of a finished attempt.

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  excerptReaders,
  executionAttempts,
  executionRequests,
  queueSettings,
  ruleResultExcerpts,
  ruleResults,
  validationRounds,
} from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import { type RunWindow, DEFAULT_RUN_WINDOW, parseRunWindow } from '../domain/run-window.js';
import type { ParsedRuleResult } from '../domain/result-payload.js';
import { type Verdict, stateAfterLeaseExpiry } from '../domain/request-states.js';

export type RequestRow = typeof executionRequests.$inferSelect;
export type AttemptRow = typeof executionAttempts.$inferSelect;
export type RoundRow = typeof validationRounds.$inferSelect;

const q = executionRequests;
const a = executionAttempts;

export interface QueueSettings {
  runWindow: RunWindow;
  leaseSeconds: number;
  immediateLimit: number;
  excerptRetentionDays: number;
}
export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  runWindow: DEFAULT_RUN_WINDOW,
  leaseSeconds: 300,
  immediateLimit: 5,
  excerptRetentionDays: 90,
};

/** The workspace's queue settings; a missing row (or an unreadable stored window) resolves to the defaults. */
export async function getQueueSettings(tx: Tx, workspaceId: string, lock = false): Promise<QueueSettings> {
  const query = tx.select().from(queueSettings).where(eq(queueSettings.workspaceId, workspaceId));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) return DEFAULT_QUEUE_SETTINGS;
  return {
    runWindow: parseRunWindow(row.runWindow) ?? DEFAULT_RUN_WINDOW,
    leaseSeconds: row.leaseSeconds,
    immediateLimit: row.immediateLimit,
    excerptRetentionDays: row.excerptRetentionDays,
  };
}

/**
 * Serialises the read-merge-write of a workspace's settings. With no row yet there is nothing to `for update`, so two
 * first updates would both start from the defaults; the transaction advisory lock per workspace makes the second one
 * read the first one's committed row.
 */
export async function lockQueueSettings(tx: Tx, workspaceId: string): Promise<QueueSettings> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`queue_settings:${workspaceId}`}, 0))`);
  return getQueueSettings(tx, workspaceId, true);
}

export async function putQueueSettings(tx: Tx, workspaceId: string, actorId: string, next: QueueSettings): Promise<void> {
  const values = {
    runWindow: next.runWindow,
    leaseSeconds: next.leaseSeconds,
    immediateLimit: next.immediateLimit,
    excerptRetentionDays: next.excerptRetentionDays,
    updatedBy: actorId,
  };
  await tx
    .insert(queueSettings)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: queueSettings.workspaceId, set: { ...values, updatedAt: sql`now()` } });
}

/** Serialises the "five immediate requests per user" count with the insert that follows it. */
export async function lockImmediateQuota(tx: Tx, workspaceId: string, actorId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`immediate:${workspaceId}:${actorId}`}, 0))`);
}

/** A user's immediate requests that still hold a slot: waiting or being worked. */
export async function countActiveImmediate(tx: Tx, workspaceId: string, actorId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(q)
    .where(
      and(eq(q.workspaceId, workspaceId), eq(q.requestedByActorId, actorId), eq(q.immediate, true), sql`${q.state} in ('queued','claimed')`),
    );
  return Number(row?.n ?? 0);
}

export interface NewRequest {
  workspaceId: string;
  roundId: string;
  priority: number;
  immediate: boolean;
  requestDigest: string;
  engineProfileRef: string | null;
  requestedByActorId: string;
  idempotencyKey: string;
  maxAttempts: number;
}

export async function insertRequest(tx: Tx, v: NewRequest): Promise<RequestRow> {
  const [row] = await tx.insert(q).values(v).returning();
  if (!row) throw new Error('execution request insert returned no row');
  return row;
}

export async function lockRequest(tx: Tx, workspaceId: string, requestId: string): Promise<RequestRow | null> {
  const [row] = await tx
    .select()
    .from(q)
    .where(and(eq(q.workspaceId, workspaceId), eq(q.id, requestId)))
    .for('update');
  return row ?? null;
}

export async function getRound(tx: Tx, workspaceId: string, roundId: string): Promise<RoundRow | null> {
  const [row] = await tx
    .select()
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.id, roundId)));
  return row ?? null;
}

/** Human cancel of a queued or claimed request; a claimed one loses its lease (the worker's next call is `lease_lost`). */
export async function cancelRequest(tx: Tx, workspaceId: string, requestId: string, reason: string): Promise<number> {
  const [row] = await tx
    .update(q)
    .set({
      state: 'cancelled',
      claimedByActorId: null,
      leaseExpiresAt: null,
      cancelReason: reason,
      endedAt: sql`now()`,
      rowVersion: sql`${q.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(q.workspaceId, workspaceId), eq(q.id, requestId)))
    .returning({ v: q.rowVersion });
  if (!row) throw new Error('execution request cancel matched no row');
  // The running attempt (if any) ends as lease_expired: the worker's late result is then refused with lease_lost.
  await tx
    .update(a)
    .set({ outcome: 'lease_expired', endedAt: sql`now()` })
    .where(and(eq(a.workspaceId, workspaceId), eq(a.requestId, requestId), eq(a.outcome, 'running')));
  return row.v;
}

export interface ExpiredLease {
  requestId: string;
  attemptNo: number;
  to: 'queued' | 'expired';
}

/**
 * Lease expiry (decision 4), run on every claim call: each claimed request whose lease ended goes back to `queued`
 * (attempt_count / max_attempts left) or to `expired`; its running attempt ends `lease_expired`. `skip locked`, so two
 * claim calls never wait on each other and never expire a row twice.
 */
export async function requeueExpiredLeases(tx: Tx, workspaceId: string, limit = 50): Promise<ExpiredLease[]> {
  const due = await tx
    .select()
    .from(q)
    .where(and(eq(q.workspaceId, workspaceId), eq(q.state, 'claimed'), sql`${q.leaseExpiresAt} < now()`))
    .orderBy(asc(q.leaseExpiresAt))
    .limit(limit)
    .for('update', { skipLocked: true });
  const out: ExpiredLease[] = [];
  for (const row of due) {
    const to = stateAfterLeaseExpiry(row.attemptCount, row.maxAttempts);
    await tx
      .update(q)
      .set({
        state: to,
        claimedByActorId: null,
        leaseExpiresAt: null,
        endedAt: to === 'expired' ? sql`now()` : null,
        rowVersion: sql`${q.rowVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(q.id, row.id));
    await tx
      .update(a)
      .set({ outcome: 'lease_expired', endedAt: sql`now()` })
      .where(and(eq(a.requestId, row.id), eq(a.attemptNo, row.attemptCount), eq(a.outcome, 'running')));
    out.push({ requestId: row.id, attemptNo: row.attemptCount, to });
  }
  return out;
}

export interface Claimed {
  request: RequestRow;
  attempt: AttemptRow;
  round: RoundRow;
}

/**
 * The claim (decision 3): lock the highest-priority, oldest `queued` request that is due, whose round is still open and
 * that may run now (`windowOpen`, or the request is `immediate`) with `for update skip locked`; move it to `claimed`,
 * set the lease, and open the attempt. Null = nothing claimable. A request cannot hold two leases: the state is the
 * judge and the row is locked.
 */
export async function claimNext(
  tx: Tx,
  workspaceId: string,
  worker: { actorId: string; tokenId: string | null },
  opts: { windowOpen: boolean; leaseSeconds: number },
): Promise<Claimed | null> {
  // Lock only the request row: Postgres rejects the schema-qualified name Drizzle writes after `for update of`, and a
  // plain `for update` over the join would also lock the round row (blocking a round close). The open-round test is
  // an `exists`, so the round row is read without a lock.
  const [locked] = await tx
    .select()
    .from(q)
    .where(
      and(
        eq(q.workspaceId, workspaceId),
        eq(q.state, 'queued'),
        sql`(${q.notBefore} is null or ${q.notBefore} <= now())`,
        opts.windowOpen ? sql`true` : eq(q.immediate, true),
        sql`exists (select 1 from log_lifecycle.validation_round v where v.workspace_id = ${workspaceId} and v.id = log_lifecycle.execution_request.round_id and v.status = 'open')`,
      ),
    )
    .orderBy(desc(q.priority), asc(q.createdAt), asc(q.id))
    .limit(1)
    .for('update', { skipLocked: true });
  if (!locked) return null;
  const [roundRow] = await tx
    .select()
    .from(validationRounds)
    .where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.id, locked.roundId)));
  if (!roundRow) return null;
  const found = { request: locked, round: roundRow };
  const attemptNo = found.request.attemptCount + 1;
  const [request] = await tx
    .update(q)
    .set({
      state: 'claimed',
      attemptCount: attemptNo,
      claimedByActorId: worker.actorId,
      leaseExpiresAt: sql`now() + make_interval(secs => ${opts.leaseSeconds})`,
      lastHeartbeatAt: sql`now()`,
      rowVersion: sql`${q.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(q.id, found.request.id))
    .returning();
  const [attempt] = await tx
    .insert(a)
    .values({
      workspaceId,
      requestId: found.request.id,
      attemptNo,
      workerActorId: worker.actorId,
      tokenId: worker.tokenId,
      // Until the worker reports the manifest it used, the attempt carries the one it was handed.
      inputManifestDigest: found.round.sampleManifestDigest,
    })
    .returning();
  if (!request || !attempt) throw new Error('claim wrote no row');
  return { request, attempt, round: found.round };
}

export async function getAttempt(tx: Tx, requestId: string, attemptNo: number): Promise<AttemptRow | null> {
  const [row] = await tx
    .select()
    .from(a)
    .where(and(eq(a.requestId, requestId), eq(a.attemptNo, attemptNo)))
    .for('update');
  return row ?? null;
}

/** Extends the lease to now + `leaseSeconds`; returns the new expiry. */
export async function extendLease(tx: Tx, requestId: string, leaseSeconds: number): Promise<Date> {
  const [row] = await tx
    .update(q)
    .set({
      leaseExpiresAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      lastHeartbeatAt: sql`now()`,
      rowVersion: sql`${q.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(q.id, requestId))
    .returning({ at: q.leaseExpiresAt });
  if (!row?.at) throw new Error('heartbeat matched no claimed row');
  return row.at;
}

/**
 * Decision 4: a heartbeat for the latest attempt of a request that was requeued (`queued`, attempt `lease_expired`) and
 * that nobody took meanwhile gives the lease back to that same attempt: request `claimed`, attempt `running`, lease
 * extended, attempt_count unchanged. The caller holds the request row lock, so a concurrent claim either ran first (the
 * state is then `claimed` / another attempt and this is never reached) or waits for this commit.
 */
export async function reclaimLease(tx: Tx, request: RequestRow, attempt: AttemptRow, leaseSeconds: number): Promise<Date> {
  const [row] = await tx
    .update(q)
    .set({
      state: 'claimed',
      claimedByActorId: attempt.workerActorId,
      leaseExpiresAt: sql`now() + make_interval(secs => ${leaseSeconds})`,
      lastHeartbeatAt: sql`now()`,
      endedAt: null,
      rowVersion: sql`${q.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(q.id, request.id), eq(q.state, 'queued'), eq(q.attemptCount, attempt.attemptNo)))
    .returning({ at: q.leaseExpiresAt });
  if (!row?.at) throw new Error('lease reclaim matched no queued row');
  await tx.update(a).set({ outcome: 'running', endedAt: null }).where(and(eq(a.id, attempt.id), eq(a.outcome, 'lease_expired')));
  return row.at;
}

/** Ends the request (`succeeded` / `failed`), clearing the lease. */
export async function finishRequest(tx: Tx, requestId: string, state: 'succeeded' | 'failed'): Promise<void> {
  await tx
    .update(q)
    .set({
      state,
      claimedByActorId: null,
      leaseExpiresAt: null,
      endedAt: sql`now()`,
      rowVersion: sql`${q.rowVersion} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(q.id, requestId));
}

export async function finishAttemptFailed(tx: Tx, attemptId: string, workerSummary: Record<string, unknown> | null): Promise<void> {
  await tx.update(a).set({ outcome: 'failed', endedAt: sql`now()`, workerSummary }).where(eq(a.id, attemptId));
}

export async function finishAttemptSucceeded(
  tx: Tx,
  attemptId: string,
  v: {
    executorVersion: string | null;
    executorDigest: string | null;
    ruleSetRevision: string | null;
    inputManifestDigest: string;
    resultDigest: string;
    verdict: Verdict;
    workerSummary: Record<string, unknown> | null;
  },
): Promise<void> {
  await tx
    .update(a)
    .set({ outcome: 'succeeded', endedAt: sql`now()`, ...v })
    .where(eq(a.id, attemptId));
}

/** Stores the rule results of an attempt and their excerpts; returns the number of excerpts written. */
export async function insertRuleResults(tx: Tx, workspaceId: string, attemptId: string, results: readonly ParsedRuleResult[]): Promise<number> {
  let excerptCount = 0;
  for (const r of results) {
    const [row] = await tx
      .insert(ruleResults)
      .values({
        workspaceId,
        attemptId,
        ruleId: r.ruleId,
        result: r.result,
        required: r.required,
        expected: r.expected,
        observed: r.observed,
        evidence: r.evidence,
      })
      .returning({ id: ruleResults.id });
    if (!row) throw new Error('rule result insert returned no row');
    for (let i = 0; i < r.excerpts.length; i += 1) {
      const excerpt = r.excerpts[i];
      if (excerpt === null || excerpt === undefined) continue;
      await tx.insert(ruleResultExcerpts).values({ workspaceId, ruleResultId: row.id, evidenceIndex: i, excerpt });
      excerptCount += 1;
    }
  }
  return excerptCount;
}

/** Does this actor hold the read right on the excerpts of `sourceOwner`? (`lifecycle.excerpt.read`, per source owner.) */
export async function holdsExcerptRead(tx: Tx, workspaceId: string, sourceOwner: string, actorId: string): Promise<boolean> {
  const [row] = await tx
    .select({ at: excerptReaders.revokedAt })
    .from(excerptReaders)
    .where(and(eq(excerptReaders.workspaceId, workspaceId), eq(excerptReaders.sourceOwner, sourceOwner), eq(excerptReaders.actorId, actorId)));
  return row !== undefined && row.at === null;
}

export async function setExcerptReader(
  tx: Tx,
  v: { workspaceId: string; sourceOwner: string; actorId: string; grantedBy: string; allowed: boolean },
): Promise<void> {
  const t = excerptReaders;
  if (v.allowed) {
    await tx
      .insert(t)
      .values({ workspaceId: v.workspaceId, sourceOwner: v.sourceOwner, actorId: v.actorId, grantedBy: v.grantedBy })
      .onConflictDoUpdate({
        target: [t.workspaceId, t.sourceOwner, t.actorId],
        set: { revokedAt: null, grantedBy: v.grantedBy, grantedAt: sql`now()` },
      });
  } else {
    await tx
      .update(t)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(t.workspaceId, v.workspaceId), eq(t.sourceOwner, v.sourceOwner), eq(t.actorId, v.actorId)));
  }
}

/** Rows one `erase_excerpts` call may touch (a batch; the caller loops). */
export const EXCERPT_ERASE_BATCH = 500;

/**
 * Erases excerpt bodies through the migration's definer function (the runtime role has no UPDATE on the table): exactly
 * one scope (a Round, an attempt, or every Round closed before `closedBefore`). Rule results and evidence stay. Returns
 * the number of bodies erased in this call.
 */
export async function eraseExcerpts(
  tx: Tx,
  workspaceId: string,
  scope: { roundId: string } | { attemptId: string } | { closedBefore: Date },
  reason: string,
  limit = EXCERPT_ERASE_BATCH,
): Promise<number> {
  const roundId = 'roundId' in scope ? scope.roundId : null;
  const attemptId = 'attemptId' in scope ? scope.attemptId : null;
  const closedBefore = 'closedBefore' in scope ? scope.closedBefore.toISOString() : null;
  const res = await tx.execute(
    sql`select log_lifecycle.erase_excerpts(${workspaceId}::uuid, ${roundId}::uuid, ${attemptId}::uuid, ${closedBefore}::timestamptz, ${reason}, ${limit}::int) as n`,
  );
  const row = (res as unknown as { rows: { n: number }[] }).rows[0];
  return Number(row?.n ?? 0);
}

/** The Round and request an attempt belongs to (workspace-scoped); null when unknown. */
export async function attemptOwner(tx: Tx, workspaceId: string, attemptId: string): Promise<{ requestId: string; roundId: string } | null> {
  const [row] = await tx
    .select({ requestId: a.requestId, roundId: q.roundId })
    .from(a)
    .innerJoin(q, and(eq(q.workspaceId, a.workspaceId), eq(q.id, a.requestId)))
    .where(and(eq(a.workspaceId, workspaceId), eq(a.id, attemptId)));
  return row ?? null;
}
