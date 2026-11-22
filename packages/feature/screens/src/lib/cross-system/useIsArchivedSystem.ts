import { useQuery } from '@tanstack/react-query';
import { managedSystemsCatalogQuery } from './useManagedSystemNames';

/** Whether the given Managed System is archived: no permission opens it, so a denial names the archive instead of a missing permission. */
export function useIsArchivedSystem(managedSystemId: string | undefined): boolean {
  // A failed catalog read is not repeated by each denial card that mounts; the card then keeps the permission copy.
  const systems = useQuery({ ...managedSystemsCatalogQuery(), enabled: managedSystemId !== undefined, retryOnMount: false });
  return managedSystemId !== undefined
    && systems.data?.items.some((system) => system.id === managedSystemId && Boolean(system.archived_at)) === true;
}
