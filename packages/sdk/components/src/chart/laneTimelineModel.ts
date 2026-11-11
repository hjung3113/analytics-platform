import type { TimelineLane, TimelineSegment } from './LaneTimeline';
import { isThemeColorToken, type ThemeColorToken } from '@ap/ui/theme';

export const GUTTER = 112;
export const ROW_HEIGHT = 24;
export const HEADER_HEIGHT = 40;
export function laneDiagnostic(message: string) { if (process.env.NODE_ENV !== 'production') console.error(`LaneTimeline: ${message}`); }

/** Bits of `LaneColumns.flags`. */
export const FLAG_ORPHAN = 1;
export const FLAG_OPEN = 2;
export const FLAG_NEUTRAL = 4;
const MIN_WIDTH = 1.5;

/** Start-sorted order with a running-max-end array; segments longer than a bound sit in a side list. Built on first query. */
export type LaneIndex = { order: Uint32Array; blockMax: Float64Array; superMax: Float64Array; long: Uint32Array };
/** Narrowest unsigned integer array that holds the column's values (`Float64Array` beyond 2^32). */
export type IntColumn = Uint8Array | Uint16Array | Uint32Array | Float64Array;
/**
 * One lane as column arrays. `color` is 0 (none) or a 1-based index into `LaneModel.tokens` (never a resolved colour: the
 * palette is a render prop); `rank` is 0 (none) or a 1-based index into `LaneModel.ranks`. `segments` are the caller's objects.
 */
export type LaneColumns = {
  count: number; segments: TimelineSegment[];
  start: Float64Array; end: Float64Array; depth: IntColumn; color: IntColumn; flags: Uint8Array; rank: IntColumn;
  index?: LaneIndex;
};
export type LaneItem = { segment: TimelineSegment; laneIndex: number; index: number };
export type LaneRect = LaneItem & { x: number; y: number; width: number; height: number; offset: number };
export type LaneModel = {
  lanes: TimelineLane[]; cols: LaneColumns[];
  /** Per-lane prefix sums of segment counts; `offsets[lanes.length]` is the total. */
  offsets: number[];
  tokens: ThemeColorToken[]; ranks: string[]; maxDepth: number;
  /** Array-like: `length` and index access build `{ segment, laneIndex, index }` on demand. */
  flat: ReadonlyArray<LaneItem>;
  /** Lazy id lookup: the id map is built on the first `get`. */
  byId: { get(id: string): LaneItem | undefined };
  domain: [number, number]; density: number[];
};

function laneOfFlat(offsets: number[], flat: number) {
  let lo = 0; let hi = offsets.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (offsets[mid] <= flat) lo = mid; else hi = mid; }
  return lo;
}

function fit(wide: Float64Array, n: number, max: number): IntColumn {
  const Kind = max <= 255 ? Uint8Array : max <= 65535 ? Uint16Array : max <= 4294967295 ? Uint32Array : Float64Array;
  const out = new Kind(n); for (let i = 0; i < n; i++) out[i] = wide[i]; return out;
}

