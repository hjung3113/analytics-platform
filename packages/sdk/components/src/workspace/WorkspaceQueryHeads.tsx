import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

export type QueryMenuItem = (label: string, run: () => void) => ReactNode;
type Head = { signal: HTMLElement; extras: HTMLElement; overflow: (item: QueryMenuItem) => ReactNode };

function createHeads() {
  const heads = new Map<string, Partial<Head>>();
  const listeners = new Set<() => void>();
  return {
    read: <K extends keyof Head>(id: string | undefined, key: K) => id === undefined ? undefined : heads.get(id)?.[key],
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set: <K extends keyof Head>(id: string, key: K, value: Head[K] | undefined) => {
      const head = heads.get(id) ?? {};
      if (head[key] === value) return;
      if (value === undefined) delete head[key];
      else head[key] = value;
      if (Object.keys(head).length) heads.set(id, head);
      else heads.delete(id);
      listeners.forEach(listener => listener());
    },
  };
}

const Heads = createContext<ReturnType<typeof createHeads> | null>(null);
const noSubscribe = () => () => {};
export function WorkspaceQueryHeads({ children }: { children: ReactNode }) {
  const [store] = useState(createHeads);
  return <Heads.Provider value={store}>{children}</Heads.Provider>;
}

export function useWorkspaceQueryHead<K extends keyof Head>(id: string | undefined, key: K) {
  const store = useContext(Heads);
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, () => store?.read(id, key), () => undefined);
}

export function useWorkspaceQuerySlot(id: string | undefined, slot: 'signal' | 'extras') {
  const store = useContext(Heads);
  return useCallback((node: HTMLElement | null) => {
    if (id) store?.set(id, slot, node ?? undefined);
  }, [id, slot, store]);
}

export function usePublishWorkspaceQueryOverflow(id: string | undefined, overflow: Head['overflow'] | undefined) {
  const store = useContext(Heads);
  useLayoutEffect(() => { if (id) store?.set(id, 'overflow', overflow); }, [id, overflow, store]);
  useLayoutEffect(() => () => { if (id) store?.set(id, 'overflow', undefined); }, [id, store]);
}
