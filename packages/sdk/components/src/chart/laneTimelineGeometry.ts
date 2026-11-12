import type { TimelineLane, TimelineSegment } from './LaneTimeline';
import type { LaneItem, LaneModel } from './laneTimelineModel';

// The column-array model and its time index live in laneTimelineModel.ts; this file keeps the import path stable.
export { GUTTER, ROW_HEIGHT, HEADER_HEIGHT, laneDiagnostic, prepareLanes, visibleRects, fillVisibleRects, hitTest, RectBuffer, laneWindow, FLAG_ORPHAN, FLAG_OPEN, FLAG_NEUTRAL } from './laneTimelineModel';
export type { LaneItem, LaneModel, LaneRect, LaneColumns, LaneIndex } from './laneTimelineModel';
export function utcTick(time: number) { return new Date(time).toISOString().slice(0, 19).replace('T', ' '); }
/** `depth` is the normalised depth from the model columns; omitted, the segment's own depth is used. */
export function segmentSummary(segment: TimelineSegment, lang: 'ko' | 'en', depth: number = segment.depth ?? 0) {
  const ko = lang === 'ko';
  return `${utcTick(segment.start)} – ${utcTick(segment.end)} · ${ko ? '깊이' : 'Depth'} ${depth}${segment.rank ? ` · ${segment.rank}` : ''}${segment.startBoundary === 'orphan' ? ` · ${ko ? '시작 미확인' : 'Start unknown'}` : ''}${segment.endBoundary === 'open' ? ` · ${ko ? '종료 미확인' : 'End unknown'}` : ''}`;
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
  const unit = desired <= HOUR ? MINUTE : desired <= DAY ? HOUR : DAY;
  const steps = UNIT_STEPS[unit];
  const step = steps.map(n => n * unit).find(n => n >= desired) ?? steps[steps.length - 1] * unit * 10;
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
