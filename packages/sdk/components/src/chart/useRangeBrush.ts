import { useState } from 'react';

/** The key fields `keyDown` reads: a React keyboard event and a DOM `KeyboardEvent` both fit. */
export type RangeBrushKey = { key: string; shiftKey: boolean; preventDefault: () => void };

/** A closed range `[start, end]` (start ≤ end) on one numeric axis: epoch ms on a time axis, positions on an order axis. */
export type AxisRange = readonly [number, number];

/** What a surface passes to `useRangeBrush`. All optional: without `value` the brush keeps its own range. */
export type RangeBrushOptions = {
  /** Controlled range (`null` = none). Omit it and the brush keeps the range itself. */
  value?: AxisRange | null;
  /** Starting range while uncontrolled. */
  defaultValue?: AxisRange | null;
  /** Every change: a drag, a key, or a clear (`null`). */
  onChange?: (range: AxisRange | null) => void;
  /** Smallest range the keyboard makes, in axis units (default 1). */
  minSpan?: number;
};

/** The brush state and its three inputs (drag, keyboard, clear) that a surface wires to its own pointer and key handling. */
export type RangeBrush = {
  /** The current range, or null. */
  range: AxisRange | null;
  /** Brush mode: while on, the surface turns a drag into `select` instead of its own drag (pan). */
  mode: boolean;
  setMode: (on: boolean) => void;
  /** A finished drag between two axis values, in either order. */
  select: (from: number, to: number) => void;
  /**
   * Shift+←/→: moves the end by a twentieth of `view` from the range start, never past the view end nor below `minSpan`, and
   * turns brush mode on. Without a range, or when its start lies outside `view` (after a pan or zoom), it starts at the view
   * start. Returns true when it handled the key (the caller stops there).
   */
  keyDown: (event: RangeBrushKey, view: AxisRange) => boolean;
  /** Escape or reset: no range, brush mode off. */
  clear: () => void;
};

/** Pixels a pointer must travel before a press counts as a drag (a shorter press is a click). */
export const RANGE_BRUSH_DRAG_THRESHOLD = 3;

function extendRange(range: AxisRange | null, direction: -1 | 1, view: AxisRange, minSpan: number): AxisRange {
  // A start the view no longer shows restarts at the view start, so the result stays inside the view and start <= end.
  const kept = range && range[0] >= view[0] && range[0] <= view[1] ? range : null;
  const start = kept?.[0] ?? view[0];
  const minimum = Math.min(minSpan, view[1] - start);
  const step = Math.max(minimum, (view[1] - view[0]) / 20);
  return [start, Math.max(start + minimum, Math.min(view[1], (kept?.[1] ?? start) + direction * step))];
}

/**
 * Domain-free «turn on range selection, then drag» on one numeric axis (#1860), for any surface that draws its own axis: LaneTimeline,
 * OrderedIntervalTrack, or a menu's own strip. The surface maps pointer positions to axis values and draws the range with
 * the confirmed look (2px `chart-selection-outline` across the plot, `구간 선택` toggle, `선택 구간` summary line); the hook owns
 * the state and the keyboard alternative (Shift+←/→) so every surface picks ranges the same way. Chart-local state: it never
 * writes the URL or the global Context.
 */
export function useRangeBrush(options: RangeBrushOptions = {}): RangeBrush {
  const [local, setLocal] = useState<AxisRange | null>(options.defaultValue ?? null);
  const [mode, setMode] = useState(false);
  const controlled = options.value !== undefined;
  const range = controlled ? options.value ?? null : local;
  const set = (next: AxisRange | null) => {
    if (next === null && range === null) return;
    if (!controlled) setLocal(next);
    options.onChange?.(next);
  };
  return {
    range,
    mode,
    setMode,
    select: (from, to) => set([Math.min(from, to), Math.max(from, to)]),
    keyDown: (event, view) => {
      if (!event.shiftKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return false;
      event.preventDefault();
      set(extendRange(range, event.key === 'ArrowLeft' ? -1 : 1, view, options.minSpan ?? 1));
      setMode(true);
      return true;
    },
    clear: () => { set(null); setMode(false); },
  };
}
