import { useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { formatDateTime, formatNumber, formatWallClock } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { useOptionalAnalysisSelectionOutput } from '@ap/kernel/host';
import { cn, InfoTip, RowSelectionBar } from '@ap/ui';
import { gridKeyTarget } from '../grid/gridKeyTarget';
import { COMPONENTS_MESSAGES } from '../messages';
import { QueryPanelContentContext } from '../workspace/panelContext';
import { ChartBoundsLegend } from './ChartBoundsLegend';
import { chartDiagnostic } from './analysisChartData';
import type { ChartBoundLabels } from './chartBounds';
import { statusGlyph, statusText } from './chartStatus';
import { projectSmallMultiples, SmallMultiplePlot, smallMultipleStatusPaint, type SmallMultiplesSeries } from './smallMultiplesPlot';

export type SmallMultiplesGridProps = {
  title: string;
  unit: string;
  series: readonly SmallMultiplesSeries[];
  columns?: number;
  density?: 'regular' | 'compact';
  boundLabels?: ChartBoundLabels;
  /** Connects a declared set output. The registered panel owns its dimension. */
  analysisSelectionOutput?: { panelId: string; key: string; instanceId?: string } | null;
  /** Show previous data without publishing selections from it. */
  selectionDisabled?: boolean;
  /** Consumer entry point to the corresponding data table, or other panel actions. */
  actions?: ReactNode;
};

const DEFAULT_COLUMNS = 6;
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

export function SmallMultiplesGrid({ title, unit, series, columns = DEFAULT_COLUMNS, density = 'regular', boundLabels,
  analysisSelectionOutput, selectionDisabled, actions }: SmallMultiplesGridProps) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const { tiles, x, y, legend } = useMemo(() => projectSmallMultiples(series, boundLabels, lang), [series, boundLabels, lang]);
  const priorResult = useContext(QueryPanelContentContext) === 'prior';
  const canSelect = !!analysisSelectionOutput && !selectionDisabled && !priorResult;
  const available = useMemo(() => canSelect ? [...new Set(series.flatMap(s => s.selectionValue ? [s.selectionValue] : []))].sort() : undefined, [series, canSelect]);
  const { selection, select } = useOptionalAnalysisSelectionOutput(analysisSelectionOutput ?? undefined,
    { available, instanceId: analysisSelectionOutput?.instanceId, subscribeHighlight: false });
  const picked = new Set(selection?.shape === 'set' ? selection.values : []);
  const [focusedId, setFocusedId] = useState<string>();
  const focusedButton = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
      {from && <InfoTip label={m('smallMultiplesScale')}>
        <div className="space-y-1 tabular">
          <p>{formatWallClock(from, precision)} – {formatWallClock(to, precision)}</p>
          {Number.isFinite(y.min) && <p>{`${formatY(y.min)}–${formatY(y.max)} ${unit}`.trim()}</p>}
        </div>
      </InfoTip>}
      <h3 className="text-sm">{title}</h3>
      {tiles.length > 0 && <span className="text-caption tabular text-text-secondary">{m('smallMultiplesCount', { count: formatY(tiles.length) })}</span>}
      <ChartBoundsLegend bounds={legend} singleLine />
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
    {tiles.length === 0 ? <p className="p-3 text-sm text-text-secondary">{m('panelTrustEmpty')}</p> :
      <div ref={scrollRef} className="scrollbar-panel min-h-0 overflow-y-auto overscroll-contain">
        <div role="grid" aria-label={title} className="space-y-2 p-3" style={rowStyle}>
          {Array.from({ length: rowCount }, (_, row) => <div key={row} role="row" className="grid grid-cols-(--small-multiples-columns) gap-2">
            {tiles.slice(row * count, (row + 1) * count).map((tile, column) => {
              const value = tile.selectionValue;
              const enabled = canSelect && !!value;
              const pressed = value !== undefined && picked.has(value);
              const status = tile.worst;
              const paint = status && smallMultipleStatusPaint(status);
              const index = row * count + column;
              return <div key={tile.id} role="gridcell" className="min-w-0">
                <button type="button" data-tile-index={index} tabIndex={tile.id === tabbableId ? 0 : -1} aria-label={tile.label}
                  aria-pressed={analysisSelectionOutput && value !== undefined ? pressed : undefined} aria-disabled={!enabled || undefined}
                  aria-description={statusText(status) || (tile.hasValues ? undefined : m('panelTrustEmpty'))}
                  onFocus={event => { focusedButton.current = event.currentTarget; setFocusedId(tile.id); }}
                  onBlur={event => {
                    const button = event.currentTarget;
                    if (event.relatedTarget) focusedButton.current = null;
                    // A removed button can blur during the commit, before focus recovery runs.
                    else queueMicrotask(() => {
                      if (button.isConnected && focusedButton.current === button && button.ownerDocument.activeElement !== button) {
                        focusedButton.current = null;
                      }
                    });
                  }}
                  onKeyDown={event => move(event, index)}
                  onClick={enabled ? () => select({ shape: 'set', values: [value] }) : undefined}
                  style={paint ? { '--small-multiple-status': paint } as CSSProperties : undefined}
                  className={cn('relative flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-left',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
                    tileHeight[density], enabled && 'cursor-pointer hover:bg-surface-row-hover',
                    pressed && 'bg-surface-row-selected hover:bg-surface-row-selected',
                    paint && 'border-(--small-multiple-status)',
                    !paint && (pressed ? 'border-border-selected' : 'border-transparent'))}>
                  {pressed && <RowSelectionBar />}
                  <span className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span className="min-w-0 truncate">{tile.label}</span>
                    {status && <span aria-hidden className={cn('ml-auto shrink-0', iconTone[status.tone])}>
                      {status.tone === 'neutral' ? statusGlyph(status) : <TriangleAlert className="size-3.5" />}
                    </span>}
                  </span>
                  {(tile.hasValues || tile.bounds?.parts.length) ? <SmallMultiplePlot tile={tile} x={x} y={y} /> : null}
                  <span className="mt-auto h-lh shrink-0 truncate t-caption text-text-secondary">
                    {tile.hasValues ? null : m('panelTrustEmpty')}
                  </span>
                </button>
              </div>;
            })}
          </div>)}
        </div>
      </div>}
  </section>;
}
