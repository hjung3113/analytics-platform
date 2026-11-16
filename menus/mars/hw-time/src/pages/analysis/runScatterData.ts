import { formatText } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_MOTION_COLORS, type HwTimeRunObservation, type HwTimeRuns, type HtmJudgement } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { htmStatusText, htmStatusView } from '../../shared/htm';

export type RunScatterSettings = {
  axis: 'equipment-module' | 'equipment' | 'module';
  /** `single`: one colour for every run (the scatter default); equipment or Module colours only when the user picks them. */
  color: 'single' | 'equipment' | 'module' | 'status';
  value: 'motion' | 'module';
};
export type RunValueSettings = Pick<RunScatterSettings, 'color' | 'value'>;
export type RunBound = { lower?: number; upper?: number };
const CATEGORY_JITTER = 0.6;
const STATUS_COLORS: Record<HtmJudgement['status'], ThemeColorToken> = {
  over: 'chart-status-critical', under: 'chart-status-warn', normal: 'chart-status-good', unjudgeable: 'chart-series-4',
};

/** Values change with visibility; judgement remains the server's full Module roll-up, just as in the matrix. */
export function runValue(point: HwTimeRunObservation, value: RunValueSettings['value'], motions: readonly string[]) {
  if (value === 'motion') return { value: point.seconds, judgement: point.judgement, motion: point.motion };
  const values = motions.map(motion => point.motions[motion]?.value ?? null);
  const total = values.length && values.every(v => v !== null) ? values.reduce<number>((sum, v) => sum + v!, 0) : null;
  return { value: total, judgement: point.module, motion: null };
}
export function runColorKey(point: HwTimeRunObservation, judgement: HtmJudgement, color: RunValueSettings['color']): string {
  switch (color) {
    case 'single': return 'runs';
    case 'equipment': return point.equipmentId;
    case 'module': return point.moduleId;
    case 'status': return judgement.status;
  }
}
export function runColor(key: string, index: number, color: RunValueSettings['color']): ThemeColorToken {
  if (color === 'status') return STATUS_COLORS[key as HtmJudgement['status']];
  if (color === 'single') return 'chart-series-1';
  return HW_TIME_MOTION_COLORS[index % HW_TIME_MOTION_COLORS.length]!;
}
export const runBound = (judgement: Pick<HtmJudgement, 'lower' | 'upper'>): RunBound => ({
  ...(judgement.lower === null ? {} : { lower: judgement.lower }), ...(judgement.upper === null ? {} : { upper: judgement.upper }),
});
function categoryOf(point: Pick<HwTimeRunObservation, 'equipmentId' | 'moduleId'>, axis: RunScatterSettings['axis']): string {
  switch (axis) {
    case 'equipment-module': return `${point.equipmentId} · ${point.moduleId}`;
    case 'equipment': return point.equipmentId;
    case 'module': return point.moduleId;
  }
}

/** SDK categories, groups, jitter, bounds and point ChartStatus for the scatter (#2332). */
export function shapeRunScatter(data: Pick<HwTimeRuns, 'points' | 'bounds'>, requested: RunScatterSettings, motions: readonly string[], lang: 'ko' | 'en') {
  // One Module on screen (the usual drilled case): its label adds nothing under every equipment, so the axis lists equipment only.
  const settings: RunScatterSettings = requested.axis === 'equipment-module' && new Set(data.points.map(point => point.moduleId)).size <= 1 ? { ...requested, axis: 'equipment' } : requested;
  const groups = new Map<string, { id: string; label: string; color: ThemeColorToken }>();
  const points = data.points.map(point => {
    const { value, judgement, motion } = runValue(point, settings.value, motions);
    const groupColorKey = runColorKey(point, judgement, settings.color);
    if (!groups.has(groupColorKey)) groups.set(groupColorKey, { id: groupColorKey,
      label: settings.color === 'status' ? htmStatusText(judgement, lang) : settings.color === 'single' ? formatText(HW_TIME_OVERVIEW_MESSAGES.runsLegend, lang) : groupColorKey,
      color: runColor(groupColorKey, groups.size, settings.color) });
    return { id: point.id, category: categoryOf(point, settings.axis), groupColorKey, value, status: htmStatusView(judgement, lang),
      motion, x: null, y: value, group: groupColorKey };
  });
  const order = [...new Set(points.map(point => point.category))];
  const byCategory = new Map(data.points.map(point => [categoryOf(point, settings.axis), { group: point.equipmentId, label: point.moduleId }]));
  const records = new Map<string, HwTimeRuns['bounds']>();
  if (settings.value === 'motion') for (const bound of data.bounds) {
    const category = categoryOf(bound, settings.axis);
    if (!order.includes(category)) continue;
    records.set(category, [...(records.get(category) ?? []), bound]);
  }
  const bounds = new Map<string, RunBound>();
  const boundConflicts: { category: string; bounds: HwTimeRuns['bounds'] }[] = [];
  for (const [category, rows] of records) {
    const first = rows[0]!;
    if (rows.some(row => row.lower !== first.lower || row.upper !== first.upper)) boundConflicts.push({ category, bounds: rows });
    else if (first.lower !== null || first.upper !== null) bounds.set(category, runBound(first));
  }
  const boundLabels = { lower: formatText(HW_TIME_OVERVIEW_MESSAGES.lower, lang), upper: formatText(HW_TIME_OVERVIEW_MESSAGES.upper, lang), band: formatText(HW_TIME_OVERVIEW_MESSAGES.htm, lang) };
  return { axis: settings.axis, points, boundLabels, groups: [...groups.values()], boundConflicts,
    xCategories: { order, jitter: CATEGORY_JITTER, bounds, boundLabels,
      ...(settings.axis === 'equipment-module' ? { groups: { header: formatText(HW_TIME_OVERVIEW_MESSAGES.equipment, lang), byCategory } } : {}) } };
}
