import { useSyncExternalStore } from 'react';

/**
 * Theme switches are one attribute on the document root (`data-theme`, see tokens.css). Canvas renderers (ECharts,
 * the interval plots) resolve token colours once per draw with `readColorToken`, so they must redraw when it changes.
 * One shared observer counts the changes; a component that reads colours subscribes with `useThemeRevision()` and puts
 * the number in the dependencies of whatever resolves them.
 */
let revision = 0;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

export function subscribeThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(() => {
      revision += 1;
      for (const notify of [...listeners]) notify();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { observer?.disconnect(); observer = null; }
  };
}

export function getThemeRevision(): number {
  return revision;
}

/** Changes whenever the root `data-theme` attribute changes; 0 on the server. */
export function useThemeRevision(): number {
  return useSyncExternalStore(subscribeThemeChange, getThemeRevision, () => 0);
}
