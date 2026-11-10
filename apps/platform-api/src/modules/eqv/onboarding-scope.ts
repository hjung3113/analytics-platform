// Who an equipment is, and whether a scope may be addressed by this actor (#1658, ADR-0139). A scope key is a Hub id; the Hub answers for the
// viewer, so a model the actor cannot see is "not there", exactly like a missing equipment: no answer tells the two apart.
import type { Tx } from '../../db/tx.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { MappingScopeRef } from './domain/mapping-checks.js';
import { getEquipmentRow } from './repositories/onboarding-read.js';

export type ModelLookup = Pick<KnowledgeLookup, 'getModel' | 'getVendor'>;

export interface EquipmentScope {
  equipmentId: string;
  vendorId: string;
  modelId: string;
}

/** The equipment with its Hub vendor and model; null when the equipment is missing or its model is hidden from the actor. */
export async function equipmentScope(tx: Tx, lookup: ModelLookup, actor: PlatformActor, equipmentId: string): Promise<EquipmentScope | null> {
  const row = await getEquipmentRow(tx, actor.workspace_id, equipmentId);
  if (!row) return null;
  const model = await lookup.getModel(tx, actor.workspace_id, row.modelId, actor.actor_id);
  return model ? { equipmentId: row.equipmentId, vendorId: model.vendorId, modelId: model.id } : null;
}

/** Whether the scope names something that exists and that the actor may see (global always does). */
export async function scopeAddressable(tx: Tx, lookup: ModelLookup, actor: PlatformActor, scope: MappingScopeRef): Promise<boolean> {
  switch (scope.level) {
    case 'global':
      return true;
    case 'maker':
      return (await lookup.getVendor(tx, actor.workspace_id, scope.vendorId)) !== null;
    case 'model': {
      const model = await lookup.getModel(tx, actor.workspace_id, scope.modelId, actor.actor_id);
      return model !== null && model.vendorId === scope.vendorId;
    }
    case 'equipment':
      return (await equipmentScope(tx, lookup, actor, scope.equipmentId)) !== null;
  }
}
