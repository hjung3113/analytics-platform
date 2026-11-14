import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { diagnosticTotalError, parseDiagnosticBody } from './domain/diagnostic-payload.js';
import { AttemptNotSucceededError } from './opinion-service.js';
import type { WorkerCaller } from './queue-service.js';
import { diagnosticDocument, diagnosticTotals, insertDiagnostic } from './repositories/diagnostic-write.js';
import { ruleResultIdsByRuleId } from './repositories/opinion-write.js';
import { getAttempt, lockRequest, subjectOf } from './repositories/queue-write.js';
import { ruleResults } from '../../db/schema/log-lifecycle.js';
import { and, eq } from 'drizzle-orm';

export function createDiagnosticService(deps: { db: Db }) {
  const audit = createAuditService();
  return { async record(caller: WorkerCaller, requestId: string, attemptNo: number, raw: unknown) {
    return deps.db.transaction(async (tx) => {
      const request = await lockRequest(tx, caller.workspaceId, requestId, caller, true);
      if (!request) throw new HttpError('not_found.record', 'validation request not found');
      const attempt = await getAttempt(tx, request.id, attemptNo);
      if (!attempt) throw new HttpError('not_found.record', 'attempt not found');
      if (attempt.outcome !== 'succeeded') throw new AttemptNotSucceededError('diagnostics attach to a succeeded attempt only');
      const subject = await subjectOf(tx, caller.workspaceId, request, caller);
      if (!subject) throw new HttpError('not_found.record', 'request subject not found');
      const results = await tx.select({ ruleId: ruleResults.ruleId }).from(ruleResults).where(and(eq(ruleResults.workspaceId, caller.workspaceId), eq(ruleResults.attemptId, attempt.id)));
      const parsed = parseDiagnosticBody(raw, { sampleRefs: new Set(subject.sampleSet.files.map((f) => f.fileRef)), ruleIds: new Set(results.map((r) => r.ruleId)), inputManifestDigest: attempt.inputManifestDigest });
      if (!parsed.ok) throw new HttpError('validation.failed', 'diagnostics refused', { fields: parsed.errors });
      const { value, digest, byteCount } = parsed;
      const stored = await diagnosticDocument(tx, caller.workspaceId, attempt.id, value.producer);
      const response = { requestId, attemptNo, producer: value.producer, itemCount: value.items.length };
      if (stored) {
        if (stored.digest !== digest) throw new HttpError('conflict.stale_write', 'producer already holds different diagnostic content');
        return { ...response, duplicate: true };
      }
      const over = diagnosticTotalError(await diagnosticTotals(tx, caller.workspaceId, attempt.id), byteCount);
      if (over) throw new HttpError('validation.failed', 'diagnostic attempt limit reached', { fields: [over] });
      const links = await ruleResultIdsByRuleId(tx, caller.workspaceId, attempt.id, value.items.flatMap((i) => i.ruleId ? [i.ruleId] : []));
      await insertDiagnostic(tx, caller, attempt.id, value, digest, byteCount, links);
      await audit.record(tx, { workspace_id: caller.workspaceId, actor_id: caller.actorId, event_type: 'lifecycle.diagnostic.recorded', subject_type: 'execution_request', subject_id: request.id, summary: 'validation diagnostics recorded', detail: { attemptNo, producer: value.producer, itemCount: value.items.length } });
      return { ...response, duplicate: false };
    });
  } };
}
