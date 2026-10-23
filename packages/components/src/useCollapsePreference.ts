import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readLocalStorage, writeLocalStorage } from '@ap/ui';

export type CollapsePreference = {
  collapsed: boolean;
  /** Stores the preference and queues focus on the opposite toggle (after the layout commit). */
  toggle: (nextCollapsed: boolean) => void;
  expandRef: RefObject<HTMLButtonElement | null>;
  collapseRef: RefObject<HTMLButtonElement | null>;
  /** Text for an always-mounted polite region: only a summary change that happens while already collapsed. */
  liveText: string;
};

/**
 * A boolean collapse preference kept in `localStorage` (JSON, per key), the opposite-toggle focus move, and the collapsed-summary
 * announcement shared by `PageFilterBar` and the page head. The toggle itself is never announced; `summaryText` changes are, but only
 * while collapsed (the first collapsed render records the baseline). `expandOnMount` starts expanded without touching the stored value.
 */
export function useCollapsePreference(storageKey: string, summaryText: string, defaultCollapsed = false, expandOnMount = false): CollapsePreference {
  const [collapsed, setCollapsed] = useState(() => !expandOnMount && readLocalStorage(storageKey, raw => JSON.parse(raw ?? String(defaultCollapsed)) === true, defaultCollapsed));
  const pendingFocus = useRef<'expand' | 'collapse' | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (pendingFocus.current === 'expand') expandRef.current?.focus();
    else if (pendingFocus.current === 'collapse') collapseRef.current?.focus();
    pendingFocus.current = null;
  });

  function toggle(nextCollapsed: boolean) {
    pendingFocus.current = nextCollapsed ? 'expand' : 'collapse';
    setCollapsed(nextCollapsed);
    writeLocalStorage(storageKey, JSON.stringify(nextCollapsed)); // preference stays in memory when storage refuses
  }

  const [liveText, setLiveText] = useState('');
  const announcedSummary = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!collapsed) {
      announcedSummary.current = null;
      setLiveText('');
      return;
    }
    if (announcedSummary.current === null) {
      // First collapsed render (initial mount or a fresh collapse): record the baseline, announce nothing.
      announcedSummary.current = summaryText;
      return;
    }
    if (announcedSummary.current !== summaryText) {
      announcedSummary.current = summaryText;
      setLiveText(summaryText);
    }
  }, [collapsed, summaryText]);

  return { collapsed, toggle, expandRef, collapseRef, liveText };
}
