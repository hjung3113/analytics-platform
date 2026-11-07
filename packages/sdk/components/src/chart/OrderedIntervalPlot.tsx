import { useEffect, useRef, useState } from 'react';
import { isThemeColorToken, readColorToken, type ThemeColorToken } from '@ap/ui/theme';
import {
  intervalShape,
  orderTicks,
  orderX,
  ORDER_GUTTER,
  ORDER_ROW_HEIGHT,
  visibleOrderedItems,
} from './orderedIntervalGeometry';
import type { OrderedIntervalTrackProps, OrderedTrackItem } from './orderedIntervalTypes';

type PlotProps = Pick<
  OrderedIntervalTrackProps,
  'ariaLabel' | 'states' | 'lanes' | 'formatTick' | 'formatTime' | 'markers' | 'axis' | 'height'
> & {
  items: readonly OrderedTrackItem[];
  view: [number, number];
  selected: string | null;
  focused: string | null;
  timeLabels: boolean;
  brushMode: boolean;
  brush: [number, number] | null;
  focusedLane: number;
  onHover: (item: OrderedTrackItem | null, x: number, y: number) => void;
  onSelect: (item: OrderedTrackItem) => void;
  onView: (view: [number, number]) => void;
  onBrush: (view: [number, number]) => void;
  onZoom: (factor: number, anchor?: number) => void;
};
const AXIS_HEIGHT = 48;
/** Draws only the current horizontal and vertical window; no per-item DOM nodes. */
export function OrderedIntervalPlot(props: PlotProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const axis = useRef<HTMLCanvasElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; order: number; pointer: number } | null>(null);
  const [width, setWidth] = useState(600);
  const [top, setTop] = useState(0);
  const [theme, setTheme] = useState(0);
  const height = Math.max(24, Number.isFinite(props.height) ? (props.height ?? 288) : 288);
  const plotWidth = Math.max(1, width - ORDER_GUTTER);
  const { view, onZoom } = props;
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(240, element.clientWidth || 600)));
    observer.observe(element);
    const themeObserver = new MutationObserver(() => setTheme((n) => n + 1));
    for (let node: HTMLElement | null = element; node; node = node.parentElement)
      themeObserver.observe(node, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style'],
      });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, []);
  useEffect(() => {
    if (scroll.current) {
      scroll.current.style.height = `${height}px`;
    }
    if (spacer.current) spacer.current.style.height = `${props.lanes.length * ORDER_ROW_HEIGHT}px`;
  }, [height, props.lanes.length]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const y = Math.max(0, props.focusedLane) * ORDER_ROW_HEIGHT;
    if (y < element.scrollTop) element.scrollTop = y;
    else if (y + ORDER_ROW_HEIGHT > element.scrollTop + height)
      element.scrollTop = y + ORDER_ROW_HEIGHT - height;
    setTop(element.scrollTop);
  }, [props.focusedLane, height]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!(event.shiftKey || event.ctrlKey || event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (event.clientX - element.getBoundingClientRect().left - ORDER_GUTTER) / plotWidth,
        ),
      );
      onZoom(event.deltaY > 0 ? 1.25 : 0.8, view[0] + ratio * (view[1] - view[0]));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [onZoom, view, plotWidth]);
  useEffect(() => {
    const element = canvas.current;
    const header = axis.current;
    if (!element || !header) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const setup = (target: HTMLCanvasElement, h: number) => {
      target.width = Math.round(width * dpr);
      target.height = Math.round(h * dpr);
      target.style.height = `${h}px`;
      const ctx = target.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, h);
      }
      return ctx;
    };
    const ctx = setup(element, height);
    const head = setup(header, AXIS_HEIGHT);
    if (!ctx || !head) return;
    const colors = new Map<ThemeColorToken, string>();
    const color = (name: ThemeColorToken | `--${ThemeColorToken}`) => {
      const token = (name.startsWith('--') ? name.slice(2) : name) as ThemeColorToken;
      if (!colors.has(token)) colors.set(token, readColorToken(token, element));
      return colors.get(token) ?? '';
    };
    const x = (order: number) => orderX(order, props.view, plotWidth);
    const computed = getComputedStyle(element);
    ctx.font = head.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    head.fillStyle = color('--text-secondary');
    let previousEnd = ORDER_GUTTER;
    for (const tick of orderTicks(props.view, plotWidth)) {
      const text =
        props.formatTick?.(tick) ??
        (props.axis === 'time' ? (props.formatTime?.(tick) ?? String(tick)) : String(tick));
      const extra =
        props.timeLabels && props.axis !== 'time' ? (props.formatTime?.(tick) ?? '') : '';
      const w = Math.max(head.measureText(text).width, head.measureText(extra).width);
      const left = Math.max(ORDER_GUTTER, Math.min(width - w, x(tick) - w / 2));
      if (left < previousEnd) continue;
      head.fillText(text, left, 13, plotWidth);
      if (extra) head.fillText(extra, left, 28, plotWidth);
      previousEnd = left + w + 12;
    }
    const first = Math.max(0, Math.floor(top / ORDER_ROW_HEIGHT));
    const last = Math.min(props.lanes.length, Math.ceil((top + height) / ORDER_ROW_HEIGHT));
    const visible = visibleOrderedItems(
      props.items,
      props.view,
      props.lanes.slice(first, last).map((lane) => lane.laneKey),
    );
    const rows = new Map(
      props.lanes.slice(first, last).map((lane, i) => [lane.laneKey, i + first]),
    );
    const bins = Array.from({ length: Math.max(1, Math.floor(plotWidth / 8)) }, () => 0);
    for (const item of props.items)
      if (
        item.kind === 'point' &&
        item.orderStart >= props.view[0] &&
        item.orderStart <= props.view[1]
      ) {
        const bin = Math.min(
          bins.length - 1,
          Math.floor(
            ((item.orderStart - props.view[0]) / (props.view[1] - props.view[0])) * bins.length,
          ),
        );
        bins[bin]++;
      }
    const max = Math.max(1, ...bins);
    head.fillStyle = color('chart-series-1');
    bins.forEach((count, i) =>
      head.fillRect(
        ORDER_GUTTER + (i * plotWidth) / bins.length,
        AXIS_HEIGHT - (count / max) * 8,
        plotWidth / bins.length,
        (count / max) * 8,
      ),
    );
    ctx.fillStyle = color('--text-secondary');
    for (let row = first; row < last; row++)
      ctx.fillText(props.lanes[row].label, 8, row * ORDER_ROW_HEIGHT - top + 16, ORDER_GUTTER - 16);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ORDER_GUTTER, 0, plotWidth, height);
    ctx.clip();
    const pointCounts = new Map<string, number>();
    for (const item of visible)
      if (item.kind === 'point')
        pointCounts.set(item.laneKey, (pointCounts.get(item.laneKey) ?? 0) + 1);
    // Intervals first, points second: hit-testing follows the same painter order.
    const sorted = [
      ...visible.filter((item) => item.kind !== 'point'),
      ...visible.filter((item) => item.kind === 'point'),
    ];
    for (const item of sorted) {
      const y = (rows.get(item.laneKey) ?? 0) * ORDER_ROW_HEIGHT - top;
      const token = props.states[item.state]?.colorToken;
      ctx.fillStyle = color(token && isThemeColorToken(token) ? token : 'chart-no-data');
      const selected = item.id === props.selected;
      const focused = item.id === props.focused;
      if (item.kind === 'point') {
        if ((pointCounts.get(item.laneKey) ?? 0) * 24 > plotWidth && !selected && !focused)
          continue;
        const at = x(item.orderStart);
        const middle = y + ORDER_ROW_HEIGHT / 2;
        ctx.beginPath();
        ctx.moveTo(at, middle - 3);
        ctx.lineTo(at + 3, middle);
        ctx.lineTo(at, middle + 3);
        ctx.lineTo(at - 3, middle);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color(selected ? 'chart-selection-outline' : 'surface-card');
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
      } else {
        const shape = intervalShape(item, props.view, plotWidth);
        ctx.fillRect(shape.x, y, shape.width, ORDER_ROW_HEIGHT);
        if (shape.outline) {
          ctx.strokeStyle = color('--border-strong');
          ctx.lineWidth = 1;
          ctx.strokeRect(shape.x + 0.5, y + 0.5, shape.width - 1, ORDER_ROW_HEIGHT - 1);
        }
        ctx.strokeStyle = color('--text-primary');
        ctx.lineWidth = 1.5;
        if (item.carryover) {
          ctx.beginPath();
          ctx.moveTo(shape.x + 5, y + 2);
          ctx.lineTo(shape.x + 1, y + 12);
          ctx.lineTo(shape.x + 5, y + 22);
          ctx.stroke();
        }
        if (shape.open) {
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(shape.x + shape.width - 1, y);
          ctx.lineTo(shape.x + shape.width - 1, y + ORDER_ROW_HEIGHT);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (selected) {
          ctx.strokeStyle = color('chart-selection-outline');
          ctx.lineWidth = 2;
          ctx.strokeRect(shape.x + 1, y + 1, Math.max(0, shape.width - 2), ORDER_ROW_HEIGHT - 2);
        }
        if (focused) {
          ctx.fillStyle = color('--text-primary');
          ctx.fillText('▾', shape.x, y + 4);
        }
      }
    }
    for (const marker of props.markers ?? [])
      if (marker.order >= props.view[0] && marker.order <= props.view[1]) {
        ctx.strokeStyle = color('--text-secondary');
        ctx.lineWidth = 1;
        ctx.setLineDash(marker.kind === 'boundary' ? [4, 3] : [1, 3]);
        ctx.beginPath();
        ctx.moveTo(x(marker.order), 0);
        ctx.lineTo(x(marker.order), height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    // Marker captions stay in the axis, after all lines; no label plates over interval fills.
    for (const marker of props.markers ?? [])
      if (marker.order >= props.view[0] && marker.order <= props.view[1]) {
        const nearBoundary =
          marker.kind === 'inversion' &&
          props.markers?.some(
            (other) => other.kind === 'boundary' && Math.abs(x(other.order) - x(marker.order)) < 96,
          );
        const text = marker.kind === 'inversion' ? `↶ ${marker.label}` : marker.label;
        head.fillStyle = color('--text-primary');
        head.fillText(
          text,
          Math.max(
            ORDER_GUTTER,
            Math.min(width - head.measureText(text).width, x(marker.order) + 3),
          ),
          nearBoundary ? 30 : 40,
          plotWidth,
        );
      }
    if (props.brush) {
      ctx.strokeStyle = color('chart-selection-outline');
      ctx.lineWidth = 2;
      ctx.strokeRect(x(props.brush[0]), 1, x(props.brush[1]) - x(props.brush[0]), height - 2);
    }
    ctx.restore();
  }, [props, height, width, top, plotWidth, theme]);
  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const lane = props.lanes[Math.floor((event.clientY - box.top + top) / ORDER_ROW_HEIGHT)];
    const order = Math.max(
      view[0],
      Math.min(view[1], view[0] + ((px - ORDER_GUTTER) / plotWidth) * (view[1] - view[0])),
    );
    const hits =
      px < ORDER_GUTTER || !lane
        ? []
        : visibleOrderedItems(props.items, view, [lane.laneKey]).filter((item) =>
            item.kind === 'point'
              ? Math.abs(orderX(item.orderStart, view, plotWidth) - px) <= 5
              : item.orderStart <= order && (item.orderEnd ?? view[1]) >= order,
          );
    const hit = hits.filter((item) => item.kind === 'point').at(-1) ?? hits.at(-1);
    return { order, hit };
  }
  return (
    <>
      <canvas ref={axis} aria-hidden className="block w-full t-caption" />
      <div
        ref={scroll}
        data-ordered-scroll
        className="relative overflow-y-auto"
        onScroll={(event) => {
          setTop(event.currentTarget.scrollTop);
          props.onHover(null, 0, 0);
        }}
      >
        <div className="sticky top-0 h-0">
          <canvas
            ref={canvas}
            role="img"
            aria-label={props.ariaLabel}
            className="block w-full touch-pan-y t-caption"
            onPointerMove={(event) => {
              if (!drag.current)
                props.onHover(position(event).hit ?? null, event.clientX, event.clientY);
            }}
            onPointerLeave={() => props.onHover(null, 0, 0)}
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                event.clientX - event.currentTarget.getBoundingClientRect().left < ORDER_GUTTER
              )
                return;
              drag.current = {
                x: event.clientX,
                order: position(event).order,
                pointer: event.pointerId,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
              event.currentTarget.closest<HTMLElement>('section')?.focus({ preventScroll: true });
            }}
            onPointerUp={(event) => {
              const start = drag.current;
              if (!start || event.pointerId !== start.pointer) return;
              drag.current = null;
              const { order, hit } = position(event);
              if (Math.abs(event.clientX - start.x) > 3) {
                if (props.brushMode)
                  props.onBrush([Math.min(start.order, order), Math.max(start.order, order)]);
                else props.onView([view[0] + start.order - order, view[1] + start.order - order]);
              } else if (!props.brushMode && hit) props.onSelect(hit);
              if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          />
        </div>
        <div ref={spacer} className="pointer-events-none" />
      </div>
    </>
  );
}
