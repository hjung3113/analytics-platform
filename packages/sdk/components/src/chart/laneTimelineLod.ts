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

/** One depth of the LOD lanes: fills as runs per colour id (colours in first-seen order), and the decorations of the winning rects.
 * `deco` holds quadruples (lane, offset, clipFrom, clipTo): `clipFrom < 0` draws unclipped, otherwise the decoration is clipped to the x ranges `clips[clipFrom..clipTo)` (pairs). */
type Pass = { runs: (number[] | undefined)[]; colors: number[]; deco: number[]; clips: number[] };
/** Frame-local bucket storage: one width-sized column buffer pair and the winner intervals of one lane and depth, reused for every depth pass. Never retained between frames. */
type Scratch = { cover: Float64Array; off: Int32Array; ivOffset: Int32Array; ivFrom: Int32Array; ivTo: Int32Array; found: Int32Array };
/** Test hook: bytes of bucket storage allocated by a frame (O(width)) and of the per-lane depth grouping (O(visible segments)). */
export type LodStats = { bucketBytes: number; groupBytes: number };
function allocScratch(columns: number, stats?: LodStats): Scratch {
  const s = { cover: new Float64Array(columns).fill(-1), off: new Int32Array(columns).fill(-1), ivOffset: new Int32Array(columns), ivFrom: new Int32Array(columns), ivTo: new Int32Array(columns), found: new Int32Array(columns) };
  if (stats) stats.bucketBytes += s.cover.byteLength + s.off.byteLength + s.ivOffset.byteLength + s.ivFrom.byteLength + s.ivTo.byteLength + s.found.byteLength;
  return s;
}
/** The decoration glyphs reach this far (miter and dash included) beyond the rect they belong to, in pixels. */
const DECO_REACH = 8;

/**
 * Paints one frame of the data layer. A lane whose visible segment count reaches `lodAt` (the plot width in pixels; `Infinity` forces the exact path)
 * is painted by pixel columns straight from its time index; every other lane by rect, in the order and with the calls of the pre-LOD painter.
 * Per depth, ascending and never reordered: the exact rects of that depth, then the LOD lanes' runs grouped by colour, then the decorations of the
 * winning rects (each clipped to the columns no later-painted winner of that depth takes). `buf` is scratch for the exact lanes' rects.
 */
