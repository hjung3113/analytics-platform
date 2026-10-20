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

/** 40px head plus the pane's two outer borders; expanded bodies keep 120px. */
export const PANE_HEADER_HEIGHT = 42;
export const PANE_BODY_MIN_HEIGHT = 120;
export type SplitBounds = { min: number; max: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Stored percentages stay untouched; responsive constraints apply only to the rendered tracks. */
export function effectiveTracks(layout: import('./boardModel').BoardLayout, arrangement: import('./boardModel').Arrangement, width: number, availableHeight: number) {
  const rows = Number(layout[0]);
  const columns = Number(layout[2]);
  const columnSpace = Math.max(columns * PANE_MIN_WIDTH, width - (columns - 1) * GRID_GAP);
  const columnBounds = columns === 1 ? { min: 100, max: 100 } : { min: PANE_MIN_WIDTH / columnSpace * 100, max: (columnSpace - PANE_MIN_WIDTH) / columnSpace * 100 };
  const firstWidth = columnSpace * clamp(arrangement.columns[0], columnBounds.min, columnBounds.max) / 100;
  const widths = columns === 1 ? [columnSpace] : [firstWidth, columnSpace - firstWidth];
  const minimums = Array.from({ length: columns }, (_, c) => Array.from({ length: rows }, (_, r) =>
    PANE_HEADER_HEIGHT + (arrangement.collapsed.includes(r * columns + c) ? 0 : PANE_BODY_MIN_HEIGHT)));
  const height = Math.max(availableHeight, ...minimums.map(values => values.reduce((a, b) => a + b, 0) + (rows - 1) * GRID_GAP));
  const rowSpace = height - (rows - 1) * GRID_GAP;
  const rowBounds = minimums.map((values, c) => {
    if (rows === 1) return { min: 100, max: 100 };
    if (arrangement.collapsed.includes(c)) return { min: values[0] / rowSpace * 100, max: values[0] / rowSpace * 100 };
    if (arrangement.collapsed.includes(columns + c)) return { min: (rowSpace - values[1]) / rowSpace * 100, max: (rowSpace - values[1]) / rowSpace * 100 };
    return { min: values[0] / rowSpace * 100, max: (rowSpace - values[1]) / rowSpace * 100 };
  });
  const heights = rowBounds.map((bounds, c) => {
    if (rows === 1) return [height];
    const first = rowSpace * clamp(arrangement.rows[c][0], bounds.min, bounds.max) / 100;
    return [first, rowSpace - first];
  });
  return { widths, heights, height, columnBounds, rowBounds };
}

/** The panel is flex-sized after head, Context and tabs; subtract actual padding and conditional guidance. */
export function useGridHeight(panel: RefObject<HTMLElement | null>, guidance: RefObject<HTMLElement | null>, allEmpty: boolean): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const note = guidance.current;
      const noteHeight = note ? note.getBoundingClientRect().height + (parseFloat(getComputedStyle(note).marginBottom) || 0) : 0;
      setHeight(Math.max(0, element.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - noteHeight));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (guidance.current) observer.observe(guidance.current);
    return () => observer.disconnect();
  }, [panel, guidance, allEmpty]);
  return height;
}
