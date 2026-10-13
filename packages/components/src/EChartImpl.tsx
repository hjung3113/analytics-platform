import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { cn, prefersReducedMotion } from '@ap/ui';
import { baseTextStyle, type EChartProps } from './EChart';

echarts.use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, ToolboxComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

/** ECharts-dependent implementation, loaded lazily from EChart (#48) so charts stay out of the main bundle. */
export default function EChartImpl({ option, height = 280, onEvents, onReady, ariaLabel, className }: EChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const events = useRef(onEvents);
  events.current = onEvents;

  useEffect(() => {
    if (!el.current) return;
    const instance = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
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
    // (echarts 6.1 Series.js), so both are forced off. With motion allowed the consumer settings pass through.
    if (prefersReducedMotion()) {
      merged.animation = false;
      if (Array.isArray(merged.series)) merged.series = merged.series.map((series: { animation?: boolean }) => ({ ...series, animation: false }));
    }
    instance.setOption(merged, { notMerge: true });
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
