// The model spec write actions of the log knowledge hub (#1196 b1, ADR-0111): create a draft, save (append or replace)
// structured rows into it, publish (content-hash seal) and reject. Right: `knowledge.spec.publish` (workspace-scoped;
// Admin passes through the module bypass). Rules: the workspace is the actor's; the four spec tables are append-only
// (a `replace` rejects the draft and opens a new one); every successful write is one transaction with one audit row.
// `currentVersion` locks the revision row; for a revision that is not a draft it answers a value no client can hold,
// so the engine answers `conflict`. A refusal only the database can judge is a `MenuActionInvalidError`.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import { type SpecInput, parseSpecInput, planSpecRows, validateSpecInput } from './domain/spec-input.js';
import {
  type RevisionRow,
  bumpDraft,
  createDraft,
  createReplacementDraft,
  hashRevision,
  insertPlannedRows,
  latestPublished,
  loadDraftIndex,
  lockRevision,
  rejectDraft,
  sealDraft,
} from './repositories/spec-write.js';

export const SPEC_PERMISSION = 'knowledge.spec.publish';
/** The menu permission the four actions and the draft read declare: bootstrap lists it exactly for the users `SPEC_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const SPEC_MENU_PERMISSION = 'knowledge:spec-publish';

/** Reads (same menu) that show what a spec write changes. */
const INVALIDATES = ['logKnowledge.modelSpec', 'logKnowledge.modelSpecRevisions', 'logKnowledge.specDraft'] as const;

const INPUT_KEYS = {
  draftCreate: ['modelId', 'sourceDocRef'],
  draftSave: ['revisionId', 'mode', 'sourceDocRef', 'modules', 'events', 'relations'],
  publish: ['revisionId'],
  reject: ['revisionId', 'reason'],
} as const;

export interface SpecActionDeps {
  checkService: CheckService;
}

type AuditType = 'draft_saved' | 'published' | 'rejected';

