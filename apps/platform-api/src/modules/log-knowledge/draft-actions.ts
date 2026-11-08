import { draftAccessVisible } from './replay-access.js';
// The knowledge draft write actions of the log knowledge hub (#1198 a, design v0.6 §6.4–6.6): create, update, submit and
// withdraw by the human author. Right: `knowledge.draft.create` (workspace-scoped; Admin passes through the module
// bypass; Developer and User by grant, owner answer #1198 Q2). Rules: the workspace is the actor's; `origin` and
// `author_auth` are derived from the request's auth context (node c: a service token's draft is `ai`, or `validator` with a
// `validatorRef`) and every identity field comes from the server, never from the input; only the draft's submitter may update, submit
// or withdraw it (a draft the caller cannot see is `not_found`, one they can see but did not author is `['id']
// forbidden_not_author`; both are judged BEFORE the engine compares `expectedVersion`); every proposal is the item input
// with the same server checks an item create / revise runs (owner, target, subjects); a revision is appended (never
// edited) under the draft row lock, so `draft_rev_no` is gapless; each write is one transaction holding the row change,
// the revision (create / update) and the audit row. Node a never writes a `knowledge_item*` table: review, approval and
// publish are node b. A refusal only the database can judge is a `MenuActionInvalidError` (field errors, never a 500).

import { createAuditService } from '../core/audit/audit-service.js';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import { findWorkspaceActor } from '../auth/index.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import { type PlatformActor, holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_ITEMS_MENU_ID } from './catalog-menu.js';
import {
  DRAFT_INPUT_KEYS,
  type DraftInput,
  type DraftOp,
  type NormalizedProposal,
  deriveOrigin,
  ownerImmutableErrors,
  parseDraftHead,
  parseProposal,
  proposalDigest,
  validateDraftInput,
} from './domain/draft-input.js';
import { canSubmit, canWithdraw, isFinalDraftStatus } from './domain/draft-transitions.js';
import {
  type DraftRow,
  insertDraft,
  findDraftByValidatorRef,
  insertDraftRevision,
  latestDigest,
  lockDraft,
  patchDraft,
  readTargetItem,
} from './repositories/draft-write.js';
import { judgeSubjects, softwareModelId } from './repositories/item-subject.js';
import { checkOwner } from './repositories/item-write.js';
import { type Viewer, viewerOf } from './repositories/access-visibility.js';

export const DRAFT_PERMISSION = 'knowledge.draft.create';
/** The menu permission the four actions declare: bootstrap lists it exactly for the users `DRAFT_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const DRAFT_MENU_PERMISSION = 'knowledge:draft-create';
/** Holders of this see submitted drafts of others (the reads' visibility rule); an author-only check never uses it for a write. */
const REVIEW_MENU_PERMISSION = 'knowledge:item-publish';

/** The reads (same menu) that show what a draft write changes. */
const INVALIDATES = ['logKnowledge.drafts', 'logKnowledge.draftDetail'] as const;

export interface DraftActionDeps {
  checkService: CheckService;
}

type AuditType = 'created' | 'updated' | 'submitted' | 'withdrawn';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

/** How the caller authenticated, from the server's request context only (never from input): stored on every revision. */
const authorAuthNow = (): 'session' | 'token' => (currentAuthContext().kind === 'token' ? 'token' : 'session');

