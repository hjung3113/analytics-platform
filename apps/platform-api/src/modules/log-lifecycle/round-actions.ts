// The validation round write actions (#1444 c, design §3/§5): open and close. Right: `lifecycle.round.manage`
// (workspace-scoped, same shape as the project right). Rules: a round opens only on an OPEN project and at most one
// round per project is open (partial unique index); `seq` is allocated under the project row lock; `stage` is the
// project's stage at open; the sample set, its digest and the server-computed spec pin are immutable from insert (DB
// guard trigger; there is no edit action). `roundClose` is final. Round actions write no development_event (the closed
// event kinds have no round kind): the history of rounds is the round rows plus the audit rows.

import { LinkAttachmentsRejected, linkAttachments } from '../attachments/index.js';
import type { EntityLinksActor, EntityLinksService } from '../entity-links/index.js';
import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import { LIFECYCLE_INPUT_KEYS, parseLifecycleInput, parseRoundOpen, validateLifecycleInput } from './domain/lifecycle-input.js';
import { sampleManifestDigest } from './domain/sample-set.js';
import { isOpenStage } from './domain/stage-transitions.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import {
  OPEN_ROUND_CONSTRAINT,
  closeRound,
  insertRound,
  lockProject,
  lockRound,
  mapUnique,
} from './repositories/lifecycle-write.js';

