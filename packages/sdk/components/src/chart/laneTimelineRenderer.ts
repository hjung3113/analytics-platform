import { isThemeColorToken, readColorToken, type ThemeColorToken } from '@ap/ui/theme';
import type { LaneTimelineProps } from './LaneTimeline';
import { drawOverlays, resolveOverlays, type ResolvedOverlays, type ValidOverlay } from './laneTimelineOverlays';
import { clampView, densityBins, GUTTER, HEADER_HEIGHT, hitTest, laneDiagnostic, laneTickLabel, niceTicks, RectBuffer, ROW_HEIGHT, segmentRect, segmentText, type LaneModel } from './laneTimelineGeometry';
import { createLaneStyle, paintFrame, type LaneStyle } from './laneTimelineLod';

/** Everything the renderer reads from React. `update()` takes the same fields (without the elements) on every render. */
export type RendererState = {
  model: LaneModel; props: LaneTimelineProps; selectedId: string | null; lang: 'ko' | 'en'; overlays: readonly ValidOverlay[];
  onSelect: (id: string | null) => void; onHover: (text: string | null) => void;
};
type RendererInput = RendererState & {
  root: HTMLElement; scroll: HTMLDivElement; canvas: HTMLCanvasElement; overlay: HTMLCanvasElement; axis: HTMLCanvasElement;
  spacer: HTMLDivElement; tooltip: HTMLDivElement;
};
const defaultPalette: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
/** The props that change how the data layer looks, compared by contents (menus pass inline arrays and objects). */
const styleKeyOf = (props: LaneTimelineProps) => JSON.stringify([
  props.paletteTokens, props.neutralColorToken, props.outlineWidthsByRank && Object.entries(props.outlineWidthsByRank).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)), props.outlineMode,
]);
/**
 * Owns all mutable view geometry, event subscriptions and frame scheduling. No React state. Created once per mount; later prop changes arrive
 * through `update()`, which redraws the data layer only for a new model or a changed look, and only the overlay layer for a selection or overlay change.
 */