export function draftActions(deps: DraftActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      DRAFT_PERMISSION,
      await deps.checkService.checkCapability(actor, DRAFT_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: AuditType,
    draft: DraftRow,
    payloadDigest: string,
    statusBefore: string | null,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.draft.${type}`,
      subject_type: 'knowledge_draft',
      subject_id: draft.id,
      summary: `knowledge draft ${type}`,
      detail: {
        draftId: draft.id,
        proposalType: draft.proposalType,
        origin: draft.origin,
        targetItemId: draft.targetItemId,
        draftRevNo: draft.latestDraftRev,
        payloadDigest,
        statusBefore,
        statusAfter: draft.status,
      },
    });

  /** The parsed head; `validate` ran before the handler, so a failure here is a bug. */
  function head<Op extends DraftOp>(op: Op, input: Record<string, unknown>): DraftInput<Op> {
    const result = parseDraftHead(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  /**
   * Locks the draft and judges who is asking, BEFORE any version comparison: missing, another workspace's or hidden from
   * the caller → null (`not_found`, never a version); visible but not theirs → `forbidden_not_author`. A draft is visible to
   * its author in every status and, once it is not a plain `draft`, to a holder of `knowledge.item.publish`.
   */
  async function lockOwn(tx: Tx, actor: PlatformActor, id: string): Promise<DraftRow | null> {
    const row = await lockDraft(tx, viewerOf(actor), id);
    if (!row) return null;
    if (row.submitterActorId === actor.actor_id) return row;
    const reviewer = await holdsPlatformPermission(deps.checkService, actor, REVIEW_MENU_PERMISSION, { tx });
    if (reviewer && row.status !== 'draft') throw invalid({ path: ['id'], code: 'forbidden_not_author' });
    return null;
  }

  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockOwn(tx, actor, input.id as string);
    return row ? String(row.rowVersion) : null;
  };

  async function lockExisting(tx: Tx, actor: PlatformActor, id: string, action: string): Promise<DraftRow> {
    const row = await lockOwn(tx, actor, id);
    if (!row) throw new Error(`action ${action}: currentVersion judged not_found first`);
    return row;
  }

  const base = (op: DraftOp, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.${op}`,
    menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID,
    inputKeys: DRAFT_INPUT_KEYS[op],
    permission: DRAFT_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const answer = (draft: DraftRow, payloadDigest: string): ActionHandlerResult => ({
    data: { id: draft.id, status: draft.status, latestDraftRev: draft.latestDraftRev, payloadDigest },
    version: String(draft.rowVersion),
  });

  /** The owner of a create draft must exist and be active (the item create's check), on the field the caller set. */
  async function ownerErrors(tx: Tx, viewer: Viewer, proposal: NormalizedProposal): Promise<FieldError[]> {
    const [field, check] = proposal.ownerModelId
      ? (['ownerModelId', await checkOwner(tx, viewer, { modelId: proposal.ownerModelId })] as const)
      : (['ownerSoftwareId', await checkOwner(tx, viewer, { softwareId: proposal.ownerSoftwareId ?? '' })] as const);
    return check === 'ok' ? [] : [{ path: ['proposal', field], code: check }];
  }

  /** `subjects` against the owner's model (a SW-owned item: its SW version's model); omitted subjects (a revise) are not judged. */
  async function subjectErrors(tx: Tx, ws: string, modelId: string | null, proposal: NormalizedProposal): Promise<FieldError[]> {
    if (proposal.subjects === undefined) return [];
    const judged = await judgeSubjects(tx, ws, modelId ?? '', proposal.subjects);
    return judged.errors.map((e) => ({ path: ['proposal', ...e.path], code: e.code }));
  }

  /** The model the item (or draft) owner belongs to. */
  async function modelOf(tx: Tx, ws: string, owner: { ownerModelId: string | null; ownerSoftwareId: string | null }): Promise<string | null> {
    return owner.ownerModelId ?? (owner.ownerSoftwareId ? await softwareModelId(tx, ws, owner.ownerSoftwareId) : null);
  }

  /**
   * A resend of a validator ref answers its draft only to that draft's author (review C3): another actor's draft is
   * private, so another caller learns only that the ref is taken — never its id, status, digest or version.
   */
  async function replayOwn(tx: Tx, ws: string, actorId: string, existing: DraftRow): Promise<ActionHandlerResult> {
    if (!(await draftAccessVisible(tx, { workspaceId: ws, actorId }, existing.id))) throw invalid({ path: ['validatorRef'], code: 'not_found' });
    if (existing.submitterActorId !== actorId) throw invalid({ path: ['validatorRef'], code: 'taken' });
    return answer(existing, await latestDigest(tx, ws, existing));
  }

  // ---- create -------------------------------------------------------------------------------------------------
  const draftCreate: MenuActionDeclaration = {
    spec: base('draftCreate', 'none'),
    authorize,
    validate: (input) => validateDraftInput('draftCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = head('draftCreate', input);
      const authKind = authorAuthNow();
      const found = await findWorkspaceActor(tx, { workspaceId: ws, actorId: actor.actor_id });
      const actorType = found?.actor_type ?? '';
      const ref = value.validatorRef;
      // A validator ref belongs to a service token (system actor) only; a session or a personal token may not send one.
      if (ref && !(authKind === 'token' && actorType === 'system')) throw invalid({ path: ['validatorRef'], code: 'not_allowed' });
      // Same finding again (any idempotency key): the existing draft, no new row, revision or audit.
      if (ref) {
        const existing = await findDraftByValidatorRef(tx, ws, ref);
        if (existing) return replayOwn(tx, ws, actor.actor_id, existing);
      }
      const parsed = parseProposal(value.proposalType, value.proposal);
      if (!parsed.ok) throw new Error('action draftCreate: validate passed but parse failed');
      const proposal = parsed.value;
      let owner: { ownerModelId: string | null; ownerSoftwareId: string | null };
      let target: { id: string; baseRevisionNo: number } | null = null;
      const errors: FieldError[] = [];
      if (value.proposalType === 'create') {
        errors.push(...(await ownerErrors(tx, viewerOf(actor), proposal)));
        owner = { ownerModelId: proposal.ownerModelId ?? null, ownerSoftwareId: proposal.ownerSoftwareId ?? null };
      } else {
        const item = await readTargetItem(tx, viewerOf(actor), value.targetItemId as string);
        if (!item) throw invalid({ path: ['targetItemId'], code: 'not_found' });
        if (item.publicationState === 'archived') throw invalid({ path: ['targetItemId'], code: 'archived' });
        target = { id: item.id, baseRevisionNo: item.latestRevisionNo };
        owner = { ownerModelId: item.ownerModelId, ownerSoftwareId: item.ownerSoftwareId };
      }
      if (errors.length === 0) errors.push(...(await subjectErrors(tx, ws, await modelOf(tx, ws, owner), proposal)));
      if (errors.length > 0) throw new MenuActionInvalidError(errors);

      const draft = await insertDraft(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        origin: deriveOrigin(authKind, actorType, ref !== undefined),
        validatorRef: ref,
        proposalType: value.proposalType,
        targetItemId: target?.id ?? null,
        baseRevisionNo: target?.baseRevisionNo ?? null,
        ...owner,
      });
      if (!draft) {
        // A racing create won the ref's unique index between the lookup and the insert: answer as the replay does.
        const winner = ref ? await findDraftByValidatorRef(tx, ws, ref) : null;
        if (!winner) throw new Error('action draftCreate: validator ref conflict but no draft found');
        return replayOwn(tx, ws, actor.actor_id, winner);
      }
      const digest = await insertDraftRevision(tx, ws, draft.id, 1, actor.actor_id, proposal, authKind);
      await record(tx, actor, 'created', draft, digest, null);
      return answer(draft, digest);
    },
  };

  // ---- update -------------------------------------------------------------------------------------------------
  const draftUpdate: MenuActionDeclaration = {
    spec: base('draftUpdate', 'version'),
    authorize,
    validate: (input) => validateDraftInput('draftUpdate', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = head('draftUpdate', input);
      const before = await lockExisting(tx, actor, value.id, 'draftUpdate');
      // The answer does not depend on the version the caller holds: a final draft is `illegal_transition`.
      if (isFinalDraftStatus(before.status)) throw invalid({ path: ['id'], code: 'illegal_transition' });
      const parsed = parseProposal(before.proposalType as 'create' | 'revise', value.proposal);
      if (!parsed.ok) throw new MenuActionInvalidError(parsed.errors);
      const proposal = parsed.value;
      if (before.proposalType === 'create') {
        const immutable = ownerImmutableErrors(before, proposal);
        if (immutable.length > 0) throw new MenuActionInvalidError(immutable);
      }
      const digest = proposalDigest(proposal);
      // Same payload as the latest revision: nothing changes, nothing is audited, the current version is answered.
      if (digest === (await latestDigest(tx, ws, before))) return answer(before, digest);

      const errors: FieldError[] = [];
      if (before.proposalType === 'create') errors.push(...(await ownerErrors(tx, viewerOf(actor), proposal)));
      else {
        const item = await readTargetItem(tx, viewerOf(actor), before.targetItemId as string);
        if (item?.publicationState === 'archived') errors.push({ path: ['id'], code: 'archived' });
      }
      if (errors.length === 0) errors.push(...(await subjectErrors(tx, ws, await modelOf(tx, ws, before), proposal)));
      if (errors.length > 0) throw new MenuActionInvalidError(errors);

      const revNo = before.latestDraftRev + 1;
      await insertDraftRevision(tx, ws, before.id, revNo, actor.actor_id, proposal, authorAuthNow());
      const after = await patchDraft(tx, ws, before.id, actor.actor_id, { latestDraftRev: revNo });
      await record(tx, actor, 'updated', after, digest, before.status);
      return answer(after, digest);
    },
  };

  // ---- submit -------------------------------------------------------------------------------------------------
  const draftSubmit: MenuActionDeclaration = {
    spec: base('draftSubmit', 'version'),
    authorize,
    validate: (input) => validateDraftInput('draftSubmit', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = head('draftSubmit', input);
      const before = await lockExisting(tx, actor, value.id, 'draftSubmit');
      if (!canSubmit(before.status)) throw invalid({ path: ['id'], code: 'illegal_transition' });
      const after = await patchDraft(tx, ws, before.id, actor.actor_id, { status: 'submitted', submittedAt: sql`now()` });
      const digest = await latestDigest(tx, ws, after);
      await record(tx, actor, 'submitted', after, digest, before.status);
      return answer(after, digest);
    },
  };

  // ---- withdraw -----------------------------------------------------------------------------------------------
  const draftWithdraw: MenuActionDeclaration = {
    spec: base('draftWithdraw', 'version'),
    authorize,
    validate: (input) => validateDraftInput('draftWithdraw', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = head('draftWithdraw', input);
      const before = await lockExisting(tx, actor, value.id, 'draftWithdraw');
      if (!canWithdraw(before.status)) throw invalid({ path: ['id'], code: 'illegal_transition' });
      // The reason is stored on the draft, never in the audit detail.
      const after = await patchDraft(tx, ws, before.id, actor.actor_id, {
        status: 'withdrawn',
        closedAt: sql`now()`,
        closedBy: actor.actor_id,
        closeReason: value.reason,
      });
      const digest = await latestDigest(tx, ws, after);
      await record(tx, actor, 'withdrawn', after, digest, before.status);
      return answer(after, digest);
    },
  };

  return [draftCreate, draftUpdate, draftSubmit, draftWithdraw];
}
