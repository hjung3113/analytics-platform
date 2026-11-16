import { formatText } from '@ap/kernel';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import type { ChartPoint, ChartSeries } from '@ap/components';
import type { HwTimeRunObservation } from '../../endpoints';
import { htmStatusView } from '../../shared/htm';
import { runBound, runColor, runColorKey, runValue, type RunBound, type RunValueSettings } from './runScatterData';

/** Daily averages are already server-judged. No client aggregation or value/bound comparison; drawn through the Frame's `bounds` and `pointStatus` (#2333). */
export function shapeRunTrend(daily: readonly HwTimeRunObservation[], settings: RunValueSettings, motions: readonly string[], lang: 'ko' | 'en') {
  const equipment = [...new Set(daily.map(point => point.equipmentId))];
  const rows = daily.map(point => ({ point, ...runValue(point, settings.value, motions) }));
  const colorKeys = [...new Set(rows.map(row => runColorKey(row.point, row.judgement, settings.color)))];
  const pointBySeries = new Map(rows.map(row => [`${row.point.equipmentId}/${row.point.at}`, row]));
  const series: ChartSeries[] = equipment.map(id => {
    const group = rows.filter(row => row.point.equipmentId === id).sort((a, b) => a.point.at.localeCompare(b.point.at));
    const first = group[0]!;
    const key = runColorKey(first.point, first.judgement, settings.color);
    // A status can change along the line. Keep the equipment line identity; point colours/status carry those changes.
    const baseStatus = group.every(row => row.judgement.status === 'unjudgeable') ? 'unjudgeable' : 'normal';
    const color = settings.color === 'status' ? runColor(baseStatus, 0, 'status') : runColor(key, colorKeys.indexOf(key), settings.color);
    return { id, name: id, kind: 'line', color, points: group.map(row => [row.point.at, row.value]) };
  });
  const bounds = new Map<string, RunBound>();
  if (equipment.length === 1 && settings.value === 'motion') for (const { point, judgement } of rows) {
    if (judgement.lower !== null || judgement.upper !== null) bounds.set(point.at, runBound(judgement));
  }
  const find = (point: ChartPoint) => pointBySeries.get(`${point.seriesId}/${point.x}`);
  const pointStatusOf = (point: ChartPoint) => htmStatusView(find(point)?.judgement, lang);
  const pointColorKeyOf = (point: ChartPoint) => {
    const row = find(point);
    return row && runColorKey(row.point, row.judgement, settings.color);
  };
  const boundLabels = { lower: formatText(HW_TIME_OVERVIEW_MESSAGES.lower, lang), upper: formatText(HW_TIME_OVERVIEW_MESSAGES.upper, lang), band: formatText(HW_TIME_OVERVIEW_MESSAGES.htm, lang) };
  return { series, pointStatus: pointStatusOf, pointStatusOf, pointColorKeyOf, bounds, boundLabels, bandPolicy: 'single-equipment-only' as const };
}
