import { createContext, useContext, useSyncExternalStore } from 'react';
import { AppContext } from '../platform/contexts';

export type MyMenuPick = { menuId: string; kind: 'arrival' | 'current'; isCurrent: () => boolean; take: () => string | null };

export function createMyMenuPick(menuId: string, viewId: string, kind: MyMenuPick['kind'], isCurrent: () => boolean): MyMenuPick {
  let taken = false;
  return { menuId, kind, isCurrent, take: () => {
    if (taken || !isCurrent()) return null;
    taken = true;
    return viewId;
  } };
}

export const MyMenuPickContext = createContext<{
  pick?: MyMenuPick;
  open: (menuId: string, viewId: string, href: string) => void;
} | null>(null);

export function createSavedViewChanges() {
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => revision,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: () => { revision++; listeners.forEach(listener => listener()); },
  };
}

const zero = () => 0;
const noSubscribe = () => () => {};

/** Host-only sidebar connection to committed navigation and saved-view writes. */
export function useMyMenus(): {
  revision: number;
  open?: (menuId: string, viewId: string, href: string) => void;
  selectionRequest?: { take: () => string | null };
} {
  const changes = useContext(AppContext)?.internal.savedViewChanges;
  const navigation = useContext(MyMenuPickContext);
  const revision = useSyncExternalStore(changes?.subscribe ?? noSubscribe, changes?.snapshot ?? zero, zero);
  return { revision, open: navigation?.open, selectionRequest: navigation?.pick?.kind === 'current' ? navigation.pick : undefined };
}
