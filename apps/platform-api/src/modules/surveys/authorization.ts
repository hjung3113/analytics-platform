import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';
import { checkCapabilityAcross, type CheckService, type Decision } from '../permissions/check-service.js';
import {
  type Scope,
  type ScopeActorContext,
  actorScopeForCapability,
} from '../permissions/scope-service.js';
import { listSurveyManagedSystemIds } from './repo-read.js';

export type SurveyAuthorizationActor = ScopeActorContext;

export async function actorSurveyReadScope(
  db: Db | Tx,
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
): Promise<Scope> {
  if (actor.role_level === 'admin') {
    const managedSystemIds = await listSurveyManagedSystemIds(db, actor.workspace_id);
    const allowed = await readableSurveySystems(checkService, actor, managedSystemIds);
    return { kind: 'scoped', managedSystemIds: managedSystemIds.filter(id => allowed.has(id)) };
  }
  return actorScopeForCapability(db, actor, 'survey.read');
}

const denied: Decision = { allow: false, reason: 'no_grant', requestable: null };

export async function checkSurveyRead(
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
  managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  const decision = await checkService.checkCapability(
    actor,
    'survey.read',
    {
      workspace_id: actor.workspace_id,
      managed_system_id: managedSystemId,
    },
    options,
  );
  return surveyReadDecision(actor, decision);
}

export async function readableSurveySystems(
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
  ids: readonly string[],
  options?: { tx?: Tx },
): Promise<Set<string>> {
  const decisions = await checkCapabilityAcross(checkService, actor, 'survey.read', ids, options);
  return new Set([...decisions].flatMap(([id, decision]) => surveyReadDecision(actor, decision).allow ? [id] : []));
}

function surveyReadDecision(actor: SurveyAuthorizationActor, decision: Decision): Decision {
  // FO ADR-0033 §C. Declared as `adminModuleBypass: 'unless_denied'` in
  // `CAPABILITY_META` — change both together or the advisory
  // `GET /me/permissions/check` drifts from this route (issue #372).
  if (!decision.allow && decision.reason === 'explicit_deny') return decision;
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  return decision;
}

export async function checkSurveyManage(
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
  managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  const decision = await checkService.checkCapability(
    actor,
    'survey.manage',
    {
      workspace_id: actor.workspace_id,
      managed_system_id: managedSystemId,
    },
    options,
  );
  // FO ADR-0033 §C. Declared as `adminModuleBypass: 'unless_denied'` in
  // `CAPABILITY_META` — change both together (issue #372).
  if (!decision.allow && decision.reason === 'explicit_deny') return decision;
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  return decision;
}

/** Deliberately no admin shortcut: personal data needs an explicit grant. */
export async function checkSurveyPersonalResponseRead(
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
  managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  if (!managedSystemId) return denied;
  return checkService.checkCapability(
    actor,
    'survey.read_personal_responses',
    {
      workspace_id: actor.workspace_id,
      managed_system_id: managedSystemId,
    },
    options,
  );
}

/** Dashboard distinguishes authorized empty data from an empty denied scope. */
export async function actorSurveyRecoveryScope(
  db: Db,
  checkService: CheckService,
  actor: SurveyAuthorizationActor,
): Promise<Scope> {
  if (actor.role_level !== 'admin') return actorSurveyReadScope(db, checkService, actor);
  const systems = [
    ...new Set([
      ...(await allManagedSystemIds(db, actor.workspace_id)),
      ...(await listSurveyManagedSystemIds(db, actor.workspace_id)),
    ]),
  ];
  return { kind: 'scoped', managedSystemIds: [...await readableSurveySystems(checkService, actor, systems)] };
}
