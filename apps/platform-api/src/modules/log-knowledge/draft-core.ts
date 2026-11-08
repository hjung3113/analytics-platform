// The shared create / update cores of the knowledge drafts (#1198 a, extracted for #1474): the draft write actions
// (`draft-actions.ts`) and the evidence intake (`draft-evidence-intake.ts`) both run these, so the capability, the
// owner/subject checks, the `origin` / `author_auth` derivation, the author-only rule and the editable-status rule are one
// code path. Behaviour-preserving extraction: every error code, path and audit row is what the handlers produced before.
// The caller owns the transaction. `handoff` (#1474) is the optional audit key of a log-explorer evidence handoff.

import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { type ActionHandlerResult, type FieldError, MenuActionInvalidError } from '../menu-dispatch/types.js';
import type { CheckService } from '../permissions/check-service.js';
import { type PlatformActor, holdsPlatformPermission } from '../platform-port/permissions.js';
import {
  type NormalizedProposal,
  type ValidatorRef,
  deriveOrigin,
  ownerImmutableErrors,
  proposalDigest,
} from './domain/draft-input.js';
import {
  type DraftRow,
  findDraftByValidatorRef,
  insertDraft,
  insertDraftRevision,
  latestDigest,
  lockDraft,
  patchDraft,
  readTargetItem,
} from './repositories/draft-write.js';
import { judgeSubjects, softwareModelId } from './repositories/item-subject.js';
import { checkOwner } from './repositories/item-write.js';

/** Holders of this see submitted drafts of others (the reads' visibility rule); an author-only check never uses it for a write. */
const REVIEW_MENU_PERMISSION = 'knowledge:item-publish';

export type DraftAuditType = 'created' | 'updated' | 'submitted' | 'withdrawn';

/** The audit key of an evidence handoff: the origin and a count, nothing else. */
export interface DraftHandoff {
  originKind: 'log_explorer';
  originId: string;
  refCount: number;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

/** How the caller authenticated, from the server's request context only (never from input): stored on every revision. */
export const authorAuthNow = (): 'session' | 'token' => (currentAuthContext().kind === 'token' ? 'token' : 'session');

export const draftAnswer = (draft: DraftRow, payloadDigest: string): ActionHandlerResult => ({
  data: { id: draft.id, status: draft.status, latestDraftRev: draft.latestDraftRev, payloadDigest },
  version: String(draft.rowVersion),
});

export interface CreateCoreInput {
  proposalType: 'create' | 'revise';
  targetItemId: string | null | undefined;
  proposal: NormalizedProposal;
  authKind: 'session' | 'token';
  actorType: string;
  validatorRef: ValidatorRef | undefined;
  handoff?: DraftHandoff | undefined;
}

export function draftCores(deps: { checkService: CheckService }) {
  const audit = createAuditService();

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: DraftAuditType,
    draft: DraftRow,
    payloadDigest: string,
    statusBefore: string | null,
    handoff?: DraftHandoff,
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
        ...(handoff ? { handoff } : {}),
      },
    });

  /**
   * Locks the draft and judges who is asking, BEFORE any version comparison: missing, another workspace's or hidden from
   * the caller → null (`not_found`, never a version); visible but not theirs → `forbidden_not_author`. A draft is visible to
   * its author in every status and, once it is not a plain `draft`, to a holder of `knowledge.item.publish`.
   */
  async function lockOwn(tx: Tx, actor: PlatformActor, id: string): Promise<DraftRow | null> {
    const row = await lockDraft(tx, actor.workspace_id, id);
    if (!row) return null;
    if (row.submitterActorId === actor.actor_id) return row;
    const reviewer = await holdsPlatformPermission(deps.checkService, actor, REVIEW_MENU_PERMISSION, { tx });
    if (reviewer && row.status !== 'draft') throw invalid({ path: ['id'], code: 'forbidden_not_author' });
    return null;
  }

  /** The owner of a create draft must exist and be active (the item create's check), on the field the caller set. */
  async function ownerErrors(tx: Tx, ws: string, proposal: NormalizedProposal): Promise<FieldError[]> {
    const [field, check] = proposal.ownerModelId
      ? (['ownerModelId', await checkOwner(tx, ws, { modelId: proposal.ownerModelId })] as const)
      : (['ownerSoftwareId', await checkOwner(tx, ws, { softwareId: proposal.ownerSoftwareId ?? '' })] as const);
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
    if (existing.submitterActorId !== actorId) throw invalid({ path: ['validatorRef'], code: 'taken' });
    return draftAnswer(existing, await latestDigest(tx, ws, existing));
  }

  /** Create core: owner / target / subject checks on an already parsed proposal, then the draft row, revision 1 and the audit row. */
  async function createDraft(tx: Tx, actor: PlatformActor, input: CreateCoreInput): Promise<ActionHandlerResult> {
    const ws = actor.workspace_id;
    const { proposal, validatorRef: ref } = input;
    let owner: { ownerModelId: string | null; ownerSoftwareId: string | null };
    let target: { id: string; baseRevisionNo: number } | null = null;
    const errors: FieldError[] = [];
    if (input.proposalType === 'create') {
      errors.push(...(await ownerErrors(tx, ws, proposal)));
      owner = { ownerModelId: proposal.ownerModelId ?? null, ownerSoftwareId: proposal.ownerSoftwareId ?? null };
    } else {
      const item = await readTargetItem(tx, ws, input.targetItemId as string);
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
      origin: deriveOrigin(input.authKind, input.actorType, ref !== undefined),
      validatorRef: ref,
      proposalType: input.proposalType,
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
    const digest = await insertDraftRevision(tx, ws, draft.id, 1, actor.actor_id, proposal, input.authKind);
    await record(tx, actor, 'created', draft, digest, null, input.handoff);
    return draftAnswer(draft, digest);
  }

  /**
   * Update core on a locked, caller-owned, non-final draft and an already parsed proposal: owner immutability, owner /
   * archived / subject checks, then a new revision. The same payload as the latest revision changes and audits nothing.
   */
  async function updateDraft(
    tx: Tx,
    actor: PlatformActor,
    before: DraftRow,
    proposal: NormalizedProposal,
    handoff?: DraftHandoff,
  ): Promise<ActionHandlerResult> {
    const ws = actor.workspace_id;
    if (before.proposalType === 'create') {
      const immutable = ownerImmutableErrors(before, proposal);
      if (immutable.length > 0) throw new MenuActionInvalidError(immutable);
    }
    const digest = proposalDigest(proposal);
    // Same payload as the latest revision: nothing changes, nothing is audited, the current version is answered.
    if (digest === (await latestDigest(tx, ws, before))) return draftAnswer(before, digest);

    const errors: FieldError[] = [];
    if (before.proposalType === 'create') errors.push(...(await ownerErrors(tx, ws, proposal)));
    else {
      const item = await readTargetItem(tx, ws, before.targetItemId as string);
      if (item?.publicationState === 'archived') errors.push({ path: ['id'], code: 'archived' });
    }
    if (errors.length === 0) errors.push(...(await subjectErrors(tx, ws, await modelOf(tx, ws, before), proposal)));
    if (errors.length > 0) throw new MenuActionInvalidError(errors);

    const revNo = before.latestDraftRev + 1;
    await insertDraftRevision(tx, ws, before.id, revNo, actor.actor_id, proposal, authorAuthNow());
    const after = await patchDraft(tx, ws, before.id, actor.actor_id, { latestDraftRev: revNo });
    await record(tx, actor, 'updated', after, digest, before.status, handoff);
    return draftAnswer(after, digest);
  }

  return { record, lockOwn, replayOwn, createDraft, updateDraft };
}
