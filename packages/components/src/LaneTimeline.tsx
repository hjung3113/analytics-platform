import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { useI18n } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { prepareLanes, segmentSummary } from './laneTimelineGeometry';
import { ChartTrustFooter } from './analysisChartFrameParts';
import { createLaneRenderer } from './laneTimelineRenderer';

export type TimelineSegment = {
  id: string; start: number; end: number; depth?: number; rank?: string;
  colorToken?: ThemeColorToken; neutral?: boolean;
  startBoundary?: 'closed' | 'orphan'; endBoundary?: 'closed' | 'open';
};
export type TimelineLane = { id: string; label: string; segments: TimelineSegment[] };
export type LaneTimelineHandle = { resetZoom(): void; reveal(itemIndex: number): void; revealById(segmentId: string): void };
export type LaneTimelineProps = {
  description?: ReactNode; trust?: { source: string; updated: string; coverage: string };
  lanes: TimelineLane[]; ariaLabel: string; ref?: Ref<LaneTimelineHandle>; height?: number;
  formatTick?: (time: number) => string; formatTooltip?: (segment: TimelineSegment, lane: TimelineLane) => string;
  densityInstants?: number[]; paletteTokens?: ThemeColorToken[]; neutralColorToken?: ThemeColorToken;
  outlineWidthsByRank?: Record<string, number>; outlineMode?: 'strong' | 'weak' | 'off';
  selectedId?: string | null; defaultSelectedId?: string | null; onSelectedChange?: (id: string | null) => void;
};
const noInstants: number[] = [];
/** A standalone UTC interval chart. Pan, zoom and scroll never enter React state. */
export function LaneTimeline(props: LaneTimelineProps) {
  const { tx } = useI18n();
  const root = useRef<HTMLElement>(null); const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null); const axis = useRef<HTMLCanvasElement>(null);
  const spacer = useRef<HTMLDivElement>(null); const tooltip = useRef<HTMLDivElement>(null);
  const savedView = useRef<{ model?: ReturnType<typeof prepareLanes>; view?: [number, number] }>({});
  const engine = useRef<ReturnType<typeof createLaneRenderer> | null>(null);
  const model = useMemo(() => prepareLanes(props.lanes, props.densityInstants ?? noInstants), [props.lanes, props.densityInstants]);
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
  useEffect(() => {
    if (!root.current || !scroll.current || !canvas.current || !axis.current || !spacer.current || !tooltip.current) return;
    const renderer = createLaneRenderer({ root: root.current, scroll: scroll.current, canvas: canvas.current, axis: axis.current, spacer: spacer.current, tooltip: tooltip.current,
      model, props, savedView: savedView.current, selectedId: selectedItem?.segment.id ?? null,
      onSelect: id => { setLocalSelection(id); props.onSelectedChange?.(id); },
      onHover: setHover,
    });
    engine.current = renderer;
    return () => { renderer.destroy(); engine.current = null; };
  }, [model, props, selectedItem?.segment.id]);
  function summary(item: typeof focused) {
    if (!item) return '';
    return `${model.lanes[item.laneIndex].label} · ${props.formatTooltip?.(item.segment, model.lanes[item.laneIndex]) ?? segmentSummary(item.segment)}${props.formatTooltip ? ` · ${segmentSummary(item.segment)}` : ''}`;
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
    <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
      <div className="min-w-0">
        <h3 className="t-card-title">{props.ariaLabel}</h3>
        {props.description && <p className="text-xs text-text-muted">{props.description}</p>}
      </div>
      <div role="toolbar" aria-label={tx({ ko: '차트 동작', en: 'Chart actions' })} className="ml-auto flex flex-wrap items-center justify-end gap-1">
        <TooltipProvider delayDuration={200}><Tooltip>
          <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={tx({ ko: '조작 방법', en: 'How to interact' })}><Info className="size-3.5" aria-hidden /></Button></TooltipTrigger>
          <TooltipContent>{tx({ ko: 'Ctrl/⌘ + 휠: 확대 · 끌기: 이동 · 방향키: 탐색 · Enter: 선택 · Escape: 해제', en: 'Ctrl/⌘ + wheel: Zoom · Drag: Pan · Arrows: Navigate · Enter: Select · Escape: Clear' })}</TooltipContent>
        </Tooltip></TooltipProvider>
        <Button size="toolbar" variant="ghost" onClick={() => engine.current?.zoom(0.8)}>{tx({ ko: '확대', en: 'Zoom in' })}</Button><Button size="toolbar" variant="ghost" onClick={() => engine.current?.zoom(1.25)}>{tx({ ko: '축소', en: 'Zoom out' })}</Button><Button size="toolbar" variant="ghost" onClick={() => engine.current?.resetZoom()}>{tx({ ko: '확대 초기화', en: 'Zoom Reset' })}</Button>
      </div>
    </header>
    <p className="px-4 py-2 text-text-secondary">{tx({ ko: 'UTC · orphan: 시작 미확인 · open: 종료 미확인', en: 'UTC · orphan: start unknown · open: end unknown' })}</p>
    <p id={helpId} className="sr-only">{tx({ ko: 'UTC · Ctrl/⌘ + 휠: 확대 · 끌기: 이동 · 방향키: 탐색 · Enter: 선택 · Escape: 해제 · orphan: 시작 미확인 · open: 종료 미확인', en: 'UTC · Ctrl/⌘ + wheel: Zoom · Drag: Pan · Arrows: Navigate · Enter: Select · Escape: Clear · orphan: start unknown · open: end unknown' })}</p>
    <div className="overflow-x-auto">
      <div className="min-w-[352px]">
        <canvas ref={axis} aria-hidden className="block w-full" />
        <div ref={scroll} data-lane-scroll className="relative overflow-y-auto overscroll-contain">
          <div className="sticky top-0 h-0"><canvas ref={canvas} role="img" aria-label={props.ariaLabel} className="block w-full touch-pan-y" /></div>
          <div ref={spacer} className="pointer-events-none relative">
            {model.lanes.map(lane => <div key={lane.id} className="h-6 w-28 truncate bg-surface-card px-2 py-1 text-text-secondary" title={lane.label}>{lane.label}</div>)}
          </div>
        </div>
      </div>
    </div>
    {!model.flat.length && <p className="px-4 py-3 text-text-secondary">{tx({ ko: '데이터 없음', en: 'No data' })}</p>}
    <section aria-label={tx({ ko: '선택 요약', en: 'Selection summary' })} className="bg-surface-sunken px-4 py-2 text-text-secondary">{selectedItem ? summary(selectedItem) : tx({ ko: '선택 없음', en: 'No selection' })}</section>
    <p id={summaryId} role="status" aria-live="polite" className="px-4 py-2 text-text-secondary">{summary(focused)}</p>
    <ChartTrustFooter trust={props.trust} />
    <div ref={tooltip} role="tooltip" hidden={!hover} className="pointer-events-none fixed z-50 max-w-xs break-words rounded border border-border-subtle bg-surface-card px-3 py-2 text-text-primary shadow-lg">{hover}</div>
  </section>;
}
