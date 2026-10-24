import { useMemo } from 'react';
import { useI18n } from '@ap/kernel';
import { HW_TIME_UNIT, type HwTimeBlock } from '../../endpoints';
import { formatSeconds, missingText, rowIdLabel } from '../format';

export type RankingPanelProps = {
  block: HwTimeBlock;
  /** Series ids counted in the total (the caller's legend); a row's total is the sum of its visible, measured segments (a row with some unmeasured segments is marked `일부 미측정`; a truncated list says how many rows it shows). */
  visibleSeriesIds: readonly string[];
  /** Highest total first; rows with nothing measured go last. */
  limit?: number;
};

/** Compact ranking of the rows by total. A plain list: no Frame, no query. Free of layout. */
export function RankingPanel({ block, visibleSeriesIds, limit = 50 }: RankingPanelProps) {
  const { lang } = useI18n();
  const { ranked, count } = useMemo(() => {
    const rows = block.rows.filter(row => !row.auxiliary).map(row => {
      const values = visibleSeriesIds.map(id => row.values[id] ?? null);
      const measured = values.filter((value): value is number => value !== null);
      return { id: row.id, total: measured.length === 0 ? null : measured.reduce((a, b) => a + b, 0), partial: measured.length > 0 && measured.length < values.length };
    }).sort((a, b) => a.total === null || b.total === null ? (a.total === b.total ? 0 : a.total === null ? 1 : -1) : b.total - a.total);
    return { ranked: rows.slice(0, limit), count: rows.length };
  }, [block.rows, visibleSeriesIds, limit]);
  if (ranked.length === 0) return <p className="t-caption p-2 text-text-muted">{lang === 'ko' ? '순위를 매길 행이 없습니다.' : 'No rows to rank.'}</p>;
  const partialText = lang === 'ko' ? '일부 미측정' : 'Partly not measured';
  const truncated = count > ranked.length;
  const list = <ol aria-label={lang === 'ko' ? '합계 순위' : 'Ranking by total'} className={`flex min-h-0 ${truncated ? 'flex-1' : 'h-full'} flex-col gap-0.5 overflow-auto p-2 text-xs`}>
    {ranked.map((item, index) => <li key={item.id}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-text-secondary" title={rowIdLabel(item.id)}><span className="text-text-muted">{index + 1}.</span> {rowIdLabel(item.id)}</span>
        <span className="shrink-0 tabular-nums">{item.total === null ? missingText(lang) : `${formatSeconds(item.total)} ${HW_TIME_UNIT[lang]}`}</span>
      </div>
      {/* Its own line, so a narrow panel never truncates the row id to make room for it. */}
      {item.partial && <p className="text-right text-text-warning-label">{partialText}</p>}
    </li>)}
  </ol>;
  if (!truncated) return list;
  return <div className="flex h-full min-h-0 flex-col">
    <p className="t-caption px-2 pt-2 text-text-muted">{lang === 'ko' ? `상위 ${ranked.length}행 / 전체 ${count}행` : `Top ${ranked.length} of ${count} rows`}</p>
    {list}
  </div>;
}
