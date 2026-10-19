import { createContext, useCallback, useContext, useLayoutEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isProductionEnv } from './utils/isProductionEnv';

interface DetailPanelSlot {
  host: HTMLElement | null;
  activeKey: string | undefined;
  setHost: (host: HTMLElement | null) => void;
  register: (key: string) => () => void;
}

/** Stable callbacks for content registrants; never changes, so `useDetailPanelContent` callers do not re-render with the slot state. */
interface DetailPanelSlotActions {
  setContent: (key: string, node: ReactNode) => void;
  clearContent: (key: string) => void;
}

const DetailPanelSlotContext = createContext<DetailPanelSlot | null>(null);
/** Internal: consumed by `layout/useDetailPanelContent`; not part of the public API. */
export const DetailPanelSlotActionsContext = createContext<DetailPanelSlotActions | null>(null);

function warnOnOverlap(registrants: number) {
  if (registrants && !isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) {
    console.warn('[DetailPanelSlot] Multiple registrants; the last registrant wins.');
  }
}

/**
 * Shell-scoped DOM slot. Portal registrants (`useDetailPanelSlot`) preserve the registering page's React context;
 * content registrants (`useDetailPanelContent`) are rendered here, so they see the provider's context (ADR-0047).
 */
export function DetailPanelSlotProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [activeKey, setActiveKey] = useState<string>();
  const [contents, setContents] = useState<ReadonlyMap<string, ReactNode>>(() => new Map());
  // One registrant list for portal (`register`) and content (`setContent`) registrants: the last one wins.
  const keys = useRef<string[]>([]);
  const unregister = useCallback((key: string) => {
    keys.current = keys.current.filter(existing => existing !== key);
    setActiveKey(keys.current.at(-1));
  }, []);
  const register = useCallback((key: string) => {
    warnOnOverlap(keys.current.length);
    keys.current = [...keys.current.filter(existing => existing !== key), key];
    setActiveKey(key);
    return () => unregister(key);
  }, [unregister]);
  const actions = useMemo<DetailPanelSlotActions>(() => ({
    setContent: (key, node) => {
      // A registrant that is already listed keeps its place: a new node must not reclaim the slot.
      if (!keys.current.includes(key)) {
        warnOnOverlap(keys.current.length);
        keys.current = [...keys.current, key];
        setActiveKey(key);
      }
      setContents(prev => {
        if (prev.get(key) === node) return prev;
        return new Map(prev).set(key, node);
      });
    },
    clearContent: key => {
      setContents(prev => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      if (keys.current.includes(key)) unregister(key);
    },
  }), [unregister]);
  const value = useMemo(() => ({ host, activeKey, setHost, register }), [host, activeKey, register]);
  const activeContent = activeKey !== undefined && host ? contents.get(activeKey) : undefined;
  return <DetailPanelSlotActionsContext.Provider value={actions}>
    <DetailPanelSlotContext.Provider value={value}>
      {children}
      {activeContent !== undefined && host ? createPortal(activeContent, host) : null}
    </DetailPanelSlotContext.Provider>
  </DetailPanelSlotActionsContext.Provider>;
}

/** Register once per mounted consumer. The previous registrant resumes when the winner unmounts. */
export function useDetailPanelSlot(): HTMLElement | null {
  const slot = useContext(DetailPanelSlotContext);
  const key = useId();
  const register = slot?.register;
  // Register before paint so a deep link does not briefly show a full-width main without its detail.
  useLayoutEffect(() => register?.(key), [register, key]);
  if (!slot) throw new Error('Detail panel requires DetailPanelSlotProvider (provided by AppShell).');
  return slot.activeKey === key ? slot.host : null;
}

/** Shell host only: attach the returned ref to its aside. */
export function useDetailPanelSlotHost() {
  const slot = useContext(DetailPanelSlotContext);
  if (!slot) throw new Error('Detail panel host requires DetailPanelSlotProvider.');
  return { ref: slot.setHost, open: slot.activeKey !== undefined };
}
