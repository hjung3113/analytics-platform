// The Gate decision action (#1446 e, design §3/§5, ADR-0116 decision 4): `logLifecycle.gateDecide`. The Gate is a HUMAN
// business approval of the next stage of a 개발 건, recorded beside the machine verdicts, never instead of them.
//
// Who may decide: the capability `lifecycle.gate.decide` (workspace scope, sensitive, session-only). A token — personal
// or service — is refused by the capability check before any statement (`outcome: forbidden`), and so is any actor that
// is not an `internal_member` (a `system` identity, which cannot hold a session anyway). There is no AI / Agent path and
// no input for an opinion. Self approval (decider = requester) is allowed and stored as `self_approved` (owner 2026-11-07).
//
// What it does, in ONE transaction: lock the project (version = the concurrency token), lock the Round, judge the rules
// (`domain/gate-rules.ts`), freeze the evidence `basis`, append the `gate_decision` row, and for an approving decision
// (approved / exception) move `development_project.stage`. Every decision bumps the project's row version, so two
// decisions on one project cannot both win on the same `expectedVersion`. Then the `development_event` `gate_decided` and
// the audit row (ids, enums and counts only; the reason, the exception scope and the basis stay out of audit).
// It never touches a verdict, a rule result or a request.

import { viewerOf } from '../log-knowledge/index.js';
import { createAuditService } from '../core/audit/audit-service.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { GATE_INPUT_KEYS, parseGateInput, validateGateInput } from './domain/gate-input.js';
import { buildBasis, decisiveAttempt, isSelfApproved, judgeDecision, judgeTarget, movesStage } from './domain/gate-rules.js';
import { isOpenStage } from './domain/stage-transitions.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import {
  actorIsHuman,
  insertGateDecision,
  latestRequest,
  latestRoundId,
  projectIdOfRound,
  succeededAttempts,
} from './repositories/gate.js';
import { actorInWorkspace, insertEvent, lockProject, lockRound, patchProject } from './repositories/lifecycle-write.js';
import { readRoundEvidenceLinks } from './round-evidence-links.js';

export const LIFECYCLE_GATE_PERMISSION = 'lifecycle.gate.decide';
/** The menu permission the action declares: bootstrap lists it exactly for the users `LIFECYCLE_GATE_PERMISSION` lets decide (`platform-port/permissions.ts`). */
export const LIFECYCLE_GATE_MENU_PERMISSION = 'lifecycle:gate-decide';

const INVALIDATES = [
  'logLifecycle.models',
  'logLifecycle.projectDetail',
  'logLifecycle.projectEvents',
  'logLifecycle.rounds',
  'logLifecycle.roundDetail',
] as const;

