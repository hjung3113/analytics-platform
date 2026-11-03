import { createContext, useContext } from 'react';

const PrimaryActionTargetContext = createContext<HTMLElement | null>(null);

/** Set by `FeatureScreenPage` to the primary-action element of its page head; `null` while it is not drawn. */
export const PrimaryActionTargetProvider = PrimaryActionTargetContext.Provider;

/** Module-level on purpose: it is the seam's `usePrimaryActionTarget`, and seam hooks must keep one identity (`FeatureBridge`). */
export function usePrimaryActionTarget(): HTMLElement | null {
  return useContext(PrimaryActionTargetContext);
}
