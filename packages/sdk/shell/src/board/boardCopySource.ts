import { type ScopeState } from '@ap/kernel';
import { type HostPlatform } from '@ap/kernel/host';

export type CopySource = { url: string; isCurrentGeneration: HostPlatform['isCurrentGeneration'] };

/** Reuse the Kernel's verdict for a mounted screen, or the adapter's current verdict for a recent visit. */
export function scopeAllowsCopy(requiresScope: boolean, status: ScopeState['status']): boolean {
  return status === 'valid' || (status === 'none' && !requiresScope);
}

export function screenCopySource({ route, url, appliedUrl, screenMode, scope, scopeGeneration, global, session, isCurrentGeneration, canOpen, contractError }: HostPlatform): CopySource | null {
  if (!route || contractError || !canOpen(route.menu.id) || scopeGeneration !== isCurrentGeneration || scope.validatedFor !== session || scope.scopeId !== global.scopeId
    || !scopeAllowsCopy(route.menu.requiresScope, scope.status)) return null;
  return { url: screenMode === 'pane' ? url : appliedUrl, isCurrentGeneration: scopeGeneration };
}

/** A mounted screen's decision can only authorize the same address in the same session generation. */
export function matchesCopySource(decision: CopySource | null | undefined, expected: CopySource): boolean {
  return decision?.isCurrentGeneration === expected.isCurrentGeneration && decision.url === expected.url && expected.isCurrentGeneration();
}
