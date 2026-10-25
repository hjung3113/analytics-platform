import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { cn, prefersReducedMotion } from '@ap/ui';
import { baseTextStyle, type EChartProps } from './EChart';

echarts.use([LineChart, BarChart, BoxplotChart, PieChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, ToolboxComponent, MarkAreaComponent, MarkLineComponent, LabelLayout, CanvasRenderer]);

/** One option node: a global `animation` flag plus a series array or a single series object. */
type AnimationOption = { animation?: boolean; series?: unknown };

/** Copies the node with `animation` forced off here and on every series entry; never mutates the input. */
function animationOff<T extends AnimationOption>(option: T): T {
  const next = { ...option, animation: false } as T;
  if (option.series !== undefined) {
    next.series = Array.isArray(option.series)
      ? option.series.map(entry => animationOff(entry as AnimationOption))
      : animationOff(option.series as AnimationOption);
  }
  return next;
}

/** Component main types registered above: `replaceMerge` accepts only registered components (a root key such as `textStyle`, or an
 * unregistered `legend`, throws), so any other object key falls back to notMerge. */
const COMPONENT_TYPES = new Set(['series', 'xAxis', 'yAxis', 'tooltip', 'axisPointer', 'toolbox', 'markArea', 'markLine']);
/** Root settings whose value is an object or array but that are not components (merged, never replaced). */
const ROOT_OBJECTS = new Set(['textStyle', 'color']);
/** Merged, never replaced: each owns a drag in progress. The inside dataZoom's roam controller lives on the grid's coordinate
 * system (#705), and the brush component holds the brush being drawn (#808); replacing any of them drops the drag. */
const KEPT = new Set(['dataZoom', 'grid', 'brush']);
/** Entries and their keys: a merge cannot remove a key, so only the same keys may merge (orientation adds `containLabel` to the grid
 * and swaps `xAxisIndex`/`yAxisIndex` on the brush). */
const keyShape = (component: unknown): string => JSON.stringify((Array.isArray(component) ? component : component ? [component] : []).map(entry => Object.keys(entry as object).sort()));
type ZoomShape = { type?: unknown; xAxisIndex?: unknown; yAxisIndex?: unknown };
const zoomShape = (zoom: unknown): string | null => {
  if (!Array.isArray(zoom) || zoom.length === 0) return null;
  return JSON.stringify(zoom.map((z: ZoomShape) => [z.type, z.xAxisIndex, z.yAxisIndex]));
};

/**
 * How the next option replaces the last one. A notMerge rebuilds every component, including the inside dataZoom whose roam
 * controller owns a drag in progress: a re-render while the user drags the zoomed plot (press, or the zoom echo through
 * `datazoom`) dropped the pan (#705), and one while brushing (a width-dependent note layout on resize) dropped the brush (#808).
 * When the root keys, the dataZoom shape and the grid and brush shapes are unchanged, every other component is replaced
 * (`replaceMerge`; EChartImpl empties the series first, since a matching id would merge) and only dataZoom, grid and brush
 * merge, so the drag survives; root settings (`textStyle`, `animation`…)
 * merge, and the same key set means none is left behind. A key that is neither a known component nor a plain root setting
 * (an object or array outside the list) rebuilds, so a component type added later cannot linger. Any other change rebuilds as before.
 */
export function setOptionMode(previous: EChartsCoreOption | null, next: EChartsCoreOption): { notMerge: true } | { replaceMerge: string[] } {
  if (!previous) return { notMerge: true };
  const keys = Object.keys(next);
  const shape = zoomShape(next.dataZoom);
  if (shape === null || shape !== zoomShape(previous.dataZoom) || keyShape(next.grid) !== keyShape(previous.grid) || keyShape(next.brush) !== keyShape(previous.brush) || keys.length !== Object.keys(previous).length || keys.some(key => !(key in previous))) return { notMerge: true };
  if (keys.some(key => !KEPT.has(key) && !COMPONENT_TYPES.has(key) && !ROOT_OBJECTS.has(key) && typeof next[key] === 'object' && next[key] !== null)) return { notMerge: true };
  return { replaceMerge: keys.filter(key => COMPONENT_TYPES.has(key)) };
}

/** ECharts-dependent implementation, loaded lazily from EChart (#48) so charts stay out of the main bundle. */
export default function EChartImpl({ option, height = 280, onEvents, onReady, onResize, ariaLabel, className }: EChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const applied = useRef<EChartsCoreOption | null>(null);
  const events = useRef(onEvents);
  events.current = onEvents;
  const resized = useRef(onResize);
  resized.current = onResize;

  useEffect(() => {
    if (!el.current) return;
    const instance = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { instance.resize(); resized.current?.(instance.getWidth()); }) : null;
    observer?.observe(el.current);
    onReady?.(instance);
    return () => { observer?.disconnect(); instance.dispose(); chart.current = null; applied.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the effect owns mount/unmount only; onReady is read once at mount
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const merged: EChartsCoreOption = { textStyle: baseTextStyle, animationDuration: 120, useUTC: true, ...option };
    // Canvas never sees the CSS reduced-motion rules (06 §26), so the OS preference is enforced here, re-read on
    // every setOption and applied after the consumer merge: a series-level `animation` beats the global flag
    // (echarts 6.1 Series.js), so both are forced off in every shape echarts accepts — the top level, baseOption
    // (OptionManager makes it the effective option) and each media[].option override (Global.js merges it last).
    // Copies only: the consumer's option object is never mutated. With motion allowed nothing is overridden.
    let next = merged;
    if (prefersReducedMotion()) {
      const forced = animationOff(merged);
      if (forced.baseOption !== undefined) forced.baseOption = animationOff(forced.baseOption);
      if (forced.media !== undefined) forced.media = forced.media.map(entry => (entry.option ? { ...entry, option: animationOff(entry.option) } : entry));
      next = forced;
    }
    const mode = setOptionMode(applied.current, next);
    // replaceMerge still merges a component whose id matches (every series has one), so a key the next option leaves out would
    // survive (a value label turned off kept drawing). Empty the series first; axes, brush and toolbox carry no id and are rebuilt.
    if ('replaceMerge' in mode) instance.setOption({ series: [] }, { replaceMerge: ['series'], silent: true, lazyUpdate: true });
    instance.setOption(next, mode);
    applied.current = next;
  }, [option]);

  // Handlers are read through `events` at call time; only a changed set of event names rebinds.
  const eventNames = onEvents ? Object.keys(onEvents).join(',') : '';
  useEffect(() => {
    const instance = chart.current;
    if (!instance || !eventNames) return;
    const names = eventNames.split(',');
    for (const name of names) instance.on(name, (p: unknown) => events.current?.[name]?.(p, instance));
    return () => { for (const name of names) instance.off(name); };
  }, [eventNames]);

  // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
  return <div ref={el} role="img" aria-label={ariaLabel} className={cn(className, 'w-full')} style={{ height }} />;
}
