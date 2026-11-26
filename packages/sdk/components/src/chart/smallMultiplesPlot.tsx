import { memo } from 'react';
import { wallClockEpochMs } from '@ap/contracts';
import type { Lang } from '@ap/kernel';
import { chartDiagnostic } from './analysisChartData';
import { BOUND_DASH, boundLabelsOf, projectChartBounds, type BoundProjection, type ChartBoundLabels, type ChartBounds } from './chartBounds';
import { CHART_MARKS } from './chartMarks';
import { statusColorToken, statusGlyph, type ChartStatus } from './chartStatus';
import { CHART_BAND_OPACITY, strokeToken } from './EChart';

export type SmallMultiplesSeries = {
  id: string;
  label: string;
  /** x is wall-clock time. A null y leaves a gap. */
  points: readonly { x: string; y: number | null; status?: ChartStatus }[];
  bounds?: ChartBounds;
  selectionValue?: string;
};

const severity = { neutral: 0, warning: 1, danger: 2 } as const;
type Extent = { min: number; max: number };
const emptyExtent = (): Extent => ({ min: Infinity, max: -Infinity });
function include(extent: Extent, value: number) {
  extent.min = Math.min(extent.min, value);
  extent.max = Math.max(extent.max, value);
}
export function projectSmallMultiples(series: readonly SmallMultiplesSeries[], boundLabels: ChartBoundLabels | undefined, lang: Lang) {
  const x = emptyExtent(), y = emptyExtent();
  const parts = new Set<BoundProjection['parts'][number]>();
  const tiles = series.map(s => {
    const tileY = emptyExtent();
    let worst: ChartStatus | undefined;
    let hasValues = false;
    const points = s.points.flatMap(point => {
      const time = wallClockEpochMs(point.x);
      if (time === null) return [];
      include(x, time);
      const value = Number.isFinite(point.y) ? point.y : null;
      if (value !== null) {
        hasValues = true;
        include(tileY, value);
        if (point.status && (!worst || severity[point.status.tone] > severity[worst.tone])) worst = point.status;
      }
      return [{ at: point.x, time, value, status: point.status }];
    }).sort((a, b) => a.time - b.time);
    if (points.length < s.points.length) chartDiagnostic('invalid small multiple wall-clock point ignored');
    const bounds = projectChartBounds({ bounds: s.bounds, boundLabels, lang, horizontal: false, xType: 'time', categories: [], previousIds: new Set(),
      displayed: [{ id: s.id, name: s.label, color: 'chart-blue', points: points.map(p => [p.at, p.value]) }] });
    if (bounds?.extent) { include(tileY, bounds.extent.min); include(tileY, bounds.extent.max); }
    let independentY: Extent | undefined;
    if (Number.isFinite(tileY.min)) {
      include(y, tileY.min);
      include(y, tileY.max);
      // Adding positive zero normalizes signed zero so the range caption never shows −0.
      independentY = { min: Math.floor(tileY.min) + 0, max: Math.ceil(tileY.max) + 0 };
    }
    bounds?.parts.forEach(part => parts.add(part));
    return { ...s, points, bounds, worst, hasValues, independentY };
  });
  return { tiles, x, y, legend: { parts: [...parts], labels: boundLabelsOf(boundLabels, lang) } };
}

const VIEW = 100;
const INSET_X = 5;
const INSET_Y = 10;
const GUIDE_PATH = [25, 50, 75].map(y => `M${INSET_X} ${y}H${VIEW - INSET_X}`).join(' ');
const MARKER_SIZE = 10;
function position({ min, max }: Extent, value: number) {
  if (min === max) return 0.5;
  if (Number.isFinite(max - min)) return (value - min) / (max - min);
  return (value / 2 - min / 2) / (max / 2 - min / 2);
}
export const smallMultipleStatusPaint = (status: ChartStatus) => `rgb(var(--${statusColorToken(status)}))`;

export const SmallMultiplePlot = memo(function SmallMultiplePlot({ tile, x, y }: { tile: ReturnType<typeof projectSmallMultiples>['tiles'][number]; x: Extent; y: Extent }) {
  const px = (value: number) => INSET_X + (VIEW - 2 * INSET_X) * position(x, value);
  const py = (value: number) => VIEW - INSET_Y - (VIEW - 2 * INSET_Y) * position(y, value);
  let penDown = false;
  const line = tile.points.map(({ time, value }) => {
    if (value === null) { penDown = false; return ''; }
    const at = `${px(time)} ${py(value)}`;
    const command = penDown ? `L${at}` : `M${at}h0.01`;
    penDown = true;
    return command;
  }).join(' ');
  const paths = { lower: '', upper: '', band: '' };
  for (const { start, end, lower, upper } of tile.bounds?.segments ?? []) {
    const left = px(start), right = px(end);
    if (lower !== undefined) paths.lower += `M${left} ${py(lower)}H${right}`;
    if (upper !== undefined) paths.upper += `M${left} ${py(upper)}H${right}`;
    if (lower !== undefined && upper !== undefined) paths.band += `M${left} ${py(upper)}H${right}V${py(lower)}H${left}Z`;
  }
  return <svg aria-hidden="true" className="block min-h-6 w-full flex-1 overflow-visible text-text-secondary">
    <svg width="100%" height="100%" viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="none">
      <path d={GUIDE_PATH} className="stroke-chart-grid" fill="none" vectorEffect="non-scaling-stroke" />
      {paths.band && <path data-small-multiple-band d={paths.band} fill="currentColor" fillOpacity={CHART_BAND_OPACITY} />}
      {(['upper', 'lower'] as const).map(part => paths[part] && <path key={part} d={paths[part]} fill="none" stroke="currentColor"
        strokeDasharray={BOUND_DASH[part].join(' ')} vectorEffect="non-scaling-stroke" />)}
      {tile.hasValues && <path data-small-multiple-line d={line} fill="none" stroke={`rgb(var(--${strokeToken('chart-blue')}))`}
        strokeWidth={CHART_MARKS.lineWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
    {tile.points.map(({ time, value, status }, index) => status && value !== null && <svg key={index} x={`${px(time)}%`} y={`${py(value)}%`}
      width={MARKER_SIZE} height={MARKER_SIZE} className="overflow-visible">
      <text textAnchor="middle" dominantBaseline="central" fontSize={MARKER_SIZE} fill={smallMultipleStatusPaint(status)}
        className="stroke-surface-card" strokeWidth={2} paintOrder="stroke">{statusGlyph(status)}</text>
    </svg>)}
  </svg>;
});
