// The port log-datasets uses to put a suite run item on the validation request queue and to read the states of those requests (#1479 D-c,
// ADR-0117 amendment). The request rows stay this module's: log-datasets never writes or selects a lifecycle table. The sample list of a
// suite subject is resolved by the caller and PINNED on the request here, so the claim response is built from the request alone and
// lifecycle never imports log-datasets. Everything runs on the caller's transaction (the registration commits with the suite run).

import { createHash } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { executionAttempts, executionRequests } from '../../db/schema/log-lifecycle.js';
import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { DEFAULT_MAX_ATTEMPTS } from './domain/queue-input.js';
import type { SampleSet } from './domain/sample-set.js';
import { insertRequest } from './repositories/queue-write.js';

/** A suite request is background work: the lowest priority, never immediate. */
export const SUITE_REQUEST_PRIORITY = 0;

export interface SuiteRequestRegistration {
  workspaceId: string;
  actorId: string;
  suiteRunId: string;
  suiteRunItemId: string;
  sampleSet: SampleSet;
  sampleManifestDigest: string;
  engineProfileRef: string | null;
}

/** What the suite run read needs of one request: the state names only, never rule results or text. */
export interface SuiteRequestState {
  requestId: string;
  suiteRunId: string;
  state: string;
  attemptCount: number;
  maxAttempts: number;
  endedAt: string | null;
  latestVerdict: string | null;
}

export interface SuiteRequestPort {
  /** Serialises one user's "count my active runs, then register" (advisory lock per workspace and user). */
  lockRunQuota(tx: Tx, workspaceId: string, actorId: string): Promise<void>;
  /** Suite runs of the user with at least one request still `queued` or `claimed` (the derived "active" state). */
  countActiveRuns(tx: Tx, workspaceId: string, actorId: string): Promise<number>;
  /** Registers the request of one suite run item; audited (`lifecycle.request.created`) in the same transaction. */
  register(tx: Tx, v: SuiteRequestRegistration): Promise<{ requestId: string }>;
  /** The states of the given requests of this workspace (an unknown id is absent from the result). */
  requestStates(tx: Tx, workspaceId: string, requestIds: readonly string[]): Promise<Map<string, SuiteRequestState>>;
}

/** sha256 of the canonical identity of a suite request: which run item (and so which samples) with which engine profile. */
export function suiteRequestDigest(suiteRunItemId: string, sampleManifestDigest: string, engineProfileRef: string | null): string {
  return createHash('sha256').update(JSON.stringify({ suiteRunItemId, sampleManifestDigest, engineProfileRef }), 'utf8').digest('hex');
}

const q = executionRequests;
const audit = createAuditService();

export const lifecycleSuiteRequests: SuiteRequestPort = {
  async lockRunQuota(tx, workspaceId, actorId) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`suite_run:${workspaceId}:${actorId}`}, 0))`);
  },

  async countActiveRuns(tx, workspaceId, actorId) {
    const [row] = await tx
      .select({ n: sql<number>`count(distinct ${q.suiteRunId})::int` })
      .from(q)
      .where(and(eq(q.workspaceId, workspaceId), eq(q.requestedByActorId, actorId), sql`${q.suiteRunId} is not null`, sql`${q.state} in ('queued','claimed')`));
    return Number(row?.n ?? 0);
  },

  async register(tx, v) {
    const row = await insertRequest(tx, {
      workspaceId: v.workspaceId,
      suiteRunItemId: v.suiteRunItemId,
      suiteRunId: v.suiteRunId,
      subjectSampleSet: v.sampleSet,
      subjectSampleManifestDigest: v.sampleManifestDigest,
      priority: SUITE_REQUEST_PRIORITY,
      immediate: false,
      requestDigest: suiteRequestDigest(v.suiteRunItemId, v.sampleManifestDigest, v.engineProfileRef),
      engineProfileRef: v.engineProfileRef,
      requestedByActorId: v.actorId,
      idempotencyKey: `suite-run-item:${v.suiteRunItemId}`,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });
    await audit.record(tx, {
      workspace_id: v.workspaceId,
      actor_id: v.actorId,
      event_type: 'lifecycle.request.created',
      subject_type: 'execution_request',
      subject_id: row.id,
      summary: 'validation request registered',
      detail: { suiteRunItemId: v.suiteRunItemId, priority: row.priority, immediate: false, maxAttempts: row.maxAttempts },
    });
    return { requestId: row.id };
  },

  async requestStates(tx, workspaceId, requestIds) {
    const out = new Map<string, SuiteRequestState>();
    if (requestIds.length === 0) return out;
    const verdict = sql<string | null>`(select ea.verdict from ${executionAttempts} ea where ea.request_id = ${sql.raw('"log_lifecycle"."execution_request"."id"')} order by ea.attempt_no desc limit 1)`;
    const rows = await tx
      .select({ id: q.id, suiteRunId: q.suiteRunId, state: q.state, attemptCount: q.attemptCount, maxAttempts: q.maxAttempts, endedAt: q.endedAt, verdict })
      .from(q)
      .where(and(eq(q.workspaceId, workspaceId), inArray(q.id, [...requestIds]), sql`${q.suiteRunId} is not null`));
    for (const r of rows) {
      out.set(r.id, {
        requestId: r.id,
        suiteRunId: r.suiteRunId as string,
        state: r.state,
        attemptCount: r.attemptCount,
        maxAttempts: r.maxAttempts,
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        latestVerdict: r.verdict,
      });
    }
    return out;
  },
};
