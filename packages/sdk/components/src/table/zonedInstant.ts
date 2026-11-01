/**
 * Strict zoned time fields for the table's `instant` filter editor (06 §15, §6.3). The URL and the port keep a zoned instant; the
 * field is `YYYY-MM-DD HH:mm:ss` in an explicit IANA time zone. A spring gap and an autumn fold are rejected — the field has no way
 * to say which instant a repeated hour was, and a nonexistent one is never moved. Callers pass `timeZone`; nothing here reads the
 * machine zone. Moved from the audit screen (#305) so every menu can reuse it.
 */
import { instantEpochMs } from '@ap/contracts';

const LOCAL_FIELD = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export type LocalFieldFailure = 'format' | 'calendar' | 'gap' | 'fold' | 'zone';

export type LocalFieldResult =
  | { ok: true; instant: string }
  | { ok: false; reason: LocalFieldFailure };

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Date.UTC remaps years 0–99 to 1900+y, so the year is set back explicitly after the fact. */
function epochMs(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  return date.getTime();
}

/** Wall clock of an epoch instant in `timeZone`. Fractional seconds are read and then dropped, not rounded. */
function wallOf(utcMs: number, timeZone: string): Wall | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    }).formatToParts(new Date(utcMs));
  } catch {
    return null;
  }
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find(part => part.type === type)?.value;
    return value === undefined ? Number.NaN : Number(value);
  };
  const wall = { y: pick('year'), mo: pick('month'), d: pick('day'), h: pick('hour'), mi: pick('minute'), s: pick('second') };
  if (Object.values(wall).some(part => Number.isNaN(part))) return null;
  // Some engines report midnight as 24:00 on the previous date.
  if (wall.h === 24) {
    wall.h = 0;
    const next = new Date(epochMs(wall.y, wall.mo, wall.d, 0, 0, 0) + 86_400_000);
    wall.y = next.getUTCFullYear();
    wall.mo = next.getUTCMonth() + 1;
    wall.d = next.getUTCDate();
  }
  return wall;
}

function offsetMs(utcMs: number, timeZone: string): number | null {
  const wall = wallOf(utcMs, timeZone);
  if (!wall) return null;
  return epochMs(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s) - utcMs;
}

function sameWall(wall: Wall, y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  return wall.y === y && wall.mo === mo && wall.d === d && wall.h === h && wall.mi === mi && wall.s === s;
}

/** `YYYY-MM-DD HH:mm:ss` in `timeZone`, or null when `instant` is not a zoned instant. */
export function instantToLocalField(instant: string, timeZone: string): string | null {
  let utcMs: number;
  try {
    utcMs = instantEpochMs(instant);
  } catch {
    return null;
  }
  const wall = wallOf(utcMs, timeZone);
  if (!wall) return null;
  return `${String(wall.y).padStart(4, '0')}-${pad(wall.mo)}-${pad(wall.d)} ${pad(wall.h)}:${pad(wall.mi)}:${pad(wall.s)}`;
}

/**
 * One zoned instant for a local field. Scans nearby offsets because the offset at a single guess
 * cannot tell a gap (no instant) from a fold (two instants).
 */
export function localFieldToInstant(field: string, timeZone: string): LocalFieldResult {
  const match = LOCAL_FIELD.exec(field.trim());
  if (!match) return { ok: false, reason: 'format' };
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const h = Number(match[4]);
  const mi = Number(match[5]);
  const s = Number(match[6]);
  try {
    instantEpochMs(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  } catch {
    return { ok: false, reason: 'calendar' };
  }
  const desired = epochMs(y, mo, d, h, mi, s);
  const offsets = new Set<number>();
  for (let step = -16 * 4; step <= 16 * 4; step++) {
    const offset = offsetMs(desired + step * 15 * 60 * 1000, timeZone);
    if (offset === null) return { ok: false, reason: 'zone' };
    offsets.add(offset);
  }
  const matches: number[] = [];
  for (const offset of offsets) {
    const utcMs = desired - offset;
    const wall = wallOf(utcMs, timeZone);
    if (!wall) return { ok: false, reason: 'zone' };
    if (sameWall(wall, y, mo, d, h, mi, s) && !matches.includes(utcMs)) matches.push(utcMs);
  }
  const matched = matches.length === 1 ? matches[0] : undefined;
  if (matched === undefined) return { ok: false, reason: matches.length === 0 ? 'gap' : 'fold' };
  return { ok: true, instant: new Date(matched).toISOString() };
}
