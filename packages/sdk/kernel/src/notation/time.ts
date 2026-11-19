import { formatInstant, instantEpochMs } from '@ap/contracts';
import type { Lang } from '../i18n';

type Instant = string | number | null | undefined;

export type TimeNotationOptions = {
  /** Defaults to the viewer's local time zone. */
  timeZone?: string;
  /** Epoch milliseconds used for the local calendar year and relative time. Defaults to Date.now(). */
  now?: number;
};

const MISSING = '—';
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MS = 86_400_000;
const ENGLISH_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const RELATIVE = {
  ko: new Intl.RelativeTimeFormat('ko', { numeric: 'always' }),
  en: new Intl.RelativeTimeFormat('en', { numeric: 'always' }),
};
const YESTERDAY = { ko: '어제', en: 'Yesterday' };

function localStamp(at: Instant, timeZone: string | undefined) {
  if (at == null) return null;
  try {
    const ms = typeof at === 'string' ? instantEpochMs(at) : at;
    const stamp = formatInstant(ms, 'en', timeZone, 'minute');
    const [date, clock] = stamp.split(' ');
    const [year, month, day] = date.split('-');
    return { ms, clock, year, month: Number(month), day: Number(day), date: date.padStart(10, '0') };
  } catch {
    // Missing or invalid instants and unknown zones share the unavailable marker. Never display source digits.
    return null;
  }
}

type LocalStamp = NonNullable<ReturnType<typeof localStamp>>;

function calendarLabel(stamp: LocalStamp, lang: Lang, includeYear: boolean): string {
  const { year, month, day } = stamp;
  if (lang === 'ko') return `${includeYear ? `${year}년 ` : ''}${month}월 ${day}일`;
  const monthName = ENGLISH_MONTH.format(Date.UTC(2000, month - 1, 1));
  return `${monthName} ${day}${includeYear ? `, ${year}` : ''}`;
}

/** Absolute local time for rows and other values that need to be comparable at a glance. */
export function formatListTime(at: Instant, { timeZone }: Pick<TimeNotationOptions, 'timeZone'> = {}): string {
  const stamp = localStamp(at, timeZone);
  return stamp ? `${stamp.date} ${stamp.clock}` : MISSING;
}

/** Compact local time for summaries and details. Include the year if it differs from the viewer's current year. */
export function formatSummaryTime(at: Instant, lang: Lang, { timeZone, now = Date.now() }: TimeNotationOptions = {}): string {
  const stamp = localStamp(at, timeZone);
  if (!stamp) return MISSING;
  return `${calendarLabel(stamp, lang, stamp.year !== localStamp(now, timeZone)?.year)} ${stamp.clock}`;
}

/** Relative time for feeds. Put the absolute title on the same element as the visible text. */
export function formatFeedTime(at: Instant, lang: Lang, { timeZone, now = Date.now() }: TimeNotationOptions = {}): { text: string; title?: string } {
  const stamp = localStamp(at, timeZone);
  if (!stamp) return { text: MISSING };
  const title = `${stamp.date} ${stamp.clock}`;
  const current = localStamp(now, timeZone);
  if (!current) return { text: title, title };
  const label = calendarLabel(stamp, lang, stamp.year !== current.year);
  if (stamp.ms > now) return { text: `${label} ${stamp.clock}`, title };

  // Compare calendar dates in the selected zone, including across 23- and 25-hour days.
  const days = (Date.parse(current.date) - Date.parse(stamp.date)) / DAY_MS;
  if (days === 1) return { text: `${YESTERDAY[lang]} ${stamp.clock}`, title };
  if (days !== 0) return { text: label, title };
  const minutes = Math.floor((now - stamp.ms) / MINUTE_MS);
  if (minutes < HOUR_MINUTES) return { text: RELATIVE[lang].format(-minutes, 'minute'), title };
  return { text: RELATIVE[lang].format(-Math.floor(minutes / HOUR_MINUTES), 'hour'), title };
}
