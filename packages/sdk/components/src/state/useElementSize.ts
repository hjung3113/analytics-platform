import { useLayoutEffect, useState } from 'react';

/**
 * The content box of the element the returned `ref` is attached to, in px, kept current by a `ResizeObserver`; null until measured or
 * while `enabled` is false. Used by the `fill` chart size (height) and the table status line's fit test (width).
 */
export function useElementSize(enabled = true): { ref: (node: HTMLElement | null) => void; width: number | null; height: number | null } {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !node) { setSize(null); return; }
    if (typeof ResizeObserver === 'undefined') { const rect = node.getBoundingClientRect(); setSize({ width: rect.width, height: rect.height }); return; }
    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry) setSize(prev => prev && prev.width === entry.contentRect.width && prev.height === entry.contentRect.height ? prev : { width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, [enabled, node]);
  return { ref: setNode, width: size?.width ?? null, height: size?.height ?? null };
}
