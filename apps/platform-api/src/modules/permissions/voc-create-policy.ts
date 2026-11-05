// Who may file a VOC in one Managed System (#1358, ADR-0113). Sits next to `checkCapability` because the answer is a
// capability decision (`voc.create`) plus the system's `voc_create_mode`; the voc module only calls it.
//
//   open        -> everyone, unless an explicit `voc.create` deny applies (workspace-wide or this system).
//   restricted  -> Admin, or an active `voc.create` grant (workspace-wide or this system) — and still no deny.
//   platform    -> the registry-owned 「플랫폼」 system is always open, whatever its stored mode.
// An explicit deny wins over everyone including Admin, like every other capability (05-permission-policy §Check Order).

import { and, eq, isNull } from 'drizzle-orm';

import { managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY } from '../managed-systems/registry-keys.js';
import {
  type ActorContext,
  type CheckService,
  loadDenyAndGrantRows,
} from './check-service.js';

export type VocCreateMode = 'open' | 'restricted';

export interface VocCreateSystem {
  id: string;
  external_key: string | null;
  voc_create_mode: string;
}

/** Why a target is closed. `restricted` also covers an explicit deny, so the wire never says which row applied. */
export type VocCreateDeniedReason = 'restricted';

export interface VocCreateTarget {
  managed_system_id: string;
  allowed: boolean;
  reason?: VocCreateDeniedReason;
}

function isAlwaysOpen(system: VocCreateSystem): boolean {
  return system.external_key === PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY || system.voc_create_mode !== 'restricted';
}

/** The one rule both entry points share; `denied`/`granted` come from the same deny and grant rows `checkCapability` reads. */
function vocCreateAllowed(
  system: VocCreateSystem,
  actor: { role_level: string },
  facts: { denied: boolean; granted: boolean },
): boolean {
  if (facts.denied) return false;
  if (isAlwaysOpen(system)) return true;
  return actor.role_level === 'admin' || facts.granted;
}

export async function canCreateVoc(
  checkService: CheckService,
  actor: ActorContext,
  system: VocCreateSystem,
  options: { tx: Tx },
): Promise<boolean> {
  const decision = await checkService.checkCapability(
    actor,
    'voc.create',
    { workspace_id: actor.workspace_id, managed_system_id: system.id },
    options,
  );
  if (!decision.allow && decision.reason === 'workspace_mismatch') return false;
  return vocCreateAllowed(system, actor, {
    denied: !decision.allow && decision.reason === 'explicit_deny',
    granted: decision.allow,
  });
}

/** `GET /vocs/create-targets`: every live system of the workspace, decided from one deny query and one grant query. */
export async function listVocCreateTargets(
  db: Tx,
  actor: ActorContext,
  now: () => Date = () => new Date(),
): Promise<VocCreateTarget[]> {
  const [systems, { denyRows, grantRows }] = await Promise.all([
    db
      .select({
        id: managedSystems.id,
        external_key: managedSystems.externalKey,
        voc_create_mode: managedSystems.vocCreateMode,
      })
      .from(managedSystems)
      .where(and(eq(managedSystems.workspaceId, actor.workspace_id), isNull(managedSystems.archivedAt)))
      .orderBy(managedSystems.name, managedSystems.id),
    loadDenyAndGrantRows(db, actor, 'voc.create'),
  ]);
  const rightNow = now().getTime();
  const grants = grantRows.filter(
    (row) => row.revokedAt === null && (row.expiresAt === null || row.expiresAt.getTime() > rightNow),
  );
  return systems.map((system) => {
    const allowed = vocCreateAllowed(system, actor, {
      denied: denyRows.some((row) => row.managedSystemId === null || row.managedSystemId === system.id),
      granted: grants.some((row) => row.managedSystemId === null || row.managedSystemId === system.id),
    });
    return allowed
      ? { managed_system_id: system.id, allowed }
      : { managed_system_id: system.id, allowed, reason: 'restricted' };
  });
}
