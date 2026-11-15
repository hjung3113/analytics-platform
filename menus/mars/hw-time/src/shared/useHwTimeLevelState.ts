import { useMessages } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../messages';
import { useMemo, useState } from 'react';
import type { PageKeyRule } from '@ap/components';
import { usePlatform, type Text } from '@ap/kernel';
import { HW_TIME_MAX_TREND_ROWS, isHwTimeRowId, type HwTimeBlock } from '../endpoints';
import type { StackSort } from './panels/StackPanel';
import { selectionCounts } from './selectionCounts';
import { formatTrendKey, parseTrendKey } from './trendKey';
import { useHwTimeDrillRules } from './useHwTimeDrillRules';
import { useKeyedHidden } from './useKeyedHidden';

const SORTS: readonly string[] = ['total-desc', 'total-asc'];

const SORT_RULE: PageKeyRule = { key: 'sort', label: HW_TIME_MESSAGES.useHwTimeLevelStateSort, valid: raw => SORTS.includes(raw) };
const TREND_RULE: PageKeyRule = { key: 'trend', label: HW_TIME_MESSAGES.useHwTimeLevelStateTrendRows, valid: raw => parseTrendKey(raw).ok };
const ROW_RULE: PageKeyRule = { key: 'row', label: HW_TIME_MESSAGES.useHwTimeLevelStateSelectedRow, valid: isHwTimeRowId };
const RULES = [SORT_RULE, TREND_RULE];
const RULES_WITH_ROW = [SORT_RULE, TREND_RULE, ROW_RULE];

export interface HwTimeLevelStateOptions {
  /** Legend hidden-state key for a screen whose one legend the hook owns (Steps: Module/Motion; Overview); Compare keeps its panels' own sets. */
  hiddenKey?: string;
  /** The screen has a focused `row` page key (Compare, Overview). */
  row?: boolean;
  /** Adding a trend row asks the screen's trend panel to show itself (Overview; Compare leaves its detail tab active, #912 a). */
  revealTrend?: boolean;
}

/**
 * The level state the three HW Time screens share: `sort`, `trend` and `row` page keys parsed once, trend add/remove with the row
 * actions of the Frame, the selection counts, the sort copy and the legend hidden set. A malformed value of a registered key is
 * rejected, never corrected (06 §6): the SDK's `usePageKeyRules` gives `invalid` (one ADR-0034 sentence per bad key, `null`
 * when all are well-formed) and `recover` (clears exactly those keys in one `setPage`). While `invalid` is set the screen sends
 * no query and shows `PageKeyWarning`.
 */
export function useHwTimeLevelState({ hiddenKey = '', row: hasRow = false, revealTrend = false }: HwTimeLevelStateOptions) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { pageParam, setPage } = usePlatform();

  const rawSort = pageParam('sort');
  const rawTrend = pageParam('trend');
  const rawRow = hasRow ? pageParam('row') : null;
  const keys = useHwTimeDrillRules(hasRow ? RULES_WITH_ROW : RULES);
  // The rules are the one validity check; the values below only read what they accepted.
  const invalid = keys.invalid ? keys.sentences : null;
  const { recover } = keys;
  const sortOk = !keys.badKeys.includes('sort');
  const rowOk = !keys.badKeys.includes('row');
  const trendParse = useMemo(() => parseTrendKey(rawTrend), [rawTrend]);


  const sort: StackSort = sortOk && rawSort !== null ? rawSort as StackSort : null;
  const row = rowOk ? rawRow : null;
  const trendRows = useMemo(() => (trendParse.ok && !keys.badKeys.includes('trend') ? trendParse.rows : []), [trendParse, keys.badKeys]);
  const sortText: Text = sort === 'total-desc' ? HW_TIME_MESSAGES.useHwTimeLevelStateSortHigh : sort === 'total-asc' ? HW_TIME_MESSAGES.useHwTimeLevelStateSortLow : HW_TIME_MESSAGES.useHwTimeLevelStateSortDefault;

  const [hidden, setHidden] = useKeyedHidden(hiddenKey);

  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addTrend = (rowId: string) => {
    if (!isHwTimeRowId(rowId) || trendRows.includes(rowId)) return;
    if (trendRows.length >= HW_TIME_MAX_TREND_ROWS) {
      setNotice(m('useHwTimeLevelStateTheTrendShowsAtMostRows', { HWTIMEMAXTRENDROWS: String(HW_TIME_MAX_TREND_ROWS) }));
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
    : trendRows.includes(rowId) ? [{ id: 'trend-remove', label: m('useHwTimeLevelStateRemoveFromTrend'), keepsFocus: true, onSelect: removeTrend }]
      : [{ id: 'trend-add', label: m('useHwTimeLevelStateAddToTrend'), keepsFocus: true, onSelect: addTrend }]);

  const countsOf = (block: HwTimeBlock | null) => (block ? selectionCounts(block) : null);

  return { invalid, recover, sort, sortText, row, trendRows, addTrend, removeTrend, notice, rowActionsOf, countsOf, hidden, setHidden, reveal };
}