export const LIFECYCLE_ROUND_PERMISSION = 'lifecycle.round.manage';
/** The menu permission the two actions declare: bootstrap lists it exactly for the users `LIFECYCLE_ROUND_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const LIFECYCLE_ROUND_MENU_PERMISSION = 'lifecycle:round-manage';

const INVALIDATES = ['logLifecycle.models', 'logLifecycle.projectDetail', 'logLifecycle.rounds', 'logLifecycle.roundDetail', 'logLifecycle.roundEvidence'] as const;

export interface RoundActionDeps {
  checkService: CheckService;
  knowledgeLookup: KnowledgeLookup;
  entityLinks: Pick<EntityLinksService, 'createNoManagedSystemLink'>;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function roundActions(deps: RoundActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      LIFECYCLE_ROUND_PERMISSION,
      await deps.checkService.checkCapability(actor, LIFECYCLE_ROUND_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const base = (op: 'roundOpen' | 'roundClose' | 'roundEvidenceAttach', concurrency: 'none' | 'version') => ({
    id: `logLifecycle.${op}`,
    menuId: LOG_MODELS_MENU_ID,
    inputKeys: LIFECYCLE_INPUT_KEYS[op],
    permission: LIFECYCLE_ROUND_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const roundOpen: MenuActionDeclaration = {
    spec: base('roundOpen', 'none'),
    authorize,
    validate: (input) => validateLifecycleInput('roundOpen', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const result = parseRoundOpen(input);
      if (!result.ok) throw new Error('action roundOpen: validate passed but parse failed');
      const value = result.value;
      // The project row lock orders concurrent opens of one project: the second waits, then sees the first's open round.
      const project = await lockProject(tx, ws, value.projectId);
      if (!project) throw invalid({ path: ['projectId'], code: 'not_found' });
      if (!isOpenStage(project.stage)) throw invalid({ path: ['projectId'], code: 'project_not_open' });
      // The pin is server-computed from the model's effective spec; null = no published revision (shown as 미고정).
      const specPin = await deps.knowledgeLookup.getEffectiveSpecPin(tx, ws, project.modelId, project.softwareId);
      const round = await mapUnique(
        () =>
          insertRound(tx, {
            workspaceId: ws,
            actorId: actor.actor_id,
            projectId: project.id,
            stage: project.stage,
            sampleSet: value.sampleSet,
            sampleManifestDigest: sampleManifestDigest(value.sampleSet),
            specPin,
            note: value.note ?? null,
          }),
        OPEN_ROUND_CONSTRAINT,
        () => invalid({ path: ['projectId'], code: 'open_round_exists' }),
      );
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.round.opened',
        subject_type: 'validation_round',
        subject_id: round.id,
        summary: 'validation round opened',
        detail: {
          projectId: project.id,
          seq: round.seq,
          stage: round.stage,
          fileCount: value.sampleSet.files.length,
          pinned: specPin !== null,
        },
      });
      return { data: { roundId: round.id, seq: round.seq, version: String(round.rowVersion) }, version: null };
    },
  };

  const roundClose: MenuActionDeclaration = {
    spec: base('roundClose', 'version'),
    authorize,
    validate: (input) => validateLifecycleInput('roundClose', input),
    async currentVersion(tx, actor, input) {
      const row = await lockRound(tx, actor.workspace_id, input.id as string);
      return row ? String(row.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseLifecycleInput('roundClose', input);
      if (!parsed.ok) throw new Error('action roundClose: validate passed but parse failed');
      const row = await lockRound(tx, ws, parsed.value.id);
      if (!row) throw new Error('action roundClose: currentVersion judged not_found first');
      // Closed is final: the same answer whatever version the caller holds.
      if (row.status !== 'open') throw invalid({ path: ['id'], code: 'illegal_transition' });
      const version = await closeRound(tx, ws, row.id, actor.actor_id);
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.round.closed',
        subject_type: 'validation_round',
        subject_id: row.id,
        summary: 'validation round closed',
        detail: { projectId: row.projectId, seq: row.seq },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  // Manual validation attachment (#1451, D6): link pre-uploaded attachments (`POST /attachments`, uploaded by the caller) to a round
  // as parent kind `validation_round`. Write right = `lifecycle.round.manage` like the other round writes; only an open
  // round takes Evidence (a closed round is final). The link guard (unlinked, not archived, uploaded by the caller)
  // is the attachments module's; any miss rolls the whole call back. Each attachment also gets its Entity Link
  // (attachment -> round, `evidence_of`, ADR-0123) in the same transaction: a failed link write rolls the attach back.
  const roundEvidenceAttach: MenuActionDeclaration = {
    spec: base('roundEvidenceAttach', 'none'),
    authorize,
    validate: (input) => validateLifecycleInput('roundEvidenceAttach', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseLifecycleInput('roundEvidenceAttach', input);
      if (!parsed.ok) throw new Error('action roundEvidenceAttach: validate passed but parse failed');
      const { roundId, attachmentIds } = parsed.value;
      const round = await lockRound(tx, ws, roundId);
      if (!round) throw invalid({ path: ['roundId'], code: 'not_found' });
      if (round.status !== 'open') throw invalid({ path: ['roundId'], code: 'illegal_transition' });
      try {
        await linkAttachments(tx, {
          attachmentIds,
          parent: { kind: 'validation_round', roundId: round.id },
          uploaderActorId: actor.actor_id,
        });
      } catch (err) {
        if (err instanceof LinkAttachmentsRejected) {
          throw invalid({ path: ['attachmentIds', String(err.index)], code: 'invalid' });
        }
        throw err;
      }
      const linkActor: EntityLinksActor = {
        actor_id: actor.actor_id,
        workspace_id: ws,
        role_level: actor.role_level as EntityLinksActor['role_level'],
      };
      for (const attachmentId of attachmentIds) {
        await deps.entityLinks.createNoManagedSystemLink({
          actor: linkActor,
          source: { type: 'manual_validation_attachment', id: attachmentId },
          target: { type: 'validation_round', id: round.id },
          relation_type: 'evidence_of',
          tx,
        });
      }
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.round.evidence_attached',
        subject_type: 'validation_round',
        subject_id: round.id,
        summary: 'validation round evidence attached',
        detail: { projectId: round.projectId, seq: round.seq, count: attachmentIds.length },
      });
      return { data: { roundId: round.id, count: attachmentIds.length }, version: null };
    },
  };

  return [roundOpen, roundClose, roundEvidenceAttach];
}