export function prepareLanes(input: TimelineLane[], instants: number[]): LaneModel {
  const ids = new Set<string>(); const laneIds = new Set<string>();
  const tokenIndex = new Map<string, number>(); const tokens: ThemeColorToken[] = [];
  const rankIndex = new Map<string, number>(); const ranks: string[] = [];
  let min = Infinity; let max = -Infinity; let maxDepth = 0;
  const lanes: TimelineLane[] = []; const cols: LaneColumns[] = []; const offsets: number[] = [0];
  // Duplicate lanes are reported before any segment is converted, as before.
  for (const lane of input) {
    if (laneIds.has(lane.id)) { laneDiagnostic('duplicate lane ID dropped'); continue; }
    laneIds.add(lane.id); lanes.push(lane);
  }
  for (const lane of lanes) {
    const src = lane.segments; const cap = src.length;
    const start = new Float64Array(cap); const end = new Float64Array(cap); const depthCol = new Float64Array(cap);
    const color = new Float64Array(cap); const flags = new Uint8Array(cap); const rankCol = new Float64Array(cap);
    const kept: TimelineSegment[] = new Array(cap);
    let n = 0; let laneDepth = 0;
    for (let i = 0; i < cap; i++) {
      const segment = src[i];
      if (ids.has(segment.id) || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start > segment.end || Math.abs(segment.start) > 8.64e15 || Math.abs(segment.end) > 8.64e15) {
        laneDiagnostic('invalid range or duplicate segment ID dropped'); continue;
      }
      ids.add(segment.id); if (segment.start < min) min = segment.start; if (segment.end > max) max = segment.end;
      const depth = segment.depth ?? 0;
      const depthOk = Number.isInteger(depth) && depth >= 0;
      if (!depthOk) laneDiagnostic('invalid depth; using zero');
      const token = segment.colorToken;
      const tokenOk = typeof token === 'string' && isThemeColorToken(token);
      if (token !== undefined && !tokenOk) laneDiagnostic('invalid segment color; using palette');
      const d = depthOk ? depth : 0; if (d > maxDepth) maxDepth = d; if (d > laneDepth) laneDepth = d;
      start[n] = segment.start; end[n] = segment.end; depthCol[n] = d;
      if (tokenOk) {
        let t = tokenIndex.get(token); if (t === undefined) { tokens.push(token); t = tokens.length; tokenIndex.set(token, t); }
        color[n] = t;
      }
      flags[n] = (segment.startBoundary === 'orphan' ? FLAG_ORPHAN : 0) | (segment.endBoundary === 'open' ? FLAG_OPEN : 0) | (segment.neutral ? FLAG_NEUTRAL : 0);
      if (typeof segment.rank === 'string') {
        let r = rankIndex.get(segment.rank); if (r === undefined) { ranks.push(segment.rank); r = ranks.length; rankIndex.set(segment.rank, r); }
        rankCol[n] = r;
      }
      kept[n] = segment; n++;
    }
    const whole = n === cap;
    cols.push({
      count: n, segments: whole ? src : kept.slice(0, n),
      start: whole ? start : start.slice(0, n), end: whole ? end : end.slice(0, n), flags: whole ? flags : flags.slice(0, n),
      depth: fit(depthCol, n, laneDepth), color: fit(color, n, tokens.length), rank: fit(rankCol, n, ranks.length),
    });
    offsets.push(offsets[offsets.length - 1] + n);
  }
  const total = offsets[offsets.length - 1];
  const item = (index: number): LaneItem => { const laneIndex = laneOfFlat(offsets, index); return { segment: cols[laneIndex].segments[index - offsets[laneIndex]], laneIndex, index }; };
  const flat = new Proxy([] as LaneItem[], {
    get(target, prop, receiver) {
      if (prop === 'length') return total;
      if (typeof prop === 'string' && prop.length > 0 && prop.charCodeAt(0) >= 48 && prop.charCodeAt(0) <= 57) {
        const i = Number(prop); return Number.isInteger(i) && i < total && String(i) === prop ? item(i) : undefined;
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === 'string' && prop.length > 0 && prop.charCodeAt(0) >= 48 && prop.charCodeAt(0) <= 57) { const i = Number(prop); return Number.isInteger(i) && i < total && String(i) === prop; }
      return Reflect.has(target, prop);
    },
  });
  // Open-addressing table of flat positions (Int32Array, 2 slots per segment): about a quarter of a Map<string, number>'s heap.
  let table: Int32Array | null = null; let mask = 0;
  const hash = (id: string) => { let h = 0x811c9dc5; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193); return h >>> 0; };
  const byId = { get(id: string) {
    if (!table) {
      let size = 4; while (size < total * 2) size <<= 1;
      mask = size - 1; table = new Int32Array(size).fill(-1);
      for (let l = 0; l < cols.length; l++) {
        const segs = cols[l].segments; const base = offsets[l];
        for (let i = 0; i < cols[l].count; i++) { let slot = hash(segs[i].id) & mask; while (table[slot] !== -1) slot = (slot + 1) & mask; table[slot] = base + i; }
      }
    }
    for (let slot = hash(id) & mask; table[slot] !== -1; slot = (slot + 1) & mask) {
      const found = item(table[slot]); if (found.segment.id === id) return found;
    }
    return undefined;
  } };
  return { lanes, cols, offsets, tokens, ranks, maxDepth, flat, byId, domain: min === Infinity ? [0, 1] : min === max ? [Math.max(-8.64e15, min - 1), Math.min(8.64e15, max + 1)] : [min, max], density: instants.filter(Number.isFinite).sort((a, b) => a - b) };
}

