import { Suspense } from 'react';
import { RotateCw, ServerCrash } from 'lucide-react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { useI18n } from '@ap/kernel';
import { Button, Skeleton, cn } from '@ap/ui';
import { readColorToken, type ThemeColorToken } from '@ap/ui/theme';
import { StateMessage } from '../StateView';
import { ChunkLoadBoundary, lazyChunk, useLazyChunk } from '../lazyChunk';

/** Palette contract consumed by charts (DESIGN.md platform chart/category extensions). Read from CSS variables so tokens stay single-sourced. */
export function token(name: ThemeColorToken): string {
  return readColorToken(name);
}

/* eslint-disable shadcn/no-raw-colors -- CSS variable names for token(), not classes */
const chartThemeTokens = {
  axisLine: 'border-strong',
  splitLine: 'chart-grid',
  axisLabel: 'text-muted',
  tooltipBackground: 'surface-popover',
  tooltipBorder: 'border-subtle',
  tooltipText: 'text-primary',
  referenceText: 'text-secondary',
} as const satisfies Record<string, ThemeColorToken>;
/* eslint-enable shadcn/no-raw-colors */

const strokeAliases: Partial<Record<ThemeColorToken, ThemeColorToken>> = {
  'chart-blue': 'chart-blue-stroke',
  'chart-teal': 'chart-teal-stroke',
  'chart-purple': 'chart-purple-stroke',
  'chart-series-1': 'chart-series-1-stroke',
  'chart-series-2': 'chart-series-2-stroke',
  'chart-series-3': 'chart-series-3-stroke',
  'chart-series-4': 'chart-series-4-stroke',
  'cat-amber': 'cat-amber-stroke',
};

/** Resolve a chart series identity token to its thin-line counterpart when one exists. */
export function strokeToken(name: ThemeColorToken): ThemeColorToken {
  return strokeAliases[name] ?? name;
}

/** Shared ECharts role styles, resolved from the current CSS token source. */
export function chartTheme() {
  const referenceText = token(chartThemeTokens.referenceText);
  return {
    axisLine: { lineStyle: { color: token(chartThemeTokens.axisLine) } },
    splitLine: { lineStyle: { color: token(chartThemeTokens.splitLine) } },
    axisLabel: { color: token(chartThemeTokens.axisLabel) },
    tooltip: {
      backgroundColor: token(chartThemeTokens.tooltipBackground),
      borderColor: token(chartThemeTokens.tooltipBorder),
      textStyle: { color: token(chartThemeTokens.tooltipText) },
    },
    referenceLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: referenceText, type: 'dashed' },
      label: { formatter: '{b}', fontSize: 10, color: referenceText, position: 'insideEndTop' },
    },
  } as const;
}

export const baseTextStyle = {
  get fontFamily(): string {
    // Dynamic-subset glyphs may arrive after the first canvas draw; the fallback is acceptable then.
    return (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim())
      || "'Inter Variable', 'Pretendard Variable', system-ui, sans-serif";
  },
  fontSize: 11,
  // eslint-disable-next-line shadcn/no-raw-colors -- CSS variable name for token(), not a class
  get color(): string { return token('text-muted'); },
};

export type EChartProps = {
  option: EChartsCoreOption; height?: number; ariaLabel: string; className?: string;
  onEvents?: Record<string, (params: any, chart: ECharts) => void>;
  onReady?: (chart: ECharts) => void;
  /** The plot's width in px after its container resized (not called for the initial size; read it from the instance in onReady). */
  onResize?: (width: number) => void;
};

// One chunk component for every chart (#915): once the chunk has loaded, a newly mounted chart (a drill step that swaps the panel, a new
// pane) draws in its first commit. A lazy made per mount re-suspended each time and waited out React's fallback throttle (~400 ms a step).
const chartChunk = lazyChunk(() => import('./EChartImpl'));

export function EChart({ option, height = 280, onEvents, onReady, onResize, ariaLabel, className }: EChartProps) {
  const { t } = useI18n();
  const { Component: EChartImpl, failed, attempt, onError, retry } = useLazyChunk(chartChunk);
  if (failed) {
    // Same box as the plot (height · width: 100% · className) so the layout does not shift.
    // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
    return <div className={cn(className, 'w-full')} style={{ height }}>
      <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('stateError')}
        action={<Button size="sm" variant="secondary" onClick={retry}><RotateCw className="size-3.5" aria-hidden />{t('retry')}</Button>} />
    </div>;
  }
  return (
    <ChunkLoadBoundary key={attempt} onError={onError}>
      <Suspense fallback={
        // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
        <div role="status" aria-busy className={cn(className, 'w-full')} style={{ height }}>
          <Skeleton className="h-full w-full" />
        </div>
      }>
        {/* ECharts is code-split (#48): the echarts-dependent implementation lives in EChartImpl and loads on first chart mount. */}
        <EChartImpl option={option} height={height} onEvents={onEvents} onReady={onReady} onResize={onResize} ariaLabel={ariaLabel} className={className} />
      </Suspense>
    </ChunkLoadBoundary>
  );
}