export function specActions(deps: SpecActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      SPEC_PERMISSION,
      await deps.checkService.checkCapability(actor, SPEC_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: AuditType,
    revision: { id: string; revisionNo: number },
    detail: Record<string, unknown>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.spec.${type}`,
      subject_type: 'knowledge_model_spec',
      subject_id: revision.id,
      summary: `model spec revision ${revision.revisionNo} ${type}`,
      detail,
    });

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends keyof typeof INPUT_KEYS>(op: Op, input: Record<string, unknown>): SpecInput<Op> {
    const result = parseSpecInput(op, input);
    if (!result.ok) throw new Error(`action spec ${op}: validate passed but parse failed`);
    return result.value;
  }

  /** The revision is locked by `currentVersion`; for a non-draft it returned a value the client cannot hold. */
  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const revision = await lockRevision(tx, actor.workspace_id, input.revisionId as string);
    if (!revision) return null;
    return revision.state === 'draft' ? String(revision.rowVersion) : `${revision.state}:${revision.rowVersion}`;
  };

  async function lockDraft(tx: Tx, actor: PlatformActor, revisionId: string, action: string): Promise<RevisionRow> {
    const revision = await lockRevision(tx, actor.workspace_id, revisionId);
    if (!revision || revision.state !== 'draft') throw new Error(`action ${action}: currentVersion judged the revision first`);
    return revision;
  }

  const base = (op: keyof typeof INPUT_KEYS, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.spec${op[0]?.toUpperCase()}${op.slice(1)}`,
    menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
    inputKeys: INPUT_KEYS[op],
    permission: SPEC_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const draftCreate: MenuActionDeclaration = {
    spec: base('draftCreate', 'none'),
    authorize,
    validate: (input) => validateSpecInput('draftCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('draftCreate', input);
      const result = await createDraft(tx, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        modelId: value.modelId,
        sourceDocRef: value.sourceDocRef,
      });
      if (!result.ok) throw new MenuActionInvalidError([{ path: ['modelId'], code: result.code }]);
      const revision = result.revision;
      await record(tx, actor, 'draft_saved', revision, {
        modelId: revision.modelId,
        revisionNo: revision.revisionNo,
        mode: 'create',
        added: { modules: 0, events: 0, relations: 0 },
      });
      return { data: { revisionId: revision.id, version: String(revision.rowVersion) }, version: String(revision.rowVersion) };
    },
  };

  const draftSave: MenuActionDeclaration = {
    spec: base('draftSave', 'version'),
    authorize,
    validate: (input) => validateSpecInput('draftSave', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('draftSave', input);
      const draft = await lockDraft(tx, actor, value.revisionId, 'specDraftSave');
      // `replace` starts from an empty draft; `append` from what the draft holds.
      const index =
        value.mode === 'replace'
          ? { moduleKeys: new Set<string>(), eventKeys: new Set<string>() }
          : await loadDraftIndex(tx, ws, draft.id);
      const plan = planSpecRows(index, value);
      if (!plan.ok) throw new MenuActionInvalidError(plan.errors);
      const added = { modules: plan.modules.length, events: plan.events.length, relations: plan.relations.length };

      let target: RevisionRow = draft;
      let version: number;
      if (value.mode === 'replace') {
        // The four tables are append-only: reject this draft, open a new one in the same transaction.
        const sourceDocRef = value.sourceDocRef ?? draft.sourceDocRef;
        await rejectDraft(tx, ws, draft, 'replaced');
        target = await createReplacementDraft(tx, {
          workspaceId: ws,
          actorId: actor.actor_id,
          modelId: draft.modelId,
          sourceDocRef,
        });
        version = target.rowVersion;
      } else {
        version = await bumpDraft(tx, ws, draft, value.sourceDocRef);
      }
      await insertPlannedRows(tx, ws, target.id, plan);
      await record(tx, actor, 'draft_saved', target, {
        modelId: target.modelId,
        revisionNo: target.revisionNo,
        mode: value.mode,
        added,
        ...(value.mode === 'replace' ? { replacedRevisionId: draft.id } : {}),
      });
      return { data: { revisionId: target.id, version: String(version), counts: added }, version: String(version) };
    },
  };

  const publish: MenuActionDeclaration = {
    spec: base('publish', 'version'),
    authorize,
    validate: (input) => validateSpecInput('publish', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('publish', input);
      const draft = await lockDraft(tx, actor, value.revisionId, 'specPublish');
      const { sha256, counts } = await hashRevision(tx, ws, draft);
      if (counts.modules + counts.events + counts.relations === 0) {
        throw new MenuActionInvalidError([{ path: ['revisionId'], code: 'empty' }]);
      }
      const latest = await latestPublished(tx, ws, draft.modelId);
      if (latest && latest.contentSha256 === sha256) {
        // Same content as the latest published revision: no new revision; the draft must not block the next create.
        const version = await rejectDraft(tx, ws, draft, 'unchanged');
        await record(tx, actor, 'published', draft, {
          modelId: draft.modelId,
          revisionNo: draft.revisionNo,
          outcome: 'unchanged',
          contentSha256: sha256,
          counts,
          existingRevisionId: latest.id,
        });
        return { data: { outcome: 'unchanged', revisionId: latest.id }, version: String(version) };
      }
      const version = await sealDraft(tx, ws, actor.actor_id, draft, sha256);
      await record(tx, actor, 'published', draft, {
        modelId: draft.modelId,
        revisionNo: draft.revisionNo,
        outcome: 'published',
        contentSha256: sha256,
        counts,
      });
      return {
        data: { outcome: 'published', revisionId: draft.id, contentSha256: sha256 },
        version: String(version),
      };
    },
  };

  const reject: MenuActionDeclaration = {
    spec: base('reject', 'version'),
    authorize,
    validate: (input) => validateSpecInput('reject', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('reject', input);
      const draft = await lockDraft(tx, actor, value.revisionId, 'specReject');
      const version = await rejectDraft(tx, actor.workspace_id, draft, value.reason);
      await record(tx, actor, 'rejected', draft, {
        modelId: draft.modelId,
        revisionNo: draft.revisionNo,
        reasonLength: [...value.reason].length,
      });
      return { data: { revisionId: draft.id }, version: String(version) };
    },
  };

  return [draftCreate, draftSave, publish, reject];
}
