// Test helpers for the LaneTimeline LOD painter: the stage-1 synthetic data generator (copied from the #1746 bench harness; its 6 accent-* tokens are not lint-clean in .ts files, so 16 chart tokens are used), a recording
// canvas stub, and a per-pixel rasteriser with source-over compositing.
import type { ThemeColorToken } from '@ap/ui/theme';
import type { TimelineLane } from '../LaneTimeline';
import { rng } from './laneTimelineOracle';

export const BENCH_TOKENS: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4', 'chart-blue', 'chart-green', 'chart-purple', 'chart-remainder',
  'chart-heat-seq-1', 'chart-heat-seq-2', 'chart-heat-seq-3', 'chart-heat-seq-4', 'chart-heat-div-0', 'chart-heat-div-1', 'chart-heat-div-3', 'chart-heat-div-4'];
/** Stage-1 bench data: 20 lanes, constant density (50k segments per 2 h), 3 % long segments, 120 kinds. */
export function benchLanes(n: number, outline = false): TimelineLane[] {
  const lanes = 20; const kinds = 120; const span = 7_200_000 * (n / 50000); const t0 = Date.UTC(2026, 10, 1, 0, 0, 0);
  const r = rng(1746); const per = Math.floor(n / lanes); const pitch = span / per;
  return Array.from({ length: lanes }, (_, l) => {
    const segments = []; let cursor = t0 + r() * pitch;
    for (let i = 0; i < per; i++) {
      const long = r() < 0.03; const dur = long ? 1000 + r() * 29000 : 50 + r() * 850;
      const kind = Math.floor(r() * r() * kinds);
      const start = cursor; const end = start + dur;
      segments.push({ id: `l${l}s${i}`, start, end, colorToken: BENCH_TOKENS[kind % BENCH_TOKENS.length], rank: outline && kind % 3 === 0 ? 'a' : undefined,
        ...(outline && i % 50 === 0 ? { endBoundary: 'open' as const } : {}) });
      cursor = Math.max(end + 1, t0 + (i + 1) * pitch + (r() - 0.5) * pitch * 0.5);
    }
    return { id: `lane-${l}`, label: `Lane ${l + 1}`, segments };
  });
}

export type Op = [string, ...unknown[]];
/** A context that records every method call (`name`, args) and property assignment (`=name`, value). */
export function recordingContext(log: Op[]) {
  return new Proxy({}, {
    get: (_t, name) => (...args: unknown[]) => { log.push([String(name), ...args]); return name === 'measureText' ? { width: 100 } : undefined; },
    set: (_t, name, value) => { log.push([`=${String(name)}`, value]); return true; },
  }) as unknown as CanvasRenderingContext2D;
}
export const count = (log: Op[], name: string) => log.filter(op => op[0] === name).length;

/** Pixel weights per (sample row, column): Map<colour, weight>, weights sum to at most 1, the rest is the background. */
export type Pixel = Map<string, number>;
type Box = [number, number, number, number];
type Seg = { x0: number; y0: number; x1: number; y1: number };
const SAMPLES = 4;
/**
 * Rasterises into the given sample rows with source-over compositing. fillRect is analytic (fractional coverage); strokeRect and moveTo/lineTo paths are sampled on a 4 x 4 grid per
 * pixel as thick line segments (lineWidth, setLineDash with butt caps, globalAlpha); rectangular clips (several rect() calls make a union) nest by intersection; save/restore cover
 * clip, colours, width, alpha and dash. Not a faithful canvas: enough to compare two painters that issue the same primitives.
 */
