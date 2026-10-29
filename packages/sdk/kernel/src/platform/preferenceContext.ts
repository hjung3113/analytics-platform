import { createContext, useContext, useSyncExternalStore } from 'react';
import type { PreferenceController, PreferenceState } from './preferenceController';

/** The Kernel-owned server preference seam; null when the assembly did not opt in (browser storage stays in charge). */
export const PreferenceContext = createContext<PreferenceController | null>(null);

export function usePreferenceController(): PreferenceController | null {
  return useContext(PreferenceContext);
}

const NO_STATE: PreferenceState = { status: 'ready', failure: null, version: 0 };
const noop = () => () => {};
/** Re-renders on every controller change; returns a constant state when there is no controller. */
export function usePreferenceState(controller: PreferenceController | null): PreferenceState {
  return useSyncExternalStore(controller ? controller.subscribe : noop, controller ? controller.state : () => NO_STATE);
}
