import type { ChartTrust } from '../state/trustFormat';
import { useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@ap/ui';
import { useI18n, useMessages } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import { prepareLanes, segmentText } from './laneTimelineGeometry';
import { ChartUnavailable, reportChartUnavailable } from './ChartUnavailable';
import { ChartTrustFooter } from './analysisChartFrameParts';
import { createLaneRenderer, type RendererState } from './laneTimelineRenderer';
import { overlaySummaries, validateOverlays } from './laneTimelineOverlays';
import type { TimelineOverlay } from './laneTimelineTypes';
import { ChartImageCopyButton, ChartImagePrintButton } from './ChartImageCopyButton';
import { BodyTooltipPortal } from './bodyTooltipPortal';
import { laneImageBlob } from './chartImageCopy';
import { displayFileName } from '../table/download';
import { AnalysisSectionContext } from '../archetypes/AnalysisSectionContext';

export type { TimelineOverlay } from './laneTimelineTypes';
export type TimelineSegment = {
  id: string; start: number; end: number; depth?: number; rank?: string;
  colorToken?: ThemeColorToken; neutral?: boolean;
  startBoundary?: 'closed' | 'orphan'; endBoundary?: 'closed' | 'open';
};
export type TimelineLane = { id: string; label: string; segments: TimelineSegment[] };
export type LaneTimelineHandle = { resetZoom(): void; reveal(itemIndex: number): void; revealById(segmentId: string): void };
export type LaneTimelineProps = {
  description?: ReactNode;
  /** Trust footer: the response `Trust` (formatted by the SDK, viewer time zone), `null` (no footer), or an already formatted `{ source, updated, coverage }` text triple (shown as given). */
  trust?: ChartTrust;
  lanes: TimelineLane[]; ariaLabel: string; ref?: Ref<LaneTimelineHandle>; height?: number;
  formatTick?: (time: number) => string; formatTooltip?: (segment: TimelineSegment, lane: TimelineLane) => string;
  densityInstants?: number[]; paletteTokens?: ThemeColorToken[]; neutralColorToken?: ThemeColorToken;
  outlineWidthsByRank?: Record<string, number>; outlineMode?: 'strong' | 'weak' | 'off';
  /** Adds a `이미지 복사` button (axis and visible plot as a PNG, to the clipboard or a download), shown only when the current menu manifest enables `features.export`; needs a PlatformProvider only while true. */
  imageCopy?: boolean;
  /** Adds a `인쇄` button: the same image as `imageCopy`, printed under the chart's title. Shown only when the current menu manifest enables `features.export`. */
  imagePrint?: boolean;
  /** Marks drawn above the segments and below the selection outline: time instants, time ranges and segment sets. Memoize the array: a new array redraws the overlay layer once. */
  overlays?: TimelineOverlay[];
  selectedId?: string | null; defaultSelectedId?: string | null; onSelectedChange?: (id: string | null) => void;
};
const noInstants: number[] = [];
const noOverlays: TimelineOverlay[] = [];
/** A standalone wall-clock interval chart. Pan, zoom and scroll never enter React state. */
export function LaneTimeline(props: LaneTimelineProps) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const section = useContext(AnalysisSectionContext);
  const root = useRef<HTMLElement>(null); const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null); const overlay = useRef<HTMLCanvasElement>(null); const axis = useRef<HTMLCanvasElement>(null);
  const spacer = useRef<HTMLDivElement>(null); const tooltip = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof createLaneRenderer> | null>(null);
  // No ResizeObserver or a renderer that throws on start (jsdom): the renderer cannot start, the frame around it still renders (#1862).
  const [unavailable, setUnavailable] = useState(false);
  const markUnavailable = useCallback(() => setUnavailable(true), []);
  const model = useMemo(() => prepareLanes(props.lanes, props.densityInstants ?? noInstants), [props.lanes, props.densityInstants]);
  const overlays = useMemo(() => validateOverlays(props.overlays ?? noOverlays), [props.overlays]);
  const overlayLines = useMemo(() => overlaySummaries(overlays), [overlays]);
  const [localSelection, setLocalSelection] = useState<string | null>(props.defaultSelectedId ?? null);
  const selected = props.selectedId === undefined ? localSelection : props.selectedId;
  const selectedItem = selected ? model.byId.get(selected) : undefined;
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = (focusId ? model.byId.get(focusId) : undefined) ?? model.flat[0];
  const [hover, setHover] = useState<string | null>(null);
  const summaryId = useId(); const helpId = useId();
  useImperativeHandle(props.ref, () => ({
    resetZoom: () => engine.current?.resetZoom(),
    reveal: index => engine.current?.reveal(index),
    revealById: id => engine.current?.revealById(id),
  }), []);
  const state: RendererState = {
    model, props, selectedId: selectedItem?.segment.id ?? null, lang, overlays,
    onSelect: id => { setLocalSelection(id); props.onSelectedChange?.(id); }, onHover: setHover,
  };
  // The renderer is created once per mount; every later render only hands it the latest values, and `update()` diffs them.
  useEffect(() => {
    if (engine.current) { engine.current.update(state); return; }
    if (!root.current || !scroll.current || !canvas.current || !overlay.current || !axis.current || !spacer.current || !tooltip.current) return;
    try {
      if (typeof ResizeObserver === 'undefined') throw new Error('ResizeObserver is missing');
      // The renderer first touches its canvases in a later frame; probe them now so a missing 2d context selects the fallback (#1862).
      for (const target of [axis.current, canvas.current, overlay.current]) if (!target.getContext('2d')) throw new Error('Canvas 2d context is missing');
      engine.current = createLaneRenderer({ root: root.current, scroll: scroll.current, canvas: canvas.current, overlay: overlay.current, axis: axis.current, spacer: spacer.current, tooltip: tooltip.current, ...state });
    } catch (cause) {
      reportChartUnavailable(cause);
      markUnavailable();
    }
  });
  useEffect(() => () => { engine.current?.destroy(); engine.current = null; }, []);
  function summary(item: typeof focused) {
    if (!item) return '';
    return segmentText(model, item, props.formatTooltip, lang);
  }
  return <section ref={root} role="region" aria-label={props.ariaLabel} aria-describedby={`${helpId} ${summaryId}`} tabIndex={0}
    className="relative min-w-0 rounded-lg border border-border-subtle bg-surface-card text-xs text-text-primary"
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      const index = focused?.index ?? 0;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? model.flat.length - 1 : Math.max(0, Math.min(model.flat.length - 1, index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)));
        const item = model.flat[next]; if (item) { setFocusId(item.segment.id); engine.current?.reveal(next); }
      } else if (event.key === 'Enter' && focused) {
        event.preventDefault(); setLocalSelection(focused.segment.id); props.onSelectedChange?.(focused.segment.id);
      } else if (event.key === 'Escape') {
        event.preventDefault(); setLocalSelection(null); props.onSelectedChange?.(null); engine.current?.clearHover(); setHover(null);
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); engine.current?.zoom(0.8); }
      else if (event.key === '-') { event.preventDefault(); engine.current?.zoom(1.25); }
    }}>
    <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', section && 'pr-12')}>
      <div className="min-w-0">
        <h3 className="t-card-title">{props.ariaLabel}</h3>
        {props.description && <p className="text-xs text-text-muted">{props.description}</p>}
      </div>
      <div role="toolbar" aria-label={m('chartActions')} className="ml-auto flex flex-wrap items-center justify-end gap-1">
        <TooltipProvider delayDuration={200}><Tooltip>
          <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={m('laneHowToInteract')}><Info className="size-3.5" aria-hidden /></Button></TooltipTrigger>
          <TooltipContent>{m('laneInteractionHelp')}</TooltipContent>
        </Tooltip></TooltipProvider>
        <Button size="toolbar" variant="ghost" onClick={() => engine.current?.zoom(0.8)}>{m('laneZoomIn')}</Button><Button size="toolbar" variant="ghost" onClick={() => engine.current?.zoom(1.25)}>{m('laneZoomOut')}</Button><Button size="toolbar" variant="ghost" onClick={() => engine.current?.resetZoom()}>{m('laneZoomReset')}</Button>
        {props.imageCopy && <ChartImageCopyButton fileName={`${displayFileName(props.ariaLabel) || 'timeline'}.png`} capture={() => laneImageBlob({ axis: axis.current, plot: canvas.current, overlay: overlay.current, labels: spacer.current, scroll: scroll.current })} />}
        {props.imagePrint && <ChartImagePrintButton title={() => props.ariaLabel} capture={() => laneImageBlob({ axis: axis.current, plot: canvas.current, overlay: overlay.current, labels: spacer.current, scroll: scroll.current })} />}
      </div>
    </header>
    <p className="px-4 py-2 text-text-secondary">{m('laneBoundaryHelp')}</p>
    <p id={helpId} className="sr-only">{m('laneAccessibleHelp')}</p>
    {unavailable ? <ChartUnavailable /> : (
    <div className="overflow-x-auto">
      <div className="min-w-[352px]">
        <canvas ref={axis} aria-hidden className="block w-full" />
        <div ref={scroll} data-lane-scroll className="relative overflow-y-auto overscroll-contain">
          <div className="sticky top-0 h-0"><canvas ref={canvas} role="img" aria-label={props.ariaLabel} className="block w-full touch-pan-y" /><canvas ref={overlay} aria-hidden className="pointer-events-none absolute left-0 top-0 block w-full" /></div>
          <div ref={spacer} className="pointer-events-none relative">
            {model.lanes.map(lane => <div key={lane.id} className="h-6 w-28 truncate bg-surface-card px-2 py-1 text-text-secondary" title={lane.label}>{lane.label}</div>)}
          </div>
        </div>
      </div>
    </div>
    )}
    {!model.flat.length && <p className="px-4 py-3 text-text-secondary">{m('chartNoData')}</p>}
    <section aria-label={m('chartSelectionSummaryRegion')} className="bg-surface-sunken px-4 py-2 text-text-secondary">{selectedItem ? summary(selectedItem) : m('chartNoSelection')}</section>
    {overlayLines.length > 0 && <ul aria-label={m('laneMarkedTimes')} className="sr-only">{overlayLines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    <p id={summaryId} role="status" aria-live="polite" className="px-4 py-2 text-text-secondary">{summary(focused)}</p>
    <ChartTrustFooter trust={props.trust} />
    <BodyTooltipPortal domRef={tooltip} hidden={!hover} className="pointer-events-none fixed z-50 max-w-xs break-words rounded border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary shadow-lg">{hover}</BodyTooltipPortal>
  </section>;
}
