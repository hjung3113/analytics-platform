import { describe, expect, it } from 'vitest';
import type { ThemeColorToken } from '@ap/ui/theme';
import { createLaneStyle, paintFrame } from '../laneTimelineLod';
import { fillVisibleRects, hitTest, GUTTER, laneWindow, prepareLanes, RectBuffer, ROW_HEIGHT, outlineStyle, FLAG_OPEN, FLAG_ORPHAN } from '../laneTimelineGeometry';
import type { TimelineLane } from '../LaneTimeline';
import { oldPaintRects, oldPrepareLanes, oldVisibleRects, oldWinners, rng, type OldRect } from './laneTimelineOracle';
import { benchLanes, count, pixelColours, rasterContext, recordingContext, type Op } from './laneTimelineLod.helpers';
import type { LodStats } from '../laneTimelineLod';

const WIDTH = 400; const HEIGHT = 120; const PLOT = WIDTH - GUTTER;
const COLORS: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
const resolve = (token: string) => `c:${token}`;
type Opts = { outlineMode?: 'strong' | 'weak' | 'off'; widths?: Record<string, number> };
function frame(lanes: TimelineLane[], view?: [number, number], width = WIDTH, opts: Opts = {}) {
  const model = prepareLanes(lanes, []); const v = view ?? model.domain; const buf = new RectBuffer();
  const n = fillVisibleRects(model, v, width, HEIGHT, 0, buf);
  const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve, outlineWidthsByRank: opts.widths, outlineMode: opts.outlineMode ?? 'strong' });
  return { model, buf, n, style, plot: width - GUTTER, width, view: v };
}
/** Dense lanes: 1–6 px rects (the view is the whole domain, 288 px), mixed depths, ranks, boundaries and colours. */
function denseLanes(seed: number, laneCount: number, perLane: number, o: { depths?: number; plain?: boolean } = {}): TimelineLane[] {
  const random = rng(seed);
  return Array.from({ length: laneCount }, (_, l) => ({ id: `l${l}`, label: `L${l}`, segments: Array.from({ length: perLane }, (_, i) => {
    const start = random() * 1000; const kind = random();
    return { id: `l${l}s${i}`, start, end: start + 1 + random() * 20, depth: Math.floor(random() * (o.depths ?? 4)),
      colorToken: kind < 0.2 ? undefined : COLORS[Math.floor(random() * 4)], neutral: kind > 0.9 || undefined, rank: !o.plain && random() < 0.3 ? 'a' : undefined,
      startBoundary: !o.plain && random() < 0.1 ? 'orphan' as const : undefined, endBoundary: !o.plain && random() < 0.1 ? 'open' as const : undefined };
  }) }));
}

