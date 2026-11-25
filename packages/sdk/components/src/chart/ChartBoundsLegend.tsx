import { cn } from '@ap/ui';
import { ChartLegendLabel } from './analysisChartFrameParts';
import { BOUND_DASH, BOUND_OPACITY, type BoundProjection } from './chartBounds';
import { chartTheme } from './EChart';

export function ChartBoundsLegend({ bounds, singleLine = false }: { bounds: BoundProjection | undefined; singleLine?: boolean }) {
  if (!bounds) return null;
  const color = chartTheme().referenceLine.lineStyle.color;
  return bounds.parts.map(part => <span key={part} className={cn('inline-flex items-center gap-1 text-xs text-text-secondary', singleLine && 'min-w-0 max-w-full')} data-chart-bound-legend={part}>
    <svg aria-hidden width="16" height="16" className={singleLine ? 'shrink-0' : undefined}>{part === 'band' ? <rect x="2" y="3" width="12" height="10" fill={color} opacity={BOUND_OPACITY} /> : <path d="M1 8 H15" stroke={color} strokeWidth="1" strokeDasharray={BOUND_DASH[part].join(' ')} />}</svg>
    {singleLine ? <ChartLegendLabel name={bounds.labels[part]} /> : bounds.labels[part]}
  </span>);
}