export interface GateActionDeps {
  checkService: CheckService;
}

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function gateActions(deps: GateActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx): Promise<boolean> => {
    // The capability check goes first: for a token it refuses as `session_required` AND notes the denied high-risk
    // attempt that `api-tokens/gate.ts` audits (ADR-0116), which an early return here would skip.
    const decision = await deps.checkService.checkCapability(actor, LIFECYCLE_GATE_PERMISSION, { workspace_id: actor.workspace_id }, { tx });
    if (!applyAdminModuleBypass(actor.role_level, LIFECYCLE_GATE_PERMISSION, decision).allow) return false;
    // Defence in depth next to the capability's session-only mark: a token call never decides, whatever its scopes.
    if (currentAuthContext().kind !== 'session') return false;
    // A decision is a person's: a service (system) identity never decides (#1198 "approval is human").
    return actorIsHuman(tx, actor.workspace_id, actor.actor_id);
  };

  const gateDecide: MenuActionDeclaration = {
    spec: {
      id: 'logLifecycle.gateDecide',
      menuId: LOG_MODELS_MENU_ID,
      inputKeys: GATE_INPUT_KEYS,
      permission: LIFECYCLE_GATE_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: INVALIDATES,
    },
    authorize,
    validate: (input) => validateGateInput(input),
    /** The project's row version, read under the project row lock (the Round names the project). `null` = the Round is unknown here. */
    async currentVersion(tx, actor, input) {
      const ws = actor.workspace_id;
      const projectId = await projectIdOfRound(tx, ws, input.roundId as string, viewerOf(actor));
      if (!projectId) return null;
      const project = await lockProject(tx, ws, projectId, viewerOf(actor));
      return project ? String(project.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseGateInput(input);
      if (!parsed.ok) throw new Error('action gateDecide: validate passed but parse failed');
      const value = parsed.value;

      // Lock order: project, then Round (as `roundOpen`), so a decision, an open and an attach cannot deadlock.
      const projectId = await projectIdOfRound(tx, ws, value.roundId, viewerOf(actor));
      const project = projectId ? await lockProject(tx, ws, projectId, viewerOf(actor)) : null;
      const round = project ? await lockRound(tx, ws, value.roundId, viewerOf(actor)) : null;
      if (!project || !round) throw new Error('action gateDecide: currentVersion judged not_found first');

      // The decision rests on the project's current Round and the stage it was opened for.
      if (!isOpenStage(project.stage)) throw invalid({ path: ['roundId'], code: 'project_not_open' });
      if ((await latestRoundId(tx, ws, project.id, viewerOf(actor))) !== round.id) throw invalid({ path: ['roundId'], code: 'round_not_current' });
      if (round.stage !== project.stage) throw invalid({ path: ['roundId'], code: 'round_stage_mismatch' });
      const target = judgeTarget(project.stage, value.targetStage, project.softwareId, movesStage(value.decision));
      if (!target.ok) throw invalid(target.error);

      // The evidence as it is now: the Round lock above also orders this read after any attach that committed first.
      const attempts = await succeededAttempts(tx, ws, round.id, viewerOf(actor));
      const decisive = decisiveAttempt(attempts);
      const request = await latestRequest(tx, ws, round.id, viewerOf(actor));
      const refusal = judgeDecision({ decision: value.decision, verdict: decisive?.verdict ?? null });
      if (refusal) throw invalid(refusal);
      if (value.decision === 'exception' && value.exception) {
        if (!(await actorInWorkspace(tx, ws, value.exception.riskAcceptedBy))) {
          throw invalid({ path: ['exception', 'riskAcceptedBy'], code: 'not_found' });
        }
      }

      const links = await readRoundEvidenceLinks({ db: tx, checkService: deps.checkService }, actor, round.id);
      if (links === null) throw invalid({ path: ['roundId'], code: 'not_found' });
      const basis = buildBasis({
        attempts: attempts.map((a) => ({
          attemptId: a.attemptId,
          attemptNo: a.attemptNo,
          requestId: a.requestId,
          verdict: a.verdict,
          ruleSetRevision: a.ruleSetRevision,
          inputManifestDigest: a.inputManifestDigest,
          endedAt: a.endedAt,
        })),
        specPin: round.specPin,
        sampleManifestDigest: round.sampleManifestDigest,
        requestDigest: (decisive ? attempts.find((a) => a.attemptId === decisive.attemptId)?.requestDigest : undefined) ?? request?.requestDigest ?? null,
        evidenceLinks: links.map((l) => ({ attachmentId: l.attachmentId, linkedAt: l.linkedAt })),
      });
      const selfApproved = isSelfApproved(actor.actor_id, request?.requesterId ?? null, round.createdBy);

      const from = project.stage;
      const gateDecisionId = await insertGateDecision(tx, {
        workspaceId: ws,
        roundId: round.id,
        fromStage: from,
        targetStage: value.targetStage,
        decision: value.decision,
        basis,
        reason: value.reason,
        exception: value.exception ?? null,
        selfApproved,
        actorId: actor.actor_id,
      });
      const moves = movesStage(value.decision);
      const to = moves ? value.targetStage : from;
      const version = await patchProject(tx, ws, project.id, actor.actor_id, moves ? { stage: to } : {});
      await insertEvent(tx, {
        workspaceId: ws,
        projectId: project.id,
        actorId: actor.actor_id,
        kind: 'gate_decided',
        before: { stage: from },
        after: { stage: to, decision: value.decision, targetStage: value.targetStage, gateDecisionId, selfApproved },
        reason: value.reason,
      });
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.gate.decided',
        subject_type: 'validation_round',
        subject_id: round.id,
        summary: 'gate decision recorded',
        detail: {
          projectId: project.id,
          seq: round.seq,
          gateDecisionId,
          decision: value.decision,
          from,
          targetStage: value.targetStage,
          selfApproved,
          attemptCount: attempts.length,
          evidenceLinkCount: links.length,
          ...(value.exception ? { riskAcceptedBy: value.exception.riskAcceptedBy } : {}),
        },
      });
      return { data: { gateDecisionId, stage: to, selfApproved, version: String(version) }, version: String(version) };
    },
  };

  return [gateDecide];
}
