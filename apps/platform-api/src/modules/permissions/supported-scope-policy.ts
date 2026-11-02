// Permission owns the write policy; source object fields are provenance only.
import type { Capability, PermissionScopeCandidate } from '@ap/feature-shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';

/** `workspace.admin` is granted only through the approval path, never requested ordinarily. */
export function isOrdinarilyRequestable(capability: Capability): boolean {
  return capability !== 'workspace.admin';
}

/** ADR-0107 decision 3: Admin and Developer receive these; a User does not (request, approval, direct grant). */
const NOT_FOR_USER_ROLE: ReadonlySet<Capability> = new Set([
  'knowledge.catalog.manage',
  'knowledge.catalog.import',
]);

export async function supportedScopeCandidates(
  tx: Tx,
  workspaceId: string,
  capability: Capability,
): Promise<PermissionScopeCandidate[]> {
  if (
    capability === 'workspace.read' ||
    capability === 'workspace.admin' ||
    capability === 'knowledge.catalog.manage' ||
    capability === 'knowledge.catalog.import'
  ) {
    return [{ managed_system_id: null }];
  }
  const ids = await allManagedSystemIds(tx, workspaceId);
  return [
    ...(capability === 'survey.export' ? [{ managed_system_id: null }] : []),
    ...ids.map((managed_system_id) => ({ managed_system_id })),
  ];
}

export function isSupportedScope(
  candidates: readonly PermissionScopeCandidate[],
  managedSystemId: string | null,
  objectType: string | null,
  objectId: string | null,
): boolean {
  return (
    objectType === null &&
    objectId === null &&
    candidates.some((candidate) => candidate.managed_system_id === managedSystemId)
  );
}

export async function validateSupportedScope(
  tx: Tx,
  workspaceId: string,
  capability: Capability,
  managedSystemId: string | null,
  objectType: string | null,
  objectId: string | null,
  options: {
    approval?: boolean;
    field?: string;
    /** Role Level of the actor who would hold the capability. */
    recipientRole?: string | undefined;
    capabilityField?: string;
  } = {},
): Promise<void> {
  if (!options.approval && !isOrdinarilyRequestable(capability)) {
    throw new HttpError('validation.failed', 'ordinary workspace.admin requests are unsupported', {
      fields: [{ path: ['requested_capability'], code: 'custom' }],
    });
  }
  if (options.recipientRole === 'user' && NOT_FOR_USER_ROLE.has(capability)) {
    throw new HttpError('validation.failed', 'capability is not available to the User role', {
      fields: [{ path: [options.capabilityField ?? 'requested_capability'], code: 'custom' }],
    });
  }
  if (objectType !== null || objectId !== null) {
    throw new HttpError('validation.failed', 'object authorization is outside MVP', {
      fields: [
        {
          path: [objectType !== null ? 'requested_object_type' : 'requested_object_id'],
          code: 'custom',
        },
      ],
    });
  }
  const candidates = await supportedScopeCandidates(tx, workspaceId, capability);
  if (!isSupportedScope(candidates, managedSystemId, objectType, objectId)) {
    throw new HttpError('validation.failed', 'unsupported or inactive Managed System scope', {
      fields: [{ path: [options.field ?? 'requested_managed_system_id'], code: 'custom' }],
    });
  }
}

export function validateRequestExpiration(expiration: Date | null, field = 'requested_expiration') {
  if (
    expiration !== null &&
    (!Number.isFinite(expiration.getTime()) || expiration.getTime() <= Date.now())
  ) {
    throw new HttpError('validation.failed', 'expiration must be in the future', {
      fields: [{ path: [field], code: 'custom' }],
    });
  }
}
