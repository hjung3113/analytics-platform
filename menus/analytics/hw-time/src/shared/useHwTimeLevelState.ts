import { useMemo, useState } from 'react';
import { invalidValueSentence, useI18n, usePlatform, type Text } from '@ap/kernel';
import { HW_TIME_MAX_TREND_ROWS, isHwTimeRowId, type HwTimeBlock } from '../endpoints';
import type { StackSort } from './panels/StackPanel';
import { selectionCounts } from './selectionCounts';
import { formatTrendKey, parseTrendKey } from './trendKey';

const SORTS: readonly string[] = ['total-desc', 'total-asc'];

const FIELD_NAMES = {
  sort: { ko: '정렬', en: 'Sort' },
  trend: { ko: '추세 행', en: 'Trend rows' },
  row: { ko: '선택 행', en: 'Selected row' },
} as const satisfies Record<string, Text>;

type BadKey = keyof typeof FIELD_NAMES;

export interface HwTimeLevelStateOptions {
  /** Legend hidden-state key: the screen decides what makes another series set (Steps: Module/Motion, Compare/Overview: Module/depth). */
  hiddenKey: string;
  /** The screen has a focused `row` page key (Compare, Overview). */
  row?: boolean;
  /** Adding a trend row asks the screen's trend panel to show itself (Compare, Overview). */
  revealTrend?: boolean;
}

/**
 * The level state the three HW Time screens share: `sort`, `trend` and `row` page keys parsed once, trend add/remove with the row
 * actions of the Frame, the selection counts, the sort copy and the legend hidden set. A malformed value of a registered key is
 * rejected, never corrected (06 §6): `invalid` holds one ADR-0034 sentence per bad key (`null` when all are well-formed), and
 * `recover` clears exactly those keys in one `setPage`. While `invalid` is set the screen sends no query and shows the warning.
 */
export function useHwTimeLevelState({ hiddenKey, row: hasRow = false, revealTrend = false }: HwTimeLevelStateOptions) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage } = usePlatform();

  const rawSort = pageParam('sort');
  const rawTrend = pageParam('trend');
  const rawRow = hasRow ? pageParam('row') : null;
  const trendParse = useMemo(() => parseTrendKey(rawTrend), [rawTrend]);
  const sortOk = rawSort === null || SORTS.includes(rawSort);
  const rowOk = rawRow === null || isHwTimeRowId(rawRow);

  const badKeys: BadKey[] = [...(sortOk ? [] : ['sort' as const]), ...(trendParse.ok ? [] : ['trend' as const]), ...(rowOk ? [] : ['row' as const])];
  const rawOf: Record<BadKey, string | null> = { sort: rawSort, trend: rawTrend, row: rawRow };
  const invalid = badKeys.length === 0 ? null : badKeys.map(key => invalidValueSentence(lang, 'value', FIELD_NAMES[key], rawOf[key] ?? ''));
  const recover = () => setPage(Object.fromEntries(badKeys.map(key => [key, null])));

  const sort: StackSort = sortOk && rawSort !== null ? rawSort as StackSort : null;
  const row = rowOk ? rawRow : null;
  const trendRows = useMemo(() => (trendParse.ok ? trendParse.rows : []), [trendParse]);
  const sortText: Text = sort === 'total-desc' ? { ko: '정렬: 큰 순', en: 'Sort: high' } : sort === 'total-asc' ? { ko: '정렬: 작은 순', en: 'Sort: low' } : { ko: '정렬: 기본', en: 'Sort: default' };

  const [hiddenState, setHiddenState] = useState<{ key: string; ids: string[] }>({ key: hiddenKey, ids: [] });
  const hidden = hiddenState.key === hiddenKey ? hiddenState.ids : [];
  const setHidden = (ids: string[]) => setHiddenState({ key: hiddenKey, ids });

  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addTrend = (rowId: string) => {
    if (!isHwTimeRowId(rowId) || trendRows.includes(rowId)) return;
    if (trendRows.length >= HW_TIME_MAX_TREND_ROWS) {
      setNotice(ko ? `추세는 최대 ${HW_TIME_MAX_TREND_ROWS}행까지 볼 수 있습니다.` : `The trend shows at most ${HW_TIME_MAX_TREND_ROWS} rows.`);
      return;
    }
    setNotice(null);
    setPage({ trend: formatTrendKey([...trendRows, rowId]) });
    if (revealTrend) setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  };
  const removeTrend = (rowId: string) => {
    if (!trendRows.includes(rowId)) return;
    setNotice(null);
    setPage({ trend: formatTrendKey(trendRows.filter(id => id !== rowId)) });
  };
  // The Frame evaluates the list for the selected row: one applicable action, L1 (equipment rows) none.
  const rowActionsOf = (rowId: string) => (!isHwTimeRowId(rowId) ? []
    : trendRows.includes(rowId) ? [{ id: 'trend-remove', label: ko ? '추세에서 제거' : 'Remove from trend', keepsFocus: true, onSelect: removeTrend }]
      : [{ id: 'trend-add', label: ko ? '추세에 추가' : 'Add to trend', keepsFocus: true, onSelect: addTrend }]);

  const countsOf = (block: HwTimeBlock | null) => (block ? selectionCounts(block) : null);

  return { invalid, recover, sort, sortText, row, trendRows, addTrend, removeTrend, notice, rowActionsOf, countsOf, hidden, setHidden, reveal };
}

