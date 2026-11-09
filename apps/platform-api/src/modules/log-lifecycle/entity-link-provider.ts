import { and, eq } from 'drizzle-orm';
import { validationRounds } from '../../db/schema/log-lifecycle.js';
import { viewerOf } from '../log-knowledge/index.js';
// The `validation_round` Entity Link endpoint (ADR-0123, #1466). A Round has no Managed System: it is judged by its own
// read right, the same one `roundAttachmentParent` and the round reads use (`platform:view`, round in the actor's
// workspace and visible to the actor, #1504). It is the target end of the 수동 검증 첨부 link and is never written or listed through the generic
// Entity Link surfaces.

import type { Db } from '../../db/client.js';
import type { EntityLinkProvider, EntityLinksActor } from '../entity-links/provider-types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { roundInWorkspace } from './repositories/lifecycle-read.js';

async function resolveRound(db: Db, workspaceId: string, id: string) {
  const [row] = await db.select({ id: validationRounds.id }).from(validationRounds).where(and(eq(validationRounds.workspaceId, workspaceId), eq(validationRounds.id, id)));
  if (!row) return null;
  return { workspace_id: workspaceId, managed_system_id: null, reporter_id: null, parent: { kind: 'validation_round', id } };
}

export const validationRoundEntityLinkProvider: EntityLinkProvider = {
  entityType: 'validation_round',
  assertExists: resolveRound,
  getPermissionSubject: resolveRound,
  canRead: async (deps, actor: EntityLinksActor, subject) =>
    subject.workspace_id === actor.workspace_id &&
    (await holdsPlatformPermission(deps.checkService, actor, 'platform:view')) &&
    subject.parent !== undefined &&
    (await roundInWorkspace(deps.db, actor.workspace_id, subject.parent.id, viewerOf(actor))),
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async () => null,
  listExpectedLinks: async () => [],
};
