import { useLayoutEffect, useState } from 'react';

/** The content width of the element the returned `ref` is attached to, in px, kept current by a `ResizeObserver`; null until measured. */
export function useElementWidth(): { ref: (node: HTMLElement | null) => void; width: number | null } {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!node) { setWidth(null); return; }
    if (typeof ResizeObserver === 'undefined') { setWidth(node.getBoundingClientRect().width); return; }
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setWidth(entry.contentRect.width); });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, [node]);
  return { ref: setNode, width };
}
