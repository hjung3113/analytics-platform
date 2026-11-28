import { createContext, useContext, useSyncExternalStore } from 'react';
import { AppContext } from '../platform/contexts';

import type { SelectOutcome } from './useSavedViews';

type OpenMyMenuOptions = {
  focusOrigin?: () => void;
  onOutcome?: (outcome: SelectOutcome) => void;
};

export type MyMenuPick = OpenMyMenuOptions & {
  menuId: string;
  viewId: string;
  kind: 'arrival' | 'current';
  generation: () => boolean;
  isCurrent: () => boolean;
  take: () => string | null;
  accept?: () => void;
};

export function createMyMenuPick(request: Omit<MyMenuPick, 'take'>): MyMenuPick {
  let taken = false;
  return { ...request, take: () => {
    if (taken || !request.isCurrent()) return null;
    taken = true;
    return request.viewId;
  } };
}

export type OpenMyMenu = (menuId: string, viewId: string, href: string, options?: OpenMyMenuOptions) => void;
export const MyMenuPickContext = createContext<{ pick?: MyMenuPick; open: OpenMyMenu } | null>(null);

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
  open?: OpenMyMenu;
  selectionRequest?: { take: () => string | null; focusOrigin?: () => void };
} {
  const changes = useContext(AppContext)?.internal.savedViewChanges;
  const navigation = useContext(MyMenuPickContext);
  const revision = useSyncExternalStore(changes?.subscribe ?? noSubscribe, changes?.snapshot ?? zero, zero);
  return { revision, open: navigation?.open, selectionRequest: navigation?.pick?.kind === 'current' ? navigation.pick : undefined };
}
