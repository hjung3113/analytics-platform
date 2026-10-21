import { isThemeColorToken, readColorToken, type ThemeColorToken } from '@ap/ui/theme';
import type { LaneTimelineProps } from './LaneTimeline';
import { clampView, densityBins, GUTTER, HEADER_HEIGHT, hitTest, laneDiagnostic, niceTicks, outlineStyle, ROW_HEIGHT, segmentSummary, utcTick, visibleRects, type LaneModel, type LaneRect } from './laneTimelineGeometry';

type RendererInput = {
  root: HTMLElement; scroll: HTMLDivElement; canvas: HTMLCanvasElement; axis: HTMLCanvasElement;
  spacer: HTMLDivElement; tooltip: HTMLDivElement; model: LaneModel; props: LaneTimelineProps;
  selectedId: string | null; savedView: { model?: LaneModel; view?: [number, number] }; onSelect: (id: string | null) => void; onHover: (text: string | null) => void;
};
const defaultPalette: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
/** Owns all mutable view geometry, event subscriptions and frame scheduling. No React state. */
export function createLaneRenderer(input: RendererInput) {
  const { root, canvas, axis, scroll, spacer, tooltip, model, props } = input;
  let view: [number, number] = input.savedView.model === model && input.savedView.view ? [...input.savedView.view] : [...model.domain];
  let width = 600; let height = 320; let raf: number | null = null; let destroyed = false;
  let rects: LaneRect[] = [];
  let drag: { pointer: number; x: number; view: [number, number]; moved: boolean } | null = null;
  let tooltipFrame: number | null = null;
  let lastHover: string | null = null;
  const palette = props.paletteTokens?.filter(isThemeColorToken);
  if (props.paletteTokens && (!palette?.length || palette.length !== props.paletteTokens.length)) laneDiagnostic('invalid or empty palette; invalid entries dropped, empty uses defaults');
  const colors = palette?.length ? palette : defaultPalette;
  const neutral = typeof props.neutralColorToken === 'string' && isThemeColorToken(props.neutralColorToken) ? props.neutralColorToken : 'chart-no-data';
  if (props.neutralColorToken !== undefined && !isThemeColorToken(props.neutralColorToken)) laneDiagnostic('invalid neutral token; using chart-no-data');
  // Resolved once per theme/resize, never once per segment.
  let resolved = new Map<ThemeColorToken, string>();
  function color(token: ThemeColorToken) {
    let value = resolved.get(token); if (!value) { value = readColorToken(token, root); resolved.set(token, value); } return value;
  }
  function schedule() { if (!destroyed && raf === null) raf = requestAnimationFrame(draw); }
  function resize() {
    width = Math.max(352, scroll.clientWidth || scroll.getBoundingClientRect().width || 600);
    height = Math.max(24, (Number.isFinite(props.height) ? props.height! : 360) - HEADER_HEIGHT);
    scroll.style.height = `${height}px`; spacer.style.height = `${model.lanes.length * ROW_HEIGHT}px`;
    resolved = new Map(); schedule();
  }
  function setup(target: HTMLCanvasElement, h: number) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    target.width = Math.round(width * dpr); target.height = Math.round(h * dpr);
    target.style.width = `${width}px`; target.style.height = `${h}px`;
    const ctx = target.getContext('2d');
    if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, h); }
    return ctx;
  }
  function draw() {
    raf = null; if (destroyed) return;
    const header = setup(axis, HEADER_HEIGHT); const ctx = setup(canvas, height);
    const plotWidth = width - GUTTER;
    const x = (time: number) => GUTTER + (time - view[0]) / (view[1] - view[0]) * plotWidth;
    if (header) {
      const computed = getComputedStyle(root);
      header.font = `${computed.fontSize || '12px'} ${computed.fontFamily || 'sans-serif'}`;
      header.fillStyle = color('text-secondary'); header.textBaseline = 'middle';
      let previousEnd = GUTTER; const labels = new Set<string>();
      for (const tick of niceTicks(view, plotWidth)) {
        const text = props.formatTick?.(tick) ?? utcTick(tick); const textWidth = Math.min(plotWidth, header.measureText(text).width);
        const left = Math.max(GUTTER, Math.min(width - textWidth, x(tick) - textWidth / 2));
        if (left < previousEnd || labels.has(text)) continue;
        labels.add(text);
        header.fillText(text, left, 14, plotWidth); previousEnd = left + textWidth + 12;
      }
      const bins = densityBins(model.density, view, Math.max(1, Math.floor(plotWidth / 8)));
      const max = Math.max(1, ...bins); header.fillStyle = color('chart-series-1');
      bins.forEach((count, i) => { const h = count / max * 8; header.fillRect(GUTTER + i * plotWidth / bins.length, HEADER_HEIGHT - h, plotWidth / bins.length, h); });
    }
    rects = visibleRects(model, view, width, height, scroll.scrollTop);
    if (!ctx) return;
    ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, 0, plotWidth, height); ctx.clip();
    for (const rect of rects) {
      const { segment } = rect;
      ctx.fillStyle = color(segment.colorToken ?? (segment.neutral ? neutral : colors[rect.laneIndex % colors.length]));
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      const outline = outlineStyle(segment.rank, props.outlineWidthsByRank, props.outlineMode ?? 'strong');
      const borderWidth = Math.min(outline.width, rect.width, rect.height);
      ctx.lineWidth = borderWidth; ctx.globalAlpha = outline.alpha; ctx.setLineDash(outline.dash); ctx.strokeStyle = color('border-strong');
      if (borderWidth) ctx.strokeRect(rect.x + borderWidth / 2, rect.y + borderWidth / 2, Math.max(0, rect.width - borderWidth), Math.max(0, rect.height - borderWidth));
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      // Semantic boundaries are glyphs on the visible rect, even when its time edge is clipped.
      ctx.strokeStyle = color('text-primary'); ctx.lineWidth = 1.5;
      if (segment.startBoundary === 'orphan') {
        ctx.beginPath(); ctx.moveTo(rect.x + 5, rect.y + 2); ctx.lineTo(rect.x + 1, rect.y + rect.height / 2); ctx.lineTo(rect.x + 5, rect.y + rect.height - 2); ctx.stroke();
      }
      if (segment.endBoundary === 'open') {
        ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(rect.x + rect.width - 1, rect.y); ctx.lineTo(rect.x + rect.width - 1, rect.y + rect.height); ctx.stroke(); ctx.setLineDash([]);
      }
      if (segment.id === input.selectedId) { ctx.strokeStyle = color('chart-selection-outline'); ctx.lineWidth = 2; ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.width - 2), Math.max(0, rect.height - 2)); }
    }
    ctx.restore();
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
    const rect = hitTest(rects, event.clientX - bounds.left, event.clientY - bounds.top);
    const text = rect ? `${model.lanes[rect.laneIndex].label} · ${props.formatTooltip?.(rect.segment, model.lanes[rect.laneIndex]) ?? segmentSummary(rect.segment)}${props.formatTooltip ? ` · ${segmentSummary(rect.segment)}` : ''}` : null;
    if (lastHover !== text) { lastHover = text; input.onHover(text); }
    tooltip.hidden = !text;
    tooltip.style.maxWidth = `${Math.min(320, window.innerWidth - 16)}px`;
    const place = () => {
      const tipWidth = tooltip.offsetWidth || 320; const tipHeight = tooltip.offsetHeight || 80;
      tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tipWidth - 8, event.clientX + 12))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tipHeight - 8, event.clientY + 12))}px`;
    };
    place();
    if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame);
    tooltipFrame = requestAnimationFrame(() => { tooltipFrame = null; place(); });
  }
  function endDrag(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved && event.type === 'pointerup') {
      const bounds = canvas.getBoundingClientRect(); const rect = hitTest(rects, event.clientX - bounds.left, event.clientY - bounds.top);
      input.onSelect(rect?.segment.id ?? null);
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
  }
  function pointerLeave() { if (!drag) { tooltip.hidden = true; lastHover = null; input.onHover(null); } }
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
  const theme = new MutationObserver(() => { resolved = new Map(); schedule(); });
  // Observe the cascade roots (including caller-owned containers), not the canvas mutations.
  for (let element: HTMLElement | null = root; element; element = element.parentElement) theme.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag); canvas.addEventListener('pointerleave', pointerLeave);
  scroll.addEventListener('scroll', scrollView, { passive: true }); window.addEventListener('resize', resize);
  resize();
  return {
    resetZoom: () => setView([...model.domain]), zoom, reveal,
    revealById: (id: string) => { const item = model.byId.get(id); if (item) reveal(item.index); },
    destroy() {
      input.savedView.model = model; input.savedView.view = [...view];
      if (drag && canvas.hasPointerCapture?.(drag.pointer)) canvas.releasePointerCapture(drag.pointer);
      drag = null;
      destroyed = true; if (tooltipFrame !== null) cancelAnimationFrame(tooltipFrame); if (raf !== null) cancelAnimationFrame(raf); observer.disconnect(); theme.disconnect();
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', endDrag); canvas.removeEventListener('pointercancel', endDrag); canvas.removeEventListener('lostpointercapture', endDrag); canvas.removeEventListener('pointerleave', pointerLeave);
      scroll.removeEventListener('scroll', scrollView); window.removeEventListener('resize', resize);
    },
  };
}
