import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';

import { type HostSeam, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';

const TargetContext = createContext<HTMLElement | null>(null);
/** Module level, like the bridge's: a seam hook keeps one identity. */
const useTarget = () => useContext(TargetContext);

/**
 * Stands in for the platform page: a `header` holding the primary-action element (`data-testid="host-head"`) and a body (`host-body`) around the screen.
 * The seam is `base` (default: the registered default host) plus `usePrimaryActionTarget`, so a screen draws its primary action into the head as under the bridge.
 */
export function HeadTargetHost({ children, base }: { children: ReactNode; base?: HostSeam }) {
  const inherited = useDefaultBase(base);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const seam = useMemo<HostSeam>(() => ({ ...inherited, usePrimaryActionTarget: useTarget }), [inherited]);
  return (
    <HostSeamProvider value={seam}>
      <TargetContext.Provider value={target}>
        <header data-testid="host-head"><span ref={setTarget} /></header>
        <div data-testid="host-body">{children}</div>
      </TargetContext.Provider>
    </HostSeamProvider>
  );
}

function useDefaultBase(base: HostSeam | undefined): HostSeam {
  const registered = useHostSeam();
  return base ?? registered;
}
