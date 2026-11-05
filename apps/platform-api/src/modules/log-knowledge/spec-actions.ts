// The model spec write actions of the log knowledge hub (#1196 b1, ADR-0111): create a draft, save (append or replace)
// structured rows into it, publish (content-hash seal) and reject. Right: `knowledge.spec.publish` (workspace-scoped;
// Admin passes through the module bypass). Rules: the workspace is the actor's; the four spec tables are append-only
// (a `replace` rejects the draft and opens a new one); every successful write is one transaction with one audit row.
// `currentVersion` locks the revision row; for a revision that is not a draft it answers a value no client can hold,
// so the engine answers `conflict`. A refusal only the database can judge is a `MenuActionInvalidError`.

import { randomUUID } from 'node:crypto';

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
import { touchedTargetKeys } from './domain/spec-diff.js';
import { flagTouched, lockModelChanges } from './repositories/spec-change.js';
import { type SpecInput, parseSpecInput, planSpecRows, validateSpecInput } from './domain/spec-input.js';
import { type SpecTsvLines, parseSpecTsv, specTsvFieldErrors, tsvLineErrors } from './domain/spec-tsv.js';
import {
  type RevisionRow,
  bumpDraft,
  createDraft,
  createReplacementDraft,
  hashRevision,
  insertPlannedRows,
  latestPublished,
  loadDraftIndex,
  loadHashRows,
  lockRevision,
  previousPublished,
  rejectDraft,
  sealDraft,
} from './repositories/spec-write.js';

export const SPEC_PERMISSION = 'knowledge.spec.publish';
/** The menu permission the four actions and the draft read declare: bootstrap lists it exactly for the users `SPEC_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const SPEC_MENU_PERMISSION = 'knowledge:spec-publish';

/** Reads (same menu) that show what a spec write changes. */
const INVALIDATES = [
  'logKnowledge.modelSpec',
  'logKnowledge.modelSpecRevisions',
  'logKnowledge.specDraft',
  'logKnowledge.specChanges',
] as const;

const INPUT_KEYS = {
  draftCreate: ['modelId', 'sourceDocRef'],
  draftSave: ['revisionId', 'mode', 'sourceDocRef', 'modules', 'events', 'relations', 'text', 'format'],
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
    // A sealed revision must conflict whatever the client sends — including the token an earlier conflict handed
    // back. That token must therefore be fresh per call: anything derived only from state + row_version is
    // returned in `conflict.version`, so a replay could send it as `expectedVersion` and pass this step.
    return revision.state === 'draft' ? String(revision.rowVersion) : `${revision.state}:${randomUUID()}`;
  };

  async function lockDraft(tx: Tx, actor: PlatformActor, revisionId: string): Promise<RevisionRow> {
    const revision = await lockRevision(tx, actor.workspace_id, revisionId);
    // Unreachable while `currentVersion` judged the same row first in this transaction; kept invalid-shaped so a
    // caller that skips the version step cannot turn a sealed row into a server error.
    if (!revision || revision.state !== 'draft') {
      throw new MenuActionInvalidError([{ path: ['revisionId'], code: 'conflict' }]);
    }
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
    // The envelope/contract/cap checks gate the TSV parser: a refused input is not parsed (#1196 fix C1).
    validate: (input) => {
      const envelope = validateSpecInput('draftSave', input);
      return envelope.length > 0 ? envelope : specTsvFieldErrors(input);
    },
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('draftSave', input);
      const draft = await lockDraft(tx, actor, value.revisionId);
      // #1196 b2: a text call converges into the same structured rows here; `format` is provenance only.
      let rows = value;
      let source: 'rows' | 'tsv' | 'paste' = 'rows';
      let lines: SpecTsvLines | null = null;
      if (value.text !== undefined) {
        const tsv = parseSpecTsv(value.text);
        if (!tsv.ok) throw new Error('action spec draftSave: validate passed but tsv parse failed');
        if (value.format === undefined) throw new Error('action spec draftSave: text without format passed validate');
        source = value.format;
        lines = tsv.lines;
        rows = { ...value, modules: tsv.rows.modules, events: tsv.rows.events, relations: tsv.rows.relations };
      }
      // `replace` starts from an empty draft; `append` from what the draft holds.
      const index =
        value.mode === 'replace'
          ? { moduleKeys: new Set<string>(), eventKeys: new Set<string>(), relationEdges: new Set<string>() }
          : await loadDraftIndex(tx, ws, draft.id);
      const plan = planSpecRows(index, rows);
      if (!plan.ok) throw new MenuActionInvalidError(lines ? tsvLineErrors(plan.errors, lines) : plan.errors);
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
        input: source,
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
      const draft = await lockDraft(tx, actor, value.revisionId);
      // Lock order: revision row (above), then the model's change lock, then change rows. A concurrent `specChangeAdd`
      // either committed before this point (the flag step sees it) or reads the new revision as its basis afterwards.
      await lockModelChanges(tx, ws, draft.modelId);
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
      // #1196 c: every open SW change on a key this revision adds, removes or changes is flagged for re-validation.
      const previous = await previousPublished(tx, ws, draft.modelId, draft.revisionNo);
      let flagged = 0;
      if (previous) {
        const touched = touchedTargetKeys(await loadHashRows(tx, ws, previous.id), await loadHashRows(tx, ws, draft.id));
        if (touched.size > 0) flagged = await flagTouched(tx, ws, draft.modelId, [...touched], draft.revisionNo);
      }
      await record(tx, actor, 'published', draft, {
        modelId: draft.modelId,
        revisionNo: draft.revisionNo,
        outcome: 'published',
        contentSha256: sha256,
        counts,
        flagged,
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
      const draft = await lockDraft(tx, actor, value.revisionId);
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
