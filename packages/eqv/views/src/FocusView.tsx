import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChartGantt, Inbox, MapPinOff, ServerCrash } from 'lucide-react';
import {
  bindingLayout, hasKnownOccurrenceInWindow, replayTimeline, replayTimelineFrame, parseWallClockRange, millisToWallClock, wallClockToMillis, seekSceneState, stepSceneState,
  type ReplayInput, type ReplayTimeline, type ReplayTimelineFrame, type SceneState, type SiteWallClock,
} from '@eqv/core';
import { TopViewer } from '@eqv/renderer';
import {
  CursorStateList, DataQualityList, entryOccurrence, EvidenceDetail, FocusGantt, focusRange, illustrativeGhosts, OccurrenceList, PlaybackControls, recordSteps,
  usePlayback, wallClockText, type PlaybackScheduler,
} from '@eqv/replay';
import { Button, Checkbox, EmptyState, Input, Label, useImeEnterGuard } from '@ap/ui';
import { EvidenceBadge, Panel, StateMessage, Tabs, TabsContent, TabsList, TabsTrigger, ViewerZoomControls } from '@eqv/ui';
import { NoticeList } from './NoticeList.js';
import { REPLAY_NO_DATA_MESSAGES, type ReplayNoDataCopy } from './messages.js';
import { GANTT_SPAN_LIMIT, TIMELINE_BUDGET, timelineCost } from './timeline-cost.js';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';

type Range = { from: SiteWallClock; to: SiteWallClock };
type View = {
  /** The host's load identity (`resetKey`): the range, cursor and selections all belong to it. */
  resetKey: string;
  entryKey: string;
  /** The user-applied range; null means the entry's default. */
  applied: Range | null;
  draft: { from: string; to: string } | null;
  rangeError: string | null;
  rangeExpanded: boolean;
  cursorMoveNotice: { from: SiteWallClock; to: SiteWallClock } | null;
  cursorAnnouncement: string | null;
  /** null means the entry's default cursor. */
  cursor: SiteWallClock | null;
  selectedOccurrenceId: string | null;
  selectedComponentId: string | null;
  expanded: ReadonlySet<string>;
  /** `sequence`: every view shows `stepSceneState` at that Record Sequence instead of the time cursor's seek. */
  mode: { kind: 'time' } | { kind: 'sequence'; seq: number };
  /** Example-motion ghosts; page-local, off by default. */
  illustrative: boolean;
};
export type FocusTab = 'list' | 'quality' | 'detail';
const TABS: { id: FocusTab; label: string }[] = [
  { id: 'list', label: 'Occurrence 목록' },
  { id: 'quality', label: 'Data Quality' },
  { id: 'detail', label: '근거 상세' },
];

const count = (value: number) => value.toLocaleString('en-US');

function parseRange(from: string, to: string): { range: Range } | { error: string } {
  const parsed = parseWallClockRange(from, to);
  if (parsed.ok) return { range: { from: parsed.from, to: parsed.to } };
  return { error: parsed.problem === 'format' ? 'Site Wall-clock 형식(YYYY-MM-DDTHH:mm:ss.fff)이 아닙니다' : '시작은 끝보다 앞서야 합니다' };
}

const MILLIS_PER_SECOND = 1_000;
const MILLIS_PER_MINUTE = 60 * MILLIS_PER_SECOND;
const MILLIS_PER_HOUR = 60 * MILLIS_PER_MINUTE;

/** A short Korean duration between Site Wall-clocks, preserving any remaining seconds and milliseconds. */
export function formatRangeDuration({ from, to }: Range): string {
  const millis = wallClockToMillis(to) - wallClockToMillis(from);
  const hours = Math.floor(millis / MILLIS_PER_HOUR);
  const minutes = Math.floor((millis % MILLIS_PER_HOUR) / MILLIS_PER_MINUTE);
  const seconds = (millis % MILLIS_PER_MINUTE) / MILLIS_PER_SECOND;
  const parts = [];
  if (hours) parts.push(`${hours}시간`);
  if (minutes) parts.push(`${minutes}분`);
  if (seconds || parts.length === 0) parts.push(`${seconds}초`);
  return parts.join(' ');
}

