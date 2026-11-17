import { and, asc, eq } from 'drizzle-orm';
import { permissionRequests } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockWorkspaceActor } from '../auth/index.js';
import type { ActorContext } from './check-service.js';

/** Same recipient → request lock order as single commands, including rows already decided. */
export async function lockRequestBatch(tx: Tx, actor: ActorContext, batchId: string, options: { ownerOnly: boolean }) {
  const predicate = and(eq(permissionRequests.workspaceId, actor.workspace_id), eq(permissionRequests.batchId, batchId),
    options.ownerOnly ? eq(permissionRequests.requesterActorId, actor.actor_id) : undefined);
  const [first] = await tx.select({ requester: permissionRequests.requesterActorId }).from(permissionRequests).where(predicate).limit(1);
  if (!first) throw new HttpError('not_found.record', 'permission request batch not found');
  const requester = await lockWorkspaceActor(tx, { workspaceId: actor.workspace_id, actorId: first.requester });
  const rows = await tx.select().from(permissionRequests).where(predicate).orderBy(asc(permissionRequests.id)).for('update');
  return { rows, requester };
}

export function assertBatchRevisions(rows: (typeof permissionRequests.$inferSelect)[], revisions: Record<string, number>) {
  const expected = new Map(Object.entries(revisions).map(([id, revision]) => [id.toLowerCase(), revision]));
  if (!rows.length || rows.some((row) => expected.get(row.id) !== row.revision)) {
    throw new HttpError('conflict.stale_write', 'permission request batch status or revision changed');
  }
}
