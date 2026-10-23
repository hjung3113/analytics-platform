import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * Internal (not exported from `index.ts`). A `PlatformPage layout="fill"` provides `register`; a workspace that shows its rows at their own
 * heights registers while it does, and the page then sizes to its content (the main area scrolls) instead of filling its container. A page
 * that is not `fill` provides null, so a workspace never changes the sizing of a page outside the panel it sits in.
 */
export type PageFlowRegister = () => () => void;
export const PageFlowContext = createContext<PageFlowRegister | null>(null);

export function useRegisterPageFlow(active: boolean): void {
  const register = useContext(PageFlowContext);
  useLayoutEffect(() => {
    if (!active || !register) return;
    return register();
  }, [active, register]);
}
