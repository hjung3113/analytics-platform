import { createContext, useContext, type ReactNode } from 'react';

const SurfacePause = createContext(false);

/**
 * The surface that owns everything below was covered for a while but is still mounted (a minimized screen). Detail-slot registrants inside
 * keep their place but are not shown, and their supersession and close callbacks stay silent: pausing is not ending (ADR-0088).
 * Nested scopes pause when any of them does.
 */
export function SurfacePauseScope({ paused, children }: { paused: boolean; children: ReactNode }) {
  const outer = useContext(SurfacePause);
  return <SurfacePause.Provider value={outer || paused}>{children}</SurfacePause.Provider>;
}

/** True while an enclosing `SurfacePauseScope` is paused. */
export function useSurfacePaused(): boolean {
  return useContext(SurfacePause);
}
