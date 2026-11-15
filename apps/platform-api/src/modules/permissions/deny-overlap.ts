import type { CapabilityName } from '@ap/feature-shared';
import { and, eq, isNull, or } from 'drizzle-orm';
import { permissionDenies } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';

/** Workspace scope overlaps every active deny; system scope overlaps workspace / same-system denies. */
export function overlappingDenies(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  capability: CapabilityName,
  managedSystemId: string | null,
) {
  return tx.select({ id: permissionDenies.id, managed_system_id: permissionDenies.managedSystemId })
    .from(permissionDenies)
    .where(and(
      eq(permissionDenies.workspaceId, workspaceId),
      eq(permissionDenies.actorId, actorId),
      eq(permissionDenies.capability, capability),
      isNull(permissionDenies.revokedAt),
      managedSystemId === null ? undefined : or(
        isNull(permissionDenies.managedSystemId),
        eq(permissionDenies.managedSystemId, managedSystemId),
      ),
    ))
    .orderBy(permissionDenies.id);
}

export async function assertNoOverlappingDeny(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  capability: CapabilityName,
  managedSystemId: string | null,
): Promise<void> {
  if ((await overlappingDenies(tx, workspaceId, actorId, capability, managedSystemId)).length > 0) {
    // Creation is requester-visible: never include deny identities or Admin context in this error.
    throw new HttpError('conflict.capability_already_denied', 'overlapping deny requires explicit lift');
  }
}
