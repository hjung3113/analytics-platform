import { useCallback, useMemo } from 'react';
import { useI18n } from '@ap/kernel';
import { AnalysisChartFrame, type ChartPoint } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeBlock, type HwTimeRow } from '../../endpoints';
import { formatSeconds, missingText, rowIdLabel } from '../format';

export type StackSort = 'total-desc' | 'total-asc' | null;

export type StackPanelProps = {
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
  /** Segment activation (drill). Receives the series id and the row id the bar belongs to. */
  onActivate?: (segment: { seriesId: string; rowId: string }) => void;
  /** Row actions in the point menu, evaluated per row (a row already in the trend offers a different one). Auxiliary rows are skipped by the point selector and never reach them or `onActivate`, by mouse or keyboard. */
  rowActions?: (rowId: string) => readonly { id: string; label: string; keepsFocus?: boolean; onSelect: (rowId: string) => void }[];
};

const rowPitch = 26;
/** Detail height floor: a short section (two trend rows under it at 1280×800) still shows a few 26 px rows; above 160 px the axes stay readable. */
const DETAIL_FILL_MIN = 200;

/** `EQ-001.H1` → `EQ-001 · H1`; an auxiliary row reads `EQ-001 MEG 4.03s` (two decimals, the endpoint's unit; no separators, so the value fits the Frame's label gutter instead of being ellipsized). Labels stay unique per row. */
export function rowLabel(row: HwTimeRow, lang: 'ko' | 'en' = 'ko') {
  if (!row.auxiliary) return rowIdLabel(row.id);
  const seconds = Number(/-?\d+(?:\.\d+)?\s*$/.exec(row.auxiliary.label)?.[0]);
  const value = Number.isFinite(seconds) ? ` ${formatSeconds(seconds)}${HW_TIME_UNIT[lang]}` : '';
  return `${row.equipmentId} ${row.auxiliary.kind}${value}`;
}

/** Equipment groups keep their auxiliary rows beside them; sorting moves whole groups, nulls last. */
export function sortRows(rows: readonly HwTimeRow[], sort: StackSort): HwTimeRow[] {
  if (!sort) return [...rows];
  const groups = new Map<string, HwTimeRow[]>();
  for (const row of rows) groups.set(row.equipmentId, [...(groups.get(row.equipmentId) ?? []), row]);
  const weight = (group: HwTimeRow[]) => {
    const known = group.map(row => row.total).filter((value): value is number => value !== null);
    return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
  };
  const keyed = [...groups.values()].map(group => ({ group, weight: weight(group) }));
  keyed.sort((a, b) => {
    if (a.weight === null || b.weight === null) return a.weight === b.weight ? 0 : a.weight === null ? 1 : -1;
    return sort === 'total-desc' ? b.weight - a.weight : a.weight - b.weight;
  });
  return keyed.flatMap(({ group }) => group);
}

/** Stacked horizontal bars over one block. Free of layout: the caller sizes the container and owns the query. */
export function StackPanel({ chartId, title, block, visibleSeriesIds, onVisibleSeriesChange, sort = null, startAlign, minMax, onActivate, rowActions }: StackPanelProps) {
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
    : lang === 'ko' ? `${missingText(lang)} 값이 있는 행 ${unmeasured}개 — 그 값은 막대에 그려지지 않습니다.` : `${unmeasured} rows have ${missingText(lang).toLowerCase()} values — those values are not drawn in the bars.`;
  const rowOf = (point: ChartPoint) => byLabel.get(point.x);
  const isPointSelectable = useCallback((point: ChartPoint) => byLabel.has(point.x), [byLabel]);
  return <div className="flex min-h-0 flex-1 flex-col gap-1">
    <AnalysisChartFrame
      chartId={chartId} title={title} description={unmeasuredNote} xType="category" orientation="horizontal" stacked size="fill" fillMin={DETAIL_FILL_MIN} rowPitch={rowPitch}
      legend={false} isPointSelectable={isPointSelectable} startAlign={startAlign} minMax={minMax}
      series={series} unit={HW_TIME_UNIT[lang]} valueFormat={formatSeconds} canApplyRange={false}
      visibleSeriesIds={visibleSeriesIds} onVisibleSeriesChange={onVisibleSeriesChange}
      pointActivation={onActivate ? { on: 'click', onActivate: point => { const rowId = rowOf(point); if (rowId) onActivate({ seriesId: point.seriesId, rowId }); } } : undefined}
      pointActions={rowActions && ((point: ChartPoint) => {
        const rowId = rowOf(point);
        return rowId ? rowActions(rowId).map(action => ({ id: action.id, label: action.label, keepsFocus: action.keepsFocus, onSelect: () => action.onSelect(rowId) })) : [];
      })}
    />
  </div>;
}
