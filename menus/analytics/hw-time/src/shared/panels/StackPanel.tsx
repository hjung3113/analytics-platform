import { useMemo } from 'react';
import { useI18n } from '@ap/kernel';
import { AnalysisChartFrame, type ChartPoint } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeBlock, type HwTimeRow } from '../../endpoints';
import { formatSeconds, missingText } from '../format';

export type StackSort = 'total-desc' | 'total-asc' | null;

export type StackPanelProps = {
  chartId: string;
  title: string;
  block: HwTimeBlock;
  /** Series ids shown (controlled by the caller's legend). */
  visibleSeriesIds: readonly string[];
  onVisibleSeriesChange?: (ids: string[]) => void;
  sort?: StackSort;
  /** Segment activation (drill). Receives the series id and the row id the bar belongs to. */
  onActivate?: (segment: { seriesId: string; rowId: string }) => void;
  /** Row actions in the point menu. Auxiliary rows never reach them (they have no bars). */
  rowActions?: readonly { id: string; label: string; onSelect: (rowId: string) => void }[];
};

/** One category label per row; an auxiliary row carries its own label so it stays a distinct, unique category. */
export const rowLabel = (row: HwTimeRow) => (row.auxiliary ? `${row.id} ${row.auxiliary.label}` : row.id);

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
export function StackPanel({ chartId, title, block, visibleSeriesIds, onVisibleSeriesChange, sort = null, onActivate, rowActions }: StackPanelProps) {
  const { lang } = useI18n();
  const rows = useMemo(() => sortRows(block.rows, sort), [block.rows, sort]);
  const byLabel = useMemo(() => new Map(rows.map(row => [rowLabel(row), row.id])), [rows]);
  const series = useMemo(() => block.series.map(item => ({
    id: item.id, name: item.name, color: item.color as ThemeColorToken, kind: 'bar' as const,
    points: rows.map(row => [rowLabel(row), row.auxiliary ? null : row.values[item.id] ?? null] as [string, number | null]),
  })), [block.series, rows]);
  const unmeasured = block.rows.filter(row => !row.auxiliary && Object.values(row.values).some(value => value === null)).length;
  const rowOf = (point: ChartPoint) => byLabel.get(point.x);
  return <div className="flex min-h-0 flex-1 flex-col gap-1">
    <AnalysisChartFrame
      chartId={chartId} title={title} xType="category" orientation="horizontal" stacked size="fill"
      series={series} unit={HW_TIME_UNIT[lang]} valueFormat={formatSeconds} canApplyRange={false}
      visibleSeriesIds={visibleSeriesIds} onVisibleSeriesChange={onVisibleSeriesChange}
      pointActivation={onActivate ? { on: 'click', onActivate: point => { const rowId = rowOf(point); if (rowId) onActivate({ seriesId: point.seriesId, rowId }); } } : undefined}
      pointActions={rowActions?.map(action => ({ id: action.id, label: action.label, onSelect: (point: ChartPoint) => { const rowId = rowOf(point); if (rowId) action.onSelect(rowId); } }))}
    />
    {unmeasured > 0 && <p className="t-caption text-text-muted">
      {lang === 'ko' ? `${missingText(lang)} 값이 있는 행 ${unmeasured}개 — 막대에서는 빈 칸으로 보입니다.` : `${unmeasured} rows have ${missingText(lang).toLowerCase()} values — shown as gaps in the bars.`}
    </p>}
  </div>;
}
