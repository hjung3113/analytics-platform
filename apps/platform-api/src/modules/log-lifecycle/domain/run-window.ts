// The run window (실행 시간대, ADR-0117 decision 8): the hours in which `claim` hands out a request that is not
// `immediate`. Pure. Wall-clock of an IANA time zone: on a weekday the window is open from `fromHour` until `toHour`
// of the next morning (22 -> 06 wraps midnight); a weekend day (Saturday, Sunday) is open all day when
// `weekendAllDay`. Start value: Asia/Seoul, weekdays 22-06, weekend all day.

export interface RunWindow {
  timezone: string;
  weekday: { fromHour: number; toHour: number };
  weekendAllDay: boolean;
}

export const DEFAULT_RUN_WINDOW: RunWindow = {
  timezone: 'Asia/Seoul',
  weekday: { fromHour: 22, toHour: 6 },
  weekendAllDay: true,
};

const isHour = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 24;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Strict parse of the stored / submitted shape; null when anything is off. */
export function parseRunWindow(raw: unknown): RunWindow | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'timezone' && k !== 'weekday' && k !== 'weekendAllDay')) return null;
  if (typeof o.timezone !== 'string' || !isValidTimezone(o.timezone)) return null;
  if (typeof o.weekendAllDay !== 'boolean') return null;
  const w = o.weekday;
  if (typeof w !== 'object' || w === null || Array.isArray(w)) return null;
  const wd = w as Record<string, unknown>;
  if (Object.keys(wd).some((k) => k !== 'fromHour' && k !== 'toHour')) return null;
  if (!isHour(wd.fromHour) || !isHour(wd.toHour)) return null;
  return { timezone: o.timezone, weekday: { fromHour: wd.fromHour, toHour: wd.toHour }, weekendAllDay: o.weekendAllDay };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localParts(at: Date, timezone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const day = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return { weekday: WEEKDAYS.indexOf(day), hour };
}

/** True when `at` is inside the window. */
export function isWithinRunWindow(window: RunWindow, at: Date): boolean {
  const { weekday, hour } = localParts(at, window.timezone);
  if (window.weekendAllDay && (weekday === 0 || weekday === 6)) return true;
  const { fromHour, toHour } = window.weekday;
  if (fromHour === toHour) return false;
  return fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
}