/** Segments longer than this many mean lengths leave the sorted index, so one domain-spanning segment cannot make every query linear. */
const LONG_FACTOR = 8;
/** Sorted entries per block, and blocks per super block: a query skips whole blocks whose latest end is before the window. */
const BLOCK = 64;
const SUPER = 64;
export function laneIndex(cols: LaneColumns): LaneIndex {
  if (cols.index) return cols.index;
  const { start, end, count } = cols;
  let sum = 0; for (let i = 0; i < count; i++) sum += end[i] - start[i];
  const bound = count ? LONG_FACTOR * sum / count : 0;
  let longCount = 0; for (let i = 0; i < count; i++) if (end[i] - start[i] > bound) longCount++;
  const order = new Uint32Array(count - longCount); const long = new Uint32Array(longCount);
  let o = 0; let l = 0; let sorted = true;
  for (let i = 0; i < count; i++) {
    if (end[i] - start[i] > bound) long[l++] = i;
    else { if (o > 0 && start[order[o - 1]] > start[i]) sorted = false; order[o++] = i; }
  }
  if (!sorted) order.sort((a, b) => start[a] - start[b] || a - b);
  // Block maxima make the skip independent of the length distribution: no single segment can pin the whole lane.
  const blockMax = new Float64Array(Math.ceil(order.length / BLOCK)).fill(-Infinity);
  const superMax = new Float64Array(Math.ceil(blockMax.length / SUPER)).fill(-Infinity);
  for (let i = 0; i < order.length; i++) { const b = (i / BLOCK) | 0; if (end[order[i]] > blockMax[b]) blockMax[b] = end[order[i]]; }
  for (let b = 0; b < blockMax.length; b++) { const s = (b / SUPER) | 0; if (blockMax[b] > superMax[s]) superMax[s] = blockMax[b]; }
  return (cols.index = { order, blockMax, superMax, long });
}
/** Appends the lane offsets of every segment with `end >= a && start <= b` to `out` in start order, then the long ones. `stats.scanned` counts examined entries, blocks and super blocks. */
export function laneWindow(cols: LaneColumns, a: number, b: number, out: number[], stats?: { scanned: number }) {
  if (!cols.count) return;
  const { order, blockMax, superMax, long } = laneIndex(cols);
  const { start, end } = cols;
  // First sorted position with start > b.
  let lo = 0; let hi = order.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (start[order[mid]] <= b) lo = mid + 1; else hi = mid; }
  const limit = lo; let scanned = 0;
  const blocks = Math.ceil(limit / BLOCK);
  for (let s = 0; s * SUPER < blocks; s++) {
    scanned++; if (superMax[s] < a) continue;
    const blockEnd = Math.min(blocks, (s + 1) * SUPER);
    for (let k = s * SUPER; k < blockEnd; k++) {
      scanned++; if (blockMax[k] < a) continue;
      const stop = Math.min(limit, (k + 1) * BLOCK);
      for (let i = k * BLOCK; i < stop; i++) { const off = order[i]; if (end[off] >= a) out.push(off); }
      scanned += stop - k * BLOCK;
    }
  }
  for (let i = 0; i < long.length; i++) { const off = long[i]; if (end[off] >= a && start[off] <= b) out.push(off); }
  if (stats) stats.scanned += scanned + long.length;
}

