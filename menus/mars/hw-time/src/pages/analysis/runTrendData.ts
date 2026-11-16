import { formatText } from '@ap/kernel';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import type { ChartPoint, ChartSeries } from '@ap/components';
import type { HwTimeRunObservation } from '../../endpoints';
import { htmStatusView } from '../../shared/htm';
import { runBound, runColor, runColorKey, runValue, type RunBound, type RunValueSettings } from './runScatterData';

/** Daily averages are already server-judged. No client aggregation or value/bound comparison; drawn through the Frame's `bounds` and `pointStatus` (#2333). */
export function shapeRunTrend(daily: readonly HwTimeRunObservation[], settings: RunValueSettings, motions: readonly string[], lang: 'ko' | 'en') {
  const dates = [...new Set(daily.map(point => point.at.slice(0, 10)))].sort();
  // Frame categories are also display labels. Keep the year only when MM-DD would merge distinct dates.
  const shortDates = dates.map(date => date.slice(5));
  const uniqueLabels = new Set(shortDates).size === dates.length;
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
    return { id, name: id, kind: 'line', color, points: categories.map(day => [day, pointBySeries.get(`${id}/${day}`)?.value ?? null]) };
  });
  const bounds = new Map<string, RunBound>();
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
    points: categories.map(day => [day, new Set(rows.filter(row => dayKey(row.point.at) === day && row.judgement.status === status).map(row => row.point.equipmentId)).size]),
  }));
  const boundLabels = { lower: formatText(HW_TIME_OVERVIEW_MESSAGES.lower, lang), upper: formatText(HW_TIME_OVERVIEW_MESSAGES.upper, lang), band: formatText(HW_TIME_OVERVIEW_MESSAGES.htm, lang) };
  return { series, categories, verdictSeries, pointStatus: pointStatusOf, pointStatusOf, pointColorKeyOf, bounds, boundLabels, bandPolicy: 'single-equipment-only' as const };
}
