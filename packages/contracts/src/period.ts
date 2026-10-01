import { formatDateTime, parseDateTime } from './url';

/** Wall-clock period helpers (06 §6.3) shared by pages and the server: naive datetimes, never time-zone shifted. */
export type Grain = 'hour' | 'day' | 'week';

/** Hours between `from` and `to`; null while either end is open. */
export function periodHours(g: { from: string | null; to: string | null }): number | null {
  if (!g.from || !g.to) return null;
  return (parseDateTime(g.to, 'to').getTime() - parseDateTime(g.from, 'from').getTime()) / 3_600_000;
}

/** Start of the grain bucket containing `instant`: the hour, the day, or the Monday of the week. */
export function bucketStart(instant: string, grain: Grain): string {
  if (grain === 'hour') return `${instant.slice(0, 13)}:00:00`;
  if (grain === 'day') return `${instant.slice(0, 10)}T00:00:00`;
  const midnight = parseDateTime(`${instant.slice(0, 10)}T00:00:00`, 'day');
  const mondayOffset = (midnight.getUTCDay() + 6) % 7;
  return formatDateTime(new Date(midnight.getTime() - mondayOffset * 86_400_000));
}
