import type { HostSeam } from '../../lib/host/host-seam';

/**
 * The request-period filter (`requestedFrom` / `requestedTo`) is a real instant, not an equipment wall clock (kernel.md §6.3),
 * so it is edited in the viewer's zone and stored with its offset (#2587).
 *
 * URL value: `YYYY-MM-DDTHH:mm±HH:MM`, the viewer's local minute with that minute's offset, so a link means the same instant
 * for every viewer. A pre-#2587 offset-less `YYYY-MM-DDTHH:mm` was a KST wall clock and keeps meaning `+09:00`; arrival never
 * rewrites it, only a new edit writes the new form.
 *
 * This file only reads and writes URL values. Zone math (and its DST gap/fold refusal) belongs to the host's `time.input`,
 * built from the SDK zoned-instant helpers; without it the inputs use the list fallback's fixed `+09:00`.
 */
export type TimeInput = NonNullable<NonNullable<HostSeam['time']>['input']>;
export type PeriodRefusal = Extract<ReturnType<TimeInput['fromLocal']>, { ok: false }>['reason'];
export type PeriodEdit = { ok: true; value: string } | { ok: false; reason: PeriodRefusal };

const FALLBACK_OFFSET = '+09:00';
const FALLBACK_OFFSET_MINUTES = 9 * 60;
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const WITH_OFFSET = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})([+-])(\d{2}):(\d{2})$/;
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
/** The widest real UTC offset is ±14:00. */
const MAX_OFFSET_MINUTES = 14 * HOUR_MINUTES;
/** `YYYY-MM-DDTHH:mm` is the first 16 characters of an ISO string. */
const MINUTE_LENGTH = 16;

type Period = { local: string; offset: string; ms: number };

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / HOUR_MINUTES)).padStart(2, '0')}:${String(abs % HOUR_MINUTES).padStart(2, '0')}`;
}

/** The local minute read as UTC, or null when it is not a real calendar minute (`02-30`, `24:30` never pass as another day). */
function wallMs(local: string): number | null {
  const ms = Date.parse(`${local}:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, MINUTE_LENGTH) === local ? ms : null;
}

function parse(value: string): Period | null {
  const legacy = LOCAL_MINUTE.test(value);
  const match = legacy ? null : WITH_OFFSET.exec(value);
  const local = legacy ? value : match?.[1];
  if (!local) return null;
  const wall = wallMs(local);
  if (wall === null) return null;
  if (!match) return { local, offset: FALLBACK_OFFSET, ms: wall - FALLBACK_OFFSET_MINUTES * MINUTE_MS };
  const [, , sign, hours = '', minutes = ''] = match;
  const offsetMinutes = (sign === '-' ? -1 : 1) * (Number(hours) * HOUR_MINUTES + Number(minutes));
  if (Number(minutes) >= HOUR_MINUTES || Math.abs(offsetMinutes) > MAX_OFFSET_MINUTES) return null;
  return { local, offset: `${sign}${hours}:${minutes}`, ms: wall - offsetMinutes * MINUTE_MS };
}

/** The page-key rule: both URL forms, nothing else (no silent repair). */
export function isRequestPeriodValue(value: string): boolean {
  return parse(value) !== null;
}

/** The server parameter: an ISO instant with seconds and the value's own offset (`+09:00` for an old link, as before). */
export function requestPeriodInstant(value: string): string | null {
  const period = parse(value);
  return period ? `${period.local}:00${period.offset}` : null;
}

/** The `datetime-local` value for a URL value, in the host input zone (fallback `+09:00`); empty when absent or invalid. */
export function requestPeriodInputValue(value: string, input: TimeInput | undefined): string {
  const period = value ? parse(value) : null;
  if (!period) return '';
  if (!input) return new Date(period.ms + FALLBACK_OFFSET_MINUTES * MINUTE_MS).toISOString().slice(0, MINUTE_LENGTH);
  // A zoned instant the host cannot show (an unknown zone) leaves the input empty; the filter count still shows it is set.
  return input.toLocal(new Date(period.ms).toISOString()) ?? '';
}

/** The URL value for a typed local minute; empty clears the filter, a refused minute is reported and never written. */
export function requestPeriodFromInput(local: string, input: TimeInput | undefined): PeriodEdit {
  if (local === '') return { ok: true, value: '' };
  const wall = LOCAL_MINUTE.test(local) ? wallMs(local) : null;
  if (wall === null) return { ok: false, reason: LOCAL_MINUTE.test(local) ? 'calendar' : 'format' };
  if (!input) return { ok: true, value: `${local}${FALLBACK_OFFSET}` };
  const result = input.fromLocal(local);
  if (!result.ok) return result;
  return { ok: true, value: `${local}${offsetText(Math.round((wall - Date.parse(result.instant)) / MINUTE_MS))}` };
}
