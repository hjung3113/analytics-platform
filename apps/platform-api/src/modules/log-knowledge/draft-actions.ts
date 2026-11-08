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

import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';
import { findWorkspaceActor } from '../auth/index.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_ITEMS_MENU_ID } from './catalog-menu.js';
import {
  DRAFT_INPUT_KEYS,
  type DraftInput,
  type DraftOp,
  parseDraftHead,
  parseProposal,
  validateDraftInput,
} from './domain/draft-input.js';
import { authorAuthNow, draftAnswer, draftCores } from './draft-core.js';
import { canSubmit, canWithdraw, isFinalDraftStatus } from './domain/draft-transitions.js';
import { type DraftRow, findDraftByValidatorRef, latestDigest, patchDraft } from './repositories/draft-write.js';

export const DRAFT_PERMISSION = 'knowledge.draft.create';
/** The menu permission the four actions declare: bootstrap lists it exactly for the users `DRAFT_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const DRAFT_MENU_PERMISSION = 'knowledge:draft-create';
/** The reads (same menu) that show what a draft write changes. */
const INVALIDATES = ['logKnowledge.drafts', 'logKnowledge.draftDetail'] as const;

export interface DraftActionDeps {
  checkService: CheckService;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function draftActions(deps: DraftActionDeps): MenuActionDeclaration[] {
  const core = draftCores(deps);
  const { lockOwn, replayOwn, record } = core;

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      DRAFT_PERMISSION,
      await deps.checkService.checkCapability(actor, DRAFT_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  /** The parsed head; `validate` ran before the handler, so a failure here is a bug. */
  function head<Op extends DraftOp>(op: Op, input: Record<string, unknown>): DraftInput<Op> {
    const result = parseDraftHead(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
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

  const answer = draftAnswer;

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
      return core.createDraft(tx, actor, {
        proposalType: value.proposalType,
        targetItemId: value.targetItemId,
        proposal: parsed.value,
        authKind,
        actorType,
        validatorRef: ref,
      });
    },
  };

  // ---- update -------------------------------------------------------------------------------------------------
  const draftUpdate: MenuActionDeclaration = {
    spec: base('draftUpdate', 'version'),
    authorize,
    validate: (input) => validateDraftInput('draftUpdate', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = head('draftUpdate', input);
      const before = await lockExisting(tx, actor, value.id, 'draftUpdate');
      // The answer does not depend on the version the caller holds: a final draft is `illegal_transition`.
      if (isFinalDraftStatus(before.status)) throw invalid({ path: ['id'], code: 'illegal_transition' });
      const parsed = parseProposal(before.proposalType as 'create' | 'revise', value.proposal);
      if (!parsed.ok) throw new MenuActionInvalidError(parsed.errors);
      return core.updateDraft(tx, actor, before, parsed.value);
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
