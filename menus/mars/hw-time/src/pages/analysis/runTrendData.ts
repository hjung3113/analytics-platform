import { formatText } from '@ap/kernel';
import { bucketStart, periodFromDates } from '@ap/contracts';
import { HW_TIME_NEW_PANEL_MESSAGES, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import type { ChartPoint, ChartSeries, SmallMultiplesSortOption, SmallMultiplesTableColumn, SmallMultiplesTableOptions } from '@ap/components';
import { HW_TIME_UNIT, type HtmJudgement, type HwTimeRunObservation } from '../../endpoints';
import { formatSeconds, missingText } from '../../shared/format';
import { htmEmphasisStatus, htmStatusText, htmStatusView } from '../../shared/htm';
import { runBound, runColor, runColorKey, runValue, type RunBound, type RunValueSettings } from './runScatterData';

export const DEFAULT_RUN_TREND_SETTINGS = { axis: 'equipment-module', color: 'equipment', value: 'motion' } as const;

/** Daily averages are already server-judged. No client aggregation or value/bound comparison; drawn through the Frame's `bounds` and `pointStatus` (#2333). */
export function shapeRunTrend(daily: readonly HwTimeRunObservation[], settings: RunValueSettings, motions: readonly string[], lang: 'ko' | 'en', { sharedBounds = false, equipmentLabels, fullDates = false }: {
  sharedBounds?: boolean; equipmentLabels?: ReadonlyMap<string, string>;
  /** Always `YYYY-MM-DD` categories: a range another menu receives must name its year (#2763 R C8). */
  fullDates?: boolean;
} = {}) {
  const dates = [...new Set(daily.map(point => point.at.slice(0, 10)))].sort();
  // Frame categories are also display labels. Keep the year only when MM-DD would merge distinct dates.
  const shortDates = dates.map(date => date.slice(5));
  const uniqueLabels = !fullDates && new Set(shortDates).size === dates.length;
  const dayKey = (at: string) => uniqueLabels ? at.slice(5, 10) : at.slice(0, 10);
  const categories = dates.map(dayKey);
  const equipment = [...new Set(daily.map(point => point.equipmentId))];
  const rows = daily.map(point => ({ point, ...runValue(point, settings.value, motions) }));
  const colorKeys = [...new Set(rows.map(row => runColorKey(row.point, row.judgement, settings.color)))];
  const pointBySeries = new Map(rows.map(row => [`${row.point.equipmentId}/${dayKey(row.point.at)}`, row]));
  const series: ChartSeries[] = equipment.map(id => {
    const group = rows.filter(row => row.point.equipmentId === id).sort((a, b) => a.point.at.localeCompare(b.point.at));
    const first = group[0]!;
    const key = runColorKey(first.point, first.judgement, settings.color);
    // A status can change along the line. Keep the equipment line identity; point colours/status carry those changes.
    const baseStatus = group.every(row => row.judgement.status === 'unjudgeable') ? 'unjudgeable' : 'normal';
    const color = settings.color === 'status' ? runColor(baseStatus, 0, 'status') : runColor(key, colorKeys.indexOf(key), settings.color);
    return { id, name: equipmentLabels?.get(id) ?? id, kind: 'line', color, unit: HW_TIME_UNIT[lang], points: categories.map(day => [day, pointBySeries.get(`${id}/${day}`)?.value ?? null]) };
  });
  const bounds = new Map<string, RunBound>();
  if (sharedBounds && equipment.length > 1 && settings.value === 'motion') {
    for (const day of categories) {
      const criteria = equipment.map(id => pointBySeries.get(`${id}/${day}`)?.judgement).filter(value => value !== undefined);
      const first = criteria[0];
      // A common band represents the returned series only where their daily criteria agree.
      const common = first && criteria.length === equipment.length && criteria.every(value => value.lower === first.lower && value.upper === first.upper);
      bounds.set(day, common ? runBound(first) : {});
    }
    if ([...bounds.values()].every(bound => bound.lower === undefined && bound.upper === undefined)) bounds.clear();
  }
  if (equipment.length === 1 && settings.value === 'motion' && rows.some(row => row.judgement.lower !== null || row.judgement.upper !== null)) {
    // An explicit empty day clears the SDK's preceding step instead of carrying an old criterion forward.
    for (const { point, judgement } of rows) bounds.set(dayKey(point.at), runBound(judgement));
  }
  const find = (point: ChartPoint) => pointBySeries.get(`${point.seriesId}/${point.x}`);
  const pointStatusOf = (point: ChartPoint) => htmStatusView(find(point)?.judgement, lang);
  const pointColorKeyOf = (point: ChartPoint) => {
    const row = find(point);
    return row && runColorKey(row.point, row.judgement, settings.color);
  };
  const verdictSeries: ChartSeries[] = (['over', 'under'] as const).map(status => ({
    id: status, name: formatText(HW_TIME_OVERVIEW_MESSAGES[status === 'over' ? 'verdictOver' : 'verdictUnder'], lang), kind: 'bar', color: runColor(status, 0, 'status'),
    unit: formatText(HW_TIME_OVERVIEW_MESSAGES.equipmentCount, lang),
    points: categories.map(day => [day, new Set(rows.filter(row => dayKey(row.point.at) === day && row.judgement.status === status).map(row => row.point.equipmentId)).size]),
  }));
  const boundLabels = { lower: formatText(HW_TIME_OVERVIEW_MESSAGES.lower, lang), upper: formatText(HW_TIME_OVERVIEW_MESSAGES.upper, lang), band: formatText(HW_TIME_OVERVIEW_MESSAGES.htm, lang) };

  function smallMultiples() {
    const ranks = new Map<string, { breaches: number; maximum: number }>();
    const judgements = new Map<string, HtmJudgement | undefined>();
    const lastDay = dates.at(-1);
    const end = lastDay && periodFromDates({ start: lastDay, end: lastDay })?.to;
    const tiles = series.map(({ id, name, points }) => {
      const bounds = new Map<string, RunBound>();
      let breaches = 0;
      let maximum = -Infinity;
      const dailyPoints = points.map(([day, y], index) => {
        const date = dates[index]!;
        const x = bucketStart(date, 'day');
        const judgement = pointBySeries.get(`${id}/${day}`)?.judgement;
        const status = htmEmphasisStatus(htmStatusView(judgement, lang));
        const bound = settings.value === 'motion' && judgement ? runBound(judgement) : {};
        // A gap or a day without criteria clears the previous day's step bounds.
        if (settings.value === 'motion') bounds.set(x, bound);
        const value = Number.isFinite(y) ? y : null;
        judgements.set(`${id}\u0000${x}`, judgement);
        if (value !== null) {
          maximum = Math.max(maximum, value);
          if (status) breaches += 1;
        }
        return { x, y: value, status };
      });
      // End the band at the exclusive end of the last day, even when it is the only day.
      if (end) dailyPoints.push({ x: end, y: null, status: undefined });
      ranks.set(id, { breaches, maximum });
      return { id, label: name, selectionValue: id, points: dailyPoints, bounds };
    });
    const sortOptions: SmallMultiplesSortOption[] = [{
      id: 'htm-breaches', label: HW_TIME_NEW_PANEL_MESSAGES.trendByBreaches,
      compare(a, b) {
        const left = ranks.get(a.id)!;
        const right = ranks.get(b.id)!;
        return right.breaches - left.breaches || (left.maximum === right.maximum ? 0 : right.maximum - left.maximum);
      },
    }];
    const text = (message: Parameters<typeof formatText>[0]) => formatText(message, lang);
    const seconds = (value: number | null | undefined) => value == null ? missingText(lang) : formatSeconds(value, lang);
    // The grid's own table (#3165) with this menu's wording: every day carries the server's judgement text, not only the emphasized ones.
    const table: SmallMultiplesTableOptions = {
      // A Module roll-up sums Motions and has no HTM limits of its own, so the grid shows no limit columns for it.
      caption: settings.value === 'module' ? text(HW_TIME_OVERVIEW_MESSAGES.moduleStatusNote) : undefined,
      includeRow: row => row.x !== end,
      columns: defaults => {
        const unit = HW_TIME_UNIT[lang];
        const limit = (id: 'lower' | 'upper'): SmallMultiplesTableColumn =>
          ({ id, label: `${text(HW_TIME_OVERVIEW_MESSAGES[id])} (${unit})`, numeric: true, cell: row => seconds(row[id]) });
        return [...defaults.flatMap((column): SmallMultiplesTableColumn[] => {
          switch (column.id) {
            case 'series': return [{ ...column, label: text(HW_TIME_OVERVIEW_MESSAGES.equipment) }];
            case 'x': return [{ ...column, label: text(HW_TIME_NEW_PANEL_MESSAGES.date) }];
            case 'value': return [{ ...column, label: `${text(HW_TIME_OVERVIEW_MESSAGES.average)} (${unit})`, cell: row => seconds(row.y) }];
            // Motion time always lists its HTM limits, «미측정» on a day without them, even when no day has any (the grid would drop them).
            case 'lower': case 'upper': case 'status': return [];
            default: return [column];
          }
        }), ...settings.value === 'module' ? [] : [limit('lower'), limit('upper')], { id: 'judgement', label: text(HW_TIME_OVERVIEW_MESSAGES.status), cell: row => {
          const judgement = judgements.get(`${row.seriesId}\u0000${row.x}`);
          return judgement ? htmStatusText(judgement, lang) : missingText(lang);
        } }];
      },
    };
    return { series: tiles, sortOptions, table };
  }

  return { series, categories, verdictSeries, pointStatus: pointStatusOf, pointStatusOf, pointColorKeyOf, bounds, boundLabels, smallMultiples,
    bandPolicy: sharedBounds ? 'matching-equipment-bounds' as const : 'single-equipment-only' as const };
}