type FocusViewBaseProps = {
  input: ReplayInput;
  /** Joined with the entry notice in one status line at the top of the Top View panel body (or the view when no panel renders). */
  notices: readonly string[];
  /** Status shown first in the Top View panel header; above the view when no panel renders. */
  trust?: ReactNode;
  entityType: string | null;
  anchor: string | null;
  /** The host's load identity: a change resets every piece of view state (range, cursor, selections, mode). */
  resetKey: string;
  /** The applied 재생 구간 held by the host (page keys), so it survives a refresh and a copied link: `value` is shown as the applied range and "적용" reports the new one through `onChange`. Absent: the view keeps the range itself (Studio). The host owns clearing it when the entry changes. */
  range?: { value: Range | null; onChange: (range: Range, cursor: SiteWallClock) => void };
  /** Optional page-key cursor restored by the host on mount. */
  initialCursor?: SiteWallClock | null;
  /** Called for discrete seeks and when playback pauses or stops, never on each playback frame. */
  onCursorCommit?: (at: SiteWallClock) => void;
  /** Localized no-data copy supplied by the host; the shared Korean copy is used by standalone consumers. */
  noDataCopy?: ReplayNoDataCopy;
  /** When given, selecting an Occurrence hands its `EvidenceDetail` to the host (null clears the slot: reset, no valid state, no selection, removal, unmount) and the inline "근거 상세" tab is omitted. The callback must be stable (memoised or a state setter): a new identity re-publishes. */
  renderDetail?: (detail: { node: ReactNode; label: string } | null) => void;
  links?: {
    /** The "Journey 열기" control for the selected wafer Occurrence; absent = no control. */
    journey?: (occurrenceId: string) => ReactNode;
    /** Extra host controls, rendered after the Journey control in the Top View panel's action area. */
    actions?: ReactNode;
  };
  /** Largest `timelineCost` (records + breakpoints × (context + (open + inversions) × resolve)) the Gantt is computed for; tests only, `TIMELINE_BUDGET` by default. */
  timelineBudget?: number;
  /** Most Gantt spans (materials + activities + markers) drawn; tests only, `GANTT_SPAN_LIMIT` by default. */
  ganttSpanLimit?: number;
  /** Frame clock for playback; tests only, the browser's by default. */
  scheduler?: PlaybackScheduler;
};

/** The selected detail tab; `tab` needs `onTabChange` (a controlled tab with no way to change is a dead tab strip). Used to keep the tab across the host's own remounts (a Studio load). */
export type FocusViewProps = FocusViewBaseProps & (
  | { tab: FocusTab; onTabChange: (tab: FocusTab) => void }
  | { tab?: undefined; onTabChange?: undefined }
);

