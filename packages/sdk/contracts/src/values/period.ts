import { formatDateTime, parseDateTime } from '../links/url.js';

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

/** `09-25 09:00`: month, day and minute of a wall-clock instant, the form every period display uses (#913). */
export const periodShort = (instant: string): string => instant.replace('T', ' ').slice(5, 16);

/** Length of a period for display: `24h` below two days, `7d`/`7일` from two days on. */
export function periodSpan(hours: number, lang: 'ko' | 'en'): string {
  return hours >= 48 ? `${Math.round(hours / 24)}${lang === 'ko' ? '일' : 'd'}` : `${hours}h`;
}

/**
 * The one period display rule: `09-25 09:00 → 09-26 09:00 (24h)`. `to` stays exclusive in meaning (06 §6.3);
 * an open end prints `—` and a half-open period has no length.
 */
export function formatPeriod(from: string | null, to: string | null, lang: 'ko' | 'en'): string {
  const hours = periodHours({ from, to });
  return `${from ? periodShort(from) : '—'} → ${to ? periodShort(to) : '—'}${hours === null ? '' : ` (${periodSpan(hours, lang)})`}`;
}
