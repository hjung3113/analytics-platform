import { useLayoutEffect, useRef } from 'react';
import type { PageFocus } from '../context/pageNavigation';
import { useHostPlatform } from './hooks';

export interface ArrivalFocusOptions {
  /** `false` takes no arrival (a hidden or windowed screen, a board pane whose board owns the focus). Default `true`. */
  enabled?: boolean;
  /** Another value whose change reads the request again, beside the path (a same-path URL change, a new arrival key). */
  rereadKey?: unknown;
}

/**
 * The Kernel arrival-focus handoff of one screen (06 §26): `arrive` gets the explicit focus request for the current path, now
 * and whenever the Kernel releases one later (a navigation dialog's delayed focus gate). The screen instance is the owner, so a
 * request kept for it survives its own re-subscriptions (StrictMode replay, same-path URL rewrites) and another screen never
 * inherits it. `arrive` decides the target; the latest one runs.
 */
export function useArrivalFocus(arrive: (request: PageFocus) => void, { enabled = true, rereadKey }: ArrivalFocusOptions = {}): void {
  const { pageNavigation, pathname } = useHostPlatform();
  // One owner per screen instance (the ref keeps the first symbol for the instance's whole life).
  const owner = useRef(Symbol('arrival focus')).current;
  const latest = useRef(arrive);
  useLayoutEffect(() => { latest.current = arrive; });
  useLayoutEffect(() => {
    if (!enabled) return;
    const read = () => {
      const request = pageNavigation.consume(pathname);
      if (request) latest.current(request);
    };
    read();
    return pageNavigation.subscribe(read, owner);
  }, [pageNavigation, pathname, enabled, rereadKey, owner]);
}
