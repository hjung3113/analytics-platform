import { Suspense, lazy } from 'react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { Skeleton } from '@ap/ui';

/** Palette contract consumed by charts (DESIGN.md colors). Read from CSS variables so tokens stay single-sourced. */
export function token(name: string): string {
  if (typeof window === 'undefined') return '#000';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return raw ? `rgb(${raw.split(/\s+/).join(',')})` : '#000';
}

export const baseTextStyle = { fontFamily: 'Inter Variable, Inter, Noto Sans KR, system-ui, sans-serif', fontSize: 11, color: '#6b7280' };

export type EChartProps = {
  option: EChartsCoreOption; height?: number; ariaLabel: string; className?: string;
  onEvents?: Record<string, (params: any, chart: ECharts) => void>;
  onReady?: (chart: ECharts) => void;
};

// ECharts is code-split (#48): the echarts-dependent implementation lives in EChartImpl and loads on first chart mount.
const EChartImpl = lazy(() => import('./EChartImpl'));

export function EChart({ option, height = 280, onEvents, onReady, ariaLabel, className }: EChartProps) {
  return (
    <Suspense fallback={
      <div role="status" aria-busy className={className} style={{ height, width: '100%' }}>
        <Skeleton className="h-full w-full" />
      </div>
    }>
      <EChartImpl option={option} height={height} onEvents={onEvents} onReady={onReady} ariaLabel={ariaLabel} className={className} />
    </Suspense>
  );
}
