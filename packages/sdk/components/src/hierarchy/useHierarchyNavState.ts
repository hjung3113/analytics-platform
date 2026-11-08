import { useMemo } from 'react';
import { useHostPlatform } from '@ap/kernel/host';
import { HierarchyNavState } from './hierarchyState';

/** Mount above expanded/popover presentations to preserve their cache. Session changes replace it synchronously. */
export function useHierarchyNavState(menuId: string): HierarchyNavState {
  const { session, revision } = useHostPlatform();
  const identity = JSON.stringify([menuId, session.user.id, revision]);
  return useMemo(() => new HierarchyNavState(identity), [identity]);
}
