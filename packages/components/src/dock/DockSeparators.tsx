import { useRef, type CSSProperties } from 'react';
import { cn } from '@ap/ui';
import { panelOrder, resizeBoundary } from './commands';
import { dockBoundaries, pairBounds, topLevelRows, type DockBoundary, type PanelMinimums } from './displayModel';
import type { DockRows, DockSeparatorInfo } from './dockTypes';
import { dockGroups } from './schema';
import type { DockNode } from './schema';

export type DockRect = { left: number; top: number; width: number; height: number };

const STEP = 5;
const HIT = 12;
/** Row mode: one arrow key press moves a row boundary this many px. */
export const ROW_STEP = 24;

function union(ids: readonly string[], rects: Readonly<Record<string, DockRect>>): DockRect | undefined {
  const found = ids.map(id => rects[id]).filter((rect): rect is DockRect => rect !== undefined);
  if (found.length === 0) return undefined;
  const left = Math.min(...found.map(rect => rect.left));
  const top = Math.min(...found.map(rect => rect.top));
  return { left, top, width: Math.max(...found.map(rect => rect.left + rect.width)) - left, height: Math.max(...found.map(rect => rect.top + rect.height)) - top };
}

function place(boundary: DockBoundary, rects: Readonly<Record<string, DockRect>>) {
  const before = union(boundary.before, rects);
  const after = union(boundary.after, rects);
  if (!before || !after) return { placed: false, pairPx: 0, left: 0, top: 0, width: 0, height: 0 };
  const row = boundary.dir === 'row';
  const pair = union([...boundary.before, ...boundary.after], rects)!;
  const pairPx = row ? pair.width : pair.height;
  const centre = row ? (before.left + before.width + after.left) / 2 : (before.top + before.height + after.top) / 2;
  return row
    ? { placed: pairPx > 0, pairPx, left: centre - HIT / 2, top: pair.top, width: HIT, height: pair.height }
    : { placed: pairPx > 0, pairPx, left: pair.left, top: centre - HIT / 2, width: pair.width, height: HIT };
}

/**
 * Row mode (`DockRows`): the boundary under each top-level row, the last one included (it is the row's own bottom edge). Each resizes only the row
 * above it, in px: rows below keep their px and move, the layout grows or shrinks by the same amount. Pointer drag is this overlay's own (the
 * engine's sash between rows is inert, `dock.css`); the keys are ArrowUp/ArrowDown ±`ROW_STEP`, Home = the row's minimum, End = its maximum.
 */
function RowSeparators({ layout, rects, rows, instanceId, label }: {
  layout: DockNode;
  rects: Readonly<Record<string, DockRect>>;
  rows: DockRows;
  instanceId: string;
  label: (info: DockSeparatorInfo) => string;
}) {
  const parts = topLevelRows(layout);
  const drag = useRef<{ startY: number; startPx: number } | null>(null);
  const resize = (index: number, px: number, startPx: number) => {
    const limit = Math.max(rows.maximum, startPx);
    const next = Math.min(limit, Math.max(rows.minimums[index] ?? 0, Math.round(px)));
    if (next !== rows.heights[index]) rows.onHeightsChange(rows.heights.map((height, at) => (at === index ? next : height)));
  };
  return <>
    {parts.map((part, index) => {
      const ids = panelOrder(part);
      const following = parts[index + 1];
      const before = union(ids, rects);
      const after = following ? union(panelOrder(following), rects) : undefined;
      const placed = before !== undefined && (!following || after !== undefined);
      const edge = before ? before.top + before.height : 0;
      const top = (after ? (edge + after.top) / 2 : edge) - HIT / 2;
      const now = rows.heights[index] ?? 0;
      const min = rows.minimums[index] ?? 0;
      const max = Math.max(rows.maximum, now);
      const controls = [dockGroups(part)[0]!.active, following ? dockGroups(following)[0]!.active : undefined].filter(Boolean).map(id => `${instanceId}-panel-${id}`).join(' ');
      return <div key={`row/${index}`} role="separator" tabIndex={0} data-dock-separator data-dock-row-separator={index}
        aria-orientation="horizontal" aria-valuenow={Math.round(now)} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)}
        aria-label={label({ dir: 'column', before: ids, after: following ? panelOrder(following) : [] })} aria-controls={controls}
        data-dock-placed={placed}
        style={{ '--dock-left': `${before?.left ?? 0}px`, '--dock-top': `${top}px`, '--dock-width': `${before?.width ?? 0}px`, '--dock-height': `${HIT}px` } as CSSProperties}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          drag.current = { startY: event.clientY, startPx: now };
        }}
        onPointerMove={event => { if (drag.current) resize(index, drag.current.startPx + event.clientY - drag.current.startY, drag.current.startPx); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={event => {
          const target = event.key === 'ArrowDown' ? now + ROW_STEP : event.key === 'ArrowUp' ? now - ROW_STEP : event.key === 'Home' ? min : event.key === 'End' ? max : null;
          if (target === null) return;
          event.preventDefault();
          event.stopPropagation();
          resize(index, target, now);
        }}
        className={cn(
          'pointer-events-auto absolute left-(--dock-left) top-(--dock-top) z-20 h-(--dock-height) w-(--dock-width) cursor-ns-resize touch-none rounded-xs outline-none',
          'focus-visible:ring-2 focus-visible:ring-focus-ring', placed ? 'opacity-100' : 'opacity-0',
        )} />;
    })}
  </>;
}

