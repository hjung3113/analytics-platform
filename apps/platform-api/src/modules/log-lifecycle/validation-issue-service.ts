// Storage application commands. Menu declarations supply authorization; execute remains an internal storage boundary.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import { createIdempotencyService } from '../core/idempotency/idempotency-service.js';
import { type Viewer, viewerOf } from '../log-knowledge/index.js';
import { validationIssues, validationIssueEvidenceRefs, validationIssueComments, roundComments, validationIssueEvents, validationIssueTransitions } from '../../db/schema/log-lifecycle.js';
import { parseValidationIssueInput, type ValidationIssueAction } from './domain/validation-issue-input.js';
import { VALIDATION_ISSUE_LIMITS as L } from '@ap/feature-shared';
import { sampleSetMisses, evidenceRefTripleKey } from './domain/evidence-ref-intake.js';
import { currentIssueState, judgeTransition } from './domain/validation-issue-states.js';
import { actorInWorkspace } from './repositories/lifecycle-write.js';
import { assertCorrection, invalid, issueCommentExists, issueOwner, lastTransition, lockIssueRound, occurrenceAfter, occurrenceOwner, occurrenceRequest, roundOwner, insertOccurrence } from './repositories/validation-issue-write.js';

const audit = createAuditService();
const idempotency = createIdempotencyService();
type Caller = { workspace_id: string; actor_id: string };
export interface ValidationIssueWriteResult { id: string; issueId?: string; added?: boolean; count?: number; seq?: number; state?: string }
function parse<A extends ValidationIssueAction>(action: A, raw: unknown) {
  const p = parseValidationIssueInput(action, raw);
  if (!p.success) throw new HttpError('validation.failed', 'validation issue input refused', { fields: p.error.issues.map(e => ({ path: e.path.map(String), code: e.code === 'custom' ? e.message : 'malformed' })) });
  return p.data;
}
/** Rechecked on replay too. No write grants or capabilities are inferred from visibility. */
export async function lockValidationIssueTarget(tx: Tx, viewer: Viewer, action: ValidationIssueAction, raw: unknown) {
  const v = parse(action, raw);
  // A state change locks its issue's project and first Round; its optional occurrence is judged by the handler.
  if ('toState' in v) {
    const i = await issueOwner(tx, viewer, v.issueId);
    await lockIssueRound(tx, viewer, i.project_id, i.first_round_id);
    return;
  }
  if ('firstRoundId' in v) return lockIssueRound(tx, viewer, v.projectId, v.firstRoundId);
  if ('occurrenceId' in v) {
    const o = await occurrenceOwner(tx, viewer, v.occurrenceId);
    await lockIssueRound(tx, viewer, o.project_id, o.round_id);
    return;
  }
  if ('issueId' in v) {
    const i = await issueOwner(tx, viewer, v.issueId);
    await lockIssueRound(tx, viewer, i.project_id, 'roundId' in v ? v.roundId : i.first_round_id);
    return;
  }
  if ('roundId' in v) await lockIssueRound(tx, viewer, await roundOwner(tx, viewer, v.roundId), v.roundId, 'round');
}
export function createValidationIssueService(deps: { db: Db }) {
  /** Called by the menu-action handler inside its transaction/idempotency frame. */
  async function handle(tx: Tx, caller: Caller, action: ValidationIssueAction, raw: unknown): Promise<ValidationIssueWriteResult> {
    const viewer = viewerOf(caller);
    await lockValidationIssueTarget(tx, viewer, action, raw);
    const base = { workspace_id: viewer.workspaceId, actor_id: viewer.actorId };
    switch (action) {
      case 'create': {
        const v = parse(action, raw);
        const id = randomUUID();
        await tx.insert(validationIssues).values({ ...v, id, workspaceId: viewer.workspaceId, reporterActorId: viewer.actorId, createdAt: sql`clock_timestamp()` });
        await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.created', subject_type: 'validation_issue', subject_id: id, summary: 'validation issue created', detail: { projectId: v.projectId, firstRoundId: v.firstRoundId } });
        return { id };
      }
      case 'linkOccurrence': {
        const v = parse(action, raw);
        const i = await issueOwner(tx, viewer, v.issueId);
        const requestId = await occurrenceRequest(tx, viewer, v.roundId, v.attemptId, v.ruleResultId);
        const link = await insertOccurrence(tx, viewer, { ...v, projectId: i.project_id, requestId });
        if (link.added) await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.occurrence_linked', subject_type: 'validation_issue', subject_id: i.id, summary: 'validation occurrence linked', detail: { occurrenceId: link.id, roundId: v.roundId } });
        return { ...link, issueId: i.id };
      }
      case 'linkEvidence': {
        const v = parse(action, raw);
        const o = await occurrenceOwner(tx, viewer, v.occurrenceId);
        const samples = await lockIssueRound(tx, viewer, o.project_id, o.round_id);
        const misses = sampleSetMisses(v.refs.map(r => ({ ...r, note: null, sourceResolved: true })), samples);
        if (misses.length) throw new HttpError('validation.failed', 'evidence not in round samples', { fields: misses });
        const existing = await tx.execute(sql`select file_ref, line, file_sha256 from log_lifecycle.validation_issue_evidence_ref where workspace_id = ${viewer.workspaceId}::uuid and occurrence_id = ${o.id}::uuid`);
        const keys = new Set(existing.rows.map(r => evidenceRefTripleKey({ fileRef: r.file_ref as string, line: Number(r.line), fileSha256: r.file_sha256 as string })));
        const fresh = v.refs.filter(r => !keys.has(evidenceRefTripleKey(r)));
        if (keys.size + fresh.length > L.evidencePerOccurrence) invalid('refs', 'too_many');
        if (fresh.length) {
          await tx.insert(validationIssueEvidenceRefs).values(fresh.map(ref => ({ ...ref, workspaceId: viewer.workspaceId, occurrenceId: o.id, linkerActorId: viewer.actorId, createdAt: sql`clock_timestamp()` })));
          await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.evidence_linked', subject_type: 'validation_issue', subject_id: o.issue_id, summary: 'validation evidence linked', detail: { occurrenceId: o.id, count: fresh.length } });
        }
        return { id: o.id, issueId: o.issue_id, count: fresh.length };
      }
      case 'commentIssue': {
        const v = parse(action, raw);
        await assertCorrection(tx, viewer, 'issue', v.issueId, v.correctsCommentId);
        const id = randomUUID();
        await tx.insert(validationIssueComments).values({ ...v, id, workspaceId: viewer.workspaceId, authorActorId: viewer.actorId, createdAt: sql`clock_timestamp()` });
        await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.commented', subject_type: 'validation_issue', subject_id: v.issueId, summary: 'validation issue comment added', detail: { commentId: id, correctsCommentId: v.correctsCommentId } });
        return { id, issueId: v.issueId };
      }
      case 'commentRound': {
        const v = parse(action, raw);
        await assertCorrection(tx, viewer, 'round', v.roundId, v.correctsCommentId);
        const id = randomUUID();
        await tx.insert(roundComments).values({ ...v, id, workspaceId: viewer.workspaceId, authorActorId: viewer.actorId, createdAt: sql`clock_timestamp()` });
        await audit.record(tx, { ...base, event_type: 'lifecycle.round.commented', subject_type: 'validation_round', subject_id: v.roundId, summary: 'round discussion comment added', detail: { commentId: id, correctsCommentId: v.correctsCommentId } });
        return { id };
      }
      case 'correctField': {
        const v = parse(action, raw);
        await assertCorrection(tx, viewer, 'event', v.issueId, v.correctsEventId, v.field);
        const id = randomUUID();
        await tx.insert(validationIssueEvents).values({ ...v, id, kind: 'field_corrected', workspaceId: viewer.workspaceId, actorId: viewer.actorId, createdAt: sql`clock_timestamp()` });
        await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.field_corrected', subject_type: 'validation_issue', subject_id: v.issueId, summary: 'validation issue field corrected', detail: { eventId: id, field: v.field, correctsEventId: v.correctsEventId } });
        return { id, issueId: v.issueId };
      }
      case 'changeState': {
        const v = parse(action, raw);
        const i = await issueOwner(tx, viewer, v.issueId);
        // The chain head is read under the project lock; the unique (issue_id, seq) stays the final judge.
        const head = await lastTransition(tx, viewer.workspaceId, i.id);
        const fromState = currentIssueState(head?.to_state);
        const seq = (head?.seq ?? 0) + 1;
        const refusals = judgeTransition(fromState, v.toState, seq, v);
        if (refusals.length) throw new HttpError('validation.failed', 'validation issue transition refused', { fields: refusals.map(r => ({ path: [r.path], code: r.code })) });
        if (v.assigneeActorId && !await actorInWorkspace(tx, viewer.workspaceId, v.assigneeActorId)) invalid('assigneeActorId', 'not_found');
        if (v.basisCommentId && !await issueCommentExists(tx, viewer.workspaceId, i.id, v.basisCommentId)) invalid('basisCommentId', 'not_found');
        if (v.duplicateOfIssueId) {
          if (v.duplicateOfIssueId.toLowerCase() === i.id) invalid('duplicateOfIssueId', 'self');
          const other = await issueOwner(tx, viewer, v.duplicateOfIssueId).catch((e: unknown) => {
            if (e instanceof HttpError && e.code === 'not_found.record') invalid('duplicateOfIssueId', 'not_found');
            throw e;
          });
          if (other.project_id !== i.project_id) invalid('duplicateOfIssueId', 'other_project');
        }
        // fix_verified comes only from fix_requested, so the head is the entry into fix_requested.
        if (v.occurrenceId) {
          const located = head ? await occurrenceAfter(tx, viewer, i.id, v.occurrenceId, head.created_at) : 'not_found';
          if (located !== 'ok') invalid('occurrenceId', located);
        }
        const id = randomUUID();
        await tx.insert(validationIssueTransitions).values({
          id, workspaceId: viewer.workspaceId, projectId: i.project_id, issueId: i.id, seq, fromState, toState: v.toState,
          duplicateOfIssueId: v.duplicateOfIssueId, reason: v.reason, assigneeActorId: v.assigneeActorId, basisCommentId: v.basisCommentId,
          occurrenceId: v.occurrenceId, actorId: viewer.actorId, createdAt: sql`clock_timestamp()`,
        });
        await audit.record(tx, { ...base, event_type: 'lifecycle.validation_issue.state_changed', subject_type: 'validation_issue', subject_id: i.id, summary: 'validation issue state changed', detail: { transitionId: id, seq, fromState, toState: v.toState } });
        return { id, issueId: i.id, seq, state: v.toState };
      }
    }
  }
  /** Standalone application boundary, reusing Core's existing actor/key store; receipts contain ids/counts only. */
  async function execute(caller: Caller, action: ValidationIssueAction, raw: unknown, key: string) {
    if (!z.string().uuid().safeParse(key).success) invalid('idempotencyKey', 'malformed');
    const normalizedKey = key.toLowerCase();
    const hash = hashRequestBody({ workspace: caller.workspace_id, action: `validationIssue.${action}`, input: raw });
    return deps.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${caller.actor_id}), hashtext(${normalizedKey}))`);
      await lockValidationIssueTarget(tx, viewerOf(caller), action, raw);
      const result = await idempotency.runIdempotent(tx, caller.actor_id, normalizedKey, hash, async () => ({ status: 200, body: await handle(tx, caller, action, raw) }));
      return result.body;
    });
  }
  return { handle, execute };
}
