import { useLayoutEffect, useState } from 'react';

/**
 * The content height of the element the returned `ref` is attached to, in px, kept current by a `ResizeObserver`; null until measured or
 * while `enabled` is false. Used by the `fill` chart size: the plot box takes the height its container leaves.
 */
export function useElementHeight(enabled: boolean): { ref: (node: HTMLElement | null) => void; height: number | null } {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !node) { setHeight(null); return; }
    if (typeof ResizeObserver === 'undefined') { setHeight(node.getBoundingClientRect().height); return; }
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setHeight(entry.contentRect.height); });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, [enabled, node]);
  return { ref: setNode, height };
}
