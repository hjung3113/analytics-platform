import { describe, expect, it } from 'vitest';
import type { ThemeColorToken } from '@ap/ui/theme';
import { createLaneStyle, paintFrame } from '../laneTimelineLod';
import { fillVisibleRects, GUTTER, prepareLanes, RectBuffer, ROW_HEIGHT, outlineStyle, FLAG_OPEN, FLAG_ORPHAN } from '../laneTimelineGeometry';
import type { TimelineLane } from '../LaneTimeline';
import { rng } from './laneTimelineOracle';
import { benchLanes, count, rasterContext, recordingContext, type Op } from './laneTimelineLod.helpers';

const WIDTH = 400; const HEIGHT = 120; const PLOT = WIDTH - GUTTER;
const COLORS: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
const resolve = (token: ThemeColorToken) => `c:${token}`;
type Opts = { outlineMode?: 'strong' | 'weak' | 'off'; widths?: Record<string, number> };
function frame(lanes: TimelineLane[], view?: [number, number], width = WIDTH, opts: Opts = {}) {
  const model = prepareLanes(lanes, []); const v = view ?? model.domain; const buf = new RectBuffer();
  const n = fillVisibleRects(model, v, width, HEIGHT, 0, buf);
  const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve, outlineWidthsByRank: opts.widths, outlineMode: opts.outlineMode ?? 'strong' });
  return { model, buf, n, style, plot: width - GUTTER, width, view: v };
}
/** Dense lanes: 1–6 px rects (the view is the whole domain, 288 px), mixed depths, ranks, boundaries and colours. */
function denseLanes(seed: number, laneCount: number, perLane: number): TimelineLane[] {
  const random = rng(seed);
  return Array.from({ length: laneCount }, (_, l) => ({ id: `l${l}`, label: `L${l}`, segments: Array.from({ length: perLane }, (_, i) => {
    const start = random() * 1000; const kind = random();
    return { id: `l${l}s${i}`, start, end: start + 1 + random() * 20, depth: Math.floor(random() * 4),
      colorToken: kind < 0.2 ? undefined : COLORS[Math.floor(random() * 4)], neutral: kind > 0.9 || undefined, rank: random() < 0.3 ? 'a' : undefined,
      startBoundary: random() < 0.1 ? 'orphan' as const : undefined, endBoundary: random() < 0.1 ? 'open' as const : undefined };
  }) }));
}

