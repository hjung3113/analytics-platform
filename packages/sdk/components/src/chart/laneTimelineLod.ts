import type { ThemeColorToken } from '@ap/ui/theme';
import { fillVisibleRects, FLAG_NEUTRAL, FLAG_OPEN, FLAG_ORPHAN, GUTTER, laneGeometry, laneWindow, MIN_WIDTH, ROW_HEIGHT, visibleLanes, type LaneModel, type RectBuffer } from './laneTimelineModel';
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
/** Distinct winners of one lane and depth in column order, sorted and de-duplicated in place. Reused across frames. */
let foundScratch = new Int32Array(0);
/** One depth of the LOD lanes: fills as runs per colour id (colours in first-seen order), and the winning rects (lane, offset) whose decorations follow the fills. */
type Pass = { runs: (number[] | undefined)[]; colors: number[]; winnerLane: number[]; winnerOffset: number[] };

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
    for (let k = 0; k < pass.colors.length; k++) {
      const id = pass.colors[k]; const list = pass.runs[id]!;
      ctx.fillStyle = style.fills[id];
      for (let r = 0; r < list.length; r += 4) ctx.fillRect(list[r], list[r + 1], list[r + 2], list[r + 3]);
    }
    for (let k = 0; k < pass.winnerLane.length; k++) {
      const lane = pass.winnerLane[k]; const o = pass.winnerOffset[k];
      const g = laneGeometry(style.model.cols[lane], o, lane, frame.view, frame.width, plot, frame.scroll);
      decorate(ctx, style, lane, o, g.x, g.y, g.width, g.height, true);
    }
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
  // Constants of the lane (module imports are hoisted into locals: a property load per segment otherwise), in the arithmetic of `laneGeometry` (division kept so every column edge is bit-identical).
  const { start, end, depth: depthCol, color: colorCol, flags, rank: rankCol } = cols;
  const v0 = view[0]; const span = view[1] - view[0]; const minWidth = MIN_WIDTH; const gutter = GUTTER; const maxX = width - minWidth; const rowTop = lane * ROW_HEIGHT - scroll;
  const buckets = new Map<number, Bucket>();
  let curDepth = -1; let b!: Bucket; let cover!: Float32Array; let off!: Int32Array; let lo = 0; let hi = -1;
  const n = offsets.length;
  for (let k = 0; k < n; k++) {
    const o = offsets[k]; const depth = depthCol[o];
    if (depth !== curDepth) {
      if (curDepth >= 0) { b.lo = lo; b.hi = hi; }
      let next = buckets.get(depth);
      if (!next) {
        const inset = Math.min(depth * 2, 11);
        next = acquire(columns); next.lo = columns; next.hi = -1; next.y = rowTop + inset; next.h = ROW_HEIGHT - inset * 2; buckets.set(depth, next);
      }
      b = next; cover = b.cover; off = b.off; lo = b.lo; hi = b.hi; curDepth = depth;
    }
    const x = gutter + Math.max(0, (start[o] - v0) / span * plot);
    const endX = gutter + Math.min(plot, (end[o] - v0) / span * plot);
    const x0 = Math.min(x, maxX); const x1 = x0 + Math.max(minWidth, endX - x);
    const c0 = Math.max(0, Math.floor(x0)); const c1 = Math.min(columns, Math.ceil(x1));
    if (c0 < lo) lo = c0; if (c1 - 1 > hi) hi = c1 - 1;
    for (let c = c0; c < c1; c++) {
      const covered = Math.min(x1, c + 1) - Math.max(x0, c);
      const best = cover[c];
      if (covered > best || (covered === best && o > off[c])) { cover[c] = covered; off[c] = o; }
    }
  }
  if (curDepth >= 0) { b.lo = lo; b.hi = hi; }
  if (foundScratch.length < columns) foundScratch = new Int32Array(columns);
  const { codeId, neutralId, rankOutlineId, outlineCount, rankOutline } = style; const fallback = style.paletteIds[lane % style.paletteIds.length];
  for (const [depth, bk] of buckets) {
    let pass = passes.get(depth); if (!pass) { pass = { runs: [], colors: [], winnerLane: [], winnerOffset: [] }; passes.set(depth, pass); }
    const bOff = bk.off; const bCover = bk.cover; const { runs, colors } = pass; const { y, h } = bk; const hiColumn = bk.hi;
    let runStart = bk.lo; let runKey = -1; let runColor = -1; let prev = -1; let found = 0;
    for (let c = bk.lo; c <= hiColumn + 1; c++) {
      const o = c <= hiColumn ? bOff[c] : -1;
      if (o !== prev) {
        let key = -1; let color = -1;
        if (o >= 0) {
          const code = colorCol[o]; color = code ? codeId[code] : flags[o] & FLAG_NEUTRAL ? neutralId : fallback;
          key = color * outlineCount + rankOutlineId[rankCol[o]]; foundScratch[found++] = o;
        }
        if (key !== runKey) {
          if (runKey >= 0) { let list = runs[runColor]; if (!list) { list = []; runs[runColor] = list; colors.push(runColor); } list.push(runStart, y, c - runStart, h); }
          runStart = c; runKey = key; runColor = color;
        }
        prev = o;
      }
      if (c <= hiColumn) { bOff[c] = -1; bCover[c] = -1; }
    }
    // Native numeric sort (no comparator); only winners with something to stroke are kept, and the geometry is computed when they are drawn.
    const list = foundScratch.subarray(0, found).sort();
    for (let k = 0; k < list.length; k++) {
      const o = list[k]; if (k > 0 && o === list[k - 1]) continue;
      if (!rankOutline[rankCol[o]].width && !(flags[o] & (FLAG_ORPHAN | FLAG_OPEN))) continue;
      pass.winnerLane.push(lane); pass.winnerOffset.push(o);
    }
    pool.push(bk);
  }
}
