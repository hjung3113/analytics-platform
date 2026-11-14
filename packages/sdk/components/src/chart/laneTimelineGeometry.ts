import { formatText, type Lang } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { TimelineLane, TimelineSegment } from './LaneTimeline';
import type { LaneItem, LaneModel } from './laneTimelineModel';

// The column-array model and its time index live in laneTimelineModel.ts; this file keeps the import path stable.
export { GUTTER, ROW_HEIGHT, HEADER_HEIGHT, laneDiagnostic, prepareLanes, visibleRects, fillVisibleRects, segmentRect, laneGeometry, visibleLanes, hitTest, RectBuffer, laneWindow, FLAG_ORPHAN, FLAG_OPEN, FLAG_NEUTRAL } from './laneTimelineModel';
export type { LaneItem, LaneModel, LaneRect, LaneColumns, LaneIndex } from './laneTimelineModel';
export function utcTick(time: number) { return new Date(time).toISOString().slice(0, 19).replace('T', ' '); }
/** `depth` is the normalised depth from the model columns; omitted, the segment's own depth is used. */
export function segmentSummary(segment: TimelineSegment, lang: Lang, depth: number = segment.depth ?? 0) {
  const parts = [
    `${utcTick(segment.start)} – ${utcTick(segment.end)}`,
    formatText(COMPONENTS_MESSAGES.laneSegmentSummaryDepth, lang, { depth }),
    ...(segment.rank ? [segment.rank] : []),
    ...(segment.startBoundary === 'orphan' ? [formatText(COMPONENTS_MESSAGES.laneStartUnknown, lang)] : []),
    ...(segment.endBoundary === 'open' ? [formatText(COMPONENTS_MESSAGES.laneEndUnknown, lang)] : []),
  ];
  return parts.join(' · ');
}
export function segmentText(
  model: LaneModel,
  item: LaneItem,
  formatTooltip: ((segment: TimelineSegment, lane: TimelineLane) => string) | undefined,
  lang: 'ko' | 'en',
) {
  const lane = model.lanes[item.laneIndex];
  const formatted = formatTooltip?.(item.segment, lane);
  return `${lane.label} · ${formatted ? `${formatted} · ` : ''}${segmentSummary(item.segment, lang, model.cols[item.laneIndex].depth[item.index - model.offsets[item.laneIndex]])}`;
}
const MINUTE = 60_000; const HOUR = 3_600_000; const DAY = 86_400_000;
// Calendar steps only: epoch ms aligns with UTC minute/hour/midnight boundaries, so every tick lands on a wall-clock unit.
const UNIT_STEPS: Record<number, number[]> = { [MINUTE]: [1, 2, 5, 10, 15, 30], [HOUR]: [1, 2, 3, 6, 12], [DAY]: [1, 2, 5, 10] };
export function niceTicks(view: [number, number], width: number): number[] {
  const desired = (view[1] - view[0]) / Math.max(1, Math.floor(width / 160));
  // Each unit's threshold is its largest step, so `desired` always fits a step of its unit; beyond 10 days the day unit
  // continues with 1·2·5×10ⁿ days (SHE-39/#2063: the old 1h/1d thresholds left gaps that fell to a 10× fallback —
  // 5h between 30min and 1h, 5 days between 12h and 1d, 100 days beyond 10 days — and a whole span drew one tick).
  const unit = desired <= 30 * MINUTE ? MINUTE : desired <= 12 * HOUR ? HOUR : DAY;
  let step =
    unit === DAY
      ? // Calendar day steps: 1, 2, 5, 10, 20, 50, … days.
        ((() => { const days = desired / DAY; const base = 10 ** Math.floor(Math.log10(days)); return ([1, 2, 5].map(m => m * base).find(n => n >= days) ?? 10 * base) * DAY; })())
      : UNIT_STEPS[unit].map(n => n * unit).find(n => n >= desired)!;
  // A rounded step larger than the view can put the next aligned tick beyond its end.
  // Use the largest preceding calendar step that fits, preserving aligned (not endpoint) ticks.
  const span = view[1] - view[0];
  if (step > span && span >= MINUTE) {
    const preceding = [...UNIT_STEPS[MINUTE].map(n => n * MINUTE), ...UNIT_STEPS[HOUR].map(n => n * HOUR)];
    for (let base = DAY; base <= span; base *= 10) preceding.push(base, 2 * base, 5 * base);
    step = preceding.filter(n => n <= span).at(-1)!;
  }
  const ticks: number[] = [];
  for (let t = Math.ceil(view[0] / step) * step; t <= view[1] && ticks.length < 100; t += step) ticks.push(t);
  return ticks;
}
/** Axis text is time-only; the date appears once at the first tick and at each 00:00 UTC boundary. */
export function laneTickLabel(time: number, first: boolean) {
  const date = new Date(time);
  const clock = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  const withDate = first || time % DAY === 0;
  return withDate ? `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${clock}` : clock;
}
function lowerBound(values: number[], value: number) {
  let lo = 0; let hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < value) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Input sorted once at the data boundary; each bin uses binary search on that cache. */
export function densityBins(sorted: number[], view: [number, number], count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const from = view[0] + (view[1] - view[0]) * i / count;
    const to = view[0] + (view[1] - view[0]) * (i + 1) / count;
    return (i === count - 1 ? lowerBound(sorted, to + Math.max(Number.EPSILON, Math.abs(to) * Number.EPSILON)) : lowerBound(sorted, to)) - lowerBound(sorted, from);
  });
}
export function clampView(next: [number, number], domain: [number, number]): [number, number] {
  const span = Math.max(Math.min(1, domain[1] - domain[0]), Math.min(domain[1] - domain[0], next[1] - next[0]));
  const start = Math.max(domain[0], Math.min(domain[1] - span, next[0]));
  return [start, start + span];
}
export function outlineStyle(rank: string | undefined, widths: Record<string, number> | undefined, mode: 'strong' | 'weak' | 'off') {
  const width = rank === undefined ? 0 : widths?.[rank] ?? 0;
  const valid = Number.isFinite(width) && width >= 0 ? width : 0;
  return { width: mode === 'off' ? 0 : mode === 'weak' ? valid / 2 : valid, alpha: mode === 'weak' ? 0.5 : 1, dash: mode === 'weak' ? [3, 2] : [] };
}
