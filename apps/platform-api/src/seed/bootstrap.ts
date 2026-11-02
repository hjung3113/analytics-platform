// Operator bootstrap seed (SEED_MODE=bootstrap, #1266 b2).
//
// Creates the Workspace and the `system` Actor only: no mock actors, Managed
// Systems, areas, team, VOCs or knowledge fixtures. This is the only seed mode
// operator (production-like) data may use. Idempotent: a rerun inserts nothing.

import { type DbHandle } from '../db/client.js';
import { actors, workspaces } from '../db/schema/core.js';

export const SYSTEM_ACTOR = {
  externalId: 'system',
  email: 'system@platform.local',
  displayName: 'System',
  roleLevel: 'admin',
  actorType: 'system',
} as const;

export interface BootstrapSeedResult {
  workspaceInserted: boolean;
  actorsInserted: number;
}

export async function runBootstrapSeed(
  handle: DbHandle,
  input: { workspaceId: string; workspaceName: string },
): Promise<BootstrapSeedResult> {
  const { db } = handle;
  const wsRows = await db
    .insert(workspaces)
    .values({ id: input.workspaceId, name: input.workspaceName })
    .onConflictDoNothing({ target: workspaces.id })
    .returning({ id: workspaces.id });
  const actorRows = await db
    .insert(actors)
    .values({ workspaceId: input.workspaceId, ...SYSTEM_ACTOR })
    .onConflictDoNothing({ target: [actors.workspaceId, actors.externalId] })
    .returning({ id: actors.id });
  return { workspaceInserted: wsRows.length > 0, actorsInserted: actorRows.length };
}