export function createLaneRenderer(input: RendererInput) {
  const { root, canvas, overlay, axis, scroll, spacer, tooltip } = input;
  // Latest React values. Callbacks and `formatTick`/`formatTooltip` are read at use, so a new identity never triggers a draw.
  let model = input.model; let props = input.props; let selectedId = input.selectedId; let lang = input.lang; let overlays = input.overlays;
  let onSelect = input.onSelect; let onHover = input.onHover;
  let view: [number, number] = [...model.domain];
  let width = 600; let height = 320; let raf: number | null = null; let destroyed = false;
  let dataDirty = true; let overlayDirty = true; let sizeKey = '';
  let drawn: { view: [number, number]; width: number; height: number; scroll: number } = { view: [...view], width, height, scroll: 0 };
  let hasDrawn = false;
  const hit = (x: number, y: number) => !hasDrawn ? undefined : hitTest(model, drawn.view, drawn.width, drawn.height, drawn.scroll, x, y);
  let drag: { pointer: number; x: number; view: [number, number]; moved: boolean } | null = null;
  let tooltipFrame: number | null = null;
  let lastHover: string | null = null;
  let styleKey = ''; let colors = defaultPalette; let neutral: ThemeColorToken = 'chart-no-data';
  function readStyleProps() {
    styleKey = styleKeyOf(props);
    const palette = props.paletteTokens?.filter(isThemeColorToken);
    if (props.paletteTokens && (!palette?.length || palette.length !== props.paletteTokens.length)) laneDiagnostic('invalid or empty palette; invalid entries dropped, empty uses defaults');
    colors = palette?.length ? palette : defaultPalette;
    neutral = typeof props.neutralColorToken === 'string' && isThemeColorToken(props.neutralColorToken) ? props.neutralColorToken : 'chart-no-data';
    if (props.neutralColorToken !== undefined && !isThemeColorToken(props.neutralColorToken)) laneDiagnostic('invalid neutral token; using chart-no-data');
  }
  readStyleProps();
  // Resolved once per theme/resize, never once per segment.
  let resolved = new Map<ThemeColorToken, string>();
  function color(token: ThemeColorToken) {
    let value = resolved.get(token); if (!value) { value = readColorToken(token, root); resolved.set(token, value); } return value;
  }
  // Colours and outline styles as strings and small ids; dropped with `resolved` on a theme change or resize.
  let styleCache: LaneStyle | null = null;
  function laneStyle() {
    return styleCache ??= createLaneStyle({ model, colors, neutral, resolve: color, outlineWidthsByRank: props.outlineWidthsByRank, outlineMode: props.outlineMode ?? 'strong' });
  }
  // Overlay references (lane rows, segment ids) are resolved when the overlays or the model change, not per frame.
  let overlayCache: { overlays: readonly ValidOverlay[]; model: LaneModel; resolved: ResolvedOverlays } | null = null;
  function resolvedOverlays() {
    if (!overlayCache || overlayCache.overlays !== overlays || overlayCache.model !== model) overlayCache = { overlays, model, resolved: resolveOverlays(overlays, model) };
    return overlayCache.resolved;
  }
  const buf = new RectBuffer();
  /** `data` redraws axis, data layer and overlay layer; otherwise only the overlay layer. One frame serves both. */
  function schedule(data = true) {
    if (data) dataDirty = true; else overlayDirty = true;
    if (!destroyed && raf === null) raf = requestAnimationFrame(frame);
  }
  /** Re-measures; a size, height or pixel ratio equal to the current one does nothing, so the ResizeObserver's initial callback adds no second draw. */
  function resize() {
    const nextWidth = Math.max(352, scroll.clientWidth || scroll.getBoundingClientRect().width || 600);
    const nextHeight = Math.max(24, (Number.isFinite(props.height) ? props.height! : 360) - HEADER_HEIGHT);
    const key = `${nextWidth}|${nextHeight}|${window.devicePixelRatio || 1}|${model.lanes.length}`;
    if (key === sizeKey) return;
    sizeKey = key; width = nextWidth; height = nextHeight;
    scroll.style.height = `${height}px`; spacer.style.height = `${model.lanes.length * ROW_HEIGHT}px`;
    resolved = new Map(); styleCache = null; schedule();
  }
  function setup(target: HTMLCanvasElement, h: number) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    target.width = Math.round(width * dpr); target.height = Math.round(h * dpr);
    target.style.width = `${width}px`; target.style.height = `${h}px`;
    const ctx = target.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, h); }
    return ctx;
  }
  function frame() {
    raf = null; if (destroyed) return;
    if (dataDirty) { dataDirty = false; overlayDirty = false; drawData(); drawOverlay(); }
    else if (overlayDirty) { overlayDirty = false; drawOverlay(); }
  }
  function drawData() {
    const header = setup(axis, HEADER_HEIGHT); const ctx = setup(canvas, height);
    const plotWidth = width - GUTTER;
    const x = (time: number) => GUTTER + (time - view[0]) / (view[1] - view[0]) * plotWidth;
    if (header) {
      const computed = getComputedStyle(root);
      header.font = `${computed.fontSize || '12px'} ${computed.fontFamily || 'sans-serif'}`;
      // eslint-disable-next-line shadcn/no-raw-colors -- canvas reads a theme token by name (color()), not a class string
      header.fillStyle = color('text-secondary'); header.textBaseline = 'middle';
      let previousEnd = GUTTER;
      for (const [index, tick] of niceTicks(view, plotWidth).entries()) {
        const text = props.formatTick?.(tick) ?? laneTickLabel(tick, index === 0); const textWidth = Math.min(plotWidth, header.measureText(text).width);
        const left = Math.max(GUTTER, Math.min(width - textWidth, x(tick) - textWidth / 2));
        if (left < previousEnd) continue;
        header.fillText(text, left, 14, plotWidth); previousEnd = left + textWidth + 12;
      }
      const bins = densityBins(model.density, view, Math.max(1, Math.floor(plotWidth / 8)));
      const max = Math.max(1, ...bins); header.fillStyle = color('chart-series-1');
      bins.forEach((count, i) => { const h = count / max * 8; header.fillRect(GUTTER + i * plotWidth / bins.length, HEADER_HEIGHT - h, plotWidth / bins.length, h); });
    }
    hasDrawn = true; drawn = { view: [...view], width, height, scroll: scroll.scrollTop };
    if (ctx) {
      ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, plotWidth, height); ctx.clip();
      paintFrame(ctx, laneStyle(), { view, width, height, scroll: scroll.scrollTop }, buf, Math.max(1, plotWidth));
      ctx.restore();
    }
  }
  /** Declarative overlays, then the selection outline, on a canvas above the data layer: the outline is never covered by a later rect or mark. */
  function drawOverlay() {
    const top = setup(overlay, height);
    if (!top) return;
    const plotWidth = width - GUTTER;
    if (overlays.length) {
      const computed = getComputedStyle(root);
      drawOverlays(top, resolvedOverlays(), { model, view, width, height, scroll: scroll.scrollTop, resolve: color, font: `${computed.fontSize || '12px'} ${computed.fontFamily || 'sans-serif'}` });
    }
    const item = selectedId ? model.byId.get(selectedId) : undefined;
    if (!item) return;
    const rect = segmentRect(model, item.index, view, width, height, scroll.scrollTop);
    if (!rect) return;
    top.save(); top.beginPath(); top.rect(GUTTER, 0, plotWidth, height); top.clip();
    top.strokeStyle = color('chart-selection-outline'); top.lineWidth = 2; top.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2));
    top.restore();
  }
  function invalidateHover() { tooltip.hidden = true; }
  function setView(next: [number, number]) { view = clampView(next, model.domain); invalidateHover(); schedule(); }
  function zoom(factor: number, anchor = 0.5) {
    const span = view[1] - view[0]; const next = Math.min(model.domain[1] - model.domain[0], Math.max(Math.min(1, model.domain[1] - model.domain[0]), span * factor));
    const start = view[0] + span * anchor - next * anchor; setView([start, start + next]);
  }
  function wheel(event: WheelEvent) {
    // Preserve vertical trackpad/document scrolling unless the user requests chart zoom.
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const anchor = event.clientX ? Math.max(0, Math.min(1, (event.clientX - bounds.left - GUTTER) / (width - GUTTER))) : 0.5;
    zoom(Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.002))), anchor);
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.clientX - canvas.getBoundingClientRect().left < GUTTER) return;
    drag = { pointer: event.pointerId, x: event.clientX, view: [...view], moved: false };
    canvas.setPointerCapture?.(event.pointerId); root.focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent) {
    if (drag) {
      if (event.pointerId !== drag.pointer) return;
      const delta = event.clientX - drag.x; drag.moved ||= Math.abs(delta) > 3;
      if (drag.moved) { const offset = delta / (width - GUTTER) * (drag.view[1] - drag.view[0]); setView([drag.view[0] - offset, drag.view[1] - offset]); }
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const rect = hit(event.clientX - bounds.left, event.clientY - bounds.top);
    const text = rect ? segmentText(model, rect, props.formatTooltip, lang) : null;
    if (lastHover !== text) { lastHover = text; onHover(text); }
    tooltip.hidden = !text;
    // Fix the width before measuring: shrink-to-fit would collapse it against the right-edge clamp (UX #576 U1).
    tooltip.style.width = 'min(320px, calc(100vw - 16px))';
    const place = () => {
      const tipWidth = tooltip.offsetWidth || 320; const tipHeight = tooltip.offsetHeight || 80;
      const flip = event.clientX + 12 + tipWidth > window.innerWidth - 8;
      const left = flip ? event.clientX - 12 - tipWidth : event.clientX + 12;
      tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tipWidth - 8, left))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tipHeight - 8, event.clientY + 12))}px`;
    };
    place();
    if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
    tooltipFrame = requestAnimationFrame(() => { tooltipFrame = null; place(); });
  }
  function endDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved && event.type === 'pointerup') {
      const bounds = canvas.getBoundingClientRect(); const rect = hit(event.clientX - bounds.left, event.clientY - bounds.top);
      onSelect(rect?.segment.id ?? null);
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
  }
  function pointerLeave() { if (!drag) { tooltip.hidden = true; lastHover = null; onHover(null); } }
  function scrollView() { invalidateHover(); schedule(); }
  function reveal(index: number) {
    if (!Number.isInteger(index)) return;
    const item = model.flat[index]; if (!item) return;
    const top = item.laneIndex * ROW_HEIGHT;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW_HEIGHT > scroll.scrollTop + height) scroll.scrollTop = top + ROW_HEIGHT - height;
    const span = view[1] - view[0]; const center = item.segment.start + (item.segment.end - item.segment.start) / 2;
    setView([center - span / 2, center + span / 2]);
  }
  const observer = new ResizeObserver(resize); observer.observe(scroll);
  const theme = new MutationObserver(() => { resolved = new Map(); styleCache = null; schedule(); });
  // Observe the cascade roots (including caller-owned containers), not the canvas mutations.
  for (let element: HTMLElement | null = root; element; element = element.parentElement) theme.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag); canvas.addEventListener('pointerleave', pointerLeave);
  scroll.addEventListener('scroll', scrollView, { passive: true }); window.addEventListener('resize', resize);
  resize();
  /** Applies new React values. Each field is compared by value or identity as its role needs; see the file comment. */
  function update(next: RendererState) {
    onSelect = next.onSelect; onHover = next.onHover; lang = next.lang;
    const modelChanged = next.model !== model; const prevProps = props; props = next.props;
    if (modelChanged) {
      model = next.model; view = [...model.domain]; drag = null; lastHover = null; invalidateHover(); onHover(null);
      // The new model has not been painted: close the hit gate until drawData() runs, so hits never mix it with the old view.
      hasDrawn = false; overlayCache = null;
      sizeKey = ''; resize(); styleCache = null; schedule();
    }
    if (styleKeyOf(props) !== styleKey) { readStyleProps(); styleCache = null; schedule(); }
    if (!modelChanged && props.height !== prevProps.height) resize();
    if (next.selectedId !== selectedId) { selectedId = next.selectedId; schedule(false); }
    if (next.overlays !== overlays) { overlays = next.overlays; overlayCache = null; schedule(false); }
  }
  return {
    update,
    /** Internal (tests): the model the overlay cache holds, or null. */
    overlayCacheModel: () => overlayCache?.model ?? null,
    resetZoom: () => setView([...model.domain]), zoom, reveal,
    // Escape clears the React tooltip; the cache must follow or the next same-segment move would keep it empty (C3).
    clearHover: () => { lastHover = null; tooltip.hidden = true; },
    revealById: (id: string) => { const item = model.byId.get(id); if (item) reveal(item.index); },
    destroy() {
      if (drag && canvas.hasPointerCapture?.(drag.pointer)) canvas.releasePointerCapture(drag.pointer);
      drag = null;
      destroyed = true; if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame); if (raf !== null) cancelAnimationFrame(raf); observer.disconnect(); theme.disconnect();
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', endDrag); canvas.removeEventListener('pointercancel', endDrag); canvas.removeEventListener('lostpointercapture', endDrag); canvas.removeEventListener('pointerleave', pointerLeave);
      scroll.removeEventListener('scroll', scrollView); window.removeEventListener('resize', resize);
    },
  };
}
