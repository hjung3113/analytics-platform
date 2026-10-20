import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Narrowest a pane may get before the grid stacks (docs/16 §4): measured on the grid container, not the viewport, so the 788px main
 * column at 1280 + a 440px detail slot keeps a 2×2 in two columns. Kept after measuring the three board menus at that width (#498, docs/16 §4).
 */
export const PANE_MIN_WIDTH = 340;
export const PANE_MIN_HEIGHT = 320;
/** The grid gap in px, and the Tailwind class that draws it (`gap-3` = 12px); `drawnColumns` needs the number. */
export const GRID_GAP = 12;
export const GRID_GAP_CLASS = 'gap-3';

/** Width of an element's content box, tracked with a ResizeObserver. 0 until measured (or where there is no observer). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Columns actually drawn: the layout's own, or one when each pane would fall under `PANE_MIN_WIDTH`. The stored layout never changes. */
export function drawnColumns(columns: number, width: number): number {
  if (columns <= 1 || width <= 0) return columns;
  return (width - GRID_GAP * (columns - 1)) / columns < PANE_MIN_WIDTH ? 1 : columns;
}
