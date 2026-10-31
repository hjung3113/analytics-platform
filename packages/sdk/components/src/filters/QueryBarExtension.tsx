import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useHostPlatform } from '@ap/kernel/host';
import type { GlobalContext, Pair } from '@ap/contracts';
import type { PageFilterSummaryItem } from './PageFilterBar';
import { QueryBarStatusProvider } from './QueryBarStatus';

export type QueryBarExtension = {
  /** Pure arbitrary-candidate formatter; never captures current draft values. */
  historyPageSummary?: (global: GlobalContext, page: readonly Pair[]) => readonly PageFilterSummaryItem[];
  pageSummary: readonly PageFilterSummaryItem[];
  /** Applied labels are separate: a draft label must never describe a result. */
  appliedPageSummary?: readonly PageFilterSummaryItem[];
  issues: readonly { key: string; label: string; reason: string }[];
};
export const QueryBarExtensionContext = createContext<QueryBarExtension | undefined>(undefined);
function createExtensions() {
  const entries = new Map<string, QueryBarExtension>();
  const listeners = new Set<() => void>();
  return {
    read: (key: string) => entries.get(key),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    put: (key: string, value: QueryBarExtension | undefined) => {
      if (value === undefined) entries.delete(key); else entries.set(key, value);
      listeners.forEach(listener => listener());
    },
  };
}
const PaneExtensions = createContext<ReturnType<typeof createExtensions> | null>(null);
/** One board sheet/session owns metadata shared by its separate body and bar providers. */
export function QueryBarExtensionsProvider({ children }: { children: ReactNode }) {
  const { session } = useHostPlatform();
  const store = useMemo(createExtensions, [session]);
  return <PaneExtensions.Provider value={store}><QueryBarStatusProvider>{children}</QueryBarStatusProvider></PaneExtensions.Provider>;
}
function extensionKey(paneId: string | null, route: ReturnType<typeof useHostPlatform>['route']) { return JSON.stringify([paneId, route?.menu.id, route?.params]); }
export function usePublishQueryBarExtension(value: QueryBarExtension | undefined): void {
  const store = useContext(PaneExtensions);
  const { paneId, route } = useHostPlatform();
  const key = extensionKey(paneId, route);
  const serialized = JSON.stringify(value);
  const formatter = value?.historyPageSummary;
  // A value snapshot avoids publishing a new object for unrelated query completion renders.
  const snapshot: QueryBarExtension | undefined = useMemo(() => serialized === undefined ? undefined : { ...JSON.parse(serialized) as QueryBarExtension, historyPageSummary: formatter }, [serialized, formatter]);
  useEffect(() => {
    if (!store || !paneId) return;
    store.put(key, snapshot);
    return () => store.put(key, undefined);
  }, [store, paneId, key, snapshot]);
}
const noop = () => () => {};
export function useQueryBarExtension(): QueryBarExtension | undefined {
  const local = useContext(QueryBarExtensionContext);
  const store = useContext(PaneExtensions);
  const { paneId, route } = useHostPlatform();
  const key = extensionKey(paneId, route);
  const shared = useSyncExternalStore(store?.subscribe ?? noop, () => store?.read(key), () => undefined);
  return local ?? shared;
}
