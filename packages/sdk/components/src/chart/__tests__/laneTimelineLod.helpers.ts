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
/** Rasterises fillRect only (clip honoured) into the given sample rows, with fractional coverage and source-over compositing. */
export function rasterContext(width: number, rows: number[]) {
  const pixels = new Map<number, Pixel[]>(rows.map(r => [r, Array.from({ length: width }, () => new Map())]));
  type Box = [number, number, number, number];
  let fill = ''; let clip: Box | null = null; let pending: Box | null = null; const saved: (Box | null)[] = [];
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    save() { saved.push(clip); }, restore() { clip = saved.pop() ?? null; },
    beginPath() {}, rect(x: number, y: number, w: number, h: number) { pending = [x, y, w, h]; }, clip() { clip = pending; },
    fillRect(x: number, y: number, w: number, h: number) {
      let x0 = x; let x1 = x + w; let y0 = y; let y1 = y + h;
      if (clip) { x0 = Math.max(x0, clip[0]); x1 = Math.min(x1, clip[0] + clip[2]); y0 = Math.max(y0, clip[1]); y1 = Math.min(y1, clip[1] + clip[3]); }
      for (const row of rows) {
        const vertical = Math.min(y1, row + 1) - Math.max(y0, row); if (vertical <= 0) continue;
        for (let c = Math.max(0, Math.floor(x0)); c < Math.min(width, Math.ceil(x1)); c++) {
          const alpha = vertical * Math.max(0, Math.min(x1, c + 1) - Math.max(x0, c)); if (alpha <= 0) continue;
          const pixel = pixels.get(row)![c];
          for (const [k, v] of pixel) pixel.set(k, v * (1 - alpha));
          pixel.set(fill, (pixel.get(fill) ?? 0) + alpha);
        }
      }
    },
  };
  return { ctx: new Proxy(ctx, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}), set: (t, k, v) => { if (k === 'fillStyle') fill = v; else (t as Record<string | symbol, unknown>)[k] = v; return true; } }) as unknown as CanvasRenderingContext2D, pixels };
}