describe('LOD vs the exact painter (oracle)', () => {
  const lanes = denseLanes(7, 3, 700);
  const sampleRows = lanes.map((_, l) => l * ROW_HEIGHT + 12); // every inset is at most 11, so this pixel row lies inside every rect of the lane
  it('matches on columns fully covered by their paint-last rect; edge columns differ only by the neighbouring winner colour', () => {
    const f = frame(lanes);
    const exact = rasterContext(WIDTH, sampleRows); paint(f, exact.ctx, Infinity);
    const lod = rasterContext(WIDTH, sampleRows); paint(f, lod.ctx, PLOT);
    let pure = 0; let edge = 0; let edgeDiffers = 0;
    for (let l = 0; l < lanes.length; l++) {
      for (let c = GUTTER; c < WIDTH; c++) {
        const touching: { k: number; cover: number; color: string }[] = [];
        for (let k = 0; k < f.n; k++) {
          if (f.buf.laneIndex[k] !== l) continue;
          const cover = Math.min(f.buf.x[k] + f.buf.width[k], c + 1) - Math.max(f.buf.x[k], c);
          if (cover > 0) touching.push({ k, cover, color: f.style.fills[colorOf(f, k)] });
        }
        const a = exact.pixels.get(sampleRows[l])![c]; const b = lod.pixels.get(sampleRows[l])![c];
        if (!touching.length) { expect([...b.values()].every(v => v === 0) || b.size === 0).toBe(true); continue; }
        const last = touching[touching.length - 1]; // buffer order is paint order
        if (last.cover >= 1 - 1e-9) {
          pure++;
          expect([...a.entries()].filter(([, v]) => v > 1e-9)).toEqual([[last.color, expect.closeTo(1, 6)]]);
          expect([...b.entries()].filter(([, v]) => v > 1e-9)).toEqual([[last.color, expect.closeTo(1, 6)]]);
        } else {
          edge++;
          // Allowed difference: LOD paints one opaque colour, the colour of some rect touching the column (the per-depth coverage winner).
          const colours = [...b.entries()].filter(([, v]) => v > 1e-9);
          expect(colours).toHaveLength(1);
          expect(touching.map(t => t.color)).toContain(colours[0][0]);
          if (colours[0][0] !== [...a.entries()].sort((x, y) => y[1] - x[1])[0][0]) edgeDiffers++;
        }
      }
    }
    expect(pure).toBeGreaterThan(100); expect(edge).toBeGreaterThan(50); expect(edgeDiffers).toBeLessThan(edge);
  });
  it('draws decorations only for rects the exact painter also decorates, and keeps those of an unobstructed rect', () => {
    const f = frame(lanes, undefined, WIDTH, { widths: { a: 2 } });
    const exact: Op[] = []; paint(f, recordingContext(exact), Infinity);
    const lod: Op[] = []; paint(f, recordingContext(lod), PLOT);
    const sig = (log: Op[]) => log.filter(op => op[0] === 'strokeRect' || op[0] === 'moveTo').map(op => op.join(','));
    const exactSigs = new Map<string, number>(); for (const s of sig(exact)) exactSigs.set(s, (exactSigs.get(s) ?? 0) + 1);
    const lodSigs = sig(lod); expect(lodSigs.length).toBeGreaterThan(0); expect(lodSigs.length).toBeLessThan(sig(exact).length);
    // Rect geometry is identical in both paths (same buffer), so every LOD decoration signature must exist in the exact sequence.
    for (const s of lodSigs) { expect(exactSigs.get(s) ?? 0).toBeGreaterThan(0); exactSigs.set(s, exactSigs.get(s)! - 1); }
  });
  it('a lone ranked, orphan and open rect keeps its decoration; a rect fully covered by a later deeper one loses it, as in the exact painter', () => {
    // Dense filler (forces LOD) sits at the right; the lone rect has free columns; "hidden" is wholly covered by a later same-depth rect.
    const filler = Array.from({ length: 400 }, (_, i) => ({ id: `f${i}`, start: 220 + i * 0.2, end: 220.1 + i * 0.2, colorToken: 'chart-series-1' as const }));
    const lane = { id: 'a', label: 'A', segments: [
      ...filler,
      { id: 'lone', start: 100, end: 110, rank: 'a', startBoundary: 'orphan' as const, endBoundary: 'open' as const },
      { id: 'hidden', start: 150, end: 152, rank: 'a', startBoundary: 'orphan' as const },
      { id: 'cover', start: 149, end: 154, colorToken: 'chart-series-2' as const },
    ] };
    const f = frame([lane], [0, 300], WIDTH, { widths: { a: 1 } });
    const run = (lodAt: number) => { const log: Op[] = []; paint(f, recordingContext(log), lodAt); return log; };
    const chevrons = (log: Op[]) => log.filter(op => op[0] === 'moveTo').map(op => op[1] as number);
    const at = (t: number) => GUTTER + t / 300 * PLOT + 5;
    const has = (xs: number[], x: number) => xs.some(v => Math.abs(v - x) < 1e-6);
    expect(has(chevrons(run(Infinity)), at(100))).toBe(true);
    expect(has(chevrons(run(PLOT)), at(100))).toBe(true);
    // The exact painter still strokes "hidden" before "cover" paints over it; LOD never emits it because it wins no column.
    expect(has(chevrons(run(Infinity)), at(150))).toBe(true);
    expect(has(chevrons(run(PLOT)), at(150))).toBe(false);
  });
  it('flags used by the fixtures are the model flags', () => { expect(FLAG_ORPHAN).toBe(1); expect(FLAG_OPEN).toBe(2); expect(outlineStyle('a', { a: 1 }, 'strong').width).toBe(1); });
});
/** Paints one frame with a scratch buffer of its own, so `f.buf` stays the independent oracle input. */
function paint(f: ReturnType<typeof frame>, ctx: CanvasRenderingContext2D, lodAt: number) {
  paintFrame(ctx, f.style, { view: f.view, width: f.width, height: HEIGHT, scroll: 0 }, new RectBuffer(), lodAt);
}
function colorOf(f: ReturnType<typeof frame>, k: number) {
  const cols = f.model.cols[f.buf.laneIndex[k]]; const o = f.buf.offset[k]; const code = cols.color[o];
  return code ? f.style.codeId[code] : cols.flags[o] & 4 ? f.style.neutralId : f.style.paletteIds[f.buf.laneIndex[k] % f.style.paletteIds.length];
}

