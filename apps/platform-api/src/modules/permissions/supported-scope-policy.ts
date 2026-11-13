import { managedScope, validateSiteScope, type GrantScope } from './site-scope-policy.js';
import type { ScopeCatalog } from './scope-catalog.js';
// Permission owns the write policy; source object fields are provenance only.
import { type Capability, type CapabilityName, type PermissionScopeCandidate, isCapability } from '@ap/feature-shared';
import { type CapabilityRegistry, PLATFORM_CAPABILITY_REGISTRY, UnknownCapabilityError } from './capability-registry.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';

/** `workspace.admin` is granted only through the approval path, never requested ordinarily. */
export function isOrdinarilyRequestable(capability: Capability): boolean {
  return capability !== 'workspace.admin' && capability !== 'scope.read';
}

/** ADR-0107: a User cannot receive these (request, approval, direct grant); Admin-only restrictions are judged below. */
export const NOT_FOR_USER_ROLE: ReadonlySet<Capability> = new Set([
  'knowledge.catalog.manage',
  'knowledge.catalog.import',
  'knowledge.item.publish',
  'knowledge.spec.publish',
  'improvement.manage',
  'lifecycle.project.manage',
  'lifecycle.round.manage',
  'explorer.investigate',
  'explorer.handoff',
  'dataset.manage',
  'dataset.baseline.approve',
  'lifecycle.gate.decide',
  'lifecycle.issue.triage',
  'dataset.suite.run',
  'knowledge.access.manage',
  'eqv.layout.edit',
  'eqv.layout.publish',
  'eqv.rules.edit',
  'eqv.dictionary.global_edit',
  'eqv.mapping.publish',
  'eqv.window.import',
]);

/** True when the User role may never exercise this capability, whatever grant rows exist (#1531). */
export function isNotForUserRole(capability: Capability): boolean {
  return NOT_FOR_USER_ROLE.has(capability);
}

export async function supportedScopeCandidates(
  tx: Tx,
  workspaceId: string,
  capability: CapabilityName,
  capabilities: CapabilityRegistry = PLATFORM_CAPABILITY_REGISTRY,
): Promise<PermissionScopeCandidate[]> {
  // ADR-0157 decision 5: a declared capability is granted workspace-wide only. Judged before the platform hand list below,
  // whose last branch (one candidate per Managed System) is the open answer a declared name must never reach.
  if (capabilities.isDeclared(capability)) return [{ managed_system_id: null }];
  if (!isCapability(capability)) throw new UnknownCapabilityError(capability);
  if (capability === 'scope.read') return [];
  if (
    capability === 'workspace.read' ||
    capability === 'workspace.admin' ||
    capability === 'knowledge.catalog.manage' ||
    capability === 'knowledge.catalog.import' ||
    capability === 'knowledge.item.publish' ||
    capability === 'knowledge.spec.publish' ||
    capability === 'improvement.manage' ||
    capability === 'lifecycle.project.manage' ||
    capability === 'lifecycle.round.manage' ||
    capability === 'lifecycle.issue.contribute' ||
    capability === 'lifecycle.issue.link' ||
    capability === 'lifecycle.issue.triage' ||
    capability === 'lifecycle.gate.decide' ||
    capability === 'knowledge.draft.create' ||
    capability === 'explorer.source.read' ||
    capability === 'validation.catalog.report' ||
    capability === 'explorer.export' ||
    capability === 'explorer.investigate' ||
    capability === 'explorer.handoff' ||
    capability === 'dataset.manage' ||
    capability === 'dataset.baseline.approve' ||
    capability === 'dataset.suite.run' ||
    capability === 'knowledge.access.manage' ||
    capability === 'eqv.view' ||
    capability === 'eqv.layout.edit' ||
    capability === 'eqv.layout.publish' ||
    capability === 'eqv.rules.edit' ||
    capability === 'eqv.dictionary.global_edit' ||
    capability === 'eqv.mapping.publish' ||
    capability === 'eqv.window.import'
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
  capability: CapabilityName,
  managedSystemId: string | null,
  objectType: string | null,
  objectId: string | null,
  options: {
    scope?: GrantScope;
    scopeCatalog?: ScopeCatalog | undefined;
    scopePrefix?: string;
    approval?: boolean;
    field?: string;
    /** Role Level of the actor who would hold the capability. */
    recipientRole?: string | undefined;
    capabilityField?: string;
    /** This server's registry (ADR-0157); defaults to the platform capabilities. */
    capabilities?: CapabilityRegistry | undefined;
  } = {},
): Promise<void> {
  const capabilities = options.capabilities ?? PLATFORM_CAPABILITY_REGISTRY;
  if (!capabilities.has(capability)) throw new UnknownCapabilityError(capability);
  const scope = options.scope ?? managedScope;
  validateSiteScope(capability, scope, managedSystemId, objectType, objectId, options.scopeCatalog, options.scopePrefix ?? 'requested_');
  if (scope.kind !== 'managed_system') return;
  if (!options.approval && capability === 'workspace.admin') {
    throw new HttpError('validation.failed', 'ordinary workspace.admin requests are unsupported', {
      fields: [{ path: ['requested_capability'], code: 'custom' }],
    });
  }
  // ADR-0157 decision 6: a declared capability's allow-list is checked against the recipient's Role Level; an unknown
  // recipient is refused (closed). The platform list keeps its User exclusion.
  if (capabilities.isDeclared(capability) &&
      (options.recipientRole === undefined || capabilities.excludesRole(capability, options.recipientRole))) {
    throw new HttpError('validation.failed', 'capability is not available to this Role Level', {
      fields: [{ path: [options.capabilityField ?? 'requested_capability'], code: 'custom' }],
    });
  }
  if (options.recipientRole === 'user' && isCapability(capability) && NOT_FOR_USER_ROLE.has(capability)) {
    throw new HttpError('validation.failed', 'capability is not available to the User role', {
      fields: [{ path: [options.capabilityField ?? 'requested_capability'], code: 'custom' }],
    });
  }
  if (capability === 'knowledge.access.manage' && options.recipientRole !== 'admin') {
    throw new HttpError('validation.failed', 'capability requires an Admin recipient', {
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
  const candidates = await supportedScopeCandidates(tx, workspaceId, capability, capabilities);
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
