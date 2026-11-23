import { useQuery } from '@tanstack/react-query';
import { managedSystemsCatalogQuery } from './useManagedSystemNames';

/**
 * Whether the given Managed System is archived: no permission opens it, so a denial names the archive instead of a missing permission.
 * `retryOnMount: false` leaves a failed catalog read alone when the caller mounts; that caller then offers `retry` itself (#2768).
 */
export function useArchivedSystemCheck(
  managedSystemId: string | undefined,
  { retryOnMount = true }: { retryOnMount?: boolean } = {},
): { archived: boolean; failed: boolean; retry: () => void } {
  const systems = useQuery({ ...managedSystemsCatalogQuery(), enabled: managedSystemId !== undefined, retryOnMount });
  const archived = managedSystemId !== undefined
    && systems.data?.items.some((system) => system.id === managedSystemId && Boolean(system.archived_at)) === true;
  const failed = managedSystemId !== undefined && systems.isError && systems.data === undefined;
  const { refetch } = systems;
  return { archived, failed, retry: () => void refetch() };
}

export function useIsArchivedSystem(managedSystemId: string | undefined): boolean {
  return useArchivedSystemCheck(managedSystemId).archived;
}
