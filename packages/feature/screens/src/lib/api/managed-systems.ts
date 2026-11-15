import {
  managedSystemDefaultCandidatesSchema,
  managedSystemDefaultDiagnosticsSchema,
} from '@ap/feature-shared';
import { apiRequest } from './client';
// Managed Systems registry (Slice 2 #10).
// The list read lives in ./registry-reads (bridge-safe, platform ADR-0071) and is re-exported here.

export { fetchManagedSystems, type ManagedSystemDto } from './registry-reads';
export type { RegisterManagedSystemBody, UpdateManagedSystemBody } from './registry-writes';
export {
  archiveManagedSystem,
  registerManagedSystem,
  updateManagedSystem,
} from './registry-writes';

export async function fetchManagedSystemDefaultDiagnostics(signal?: AbortSignal) {
  const result = await apiRequest(
    'GET',
    '/managed-systems/default-diagnostics',
    managedSystemDefaultDiagnosticsSchema,
    signal ? { signal } : {},
  );
  return result.data;
}

export async function fetchManagedSystemDefaultCandidates(
  managedSystemId?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (managedSystemId) params.set('managed_system_id', managedSystemId);
  const result = await apiRequest(
    'GET',
    `/managed-systems/default-candidates${params.size ? `?${params}` : ''}`,
    managedSystemDefaultCandidatesSchema,
    signal ? { signal } : {},
  );
  return result.data;
}
