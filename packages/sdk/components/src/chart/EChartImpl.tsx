import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, CustomChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GraphicComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { cn, prefersReducedMotion } from '@ap/ui';
import { useThemeRevision } from '@ap/ui/theme';
import { DeclaredQueryPanelContext } from '../workspace/panelContext';
import { sameDrawing } from './chartDrawing';
import { baseTextStyle, type EChartProps } from './EChart';
import { ChartUnavailable, reportChartUnavailable } from './ChartUnavailable';
import { CHART_ECHARTS_GEOMETRY, CHART_HEIGHTS, chartAxisTextStyle, chartMarkFontSize } from './chartMarks';

echarts.use([LineChart, BarChart, BoxplotChart, CustomChart, PieChart, ScatterChart, GraphicComponent, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, ToolboxComponent, MarkAreaComponent, MarkLineComponent, LabelLayout, CanvasRenderer]);

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

/** A plain record from any realm (an iframe's object literal too); class instances and opaque payloads stay out of the walk. */
function isOptionObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

type AxisKey = 'xAxis' | 'yAxis';
const AXIS_KEYS: readonly AxisKey[] = ['xAxis', 'yAxis'];
const axisList = (axis: unknown): unknown[] => (axis === undefined ? [] : Array.isArray(axis) ? axis : [axis]);

/** Mirrors variant A's option walk, leaving point payloads and explicit axis typography in the consumer's hands. */
function applyChartTypography(option: EChartsCoreOption, element: Element): EChartsCoreOption {
  const markSize = chartMarkFontSize(element);
  const axisText = chartAxisTextStyle(element);
  function floorLabels(value: unknown, insideMark: boolean): unknown {
    if (Array.isArray(value)) return value.map(entry => floorLabels(entry, insideMark));
    if (!isOptionObject(value)) return value;
    const next = { ...value };
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'data' && !insideMark) || key === 'axisLabel' || key === 'nameTextStyle') continue;
      const mark = insideMark || key === 'markLine' || key === 'markArea' || key === 'markPoint';
      next[key] = floorLabels(entry, mark);
    }
    const size = value.fontSize;
    if (typeof size === 'number' && size > 0 && size < markSize) next.fontSize = markSize;
    return next;
  }
  const next = floorLabels(option, false) as EChartsCoreOption;
  const styleAxis = (axis: unknown) => (isOptionObject(axis) ? { ...axis, ...axisTypography(axis, axisText) } : axis);
  // Responsive and timeline overrides merge over this base, so their explicit styles still win. The base is copied
  // before its axes are written: a class-backed or frozen consumer base passes the walk by reference.
  const base: Record<string, unknown> = next.baseOption === undefined ? next : (next.baseOption = { ...(next.baseOption as object) });
  for (const key of AXIS_KEYS) {
    const axis = base[key];
    if (axis !== undefined) base[key] = Array.isArray(axis) ? axis.map(styleAxis) : styleAxis(axis);
  }
  // An axis a media branch adds has no base entry to inherit from, so it takes the defaults itself. Branch patches
  // to existing axes stay sparse, so they keep inheriting the base's explicit styles.
  if (Array.isArray(next.media)) {
    next.media = next.media.map(entry => {
      if (!isOptionObject(entry) || !isOptionObject(entry.option)) return entry;
      const branch: Record<string, unknown> = { ...entry.option };
      for (const key of AXIS_KEYS) {
        if (branch[key] === undefined) continue;
        const known = axisList(base[key]);
        const ids = new Set(known.map(axis => (isOptionObject(axis) ? axis.id : undefined)).filter(id => id !== undefined));
        const styleAdded = (axis: unknown, index: number) => {
          if (!isOptionObject(axis)) return axis;
          const added = axis.id !== undefined ? !ids.has(axis.id) : index >= known.length;
          return added ? styleAxis(axis) : axis;
        };
        branch[key] = Array.isArray(branch[key]) ? (branch[key] as unknown[]).map(styleAdded) : styleAdded(branch[key], 0);
      }
      return { ...entry, option: branch };
    });
  }
  return next;
}

/** The axis text defaults with the consumer's explicit values over them. */
function axisTypography(axis: Record<string, unknown>, axisText: Record<string, unknown>) {
  return {
    axisLabel: { ...axisText, ...(isOptionObject(axis.axisLabel) ? axis.axisLabel : {}) },
    nameTextStyle: { ...axisText, ...(isOptionObject(axis.nameTextStyle) ? axis.nameTextStyle : {}) },
  };
}

/** A theme-only redraw sends just the base axes' typography, merged by index. Replaying the whole option would reapply
 * declared zoom ranges (root, baseOption or an active media branch) over the range the user settled on. */