describe('zoomed-in frames keep the exact fillRect sequence', () => {
  /** The pre-#1746b renderer loop, kept as the oracle (selection outline moved to the overlay layer). */
  function oldPaint(f: ReturnType<typeof frame>, ctx: CanvasRenderingContext2D, outlineMode: 'strong' | 'weak' | 'off', widths?: Record<string, number>) {
    ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, f.plot, HEIGHT); ctx.clip();
    for (let i = 0; i < f.n; i++) {
      const cols = f.model.cols[f.buf.laneIndex[i]]; const o = f.buf.offset[i]; const flags = cols.flags[o];
      const x = f.buf.x[i]; const y = f.buf.y[i]; const w = f.buf.width[i]; const h = f.buf.height[i];
      ctx.fillStyle = f.style.fills[colorOf(f, i)]; ctx.fillRect(x, y, w, h);
      const outline = outlineStyle(cols.rank[o] ? f.model.ranks[cols.rank[o] - 1] : undefined, widths, outlineMode);
      const bw = Math.min(outline.width, w, h);
      ctx.lineWidth = bw; ctx.globalAlpha = outline.alpha; ctx.setLineDash(outline.dash); ctx.strokeStyle = 'c:border-strong';
      if (bw) ctx.strokeRect(x + bw / 2, y + bw / 2, Math.max(0, w - bw), Math.max(0, h - bw));
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      ctx.strokeStyle = 'c:text-primary'; ctx.lineWidth = 1.5;
      if (flags & 1) { ctx.beginPath(); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 1, y + h / 2); ctx.lineTo(x + 5, y + h - 2); ctx.stroke(); }
      if (flags & 2) { ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x + w - 1, y); ctx.lineTo(x + w - 1, y + h); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
  }
  it.each(['strong', 'weak', 'off'] as const)('issues the same op sequence as the old loop below the density threshold (outline %s)', mode => {
    const sparse = denseLanes(3, 3, 60); // 60 visible segments per lane against a 288 px plot
    const f = frame(sparse, undefined, WIDTH, { outlineMode: mode, widths: { a: 2 } });
    const expected: Op[] = []; oldPaint(f, recordingContext(expected), mode, { a: 2 });
    const actual: Op[] = []; const ctx = recordingContext(actual);
    ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, f.plot, HEIGHT); ctx.clip(); paint(f, ctx, f.plot); ctx.restore();
    expect(actual).toEqual(expected);
    expect(count(actual, 'fillRect')).toBe(f.n);
  });
});

