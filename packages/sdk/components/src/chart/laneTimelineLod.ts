import type { ThemeColorToken } from '@ap/ui/theme';
import { fillVisibleRects, FLAG_NEUTRAL, FLAG_OPEN, FLAG_ORPHAN, GUTTER, laneGeometry, laneWindow, visibleLanes, type LaneModel, type RectBuffer } from './laneTimelineModel';
import { outlineStyle } from './laneTimelineGeometry';

/**
 * The data-layer painter of LaneTimeline. A lane whose visible segment count reaches the plot width in pixels is painted per pixel column
 * (LOD); every other lane is painted rect by rect exactly as before #1746, so zoomed-in frames issue the same fillRect sequence.
 */
type Outline = { width: number; alpha: number; dash: number[] };
export type LaneStyleInput = {
  model: LaneModel; colors: ThemeColorToken[]; neutral: ThemeColorToken; resolve: (token: ThemeColorToken) => string;
  outlineWidthsByRank?: Record<string, number>; outlineMode: 'strong' | 'weak' | 'off';
};
/** Colours and outline styles resolved to strings and small integer ids once; rebuilt on a theme change or resize. */
export type LaneStyle = {
  model: LaneModel; fills: string[]; codeId: Int32Array; neutralId: number; paletteIds: Int32Array;
  rankOutline: Outline[]; rankOutlineId: Int32Array; outlineCount: number; borderStrong: string; textPrimary: string;
};
export function createLaneStyle(input: LaneStyleInput): LaneStyle {
  const { model } = input; const ids = new Map<ThemeColorToken, number>(); const fills: string[] = [];
  const idOf = (token: ThemeColorToken) => {
    let id = ids.get(token); if (id === undefined) { id = fills.length; fills.push(input.resolve(token)); ids.set(token, id); } return id;
  };
  const codeId = new Int32Array(model.tokens.length + 1); model.tokens.forEach((token, i) => { codeId[i + 1] = idOf(token); });
  const neutralId = idOf(input.neutral); const paletteIds = Int32Array.from(input.colors.map(idOf));
  const keys = new Map<string, number>(); const rankOutline: Outline[] = []; const rankOutlineId = new Int32Array(model.ranks.length + 1);
  for (let code = 0; code <= model.ranks.length; code++) {
    const outline = outlineStyle(code ? model.ranks[code - 1] : undefined, input.outlineWidthsByRank, input.outlineMode);
    rankOutline.push(outline);
    // A zero width draws nothing, whatever its alpha or dash.
    const key = outline.width > 0 ? `${outline.width}|${outline.alpha}|${outline.dash.join(',')}` : 'none';
    let id = keys.get(key); if (id === undefined) { id = keys.size; keys.set(key, id); }
    rankOutlineId[code] = id;
  }
  // eslint-disable-next-line shadcn/no-raw-colors -- canvas reads theme tokens by name (resolved once per theme), not class strings
  return { model, fills, codeId, neutralId, paletteIds, rankOutline, rankOutlineId, outlineCount: keys.size, borderStrong: input.resolve('border-strong'), textPrimary: input.resolve('text-primary') };
}
function colorIdAt(style: LaneStyle, laneIndex: number, offset: number) {
  const cols = style.model.cols[laneIndex]; const code = cols.color[offset];
  return code ? style.codeId[code] : cols.flags[offset] & FLAG_NEUTRAL ? style.neutralId : style.paletteIds[laneIndex % style.paletteIds.length];
}