const G = { x: 0, y: 0, width: 0, height: 0 };
/** Painted geometry of one segment (same arithmetic as the old per-rect code). Writes into the shared scratch `G`. */
function geometry(cols: LaneColumns, o: number, laneIndexValue: number, view: [number, number], width: number, plotWidth: number, scroll: number): typeof G {
  const inset = Math.min(cols.depth[o] * 2, 11);
  const x = GUTTER + Math.max(0, (cols.start[o] - view[0]) / (view[1] - view[0]) * plotWidth);
  const endX = GUTTER + Math.min(plotWidth, (cols.end[o] - view[0]) / (view[1] - view[0]) * plotWidth);
  G.x = Math.min(x, width - MIN_WIDTH); G.y = laneIndexValue * ROW_HEIGHT - scroll + inset; G.width = Math.max(MIN_WIDTH, endX - x); G.height = ROW_HEIGHT - inset * 2;
  return G;
}
/** `geometry` for callers outside this file; the returned object is shared scratch, valid until the next call. */
export const laneGeometry = geometry;
export function visibleLanes(model: LaneModel, height: number, scroll: number) {
  return [Math.max(0, Math.floor(scroll / ROW_HEIGHT)), Math.min(model.lanes.length, Math.ceil((scroll + height) / ROW_HEIGHT))] as const;
}

