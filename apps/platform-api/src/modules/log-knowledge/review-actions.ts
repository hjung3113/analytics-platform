// The knowledge draft review actions of the log knowledge hub (#1198 b, design v0.6 §6.4–6.6): approve, reject and
// request changes on a SUBMITTED draft. Right: `knowledge.item.publish` (owner answer #1198 Q2: no new capability;
// session-only once the token core marks it so), judged inside the transaction, so a revoked right refuses an approval
// already on its way. Rules: only a human reviewer decides (a service actor never holds the right); a human may approve
// their own session-authored draft (`self_approval` marks it), a draft a token of theirs wrote is refused
// (`self_approval_via_token`); a draft in status `draft` is private to its author (`not_found` for a reviewer). The draft's
// version is the concurrency token (`expectedDraftVersion`), so an edit after the reviewer loaded the draft is `conflict`;
// the approved digest is the second guard (`stale_digest`). An approval is ONE transaction: the shared item publish core
// (the rows and the item's audit row a direct publish writes), the review row, the draft move and `knowledge.draft.approved`
// commit together or not at all. Reject / request changes write no item row. No search outbox (owner answer Q3, #1199).

import { createAuditService } from '../core/audit/audit-service.js';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_ITEMS_MENU_ID } from './catalog-menu.js';
import type { DraftProposalType, NormalizedProposal } from './domain/draft-input.js';
import {
  REVIEW_INPUT_KEYS,
  type ReviewInput,
  type ReviewOp,
  itemVersionErrors,
  parseReviewInput,
  reviewerAuthorship,
  reviseTargetError,
  validateReviewInput,
} from './domain/review-input.js';
import { ITEM_MENU_PERMISSION, ITEM_PERMISSION } from './item-actions.js';
import { type DraftRow, lockDraft, patchDraft } from './repositories/draft-write.js';
import { authorAuthsOf, insertReview, readRevision } from './repositories/draft-review.js';
import { publishCreate, publishRevise } from './repositories/item-publish.js';
import { lockItem } from './repositories/item-write.js';
import { viewerOf } from './repositories/access-visibility.js';

const APPROVE_INVALIDATES = [
  'logKnowledge.drafts',
  'logKnowledge.draftDetail',
  'logKnowledge.items',
  'logKnowledge.itemDetail',
] as const;
const DECISION_INVALIDATES = ['logKnowledge.drafts', 'logKnowledge.draftDetail'] as const;

