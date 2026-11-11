import { isThemeColorToken, type ThemeColorToken } from '@ap/ui/theme';
import { GUTTER, laneDiagnostic, ROW_HEIGHT, segmentRect, utcTick, type LaneModel } from './laneTimelineGeometry';
import type { TimelineOverlay } from './laneTimelineTypes';

/** The JS Date limit, as for segments. */
const MAX_TIME = 8.64e15;
const DEFAULT_DASH = [4, 3];
// eslint-disable-next-line shadcn/no-raw-colors -- canvas reads a theme token by name (resolved by the renderer), not a class string
const MARK_TOKEN: ThemeColorToken = 'text-primary';
/** An overlay after validation: tokens and dashes are known good. */
export type ValidOverlay = TimelineOverlay;

/** Drops overlays the layer cannot draw (non-finite times, start after end, duplicate ids, malformed fields), each with one diagnostic, and strips invalid colour tokens. Input order is kept. */
export function validateOverlays(input: readonly TimelineOverlay[] | undefined): ValidOverlay[] {
  if (!input?.length) return [];
  const seen = new Set<string>(); const out: ValidOverlay[] = [];
  for (const overlay of input) {
    if (!overlay || typeof overlay.id !== 'string') { laneDiagnostic('overlay without an id dropped'); continue; }
    if (seen.has(overlay.id)) { laneDiagnostic('duplicate overlay ID dropped'); continue; }
    let next: ValidOverlay = overlay;
    if (overlay.kind === 'instant') {
      if (!Number.isFinite(overlay.time)) { laneDiagnostic('overlay with a non-finite time dropped'); continue; }
      if (Math.abs(overlay.time) > MAX_TIME) { laneDiagnostic('overlay time outside the date range dropped'); continue; }
    } else if (overlay.kind === 'range') {
      if (!Number.isFinite(overlay.start) || !Number.isFinite(overlay.end)) { laneDiagnostic('overlay with a non-finite time dropped'); continue; }
      if (Math.abs(overlay.start) > MAX_TIME || Math.abs(overlay.end) > MAX_TIME) { laneDiagnostic('overlay time outside the date range dropped'); continue; }
      if (overlay.start > overlay.end) { laneDiagnostic('overlay range with start after end dropped'); continue; }
    } else if (overlay.kind === 'segments') {
      if (!Array.isArray(overlay.segmentIds)) { laneDiagnostic('segments overlay without segmentIds dropped'); continue; }
    } else { laneDiagnostic('overlay of an unknown kind dropped'); continue; }
    if (overlay.colorToken !== undefined && !isThemeColorToken(overlay.colorToken)) {
      laneDiagnostic('invalid overlay color; using the default'); next = { ...overlay, colorToken: undefined };
    }
    seen.add(overlay.id); out.push(next);
  }
  return out;
}

/** Labelled overlays as screen-reader lines; the canvas itself is invisible to assistive technology. */
export function overlaySummaries(overlays: readonly ValidOverlay[]): string[] {
  const lines: string[] = [];
  for (const overlay of overlays) {
    if (overlay.kind === 'instant' && overlay.label) lines.push(`${overlay.label} · ${utcTick(overlay.time)}`);
    else if (overlay.kind === 'range' && overlay.label) lines.push(`${overlay.label} · ${utcTick(overlay.start)} – ${utcTick(overlay.end)}`);
  }
  return lines;
}