/** Reusable rect storage in paint order (depth ascending, then input index). */
export class RectBuffer {
  count = 0; capacity = 0;
  flat = new Uint32Array(0); laneIndex = new Uint32Array(0); offset = new Uint32Array(0);
  x = new Float64Array(0); y = new Float64Array(0); width = new Float64Array(0); height = new Float64Array(0);
  ensure(n: number) {
    if (n <= this.capacity) return;
    const cap = Math.max(n, this.capacity * 2, 64); this.capacity = cap;
    this.flat = new Uint32Array(cap); this.laneIndex = new Uint32Array(cap); this.offset = new Uint32Array(cap);
    this.x = new Float64Array(cap); this.y = new Float64Array(cap); this.width = new Float64Array(cap); this.height = new Float64Array(cap);
  }
}
const TWO32 = 4294967296;
/** Fills `buf` with the visible rects in paint order and returns the count. Index-backed: no scan of segments outside the window. */
/** `skip[lane] === 1` leaves that lane out (the LOD painter handles it from its own window). */
export function fillVisibleRects(model: LaneModel, view: [number, number], width: number, height: number, scroll: number, buf: RectBuffer, stats?: { scanned: number }, skip?: Uint8Array): number {
  const [first, last] = visibleLanes(model, height, scroll);
  const plotWidth = Math.max(1, width - GUTTER);
  const found: number[] = []; const local: number[] = [];
  for (let laneIndexValue = first; laneIndexValue < last; laneIndexValue++) {
    if (skip?.[laneIndexValue]) continue;
    local.length = 0; laneWindow(model.cols[laneIndexValue], view[0], view[1], local, stats);
    const base = model.offsets[laneIndexValue];
    for (let i = 0; i < local.length; i++) found.push(base + local[i]);
  }
  const m = found.length;
  const depthOf = (flat: number) => { const l = laneOfFlat(model.offsets, flat); return model.cols[l].depth[flat - model.offsets[l]]; };
  let ordered: ArrayLike<number>;
  if (model.maxDepth < 1_048_576) {
    // depth * 2^32 + flat is an exact double below 2^53, so one native numeric sort gives (depth, input index) order.
    const keys = new Float64Array(m);
    for (let i = 0; i < m; i++) keys[i] = depthOf(found[i]) * TWO32 + found[i];
    keys.sort();
    for (let i = 0; i < m; i++) keys[i] = keys[i] % TWO32;
    ordered = keys;
  } else {
    found.sort((a, b) => depthOf(a) - depthOf(b) || a - b);
    ordered = found;
  }
  buf.ensure(m); buf.count = m;
  for (let i = 0; i < m; i++) {
    const flat = ordered[i]; const l = laneOfFlat(model.offsets, flat); const o = flat - model.offsets[l];
    geometry(model.cols[l], o, l, view, width, plotWidth, scroll);
    buf.flat[i] = flat; buf.laneIndex[i] = l; buf.offset[i] = o; buf.x[i] = G.x; buf.y[i] = G.y; buf.width[i] = G.width; buf.height[i] = G.height;
  }
  return m;
}
/** The painted rect of one segment (flat position) when it is in the visible lanes and the view window, else undefined. */
export function segmentRect(model: LaneModel, flat: number, view: [number, number], width: number, height: number, scroll: number): LaneRect | undefined {
  const laneIndexValue = laneOfFlat(model.offsets, flat); const o = flat - model.offsets[laneIndexValue];
  if (flat < 0 || flat >= model.offsets[model.offsets.length - 1]) return undefined;
  const [first, last] = visibleLanes(model, height, scroll);
  const cols = model.cols[laneIndexValue];
  if (laneIndexValue < first || laneIndexValue >= last || cols.end[o] < view[0] || cols.start[o] > view[1]) return undefined;
  geometry(cols, o, laneIndexValue, view, width, Math.max(1, width - GUTTER), scroll);
  return { segment: cols.segments[o], laneIndex: laneIndexValue, index: flat, offset: o, x: G.x, y: G.y, width: G.width, height: G.height };
}
export function visibleRects(model: LaneModel, view: [number, number], width: number, height: number, scroll: number): LaneRect[] {
  const buf = new RectBuffer(); const m = fillVisibleRects(model, view, width, height, scroll, buf);
  const rects: LaneRect[] = new Array(m);
  for (let i = 0; i < m; i++) {
    const laneIndexValue = buf.laneIndex[i]; const offset = buf.offset[i];
    rects[i] = { segment: model.cols[laneIndexValue].segments[offset], laneIndex: laneIndexValue, index: buf.flat[i], offset, x: buf.x[i], y: buf.y[i], width: buf.width[i], height: buf.height[i] };
  }
  return rects;
}
/** Topmost painted rect under (x, y): deepest, then last input index; 1.5 px minimum width, inclusive edges, visible lanes only. */
export function hitTest(model: LaneModel, view: [number, number], width: number, height: number, scroll: number, x: number, y: number, stats?: { scanned: number }): LaneRect | undefined {
  const [first, last] = visibleLanes(model, height, scroll);
  const plotWidth = Math.max(1, width - GUTTER);
  const span = view[1] - view[0];
  const time = view[0] + (x - GUTTER) / plotWidth * span;
  // A hit rect spans at most 1.5 px beyond its time edges, so this window is a superset; the exact rect test decides.
  const delta = MIN_WIDTH * span / plotWidth * 1.01 + Math.abs(time) * 1e-12 + 1e-9;
  const row = Math.floor((y + scroll) / ROW_HEIGHT);
  let bestFlat = -1; let bestDepth = -1; let best: LaneRect | undefined;
  const local: number[] = [];
  for (let laneIndexValue = row - 1; laneIndexValue <= row; laneIndexValue++) {
    if (laneIndexValue < first || laneIndexValue >= last) continue;
    const cols = model.cols[laneIndexValue];
    local.length = 0; laneWindow(cols, Math.max(time - delta, view[0]), Math.min(time + delta, view[1]), local, stats);
    for (let i = 0; i < local.length; i++) {
      const o = local[i];
      geometry(cols, o, laneIndexValue, view, width, plotWidth, scroll);
      if (!(x >= G.x && x <= G.x + G.width && y >= G.y && y <= G.y + G.height)) continue;
      const depth = cols.depth[o]; const flat = model.offsets[laneIndexValue] + o;
      if (depth > bestDepth || (depth === bestDepth && flat > bestFlat)) {
        bestDepth = depth; bestFlat = flat;
        best = { segment: cols.segments[o], laneIndex: laneIndexValue, index: flat, offset: o, x: G.x, y: G.y, width: G.width, height: G.height };
      }
    }
  }
  return best;
}
