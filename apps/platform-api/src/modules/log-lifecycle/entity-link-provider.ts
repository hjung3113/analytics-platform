// The `validation_round` Entity Link endpoint (ADR-0123, #1466). A Round has no Managed System: it is judged by its own
// read right, the same one `roundAttachmentParent` and the round reads use (`platform:view`, round in the actor's
// workspace). It is the target end of the 수동 검증 첨부 link and is never written or listed through the generic
// Entity Link surfaces.

import type { Db } from '../../db/client.js';
import type { EntityLinkProvider, EntityLinksActor } from '../entity-links/provider-types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { roundInWorkspace } from './repositories/lifecycle-read.js';

async function resolveRound(db: Db, workspaceId: string, id: string) {
  if (!(await roundInWorkspace(db, workspaceId, id))) return null;
  return { workspace_id: workspaceId, managed_system_id: null, reporter_id: null };
}

export const validationRoundEntityLinkProvider: EntityLinkProvider = {
  entityType: 'validation_round',
  assertExists: resolveRound,
  getPermissionSubject: resolveRound,
  canRead: async (deps, actor: EntityLinksActor, subject) =>
    subject.workspace_id === actor.workspace_id &&
    (await holdsPlatformPermission(deps.checkService, actor, 'platform:view')),
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async () => null,
  listExpectedLinks: async () => [],
};
