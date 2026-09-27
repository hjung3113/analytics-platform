import { Component, Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react';
import { RotateCw, ServerCrash } from 'lucide-react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { useI18n } from '@ap/kernel';
import { Button, Skeleton } from '@ap/ui';
import { StateMessage } from './StateView';

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

/** Contains a rejected EChartImpl chunk load inside the chart box so it never unmounts the surrounding app (#48 P2). */
class ChunkLoadBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function EChart({ option, height = 280, onEvents, onReady, ariaLabel, className }: EChartProps) {
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // A new lazy component per attempt re-runs the rejected chunk import on retry.
  const EChartImpl = useMemo(() => lazy(() => import('./EChartImpl')), [attempt]);
  const retry = useCallback(() => { setFailed(false); setAttempt(a => a + 1); }, []);
  if (failed) {
    // Same box as the plot (height · width: 100% · className) so the layout does not shift.
    return <div className={className} style={{ height, width: '100%' }}>
      <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('stateError')}
        action={<Button size="sm" variant="secondary" onClick={retry}><RotateCw className="size-3.5" aria-hidden />{t('retry')}</Button>} />
    </div>;
  }
  return (
    <ChunkLoadBoundary key={attempt} onError={() => setFailed(true)}>
      <Suspense fallback={
        <div role="status" aria-busy className={className} style={{ height, width: '100%' }}>
          <Skeleton className="h-full w-full" />
        </div>
      }>
        {/* ECharts is code-split (#48): the echarts-dependent implementation lives in EChartImpl and loads on first chart mount. */}
        <EChartImpl option={option} height={height} onEvents={onEvents} onReady={onReady} ariaLabel={ariaLabel} className={className} />
      </Suspense>
    </ChunkLoadBoundary>
  );
}
