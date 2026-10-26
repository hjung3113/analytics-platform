import { useCallback, useEffect, useRef, useState } from 'react';
import { drillDestinationOf, paneRootOf } from '../pageFocus';

/**
 * The point menu: the selected point's key, whether the menu is open, and the opener session that close-focus
 * handling reads. `reset` clears the target and closes the menu but keeps the session, so the close-focus handler still runs.
 */
export function usePointMenu(url: string) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const session = useRef<{ opener: HTMLElement | null; url: string; stay: boolean } | null>(null);
  const currentUrl = useRef(url);
  useEffect(() => { currentUrl.current = url; }, [url]);
  const openMenu = useCallback((opener: HTMLElement | null) => {
    session.current = { opener, url, stay: false };
    setOpen(true);
  }, [url]);
  /** The chosen action changes the URL but stays on this chart (06 §16): close focus returns to the opener, not to the drill destination. */
  const stayOnChart = useCallback(() => { if (session.current) session.current.stay = true; }, []);
  const close = useCallback(() => setOpen(false), []);
  const reset = useCallback(() => { setSelectedKey(null); setOpen(false); }, []);

  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    const closed = session.current;
    session.current = null;
    if (!closed) return;
    const active = document.activeElement;
    if (closed.url !== currentUrl.current && !closed.stay) {
      // Modal focus trapping can intercept PlatformPage's layout-effect focus before close.
      // Complete that handoff after the scope is released; never restore the old opener.
      if (!active || active === document.body || contentRef.current?.contains(active)) {
        const scope = paneRootOf(closed.opener) ?? document;
        const destination = drillDestinationOf(scope);
        destination?.focus({ preventScroll: true });
      }
      return;
    }
    if (!closed.opener?.isConnected) return;
    // A consumer action may have already focused its destination or opened another surface.
    if (active && active !== document.body && active !== closed.opener && !contentRef.current?.contains(active)) return;
    closed.opener.focus({ preventScroll: true });
  };

  return { selectedKey, setSelectedKey, open, openMenu, stayOnChart, close, reset, chartRef, triggerRef, contentRef, onCloseAutoFocus };
}
