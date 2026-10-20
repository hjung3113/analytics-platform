import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@ap/ui';
import type { SplitBounds } from './layout';

/** Two-track splitter. Pixel bounds describe effective sizes; only explicit gestures save percentages. */
export function PaneSplitter({ horizontal, label, controls, value, bounds, extent, placement, onChange }: {
  horizontal?: boolean; label: string; controls: string; value: number; bounds: SplitBounds; extent: number; placement: { left: number; top: number; width: number; height: number };
  onChange: (values: number[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; start: number; value: number; extent: number } | null>(null);
  const change = (next: number) => {
    const clamped = Math.max(bounds.min, Math.min(bounds.max, next));
    onChange([clamped, 100 - clamped]);
  };
  useEffect(() => () => {
    const id = drag.current?.pointerId;
    if (id !== undefined && root.current?.hasPointerCapture(id)) root.current.releasePointerCapture(id);
    drag.current = null;
  }, []);
  return <div ref={root} role="separator" tabIndex={0} aria-orientation={horizontal ? 'horizontal' : 'vertical'}
    aria-label={label} aria-controls={controls} aria-valuenow={value} aria-valuemin={bounds.min} aria-valuemax={bounds.max} style={{ '--split-left': `${placement.left}px`, '--split-top': `${placement.top}px`, '--split-width': `${placement.width}px`, '--split-height': `${placement.height}px` } as CSSProperties}
    onKeyDown={event => {
      const delta = horizontal ? (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0)
        : (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0);
      if (!delta && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      change(event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : value + delta);
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
      change(active.value + ((horizontal ? event.clientY : event.clientX) - active.start) / active.extent * 100);
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    className={cn('absolute left-(--split-left) top-(--split-top) h-(--split-height) w-(--split-width) z-20 flex touch-none select-none items-center justify-center rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', horizontal ? 'cursor-row-resize' : 'cursor-col-resize')}>
    <span aria-hidden className={cn('rounded-full bg-border-default', horizontal ? 'h-0.5 w-8' : 'h-8 w-0.5')} />
  </div>;
}