/** Overlays with lane and segment references resolved once per (overlays, model) pair. `flats` are flat segment positions; unknown ids are skipped. */
const KIND_ORDER = { range: 0, instant: 1, segments: 2 } as const;
export type ResolvedOverlays = { items: { overlay: ValidOverlay; lane: number; flats: number[] }[] };
export function resolveOverlays(overlays: readonly ValidOverlay[], model: LaneModel): ResolvedOverlays {
  const items: ResolvedOverlays['items'] = []; let unknown = false;
  let laneIndex: Map<string, number> | null = null;
  for (const overlay of overlays) {
    let lane = -1; const flats: number[] = [];
    if (overlay.kind !== 'segments' && overlay.laneId !== undefined) {
      laneIndex ??= new Map(model.lanes.map((l, i) => [l.id, i]));
      lane = laneIndex.get(overlay.laneId) ?? -2;
      if (lane === -2) { unknown = true; continue; }
    }
    if (overlay.kind === 'segments') {
      for (const id of overlay.segmentIds) { const item = model.byId.get(id); if (item) flats.push(item.index); else unknown = true; }
    }
    items.push({ overlay, lane, flats });
  }
  if (unknown) laneDiagnostic('overlay refers to an unknown lane or segment; skipped');
  // Paint order is by kind (range < instant < segments), whatever the array order; input order holds within a kind (stable sort).
  items.sort((a, b) => KIND_ORDER[a.overlay.kind] - KIND_ORDER[b.overlay.kind]);
  return { items };
}

export type OverlayFrame = { model: LaneModel; view: [number, number]; width: number; height: number; scroll: number; resolve: (token: ThemeColorToken) => string; font: string };
const dashOf = (dash: boolean | number[] | undefined) => {
  if (Array.isArray(dash)) { const clean = dash.filter(n => Number.isFinite(n) && n >= 0); return clean.length ? clean : DEFAULT_DASH; }
  return dash ? DEFAULT_DASH : [];
};

/**
 * Paints the overlays by kind (range, instant, segments; array order within a kind) onto a cleared overlay canvas. The selection outline is drawn by the caller afterwards, so it stays on top.
 * Only what the view window and visible lane rows contain is touched.
 */
export function drawOverlays(ctx: CanvasRenderingContext2D, resolved: ResolvedOverlays, frame: OverlayFrame) {
  if (!resolved.items.length) return;
  const { model, view, width, height, scroll } = frame; const plotWidth = Math.max(1, width - GUTTER); const span = view[1] - view[0];
  const x = (time: number) => GUTTER + (time - view[0]) / span * plotWidth;
  ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, plotWidth, height); ctx.clip();
  ctx.font = frame.font; ctx.textBaseline = 'top';
  for (const { overlay, lane, flats } of resolved.items) {
    if (overlay.kind === 'segments') {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = frame.resolve(overlay.colorToken ?? MARK_TOKEN);
      if (overlay.style === 'fill') ctx.globalAlpha = 0.35; else ctx.lineWidth = 2;
      for (const flat of flats) {
        const rect = segmentRect(model, flat, view, width, height, scroll); if (!rect) continue;
        if (overlay.style === 'fill') ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        else ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2));
      }
      ctx.restore(); continue;
    }
    const top = lane >= 0 ? lane * ROW_HEIGHT - scroll : 0; const bottom = lane >= 0 ? top + ROW_HEIGHT : height;
    if (bottom < 0 || top > height) continue;
    const y0 = Math.max(0, top); const y1 = Math.min(height, bottom);
    if (overlay.kind === 'instant') {
      if (overlay.time < view[0] || overlay.time > view[1]) continue;
      const px = Math.round(x(overlay.time)) + 0.5;
      ctx.save(); ctx.strokeStyle = frame.resolve(overlay.colorToken ?? MARK_TOKEN); ctx.lineWidth = 1; ctx.setLineDash(dashOf(overlay.dash));
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke(); ctx.restore();
      if (overlay.label) { ctx.fillStyle = frame.resolve(overlay.colorToken ?? MARK_TOKEN); ctx.fillText(overlay.label, px + 3, y0 + 2); }
    } else {
      if (overlay.end < view[0] || overlay.start > view[1]) continue;
      const left = Math.max(GUTTER, x(overlay.start)); const right = Math.min(GUTTER + plotWidth, x(overlay.end));
      const color = frame.resolve(overlay.colorToken ?? 'chart-series-1');
      ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = 0.18; ctx.fillRect(left, y0, Math.max(1, right - left), y1 - y0);
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, y0 + 0.5, Math.max(0, right - left - 1), Math.max(0, y1 - y0 - 1)); ctx.restore();
      if (overlay.label) { ctx.fillStyle = color; ctx.fillText(overlay.label, left + 3, y0 + 2); }
    }
  }
  ctx.restore();
}
