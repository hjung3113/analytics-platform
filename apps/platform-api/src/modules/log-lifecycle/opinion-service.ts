// The worker opinion write (#1778, ADR-0117 amendment 2): one transaction per call, the opinion rows and the
// `lifecycle.opinion.recorded` audit row commit together. The caller (worker-routes.ts) has already judged that the call is a token
// call carrying `validation.worker`. Any worker token of the workspace may write; it need not hold the attempt's lease.
// Opinions have their own axis: this file never reads or writes a verdict, a rule result, a request state or a Gate decision.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { judgeAttemptTotals, noteBytes, opinionFingerprint, parseOpinionBody } from './domain/opinion-input.js';
import type { WorkerCaller } from './queue-service.js';
import { attemptOpinionTotals, insertOpinions, opinionsOfSubmission, ruleResultIdsByRuleId } from './repositories/opinion-write.js';
import { getAttempt, getQueueSettings, lockRequest, subjectOf } from './repositories/queue-write.js';

/** The attempt did not end `succeeded`: answered by the route as `409 conflict.attempt_not_succeeded` (a queue-local code). */
export class AttemptNotSucceededError extends Error {
  constructor(message = 'opinions attach to a succeeded attempt only') {
    super(message);
    this.name = 'AttemptNotSucceededError';
  }
}

export interface OpinionResultBody {
  requestId: string;
  attemptNo: number;
  recorded: number;
  duplicate: number;
}

export function createOpinionService(deps: { db: Db }) {
  const audit = createAuditService();

  async function record(caller: WorkerCaller, requestId: string, attemptNo: number, rawBody: unknown): Promise<OpinionResultBody> {
    return deps.db.transaction(async (tx) => {
      const request = await lockRequest(tx, caller.workspaceId, requestId, caller, true);
      if (!request) throw new HttpError('not_found.record', 'validation request not found');
      // The attempt row lock serialises concurrent writers: the resend check and the per-attempt totals below are read under it.
      const attempt = await getAttempt(tx, request.id, attemptNo);
      if (!attempt) throw new HttpError('not_found.record', 'attempt not found');
      if (attempt.outcome !== 'succeeded') throw new AttemptNotSucceededError();
      const subject = await subjectOf(tx, caller.workspaceId, request, caller);
      if (!subject) throw new Error('execution request without a subject');
      const settings = await getQueueSettings(tx, caller.workspaceId);
      const parsed = parseOpinionBody(rawBody, new Set(subject.sampleSet.files.map((f) => f.fileRef)), settings.opinionScale);
      if (!parsed.ok) throw new HttpError('validation.failed', 'opinions refused', { fields: parsed.errors.map((e) => ({ path: [...e.path], code: e.code })) });
      const { submissionId, opinions } = parsed.value;

      const stored = await opinionsOfSubmission(tx, caller.workspaceId, attempt.id, caller.actorId, submissionId, opinions.map((o) => o.itemKey));
      const fresh = [];
      let duplicate = 0;
      for (const o of opinions) {
        const same = stored.get(o.itemKey);
        if (!same) fresh.push(o);
        else if (opinionFingerprint(same) === opinionFingerprint(o)) duplicate += 1;
        else throw new HttpError('conflict.stale_write', 'this submissionId already holds different content for an item');
      }
      if (fresh.length > 0) {
        const totals = await attemptOpinionTotals(tx, caller.workspaceId, attempt.id);
        const over = judgeAttemptTotals(totals, { rows: fresh.length, noteBytes: fresh.reduce((s, o) => s + noteBytes(o), 0) });
        if (over) throw new HttpError('validation.failed', 'opinion limit of the attempt reached', { fields: [{ path: [...over.path], code: over.code }] });
        const links = await ruleResultIdsByRuleId(tx, caller.workspaceId, attempt.id, fresh.map((o) => o.itemKey));
        await insertOpinions(tx, {
          workspaceId: caller.workspaceId,
          attemptId: attempt.id,
          actorId: caller.actorId,
          tokenId: caller.tokenId,
          submissionId,
          rows: fresh.map((o) => ({ ...o, ruleResultId: links.get(o.itemKey) ?? null })),
        });
        await audit.record(tx, {
          workspace_id: caller.workspaceId,
          actor_id: caller.actorId,
          event_type: 'lifecycle.opinion.recorded',
          subject_type: 'execution_request',
          subject_id: request.id,
          summary: 'validation opinions recorded',
          detail: { attemptNo, recorded: fresh.length },
        });
      }
      return { requestId: request.id, attemptNo, recorded: fresh.length, duplicate };
    });
  }

  return { record };
}

export type OpinionService = ReturnType<typeof createOpinionService>;
