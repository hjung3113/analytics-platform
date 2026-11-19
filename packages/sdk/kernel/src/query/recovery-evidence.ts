import { isRecord, readQueryRecovery, type ApiResponse, type MenuQueryContext } from '@ap/contracts';
import { errorGuidance } from '../i18n';
import type { HostPlatform } from '../platform/types';
import { readEquipmentFacts } from '../scope/equipment-facts-cache';
import type { MenuRequestInputs } from './query';

type Evidence = Pick<MenuQueryContext, 'scopeId' | 'selection' | 'from' | 'to'> & { equipmentVerified: boolean };
type Current = Pick<HostPlatform, 'adapter' | 'session' | 'scope' | 'global' | 'page' | 'route'>;
type Registration = { evidence: Evidence; matches: (host: Current) => boolean };

// Bind local evidence to this particular settled envelope. An adapter may reuse an envelope
// for different calls, so the caller gets its own object whenever recovery is attached.
const requests = new WeakMap<ApiResponse<unknown>, Registration>();

export function queryRecoveryEvidence(response: ApiResponse<unknown>, host: Current): Evidence | undefined {
  const registration = requests.get(response);
  return registration?.matches(host) ? registration.evidence : undefined;
}

export async function bindQueryRecovery<T>(
  response: ApiResponse<T>,
  context: MenuQueryContext,
  inputs: MenuRequestInputs,
  matchesContext: (host: Current) => boolean,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const rawRecovery = response.recovery;
  const recovery = readQueryRecovery(rawRecovery);
  if (!recovery || (!recovery.deniedScope && recovery.maxHours === undefined && !recovery.affectedEquipmentIds && !recovery.authorizedEquipmentIds)) return response;

  const { scopeId, from, to, selection, roomNames } = context;
  const { adapter, session, scope, queryEngine } = inputs;
  const grantedRooms = new Set(scope.grantedRooms);
  const validScope = scope.status === 'valid' && scope.scopeId === scopeId && scope.validatedFor === session;
  let equipmentVerified = false;
  if (scopeId && validScope && selection !== undefined && recovery.affectedEquipmentIds && recovery.authorizedEquipmentIds && adapter.listEquipmentFacts) {
    try {
      const facts = await readEquipmentFacts(queryEngine.client, queryEngine.gen, adapter, scopeId, signal);
      const selected = selection === null ? undefined : new Set(selection);
      const eligible = new Set(facts.items
        .filter(row => grantedRooms.has(row.room) && (!roomNames || roomNames.includes(row.room)) && (!selected || selected.has(row.equipmentId)))
        .map(row => row.equipmentId));
      equipmentVerified = [...recovery.affectedEquipmentIds, ...recovery.authorizedEquipmentIds].every(id => eligible.has(id));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  const settled = { ...response, recovery };
  // Raw equipment fields can disappear during normalization while a sibling period cap survives.
  if (isRecord(rawRecovery) && (Object.hasOwn(rawRecovery, 'affectedEquipmentIds') || Object.hasOwn(rawRecovery, 'authorizedEquipmentIds'))) {
    const guide = errorGuidance(response.message);
    if (guide.label === 'sharedOutcomeCannotAggregate' && guide.code) settled.message = guide.code;
    else delete settled.message;
  }
  requests.set(settled, {
    evidence: { scopeId, from, to, selection, equipmentVerified },
    matches: host => host.adapter === adapter && host.session === session &&
      host.scope.status === scope.status && host.scope.scopeId === scope.scopeId &&
      host.scope.grantedRooms.length === grantedRooms.size && host.scope.grantedRooms.every(room => grantedRooms.has(room)) &&
      matchesContext(host),
  });
  return settled;
}
