import { formatDateTime, wallClockEpochMs } from '@ap/contracts';
import type { ChartSeries, TimelineLane } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';
import type { ConfigHistory, HistoryPoint } from '../endpoints';

const PALETTE = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;
export const NEUTRAL = 'chart-remainder';
export const REFERENCE = 'chart-selection-outline';
export const MISSING = 'surface-sunken';
type TrendColor = typeof PALETTE[number] | typeof NEUTRAL | typeof REFERENCE | typeof MISSING;
export const trendSwatches = {
  'chart-series-1': 'bg-chart-series-1',
  'chart-series-2': 'bg-chart-series-2',
  'chart-series-3': 'bg-chart-series-3',
  'chart-series-4': 'bg-chart-series-4',
  [NEUTRAL]: 'bg-chart-remainder',
  [REFERENCE]: 'bg-accent-primary',
  [MISSING]: 'border border-border-subtle bg-surface-sunken',
} satisfies Record<TrendColor, string>;

function mergePoints(points: HistoryPoint[]) {
  return points.filter((point, index) => index === 0 || point.value !== points[index - 1].value);
}

export function historyPoints(points: HistoryPoint[], to: string): ChartSeries['points'] {
  const numeric = (value: HistoryPoint['value']) => typeof value === 'number' ? value : null;
  const result: ChartSeries['points'] = points.map(point => [formatDateTime(new Date(point.at)), numeric(point.value)]);
  const last = points.at(-1);
  if (last) result.push([to, numeric(last.value)]);
  return result;
}

/** The largest identical trajectory wins. Ties use the first equipment ID in lexical order. */
export function historyColors(history: ConfigHistory, reference?: string) {
  const ordered = [...history.series].sort((a, b) => a.equipment.localeCompare(b.equipment));
  const keys = new Map(ordered.map(series => [series.equipment, JSON.stringify(mergePoints(series.points).map(point => [Date.parse(point.at), point.value]))]));
  const counts = new Map<string, number>();
  for (const key of keys.values()) counts.set(key, (counts.get(key) ?? 0) + 1);
  const majority = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const differences = new Map<string, TrendColor>();
  return new Map(ordered.map(({ equipment }): [string, TrendColor] => {
    const key = keys.get(equipment)!;
    if (equipment === reference) return [equipment, REFERENCE];
    if (key === majority) return [equipment, NEUTRAL];
    if (!differences.has(key)) differences.set(key, PALETTE[differences.size % PALETTE.length]);
    return [equipment, differences.get(key)!];
  }));
}

export function timelineModel(history: ConfigHistory, to: string, reference?: string, referenceLabel?: string) {
  const end = wallClockEpochMs(to)!;
  const held = new Map<string, number>();
  const labels = new Map<string, string>();
  const lanes: TimelineLane[] = history.series.map(series => ({
    id: series.equipment,
    label: series.equipment === reference ? `${series.equipment} ${referenceLabel}` : series.equipment,
    segments: mergePoints(series.points).map((point, index, points) => {
      const id = `${series.equipment}:${index}`;
      const start = Date.parse(point.at);
      const until = index + 1 < points.length ? Date.parse(points[index + 1].at) : end;
      if (typeof point.value === 'string') {
        labels.set(id, point.value);
        held.set(point.value, (held.get(point.value) ?? 0) + until - start);
      }
      return { id, start, end: until, neutral: point.value === null };
    }),
  }));
  const ordered = [...held].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const values = ordered.map(([value], index): { value: string; color: TrendColor } => ({ value, color: index === 0 ? NEUTRAL : PALETTE[(index - 1) % PALETTE.length] }));
  const colors = new Map<string, ThemeColorToken>(values.map(({ value, color }) => [value, color]));
  for (const lane of lanes) for (const segment of lane.segments) {
    const label = labels.get(segment.id);
    segment.colorToken = label === undefined ? MISSING : colors.get(label);
  }
  return { lanes, values, labels, hasMissing: lanes.some(lane => lane.segments.some(segment => segment.neutral)) };
}

/** A received HW Time day, `YYYY-MM-DD` or `MM-DD` (the year comes from the applied period, as on the HW Time axis). */
export function resolveDay(value: string, period: { from: string; to: string }): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!/^\d{2}-\d{2}$/.test(value)) return null;
  const start = period.from.slice(0, 10);
  const end = period.to.slice(0, 10);
  for (const year of new Set([period.from.slice(0, 4), period.to.slice(0, 4)])) {
    const day = `${year}-${value}`;
    if (day >= start && day <= end) return day;
  }
  return null;
}

/** The change points on the received days, for the chart's highlight (#2763): not each line's period-start value or period-end carry point. */
export function pointsOnDays(series: readonly ChartSeries[], days: { from: string; to: string } | null, period: { from: string; to: string }): string[] {
  const from = days && resolveDay(days.from, period);
  const to = days && resolveDay(days.to, period);
  if (!from || !to || from > to) return [];
  const xs = series.flatMap(line => line.points.slice(1).map(([x]) => String(x))).filter(x => x !== period.to && x.slice(0, 10) >= from && x.slice(0, 10) <= to);
  return [...new Set(xs)].sort();
}
