import { useQuery } from '@tanstack/react-query';
import { managedSystemsCatalogQuery } from './useManagedSystemNames';

/** Whether the given Managed System is archived: no permission opens it, so a denial names the archive instead of a missing permission. */
export function useIsArchivedSystem(managedSystemId: string | undefined): boolean {
  const systems = useQuery({ ...managedSystemsCatalogQuery(), enabled: managedSystemId !== undefined });
  return managedSystemId !== undefined
    && systems.data?.items.some((system) => system.id === managedSystemId && Boolean(system.archived_at)) === true;
}
