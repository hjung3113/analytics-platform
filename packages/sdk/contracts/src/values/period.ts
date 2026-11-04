import { ContractError, formatDateTime, parseDateTime, shift } from '../links/url.js';

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

/** Length of one side of a before/after comparison: whole `hours`, or whole `days` (1 day = 24 h of wall-clock digits). Exactly one unit. */
export type PeriodLength = { hours: number; days?: never } | { days: number; hours?: never };
export interface BeforeAfterPeriods {
  /** `[at − before, at)`. */
  before: { from: string; to: string };
  /** `[at, at + after)`, cut at `options.until`; null when nothing at or after `at` is queryable. */
  after: { from: string; to: string } | null;
}

function lengthHours(length: PeriodLength, field: string): number {
  const { hours, days } = length as { hours?: number; days?: number };
  if ((hours === undefined) === (days === undefined)) throw new ContractError('invalid_time', `${field}: give exactly one of hours or days`, field);
  // Validate the chosen unit value before the ×24 conversion: `days: 0.5` is not a whole-day length even though its 12 h is.
  const chosen = hours ?? (days as number);
  if (!Number.isInteger(chosen) || chosen <= 0) throw new ContractError('invalid_time', `${field}: length must be a positive whole number of hours or days`, field);
  return hours ?? (days as number) * 24;
}

/** True only for a contract wall-clock value the time parser accepts: 19-char `YYYY-MM-DDTHH:mm:ss`, years 0100–9999. */
function isWallClock(value: string): boolean {
  try { parseDateTime(value, 'time'); return true; } catch { return false; }
}

/** Returns a computed boundary only when it is still a contract wall-clock value; arithmetic outside 0100–9999 is an error, never null or malformed text. */
function wallClock(value: string, field: string): string {
  if (!isWallClock(value)) throw new ContractError('invalid_time', `${field}: shift landed outside the supported wall-clock range 0100–9999`, field, value);
  return value;
}

/**
 * Two analysis periods around one reference time (chart.md §16 Compare, ADR-0106 decision 4). Domain-free: the reference may be an
 * action day, an equipment swap or a recipe change. Every value is a naive wall-clock `YYYY-MM-DDTHH:mm:ss` (06 §6.3) moved by
 * calendar digits only — no time zone, no `Date.now()`. The periods are half-open and adjacent; `at` belongs to the after period.
 * The after period is the analysis Context period (`global.from`/`to`); the before period is what the menu queries as Compare's
 * previous-period series. `options.until` (an exclusive wall-clock bound, normally the server `defaultRangeTo`) keeps the after
 * period from reaching into time that has not happened yet; it never changes the before period.
 */
export function beforeAfterPeriods(at: string, windows: { before: PeriodLength; after: PeriodLength }, options: { until?: string } = {}): BeforeAfterPeriods {
  parseDateTime(at, 'at');
  const before = lengthHours(windows.before, 'before');
  const after = lengthHours(windows.after, 'after');
  const afterTo = shift(at, after);
  let to = afterTo;
  if (options.until !== undefined) {
    parseDateTime(options.until, 'until');
    // Wall-clock text only orders like time inside 0100–9999; an `afterTo` past the upper end prints `+10000…` and string-compares
    // below `at`. It is later than every valid `until`, so cut it without the broken comparison.
    if (!isWallClock(afterTo) || options.until < to) to = options.until;
  }
  to = wallClock(to, 'after.to');
  return {
    before: { from: wallClock(shift(at, -before), 'before.from'), to: at },
    after: to > at ? { from: at, to } : null,
  };
}