/** The frozen pre-#1746 painter (verbatim loop in laneTimelineOracle.ts) on the old preparation and geometry, with the same colour resolution as the new style. */
function oldRects(lanes: TimelineLane[], view: [number, number] | undefined, width = WIDTH, scroll = 0, height = HEIGHT): { rects: OldRect[]; view: [number, number] } {
  const old = oldPrepareLanes(lanes); const v = view ?? old.domain; return { rects: oldVisibleRects(old, v, width, height, scroll), view: v };
}
function exactPaint(ctx: CanvasRenderingContext2D, rects: OldRect[], opts: Opts = {}, width = WIDTH, selectedId: string | null = null) {
  oldPaintRects(ctx, rects, width - GUTTER, HEIGHT, { colors: COLORS, neutral: 'chart-no-data', resolve, outlineMode: opts.outlineMode ?? 'strong', outlineWidthsByRank: opts.widths, selectedId });
}
/** The new data layer inside the same plot clip the renderer sets up. */
function lodPaint(lanes: TimelineLane[], ctx: CanvasRenderingContext2D, lodAt: number, view: [number, number] | undefined, opts: Opts = {}, scroll = 0) {
  const model = prepareLanes(lanes, []); const v = view ?? model.domain;
  const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve, outlineWidthsByRank: opts.widths, outlineMode: opts.outlineMode ?? 'strong' });
  ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, PLOT, HEIGHT); ctx.clip();
  paintFrame(ctx, style, { view: v, width: WIDTH, height: HEIGHT, scroll }, new RectBuffer(), lodAt);
  ctx.restore();
}
const allRows = Array.from({ length: HEIGHT }, (_, r) => r);
type Raster = ReturnType<typeof rasterContext>;
/** Every sampled pixel of `a` and `b` carries the same colours with the same weights, in the given columns. */
function expectSamePixels(a: Raster, b: Raster, from = 0, to = WIDTH) {
  for (const [row, cells] of a.pixels) for (let c = from; c < to; c++) {
    const x = pixelColours(cells[c]); const y = pixelColours(b.pixels.get(row)![c]);
    if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error(`pixel row ${row} column ${c}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
  }
}
/** The expected LOD fills from the independent winners: one opaque column rect per (lane, depth, column), depth ascending, over the plot clip. */
function winnerRaster(rects: OldRect[], rows: number[], laneOnly?: number) {
  const r = rasterContext(WIDTH, rows); r.ctx.save(); r.ctx.beginPath(); r.ctx.rect(GUTTER, 0, PLOT, HEIGHT); r.ctx.clip();
  const winners = oldWinners(rects, Math.ceil(WIDTH) + 2).filter(w => laneOnly === undefined || w.lane === laneOnly).sort((p, q) => p.depth - q.depth || p.lane - q.lane || p.column - q.column);
  for (const w of winners) {
    const { segment } = w.rect;
    r.ctx.fillStyle = resolve(segment.colorToken ?? (segment.neutral ? 'chart-no-data' : COLORS[w.lane % COLORS.length]));
    r.ctx.fillRect(w.column, w.rect.y, 1, w.rect.height);
  }
  r.ctx.restore(); return r;
}
/** Dense filler that forces LOD without touching the fixture: two-pixel segments at [200,202] plus the two domain end points (view [0,288], 1 px per time unit). */
const FILLERS = Array.from({ length: 290 }, (_, i) => ({ id: `fill${i}`, start: 200, end: 202, colorToken: 'chart-series-3' as const }));
const ENDS = [{ id: 'first', start: 0, end: 2, colorToken: 'chart-series-3' as const }, { id: 'last', start: 286, end: 288, colorToken: 'chart-series-3' as const }];
type Seg = TimelineLane['segments'][number];

describe('LOD vs the exact painter (oracle)', () => {
  const lanes = denseLanes(7, 3, 700, { plain: true }); // fills only: decorations have their own tests below
  const sampleRows = lanes.map((_, l) => l * ROW_HEIGHT + 12); // every inset is at most 11, so this pixel row lies inside every rect of the lane
  it('matches on columns fully covered by their paint-last rect; edge columns show the independent coverage winner of the top depth', () => {
    const { rects, view } = oldRects(lanes, undefined);
    const exact = rasterContext(WIDTH, sampleRows); exactPaint(exact.ctx, rects);
    const lod = rasterContext(WIDTH, sampleRows); lodPaint(lanes, lod.ctx, PLOT, view);
    const winners = oldWinners(rects, WIDTH + 2); const winnerAt = (l: number, depth: number, c: number) => winners.find(w => w.lane === l && w.depth === depth && w.column === c);
    const colorOfRect = (r: OldRect) => resolve(r.segment.colorToken ?? (r.segment.neutral ? 'chart-no-data' : COLORS[r.laneIndex % COLORS.length]));
    let pure = 0; let edge = 0; let edgeDiffers = 0;
    for (let l = 0; l < lanes.length; l++) {
      for (let c = GUTTER; c < WIDTH; c++) {
        const touching = rects.filter(r => r.laneIndex === l && Math.min(r.x + r.width, c + 1) - Math.max(r.x, c) > 0); // paint order
        const a = exact.pixels.get(sampleRows[l])![c]; const b = lod.pixels.get(sampleRows[l])![c];
        if (!touching.length) { expect(pixelColours(b)).toEqual([]); continue; }
        const last = touching[touching.length - 1]; const lastCover = Math.min(last.x + last.width, c + 1) - Math.max(last.x, c);
        const topDepth = Math.max(...touching.map(r => r.segment.depth ?? 0)); const winner = winnerAt(l, topDepth, c)!;
        if (lastCover >= 1 - 1e-9) {
          pure++;
          expect(pixelColours(a)).toEqual([[colorOfRect(last), 1]]); expect(pixelColours(b)).toEqual([[colorOfRect(last), 1]]);
        } else {
          edge++;
          // Allowed difference: LOD paints one opaque colour, that of the maximum-coverage rect of the top depth (ties to the highest input index), where the exact painter blends the touching rects.
          expect(pixelColours(b)).toEqual([[colorOfRect(winner.rect), 1]]);
          if (colorOfRect(winner.rect) !== [...a.entries()].sort((x, y) => y[1] - x[1])[0][0]) edgeDiffers++;
        }
      }
    }
    expect(pure).toBeGreaterThan(100); expect(edge).toBeGreaterThan(50); expect(edgeDiffers).toBeLessThan(edge);
  });
  it.each([0, 7.5])('fills equal the independently computed per-depth winners: depths 0..8 (inset clamp) and scroll %s', scroll => {
    const five = denseLanes(21, 5, 600, { depths: 9, plain: true });
    const { rects, view } = oldRects(five, undefined, WIDTH, scroll);
    // Allowed difference: where two lanes meet inside one pixel row (fractional scroll) their blend order is colour-grouped in LOD, input order in the exact painter; those rows are left out.
    const rows = allRows.filter(r => !scroll || (r + 8) % ROW_HEIGHT !== 0);
    const lod = rasterContext(WIDTH, rows); lodPaint(five, lod.ctx, PLOT, view, {}, scroll);
    expectSamePixels(winnerRaster(rects, rows), lod);
    expect(Math.max(...rects.map(r => r.segment.depth ?? 0))).toBeGreaterThan(5);
  });
  it('draws decorations only for rects the exact painter also decorates, and keeps those of an unobstructed rect', () => {
    const decorated = denseLanes(7, 3, 700); const opts = { widths: { a: 2 } }; const { rects, view } = oldRects(decorated, undefined);
    const exact: Op[] = []; exactPaint(recordingContext(exact), rects, opts);
    const lod: Op[] = []; lodPaint(decorated, recordingContext(lod), PLOT, view, opts);
    const sig = (log: Op[]) => log.filter(op => op[0] === 'strokeRect' || op[0] === 'moveTo').map(op => op.join(','));
    const exactSigs = new Map<string, number>(); for (const s of sig(exact)) exactSigs.set(s, (exactSigs.get(s) ?? 0) + 1);
    const lodSigs = sig(lod); expect(lodSigs.length).toBeGreaterThan(0); expect(lodSigs.length).toBeLessThan(sig(exact).length);
    // Rect geometry is identical in both paths, so every LOD decoration signature must exist in the exact sequence.
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
    const opts = { widths: { a: 1 } }; const { rects, view } = oldRects([lane], [0, 300]);
    const run = (exact: boolean) => { const log: Op[] = []; if (exact) exactPaint(recordingContext(log), rects, opts); else lodPaint([lane], recordingContext(log), PLOT, view, opts); return log; };
    const chevrons = (log: Op[]) => log.filter(op => op[0] === 'moveTo').map(op => op[1] as number);
    const at = (t: number) => GUTTER + t / 300 * PLOT + 5;
    const has = (xs: number[], x: number) => xs.some(v => Math.abs(v - x) < 1e-6);
    expect(has(chevrons(run(true)), at(100))).toBe(true);
    expect(has(chevrons(run(false)), at(100))).toBe(true);
    // The exact painter still strokes "hidden" before "cover" paints over it; LOD never emits it because it wins no column.
    expect(has(chevrons(run(true)), at(150))).toBe(true);
    expect(has(chevrons(run(false)), at(150))).toBe(false);
  });
  it('flags used by the fixtures are the model flags', () => { expect(FLAG_ORPHAN).toBe(1); expect(FLAG_OPEN).toBe(2); expect(outlineStyle('a', { a: 1 }, 'strong').width).toBe(1); });
});

describe('decorations keep the exact painter occlusion (C1)', () => {
  const widths = { a: 2, b: 1 };
  const compare = (lane: TimelineLane, opts: Opts, from = 0, to = WIDTH) => {
    const { rects, view } = oldRects([lane], [0, 288]);
    const exact = rasterContext(WIDTH, allRows); exactPaint(exact.ctx, rects, opts);
    const lod = rasterContext(WIDTH, allRows); lodPaint([lane], lod.ctx, PLOT, view, opts);
    expectSamePixels(exact, lod, from, to); return { exact, lod };
  };
  it('RF fixture: a later same-depth segment covers the right border and the top and bottom borders of the ranked one', () => {
    // A=[10,30] red ranked, B=[20,40] blue unranked and later, 286 fillers (points at 0 and 288 and 284 segments at [200,201]); strong outline width 2.
    const segments: Seg[] = [
      { id: 'A', start: 10, end: 30, colorToken: 'chart-series-1', rank: 'a' }, { id: 'B', start: 20, end: 40, colorToken: 'chart-series-2' },
      { id: 'p0', start: 0, end: 0 }, { id: 'p1', start: 288, end: 288 }, ...Array.from({ length: 284 }, (_, i) => ({ id: `f${i}`, start: 200, end: 201 })),
    ];
    const lane = { id: 'x', label: 'X', segments };
    // Every column but the 1.5 px end points' (edge columns, where LOD differs by design) must match the exact painter pixel for pixel.
    const { exact, lod } = compare(lane, { widths }, 116, 396);
    for (const c of [132, 135, 141, 150]) { // B takes 132..151: row 0 and the border rows are B's fill, not A's border
      expect(pixelColours(exact.pixels.get(0)![c])).toEqual([[resolve('chart-series-2'), 1]]); expect(pixelColours(lod.pixels.get(0)![c])).toEqual([[resolve('chart-series-2'), 1]]);
    }
    expect(pixelColours(lod.pixels.get(0)![125]).map(([k]) => k)).toContain(resolve('border-strong')); // A's visible top border to the left of B
  });
  it('ranked, orphan, open, weak-dashed and deeper-over-shallower segments match the exact painter on every sampled pixel', () => {
    const segments: Seg[] = [
      { id: 'A', start: 10, end: 30, colorToken: 'chart-series-1', rank: 'a' }, { id: 'B', start: 20, end: 40, colorToken: 'chart-series-2' },
      { id: 'o1', start: 60, end: 63, colorToken: 'chart-series-1', startBoundary: 'orphan' }, { id: 'o2', start: 63, end: 70, colorToken: 'chart-series-2' }, // chevron overhangs a later neighbour
      { id: 'e1', start: 74, end: 76, colorToken: 'chart-series-2' }, { id: 'o3', start: 77, end: 79, colorToken: 'chart-series-1', startBoundary: 'orphan', endBoundary: 'open' }, // overhangs nothing later
      { id: 'op1', start: 80, end: 90, colorToken: 'chart-series-2', endBoundary: 'open', rank: 'b' }, { id: 'op2', start: 90, end: 96, colorToken: 'chart-series-1' },
      { id: 'd0', start: 130, end: 150, colorToken: 'chart-series-2' }, { id: 'd1', start: 120, end: 140, depth: 1, colorToken: 'chart-series-1', rank: 'a', startBoundary: 'orphan', endBoundary: 'open' },
      { id: 'u0', start: 160, end: 170, colorToken: 'chart-series-2', rank: 'b' }, { id: 'u1', start: 165, end: 180, colorToken: 'chart-series-1', rank: 'a' }, // both ranked, later covers earlier's right border
      ...ENDS, ...FILLERS,
    ];
    for (const mode of ['strong', 'weak', 'off'] as const) compare({ id: 'x', label: 'X', segments }, { widths, outlineMode: mode }, GUTTER, WIDTH);
  });
});

describe('winner coverage keeps full precision (C2)', () => {
  const fixture = (a: [number, number], b: [number, number]): TimelineLane => ({ id: 'x', label: 'X', segments: [
    { id: 'A', start: a[0], end: a[1], colorToken: 'chart-series-1' }, { id: 'B', start: b[0], end: b[1], colorToken: 'chart-series-2' },
    { id: 'p0', start: 0, end: 0 }, { id: 'p1', start: 288, end: 288 }, ...Array.from({ length: 284 }, (_, i) => ({ id: `f${i}`, start: 200, end: 201 })),
  ] });
  const columns = (lane: TimelineLane) => {
    const { rects, view } = oldRects([lane], [0, 288]); const lod = rasterContext(WIDTH, [12]); lodPaint([lane], lod.ctx, PLOT, view);
    const winners = oldWinners(rects, WIDTH + 2).filter(w => w.depth === 0);
    return { lod, winners, at: (c: number) => pixelColours(lod.pixels.get(12)![c]) };
  };
  it('equal coverage goes to the highest input index in every touched column', () => {
    const { at, winners } = columns(fixture([10.6, 10.6], [10.6, 10.6]));
    for (const c of [122, 123, 124]) {
      expect(winners.find(w => w.column === c)!.rect.segment.id).toBe('B');
      expect(at(c)).toEqual([[resolve('chart-series-2'), 1]]);
    }
  });
  it('near-equal coverage goes to the larger one, not to the rounded one', () => {
    const { at, winners } = columns(fixture([10.1, 10.1], [10.10000001, 10.10000001]));
    // Column 122: A covers 0.9, B 0.89999999 (A wins; B would win on Float32-rounded values). Column 123: B covers 0.60000001 against A's 0.6.
    expect(winners.find(w => w.column === 122)!.rect.segment.id).toBe('A'); expect(at(122)).toEqual([[resolve('chart-series-1'), 1]]);
    expect(winners.find(w => w.column === 123)!.rect.segment.id).toBe('B'); expect(at(123)).toEqual([[resolve('chart-series-2'), 1]]);
  });
});

describe('mixed sparse and LOD lanes in one frame', () => {
  it('the sparse lane matches the frozen painter pixel for pixel; the dense lane matches the independent winners', () => {
    const sparse: TimelineLane = { id: 'sp', label: 'Sparse', segments: denseLanes(31, 1, 30)[0].segments.map(s => ({ ...s, id: `sp${s.id}` })) };
    const dense: TimelineLane = { id: 'de', label: 'Dense', segments: denseLanes(32, 1, 600, { depths: 7, plain: true })[0].segments.map(s => ({ ...s, id: `de${s.id}` })) };
    const lanes = [sparse, dense]; const opts = { widths: { a: 2 } };
    const { rects, view } = oldRects(lanes, [0, 1000]);
    const exact = rasterContext(WIDTH, allRows); exactPaint(exact.ctx, rects, opts);
    const lod = rasterContext(WIDTH, allRows); lodPaint(lanes, lod.ctx, PLOT, view, opts);
    const model = prepareLanes(lanes, []); expect(laneWindowCounts(model, view)).toEqual([expect.any(Number), expect.any(Number)]);
    const [n0, n1] = laneWindowCounts(model, view); expect(n0).toBeLessThan(PLOT); expect(n1).toBeGreaterThanOrEqual(PLOT);
    const sparseRows = Array.from({ length: ROW_HEIGHT }, (_, r) => r); const denseRows = sparseRows.map(r => r + ROW_HEIGHT);
    const sub = (r: Raster, rows: number[]) => ({ ...r, pixels: new Map(rows.map(row => [row, r.pixels.get(row)!])) }) as Raster;
    expectSamePixels(sub(exact, sparseRows), sub(lod, sparseRows));
    expectSamePixels(sub(winnerRaster(rects, allRows, 1), denseRows), sub(lod, denseRows));
  });
});
function laneWindowCounts(model: ReturnType<typeof prepareLanes>, view: [number, number]) {
  return model.cols.map(cols => { const w: number[] = []; laneWindow(cols, view[0], view[1], w); return w.length; });
}

/** Paints one frame with a scratch buffer of its own, so `f.buf` stays the independent oracle input. */
function paint(f: ReturnType<typeof frame>, ctx: CanvasRenderingContext2D, lodAt: number) {
  paintFrame(ctx, f.style, { view: f.view, width: f.width, height: HEIGHT, scroll: 0 }, new RectBuffer(), lodAt);
}
function colorOf(f: ReturnType<typeof frame>, k: number) {
  const cols = f.model.cols[f.buf.laneIndex[k]]; const o = f.buf.offset[k]; const code = cols.color[o];
  return code ? f.style.codeId[code] : cols.flags[o] & 4 ? f.style.neutralId : f.style.paletteIds[f.buf.laneIndex[k] % f.style.paletteIds.length];
}

describe('zoomed-in frames keep the exact fillRect sequence', () => {
  it.each(['strong', 'weak', 'off'] as const)('issues the same op sequence as the frozen old loop below the density threshold (outline %s)', mode => {
    const sparse = denseLanes(3, 3, 60); // 60 visible segments per lane against a 288 px plot
    const opts = { outlineMode: mode, widths: { a: 2 } }; const { rects, view } = oldRects(sparse, undefined);
    const expected: Op[] = []; exactPaint(recordingContext(expected), rects, opts);
    const actual: Op[] = []; lodPaint(sparse, recordingContext(actual), PLOT, view, opts);
    expect(actual).toEqual(expected);
    expect(count(actual, 'fillRect')).toBe(rects.length);
  });
  it('differs from the old loop by the selection stroke only, which moved to the overlay layer', () => {
    const sparse = denseLanes(3, 3, 60); const { rects, view } = oldRects(sparse, undefined); const id = rects[17].segment.id;
    const withSelection: Op[] = []; exactPaint(recordingContext(withSelection), rects, { widths: { a: 2 } }, WIDTH, id);
    const at = withSelection.findIndex(op => op[0] === '=strokeStyle' && op[1] === 'c:chart-selection-outline');
    expect(withSelection.slice(at, at + 3).map(op => op[0])).toEqual(['=strokeStyle', '=lineWidth', 'strokeRect']);
    const actual: Op[] = []; lodPaint(sparse, recordingContext(actual), PLOT, view, { widths: { a: 2 } });
    expect(actual).toEqual([...withSelection.slice(0, at), ...withSelection.slice(at + 3)]);
  });
});

describe('bucket storage is bounded by the width, not by the number of depths (C3)', () => {
  const fillLog = () => {
    const rectsLog: number[][] = []; const styles: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'fillRect' ? (...a: number[]) => { rectsLog.push([...a, styles.length]); } : () => {}), set: (_t, k, v) => { if (k === 'fillStyle') styles.push(v); return true; } }) as unknown as CanvasRenderingContext2D;
    return { ctx, rectsLog, styles };
  };
  const run = (lanes: TimelineLane[], width: number) => {
    const model = prepareLanes(lanes, []); const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve, outlineMode: 'strong' });
    const stats: LodStats = { bucketBytes: 0, groupBytes: 0 }; const log = fillLog();
    paintFrame(log.ctx, style, { view: model.domain, width, height: 120, scroll: 0 }, new RectBuffer(), width - GUTTER, stats);
    return { stats, ...log, model };
  };
  it('200k segments with a distinct depth each: peak bucket bytes equal those of a single-depth lane of the same width', () => {
    const n = 200_000; const width = 1440;
    const deep: TimelineLane = { id: 'd', label: 'D', segments: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, start: i, end: i, depth: i })) };
    const flat: TimelineLane = { id: 'd', label: 'D', segments: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, start: i, end: i })) };
    const a = run([deep], width); const b = run([flat], width);
    expect(a.stats.bucketBytes).toBe(b.stats.bucketBytes);
    expect(a.stats.bucketBytes).toBeLessThanOrEqual(64 * (width + 2));
    expect(a.stats.groupBytes).toBeLessThanOrEqual(16 * n);
    // Correct frame: depth i paints its own columns at inset min(2i, 11), passes in ascending depth.
    const ys = a.rectsLog.map(r => r[1] % ROW_HEIGHT); expect(ys).toEqual([...ys].sort((p, q) => p - q));
    for (const i of [0, 1, 5, 6, 100_000, n - 1]) {
      const x0 = GUTTER + i / (n - 1) * (width - GUTTER); const x = Math.min(x0, width - 1.5);
      const c0 = Math.floor(x); const c1 = Math.ceil(x + 1.5); const inset = Math.min(i * 2, 11);
      expect(a.rectsLog.some(r => r[0] === c0 && r[2] === c1 - c0 && r[1] === inset && r[3] === ROW_HEIGHT - inset * 2)).toBe(true);
    }
    expect(a.styles.length).toBeLessThanOrEqual(n);
  }, 60_000);
  it('depths too sparse for a counting sort still pass in ascending order', () => {
    const lane: TimelineLane = { id: 'd', label: 'D', segments: Array.from({ length: 400 }, (_, i) => ({ id: `s${i}`, start: i % 100, end: i % 100 + 1, depth: (i % 7) * 1_000_000 })) };
    const r = run([lane], 400); const ys = r.rectsLog.map(x => x[1]); expect(ys).toEqual([...ys].sort((p, q) => p - q));
    expect(new Set(ys)).toEqual(new Set([0, 11])); // depth 0 and the clamped inset shared by every depth beyond 5
    expect(r.stats.groupBytes).toBeLessThanOrEqual(16 * 400);
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

// #2045 SHE-33: the pointer must identify the opaque pixel-column winner.
it.each([0.1, 0.9])('hits the painted winner across a dense pixel column at x=%s', fraction => {
  const lanes: TimelineLane[] = [{ id: 'dense', label: 'Dense', segments: [
    { id: 'wide', start: 20, end: 24, colorToken: COLORS[0] },
    { id: 'short', start: 20.8, end: 21, colorToken: COLORS[1] },
    ...FILLERS, ...ENDS,
  ] }];
  const f = frame(lanes, [0, 288]);
  const raster = rasterContext(WIDTH, [12]);
  const lodLanes = new Set<number>();
  paintFrame(raster.ctx, f.style, { view: f.view, width: WIDTH, height: HEIGHT, scroll: 0 }, f.buf, PLOT, undefined, lodLanes);
  expect(pixelColours(raster.pixels.get(12)![GUTTER + 20])).toEqual([[resolve(COLORS[0]), 1]]);
  expect(hitTest(f.model, f.view, WIDTH, HEIGHT, 0, GUTTER + 20 + fraction, 12, undefined, lodLanes)?.segment.id).toBe('wide');
});
