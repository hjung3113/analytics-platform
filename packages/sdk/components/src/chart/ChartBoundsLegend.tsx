import { BOUND_DASH, BOUND_OPACITY, type BoundProjection } from './chartBounds';
import { chartTheme } from './EChart';

export function ChartBoundsLegend({ bounds }: { bounds: BoundProjection | undefined }) {
  if (!bounds) return null;
  const color = chartTheme().referenceLine.lineStyle.color;
  return bounds.parts.map(part => <span key={part} className="inline-flex items-center gap-1 text-xs text-text-secondary" data-chart-bound-legend={part}>
    <svg aria-hidden width="16" height="16">{part === 'band' ? <rect x="2" y="3" width="12" height="10" fill={color} opacity={BOUND_OPACITY} /> : <path d="M1 8 H15" stroke={color} strokeWidth="1" strokeDasharray={BOUND_DASH[part].join(' ')} />}</svg>{bounds.labels[part]}
  </span>);
}