/** Rank outline and semantic boundary glyphs of one rect. Shared by the exact path and the winners of LOD runs. */
function decorate(ctx: CanvasRenderingContext2D, style: LaneStyle, laneIndex: number, o: number, x: number, y: number, w: number, h: number, skipEmpty = false) {
  const cols = style.model.cols[laneIndex]; const flags = cols.flags[o];
  const outline = style.rankOutline[cols.rank[o]];
  const borderWidth = Math.min(outline.width, w, h);
  // LOD only: a rect with nothing to stroke leaves no mark, so its canvas state changes are skipped (the exact path keeps them for an identical op sequence).
  if (skipEmpty && !borderWidth && !(flags & (FLAG_ORPHAN | FLAG_OPEN))) return;
  ctx.lineWidth = borderWidth; ctx.globalAlpha = outline.alpha; ctx.setLineDash(outline.dash); ctx.strokeStyle = style.borderStrong;
  if (borderWidth) ctx.strokeRect(x + borderWidth / 2, y + borderWidth / 2, Math.max(0, w - borderWidth), Math.max(0, h - borderWidth));
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  // Semantic boundaries are glyphs on the visible rect, even when its time edge is clipped.
  ctx.strokeStyle = style.textPrimary; ctx.lineWidth = 1.5;
  if (flags & FLAG_ORPHAN) {
    ctx.beginPath(); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 1, y + h / 2); ctx.lineTo(x + 5, y + h - 2); ctx.stroke();
  }
  if (flags & FLAG_OPEN) {
    ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x + w - 1, y); ctx.lineTo(x + w - 1, y + h); ctx.stroke(); ctx.setLineDash([]);
  }
}
function paintExact(ctx: CanvasRenderingContext2D, style: LaneStyle, buf: RectBuffer, i: number) {
  const lane = buf.laneIndex[i]; const o = buf.offset[i];
  ctx.fillStyle = style.fills[colorIdAt(style, lane, o)];
  ctx.fillRect(buf.x[i], buf.y[i], buf.width[i], buf.height[i]);
  decorate(ctx, style, lane, o, buf.x[i], buf.y[i], buf.width[i], buf.height[i]);
}

/** Best coverage and the winning lane offset per pixel column of one lane at one depth. Pooled; only the touched range is reset. */
type Bucket = { cover: Float32Array; off: Int32Array; lo: number; hi: number; y: number; h: number };
const pool: Bucket[] = []; let poolColumns = 0;
function acquire(columns: number): Bucket {
  if (columns > poolColumns) { pool.length = 0; poolColumns = columns; }
  return pool.pop() ?? { cover: new Float32Array(poolColumns).fill(-1), off: new Int32Array(poolColumns).fill(-1), lo: 0, hi: -1, y: 0, h: 0 };
}
/** One depth of the LOD lanes: fills as runs per colour id, and the winning rects whose decorations follow the fills. */
type Pass = { runs: Map<number, number[]>; winners: { lane: number; o: number; x: number; y: number; w: number; h: number }[] };

/**
 * Paints one frame of the data layer. A lane whose visible segment count reaches `lodAt` (the plot width in pixels; `Infinity` forces the exact path)
 * is painted by pixel columns straight from its time index; every other lane by rect, in the order and with the calls of the pre-LOD painter.
 * Per depth, ascending and never reordered: the exact rects of that depth, then the LOD lanes' runs grouped by colour, then the decorations of the
 * winning rects. `buf` is scratch for the exact lanes' rects.
 */
