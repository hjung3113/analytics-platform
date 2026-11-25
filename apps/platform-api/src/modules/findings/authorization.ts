import { FINDING_SCREEN_ROLE_FLOOR, ROLE_LEVEL_LABELS } from '@ap/feature-shared';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { Tx } from '../../db/tx.js';
import { checkCapabilityAcross, type CapabilityRowsReader, type CheckService, type Decision } from '../permissions/check-service.js';
import {
  type Scope,
  type ScopeActorContext,
  actorScopeForCapability,
  scopeIncludes,
} from '../permissions/scope-service.js';

/**
 * Canonical Finding authorization boundary.
 *
 * Finding owns the meaning of its read and manage capabilities; other modules
 * must consume these helpers instead of rebuilding a capability predicate.
 */
export type FindingAuthorizationActor = ScopeActorContext;
export type FindingPointAuthorizationPolicy = { requireElevatedRole: boolean };
/** The one `role_required` answer below the Finding role floor; every screen behind it shows the role card, not a missing grant or an archive (#2639, #2768). */
export function findingRoleRequired(action: string): HttpError {
  return new HttpError(
    'permission.denied',
    `${ROLE_LEVEL_LABELS[FINDING_SCREEN_ROLE_FLOOR]} role or higher is required to ${action}`,
    { reason: 'role_required', minimum_role: FINDING_SCREEN_ROLE_FLOOR },
  );
}
export function hasElevatedFindingRole(actor: FindingAuthorizationActor): boolean {
  return actor.role_level === 'admin' || actor.role_level === 'developer';
}

export async function actorFindingReadScope(
  db: Db | Tx,
  actor: FindingAuthorizationActor,
  policy: FindingPointAuthorizationPolicy,
  readRows?: CapabilityRowsReader,
): Promise<Scope> {
  if (policy.requireElevatedRole && !hasElevatedFindingRole(actor)) {
    return { kind: 'scoped', managedSystemIds: [] };
  }
  return actorScopeForCapability(db, actor, 'finding.read', readRows);
}

export function isFindingInReadScope(scope: Scope, managedSystemId: string): boolean {
  return scopeIncludes(scope, managedSystemId);
}

const findingRoleDenied: Decision = {
  allow: false,
  reason: 'no_grant',
  requestable: null,
};

/**
 * Point authorization for a single Finding or Finding-governed target.
 *
 * This deliberately uses CheckService rather than scope resolution: point
 * checks retain its injected application clock and do not exclude archived
 * Managed Systems while expanding a workspace-wide grant around denies.
 */
export async function checkFindingRead(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemId: string,
  policy: FindingPointAuthorizationPolicy,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  // Declared as `adminModuleBypass: 'always'` in `CAPABILITY_META` (issue #372).
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  if (policy.requireElevatedRole && actor.role_level !== 'developer') return findingRoleDenied;
  return checkService.checkCapability(
    actor,
    'finding.read',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
}

export async function checkFindingManage(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemId: string,
  policy: FindingPointAuthorizationPolicy,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  // Preserve the workspace-admin bypass before delegating scoped decisions to
  // Permission. This mirrors the Finding policy and avoids needless DB reads.
  // Declared as `adminModuleBypass: 'always'` in `CAPABILITY_META` — change
  // both together or the advisory check route drifts from here (issue #372).
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  if (policy.requireElevatedRole && actor.role_level !== 'developer') return findingRoleDenied;
  return checkService.checkCapability(
    actor,
    'finding.manage',
    { workspace_id: actor.workspace_id, managed_system_id: managedSystemId },
    options,
  );
}

/** Inventory uses canonical point decisions, including archived scopes and the injected clock. */
export async function readableEvidenceInventorySystems(
  checkService: CheckService,
  actor: FindingAuthorizationActor,
  managedSystemIds: string[],
  tx: Tx,
): Promise<string[]> {
  if (actor.role_level === 'admin') return managedSystemIds;
  if (!hasElevatedFindingRole(actor)) return [];
  const decisions = await checkCapabilityAcross(checkService, actor, 'finding.read', managedSystemIds, { tx });
  return managedSystemIds.filter(id => decisions.get(id)?.allow);
}
