import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { isProductionEnv } from './utils/isProductionEnv';

interface DetailPanelSlot {
  host: HTMLElement | null;
  activeKey: string | undefined;
  setHost: (host: HTMLElement | null) => void;
  register: (key: string) => () => void;
}

const DetailPanelSlotContext = createContext<DetailPanelSlot | null>(null);

/** Shell-scoped DOM slot. Portals preserve the registering page's React context. */
export function DetailPanelSlotProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [activeKey, setActiveKey] = useState<string>();
  const keys = useRef<string[]>([]);
  const register = useCallback((key: string) => {
    if (keys.current.length && !isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) {
      console.warn('[DetailPanelSlot] Multiple registrants; the last registrant wins.');
    }
    keys.current = [...keys.current.filter(existing => existing !== key), key];
    setActiveKey(key);
    return () => {
      keys.current = keys.current.filter(existing => existing !== key);
      setActiveKey(keys.current.at(-1));
    };
  }, []);
  const value = useMemo(() => ({ host, activeKey, setHost, register }), [host, activeKey, register]);
  return <DetailPanelSlotContext.Provider value={value}>{children}</DetailPanelSlotContext.Provider>;
}

/** Register once per mounted consumer. The previous registrant resumes when the winner unmounts. */
export function useDetailPanelSlot(): HTMLElement | null {
  const slot = useContext(DetailPanelSlotContext);
  const key = useId();
  const register = slot?.register;
  useEffect(() => register?.(key), [register, key]);
  if (!slot) throw new Error('Detail panel requires DetailPanelSlotProvider (provided by AppShell).');
  return slot.activeKey === key ? slot.host : null;
}

/** Shell host only: attach the returned ref to its aside. */
export function useDetailPanelSlotHost() {
  const slot = useContext(DetailPanelSlotContext);
  if (!slot) throw new Error('Detail panel host requires DetailPanelSlotProvider.');
  return { ref: slot.setHost, open: slot.activeKey !== undefined };
}
