import type { ChartStatus } from './chartStatus';
import { STATUS_GLYPHS, statusColor, statusKey } from './chartStatus';

export function ChartStatusLegend({ statuses }: { statuses: readonly ChartStatus[] }) {
  return statuses.map(status => <span key={statusKey(status)} className="inline-flex items-center gap-1 text-xs text-text-secondary" data-chart-status-legend>
    <svg aria-hidden width="16" height="16"><text x="2" y="12" fill={statusColor(status)} fontSize="12">{STATUS_GLYPHS[status.tone]}</text></svg>{status.label}
  </span>);
}