/**
 * Platform separators (docs/16 §4, ADR-0067 decision 8): one focusable `role="separator"` per boundary between adjacent children of a
 * branch. They are an overlay positioned from the groups' rects on every engine layout event, so they move with the engine's sash; pointer
 * drag stays the engine's sash (the overlay ignores the pointer). Arrow keys move the boundary 5% of the pair, Home/End go to its limits.
 */
export function DockSeparators({ layout, rects, minPanelSize, panelMinimums, instanceId, label, onChange, rows }: {
  layout: DockNode;
  rects: Readonly<Record<string, DockRect>>;
  minPanelSize: { width: number; height: number };
  /** Panels that declare their own minimum: Home/End and the arrow keys stop at it, like the engine. */
  panelMinimums?: PanelMinimums;
  instanceId: string;
  label: (info: DockSeparatorInfo) => string;
  onChange: (next: DockNode) => void;
  /** Row mode: the boundaries between top-level rows are `RowSeparators` (px) instead of percent boundaries. */
  rows?: DockRows;
}) {
  const topRows = rows !== undefined && layout.type === 'branch' && layout.dir === 'column';
  return <>
    {rows && <RowSeparators layout={layout} rects={rects} rows={rows} instanceId={instanceId} label={label} />}
    {dockBoundaries(layout, minPanelSize, panelMinimums).filter(boundary => !(topRows && boundary.path.length === 0)).map(boundary => {
      const spot = place(boundary, rects);
      const bounds = pairBounds(boundary, spot.pairPx);
      const row = boundary.dir === 'row';
      const move = (to: number) => {
        const minBefore = (bounds.min / 100) * boundary.pairPercent;
        const minAfter = ((100 - bounds.max) / 100) * boundary.pairPercent;
        onChange(resizeBoundary(layout, boundary.path, boundary.index, to - boundary.beforePercent, [minBefore, minAfter]));
      };
      return <div key={boundary.key} role="separator" tabIndex={0} data-dock-separator
        aria-orientation={row ? 'vertical' : 'horizontal'} aria-valuenow={bounds.now} aria-valuemin={bounds.min} aria-valuemax={bounds.max}
        aria-label={label({ dir: boundary.dir, before: boundary.before, after: boundary.after })}
        aria-controls={`${instanceId}-panel-${boundary.beforeControl} ${instanceId}-panel-${boundary.afterControl}`}
        data-dock-placed={spot.placed}
        style={{ '--dock-left': `${spot.left}px`, '--dock-top': `${spot.top}px`, '--dock-width': `${spot.width}px`, '--dock-height': `${spot.height}px` } as CSSProperties}
        onKeyDown={event => {
          const forward = row ? 'ArrowRight' : 'ArrowDown';
          const back = row ? 'ArrowLeft' : 'ArrowUp';
          const share = boundary.beforePercent / boundary.pairPercent * 100;
          const target = event.key === forward ? share + STEP : event.key === back ? share - STEP
            : event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : null;
          if (target === null) return;
          event.preventDefault();
          event.stopPropagation();
          move((Math.min(bounds.max, Math.max(bounds.min, target)) / 100) * boundary.pairPercent);
        }}
        className={cn(
          'pointer-events-none absolute left-(--dock-left) top-(--dock-top) z-20 h-(--dock-height) w-(--dock-width) rounded-xs outline-none',
          'focus-visible:ring-2 focus-visible:ring-focus-ring', spot.placed ? 'opacity-100' : 'opacity-0',
        )} />;
    })}
  </>;
}
