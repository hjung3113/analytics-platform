import { useMemo } from 'react';
import { useI18n } from '@ap/kernel';
import { HW_TIME_UNIT, type HwTimeBlock } from '../../endpoints';
import { formatSeconds, missingText, rowIdLabel } from '../format';

export type RankingPanelProps = {
  block: HwTimeBlock;
  /** Series ids counted in the total (the caller's legend); a row's total is the sum of its visible, measured segments. */
  visibleSeriesIds: readonly string[];
  /** Highest total first; rows with nothing measured go last. */
  limit?: number;
};

/** Compact ranking of the rows by total. A plain list: no Frame, no query. Free of layout. */
export function RankingPanel({ block, visibleSeriesIds, limit = 50 }: RankingPanelProps) {
  const { lang } = useI18n();
  const ranked = useMemo(() => block.rows.filter(row => !row.auxiliary).map(row => {
    const measured = visibleSeriesIds.map(id => row.values[id] ?? null).filter((value): value is number => value !== null);
    return { id: row.id, total: measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0) };
  }).sort((a, b) => a.total === null || b.total === null ? (a.total === b.total ? 0 : a.total === null ? 1 : -1) : b.total - a.total).slice(0, limit), [block.rows, visibleSeriesIds, limit]);
  if (ranked.length === 0) return <p className="t-caption p-2 text-text-muted">{lang === 'ko' ? '순위를 매길 행이 없습니다.' : 'No rows to rank.'}</p>;
  return <ol aria-label={lang === 'ko' ? '합계 순위' : 'Ranking by total'} className="flex h-full min-h-0 flex-col gap-0.5 overflow-auto p-2 text-xs">
    {ranked.map((item, index) => <li key={item.id} className="flex items-baseline justify-between gap-2">
      <span className="truncate text-text-secondary"><span className="text-text-muted">{index + 1}.</span> {rowIdLabel(item.id)}</span>
      <span className="shrink-0 tabular-nums">{item.total === null ? missingText(lang) : `${formatSeconds(item.total)} ${HW_TIME_UNIT[lang]}`}</span>
    </li>)}
  </ol>;
}
