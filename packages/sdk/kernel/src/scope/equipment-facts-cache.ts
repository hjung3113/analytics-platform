import { readSharedQuery } from '../query/shared-query-read';
import type { QueryClient } from '@tanstack/react-query';
import type { EquipmentFacts, PlatformAdapter } from '@ap/contracts';

/** The local key shared by useEquipmentFacts and Kernel-owned menu queries. */
export const equipmentFactsRequestKey = (scopeId: string) => ['equipment-facts', scopeId] as const;
const equipmentFactsAnswerKey = (scopeId: string, version: string) => ['equipment-facts', scopeId, version] as const;
export const equipmentFactsQueryKey = (gen: string, scopeId: string) => ['request', gen, 'shared', equipmentFactsRequestKey(scopeId)] as const;
type EquipmentFactsResult = { ok: true; data: EquipmentFacts } | { ok: false };

/** The exact request shape observed by useEquipmentFacts and awaited by menu expansion. */
export function equipmentFactsQueryOptions(client: QueryClient, gen: string, adapter: PlatformAdapter, scopeId: string) {
  return {
    queryKey: equipmentFactsQueryKey(gen, scopeId),
    staleTime: Infinity,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<EquipmentFactsResult> => {
      const send = adapter.listEquipmentFacts;
      if (!send) return { ok: false };
      try {
        const result = await send.call(adapter, { scopeId }, signal);
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        const answerKey = ['kept', gen, ...equipmentFactsAnswerKey(scopeId, result.version)] as const;
        const kept = client.getQueryData<EquipmentFacts>(answerKey);
        if (kept) return { ok: true, data: kept };
        client.setQueryData(answerKey, result);
        return { ok: true, data: result };
      } catch (error) {
        if (signal.aborted) throw error;
        return { ok: false };
      }
    },
  };
}

/**
 * Reads the exact shared request used by useEquipmentFacts. Keeping both the query key and versioned answer key
 * aligned means a target dialog and a menu query in the same provider generation share one adapter request.
 */
export async function readEquipmentFacts(client: QueryClient, gen: string, adapter: PlatformAdapter, scopeId: string, signal?: AbortSignal): Promise<EquipmentFacts> {
  if (!adapter.listEquipmentFacts) throw new Error('listEquipmentFacts is not implemented');
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const request = await readSharedQuery(client, equipmentFactsQueryOptions(client, gen, adapter, scopeId), signal);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (!request.ok) {
    client.removeQueries({ queryKey: equipmentFactsQueryKey(gen, scopeId), exact: true });
    throw new Error('listEquipmentFacts could not load current Scope facts');
  }
  return request.data;
}