export interface ReviewActionDeps {
  checkService: CheckService;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

/** Postgres unique violation, however the driver wraps it. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown): unknown => (e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined);
  const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined;
  return code(error) === '23505' || code(cause) === '23505';
}

export function reviewActions(deps: ReviewActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      ITEM_PERMISSION,
      await deps.checkService.checkCapability(actor, ITEM_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  /** The parsed input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends ReviewOp>(op: Op, input: Record<string, unknown>): ReviewInput<Op> {
    const result = parseReviewInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  /**
   * Locks the draft and judges only visibility, BEFORE the engine compares the version: missing, another workspace's or a
   * plain `draft` of somebody else (private to its author) → null (`not_found`). Authorship is not checked: reviewers
   * are not authors.
   */
  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockDraft(tx, viewerOf(actor), input.id as string);
    if (!row) return null;
    if (row.status === 'draft' && row.submitterActorId !== actor.actor_id) return null;
    return String(row.rowVersion);
  };

  async function lockSubmitted(tx: Tx, actor: PlatformActor, id: string, action: string): Promise<DraftRow> {
    const row = await lockDraft(tx, viewerOf(actor), id);
    if (!row) throw new Error(`action ${action}: currentVersion judged not_found first`);
    if (row.status !== 'submitted') throw invalid({ path: ['id'], code: 'illegal_transition' });
    return row;
  }

  const base = (op: ReviewOp, invalidates: readonly string[]) => ({
    id: `logKnowledge.${op}`,
    menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID,
    inputKeys: REVIEW_INPUT_KEYS[op],
    permission: ITEM_MENU_PERMISSION,
    requiresScope: false,
    concurrency: 'version' as const,
    invalidates,
  });

  const recordDecision = (
    tx: Tx,
    actor: PlatformActor,
    type: 'approved' | 'rejected' | 'changes_requested',
    draft: DraftRow,
    detail: Record<string, unknown>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.draft.${type}`,
      subject_type: 'knowledge_draft',
      subject_id: draft.id,
      summary: `knowledge draft ${type}`,
      detail: { draftId: draft.id, ...detail },
    });

  // ---- approve ------------------------------------------------------------------------------------------------
  const draftApprove: MenuActionDeclaration = {
    spec: base('draftApprove', APPROVE_INVALIDATES),
    authorize,
    validate: (input) => validateReviewInput('draftApprove', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('draftApprove', input);
      const draft = await lockSubmitted(tx, actor, value.id, 'draftApprove');
      const proposalType = draft.proposalType as DraftProposalType;
      const versionErrors = itemVersionErrors(proposalType, value.expectedItemVersion);
      if (versionErrors.length > 0) throw invalid(...versionErrors);

      // a. the digest the reviewer approved is the latest revision's.
      const revision = await readRevision(tx, ws, draft.id, draft.latestDraftRev);
      if (revision.payloadDigest !== value.approvedDigest) throw invalid({ path: ['approvedDigest'], code: 'stale_digest' });

      // b. self-approval: a human reviewing their own session-authored draft is allowed (marked); a token-authored one is not.
      const authorship = reviewerAuthorship(await authorAuthsOf(tx, ws, draft.id, actor.actor_id));
      if (authorship === 'token') throw invalid({ path: ['id'], code: 'self_approval_via_token' });

      // c. publish exactly the stored proposal through the same core a direct publish uses, judged against current data.
      // The stored proposal is the normalized form validated when the revision was written and digest-checked above.
      const stored = revision.proposalJson as NormalizedProposal;
      const { evidence, subjects, ownerModelId, ownerSoftwareId, changeNote, ...content } = stored;
      let itemId: string;
      let itemNo: number;
      let revisionNo: number;
      if (proposalType === 'create') {
        const item = await publishCreate(
          tx,
          actor,
          { ownerModelId: draft.ownerModelId ?? ownerModelId, ownerSoftwareId: draft.ownerSoftwareId ?? ownerSoftwareId, content, evidence, subjects },
          ['proposal'],
        );
        [itemId, itemNo, revisionNo] = [item.id, item.itemNo, 1];
      } else {
        const target = await lockItem(tx, viewerOf(actor), draft.targetItemId as string);
        const targetError = reviseTargetError(target, value.expectedItemVersion as number);
        if (targetError || !target) throw invalid(targetError as FieldError);
        const item = await publishRevise(tx, actor, target, { content, evidence, subjects, changeNote: changeNote ?? '' }, ['proposal']);
        [itemId, itemNo, revisionNo] = [item.id, item.itemNo, item.latestRevisionNo];
      }

      // d–e. the decision and the draft move.
      const selfApproval = authorship === 'session';
      let reviewId: string;
      try {
        reviewId = await insertReview(tx, {
          workspaceId: ws,
          draftId: draft.id,
          reviewedDraftRevNo: revision.draftRevNo,
          decision: 'approved',
          approvedDigest: value.approvedDigest,
          selfApproval,
          rationale: value.rationale,
          postedItemId: itemId,
          postedRevisionNo: revisionNo,
          reviewerActorId: actor.actor_id,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw invalid({ path: ['id'], code: 'illegal_transition' });
        throw error;
      }
      const after = await patchDraft(tx, ws, draft.id, actor.actor_id, {
        status: 'approved',
        closedAt: sql`now()`,
        closedBy: actor.actor_id,
      });

      // f. the draft's decision row (the item's own row was written by the publish core).
      await recordDecision(tx, actor, 'approved', after, {
        reviewId,
        draftRevNo: revision.draftRevNo,
        approvedDigest: value.approvedDigest,
        itemId,
        revisionNo,
        selfApproval,
        origin: draft.origin,
      });
      return { data: { draftId: draft.id, reviewId, itemId, itemNo, revisionNo }, version: String(after.rowVersion) };
    },
  };

  // ---- reject / request changes -----------------------------------------------------------------------------
  function decision(op: 'draftReject' | 'draftRequestChanges', type: 'rejected' | 'changes_requested'): MenuActionDeclaration {
    return {
      spec: base(op, DECISION_INVALIDATES),
      authorize,
      validate: (input) => validateReviewInput(op, input),
      currentVersion,
      async handle(tx, actor, input): Promise<ActionHandlerResult> {
        const ws = actor.workspace_id;
        const value = parsed(op, input);
        const draft = await lockSubmitted(tx, actor, value.id, op);
        const revision = await readRevision(tx, ws, draft.id, draft.latestDraftRev);
        let reviewId: string;
        try {
          reviewId = await insertReview(tx, {
            workspaceId: ws,
            draftId: draft.id,
            reviewedDraftRevNo: revision.draftRevNo,
            decision: type,
            approvedDigest: null,
            selfApproval: false,
            rationale: value.rationale,
            postedItemId: null,
            postedRevisionNo: null,
            reviewerActorId: actor.actor_id,
          });
        } catch (error) {
          if (isUniqueViolation(error)) throw invalid({ path: ['id'], code: 'illegal_transition' });
          throw error;
        }
        const after = await patchDraft(
          tx,
          ws,
          draft.id,
          actor.actor_id,
          type === 'rejected' ? { status: 'rejected', closedAt: sql`now()`, closedBy: actor.actor_id } : { status: 'changes_requested' },
        );
        await recordDecision(tx, actor, type, after, {
          reviewId,
          draftRevNo: revision.draftRevNo,
          payloadDigest: revision.payloadDigest,
          origin: draft.origin,
        });
        return { data: { draftId: draft.id, reviewId, status: after.status }, version: String(after.rowVersion) };
      },
    };
  }

  return [draftApprove, decision('draftReject', 'rejected'), decision('draftRequestChanges', 'changes_requested')];
}
