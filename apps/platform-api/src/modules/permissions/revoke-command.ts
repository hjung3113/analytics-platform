import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import { grantScope, scopeFields } from './site-scope-policy.js';

/**
 * Permission-owned revoke of one active grant, inside the caller's transaction.
 * The caller authorizes and takes the recipient lock first. Revoke metadata, the
 * `permission_revoked` audit row and the `permission_grant.revoked` notification
 * (ADR-0061 decision 7) are written together and roll back together.
 */
export async function revokePermissionGrant(
  tx: Tx,
  input: {
    workspaceId: string;
    grantId: string;
    /** The revoking Actor: the Admin for the API, the workspace system Actor for the operator CLI. */
    revokedByActorId: string;
    reason: string;
    audit: AuditService;
    notify: NotificationNotifier;
  },
): Promise<{ id: string; revokedAt: Date }> {
  const rows = await tx
    .select()
    .from(permissionGrants)
    .where(
      and(eq(permissionGrants.id, input.grantId), eq(permissionGrants.workspaceId, input.workspaceId)),
    )
    .for('update');
  const grant = rows[0];
  if (!grant) throw new HttpError('not_found.record', 'permission grant not found');

  const now = new Date();
  if (
    grant.revokedAt !== null ||
    grant.supersededAt !== null ||
    (grant.expiresAt !== null && grant.expiresAt <= now)
  ) {
    throw new HttpError('conflict.permission_not_active', 'permission grant is not active');
  }

  const updated = await tx
    .update(permissionGrants)
    .set({ revokedAt: now, revokedByActorId: input.revokedByActorId, revokedReason: input.reason })
    .where(and(eq(permissionGrants.id, grant.id), eq(permissionGrants.workspaceId, input.workspaceId)))
    .returning({ revokedAt: permissionGrants.revokedAt });
  const revokedAt = updated[0]?.revokedAt;
  if (!revokedAt) {
    throw new HttpError('internal.unexpected', 'permission grant revoke returned no row');
  }

  await input.audit.record(tx, {
    workspace_id: input.workspaceId,
    actor_id: input.revokedByActorId,
    event_type: 'permission_revoked',
    subject_type: 'permission_grant',
    subject_id: grant.id,
    summary: 'Permission grant revoked',
    detail: {
      grant_id: grant.id,
      capability: grant.capability,
      ...scopeFields(grantScope(grant)),
      managed_system_id: grant.managedSystemId,
      grantee_actor_id: grant.actorId,
      reason: input.reason,
    },
  });

  await input.notify(tx, 'permission_grant.revoked', {
    workspace_id: input.workspaceId,
    actor_ids: [grant.actorId],
    subject_id: grant.id,
    correlation_id: randomUUID(),
    detail: { permission_grant_id: grant.id },
    params: {},
  });

  return { id: grant.id, revokedAt };
}
