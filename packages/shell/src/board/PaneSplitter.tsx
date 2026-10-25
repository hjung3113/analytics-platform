import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@ap/ui';
import type { SplitBounds } from './layout';

/**
 * Two-track splitter. Pixel bounds describe effective sizes; only explicit gestures save percentages. `final` is false for the moves of a
 * pointer drag (resize only) and true once it ends or for a key press, so a drag is saved once, not per move (#823).
 */
export function PaneSplitter({ horizontal, label, controls, value, bounds, extent, placement, onChange }: {
  horizontal?: boolean; label: string; controls: string; value: number; bounds: SplitBounds; extent: number; placement: { left: number; top: number; width: number; height: number };
  onChange: (values: number[], final: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; start: number; value: number; extent: number; last?: number } | null>(null);
  const clamp = (next: number) => Math.max(bounds.min, Math.min(bounds.max, next));
  const change = (next: number, final: boolean) => {
    const clamped = clamp(next);
    onChange([clamped, 100 - clamped], final);
    return clamped;
  };
  /** Ends a drag: saves where it stopped when it moved at all. */
  const finish = () => {
    const last = drag.current?.last;
    drag.current = null;
    if (last !== undefined) onChange([last, 100 - last], true);
  };
  // The latest `onChange` for the unmount cleanup below.
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  useEffect(() => () => {
    const id = drag.current?.pointerId;
    if (id !== undefined && root.current?.hasPointerCapture(id)) root.current.releasePointerCapture(id);
    // Unmounted mid-drag (the board re-keys its splitters when it turns stacked): save where the drag stopped.
    const last = drag.current?.last;
    drag.current = null;
    if (last !== undefined) latest.current([last, 100 - last], true);
  }, []);
  return <div ref={root} role="separator" tabIndex={0} aria-orientation={horizontal ? 'horizontal' : 'vertical'}
    aria-label={label} aria-controls={controls} aria-valuenow={value} aria-valuemin={bounds.min} aria-valuemax={bounds.max} style={{ '--split-left': `${placement.left}px`, '--split-top': `${placement.top}px`, '--split-width': `${placement.width}px`, '--split-height': `${placement.height}px` } as CSSProperties}
    onKeyDown={event => {
      const delta = horizontal ? (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0)
        : (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0);
      if (!delta && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      change(event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : value + delta, true);
    }}
    onPointerDown={event => {
      if (event.button !== 0 || extent <= 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, start: horizontal ? event.clientY : event.clientX, value, extent };
    }}
    onPointerMove={event => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      active.last = change(active.value + ((horizontal ? event.clientY : event.clientX) - active.start) / active.extent * 100, false);
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      finish();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={finish} onLostPointerCapture={finish}
    className={cn('absolute left-(--split-left) top-(--split-top) h-(--split-height) w-(--split-width) z-20 flex touch-none select-none items-center justify-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', horizontal ? 'cursor-row-resize' : 'cursor-col-resize')}>
    <span aria-hidden className={cn('rounded-full bg-border-default', horizontal ? 'h-0.5 w-8' : 'h-8 w-0.5')} />
  </div>;
}