/** Top View, Gantt and Occurrence list on one cursor, from props only (no page chrome, router or loader). */
export function FocusView({ input, notices, trust, entityType, anchor, resetKey, range: hostRange, initialCursor = null, onCursorCommit, noDataCopy, renderDetail, tab: controlledTab, onTabChange, links, timelineBudget = TIMELINE_BUDGET, ganttSpanLimit = GANTT_SPAN_LIMIT, scheduler }: FocusViewProps) {
  const entryKey = JSON.stringify([entityType, anchor]);
  // An anchor naming an Occurrence of the batch is the entry: it starts selected (view state only; the cursor is the entry's own).
  const entryId = entryOccurrence(input.batch, { entityType, anchor })?.id ?? null;
  const entry = useMemo(() => focusRange(input.batch, { entityType, anchor }, initialCursor), [input.batch, entityType, anchor, initialCursor]);
  const fresh = (): View => ({ resetKey, entryKey, applied: null, draft: null, rangeError: null, rangeExpanded: false, cursorMoveNotice: null, cursorAnnouncement: null, cursor: entry.cursor,
    selectedOccurrenceId: entryId, selectedComponentId: null, expanded: new Set(), mode: { kind: 'time' }, illustrative: false });
  const [view, setView] = useState<View>(fresh);
  const [ownTab, setOwnTab] = useState<FocusTab>('list');
  // The zoom controls render into the Top View panel header (not over the fixed-width viewer, where a narrow page clips them).
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const rangeId = useId();
  const rangeRegionId = `${rangeId}-region`;
  const changeButton = useRef<HTMLButtonElement>(null);
  const focusRoot = useRef<HTMLDivElement>(null);
  const cursorSnapshot = useRef<SiteWallClock | null>(null);
  const playbackWasActive = useRef(false);
  // The Enter that confirms a Korean composition (Safari: right after compositionend) does not apply the range (#2236).
  const ime = useImeEnterGuard();
  const rangeErrorId = `${rangeId}-error`;
  // Everything below belongs to the reset key and the entry key: a change clears it during render. The cursor, range and
  // selection belong to one batch.
  const cursorMoveNotice = initialCursor === null && view.cursor !== null && view.cursor !== entry.cursor ? { from: view.cursor, to: entry.cursor } : null;
  if (view.resetKey !== resetKey) setView(fresh());
  else if (view.entryKey !== entryKey) setView({ ...view, entryKey, applied: null, draft: null, rangeError: null, rangeExpanded: false, cursorMoveNotice, cursorAnnouncement: null, cursor: entry.cursor, selectedOccurrenceId: entryId, mode: { kind: 'time' } });

  const range = (hostRange ? hostRange.value : view.applied) ?? entry.range ?? null;
  const noData = range !== null && !hasKnownOccurrenceInWindow(input.batch, range);
  const rawCursor = view.cursor ?? entry.cursor ?? null;
  const cursorIsInRange = (at: SiteWallClock, candidate: Range) => at >= candidate.from && (at < candidate.to || (at === candidate.to && candidate.to === input.batch.to));
  const cursor = range && rawCursor && cursorIsInRange(rawCursor, range) ? rawCursor : range?.from ?? null;
  const currentCursorMoveNotice = view.cursorMoveNotice ?? (rawCursor !== null && cursor !== null && rawCursor !== cursor ? { from: rawCursor, to: cursor } : null);

  const framed = useMemo((): { frame: ReplayTimelineFrame } | { error: string } | null => {
    if (!range || noData) return null;
    try {
      return { frame: replayTimelineFrame(input, range) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, range, noData]);
  const frame = framed && 'frame' in framed ? framed.frame : null;
  const cost = useMemo(() => frame ? timelineCost(input, frame) : null, [input, frame]);
  const tooLarge = cost !== null && cost.cost > timelineBudget;
  // The Gantt is the only view that needs the full timeline; above the budget everything else still runs on `input` and `frame`.
  const computed = useMemo((): { timeline: ReplayTimeline } | { error: string } | null => {
    if (!range || noData || cost === null || tooLarge) return null;
    try {
      return { timeline: replayTimeline(input, range) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, range, cost, tooLarge, noData]);
  const computedTimeline = computed && 'timeline' in computed ? computed.timeline : null;
  const spans = computedTimeline ? computedTimeline.materials.length + computedTimeline.activities.length + computedTimeline.markers.length : 0;
  const tooManySpans = spans > ganttSpanLimit;
  const timeline = tooManySpans ? null : computedTimeline;
  const steps = useMemo(() => range ? recordSteps(input.batch, range) : [], [input.batch, range]);
  const { mode } = view;
  const sequenceSeq = mode.kind === 'sequence' && steps.some((s) => s.seq === mode.seq) ? mode.seq : null;
  const sceneState = useMemo((): SceneState | { error: string } | null => {
    if (!frame || !cursor || noData) return null;
    try {
      return sequenceSeq !== null ? stepSceneState(input, sequenceSeq) : seekSceneState(input, cursor);
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [input, frame, cursor, sequenceSeq, noData]);
  const state = sceneState && !('error' in sceneState) ? sceneState : null;
  const layout = bindingLayout(input, state?.binding);
  const selectedId = view.selectedOccurrenceId;
  const highlight = useMemo(() => {
    if (!state || selectedId === null) return null;
    const ids = [
      ...state.materials.filter((m) => m.occurrenceId === selectedId && m.location).map((m) => m.location!.componentId),
      ...state.components.filter((c) => c.occurrenceIds.includes(selectedId)).map((c) => c.componentId),
    ];
    return ids.length ? { componentIds: [...new Set(ids)] } : null;
  }, [state, selectedId]);
  const selectedMaterial = selectedId === null ? undefined : input.batch.occurrences.find((o) => o.id === selectedId)?.material;
  const journeyAnchor = selectedMaterial?.kind === 'wafer' && selectedMaterial.id !== null ? selectedId : null;
  const ghosts = useMemo(
    () => view.illustrative && state ? illustrativeGhosts(input, state, layout) : null,
    [view.illustrative, input, state, layout]);
  const replay = useMemo(() => state ? { state, ...(ghosts ? { illustrative: ghosts } : {}) } : null, [state, ghosts]);

  // The host's detail slot shows the evidence of the selected Occurrence at the shown state; it is cleared (null) through the
  // same callback when that stops holding, the callback is replaced or removed, and on unmount.
  const detail = useMemo(
    () => selectedId === null || !state || noData ? null : { node: <EvidenceDetail batch={input.batch} state={state} selectedOccurrenceId={selectedId} />, label: `근거 상세 · ${selectedId}` },
    [input.batch, state, selectedId, noData]);
  useEffect(() => {
    if (!renderDetail) return;
    renderDetail(detail);
    return () => renderDetail(null);
  }, [renderDetail, detail]);

  const patch = useCallback((changes: Partial<View>) => setView((previous) => ({ ...previous, ...changes })), []);
  const selectGanttOccurrence = useCallback((id: string) => patch({ selectedOccurrenceId: id }), [patch]);
  const toggleGanttLane = useCallback((id: string) => setView((previous) => {
    const expanded = new Set(previous.expanded);
    if (!expanded.delete(id)) expanded.add(id);
    return { ...previous, expanded };
  }), []);
  const updateCursor = useCallback((at: SiteWallClock) => patch({ cursor: at, mode: { kind: 'time' }, cursorMoveNotice: null, cursorAnnouncement: null }), [patch]);
  const playback = usePlayback({ cursor, range, onCursorChange: updateCursor, resetKey: JSON.stringify([resetKey, entryKey]), scheduler });
  const { pause: pausePlayback, play: playPlayback, playing } = playback;
  useEffect(() => { cursorSnapshot.current = cursor; }, [cursor]);
  useEffect(() => {
    if (playbackWasActive.current && !playing && cursorSnapshot.current !== null) onCursorCommit?.(cursorSnapshot.current);
    playbackWasActive.current = playing;
  }, [playing, onCursorCommit]);
  const shownAt = state?.at ?? null;
  const breakpoints = frame?.breakpoints ?? [];
  const previousBreakpoint = shownAt === null ? undefined : [...breakpoints].reverse().find((t) => t < shownAt);
  const nextBreakpoint = shownAt === null ? undefined : breakpoints.find((t) => t > shownAt);
  const announceCursor = useCallback((at: SiteWallClock) => patch({ cursorAnnouncement: `재생 커서를 ${wallClockText(at)}로 옮겼습니다` }), [patch]);
  const commitCursor = useCallback((at: SiteWallClock) => { announceCursor(at); onCursorCommit?.(at); }, [announceCursor, onCursorCommit]);
  const stepBreakpoint = useCallback((at: SiteWallClock) => {
    const wasPlaying = playing;
    pausePlayback();
    updateCursor(at);
    announceCursor(at);
    if (!wasPlaying) onCursorCommit?.(at);
  }, [announceCursor, onCursorCommit, pausePlayback, playing, updateCursor]);
  const togglePlayback = useCallback(() => {
    if (playing) pausePlayback();
    else { patch({ mode: { kind: 'time' }, cursorMoveNotice: null, cursorAnnouncement: null }); playPlayback(); }
  }, [patch, playPlayback, pausePlayback, playing]);
  useEffect(() => {
    const onPageKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      const element = target instanceof Element ? target : null;
      const htmlElement = target instanceof HTMLElement ? target : null;
      if (htmlElement?.isContentEditable || element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (event.key === ' ' && element?.closest('button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="slider"]')) return;
      const inView = target instanceof Node && focusRoot.current?.contains(target);
      if (!inView && target !== document.body && target !== document.documentElement) return;
      if (event.key === ' ') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const next = event.key === 'ArrowLeft' ? previousBreakpoint : nextBreakpoint;
        if (next !== undefined) stepBreakpoint(next);
      }
    };
    document.addEventListener('keydown', onPageKeyDown);
    return () => document.removeEventListener('keydown', onPageKeyDown);
  }, [nextBreakpoint, previousBreakpoint, stepBreakpoint, togglePlayback]);
  const stepIndex = sequenceSeq === null ? -1 : steps.findIndex((s) => s.seq === sequenceSeq);
  const entryStep = !state ? undefined : state.appliedSeq === null ? steps[0] : steps.filter((s) => s.seq <= state.appliedSeq!).at(-1);
  const enterSequence = () => {
    if (!entryStep) return;
    playback.pause();
    patch({ mode: { kind: 'sequence', seq: entryStep.seq } });
  };
  const moveStep = (index: number) => { const step = steps[index]; if (step) patch({ mode: { kind: 'sequence', seq: step.seq } }); };
  const draft = view.draft ?? (range ? { from: range.from, to: range.to } : { from: '', to: '' });
  const apply = () => {
    const parsed = parseRange(draft.from, draft.to);
    if ('error' in parsed) { patch({ rangeError: parsed.error }); return; }
    const outside = cursor === null || !cursorIsInRange(cursor, parsed.range);
    const nextCursor = outside ? parsed.range.from : cursor;
    const cursorMove = cursor !== null && nextCursor !== cursor ? { from: cursor, to: nextCursor } : null;
    hostRange?.onChange(parsed.range, nextCursor);
    patch({ applied: parsed.range, draft: null, rangeError: null, rangeExpanded: false, mode: { kind: 'time' }, cursor: nextCursor, cursorMoveNotice: cursorMove, cursorAnnouncement: null });
    changeButton.current?.focus();
  };
  const selectAndSeek = (id: string) => {
    const start = input.batch.occurrences.find((o) => o.id === id)?.start.at ?? null;
    const move = start !== null && range !== null && cursorIsInRange(start, range);
    patch({ selectedOccurrenceId: id, ...(move ? { cursor: start, mode: { kind: 'time' }, cursorMoveNotice: null } : {}) });
    if (move && start !== null) commitCursor(start);
  };
  // With the host's detail slot there is no inline "detail" tab: a tab value of 'detail' shows the list.
  const tab = renderDetail && (controlledTab ?? ownTab) === 'detail' ? 'list' : controlledTab ?? ownTab;
  const tabs = renderDetail ? TABS.filter((item) => item.id !== 'detail') : TABS;

  const showTopView = !noData && !!(frame && state && cursor);
  const noticeLine = <NoticeList notices={[...notices, ...(entry.notice ? [entry.notice] : [])]} className="mb-2" />;
  const cursorNotice = currentCursorMoveNotice
    ? `재생 커서를 ${wallClockText(currentCursorMoveNotice.from)} → ${wallClockText(currentCursorMoveNotice.to)}로 옮겼습니다`
    : view.cursorAnnouncement;
  const sliderMin = range ? wallClockToMillis(range.from) : 0;
  const rangeEnd = range ? wallClockToMillis(range.to) : sliderMin;
  const sliderMax = range && state && range.to === input.batch.to && state.at === range.to ? rangeEnd : Math.max(sliderMin, rangeEnd - 1);
  const sliderValue = state ? wallClockToMillis(state.at) : sliderMin;

  return (
    <div ref={focusRoot} className="contents">
      {!showTopView && <>{trust}{noticeLine}</>}
      {range && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span>재생 구간 {wallClockText(range.from)} → {wallClockText(range.to)} ({formatRangeDuration(range)})</span>
            <Button ref={changeButton} type="button" variant="secondary" size="toolbar" aria-expanded={view.rangeExpanded} aria-controls={rangeRegionId}
              onClick={() => patch({ rangeExpanded: !view.rangeExpanded })}>변경</Button>
          </div>
          {cursorNotice && <p aria-live="polite" className="m-0 mb-2 text-sm text-text-secondary">{cursorNotice}</p>}
          <div id={rangeRegionId} role="region" aria-label="재생 구간 변경" hidden={!view.rangeExpanded} className="mb-3">
          <form aria-label="구간" className="grid gap-3" onKeyDown={ime.onKeyDown} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} onSubmit={(event) => { event.preventDefault(); apply(); }}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label htmlFor={`${rangeId}-from`}>시작</Label>
                <Input id={`${rangeId}-from`} type="text" className="w-full max-w-72" value={draft.from}
                  aria-invalid={view.rangeError !== null} aria-describedby={view.rangeError ? rangeErrorId : undefined}
                  onChange={(event) => patch({ draft: { ...draft, from: event.target.value } })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${rangeId}-to`}>끝</Label>
                <Input id={`${rangeId}-to`} type="text" className="w-full max-w-72" value={draft.to}
                  aria-invalid={view.rangeError !== null} aria-describedby={view.rangeError ? rangeErrorId : undefined}
                  onChange={(event) => patch({ draft: { ...draft, to: event.target.value } })} />
              </div>
              <Button type="submit" variant="secondary" size="toolbar"><ArrowRight className="size-3.5" aria-hidden />적용</Button>
            </div>
            {view.rangeError && <p id={rangeErrorId} role="alert" className="m-0 text-xs text-text-danger-label">{view.rangeError}</p>}
          </form>
          </div>
        </>
      )}
      {noData ? <StateMessage icon={Inbox} title={noDataCopy?.title ?? REPLAY_NO_DATA_MESSAGES.replayNoDataTitle.ko}
        body={`${noDataCopy?.lastData ?? REPLAY_NO_DATA_MESSAGES.replayNoDataLastData.ko} ${wallClockText(input.batch.watermark.at)}`} /> : <>
      {framed && 'error' in framed && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${framed.error}`} />}
      {computed && 'error' in computed && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${computed.error}`} />}
      {sceneState && 'error' in sceneState && <StateMessage compact tone="danger" icon={ServerCrash} title={`Replay 오류: ${sceneState.error}`} />}
      {showTopView && (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <Panel title="Top View" className="max-w-full min-w-0 flex-none overflow-auto"
              actions={<>
                {trust}
                <span ref={setZoomHost} className="contents" />
                <Checkbox id={`${rangeId}-illustrative`} checked={view.illustrative} onCheckedChange={(value) => patch({ illustrative: value === true })} />
                <Label htmlFor={`${rangeId}-illustrative`}>예시 이동 표시</Label>
                {view.illustrative && <EvidenceBadge level="illustrative">예시 이동</EvidenceBadge>}
                {journeyAnchor !== null && links?.journey?.(journeyAnchor)}
                {links?.actions}
              </>}>
              {noticeLine}
              {layout ? (
                <TopViewer layout={layout} width={720} height={420} replay={replay} highlight={highlight}
                  selectedId={view.selectedComponentId} onSelectedChange={(id) => patch({ selectedComponentId: id })}
                  renderControls={(controls) => zoomHost && createPortal(<ViewerZoomControls controls={controls} labels={{ zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }} />, zoomHost)} />
              ) : <EmptyState size="sm" icon={<MapPinOff className="size-4" aria-hidden />} title="이 시점에 적용된 Binding이 없어 Top View를 표시할 수 없습니다" />}
              <PlaybackControls playing={playing} onPlay={togglePlayback} onPause={pausePlayback}
                speed={playback.speed} onSpeedChange={playback.setSpeed}
                onPreviousBreakpoint={previousBreakpoint === undefined ? null : () => stepBreakpoint(previousBreakpoint)}
                onNextBreakpoint={nextBreakpoint === undefined ? null : () => stepBreakpoint(nextBreakpoint)}
                slider={{ min: sliderMin, max: sliderMax, value: sliderValue, startLabel: range ? wallClockText(range.from) : '',
                  currentLabel: shownAt ? wallClockText(shownAt) : '', endLabel: range ? wallClockText(range.to) : '',
                  onValueChange: (value) => updateCursor(millisToWallClock(value)),
                  onValueCommit: (value) => commitCursor(millisToWallClock(value)) }}
                sequence={{ available: entryStep !== undefined || sequenceSeq !== null,
                  unavailableReason: '이 시점까지 적용된 기록이 구간 안에 없어 기록 단위 보기를 쓸 수 없습니다', active: sequenceSeq !== null,
                  onToggle: () => sequenceSeq !== null ? patch({ mode: { kind: 'time' } }) : enterSequence(),
                  onPrevious: stepIndex > 0 ? () => moveStep(stepIndex - 1) : null,
                  onNext: stepIndex >= 0 && stepIndex < steps.length - 1 ? () => moveStep(stepIndex + 1) : null,
                  step: sequenceSeq === null ? null : { seq: sequenceSeq, at: state.at } }} />
            </Panel>
            <div className="min-w-0 flex-1 basis-96">
              <CursorStateList state={state} {...(ghosts ? { illustrative: ghosts } : {})} />
            </div>
          </div>
          <Panel title="Gantt">
            {timeline ? (
              <FocusGantt timeline={timeline} layout={layout} batch={input.batch} cursor={state.at}
                onCursorChange={updateCursor} onCursorCommit={commitCursor} selectedOccurrenceId={selectedId}
                onSelectOccurrence={selectGanttOccurrence} selectedComponentId={view.selectedComponentId}
                expanded={view.expanded} onToggleExpand={toggleGanttLane} />
            ) : tooLarge ? (
              <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                body={`범위를 좁히세요. 지금 범위는 기록 ${count(cost.records)}개 + 전환 시점 ${count(cost.breakpoints)}개 × (읽기마다 Binding·Layout 탐색 ${count(cost.context)} + (동시 open Occurrence ${count(cost.open)}개 + 시간 역전 ${count(cost.inversions)}개) × 위치 해석 ${count(cost.resolve)}) = ${count(cost.cost)}로 Gantt 계산 한도 ${count(timelineBudget)}을 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
            ) : tooManySpans && (
              <StateMessage tone="warning" icon={ChartGantt} title="구간이 커서 Gantt를 그리지 않습니다"
                body={`범위를 좁히세요. 지금 범위의 Gantt 막대는 ${count(spans)}개로 그리기 한도 ${count(ganttSpanLimit)}개를 넘습니다. Top View·커서 시점 상태·Occurrence 목록·Data Quality·근거 상세는 그대로 씁니다.`} />
            )}
          </Panel>
          {/* Escape closes the detail from anywhere in the tabs, a focused table row included. */}
          <div onKeyDown={(event) => { if (event.key === 'Escape' && selectedId !== null) patch({ selectedOccurrenceId: null }); }}>
          <Tabs value={tab} onValueChange={(value) => { setOwnTab(value as FocusTab); onTabChange?.(value as FocusTab); }} className="mt-4">
            <TabsList aria-label="Focus 상세">
              {tabs.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="list">
              <OccurrenceList batch={input.batch} timeline={frame} bindings={input.bindings} appliedSeq={state.appliedSeq}
                anchorOccurrenceId={entryId} selectedOccurrenceId={selectedId} onSelectOccurrence={selectAndSeek} />
            </TabsContent>
            <TabsContent value="quality"><DataQualityList timeline={frame} appliedSeq={state.appliedSeq} onSelectOccurrence={selectAndSeek} /></TabsContent>
            {!renderDetail && <TabsContent value="detail"><EvidenceDetail batch={input.batch} state={state} selectedOccurrenceId={selectedId} /></TabsContent>}
          </Tabs>
          </div>
        </>
      )}
      </>}
    </div>
  );
}
