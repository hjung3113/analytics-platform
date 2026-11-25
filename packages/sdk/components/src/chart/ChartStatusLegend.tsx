import { cn } from '@ap/ui';
import { ChartLegendLabel } from './analysisChartFrameParts';
import type { ChartStatus } from './chartStatus';
import { statusColor, statusGlyph, statusKey } from './chartStatus';

export function ChartStatusLegend({ statuses, singleLine = false }: { statuses: readonly ChartStatus[]; singleLine?: boolean }) {
  return statuses.map(status => <span key={statusKey(status)} className={cn('inline-flex items-center gap-1 text-xs text-text-secondary', singleLine && 'min-w-0 max-w-full')} data-chart-status-legend>
    <svg aria-hidden width="16" height="16" className={singleLine ? 'shrink-0' : undefined}><text x="2" y="12" fill={statusColor(status)} fontSize="12">{statusGlyph(status)}</text></svg>
    {singleLine ? <ChartLegendLabel name={status.label} /> : status.label}
  </span>);
}