function themeTypographyPatch(resolved: EChartsCoreOption): EChartsCoreOption {
  const base = (isOptionObject(resolved.baseOption) ? resolved.baseOption : resolved) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of AXIS_KEYS) {
    if (base[key] === undefined) continue;
    patch[key] = axisList(base[key]).map(axis => (isOptionObject(axis) ? { ...(axis.id !== undefined && { id: axis.id }), axisLabel: axis.axisLabel, nameTextStyle: axis.nameTextStyle } : {}));
  }
  return patch;
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
export default function EChartImpl({ option, height = CHART_HEIGHTS.regular, onEvents, onReady, onResize, ariaLabel, className }: EChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const applied = useRef<{ source: EChartsCoreOption; resolved: EChartsCoreOption } | null>(null);
  const themeRevision = useThemeRevision();
  /** Set by the mount effect: releases everything a chart that failed its first draw still holds (observer, engine, zrender handler). */
  const releaseFailed = useRef<(() => void) | null>(null);
  const events = useRef(onEvents);
  events.current = onEvents;
  const inDeclaredPanel = useContext(DeclaredQueryPanelContext) !== null;
  const declaredHold = useRef(false);
  // Layout runs before the option effect, including the first commit, so the skip sees the panel on the first paint too.
  useLayoutEffect(() => { declaredHold.current = inDeclaredPanel; }, [inDeclaredPanel]);
  const resized = useRef(onResize);
  resized.current = onResize;
  // The engine cannot start where there is no canvas 2d context (jsdom): detected by the attempt, not by sniffing the environment (#1862).
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    let instance: ECharts;
    try {
      instance = echarts.init(el.current, CHART_ECHARTS_GEOMETRY, { renderer: 'canvas' });
    } catch (cause) {
      reportChartUnavailable(cause);
      setUnavailable(true);
      return;
    }
    chart.current = instance;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { instance.resize(); resized.current?.(instance.getWidth()); }) : null;
    observer?.observe(el.current);
    let failed = false;
    releaseFailed.current = () => {
      failed = true;
      observer?.disconnect();
      const zr = instance.getZr?.();
      // Disposing an engine whose canvas context was never acquired throws inside zrender, after it has stopped its loop but before
      // it removes the DOM listeners of its handler: remove those here so nothing stays registered on the detached node.
      try { instance.dispose(); } catch { try { zr?.handler?.dispose(); } catch { /* the engine is already unusable */ } }
    };
    onReady?.(instance);
    return () => {
      releaseFailed.current = null;
      if (!failed) {
        observer?.disconnect();
        if (!instance.isDisposed?.()) instance.dispose();
      }
      chart.current = null; applied.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the effect owns mount/unmount only; onReady is read once at mount
  }, []);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !el.current) return;
    const merged = applyChartTypography({ textStyle: baseTextStyle, animationDuration: 120, useUTC: true, ...option }, el.current);
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
    const previous = applied.current;
    if (previous !== null && previous.source === option) {
      // Theme-only redraw: the consumer option is unchanged, so only the token-backed axis typography can differ.
      instance.setOption(themeTypographyPatch(next), { notMerge: false, silent: true });
      applied.current = { source: option, resolved: next };
      return;
    }
    // Equal drawing inside a declared panel: do not replay the option over the zoom the user settled on.
    if (declaredHold.current && previous !== null && sameDrawing(previous.resolved, next)) {
      applied.current = { source: option, resolved: next };
      return;
    }
    const mode = setOptionMode(previous?.resolved ?? null, next);
    // replaceMerge still merges a component whose id matches (every series has one), so a key the next option leaves out would
    // survive (a value label turned off kept drawing). Empty the series first; axes, brush and toolbox carry no id and are rebuilt.
    if ('replaceMerge' in mode) instance.setOption({ series: [] }, { replaceMerge: ['series'], silent: true, lazyUpdate: true });
    if (applied.current === null) {
      // The first draw is where zrender acquires the canvas 2d context (init alone does not touch it): a null context throws here.
      // Only this first draw is caught; a later render error propagates as before.
      try {
        instance.setOption(next, mode);
      } catch (cause) {
        reportChartUnavailable(cause);
        // Release now: zrender stops its animation loop first, so the half-built layer is never painted on the next frame.
        chart.current = null;
        releaseFailed.current?.();
        setUnavailable(true);
        return;
      }
    } else instance.setOption(next, mode);
    applied.current = { source: option, resolved: next };
  }, [option, themeRevision]);

  // Handlers are read through `events` at call time; only a changed set of event names rebinds.
  const eventNames = onEvents ? Object.keys(onEvents).join(',') : '';
  useEffect(() => {
    const instance = chart.current;
    if (!instance || !eventNames) return;
    const names = eventNames.split(',');
    for (const name of names) instance.on(name, (p: unknown) => events.current?.[name]?.(p, instance));
    return () => { for (const name of names) instance.off(name); };
  }, [eventNames]);

  if (unavailable) return <ChartUnavailable height={height} className={className} />;
  // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
  return <div ref={el} role="img" aria-label={ariaLabel} className={cn(className, 'w-full')} style={{ height }} />;
}
