import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, ECharts } from 'echarts/core';

echarts.use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, ToolboxComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer]);

/** Palette contract consumed by charts (DESIGN.md colors). Read from CSS variables so tokens stay single-sourced. */
export function token(name: string): string {
  if (typeof window === 'undefined') return '#000';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return raw ? `rgb(${raw.split(/\s+/).join(',')})` : '#000';
}

export const baseTextStyle = { fontFamily: 'Inter Variable, Inter, Noto Sans KR, system-ui, sans-serif', fontSize: 11, color: '#6b7280' };

export function EChart({ option, height = 280, onEvents, onReady, ariaLabel, className }: {
  option: EChartsCoreOption; height?: number; ariaLabel: string; className?: string;
  onEvents?: Record<string, (params: any, chart: ECharts) => void>;
  onReady?: (chart: ECharts) => void;
}) {
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
    instance.setOption({ textStyle: baseTextStyle, animationDuration: 120, useUTC: true, ...option }, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onEvents) return;
    const names = Object.keys(onEvents);
    for (const name of names) instance.on(name, (p: unknown) => events.current?.[name]?.(p, instance));
    return () => { for (const name of names) instance.off(name); };
  }, [onEvents ? Object.keys(onEvents).join(',') : '']);

  return <div ref={el} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%' }} />;
}
