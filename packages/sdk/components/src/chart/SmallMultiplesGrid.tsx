import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { TriangleAlert } from 'lucide-react';
import { formatDateTime, formatNumber, formatWallClock, type Text } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { useOptionalAnalysisSelectionOutput } from '@ap/kernel/host';
import { cn, InfoTip, RowSelectionBar, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { gridKeyTarget } from '../grid/gridKeyTarget';
import { COMPONENTS_MESSAGES } from '../messages';
import { LocalPanelOptions } from '../workspace/PanelOptions';
import { QueryPanelContentContext } from '../workspace/panelContext';
import { ChartBoundsLegend } from './ChartBoundsLegend';
import { chartDiagnostic } from './analysisChartData';
import type { ChartBoundLabels } from './chartBounds';
import { statusGlyph, statusText } from './chartStatus';
import { projectSmallMultiples, SmallMultiplePlot, smallMultipleStatusPaint, type SmallMultiplesSeries } from './smallMultiplesPlot';
import { releaseFocusLater } from '../state/releaseFocusLater';

export type SmallMultiplesSortOption = {
  /** Unique within the grid. `original` is reserved for input order. */
  id: string;
  label: Text;
  /** Compare the original series inputs. Equal series keep their input order. */
  compare: (a: SmallMultiplesSeries, b: SmallMultiplesSeries) => number;
};

type Density = 'regular' | 'compact';
type DisplayOption = ComponentProps<typeof LocalPanelOptions>['options'][number];

export type SmallMultiplesGridProps = {
  title: string;
  unit: string;
  series: readonly SmallMultiplesSeries[];
  columns?: number;
  sortOptions?: readonly SmallMultiplesSortOption[];
  /** Controlled sort. An undeclared ID falls back to input order. */
  sortId?: string;
  defaultSortId?: string;
  onSortChange?: (id: string) => void;
  /** Offer a local shared/independent Y-axis choice. Defaults to hidden. */
  showAxisControl?: boolean;
  density?: Density;
  showDensityControl?: boolean;
  onDensityChange?: (density: Density) => void;
  boundLabels?: ChartBoundLabels;
  /** Connects a declared set output. The registered panel owns its dimension. */
  analysisSelectionOutput?: { panelId: string; key: string; instanceId?: string } | null;
  /** Show previous data without publishing selections from it. */
  selectionDisabled?: boolean;
  /** Consumer entry point to the corresponding data table, or other panel actions. */
  actions?: ReactNode;
};

const DEFAULT_COLUMNS = 6;
const ORIGINAL_ORDER = 'original';
const SORT_ID = 'sort';
const INDEPENDENT = 'independent';
const AXIS_OPTION = {
  id: 'axis', kind: 'choice', label: COMPONENTS_MESSAGES.smallMultiplesAxis, default: 'shared',
  choices: [
    { value: 'shared', label: COMPONENTS_MESSAGES.smallMultiplesShared },
    { value: INDEPENDENT, label: COMPONENTS_MESSAGES.smallMultiplesIndependent },
  ],
} as const satisfies DisplayOption;
const DENSITY_OPTION = {
  id: 'density', kind: 'choice', label: COMPONENTS_MESSAGES.smallMultiplesDensity, default: 'regular',
  choices: [
    { value: 'regular', label: COMPONENTS_MESSAGES.smallMultiplesRegular },
    { value: 'compact', label: COMPONENTS_MESSAGES.smallMultiplesCompact },
  ],
} as const satisfies DisplayOption;
const tileHeight = { compact: 'h-18', regular: 'h-30' } as const;
const iconTone = { danger: 'text-text-danger-label', warning: 'text-text-warning-label', neutral: 'text-text-secondary' } as const;

function focusTile(scroll: HTMLDivElement, button: HTMLButtonElement) {
  button.focus({ preventScroll: true });
  const tileRect = button.getBoundingClientRect();
  const portTop = scroll.getBoundingClientRect().top;
  const portBottom = portTop + scroll.clientHeight;
  if (tileRect.top < portTop) scroll.scrollTop += tileRect.top - portTop;
  else if (tileRect.bottom > portBottom) scroll.scrollTop += tileRect.bottom - portBottom;
}

/**
 * The full range of a per-tile axis. Radix closes an open tooltip when an ancestor of its trigger scrolls; a tile that keeps keyboard focus while
 * arrow keys scroll the grid keeps its tooltip (#3078). Pointer hover, Escape and blur close it as before.
 */
function RangeTooltip({ range, gridScroll, children }: { range: string; gridScroll: RefObject<Event | null>; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <Tooltip open={open} onOpenChange={next => {
    // The grid's own capture listener runs first, so a close requested while that scroll event is still dispatching came from the grid.
    if (!next && gridScroll.current?.eventPhase === Event.CAPTURING_PHASE && trigger.current?.matches(':focus-visible')) return;
    setOpen(next);
  }}>
    {/* The button already describes the range and any status, even before the tooltip opens. */}
    <TooltipTrigger asChild ref={trigger} aria-describedby={undefined}>{children}</TooltipTrigger>
    <TooltipContent portal size="sm" className="max-w-xs wrap-anywhere">{range}</TooltipContent>
  </Tooltip>;
}

export function SmallMultiplesGrid({ title, unit, series, columns = DEFAULT_COLUMNS, density, showDensityControl, onDensityChange, boundLabels,
  sortOptions, sortId, defaultSortId = ORIGINAL_ORDER, onSortChange, showAxisControl,
  analysisSelectionOutput, selectionDisabled, actions }: SmallMultiplesGridProps) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const [localSortId, setLocalSortId] = useState(defaultSortId);
  const [independent, setIndependent] = useState(false);
  const [localDensity, setLocalDensity] = useState<Density>(DENSITY_OPTION.default);
  const activeDensity = density ?? localDensity;
  const compact = activeDensity === 'compact';
  const sorts = useMemo(() => {
    const byId = new Map<string, SmallMultiplesSortOption>();
    for (const option of sortOptions ?? []) {
      if (!option.id || option.id === ORIGINAL_ORDER || byId.has(option.id)) {
        chartDiagnostic(`invalid or duplicate SmallMultiplesGrid sort option ID: ${option.id}`);
        continue;
      }
      byId.set(option.id, option);
    }
    return byId;
  }, [sortOptions]);
  const sort = sorts.get(sortId ?? localSortId);
  const { tiles: inputTiles, x, y, legend } = useMemo(() => projectSmallMultiples(series, boundLabels, lang), [series, boundLabels, lang]);
  const tiles = useMemo(() => {
    if (!sort) return inputTiles;
    return inputTiles.map((tile, index) => ({ tile, source: series[index] }))
      .sort((a, b) => sort.compare(a.source, b.source))
      .map(({ tile }) => tile);
  }, [inputTiles, series, sort]);
  const priorResult = useContext(QueryPanelContentContext) === 'prior';
  const canSelect = !!analysisSelectionOutput && !selectionDisabled && !priorResult;
  const available = useMemo(() => canSelect ? [...new Set(series.flatMap(s => s.selectionValue ? [s.selectionValue] : []))].sort() : undefined, [series, canSelect]);
  const { selection, select } = useOptionalAnalysisSelectionOutput(analysisSelectionOutput ?? undefined,
    { available, instanceId: analysisSelectionOutput?.instanceId, subscribeHighlight: false });
  const picked = new Set(selection?.shape === 'set' ? selection.values : []);
  const [focusedId, setFocusedId] = useState<string>();
  const focusedButton = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridScroll = useRef<Event>(null);
  // The listener lives exactly as long as the scroll element: registered before any tooltip opens (so it runs before Radix's window capture
  // listener) and removed, with the element and the last event, when the tiles go or the grid unmounts.
  const attachScroll = useCallback((scroll: HTMLDivElement | null) => {
    scrollRef.current = scroll;
    const view = scroll?.ownerDocument.defaultView;
    if (!scroll || !view) return;
    const capture = (event: Event) => { if (event.target === scroll) gridScroll.current = event; };
    view.addEventListener('scroll', capture, { capture: true, passive: true });
    return () => {
      view.removeEventListener('scroll', capture, { capture: true });
      gridScroll.current = null;
      if (scrollRef.current === scroll) scrollRef.current = null;
    };
  }, []);
  const focusedTile = tiles.find(tile => tile.id === focusedId);
  if (focusedId !== undefined && !focusedTile) setFocusedId(undefined);
  const tabbableId = (focusedTile ?? tiles[0])?.id;
  useLayoutEffect(() => {
    const previous = focusedButton.current;
    if (!previous || previous.isConnected) return;
    focusedButton.current = null;
    const scroll = scrollRef.current;
    if (!scroll || scroll.ownerDocument.activeElement !== scroll.ownerDocument.body) return;
    const tabStop = scroll.querySelector<HTMLButtonElement>('[data-tile-index][tabindex="0"]');
    if (tabStop) focusTile(scroll, tabStop);
  });
  const count = useMemo(() => {
    if (Number.isSafeInteger(columns) && columns > 0) return columns;
    chartDiagnostic(`SmallMultiplesGrid.columns must be a positive safe integer; using ${DEFAULT_COLUMNS}`);
    return DEFAULT_COLUMNS;
  }, [columns]);
  const rowCount = Math.ceil(tiles.length / count);
  const rowStyle = { '--small-multiples-columns': `repeat(${count}, minmax(0, 1fr))` } as CSSProperties;
  const from = Number.isFinite(x.min) ? formatDateTime(new Date(x.min)) : '';
  const to = from ? formatDateTime(new Date(x.max)) : '';
  const precision = from.endsWith(':00') && to.endsWith(':00') ? 'minute' : 'second';
  const formatY = (value: number) => formatNumber(value, lang);
  const formatRange = ({ min, max }: typeof y) => `${formatY(min)}–${formatY(max)} ${unit}`.trim();
  const options: DisplayOption[] = [];
  if (sorts.size > 0) options.push({
    id: SORT_ID, kind: 'choice', label: COMPONENTS_MESSAGES.smallMultiplesSort, default: ORIGINAL_ORDER,
    choices: [
      { value: ORIGINAL_ORDER, label: COMPONENTS_MESSAGES.smallMultiplesOriginal },
      ...Array.from(sorts.values(), option => ({ value: option.id, label: option.label })),
    ],
  });
  if (showAxisControl) options.push(AXIS_OPTION);
  if (showDensityControl) options.push(DENSITY_OPTION);

  function changeOption(id: string, value: string | boolean) {
    if (typeof value !== 'string') return;
    switch (id) {
      case SORT_ID:
        if (sortId === undefined) setLocalSortId(value);
        onSortChange?.(value);
        break;
      case AXIS_OPTION.id:
        setIndependent(value === INDEPENDENT);
        break;
      case DENSITY_OPTION.id:
        if (value !== 'compact' && value !== 'regular') return;
        if (density === undefined) setLocalDensity(value);
        onDensityChange?.(value);
        break;
    }
  }

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const rows = scroll.firstElementChild?.children;
    const pitch = rows && rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : 0;
    const pageRows = pitch > 0 ? Math.floor(scroll.clientHeight / pitch) : 1;
    const edge = event.key === 'Home' || event.key === 'End';
    const target = gridKeyTarget({ key: event.key, ctrlKey: edge || event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey, metaKey: event.metaKey },
      { row: Math.floor(index / count), column: index % count }, { rows: rowCount, columns: count }, pageRows);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (target === 'stay') return;
    const next = Math.min(tiles.length - 1, target.row * count + target.column);
    const button = scroll.querySelector<HTMLButtonElement>(`[data-tile-index="${next}"]`);
    if (button) focusTile(scroll, button);
  }

  return <section aria-label={title} className="flex h-full min-h-0 min-w-0 flex-col break-keep">
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-3 py-1">
      {from && <InfoTip label={m(independent ? 'smallMultiplesIndependentScale' : 'smallMultiplesScale')}>
        <div className="space-y-1 tabular">
          <p>{formatWallClock(from, precision)} – {formatWallClock(to, precision)}</p>
          {independent && <p>{m('smallMultiplesIndependentHelp')}</p>}
          {!independent && Number.isFinite(y.min) && <p>{formatRange(y)}</p>}
        </div>
      </InfoTip>}
      <h3 className="text-sm">{title}</h3>
      {tiles.length > 0 && <span className="text-caption tabular text-text-secondary">{m('smallMultiplesCount', { count: formatY(tiles.length) })}</span>}
      <ChartBoundsLegend bounds={legend} singleLine />
      {(options.length > 0 || actions) && <div className={cn('ml-auto flex items-center gap-2', options.length > 0 && 'flex-wrap')}>
        {options.length > 0 && <LocalPanelOptions options={options} values={{ [SORT_ID]: sort?.id ?? ORIGINAL_ORDER,
          [AXIS_OPTION.id]: independent ? INDEPENDENT : AXIS_OPTION.default, [DENSITY_OPTION.id]: activeDensity }} onChange={changeOption} />}
        {actions}
      </div>}
    </div>
    {tiles.length === 0 ? <p className="p-3 text-sm text-text-secondary">{m('panelTrustEmpty')}</p> :
      <TooltipProvider delayDuration={200}><div ref={attachScroll} className="scrollbar-panel min-h-0 overflow-y-auto overscroll-contain">
        <div role="grid" aria-label={title} className="space-y-2 p-3" style={rowStyle}>
          {Array.from({ length: rowCount }, (_, row) => <div key={row} role="row" className="grid grid-cols-(--small-multiples-columns) gap-2">
            {tiles.slice(row * count, (row + 1) * count).map((tile, column) => {
              const value = tile.selectionValue;
              const enabled = canSelect && !!value;
              const pressed = value !== undefined && picked.has(value);
              const status = tile.worst;
              const paint = status && smallMultipleStatusPaint(status);
              const tileY = independent ? tile.independentY : undefined;
              const range = tileY && formatRange(tileY);
              const empty = tile.hasValues ? undefined : m('panelTrustEmpty');
              const caption = [empty, range].filter(Boolean).join(' · ');
              const description = [statusText(status), caption].filter(Boolean).join(' · ');
              const index = row * count + column;
              const button = <button type="button" data-tile-index={index} tabIndex={tile.id === tabbableId ? 0 : -1} aria-label={tile.label}
                  aria-pressed={analysisSelectionOutput && value !== undefined ? pressed : undefined} aria-disabled={!enabled || undefined}
                  aria-description={description || undefined}
                  onFocus={event => { focusedButton.current = event.currentTarget; setFocusedId(tile.id); }}
                  onBlur={event => {
                    const button = event.currentTarget;
                    if (event.relatedTarget) focusedButton.current = null;
                    // A removed button can blur during the commit, before focus recovery runs.
                    else releaseFocusLater(button, () => { if (focusedButton.current === button) focusedButton.current = null; });
                  }}
                  onKeyDown={event => move(event, index)}
                  onClick={enabled ? () => select({ shape: 'set', values: [value] }) : undefined}
                  style={paint ? { '--small-multiple-status': paint } as CSSProperties : undefined}
                  className={cn('relative flex w-full min-w-0 flex-col overflow-hidden rounded-md border px-2 text-left',
                    compact ? 'gap-0.5 py-1' : 'gap-1 py-1.5',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
                    tileHeight[activeDensity], enabled && 'cursor-pointer hover:bg-surface-row-hover',
                    pressed && 'bg-surface-row-selected hover:bg-surface-row-selected',
                    paint && 'border-(--small-multiple-status)',
                    !paint && (pressed ? 'border-border-selected' : 'border-transparent'))}>
                  {pressed && <RowSelectionBar />}
                  <span className={cn('flex min-w-0 shrink-0 items-center gap-1.5', !independent && 'h-lh', compact ? 'text-tiny leading-3' : 'text-xs')}>
                    <span className="min-w-0 truncate">{tile.label}</span>
                    {status && <span aria-hidden className={cn('ml-auto shrink-0', iconTone[status.tone])}>
                      {status.tone === 'neutral' ? statusGlyph(status) : <TriangleAlert className={compact ? 'size-3' : 'size-3.5'} />}
                    </span>}
                    {!independent && empty && <span className="ml-auto max-w-1/2 shrink-0 truncate text-text-secondary">{empty}</span>}
                  </span>
                  <SmallMultiplePlot tile={tile} x={x} y={tileY ?? y} reserveEmptySlot={!independent} />
                  {independent && <span className={cn('mt-auto h-lh shrink-0 truncate text-text-secondary', compact ? 'text-tiny leading-3' : 't-caption')}>
                    {caption}
                  </span>}
                </button>;
              return <div key={tile.id} role="gridcell" className="min-w-0">
                {range ? <RangeTooltip range={range} gridScroll={gridScroll}>{button}</RangeTooltip> : button}
              </div>;
            })}
          </div>)}
        </div>
      </div></TooltipProvider>}
  </section>;
}
