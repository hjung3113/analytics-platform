import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import {
  clampGeometry, FLOATING_MIN_SIZE, placeGeometry, resizeGeometry, sizeGeometry, stepGeometry,
  type FloatingArea, type FloatingGeometry, type FloatingHandle, type FloatingPlacePreset, type FloatingSize, type FloatingSizePreset,
} from './geometry';

/** Every user-facing string of the frame; the caller supplies them (ko/en), the package has no defaults. */
export type FloatingWindowLabels = {
  titleBar: string;
  menu: string;
  positionGroup: string;
  sizeGroup: string;
  place: Record<FloatingPlacePreset, string>;
  size: Record<FloatingSizePreset, string>;
  handle: Record<FloatingHandle, string>;
  moved: (x: number, y: number) => string;
  resized: (width: number, height: number) => string;
};

/** `window` = free window; `fill` = fills the whole area (narrow-width replacement); `off` = no frame, children only. Children never remount on a mode change. */
export type FloatingWindowMode = 'window' | 'fill' | 'off';

export type FloatingWindowProps = {
  /** Where the window may live, measured by the caller relative to the positioned container this component sits in. */
  area: FloatingArea;
  /** Controlled geometry relative to `area`; shown clamped, never rewritten. */
  geometry: FloatingGeometry;
  /** Called with the next geometry on pointer-up, key and menu commits only (never per pointer move). */
  onGeometryChange: (next: FloatingGeometry) => void;
  minSize?: FloatingSize;
  mode: FloatingWindowMode;
  title: ReactNode;
  titleId: string;
  /** Host buttons at the right end of the title bar (minimise, maximise, close). */
  actions?: ReactNode;
  /** Extra items appended to the `⋯` menu (DropdownMenuItem children). */
  menuExtra?: ReactNode;
  labels: FloatingWindowLabels;
  children: ReactNode;
};

export type FloatingWindowHandle = { focusTitleBar: () => void };

