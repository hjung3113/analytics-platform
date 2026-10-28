/**
 * Dismissed notice ids for this browser session (08 §8 Decided 2026-09-24: dismissal lasts for the session,
 * not permanently; a new login/visit shows the notice again). Module state outlives the page component, so
 * leaving home and coming back keeps the notice closed. Menu code may not use web storage (6a lint), so a
 * reload counts as a new visit.
 */
import { useSyncExternalStore } from 'react';

let dismissed: readonly string[] = [];
const listeners = new Set<() => void>();

export function dismissNotice(id: string) {
  if (dismissed.includes(id)) return;
  dismissed = [...dismissed, id];
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDismissedNotices(): readonly string[] {
  return useSyncExternalStore(subscribe, () => dismissed);
}