describe('LOD op budget', () => {
  it('assigns fillStyle at most colours × depths times and fills far fewer rects than the exact path', () => {
    const f = frame(denseLanes(11, 3, 900));
    const lod: Op[] = []; paint(f, recordingContext(lod), PLOT);
    const colours = new Set<number>(); const depths = new Set<number>();
    for (let k = 0; k < f.n; k++) { colours.add(colorOf(f, k)); depths.add(f.model.cols[f.buf.laneIndex[k]].depth[f.buf.offset[k]]); }
    expect(count(lod, '=fillStyle')).toBeLessThanOrEqual(colours.size * depths.size);
    expect(count(lod, 'fillRect')).toBeLessThan(f.n);
  });
  it('merges adjacent equal-colour columns into one fillRect and never merges across different outline styles', () => {
    const seg = (id: string, start: number, rank?: string) => ({ id, start, end: start + 1, colorToken: 'chart-series-1' as const, rank });
    // 288 one-pixel segments at 1 px pitch (view 0..288): all one colour; the middle ones are ranked.
    const segments = Array.from({ length: 288 }, (_, i) => seg(`s${i}`, i, i >= 100 && i < 140 ? 'a' : undefined));
    const f = frame([{ id: 'x', label: 'X', segments }], [0, 288], WIDTH, { widths: { a: 1 } });
    const log: Op[] = []; paint(f, recordingContext(log), PLOT);
    const fills = log.filter(op => op[0] === 'fillRect');
    expect(fills).toHaveLength(3); // plain | ranked | plain
    expect(fills.slice(0, 2).map(op => op[3])).toEqual([100, 40]); expect(fills[2][3]).toBeGreaterThanOrEqual(148);
  });
  it('is ordered by depth: a deeper pass is never painted before a shallower one', () => {
    const f = frame(denseLanes(5, 2, 800));
    const log: Op[] = []; paint(f, recordingContext(log), PLOT);
    const ys = log.filter(op => op[0] === 'fillRect').map(op => ({ lane: Math.floor((op[2] as number) / ROW_HEIGHT), inset: (op[2] as number) % ROW_HEIGHT }));
    for (const lane of [0, 1]) { const insets = ys.filter(y => y.lane === lane).map(y => y.inset); expect(insets).toEqual([...insets].sort((a, b) => a - b)); }
  });
});

describe('measure: canvas op counts of the full view, exact vs LOD (bench data)', () => {
  it.each([50_000, 200_000])('%i segments', n => {
    const model = prepareLanes(benchLanes(n), []); const buf = new RectBuffer(); const width = 1440; const height = 560 - 40; const plot = width - GUTTER;
    const t0 = performance.now(); const m = fillVisibleRects(model, model.domain, width, height, 0, buf); const tCold = performance.now() - t0;
    const warm = Array.from({ length: 7 }, () => { const t = performance.now(); fillVisibleRects(model, model.domain, width, height, 0, buf); return performance.now() - t; }).sort((a, b) => a - b); const tRects = warm[3];
    const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve, outlineMode: 'strong' });
    const fr = { view: model.domain, width, height, scroll: 0 }; const scratch = new RectBuffer();
    const exact: Op[] = []; paintFrame(recordingContext(exact), style, fr, new RectBuffer(), Infinity);
    const lod: Op[] = []; paintFrame(recordingContext(lod), style, fr, new RectBuffer(), plot);
    // Node-side CPU of the LOD bucketing alone (no-op context, median of 7): not browser draw time, which the host bench measures.
    const noop = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
    const times = Array.from({ length: 7 }, () => { const t = performance.now(); paintFrame(noop, style, fr, scratch, plot); return performance.now() - t; }).sort((a, b) => a - b);
    const tLod = times[3];
    const ops = (log: Op[]) => ({ fillRect: count(log, 'fillRect'), fillStyle: count(log, '=fillStyle'), total: log.length });
    console.info(`LOD-MEASURE n=${n} visible=${m} exact=${JSON.stringify(ops(exact))} lod=${JSON.stringify(ops(lod))} fillVisibleRects(cold incl. index)=${tCold.toFixed(1)}ms warm-median=${tRects.toFixed(1)}ms lodPaintNode=${tLod.toFixed(1)}ms`);
    expect(ops(lod).fillRect).toBeLessThan(ops(exact).fillRect / 2);
    expect(ops(lod).fillStyle).toBeLessThan(ops(exact).fillStyle);
  }, 60_000);
});