const HANDLES: { dir: FloatingHandle; cls: string }[] = [
  { dir: 'n', cls: 'inset-x-2 top-0 h-1.5 cursor-ns-resize' }, { dir: 's', cls: 'inset-x-2 bottom-0 h-1.5 cursor-ns-resize' },
  { dir: 'e', cls: 'inset-y-2 right-0 w-1.5 cursor-ew-resize' }, { dir: 'w', cls: 'inset-y-2 left-0 w-1.5 cursor-ew-resize' },
  { dir: 'nw', cls: 'left-0 top-0 size-3 cursor-nwse-resize' }, { dir: 'ne', cls: 'right-0 top-0 size-3 cursor-nesw-resize' },
  { dir: 'sw', cls: 'bottom-0 left-0 size-3 cursor-nesw-resize' }, { dir: 'se', cls: 'bottom-0 right-0 size-3 cursor-nwse-resize' },
];
const PLACES: FloatingPlacePreset[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
const SIZES: FloatingSizePreset[] = ['small', 'medium', 'large'];
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const ANNOUNCE_DELAY_MS = 300;

type Gesture = { kind: 'move' | FloatingHandle; startX: number; startY: number; start: FloatingGeometry; last: FloatingGeometry };

/**
 * A non-modal window frame (06 §13): no backdrop, no focus trap, no outside-click close. Drawn `absolute` inside the caller's positioned container.
 * Pointer drags keep their coordinates in local state and report once on release; keys and the `⋯` menu report immediately (WCAG 2.5.7: every drag has a button/key path).
 */
export const FloatingWindow = forwardRef<FloatingWindowHandle, FloatingWindowProps>(function FloatingWindow(props, ref) {
  const { area, geometry, onGeometryChange, mode, title, titleId, actions, menuExtra, labels, children } = props;
  const minSize = props.minSize ?? FLOATING_MIN_SIZE;
  const [live, setLive] = useState<FloatingGeometry | null>(null);
  const [message, setMessage] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const titleBar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useImperativeHandle(ref, () => ({ focusTitleBar: () => { titleBar.current?.focus(); } }), []);
  useEffect(() => () => { clearTimeout(timer.current); }, []);

  const shown = clampGeometry(live ?? geometry, area, minSize);
  const announce = (from: FloatingGeometry, to: FloatingGeometry) => {
    const text = to.width !== from.width || to.height !== from.height ? labels.resized(to.width, to.height) : labels.moved(to.x, to.y);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setMessage(text); }, ANNOUNCE_DELAY_MS);
  };
  const commit = (next: FloatingGeometry) => {
    if (next.x === shown.x && next.y === shown.y && next.width === shown.width && next.height === shown.height) return;
    onGeometryChange(next);
    announce(shown, next);
  };

  const begin = (kind: Gesture['kind']) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, [role="menuitem"]')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { kind, startX: event.clientX, startY: event.clientY, start: shown, last: shown };
  };
  const drag = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    g.last = g.kind === 'move' ? clampGeometry({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, area, minSize) : resizeGeometry(g.kind, g.start, dx, dy, area, minSize);
    setLive(g.last);
  };
  const end = (event: PointerEvent<HTMLElement>, apply: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setLive(null);
    if (g && apply) {
      const moved = g.last.x !== g.start.x || g.last.y !== g.start.y || g.last.width !== g.start.width || g.last.height !== g.start.height;
      if (moved) { onGeometryChange(g.last); announce(g.start, g.last); }
    }
  };
  const pointerProps = (kind: Gesture['kind']) => ({
    onPointerDown: begin(kind), onPointerMove: drag,
    onPointerUp: (event: PointerEvent<HTMLElement>) => { end(event, true); },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => { end(event, false); },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !ARROWS.has(event.key) || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    commit(stepGeometry(shown, event.key as 'ArrowLeft', event.shiftKey, event.altKey, area, minSize));
  };

  const windowed = mode === 'window';
  const box = mode === 'fill' ? { x: 0, y: 0, width: area.width, height: area.height } : shown;
  return (
    <div
      role={windowed ? 'group' : undefined}
      aria-labelledby={windowed ? titleId : undefined}
      data-floating-mode={mode}
      className={cn(mode === 'off' ? 'contents' : 'absolute isolate left-(--fw-left) top-(--fw-top) z-40 flex h-(--fw-height) w-(--fw-width) flex-col overflow-hidden bg-surface-card', windowed && 'rounded-md border border-border-subtle shadow-lg')}
      style={mode === 'off' ? undefined : ({ '--fw-left': `${String(area.left + box.x)}px`, '--fw-top': `${String(area.top + box.y)}px`, '--fw-width': `${String(box.width)}px`, '--fw-height': `${String(box.height)}px` } as CSSProperties)}
    >
      {windowed ? (
        <div
          ref={titleBar} role="group" tabIndex={0} aria-label={labels.titleBar} onKeyDown={onKeyDown} {...pointerProps('move')}
          className="flex h-10 shrink-0 cursor-move touch-none items-center gap-1 border-b border-border-subtle bg-surface-sunken px-2 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <span id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={labels.menu}><Ellipsis className="size-3.5" aria-hidden />{labels.menu}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{labels.positionGroup}</DropdownMenuLabel>
              {PLACES.map(preset => <DropdownMenuItem key={preset} onSelect={() => { commit(placeGeometry(preset, shown, area, minSize)); }}>{labels.place[preset]}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{labels.sizeGroup}</DropdownMenuLabel>
              {SIZES.map(preset => <DropdownMenuItem key={preset} onSelect={() => { commit(sizeGeometry(preset, shown, area, minSize)); }}>{labels.size[preset]}</DropdownMenuItem>)}
              {menuExtra ? <><DropdownMenuSeparator />{menuExtra}</> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {actions}
        </div>
      ) : null}
      <div className={mode === 'off' ? 'contents' : 'min-h-0 flex-1'}>{children}</div>
      {windowed ? HANDLES.map(h => (
        <div key={h.dir} data-resize={h.dir} aria-hidden title={labels.handle[h.dir]} className={cn('absolute touch-none', h.cls)} {...pointerProps(h.dir)} />
      )) : null}
      <div aria-live="polite" className="sr-only">{message}</div>
    </div>
  );
});
