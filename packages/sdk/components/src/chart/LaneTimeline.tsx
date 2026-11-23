import type { ChartTrust } from '../state/trustFormat';
import { useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref, type ReactNode } from 'react';
import { BrushIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, InfoTip } from '@ap/ui';
import { useI18n, useMessages, usePlatformOptional } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import { boundaryNotes, prepareLanes, segmentText, utcTick } from './laneTimelineGeometry';
import { ChartUnavailable, reportChartUnavailable } from './ChartUnavailable';
import { ChartCardHeader, ChartTrustFooter, ChartZoomButton } from './analysisChartFrameParts';
import { createLaneRenderer, type RendererState } from './laneTimelineRenderer';
import { overlaySummaries, validateOverlays } from './laneTimelineOverlays';
import type { TimelineOverlay } from './laneTimelineTypes';
import { ChartImageCopyButton, ChartImagePrintButton, ImageActionStatus, useImageActionGate, type ChartExportActionsPolicy } from './ChartImageCopyButton';
import { ChartExportMenu, ChartTableToggle } from './ChartInteractionToolbar';
import { IntervalTable, formatDurationMs } from './canvasChartTable';
import { downloadChartCsv } from './analysisChartCsv';
import { CsvVerbatim } from '../table/tableExport';
import { BodyTooltipPortal } from './bodyTooltipPortal';
import { laneImageBlob } from './chartImageCopy';
import { displayFileName } from '../table/download';
import type { LaneItem } from './laneTimelineModel';
import { AnalysisSectionContext } from '../archetypes/AnalysisSectionContext';
import { useRangeBrush, type RangeBrushOptions } from './useRangeBrush';
import { chartToolVariant } from './chartChrome';

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
  /** The `상태` cell of `표로 보기` and the CSV (#2792). Omitted, the segment `rank` is shown; open and orphan boundaries are always added. */
  formatState?: (segment: TimelineSegment, lane: TimelineLane) => string;
  densityInstants?: number[]; paletteTokens?: ThemeColorToken[]; neutralColorToken?: ThemeColorToken;
  outlineWidthsByRank?: Record<string, number>; outlineMode?: 'strong' | 'weak' | 'off';
  /** Adds `이미지 복사` to the `내보내기` menu (axis and visible plot as a PNG, to the clipboard or a download). The menu, with `내보내기 CSV` (one row per interval), shows only when the current menu manifest enables `features.export`; without a `PlatformProvider` only when `exportActions.exportAllowed` is true (#1953, #2792). */
  imageCopy?: boolean;
  /** Adds `인쇄` to the `내보내기` menu: the same image as `imageCopy`, printed under the chart's title. Same gate as `imageCopy`. */
  imagePrint?: boolean;
  /** Outside a platform only: allows the `내보내기` menu (CSV and the image actions; default off) and says where their result text goes (default a status line beside the button). Inside a `PlatformProvider` it is ignored and the menu's `features.export` decides; it never widens a menu's permission. */
  exportActions?: ChartExportActionsPolicy;
  /** Marks drawn above the segments and below the selection outline: time instants, time ranges and segment sets. Memoize the array: a new array redraws the overlay layer once. */
  overlays?: TimelineOverlay[];
  selectedId?: string | null; defaultSelectedId?: string | null; onSelectedChange?: (id: string | null) => void;
  /**
   * Opt-in range brush (#1860), the same as OrderedIntervalTrack's: adds the `구간 선택` toggle. While it is on, a drag picks a time
   * range (epoch ms, like the segments) instead of panning and a click selects nothing; Shift+←/→ moves the range end within the
   * visible window; the selection summary shows the range with `선택 구간 확대`. Escape and `확대 초기화` clear it. Pass `{}` for an
   * uncontrolled brush, or `value`/`onChange` to own the range. Omitted: no toggle, and drag, keys and summary are unchanged.
   */
  rangeBrush?: RangeBrushOptions;
  /** Icon zoom, table and export controls, and screen-reader-only guide and readouts. */
  quiet?: boolean;
  /** Insets the painted bands to leave one spacing-4 token between rows; row labels keep their original pitch. */
  separateRows?: boolean;
  /** Target tick spacing in pixels. The default is 160. */
  tickSpacing?: number;
};
const noInstants: number[] = [];
/** Lane times are equipment wall-clock encoded as UTC epoch ms (ADR-0064): the CSV keeps the calendar digits and the ms, with no zone suffix (#2792 C3). */
const wallClockCsv = (time: number) => new CsvVerbatim(new Date(time).toISOString().replace(/Z$/, ''));
const noOverlays: TimelineOverlay[] = [];
/** A standalone wall-clock interval chart. Pan, zoom and scroll never enter React state. */
export function LaneTimeline(props: LaneTimelineProps) {
  const { lang, t } = useI18n();
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
  const brush = useRangeBrush(props.rangeBrush);
  const [table, setTable] = useState(false);
  // The table page belongs to one `lanes` input: new lanes start again at the first page and drop the old reference (#2792 C6).
  const [tablePageOf, setTablePageOf] = useState({ lanes: props.lanes, page: 0 });
  if (tablePageOf.lanes !== props.lanes) setTablePageOf({ lanes: props.lanes, page: 0 });
  // A standalone result line belongs to one data set, title and permission: any change clears it (#2792 C9).
  const [exportGeneration, setExportGeneration] = useState({ lanes: props.lanes, label: props.ariaLabel, allowed: props.exportActions?.exportAllowed, n: 0 });
  if (exportGeneration.lanes !== props.lanes || exportGeneration.label !== props.ariaLabel || exportGeneration.allowed !== props.exportActions?.exportAllowed)
    setExportGeneration({ lanes: props.lanes, label: props.ariaLabel, allowed: props.exportActions?.exportAllowed, n: exportGeneration.n + 1 });
  const exportGate = useImageActionGate(props.exportActions, exportGeneration.n);
  const global = usePlatformOptional()?.global ?? null;
  const brushOn = props.rangeBrush !== undefined;
  const brushRange = brushOn ? brush.range : null;
  const zoomControl = (label: string, Icon: typeof ZoomIn, onClick: () => void) => props.quiet
    ? <ChartZoomButton label={label} icon={Icon} onClick={onClick} />
    : <Button size="toolbar" variant={chartToolVariant(false)} onClick={onClick}><Icon className="size-3.5" aria-hidden />{label}</Button>;
  useImperativeHandle(props.ref, () => ({
    resetZoom: () => engine.current?.resetZoom(),
    reveal: index => engine.current?.reveal(index),
    revealById: id => engine.current?.revealById(id),
  }), []);
  const state: RendererState = {
    model, props, selectedId: selectedItem?.segment.id ?? null, lang, overlays,
    onSelect: id => { setLocalSelection(id); props.onSelectedChange?.(id); }, onHover: setHover,
    brush: brushOn ? { mode: brush.mode, range: brush.range, onSelect: brush.select } : null,
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
  const tickText = (time: number) => props.formatTick?.(time) ?? utcTick(time);
  const fileBase = displayFileName(props.ariaLabel) || 'timeline';
  const tablePage = tablePageOf.page;
  // The state cell: the consumer's `formatState` text (a trend value), else the rank, then the boundary notes (#2792 C4).
  const segmentState = (segment: TimelineSegment, lane: TimelineLane) => [
    ...[props.formatState ? props.formatState(segment, lane) : segment.rank].filter((part): part is string => !!part),
    ...boundaryNotes(segment, lang),
  ].join(' · ');
  const tableColumns = [{ label: m('intervalColLane') }, { label: m('chartStart'), nowrap: true }, { label: m('chartEnd'), nowrap: true }, { label: m('intervalColState') }, { label: m('intervalColLength'), numeric: true, nowrap: true }];
  const tableRows = (from: number, to: number) => {
    const rows = [];
    for (let i = from; i < to; i += 1) {
      const { segment, laneIndex } = model.flat[i] as LaneItem;
      rows.push({ key: segment.id, selected: segment.id === selectedItem?.segment.id, cells: [
        model.lanes[laneIndex].label, tickText(segment.start), tickText(segment.end), segmentState(segment, model.lanes[laneIndex]) || '—', formatDurationMs(segment.end - segment.start, lang),
      ] });
    }
    return rows;
  };
  function exportCsv() {
    // Rows are built inside the try: a throwing consumer `formatState` reports the failure like a failed download (#2792 C12).
    try {
      const rows: (string | number | CsvVerbatim)[][] = [];
      for (let i = 0; i < model.flat.length; i += 1) {
        const { segment, laneIndex } = model.flat[i] as LaneItem;
        rows.push([model.lanes[laneIndex].label, wallClockCsv(segment.start), wallClockCsv(segment.end), segmentState(segment, model.lanes[laneIndex]), segment.end - segment.start]);
      }
      // The table's columns, with the CSV length in ms (#2792 C14).
      downloadChartCsv({ chartId: fileBase, fileName: fileBase, title: props.ariaLabel, context: global ?? {} }, tableColumns.map(column => column.numeric ? `${column.label} (ms)` : column.label), rows);
    } catch {
      exportGate.say(m('chartExportCsvFailed', { chartId: fileBase }), 'warning');
      return;
    }
    exportGate.say(m('chartExportedCsv', { chartId: fileBase }));
  }
  const capture = () => laneImageBlob({ axis: axis.current, plot: canvas.current, overlay: overlay.current, labels: spacer.current, scroll: scroll.current });
  function summary(item: typeof focused) {
    if (!item) return '';
    return segmentText(model, item, props.formatTooltip, lang);
  }
  return <section ref={root} role="region" aria-label={props.ariaLabel} aria-describedby={`${helpId} ${summaryId}`} tabIndex={0}
    className="relative min-w-0 rounded-lg border border-border-subtle bg-surface-card text-xs text-text-primary elevation-panel"
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (brushOn && brush.keyDown(event, engine.current?.view() ?? model.domain)) return;
      const index = focused?.index ?? 0;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? model.flat.length - 1 : Math.max(0, Math.min(model.flat.length - 1, index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)));
        const item = model.flat[next]; if (item) { setFocusId(item.segment.id); engine.current?.reveal(next); }
      } else if (event.key === 'Enter' && focused) {
        event.preventDefault(); setLocalSelection(focused.segment.id); props.onSelectedChange?.(focused.segment.id);
      } else if (event.key === 'Escape') {
        event.preventDefault(); setLocalSelection(null); props.onSelectedChange?.(null); engine.current?.clearHover(); setHover(null);
        if (brushOn) brush.clear();
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); engine.current?.zoom(0.8); }
      else if (event.key === '-') { event.preventDefault(); engine.current?.zoom(1.25); }
    }}>
    <ChartCardHeader reserveCorner={section !== null} title={<h3 className="t-card-title">{props.ariaLabel}</h3>}
      subtitle={props.description && <p className="text-xs text-text-muted">{props.description}</p>} actions={<>
        <InfoTip label={m('laneHowToInteract')}>{m(brushOn ? 'laneInteractionHelpBrush' : 'laneInteractionHelp')}</InfoTip>
        {zoomControl(m('laneZoomIn'), ZoomIn, () => engine.current?.zoom(0.8))}
        {zoomControl(m('laneZoomOut'), ZoomOut, () => engine.current?.zoom(1.25))}
        {brushOn && <Button type="button" size="toolbar" variant="toggle" aria-pressed={brush.mode} onClick={() => brush.setMode(!brush.mode)}><BrushIcon className="size-3.5" aria-hidden />{m('chartBrush')}</Button>}
        {zoomControl(m('laneZoomReset'), RotateCcw, () => { engine.current?.resetZoom(); if (brushOn) brush.clear(); })}
        <ChartTableToggle compact={props.quiet} shown={table} toggle={() => setTable(current => !current)} />
        {exportGate.allowed && <ChartExportMenu compact={props.quiet} exportCsv={exportCsv} tools={<>
          {props.imageCopy && <ChartImageCopyButton standalone={props.exportActions} onOutcome={exportGate.say} fileName={`${fileBase}.png`} capture={capture} />}
          {props.imagePrint && <ChartImagePrintButton standalone={props.exportActions} onOutcome={exportGate.say} title={() => props.ariaLabel} capture={capture} />}
        </>} />}
        {exportGate.allowed && <ImageActionStatus text={exportGate.status} />}
      </>} />
    <p className={props.quiet ? 'sr-only' : 'px-4 py-2 text-text-secondary'}>{m('laneBoundaryHelp')}</p>
    <p id={helpId} className="sr-only">{m(brushOn ? 'laneAccessibleHelpBrush' : 'laneAccessibleHelp')}</p>
    {unavailable ? <ChartUnavailable /> : (
    <div className="scrollbar-panel overflow-x-auto">
      <div className="min-w-[352px]">
        <canvas ref={axis} aria-hidden className="block w-full" />
        <div ref={scroll} data-lane-scroll className="relative scrollbar-panel overflow-y-auto overscroll-contain">
          <div className="sticky top-0 h-0"><canvas ref={canvas} role="img" aria-label={props.ariaLabel} className="block w-full touch-pan-y" /><canvas ref={overlay} aria-hidden className="pointer-events-none absolute left-0 top-0 block w-full" /></div>
          <div ref={spacer} className="pointer-events-none relative">
            {model.lanes.map(lane => <div key={lane.id} className="h-6 w-28 truncate bg-surface-card px-2 py-1 text-text-secondary" title={lane.label}>{lane.label}</div>)}
          </div>
        </div>
      </div>
    </div>
    )}
    {!model.flat.length && <p className="px-4 py-3 text-text-secondary">{m('chartNoData')}</p>}
    <section aria-label={m('chartSelectionSummaryRegion')} className={props.quiet && !brushRange ? 'sr-only' : 'bg-surface-sunken px-4 py-2 text-text-secondary'}>{brushRange
      ? <><span className={props.quiet ? 'sr-only' : undefined}>{t('selectedRange')}: {tickText(brushRange[0])}–{tickText(brushRange[1])}</span>{' '}<Button type="button" size="toolbar" variant={props.quiet ? 'ghost' : chartToolVariant(false)} onClick={() => engine.current?.showRange(brushRange)}>{!props.quiet && <ZoomIn className="size-3.5" aria-hidden />}{m('intervalZoomToSelection')}</Button></>
      : selectedItem ? summary(selectedItem) : m('chartNoSelection')}</section>
    {table && <IntervalTable title={m('laneIntervalList')} columns={tableColumns} count={model.flat.length} rows={tableRows} page={tablePage} onPage={page => setTablePageOf({ lanes: props.lanes, page })} />}
    {overlayLines.length > 0 && <ul aria-label={m('laneMarkedTimes')} className="sr-only">{overlayLines.map((line, i) => <li key={i}>{line}</li>)}</ul>}
    <p id={summaryId} role="status" aria-live="polite" className={props.quiet ? 'sr-only' : 'px-4 py-2 text-text-secondary'}>{summary(focused)}</p>
    <ChartTrustFooter trust={props.trust} />
    <BodyTooltipPortal domRef={tooltip} hidden={!hover} className="pointer-events-none fixed z-50 max-w-xs break-words rounded border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary shadow-lg">{hover}</BodyTooltipPortal>
  </section>;
}
