import { viewerOf } from '../log-knowledge/index.js';
// Screen hint only. gateDecide rechecks under locks; this read never reserves a decision or writes a verdict.
import { currentAuthContext } from '../../lib/auth-context.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import { buildBasis, decisiveAttempt, GATE_DECISIONS, judgeDecision, judgeTarget, movesStage } from './domain/gate-rules.js';
import { gateTargetFor, isOpenStage } from './domain/stage-transitions.js';
import { actorIsHuman, gateProject, latestRequest, latestRoundId, succeededAttempts } from './repositories/gate.js';
import { type RoundDetail } from './repositories/lifecycle-read.js';
import { readRoundEvidenceLinks } from './round-evidence-links.js';

export async function gateAvailability(deps: LogLifecycleDeps, actor: PlatformActor, round: RoundDetail) {
  const ws = actor.workspace_id;
  const [project, attempts, request, latest, links] = await Promise.all([
    gateProject(deps.db, ws, round.id, viewerOf(actor)), succeededAttempts(deps.db, ws, round.id, viewerOf(actor)), latestRequest(deps.db, ws, round.id, viewerOf(actor)), latestRoundId(deps.db, ws, round.projectId, viewerOf(actor)), readRoundEvidenceLinks(deps, actor, round.id),
  ]);
  const reasons: string[] = [];
  if (currentAuthContext().kind !== 'session' || !(await actorIsHuman(deps.db, ws, actor.actor_id))) reasons.push('session_required');
  if (!reasons.includes('session_required')) {
    const permission = await deps.checkService.checkCapability(actor, 'lifecycle.gate.decide', { workspace_id: ws });
    if (!applyAdminModuleBypass(actor.role_level, 'lifecycle.gate.decide', permission).allow) reasons.push('permission_denied');
  }
  if (!project || !isOpenStage(project.stage)) reasons.push('project_not_open');
  if (latest !== round.id) reasons.push('round_not_current');
  if (project && round.stage !== project.stage) reasons.push('round_stage_mismatch');
  const targetStage = project ? gateTargetFor(project.stage) : null;
  const decisive = decisiveAttempt(attempts);
  const decisions = Object.fromEntries(GATE_DECISIONS.map(decision => {
    const refusal = judgeDecision({ decision, verdict: decisive?.verdict ?? null });
    const target = project && targetStage ? judgeTarget(project.stage, targetStage, project.softwareId, movesStage(decision)) : null;
    const ownerReason = !movesStage(decision) ? null : round.ownerModelId === null ? 'round_owner_unresolved' : project && (round.ownerModelId !== project.modelId || round.ownerSoftwareId !== project.softwareId) ? 'round_owner_mismatch' : null;
    const ownReasons = [...reasons, ...(ownerReason ? [ownerReason] : []), ...(refusal ? [refusal.code] : []), ...(target && !target.ok ? [target.error.code] : [])];
    return [decision, { allowed: ownReasons.length === 0 && targetStage !== null, reasons: ownReasons }];
  }));
  return {
    targetStage, projectVersion: project?.version ?? '', reasons, decisions,
    basis: buildBasis({ attempts, specPin: round.specPin, sampleManifestDigest: round.sampleManifestDigest, requestDigest: decisive?.requestDigest ?? request?.requestDigest ?? null, evidenceLinks: (links ?? []).map(l => ({ attachmentId: l.attachmentId, linkedAt: l.linkedAt })) }),
  };
}
