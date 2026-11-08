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

/**
 * Internal. A `fill` table registers here while it shows so that the nearest fixed-fill `PlatformPage` bounds its body to the container
 * height (`min-h-0`) and the table can take the room left instead of growing the page. A page without such a table keeps its sizing.
 */
export const PageBoundContext = createContext<PageFlowRegister | null>(null);

export function useRegisterPageBound(active: boolean): void {
  const register = useContext(PageBoundContext);
  useLayoutEffect(() => {
    if (!active || !register) return;
    return register();
  }, [active, register]);
}
