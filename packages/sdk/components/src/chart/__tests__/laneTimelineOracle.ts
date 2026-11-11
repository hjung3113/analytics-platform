// Test-only oracle: the pre-#1746 geometry (origin/main laneTimelineGeometry.ts) as a per-segment model, linear scan and reverse linear
// hit test. Domain, paint and hit arithmetic are copied from it; diagnostics and density are omitted, and its constants are frozen here.
import { isThemeColorToken } from '@ap/ui/theme';
const GUTTER = 112;
const ROW_HEIGHT = 24;
import type { TimelineLane, TimelineSegment } from '../LaneTimeline';

export type OldItem = { segment: TimelineSegment; laneIndex: number; index: number };
export type OldModel = { lanes: TimelineLane[]; flat: OldItem[]; byId: Map<string, OldItem>; domain: [number, number] };
export type OldRect = OldItem & { x: number; y: number; width: number; height: number };
export function oldPrepareLanes(input: TimelineLane[]): OldModel {
  const ids = new Set<string>(); const laneIds = new Set<string>();
  let min = Infinity; let max = -Infinity;
  const lanes = input.filter(lane => {
    if (laneIds.has(lane.id)) return false;
    laneIds.add(lane.id); return true;
  }).map(lane => ({ ...lane, segments: lane.segments.flatMap(segment => {
    if (ids.has(segment.id) || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start > segment.end || Math.abs(segment.start) > 8.64e15 || Math.abs(segment.end) > 8.64e15) return [];
    ids.add(segment.id); min = Math.min(min, segment.start); max = Math.max(max, segment.end);
    const depth = segment.depth ?? 0;
    return [{ ...segment, depth: Number.isInteger(depth) && depth >= 0 ? depth : 0, colorToken: (typeof segment.colorToken === 'string' && isThemeColorToken(segment.colorToken)) ? segment.colorToken : undefined }];
  }) }));
  const flat = lanes.flatMap((lane, laneIndex) => lane.segments.map(segment => ({ segment, laneIndex, index: 0 })));
  flat.forEach((item, index) => { item.index = index; });
  return { lanes, flat, byId: new Map(flat.map(item => [item.segment.id, item])), domain: min === Infinity ? [0, 1] : min === max ? [Math.max(-8.64e15, min - 1), Math.min(8.64e15, max + 1)] : [min, max] };
}
export function oldVisibleRects(model: OldModel, view: [number, number], width: number, height: number, scroll: number): OldRect[] {
  const first = Math.max(0, Math.floor(scroll / ROW_HEIGHT));
  const last = Math.min(model.lanes.length, Math.ceil((scroll + height) / ROW_HEIGHT));
  const plotWidth = Math.max(1, width - GUTTER);
  const rects: OldRect[] = [];
  for (let laneIndex = first; laneIndex < last; laneIndex++) {
    for (const segment of model.lanes[laneIndex].segments) {
      if (segment.end < view[0] || segment.start > view[1]) continue;
      const inset = Math.min((segment.depth ?? 0) * 2, 11);
      const x = GUTTER + Math.max(0, (segment.start - view[0]) / (view[1] - view[0]) * plotWidth);
      const endX = GUTTER + Math.min(plotWidth, (segment.end - view[0]) / (view[1] - view[0]) * plotWidth);
      rects.push({ ...model.byId.get(segment.id)!, x: Math.min(x, width - 1.5), y: laneIndex * ROW_HEIGHT - scroll + inset, width: Math.max(1.5, endX - x), height: ROW_HEIGHT - inset * 2 });
    }
  }
  return rects.sort((a, b) => (a.segment.depth ?? 0) - (b.segment.depth ?? 0) || a.index - b.index);
}
export function oldHitTest(rects: OldRect[], x: number, y: number): OldRect | undefined {
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i];
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return rect;
  }
}
/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function randomLanes(seed: number, laneCount: number, perLane: number, opts: { span?: number; longShare?: number; spanning?: boolean } = {}): TimelineLane[] {
  const random = rng(seed); const span = opts.span ?? 1000;
  return Array.from({ length: laneCount }, (_, l) => ({ id: `l${l}`, label: `L${l}`, segments: Array.from({ length: perLane }, (_, i) => {
    // Snap some starts to a coarse grid so segments share start times; some are zero-length.
    const start = random() < 0.3 ? Math.floor(random() * 20) * (span / 20) : random() * span;
    const kind = random();
    const length = kind < 0.1 ? 0 : opts.longShare && kind < 0.1 + opts.longShare ? span * (0.2 + random() * 0.5) : random() * span * 0.02;
    return { id: `s${l}-${i}`, start, end: start + length, depth: random() < 0.5 ? undefined : Math.floor(random() * 15) };
  }).concat(opts.spanning && l === 0 ? [{ id: 'spanning', start: -1, end: span + 1, depth: 0 }] : []) }));
}
