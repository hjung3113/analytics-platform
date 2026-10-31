import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useHostPlatform, useHostPlatformOptional } from '@ap/kernel/host';
import { paneRouteKey } from './paneRouteKey';

/**
 * What the page's query bar currently shows, so the page does not say the same thing twice (#1170): the folded summary already
 * names the applied conditions, and the bar's reasons already name what is missing. The bar (shell) writes it; the page and
 * `QueryView` (components) read it. A page without a bar has no status and keeps every notice.
 */
export type QueryBarStatus = {
  /** The conditions are folded to a one-line summary (not the open editor). */
  folded: boolean;
  /** The draft differs from the applied values, so the folded summary describes the draft. */
  editing: boolean;
  /** Keys of the reasons the bar draws (the `role="status"` region); an empty list means it draws none. */
  reasonKeys: readonly string[];
};

type LocalStatus = { status: QueryBarStatus | null; report: (status: QueryBarStatus | null) => void };
/** Provided by `PlatformPage`: the bar inside the page reports here. */
export const QueryBarStatusContext = createContext<LocalStatus | null>(null);

function createStatuses() {
  const entries = new Map<string, QueryBarStatus>();
  const listeners = new Set<() => void>();
  return {
    read: (key: string) => entries.get(key),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    put: (key: string, value: QueryBarStatus | null) => {
      if (value === null) entries.delete(key); else entries.set(key, value);
      listeners.forEach(listener => listener());
    },
  };
}
const PaneStatuses = createContext<ReturnType<typeof createStatuses> | null>(null);
/** A board sheet's bar and pane bodies are separate trees, so the status travels through one store per sheet and session. */
export function QueryBarStatusProvider({ children }: { children: ReactNode }) {
  const { session } = useHostPlatform();
  const store = useMemo(createStatuses, [session]);
  return <PaneStatuses.Provider value={store}>{children}</PaneStatuses.Provider>;
}

/** The query bar calls this on every render with what it draws; the status is cleared when the bar unmounts. */
export function useReportQueryBarStatus(status: QueryBarStatus): void {
  const local = useContext(QueryBarStatusContext);
  const store = useContext(PaneStatuses);
  const { paneId, route } = useHostPlatform();
  const key = paneRouteKey(paneId, route);
  const serialized = JSON.stringify(status);
  const report = local?.report;
  useLayoutEffect(() => {
    const value = JSON.parse(serialized) as QueryBarStatus;
    report?.(value);
    if (store && paneId) store.put(key, value);
    return () => { report?.(null); if (store && paneId) store.put(key, null); };
  }, [report, store, paneId, key, serialized]);
}

const noop = () => () => {};
/** The status of the query bar that serves this page or pane, or `null` when none reports one. */
export function useQueryBarStatus(): QueryBarStatus | null {
  const local = useContext(QueryBarStatusContext);
  const store = useContext(PaneStatuses);
  const host = useHostPlatformOptional();
  const key = paneRouteKey(host?.paneId ?? null, host?.route ?? null);
  const shared = useSyncExternalStore(store?.subscribe ?? noop, () => store?.read(key), () => undefined);
  return local?.status ?? shared ?? null;
}
