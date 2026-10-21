import type { TimelineLane, TimelineSegment } from './LaneTimeline';
import { isThemeColorToken } from '@ap/ui/theme';

export const GUTTER = 112;
export const ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 40;
export type LaneItem = { segment: TimelineSegment; laneIndex: number; index: number };
export type LaneModel = { lanes: TimelineLane[]; flat: LaneItem[]; byId: Map<string, LaneItem>; domain: [number, number]; density: number[] };
export type LaneRect = LaneItem & { x: number; y: number; width: number; height: number };
export function laneDiagnostic(message: string) { if (process.env.NODE_ENV !== 'production') console.error(`LaneTimeline: ${message}`); }
export function prepareLanes(input: TimelineLane[], instants: number[]): LaneModel {
  const ids = new Set<string>(); const laneIds = new Set<string>();
  let min = Infinity; let max = -Infinity;
  const lanes = input.filter(lane => {
    if (laneIds.has(lane.id)) { laneDiagnostic('duplicate lane ID dropped'); return false; }
    laneIds.add(lane.id); return true;
  }).map(lane => ({ ...lane, segments: lane.segments.flatMap(segment => {
    if (ids.has(segment.id) || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start > segment.end || Math.abs(segment.start) > 8.64e15 || Math.abs(segment.end) > 8.64e15) {
      laneDiagnostic('invalid range or duplicate segment ID dropped'); return [];
    }
    ids.add(segment.id); min = Math.min(min, segment.start); max = Math.max(max, segment.end);
    const depth = segment.depth ?? 0;
    if (!Number.isInteger(depth) || depth < 0) laneDiagnostic('invalid depth; using zero');
    if (segment.colorToken !== undefined && !(typeof segment.colorToken === 'string' && isThemeColorToken(segment.colorToken))) laneDiagnostic('invalid segment color; using palette');
    return [{ ...segment, depth: Number.isInteger(depth) && depth >= 0 ? depth : 0, colorToken: (typeof segment.colorToken === 'string' && isThemeColorToken(segment.colorToken)) ? segment.colorToken : undefined }];
  }) }));
  const flat = lanes.flatMap((lane, laneIndex) => lane.segments.map(segment => ({ segment, laneIndex, index: 0 })));
  flat.forEach((item, index) => { item.index = index; });
  return { lanes, flat, byId: new Map(flat.map(item => [item.segment.id, item])), domain: min === Infinity ? [0, 1] : min === max ? [Math.max(-8.64e15, min - 1), Math.min(8.64e15, max + 1)] : [min, max], density: instants.filter(Number.isFinite).sort((a, b) => a - b) };
}
export function utcTick(time: number) { return new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC'); }
export function segmentSummary(segment: TimelineSegment) {
  return `${segment.id} · ${utcTick(segment.start)} – ${utcTick(segment.end)} · depth ${segment.depth ?? 0}${segment.rank ? ` · ${segment.rank}` : ''}${segment.startBoundary === 'orphan' ? ' · orphan' : ''}${segment.endBoundary === 'open' ? ' · open' : ''}`;
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
export function visibleRects(model: LaneModel, view: [number, number], width: number, height: number, scroll: number): LaneRect[] {
  const first = Math.max(0, Math.floor(scroll / ROW_HEIGHT));
  const last = Math.min(model.lanes.length, Math.ceil((scroll + height) / ROW_HEIGHT));
  const plotWidth = Math.max(1, width - GUTTER);
  const rects: LaneRect[] = [];
  for (let laneIndex = first; laneIndex < last; laneIndex++) {
    for (const segment of model.lanes[laneIndex].segments) {
      if (segment.end < view[0] || segment.start > view[1]) continue;
      const inset = Math.min((segment.depth ?? 0) * 2, 11);
      const x = GUTTER + Math.max(0, (segment.start - view[0]) / (view[1] - view[0]) * plotWidth);
      const endX = GUTTER + Math.min(plotWidth, (segment.end - view[0]) / (view[1] - view[0]) * plotWidth);
      rects.push({ ...model.byId.get(segment.id)!, x: Math.min(x, width - 1.5), y: laneIndex * ROW_HEIGHT - scroll + inset, width: Math.max(1.5, endX - x), height: ROW_HEIGHT - inset * 2 });
    }
  }
  // Painter order and hit order agree, with last input breaking depth ties.
  return rects.sort((a, b) => (a.segment.depth ?? 0) - (b.segment.depth ?? 0) || a.index - b.index);
}
export function hitTest(rects: LaneRect[], x: number, y: number): LaneRect | undefined {
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i];
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return rect;
  }
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
