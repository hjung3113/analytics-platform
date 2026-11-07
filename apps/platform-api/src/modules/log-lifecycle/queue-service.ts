// The worker side of the validation request queue (#1445 d, ADR-0117 decisions 1-7): claim, heartbeat, result, fail.
// One transaction per call: row changes, the attempt, rule results and the `core.audit_log` row commit together. The
// caller (worker-routes.ts) has already judged that the call is a token call carrying `validation.worker`.
//
// Lease rules (decision 4), in short:
//   * a call for the CURRENT attempt of a claimed request is accepted, even when the lease ran out and no claim call has
//     requeued it yet;
//   * a result / fail for the latest attempt of a request that was requeued (state `queued`, attempt `lease_expired`) and
//     that nobody took meanwhile is accepted too: the work is kept, the request ends `succeeded` / `failed`;
//   * a heartbeat in that requeued state takes the lease back for the same attempt (request `claimed`, attempt `running`),
//     under the request row lock; a claim by another worker that got there first makes it `queue.lease_lost`;
//   * anything else (another attempt exists, the request is cancelled / expired / finished, another worker's attempt) is
//     `queue.lease_lost`;
//   * a result whose digest differs from the stored one for the same attempt is `conflict.stale_write`.
// `queue.lease_lost` is a queue-local code answered by the route (409), not an entry of the shared error registry.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { type ParsedResult, looksSecret, parseResultBody } from './domain/result-payload.js';
import { isWithinRunWindow } from './domain/run-window.js';
import { computeVerdict } from './domain/verdict.js';
import type { Verdict } from './domain/request-states.js';
import {
  type AttemptRow,
  type RequestRow,
  claimNext,
  extendLease,
  finishAttemptFailed,
  finishAttemptSucceeded,
  finishRequest,
  getAttempt,
  getQueueSettings,
  getRound,
  insertRuleResults,
  lockRequest,
  reclaimLease,
  requeueExpiredLeases,
} from './repositories/queue-write.js';
import { countRuleResults } from './repositories/queue-read.js';
import type { SampleSet } from './domain/sample-set.js';

export class LeaseLostError extends Error {
  constructor(message = 'the lease of this attempt is gone') {
    super(message);
    this.name = 'LeaseLostError';
  }
}

export interface WorkerCaller {
  workspaceId: string;
  actorId: string;
  tokenId: string | null;
}

export interface ClaimBody {
  request: {
    id: string;
    roundId: string;
    priority: number;
    immediate: boolean;
    engineProfileRef: string | null;
    requestDigest: string;
    attemptNo: number;
    maxAttempts: number;
    sampleSet: SampleSet;
    sampleManifestDigest: string;
    specPin: unknown;
  };
  attempt: { id: string; attemptNo: number };
  leaseExpiresAt: string;
}
export interface ResultBody {
  requestId: string;
  attemptNo: number;
  state: 'succeeded';
  verdict: Verdict;
  resultDigest: string;
  ruleCount: number;
}
export interface FailBody {
  requestId: string;
  attemptNo: number;
  state: 'failed';
}

export interface QueueServiceDeps {
  db: Db;
  /** The clock of the run-window judgment only; leases use the database clock. */
  now?: () => Date;
}

const iso = (d: Date) => d.toISOString();
const invalidField = (path: (string | number)[], code: string) =>
  new HttpError('validation.failed', 'request body refused', { fields: [{ path, code }] });