export function paintFrame(ctx: CanvasRenderingContext2D, style: LaneStyle, frame: { view: [number, number]; width: number; height: number; scroll: number }, buf: RectBuffer, lodAt: number, stats?: LodStats) {
  const { model } = style; const { view, width, height, scroll } = frame;
  const plot = Math.max(1, width - GUTTER); const [first, last] = visibleLanes(model, height, scroll);
  const windows: number[][] = []; const lodLane = new Uint8Array(model.lanes.length); let anyLod = false;
  if (stats) { stats.bucketBytes = 0; stats.groupBytes = 0; }
  if (lodAt !== Infinity) {
    for (let l = first; l < last; l++) {
      const w: number[] = []; laneWindow(model.cols[l], view[0], view[1], w);
      if (w.length > 0 && w.length >= lodAt) { lodLane[l] = 1; windows[l] = w; anyLod = true; }
    }
  }
  const count = fillVisibleRects(model, view, width, height, scroll, buf, undefined, anyLod ? lodLane : undefined);
  const passes = new Map<number, Pass>();
  if (anyLod) {
    const columns = Math.ceil(width) + 2; const scratch = allocScratch(columns, stats);
    for (let l = first; l < last; l++) if (lodLane[l]) bucketLane(style, l, windows[l], frame, plot, columns, passes, scratch, stats);
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
    const { deco, clips } = pass;
    for (let k = 0; k < deco.length; k += 4) {
      const lane = deco[k]; const o = deco[k + 1]; const from = deco[k + 2]; const to = deco[k + 3];
      const g = laneGeometry(style.model.cols[lane], o, lane, frame.view, frame.width, plot, frame.scroll);
      if (from < 0) { decorate(ctx, style, lane, o, g.x, g.y, g.width, g.height, true); continue; }
      ctx.save(); ctx.beginPath();
      for (let r = from; r < to; r += 2) ctx.rect(clips[r], 0, clips[r + 1] - clips[r], height);
      ctx.clip(); decorate(ctx, style, lane, o, g.x, g.y, g.width, g.height, true); ctx.restore();
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

/**
 * The offsets of one lane's window grouped by depth, ascending (stable). Counting sort on the depth column into one Int32Array while the depths are
 * small relative to the window (always, in practice); a comparator sort otherwise, so storage is O(window) either way.
 */
function groupByDepth(depthCol: ArrayLike<number>, offsets: number[], stats?: LodStats): Int32Array {
  const n = offsets.length; let min = Infinity; let max = -Infinity;
  for (let k = 0; k < n; k++) { const d = depthCol[offsets[k]]; if (d < min) min = d; if (d > max) max = d; }
  const out = new Int32Array(n);
  if (stats) stats.groupBytes += out.byteLength;
  if (min === max) { for (let k = 0; k < n; k++) out[k] = offsets[k]; return out; }
  if (max - min <= 2 * n + 64) {
    const counts = new Int32Array(max - min + 2); if (stats) stats.groupBytes += counts.byteLength;
    for (let k = 0; k < n; k++) counts[depthCol[offsets[k]] - min + 1]++;
    for (let d = 1; d < counts.length; d++) counts[d] += counts[d - 1];
    for (let k = 0; k < n; k++) out[counts[depthCol[offsets[k]] - min]++] = offsets[k];
    return out;
  }
  for (let k = 0; k < n; k++) out[k] = offsets[k];
  return out.sort((a, b) => depthCol[a] - depthCol[b] || a - b);
}

/** One LOD lane: winner per pixel column and depth (largest coverage at full precision, ties to the highest input index), equal neighbours merged into runs. */
function bucketLane(style: LaneStyle, lane: number, window: number[], frame: { view: [number, number]; width: number; scroll: number }, plot: number, columns: number, passes: Map<number, Pass>, sc: Scratch, stats?: LodStats) {
  const cols = style.model.cols[lane]; const { view, width, scroll } = frame;
  // Constants of the lane (module imports are hoisted into locals: a property load per segment otherwise), in the arithmetic of `laneGeometry` (division kept so every column edge is bit-identical).
  const { start, end, depth: depthCol, color: colorCol, flags, rank: rankCol } = cols;
  const v0 = view[0]; const span = view[1] - view[0]; const minWidth = MIN_WIDTH; const gutter = GUTTER; const maxX = width - minWidth; const rowTop = lane * ROW_HEIGHT - scroll;
  const { cover, off, ivOffset, ivFrom, ivTo, found } = sc;
  const { codeId, neutralId, rankOutlineId, outlineCount, rankOutline } = style; const fallback = style.paletteIds[lane % style.paletteIds.length];
  const offsets = groupByDepth(depthCol, window, stats); const n = offsets.length;
  for (let from = 0; from < n;) {
    const depth = depthCol[offsets[from]]; let to = from + 1;
    while (to < n && depthCol[offsets[to]] === depth) to++;
    const inset = Math.min(depth * 2, 11); const y = rowTop + inset; const h = ROW_HEIGHT - inset * 2;
    let lo = columns; let hi = -1;
    for (let k = from; k < to; k++) {
      const o = offsets[k];
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
    from = to;
    let pass = passes.get(depth); if (!pass) { pass = { runs: [], colors: [], deco: [], clips: [] }; passes.set(depth, pass); }
    const { runs, colors } = pass;
    let runStart = lo; let runKey = -1; let runColor = -1; let prev = -1; let ivStart = lo; let intervals = 0;
    for (let c = lo; c <= hi + 1; c++) {
      const o = c <= hi ? off[c] : -1;
      if (o !== prev) {
        if (prev >= 0) { ivOffset[intervals] = prev; ivFrom[intervals] = ivStart; ivTo[intervals] = c; intervals++; }
        ivStart = c;
        let key = -1; let color = -1;
        if (o >= 0) { const code = colorCol[o]; color = code ? codeId[code] : flags[o] & FLAG_NEUTRAL ? neutralId : fallback; key = color * outlineCount + rankOutlineId[rankCol[o]]; }
        if (key !== runKey) {
          if (runKey >= 0) { let list = runs[runColor]; if (!list) { list = []; runs[runColor] = list; colors.push(runColor); } list.push(runStart, y, c - runStart, h); }
          runStart = c; runKey = key; runColor = color;
        }
        prev = o;
      }
      if (c <= hi) { off[c] = -1; cover[c] = -1; }
    }
    // Decorations: only winners with something to stroke. Each is visible where the exact painter would leave it, i.e. not in the columns a later-painted winner of this depth takes.
    let wanted = 0;
    for (let i = 0; i < intervals; i++) { const o = ivOffset[i]; if (rankOutline[rankCol[o]].width || flags[o] & (FLAG_ORPHAN | FLAG_OPEN)) found[wanted++] = o; }
    if (!wanted) continue;
    const list = found.subarray(0, wanted).sort(); const { deco, clips } = pass;
    for (let k = 0; k < wanted; k++) {
      const o = list[k]; if (k > 0 && o === list[k - 1]) continue;
      const g = laneGeometry(cols, o, lane, view, width, plot, scroll);
      const lo2 = g.x - DECO_REACH; const hi2 = g.x + Math.max(g.width, 6) + DECO_REACH;
      let a = 0; let b = intervals; // first interval ending after lo2
      while (a < b) { const m = (a + b) >> 1; if (ivTo[m] > lo2) b = m; else a = m + 1; }
      const clipFrom = clips.length; let cursor = lo2; let hidden = false;
      for (let i = a; i < intervals && ivFrom[i] < hi2; i++) {
        if (ivOffset[i] <= o) continue;
        hidden = true;
        if (ivFrom[i] > cursor) clips.push(cursor, ivFrom[i]);
        if (ivTo[i] > cursor) cursor = ivTo[i];
      }
      if (!hidden) { deco.push(lane, o, -1, -1); continue; }
      if (cursor < hi2) clips.push(cursor, hi2);
      if (clips.length > clipFrom) deco.push(lane, o, clipFrom, clips.length);
    }
  }
}
