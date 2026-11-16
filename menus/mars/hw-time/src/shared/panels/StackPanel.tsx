import { useMessages } from '@ap/kernel';
import { JudgementSummary } from '../JudgementSummary';
import { HW_TIME_MESSAGES } from '../../messages';
import { useCallback, useMemo } from 'react';
import { useI18n } from '@ap/kernel';
import { AnalysisChartFrame, orderRows, type ChartPoint } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeBlock, type HwTimeRow } from '../../endpoints';
import { formatSeconds, missingText, rowIdLabel } from '../format';

export type StackSort = 'total-desc' | 'total-asc' | null;

export type StackPanelProps = {
  showJudgement?: boolean;
  chartId: string;
  title: string;
  block: HwTimeBlock;
  /** Series ids shown (controlled by the caller's legend). */
  visibleSeriesIds: readonly string[];
  onVisibleSeriesChange?: (ids: string[]) => void;
  sort?: StackSort;
  /** Frame `startAlign`: each Motion/Module starts at its own lane in every row. Visual only. */
  startAlign?: boolean;
  /** Frame `minMax`: outline each series' smallest and largest row. */
  minMax?: boolean;
  /** Row pitch in px (the chart scrolls inside); `null` omits it so every row fits the panel height. Default 26. */
  rowPitch?: number | null;
  /** Shared row focus (a row id, page state): fed to the Frame as `activeCategory`. Rows this panel does not draw highlight nothing. */
  activeRowId?: string | null;
  /** A click or keyboard move on a data row. Auxiliary rows never reach it. */
  onActiveRowChange?: (rowId: string | null, how: 'pointer' | 'keyboard') => void;
  /** Scroll the active row into view when it changed from outside (only with a row pitch). */
  revealActive?: boolean;
  /** Frame `fillMin`; default 200. */
  fillMin?: number;
  /** Segment activation (drill). Receives the series id and the row id the bar belongs to. */
  onActivate?: (segment: { seriesId: string; rowId: string }) => void;
  /** Row actions in the point menu, evaluated per row (a row already in the trend offers a different one). Auxiliary rows are skipped by the point selector and never reach them or `onActivate`, by mouse or keyboard. */
  rowActions?: (rowId: string) => readonly { id: string; label: string; keepsFocus?: boolean; onSelect: (rowId: string) => void }[];
};

const DEFAULT_ROW_PITCH = 26;
/** Detail height floor: a short section (two trend rows under it at 1280×800) still shows a few 26 px rows; above 160 px the axes stay readable. */
const DETAIL_FILL_MIN = 200;

/** `EQ-001.H1` → `EQ-001 · H1`; an auxiliary row reads `EQ-001 MEG 4.03s` (two decimals, the endpoint's unit; no separators, so the value fits the Frame's label gutter instead of being ellipsized). Labels stay unique per row. */
export function rowLabel(row: HwTimeRow, lang: 'ko' | 'en' = 'ko') {
  if (!row.auxiliary) return rowIdLabel(row.id);
  const seconds = Number(/-?\d+(?:\.\d+)?\s*$/.exec(row.auxiliary.label)?.[0]);
  const value = Number.isFinite(seconds) ? ` ${formatSeconds(seconds, lang)}${HW_TIME_UNIT[lang]}` : '';
  return `${row.equipmentId} ${row.auxiliary.kind}${value}`;
}

/** Equipment groups keep their auxiliary rows beside them; sorting moves whole groups, nulls last. */
export function sortRows(rows: readonly HwTimeRow[], sort: StackSort): HwTimeRow[] {
  const wrapped = rows.map(row => ({ row, category: row.id, levels: [row.equipmentId, row.id] as const, total: row.total }));
  // Rows inside an equipment keep their order (auxiliary rows stay beside it) until the stepped screen (#2399) orders them too.
  return orderRows(wrapped, { sort: sort ?? 'original', sortWithinGroups: false }).rows.map(({ row }) => row);
}

/** Stacked horizontal bars over one block. Free of layout: the caller sizes the container and owns the query. */
export function StackPanel({ showJudgement, chartId, title, block, visibleSeriesIds, onVisibleSeriesChange, sort = null, startAlign, minMax, rowPitch = DEFAULT_ROW_PITCH, activeRowId, onActiveRowChange, revealActive, fillMin = DETAIL_FILL_MIN, onActivate, rowActions }: StackPanelProps) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const rows = useMemo(() => sortRows(block.rows, sort), [block.rows, sort]);
  // Auxiliary rows are left out: a label that is not here never reaches a callback.
  const byLabel = useMemo(() => new Map(rows.filter(row => !row.auxiliary).map(row => [rowLabel(row, lang), row.id])), [rows, lang]);
  const series = useMemo(() => block.series.map(item => ({
    id: item.id, name: item.name, color: item.color as ThemeColorToken, kind: 'bar' as const,
    points: rows.map(row => [rowLabel(row, lang), row.auxiliary ? null : row.values[item.id] ?? null] as [string, number | null]),
  })), [block.series, rows, lang]);
  const unmeasured = block.rows.filter(row => !row.auxiliary && Object.values(row.values).some(value => value === null)).length;
  // In the Frame's header line, not under it: the Frame fills its parent, so a caption below would overflow onto the trend toggle.
  const unmeasuredNote = unmeasured === 0 ? undefined
    : m('stackPanelRowsHaveUnmeasuredValuesNotDrawnTheir', { value: String(missingText(lang)), unmeasured: String(unmeasured) });
  const rowOf = (point: ChartPoint) => byLabel.get(point.x);
  const isPointSelectable = useCallback((point: ChartPoint) => byLabel.has(point.x), [byLabel]);
  return <div className="flex min-h-0 flex-1 flex-col gap-1">
    <AnalysisChartFrame emphasisFocus="none"
      chartId={chartId} title={title} description={unmeasuredNote} xType="category" orientation="horizontal" stacked size="fill" fillMin={fillMin} rowPitch={rowPitch ?? undefined}
      activeCategory={activeRowId === undefined ? undefined : activeRowId === null ? null : rowIdLabel(activeRowId)} revealActive={revealActive}
      onActiveCategoryChange={onActiveRowChange && ((category, how) => {
        if (category === null) { onActiveRowChange(null, how); return; }
        const rowId = byLabel.get(category);
        if (rowId) onActiveRowChange(rowId, how);
      })}
      legend={false} partialTotalNote={false} valueLabels="both" reaggregation="sum" isPointSelectable={isPointSelectable} startAlign={startAlign} minMax={minMax}
      series={series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} canApplyRange={false}
      visibleSeriesIds={visibleSeriesIds} onVisibleSeriesChange={onVisibleSeriesChange}
      pointActivation={onActivate ? { on: 'click', onActivate: point => { const rowId = rowOf(point); if (rowId) onActivate({ seriesId: point.seriesId, rowId }); } } : undefined}
      pointActions={rowActions && ((point: ChartPoint) => {
        const rowId = rowOf(point);
        return rowId ? rowActions(rowId).map(action => ({ id: action.id, label: action.label, keepsFocus: action.keepsFocus, onSelect: () => action.onSelect(rowId) })) : [];
      })}
    />
    {showJudgement && <JudgementSummary block={block} />}
  </div>;
}