export function rasterContext(width: number, rows: number[]) {
  const pixels = new Map<number, Pixel[]>(rows.map(r => [r, Array.from({ length: width }, () => new Map())]));
  type State = { fill: string; stroke: string; lineWidth: number; alpha: number; dash: number[]; clip: Box[] | null };
  let st: State = { fill: '', stroke: '', lineWidth: 1, alpha: 1, dash: [], clip: null }; const saved: State[] = [];
  let pendingRects: Box[] = []; let paths: number[][] = [];
  const composite = (row: number, c: number, alpha: number, color: string) => {
    if (alpha <= 0 || c < 0 || c >= width) return;
    const pixel = pixels.get(row)![c];
    for (const [k, v] of pixel) pixel.set(k, v * (1 - alpha));
    pixel.set(color, (pixel.get(color) ?? 0) + alpha);
  };
  const clipBoxes = (box: Box): Box[] => (st.clip ?? [box]).flatMap(c => {
    const x0 = Math.max(box[0], c[0]); const x1 = Math.min(box[0] + box[2], c[0] + c[2]); const y0 = Math.max(box[1], c[1]); const y1 = Math.min(box[1] + box[3], c[1] + c[3]);
    return x1 > x0 && y1 > y0 ? [[x0, y0, x1 - x0, y1 - y0] as Box] : [];
  });
  const inClip = (x: number, y: number) => !st.clip || st.clip.some(c => x >= c[0] && x < c[0] + c[2] && y >= c[1] && y < c[1] + c[3]);
  function fillBox(box: Box, color: string, alphaScale: number) {
    for (const [x, y, w, h] of clipBoxes(box)) {
      for (const row of rows) {
        const vertical = Math.min(y + h, row + 1) - Math.max(y, row); if (vertical <= 0) continue;
        for (let c = Math.max(0, Math.floor(x)); c < Math.min(width, Math.ceil(x + w)); c++) composite(row, c, vertical * Math.max(0, Math.min(x + w, c + 1) - Math.max(x, c)) * alphaScale, color);
      }
    }
  }
  /** Splits a polyline into the dash "on" pieces (the whole polyline when undashed). */
  function dashed(points: number[], closed: boolean): Seg[] {
    const out: Seg[] = []; const pts = closed ? [...points, points[0], points[1]] : points; const dash = st.dash.length ? st.dash : null;
    let on = true; let left = dash ? dash[0] : Infinity; let index = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      let [ax, ay] = [pts[i], pts[i + 1]]; const [bx, by] = [pts[i + 2], pts[i + 3]]; let rest = Math.hypot(bx - ax, by - ay);
      const ux = rest ? (bx - ax) / rest : 0; const uy = rest ? (by - ay) / rest : 0;
      while (rest > 1e-9) {
        const step = Math.min(rest, left); const nx = ax + ux * step; const ny = ay + uy * step;
        if (on) out.push({ x0: ax, y0: ay, x1: nx, y1: ny });
        ax = nx; ay = ny; rest -= step; left -= step;
        if (dash && left <= 1e-9) { index = (index + 1) % dash.length; on = !on; left = dash[index]; }
      }
    }
    return out;
  }
  function strokeSegs(segs: Seg[], extend: number) {
    if (!segs.length) return;
    const hw = st.lineWidth / 2; if (hw <= 0) return;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const s of segs) { minX = Math.min(minX, s.x0, s.x1); maxX = Math.max(maxX, s.x0, s.x1); minY = Math.min(minY, s.y0, s.y1); maxY = Math.max(maxY, s.y0, s.y1); }
    const pad = hw + extend; minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    for (const row of rows) {
      if (row + 1 <= minY || row >= maxY) continue;
      for (let c = Math.max(0, Math.floor(minX)); c < Math.min(width, Math.ceil(maxX)); c++) {
        let hits = 0;
        for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
          const px = c + (sx + 0.5) / SAMPLES; const py = row + (sy + 0.5) / SAMPLES;
          if (!inClip(px, py)) continue;
          if (segs.some(s => {
            const dx = s.x1 - s.x0; const dy = s.y1 - s.y0; const len = Math.hypot(dx, dy); if (!len) return false;
            const t = ((px - s.x0) * dx + (py - s.y0) * dy) / len; const d = Math.abs((px - s.x0) * dy - (py - s.y0) * dx) / len;
            return t >= -extend && t <= len + extend && d <= hw;
          })) hits++;
        }
        composite(row, c, hits / (SAMPLES * SAMPLES) * st.alpha, st.stroke);
      }
    }
  }
  const api = {
    save() { saved.push({ ...st, dash: [...st.dash], clip: st.clip && [...st.clip] }); }, restore() { st = saved.pop() ?? st; },
    beginPath() { pendingRects = []; paths = []; },
    rect(x: number, y: number, w: number, h: number) { pendingRects.push([x, y, w, h]); },
    clip() {
      const next = pendingRects; st.clip = st.clip ? next.flatMap(n => st.clip!.flatMap(c => {
        const x0 = Math.max(n[0], c[0]); const x1 = Math.min(n[0] + n[2], c[0] + c[2]); const y0 = Math.max(n[1], c[1]); const y1 = Math.min(n[1] + n[3], c[1] + c[3]);
        return x1 > x0 && y1 > y0 ? [[x0, y0, x1 - x0, y1 - y0] as Box] : [];
      })) : next;
    },
    setLineDash(d: number[]) { st.dash = [...d]; },
    moveTo(x: number, y: number) { paths.push([x, y]); }, lineTo(x: number, y: number) { paths[paths.length - 1]?.push(x, y); },
    stroke() { for (const p of paths) strokeSegs(dashed(p, false), 0); },
    fillRect(x: number, y: number, w: number, h: number) { fillBox([x, y, w, h], st.fill, st.alpha); },
    strokeRect(x: number, y: number, w: number, h: number) { strokeSegs(dashed([x, y, x + w, y, x + w, y + h, x, y + h], true), st.dash.length ? 0 : st.lineWidth / 2); },
  } as Record<string, unknown>;
  const props: Record<string, keyof State> = { fillStyle: 'fill', strokeStyle: 'stroke', lineWidth: 'lineWidth', globalAlpha: 'alpha' };
  const ctx = new Proxy(api, {
    get: (t, k) => (typeof k === 'string' && k in props ? st[props[k]] : k in t ? t[k as string] : () => {}),
    set: (_t, k, v) => { if (typeof k === 'string' && k in props) (st as Record<string, unknown>)[props[k]] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, pixels };
}
/** Pixels as plain data for comparison: colours with a non-negligible weight, rounded. */
export function pixelColours(pixel: Pixel) { return [...pixel.entries()].filter(([, v]) => v > 1e-6).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1)); }
