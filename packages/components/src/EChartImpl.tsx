import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { cn, prefersReducedMotion } from '@ap/ui';
import { baseTextStyle, type EChartProps } from './EChart';

echarts.use([LineChart, BarChart, BoxplotChart, PieChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, ToolboxComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

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

/** ECharts-dependent implementation, loaded lazily from EChart (#48) so charts stay out of the main bundle. */
export default function EChartImpl({ option, height = 280, onEvents, onReady, onResize, ariaLabel, className }: EChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
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
    return () => { observer?.disconnect(); instance.dispose(); chart.current = null; };
    // Deps intentionally empty: effect owns mount/unmount only (would trip react-hooks/exhaustive-deps if that rule is enabled).
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
    if (prefersReducedMotion()) {
      const forced = animationOff(merged);
      if (forced.baseOption !== undefined) forced.baseOption = animationOff(forced.baseOption);
      if (forced.media !== undefined) forced.media = forced.media.map(entry => (entry.option ? { ...entry, option: animationOff(entry.option) } : entry));
      instance.setOption(forced, { notMerge: true });
    } else {
      instance.setOption(merged, { notMerge: true });
    }
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onEvents) return;
    const names = Object.keys(onEvents);
    for (const name of names) instance.on(name, (p: unknown) => events.current?.[name]?.(p, instance));
    return () => { for (const name of names) instance.off(name); };
  }, [onEvents ? Object.keys(onEvents).join(',') : '']);

  // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
  return <div ref={el} role="img" aria-label={ariaLabel} className={cn(className, 'w-full')} style={{ height }} />;
}