export function paintFrame(ctx: CanvasRenderingContext2D, style: LaneStyle, frame: { view: [number, number]; width: number; height: number; scroll: number }, buf: RectBuffer, lodAt: number) {
  const { model } = style; const { view, width, height, scroll } = frame;
  const plot = Math.max(1, width - GUTTER); const [first, last] = visibleLanes(model, height, scroll);
  const windows: number[][] = []; const lodLane = new Uint8Array(model.lanes.length); let anyLod = false;
  if (lodAt !== Infinity) {
    for (let l = first; l < last; l++) {
      const w: number[] = []; laneWindow(model.cols[l], view[0], view[1], w);
      if (w.length > 0 && w.length >= lodAt) { lodLane[l] = 1; windows[l] = w; anyLod = true; }
    }
  }
  const count = fillVisibleRects(model, view, width, height, scroll, buf, undefined, anyLod ? lodLane : undefined);
  const passes = new Map<number, Pass>();
  if (anyLod) {
    const columns = Math.ceil(width) + 2;
    for (let l = first; l < last; l++) if (lodLane[l]) bucketLane(style, l, windows[l], frame, plot, columns, passes);
  }
  const depthAt = (i: number) => model.cols[buf.laneIndex[i]].depth[buf.offset[i]];
  const lodDepths = [...passes.keys()].sort((a, b) => a - b); let nextLod = 0;
  const flush = (depth: number) => {
    const pass = passes.get(depth)!;
    for (const [id, list] of pass.runs) {
      ctx.fillStyle = style.fills[id];
      for (let r = 0; r < list.length; r += 4) ctx.fillRect(list[r], list[r + 1], list[r + 2], list[r + 3]);
    }
    for (const v of pass.winners) decorate(ctx, style, v.lane, v.o, v.x, v.y, v.w, v.h, true);
  };
  for (let i = 0; i < count;) {
    const depth = depthAt(i); let j = i + 1;
    while (j < count && depthAt(j) === depth) j++;
    while (nextLod < lodDepths.length && lodDepths[nextLod] < depth) flush(lodDepths[nextLod++]);
    for (let k = i; k < j; k++) paintExact(ctx, style, buf, k);
    if (nextLod < lodDepths.length && lodDepths[nextLod] === depth) flush(lodDepths[nextLod++]);
    i = j;
  }
  while (nextLod < lodDepths.length) flush(lodDepths[nextLod++]);
}

/** One LOD lane: winner per pixel column and depth (largest coverage, ties to the highest input index), equal neighbours merged into runs. */
function bucketLane(style: LaneStyle, lane: number, offsets: number[], frame: { view: [number, number]; width: number; scroll: number }, plot: number, columns: number, passes: Map<number, Pass>) {
  const cols = style.model.cols[lane]; const { view, width, scroll } = frame;
  const buckets = new Map<number, Bucket>();
  for (let n = 0; n < offsets.length; n++) {
    const o = offsets[n]; const g = laneGeometry(cols, o, lane, view, width, plot, scroll);
    const depth = cols.depth[o]; let b = buckets.get(depth);
    if (!b) { b = acquire(columns); b.lo = columns; b.hi = -1; b.y = g.y; b.h = g.height; buckets.set(depth, b); }
    const x0 = g.x; const x1 = x0 + g.width;
    const c0 = Math.max(0, Math.floor(x0)); const c1 = Math.min(columns, Math.ceil(x1));
    if (c0 < b.lo) b.lo = c0; if (c1 - 1 > b.hi) b.hi = c1 - 1;
    const { cover, off } = b;
    for (let c = c0; c < c1; c++) {
      const covered = Math.min(x1, c + 1) - Math.max(x0, c);
      if (covered > cover[c] || (covered === cover[c] && o > off[c])) { cover[c] = covered; off[c] = o; }
    }
  }
  for (const [depth, b] of buckets) {
    let pass = passes.get(depth); if (!pass) { pass = { runs: new Map(), winners: [] }; passes.set(depth, pass); }
    const { off, cover } = b; const found: number[] = [];
    let runStart = b.lo; let runKey = -1; let runColor = -1; let last = -1;
    for (let c = b.lo; c <= b.hi + 1; c++) {
      const o = c <= b.hi ? off[c] : -1;
      let key = -1; let color = -1;
      if (o >= 0) { color = colorIdAt(style, lane, o); key = color * style.outlineCount + style.rankOutlineId[cols.rank[o]]; }
      if (key !== runKey) {
        if (runKey >= 0) { let list = pass.runs.get(runColor); if (!list) { list = []; pass.runs.set(runColor, list); } list.push(runStart, b.y, c - runStart, b.h); }
        runStart = c; runKey = key; runColor = color;
      }
      if (o >= 0 && o !== last) { found.push(o); last = o; }
      if (c <= b.hi) { off[c] = -1; cover[c] = -1; }
    }
    found.sort((a, z) => a - z);
    for (let k = 0; k < found.length; k++) {
      if (k > 0 && found[k] === found[k - 1]) continue;
      const g = laneGeometry(cols, found[k], lane, view, width, plot, scroll);
      pass.winners.push({ lane, o: found[k], x: g.x, y: g.y, w: g.width, h: g.height });
    }
    pool.push(b);
  }
}