export function createQueueService(deps: QueueServiceDeps) {
  const audit = createAuditService();
  const now = deps.now ?? (() => new Date());

  /** The request + attempt a heartbeat / result / fail names, locked; 404 when either is unknown, lease_lost for another worker's. */
  async function locate(tx: Parameters<typeof lockRequest>[0], caller: WorkerCaller, requestId: string, attemptNo: number) {
    const request = await lockRequest(tx, caller.workspaceId, requestId);
    if (!request) throw new HttpError('not_found.record', 'validation request not found');
    const attempt = await getAttempt(tx, request.id, attemptNo);
    if (!attempt) throw new HttpError('not_found.record', 'attempt not found');
    if (attempt.workerActorId !== caller.actorId) throw new LeaseLostError('this attempt belongs to another worker');
    return { request, attempt };
  }

  const isCurrent = (request: RequestRow, attempt: AttemptRow) =>
    request.state === 'claimed' && request.attemptCount === attempt.attemptNo && attempt.outcome === 'running';
  /** The lease ran out, the request went back to the queue, and nobody has claimed it again. */
  const isLate = (request: RequestRow, attempt: AttemptRow) =>
    request.state === 'queued' && request.attemptCount === attempt.attemptNo && attempt.outcome === 'lease_expired';

  async function claim(caller: WorkerCaller): Promise<ClaimBody | null> {
    return deps.db.transaction(async (tx) => {
      const expired = await requeueExpiredLeases(tx, caller.workspaceId);
      for (const e of expired) {
        await audit.record(tx, {
          workspace_id: caller.workspaceId,
          actor_id: caller.actorId,
          event_type: 'lifecycle.request.lease_expired',
          subject_type: 'execution_request',
          subject_id: e.requestId,
          summary: 'validation request lease expired',
          detail: { attemptNo: e.attemptNo, to: e.to },
        });
      }
      const settings = await getQueueSettings(tx, caller.workspaceId);
      const claimed = await claimNext(
        tx,
        caller.workspaceId,
        { actorId: caller.actorId, tokenId: caller.tokenId },
        { windowOpen: isWithinRunWindow(settings.runWindow, now()), leaseSeconds: settings.leaseSeconds },
      );
      if (!claimed) return null;
      const { request, attempt, round } = claimed;
      await audit.record(tx, {
        workspace_id: caller.workspaceId,
        actor_id: caller.actorId,
        event_type: 'lifecycle.request.claimed',
        subject_type: 'execution_request',
        subject_id: request.id,
        summary: 'validation request claimed',
        detail: { attemptNo: attempt.attemptNo, immediate: request.immediate },
      });
      const set = round.sampleSet as SampleSet;
      return {
        request: {
          id: request.id,
          roundId: request.roundId,
          priority: request.priority,
          immediate: request.immediate,
          engineProfileRef: request.engineProfileRef,
          requestDigest: request.requestDigest,
          attemptNo: attempt.attemptNo,
          maxAttempts: request.maxAttempts,
          sampleSet: { files: [...set.files].sort((x, y) => x.order - y.order), sourceOwner: set.sourceOwner },
          sampleManifestDigest: round.sampleManifestDigest,
          specPin: round.specPin ?? null,
        },
        attempt: { id: attempt.id, attemptNo: attempt.attemptNo },
        leaseExpiresAt: iso(request.leaseExpiresAt as Date),
      };
    });
  }

  async function heartbeat(caller: WorkerCaller, requestId: string, attemptNo: number): Promise<{ leaseExpiresAt: string }> {
    return deps.db.transaction(async (tx) => {
      const { request, attempt } = await locate(tx, caller, requestId, attemptNo);
      const settings = await getQueueSettings(tx, caller.workspaceId);
      if (isLate(request, attempt)) {
        // Decision 4: nobody took the request after the lease ran out, so the same attempt gets its lease back.
        const at = await reclaimLease(tx, request, attempt, settings.leaseSeconds);
        return { leaseExpiresAt: iso(at) };
      }
      if (!isCurrent(request, attempt)) throw new LeaseLostError();
      const at = await extendLease(tx, request.id, settings.leaseSeconds);
      return { leaseExpiresAt: iso(at) };
    });
  }

  async function submitResult(caller: WorkerCaller, requestId: string, rawBody: unknown): Promise<ResultBody> {
    const attemptNo = (rawBody as { attemptNo?: unknown } | null)?.attemptNo;
    if (typeof attemptNo !== 'number' || !Number.isInteger(attemptNo) || attemptNo < 1) {
      throw invalidField(['attemptNo'], typeof attemptNo === 'undefined' ? 'required' : 'malformed');
    }
    return deps.db.transaction(async (tx) => {
      const { request, attempt } = await locate(tx, caller, requestId, attemptNo);
      const round = await getRound(tx, caller.workspaceId, request.roundId);
      if (!round) throw new Error('execution request without a round');
      const set = round.sampleSet as SampleSet;
      const parsed = parseResultBody(rawBody, new Set(set.files.map((f) => f.fileRef)));
      if (!parsed.ok) throw new HttpError('validation.failed', 'result refused', { fields: parsed.errors.map((e) => ({ path: [...e.path], code: e.code })) });
      const result: ParsedResult = parsed.value;

      if (attempt.outcome === 'succeeded') {
        // Idempotent resend (decision 5): same digest = same answer, no new row; another digest = conflict.
        if (attempt.resultDigest !== result.resultDigest) {
          throw new HttpError('conflict.stale_write', 'this attempt already has a different result');
        }
        return {
          requestId: request.id,
          attemptNo,
          state: 'succeeded',
          verdict: attempt.verdict as Verdict,
          resultDigest: result.resultDigest,
          ruleCount: await countRuleResults(tx, attempt.id),
        };
      }
      if (attempt.outcome === 'failed') throw new HttpError('conflict.stale_write', 'this attempt already ended as failed');
      const late = isLate(request, attempt);
      if (!isCurrent(request, attempt) && !late) throw new LeaseLostError();

      const verdict = computeVerdict(result.results, result.inputManifestDigest === round.sampleManifestDigest);
      const excerptCount = await insertRuleResults(tx, caller.workspaceId, attempt.id, result.results);
      await finishAttemptSucceeded(tx, attempt.id, {
        executorVersion: result.executorVersion,
        executorDigest: result.executorDigest,
        ruleSetRevision: result.ruleSetRevision,
        inputManifestDigest: result.inputManifestDigest,
        resultDigest: result.resultDigest,
        verdict,
        workerSummary: result.summary,
      });
      await finishRequest(tx, request.id, 'succeeded');
      await audit.record(tx, {
        workspace_id: caller.workspaceId,
        actor_id: caller.actorId,
        event_type: 'lifecycle.request.result_submitted',
        subject_type: 'execution_request',
        subject_id: request.id,
        summary: 'validation result submitted',
        detail: { attemptNo, verdict, ruleCount: result.results.length, excerptCount, late },
      });
      return { requestId: request.id, attemptNo, state: 'succeeded', verdict, resultDigest: result.resultDigest, ruleCount: result.results.length };
    });
  }

  async function fail(caller: WorkerCaller, requestId: string, rawBody: unknown): Promise<FailBody> {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(body)) if (key !== 'attemptNo' && key !== 'reason') throw invalidField([key], 'malformed');
    const attemptNo = body.attemptNo;
    if (typeof attemptNo !== 'number' || !Number.isInteger(attemptNo) || attemptNo < 1) {
      throw invalidField(['attemptNo'], attemptNo === undefined ? 'required' : 'malformed');
    }
    let summary: Record<string, unknown> | null = null;
    if (body.reason !== undefined && body.reason !== null) {
      if (typeof body.reason !== 'string') throw invalidField(['reason'], 'malformed');
      // eslint-disable-next-line no-control-regex -- the point: strip control characters
      const reason = body.reason.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
      if ([...reason].length > 500) throw invalidField(['reason'], 'too_long');
      if (looksSecret(reason)) throw invalidField(['reason'], 'secret_detected');
      if (reason !== '') summary = { reason };
    }
    return deps.db.transaction(async (tx) => {
      const { request, attempt } = await locate(tx, caller, requestId, attemptNo);
      if (attempt.outcome === 'failed') return { requestId: request.id, attemptNo, state: 'failed' }; // resend: same answer
      if (attempt.outcome === 'succeeded') throw new HttpError('conflict.stale_write', 'this attempt already has a result');
      const late = isLate(request, attempt);
      if (!isCurrent(request, attempt) && !late) throw new LeaseLostError();
      await finishAttemptFailed(tx, attempt.id, summary);
      await finishRequest(tx, request.id, 'failed');
      await audit.record(tx, {
        workspace_id: caller.workspaceId,
        actor_id: caller.actorId,
        event_type: 'lifecycle.request.failed',
        subject_type: 'execution_request',
        subject_id: request.id,
        summary: 'validation attempt failed',
        detail: { attemptNo, late },
      });
      return { requestId: request.id, attemptNo, state: 'failed' };
    });
  }

  return { claim, heartbeat, submitResult, fail };
}

export type QueueService = ReturnType<typeof createQueueService>;
