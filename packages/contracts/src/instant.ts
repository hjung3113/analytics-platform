/**
 * Real-instant formatting — the mirror of url.ts formatDateTime. §6.3 wall-clock travels as naive
 * strings and is printed digit-for-digit; timestamps that mean a point in time (epoch ms, ISO-8601
 * with an explicit offset/Z) must go through here so the viewer's time zone is applied instead.
 * String input must match the full ISO-8601 datetime grammar `YYYY-MM-DDTHH:mm(:ss(.fraction)?)?`
 * followed by a REQUIRED zone — `Z`, `z`, `±HH:MM` or `±HHMM` (hour-only offsets like `+09` are
 * rejected) — matched with one anchored regex, so suffix look-alikes like '09-26-2026' or
 * '9/26/2026Z' cannot sneak through. Captured date/time components are calendar-validated (real
 * Y-M-D, h≤23, m/s≤59, offset h≤23/m≤59) before conversion, so '2026-02-30' cannot silently roll
 * over into March. Reuses the global-Context codec's error type; adds no React, env, registry or
 * cross-package imports.
 */
import { ContractError } from './url';
import type { Text } from './i18n';

const fail = (code: string, message: string): never => { throw new ContractError(code, message); };

/** Anchored: the whole string must be `YYYY-MM-DDTHH:mm(:ss(.fraction)?)?` plus a REQUIRED zone
 *  (`Z`/`z`/`±HH:MM`/`±HHMM`; hour-only `+09` does not match). Components are captured for calendar
 *  validation — `new Date` alone rolls '2026-02-30' over to March 2 and non-leap '2026-02-29' to March 1. */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|z|([+-])(\d{2}):?(\d{2}))$/;

const isLeap = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number =>
  [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/** Captured components must be a real calendar date in range. `\d{2}` captures give ≥0 for free;
 *  day is checked against its month (leap-aware), time and offset fields against their maxima. */
const calendarValid = (y: number, mo: number, d: number, h: number, mi: number, s: number, offH: number, offM: number): boolean =>
  mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) && h <= 23 && mi <= 59 && s <= 59 && offH <= 23 && offM <= 59;

const num = (v: string | undefined): number => (v === undefined ? 0 : Number(v));

/** Format a real instant (epoch ms, or ISO-8601 with an explicit offset/Z) with Intl date+time 'short' in
 *  `timeZone` (default: the viewer's). A naive string — formatDateTime's wall-clock domain — is rejected,
 *  so silent UTC-digits-as-local rendering cannot happen. */
export function formatInstant(instant: number | string, lang: keyof Text, timeZone?: string): string {
  if (typeof instant === 'string') {
    const m = ISO_INSTANT.exec(instant);
    if (!m) {
      return fail('invalid_time', `instant: '${instant}' is not a full ISO-8601 datetime with a required zone (Z/z/±HH:MM/±HHMM; hour-only +09 rejected) — naive wall-clock is formatDateTime's domain`);
    }
    const [, y, mo, d, h, mi, s, , offH, offM] = m;
    if (!calendarValid(num(y), num(mo), num(d), num(h), num(mi), num(s), num(offH), num(offM))) {
      return fail('invalid_time', `instant: '${instant}' has impossible calendar date/time components`);
    }
  }
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return fail('invalid_time', 'instant: not a parseable epoch-ms or offset ISO-8601 value');
  return date.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone });
}
