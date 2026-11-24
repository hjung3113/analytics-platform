import type { CapabilityName } from '@ap/feature-shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { permissionRequests } from '../../db/schema/permission.js';
import {
  type ActorContext,
  type CheckScope,
  type CheckService,
  type Decision,
  applyAdminModuleBypass,
  capabilitiesOf,
} from './check-service.js';
import { RECOVERY_PERMISSION_ACTIVE_STATUSES } from './recovery-read.js';
import { type FrontendState, type OpenRequestSummary, toFrontendState } from './state-mapper.js';
import { isSupportedScope, supportedScopeCandidates } from './supported-scope-policy.js';

async function findOpenRequestSummary(
  db: Db,
  actor: ActorContext,
  capability: CapabilityName,
  scope: CheckScope,
): Promise<OpenRequestSummary | null> {
  const systemFilter = scope.managed_system_id === undefined
    ? isNull(permissionRequests.requestedManagedSystemId)
    : eq(permissionRequests.requestedManagedSystemId, scope.managed_system_id);
  const rows = await db
    .select({ status: permissionRequests.status })
    .from(permissionRequests)
    .where(and(
      eq(permissionRequests.requestedScopeKind, 'managed_system'),
      eq(permissionRequests.workspaceId, scope.workspace_id),
      eq(permissionRequests.requesterActorId, actor.actor_id),
      eq(permissionRequests.requestedCapability, capability),
      systemFilter,
      inArray(permissionRequests.status, [...RECOVERY_PERMISSION_ACTIVE_STATUSES]),
    ))
    .limit(1);
  const status = rows[0]?.status;
  return status === 'pending' || status === 'needs_more_info' ? { status } : null;
}

async function supportsManagedSystemRequest(
  db: Db,
  capabilities: ReturnType<typeof capabilitiesOf>,
  scope: CheckScope & { managed_system_id: string },
  capability: CapabilityName,
): Promise<boolean> {
  const candidates = await supportedScopeCandidates(db, scope.workspace_id, capability, capabilities);
  return isSupportedScope(candidates, scope.managed_system_id, null, null);
}

type RequestAvailability = 'requestable' | 'pending' | 'none';

/**
 * Check one capability and target using the permission check route's state rules.
 * `requestable` allows a new request and `pending` lets the actor see their own
 * pending or needs_more_info request. Both can back a list hint on a supported
 * System. The route's display state still reports an open request if its System
 * has since been archived.
 */
export async function checkPermissionRequestTarget(
  db: Db,
  checkService: Pick<CheckService, 'checkCapability' | 'capabilities'>,
  actor: ActorContext,
  capability: CapabilityName,
  scope: CheckScope,
): Promise<{ state: FrontendState; decision: Decision; requestAvailability: RequestAvailability }> {
  const capabilities = capabilitiesOf(checkService);
  const decision = applyAdminModuleBypass(
    actor.role_level,
    capability,
    await checkService.checkCapability(actor, capability, scope),
    capabilities,
  );
  const systemScope = scope.managed_system_id === undefined
    ? undefined
    : { workspace_id: scope.workspace_id, managed_system_id: scope.managed_system_id };
  const [openRequest, scopeSupported] = await Promise.all([
    findOpenRequestSummary(db, actor, capability, scope),
    systemScope && !decision.allow && decision.requestable?.length
      ? supportsManagedSystemRequest(db, capabilities, systemScope, capability)
      : undefined,
  ]);
  const pointDecision = !decision.allow && scopeSupported === false
    ? { ...decision, requestable: null }
    : decision;
  const state = toFrontendState(pointDecision, openRequest);
  let requestAvailability: RequestAvailability = 'none';
  switch (state) {
    case 'request_access':
    case 'expired':
    case 'revoked':
      requestAvailability = 'requestable';
      break;
    case 'pending_request': {
      const pendingScopeSupported = scopeSupported ?? (
        systemScope ? await supportsManagedSystemRequest(db, capabilities, systemScope, capability) : true
      );
      if (pendingScopeSupported) requestAvailability = 'pending';
      break;
    }
  }
  return { state, decision: pointDecision, requestAvailability };
}
