/**
 * The request-period filter (`requestedFrom` / `requestedTo`) is a real instant, not an equipment wall clock (kernel.md §6.3),
 * so it is edited in the viewer's zone and stored with its offset (#2587).
 *
 * URL value: `YYYY-MM-DDTHH:mm±HH:MM`, the viewer's local minute with the viewer's offset, so a link means the same instant for
 * every viewer and stays readable to its author. A pre-#2587 offset-less `YYYY-MM-DDTHH:mm` was a KST wall clock and keeps
 * meaning `+09:00`; arrival never rewrites it, only a new edit writes the new form.
 */
const LEGACY_OFFSET = '+09:00';
const LEGACY_OFFSET_MINUTES = 9 * 60;
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

/** `local` shifted by `offsetMinutes` must name the same calendar minute, so `02-30` or `24:30` never pass as another day. */
function instantOf(local: string, offsetMinutes: number): number | null {
  const wallMs = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wallMs) || new Date(wallMs).toISOString().slice(0, MINUTE_LENGTH) !== local) return null;
  return wallMs - offsetMinutes * MINUTE_MS;
}

function parse(value: string): Period | null {
  if (LOCAL_MINUTE.test(value)) {
    const ms = instantOf(value, LEGACY_OFFSET_MINUTES);
    return ms === null ? null : { local: value, offset: LEGACY_OFFSET, ms };
  }
  const match = WITH_OFFSET.exec(value);
  if (!match) return null;
  const [, local = '', sign, hours, minutes] = match;
  const offsetMinutes = (sign === '-' ? -1 : 1) * (Number(hours) * HOUR_MINUTES + Number(minutes));
  if (Number(minutes) >= HOUR_MINUTES || Math.abs(offsetMinutes) > MAX_OFFSET_MINUTES) return null;
  const ms = instantOf(local, offsetMinutes);
  return ms === null ? null : { local, offset: `${sign}${hours}:${minutes}`, ms };
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

function localMinuteIn(ms: number, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zoneOffsetMinutes(ms: number, timeZone: string): number {
  return Math.round((Date.parse(`${localMinuteIn(ms, timeZone)}:00Z`) - Math.floor(ms / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

/** The `datetime-local` value for a URL value: that instant in the viewer's zone; empty when absent or invalid. */
export function requestPeriodInputValue(value: string, timeZone: string): string {
  const period = value ? parse(value) : null;
  return period ? localMinuteIn(period.ms, timeZone) : '';
}

/** The URL value for a `datetime-local` value typed in the viewer's zone; empty when the input is empty or incomplete. */
export function requestPeriodFromInput(local: string, timeZone: string): string {
  const wallMs = LOCAL_MINUTE.test(local) ? instantOf(local, 0) : null;
  if (wallMs === null) return '';
  // The zone offset depends on the instant itself; a second pass settles it across a DST change. A wall time inside a
  // DST gap does not exist and resolves to the next valid local minute, which is what the value then states.
  const first = wallMs - zoneOffsetMinutes(wallMs, timeZone) * MINUTE_MS;
  const ms = wallMs - zoneOffsetMinutes(first, timeZone) * MINUTE_MS;
  return `${localMinuteIn(ms, timeZone)}${offsetText(zoneOffsetMinutes(ms, timeZone))}`;
}
