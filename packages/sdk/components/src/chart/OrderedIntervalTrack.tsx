import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Ban, Inbox, Info, ServerCrash } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@ap/ui';
import { isThemeColorToken, readColorToken } from '@ap/ui/theme';
import { useI18n } from '@ap/kernel';
import { AnalysisSectionContext } from '../archetypes/AnalysisSectionContext';
import { LoadingBlock, StateMessage } from '../StateView';
import { ChartTrustFooter } from './analysisChartFrameParts';
import { OrderedIntervalPlot } from './OrderedIntervalPlot';
import {
  clampOrderView,
  orderedTooltipPosition,
  visiblePartialGaps,
  validOrderDomain,
  validOrderedItems,
  visibleOrderedItems,
} from './orderedIntervalGeometry';
import {
  ORDERED_TRACK_RESPONSE_LIMIT,
  type OrderedIntervalTrackProps,
  type OrderedTrackItem,
  type OrderedTrackLoadState,
} from './orderedIntervalTypes';

/** Consumer-declared order intervals. No pairing, timestamp sorting or domain interpretation. */
export function OrderedIntervalTrack(props: OrderedIntervalTrackProps) {
  const { tx, lang } = useI18n();
  const section = useContext(AnalysisSectionContext);
  const domainValid = validOrderDomain(props.domain);
  const domainFrom = domainValid ? props.domain[0] : 0;
  const domainTo = domainValid ? props.domain[1] : 1;
  const domain = useMemo<[number, number]>(() => [domainFrom, domainTo], [domainFrom, domainTo]);
  const displayOrder = useMemo(
    () =>
      props.formatTick ??
      (props.axis === 'time' && props.formatTime
        ? props.formatTime
        : new Intl.NumberFormat(lang, {
            maximumFractionDigits: domain.every(Number.isInteger) ? 0 : 2,
          }).format),
    [props.formatTick, props.axis, props.formatTime, lang, domain],
  );
  const [viewState, setView] = useState(() => clampOrderView(props.initialView ?? domain, domain));
  const view = useMemo(() => clampOrderView(viewState, domain), [viewState, domain]);
  const [loaded, setLoaded] = useState<readonly OrderedTrackItem[] | null>(null);
  const [request, setRequest] = useState<OrderedTrackLoadState>('ready');
  const [round, setRound] = useState(0);
  const [errorRetry, setErrorRetry] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const [brushMode, setBrushMode] = useState(false);
  const [textView, setTextView] = useState(false);
  const [pageState, setPage] = useState(0);
  const [timeLabels, setTimeLabels] = useState(false);
  const [hover, setHover] = useState<{ item: OrderedTrackItem; x: number; y: number } | null>(null);
  const helpId = useId();
  const summaryId = useId();
  const tooltip = useRef<HTMLDivElement>(null);
  const kind = props.state?.kind ?? 'ready';
  const restricted =
    !domainValid || kind === 'forbidden' || kind === 'unsupported' || kind === 'empty';
  const sourceItems = props.onRangeRequest && loaded !== null ? loaded : props.items;
  const overCap = sourceItems.length > ORDERED_TRACK_RESPONSE_LIMIT;
  const data = useMemo(
    () => (overCap ? [] : validOrderedItems(sourceItems)),
    [sourceItems, overCap],
  );
  const visible = useMemo(
    () =>
      visibleOrderedItems(
        data,
        view,
        props.lanes.map((lane) => lane.laneKey),
      ).sort((a, b) => a.orderStart - b.orderStart),
    [data, view, props.lanes],
  );
  const focused = visible.find((item) => item.id === focusId) ?? visible[0];
  const selectedId = props.selectedId === undefined ? selection : props.selectedId;
  const selected = data.find((item) => item.id === selectedId);
  const loading = !restricted && (kind === 'loading' || request === 'loading');
  const recoveringError = kind === 'error' && errorRetry;
  const failed = overCap || (kind === 'error' && !recoveringError) || request === 'error';
  const loadObserver = useRef(props.onLoadStateChange);
  useEffect(() => {
    loadObserver.current = props.onLoadStateChange;
  }, [props.onLoadStateChange]);
  const reportLoad = useCallback(
    (state: OrderedTrackLoadState) => loadObserver.current?.(state),
    [],
  );
  useEffect(() => {
    if (kind !== 'error') setErrorRetry(false);
  }, [kind]);
  useEffect(() => {
    if (restricted || (kind === 'error' && !recoveringError) || !props.onRangeRequest) {
      setRequest('ready');
      return;
    }
    const controller = new AbortController();
    const loader = props.onRangeRequest;
    setRequest('loading');
    reportLoad('loading');
    async function load() {
      try {
        const result = await loader(view[0], view[1], controller.signal);
        if (controller.signal.aborted) return;
        if (result.length > ORDERED_TRACK_RESPONSE_LIMIT)
          throw new Error('OrderedIntervalTrack response limit exceeded');
        setLoaded(result);
        setRequest('ready');
        reportLoad('ready');
      } catch {
        if (!controller.signal.aborted) {
          setRequest('error');
          reportLoad('error');
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [restricted, kind, recoveringError, props.onRangeRequest, view, round, reportLoad]);
  useEffect(() => {
    const element = tooltip.current;
    if (!element || !hover) return;
    const { left, top } = orderedTooltipPosition(
      hover.x,
      hover.y,
      element.offsetWidth,
      element.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    );
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [hover]);
  const moveView = useCallback(
    (range: [number, number]) => {
      setView((previous) => {
        const next = clampOrderView(range, [domainFrom, domainTo]);
        return previous[0] === next[0] && previous[1] === next[1] ? previous : next;
      });
      setHover(null);
      setPage(0);
    },
    [domainFrom, domainTo],
  );
  const zoom = useCallback(
    (factor: number, anchor = (view[0] + view[1]) / 2) => {
      const ratio = (anchor - view[0]) / (view[1] - view[0]);
      const span = (view[1] - view[0]) * factor;
      moveView([anchor - span * ratio, anchor + span * (1 - ratio)]);
    },
    [view, moveView],
  );
  function select(item: OrderedTrackItem | null) {
    if (item) setFocusId(item.id);
    setSelection(item?.id ?? null);
    props.onSelect?.(item);
  }
  function itemState(item: OrderedTrackItem) {
    return `${props.states[item.state]?.label ?? item.state}${item.kind === 'point' ? ` · ${tx({ ko: '점 이벤트', en: 'Point event' })}` : item.orderEnd === undefined ? ` · ${tx({ ko: '종료 미확인 · 불완전', en: 'End unknown · Incomplete' })}` : ''}${item.carryover ? ` · ${tx({ ko: '파일 경계 이월 · 불완전', en: 'Boundary carryover · Incomplete' })}` : ''}`;
  }
  function itemOrder(item: OrderedTrackItem) {
    return `${displayOrder(item.orderStart)}${item.kind === 'point' ? '' : `–${item.orderEnd === undefined ? tx({ ko: '종료 미확인 · 불완전', en: 'End unknown · Incomplete' }) : displayOrder(item.orderEnd)}`}`;
  }
  function itemText(item: OrderedTrackItem) {
    return `${props.lanes.find((lane) => lane.laneKey === item.laneKey)?.label ?? ''} · ${item.label} · ${props.states[item.state]?.label ?? item.state} · ${itemOrder(item)}${item.kind === 'point' ? ` · ${tx({ ko: '점 이벤트', en: 'Point event' })}` : ''}${item.carryover ? ` · ${tx({ ko: '파일 경계 이월 · 불완전', en: 'Boundary carryover · Incomplete' })}` : ''}`;
  }
  function rangeAnnotations() {
    return (
      <>
        {(props.markers ?? [])
          .filter((marker) => marker.order >= view[0] && marker.order <= view[1])
          .map((marker) => (
            <span className="block" key={`${marker.kind}:${marker.order}:${marker.label}`}>
              {marker.kind === 'boundary'
                ? tx({ ko: '파일 경계', en: 'File boundary' })
                : marker.kind === 'inversion'
                  ? tx({ ko: '시간 역전', en: 'Time inversion' })
                  : tx({ ko: '부분 결과 경계', en: 'Partial boundary' })}{' '}
              · {marker.label} · {displayOrder(marker.order)}
            </span>
          ))}
        {visiblePartialGaps(props.partialGaps, view).map((gap) => (
          <span className="block" key={`${gap.orderStart}:${gap.orderEnd}`}>
            {tx({ ko: '미수신', en: 'Unreceived' })}: {displayOrder(gap.orderStart)}–
            {displayOrder(gap.orderEnd)}
          </span>
        ))}
      </>
    );
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || restricted) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      select(null);
      setHover(null);
      setBrush(null);
      setBrushMode(false);
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(0.8);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      zoom(1.25);
      return;
    }
    if (event.key === 'Enter' && focused) {
      event.preventDefault();
      select(focused);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const start = brush?.[0] ?? view[0];
      const minimum = Math.min(1, view[1] - start);
      const step = Math.max(minimum, (view[1] - view[0]) / 20);
      const end = Math.max(
        start + minimum,
        Math.min(view[1], (brush?.[1] ?? start) + (event.key === 'ArrowLeft' ? -step : step)),
      );
      setBrush([start, end]);
      setBrushMode(true);
      return;
    }
    if (!focused) return;
    const laneItems = visible.filter((item) => item.laneKey === focused.laneKey);
    const index = laneItems.findIndex((item) => item.id === focused.id);
    let next =
      laneItems[
        Math.max(0, Math.min(laneItems.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
      ];
    if (event.key === 'Home') next = laneItems[0];
    if (event.key === 'End') next = laneItems.at(-1) ?? focused;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const row = props.lanes.findIndex((lane) => lane.laneKey === focused.laneKey);
      const lane =
        props.lanes[
          Math.max(0, Math.min(props.lanes.length - 1, row + (event.key === 'ArrowUp' ? -1 : 1)))
        ];
      next =
        visible
          .filter((item) => item.laneKey === lane.laneKey)
          .reduce<OrderedTrackItem | undefined>(
            (best, item) =>
              !best ||
              Math.abs(item.orderStart - focused.orderStart) <
                Math.abs(best.orderStart - focused.orderStart)
                ? item
                : best,
            undefined,
          ) ?? focused;
    }
    if (next) setFocusId(next.id);
  }
  const help = tx({
    ko: 'Shift 또는 Ctrl/⌘ + 휠: 확대 · 끌기: 이동 · 구간 선택: 끌기 / Shift+←→ · 방향키: 줄·항목 탐색 · Enter: 선택 · Escape: 해제 · +/−: 확대·축소 · 촘촘한 점은 축 아래 밀도로 표시 · 항목 목록: 현재 범위의 텍스트 대안',
    en: 'Shift or Ctrl/⌘ + wheel: Zoom · Drag: Pan · Brush: Drag / Shift+arrows · Arrows: Lanes/items · Enter: Select · Escape: Clear · +/−: Zoom · Dense points appear below the axis · Item list: Visible-range text alternative',
  });
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const page = Math.min(pageState, pages - 1);
  const retry = () => {
    props.state?.onRetry?.();
    if (kind === 'error') setErrorRetry(true);
    setRound((n) => n + 1);
  };
  const notice = (kind !== 'ready' && !recoveringError) || failed || !domainValid;
  return (
    <section
      aria-label={props.ariaLabel}
      aria-describedby={`${helpId} ${summaryId}`}
      aria-busy={loading}
      tabIndex={0}
      onKeyDown={keyboard}
      className="relative min-w-0 break-keep rounded-lg border border-border-subtle bg-surface-card text-xs text-text-primary"
    >
      <header
        className={cn(
          'flex flex-wrap items-start justify-between gap-2 px-4 pt-3',
          section && 'pr-12',
        )}
      >
        <div className="min-w-0">
          <h3 className="t-card-title">{props.ariaLabel}</h3>
          {props.description && <p className="text-xs text-text-muted">{props.description}</p>}
        </div>
        <div
          role="toolbar"
          aria-label={tx({ ko: '차트 동작', en: 'Chart actions' })}
          className="ml-auto flex flex-wrap items-center justify-end gap-1"
        >
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={tx({ ko: '조작 방법', en: 'How to interact' })}
                >
                  <Info className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs break-keep">{help}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button type="button" size="toolbar" variant="ghost" disabled={restricted} onClick={() => zoom(0.8)}>
            {tx({ ko: '확대', en: 'Zoom in' })}
          </Button>
          <Button type="button" size="toolbar" variant="ghost" disabled={restricted} onClick={() => zoom(1.25)}>
            {tx({ ko: '축소', en: 'Zoom out' })}
          </Button>
          <Button
            type="button"
            size="toolbar"
            variant={brushMode ? 'secondary' : 'ghost'}
            disabled={restricted}
            aria-pressed={brushMode}
            onClick={() => setBrushMode(!brushMode)}
          >
            {tx({ ko: '구간 선택', en: 'Brush' })}
          </Button>
          <Button
            type="button"
            size="toolbar"
            variant="ghost"
            disabled={restricted}
            onClick={() => {
              moveView(domain);
              setBrush(null);
              setBrushMode(false);
            }}
          >
            {tx({ ko: '확대 초기화', en: 'Zoom Reset' })}
          </Button>
          {props.formatTime && (
            <Button
              type="button"
              size="toolbar"
              variant={timeLabels ? 'secondary' : 'ghost'}
              disabled={restricted}
              aria-pressed={timeLabels}
              onClick={() => setTimeLabels(!timeLabels)}
            >
              {tx({ ko: '시간 라벨', en: 'Time labels' })}
            </Button>
          )}
          <Button
            type="button"
            size="toolbar"
            variant={textView ? 'secondary' : 'ghost'}
            disabled={restricted}
            aria-pressed={textView}
            onClick={() => setTextView(!textView)}
          >
            {tx({ ko: '항목 목록', en: 'Item list' })}
          </Button>
        </div>
      </header>
      <p id={helpId} className="sr-only">
        {help}
      </p>
      {!restricted && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 t-caption text-text-secondary">
          {Object.entries(props.states).map(([key, state]) => (
            <span key={key} className="inline-flex items-center gap-1">
              <svg viewBox="0 0 8 8" className="size-2" aria-hidden="true">
                <rect
                  width="8"
                  height="8"
                  ref={(element) => {
                    if (element)
                      element.style.fill = readColorToken(
                        isThemeColorToken(state.colorToken) ? state.colorToken : 'chart-no-data',
                        element,
                      );
                  }}
                />
              </svg>
              {state.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 8 8" className="size-2 fill-chart-no-data stroke-text-secondary" strokeWidth="1" aria-hidden="true">
              <path d="M4 1 7 4 4 7 1 4Z" />
            </svg>
            {tx({ ko: '점 이벤트', en: 'Point event' })}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
              <path d="M0 1H9V11H0Z" className="fill-chart-no-data" />
              <path d="M10 0V12" className="stroke-text-secondary" strokeDasharray="2 2" />
            </svg>
            {tx({ ko: '종료 미확인 · 불완전', en: 'End unknown · Incomplete' })}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg
              viewBox="0 0 8 8"
              fill="none"
              className="size-2 stroke-text-secondary"
              aria-hidden="true"
            >
              <path d="m5 1-3 3 3 3" />
            </svg>
            {tx({ ko: '파일 경계 이월 · 불완전', en: 'Boundary carryover · Incomplete' })}
          </span>
        </div>
      )}
      {notice && (
        <div className="px-4 py-2">
          <StateMessage
            compact
            tone={failed ? 'danger' : kind === 'forbidden' ? 'warning' : 'neutral'}
            icon={
              kind === 'forbidden' ? (
                <Ban className="size-4" aria-hidden />
              ) : failed ? (
                <ServerCrash className="size-4" aria-hidden />
              ) : kind === 'empty' ? (
                <Inbox className="size-4" aria-hidden />
              ) : (
                <Info className="size-4" aria-hidden />
              )
            }
            title={
              props.state?.title ||
              tx({
                ko: !domainValid ? '지원하지 않는 범위' : '구간 불러오기 실패',
                en: !domainValid ? 'Unsupported range' : 'Range request failed',
              })
            }
            body={props.state?.body}
            action={
              (failed || kind === 'empty') && (props.onRangeRequest || props.state?.onRetry) ? (
                <Button type="button" size="toolbar" variant="secondary" onClick={retry}>
                  {props.state?.retryLabel ?? tx({ ko: '다시 시도', en: 'Retry' })}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      {!restricted && (
        <>
          <p className="px-4 py-1 t-caption text-text-secondary">
            {props.axisLabel && <>{props.axisLabel}{' '}</>}
            {displayOrder(view[0])}–{displayOrder(view[1])} ·{' '}
            {tx({
              ko: `${props.lanes.length}개 줄 · ${visible.length}개 항목`,
              en: `${props.lanes.length} lanes · ${visible.length} items`,
            })}
            {loading && data.length > 0 && (
              <span className="ml-2 t-caption text-text-secondary">
                {tx({ ko: '불러오는 중', en: 'Loading' })}
              </span>
            )}
          </p>
          {loading && data.length === 0 ? (
            <div className="px-4 py-2">
              <LoadingBlock />
            </div>
          ) : (
            <div className={loading ? 'opacity-50' : undefined}>
              {textView ? (
                <>
                  <p className="px-4 py-2 t-caption">
                    {tx({ ko: '현재 범위 항목 목록', en: 'Visible item list' })} · {page + 1}/
                    {pages}
                  </p>
                  <div className="mx-4 mb-2 rounded-md border border-border-subtle">
                    <table aria-describedby={summaryId} className="w-full text-xs tabular">
                      <caption className="text-left t-caption text-text-secondary">
                        {rangeAnnotations()}
                      </caption>
                      <thead className="bg-surface-sunken">
                        <tr>
                          {[
                            tx({ ko: '줄', en: 'Lane' }),
                            tx({ ko: '항목', en: 'Item' }),
                            tx({ ko: '상태', en: 'State' }),
                            tx({ ko: '순번', en: 'Order' }),
                          ].map((label, index) => (
                            <th
                              key={label}
                              scope="col"
                              className={cn(
                                't-table-header px-3 py-1.5 text-text-secondary',
                                index === 3 ? 'text-right' : 'text-left',
                              )}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.slice(page * 20, (page + 1) * 20).map((item) => (
                          <tr
                            key={item.id}
                            aria-selected={selectedId === item.id}
                            className={cn(
                              'border-t border-border-subtle',
                              selectedId === item.id && 'bg-surface-row-selected',
                            )}
                          >
                            <td className="px-3 py-1">
                              {props.lanes.find((lane) => lane.laneKey === item.laneKey)?.label}
                            </td>
                            <td className="px-3 py-1">
                              <button
                                type="button"
                                className="rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                aria-pressed={selectedId === item.id}
                                onClick={() => select(item)}
                              >
                                {item.label}
                              </button>
                            </td>
                            <td className="px-3 py-1">{itemState(item)}</td>
                            <td className="px-3 py-1 text-right">{itemOrder(item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 pb-2">
                    <Button
                      type="button"
                      size="toolbar"
                      variant="ghost"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      {tx({ ko: '이전 쪽', en: 'Previous page' })}
                    </Button>
                    <Button
                      type="button"
                      size="toolbar"
                      variant="ghost"
                      disabled={page === pages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      {tx({ ko: '다음 쪽', en: 'Next page' })}
                    </Button>
                  </div>
                </>
              ) : (
                <OrderedIntervalPlot
                  {...props}
                  formatTick={displayOrder}
                  items={visible}
                  view={view}
                  selected={selectedId}
                  focused={focused?.id ?? null}
                  focusedLane={props.lanes.findIndex((lane) => lane.laneKey === focused?.laneKey)}
                  timeLabels={timeLabels}
                  brushMode={brushMode}
                  brush={brush}
                  onBrush={setBrush}
                  onView={moveView}
                  onZoom={zoom}
                  onSelect={select}
                  onHover={(item, x, y) => setHover(item ? { item, x, y } : null)}
                />
              )}
            </div>
          )}
          <section
            aria-label={tx({ ko: '선택 요약', en: 'Selection summary' })}
            className="bg-surface-sunken px-4 py-2 text-text-secondary"
          >
            {brush ? (
              <>
                {tx({ ko: '선택 구간', en: 'Selected range' })}: {displayOrder(brush[0])}–
                {displayOrder(brush[1])}{' '}
                <Button type="button" size="toolbar" variant="ghost" onClick={() => moveView(brush)}>
                  {tx({ ko: '선택 구간 확대', en: 'Zoom to selection' })}
                </Button>
              </>
            ) : selected ? (
              itemText(selected)
            ) : (
              tx({ ko: '선택 없음', en: 'No selection' })
            )}
          </section>
        </>
      )}
      <output id={summaryId} aria-live="polite" className="block px-4 py-2 text-text-secondary">
        {!restricted && (
          <>
            {focused ? itemText(focused) : null}
            <span className="sr-only">{rangeAnnotations()}</span>
          </>
        )}
      </output>
      {kind !== 'forbidden' && <ChartTrustFooter trust={props.trust} />}
      {!restricted && hover && createPortal(
        <div
          ref={tooltip}
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs break-keep rounded border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary shadow-lg"
        >
          {itemText(hover.item)}
        </div>,
        document.body,
      )}
    </section>
  );
}
