import { FINDING_SCREEN_ROLE_FLOOR, ROLE_LEVEL_LABELS } from '@ap/feature-shared';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { type CheckService, memoizeCapabilityChecks } from '../permissions/check-service.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { hasElevatedFindingRole } from './authorization.js';
import { listPrimaryManagedSystemIds } from './repo-read.js';
import { canReadFinding } from './service-shared.js';

export function findingListRoleRequired(): HttpError {
  return new HttpError(
    'permission.denied',
    `${ROLE_LEVEL_LABELS[FINDING_SCREEN_ROLE_FLOOR]} role or higher is required to open the Finding list`,
    { reason: 'role_required', minimum_role: FINDING_SCREEN_ROLE_FLOOR },
  );
}

/** Same role and point decisions as the owning list, including archived systems. */
export async function actorFindingListScope(
  db: Db,
  checkService: CheckService,
  actor: ScopeActorContext,
  managedSystemId?: string,
  candidates?: string[],
): Promise<Scope> {
  if (!hasElevatedFindingRole(actor))
    throw findingListRoleRequired();
  if (actor.role_level === 'admin') return { kind: 'all' };
  const check = memoizeCapabilityChecks(checkService);
  const systems =
    candidates ??
    (await listPrimaryManagedSystemIds(db, {
      workspaceId: actor.workspace_id,
      ...(managedSystemId === undefined ? {} : { managedSystemId }),
    }));
  const allowed: string[] = [];
  for (const id of systems)
    if (await canReadFinding({ checkService: check }, actor, id)) allowed.push(id);
  return { kind: 'scoped', managedSystemIds: allowed };
}
