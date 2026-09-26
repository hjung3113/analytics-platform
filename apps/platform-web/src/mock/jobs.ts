import { formatDateTime, parseDateTime } from '../kernel/url';
import type { Equipment } from './world';

export const DATA_THROUGH = '2026-09-26T08:00:00';
export type Grain = 'hour' | 'day' | 'week';

export const CYCLE_VERSION_NOTE = {
  ko: '완료 Job 건수는 버전과 무관합니다. 생산성 개요의 사이클타임 분은 cycle_time v4(큐 대기 포함)이고, 사이클타임 상세의 기본 v3는 같은 Job에서 큐 대기만 뺍니다. 그래서 P50·P95는 다를 수 있고 건수는 같습니다.',
  en: 'Completed-job counts ignore version. Productivity cycle-time minutes are cycle_time v4 (queue wait included); cycle-time detail’s default v3 drops only that queue wait on the same jobs, so P50/P95 can differ while the count matches.',
};

export type JobSegment = {
  kind: 'XFR' | 'FNC' | 'PRC';
  module: string;
  slot: string;
  start: string;
  end: string;
  durationMin: number;
};

export type Job = {
  equipmentId: string;
  room: string;
  anchor: string;
  end: string;
  recipe: string;
  lotId: string;
  ppid: string;
  quality: 'unknown' | 'review';
  cycleMinV3: number;
  cycleMinV4: number;
  queueMin: number;
  dwellMin: number;
  occupiedMin: number;
  segments: JobSegment[];
};

const RECIPES = ['RCP-A', 'RCP-B', 'RCP-C', 'RCP-D'] as const;
const PPIDS = ['PPID-100', 'PPID-240', 'PPID-380'] as const;
const dayCache = new Map<string, Job[]>();

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function addSeconds(value: string, seconds: number): string {
  return formatDateTime(new Date(parseDateTime(value, 'anchor').getTime() + seconds * 1000));
}

/** Linear interpolation, then 0.1 min. Both screens call this for cycle P50/P95. */
export function jobPercentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const value = lo === hi ? sorted[lo] : sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
  return round1(value);
}

export function bucketStart(instant: string, grain: Grain): string {
  if (grain === 'hour') return `${instant.slice(0, 13)}:00:00`;
  if (grain === 'day') return `${instant.slice(0, 10)}T00:00:00`;
  const midnight = parseDateTime(`${instant.slice(0, 10)}T00:00:00`, 'day');
  const mondayOffset = (midnight.getUTCDay() + 6) % 7;
  return formatDateTime(new Date(midnight.getTime() - mondayOffset * 86_400_000));
}

function segmentsFor(anchor: string, processMin: number, equipmentId: string): JobSegment[] {
  const total = Math.max(60, Math.round(processMin * 60));
  const xfr = Math.max(20, Math.round(total * 0.12));
  const fnc = Math.max(15, Math.round(total * 0.08));
  const prc = Math.max(20, total - xfr - fnc);
  const moduleA = `MD-${(fnv(equipmentId) % 3) + 1}`;
  const slot = `SL-${(fnv(anchor) % 2) + 1}`;
  let cursor = anchor;
  const out: JobSegment[] = [];
  for (const piece of [
    { kind: 'XFR' as const, seconds: xfr },
    { kind: 'FNC' as const, seconds: fnc },
    { kind: 'PRC' as const, seconds: prc },
  ]) {
    const end = addSeconds(cursor, piece.seconds);
    out.push({ kind: piece.kind, module: moduleA, slot, start: cursor, end, durationMin: round1(piece.seconds / 60) });
    cursor = end;
  }
  return out;
}

/** 2 or 3 jobs per clock hour. Cached per equipment and calendar day. */
export function jobsForEquipmentDay(equipment: Equipment, day: string): Job[] {
  const key = `${equipment.equipmentId}|${day}`;
  const hit = dayCache.get(key);
  if (hit) return hit;
  const perHour = 2 + (fnv(equipment.equipmentId) % 2);
  const jobs: Job[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let j = 0; j < perHour; j++) {
      const rnd = lcg(fnv(`${equipment.equipmentId}|${day}|${hour}|${j}`));
      const anchor = `${day}T${pad(hour)}:${pad(Math.floor(rnd() * 60))}:${pad(Math.floor(rnd() * 60))}`;
      const queueMin = round1(2 + rnd() * 6);
      const processMin = round1(18 + rnd() * 30 + (rnd() < 0.08 ? 20 + rnd() * 30 : 0));
      const segments = segmentsFor(anchor, processMin, equipment.equipmentId);
      jobs.push({
        equipmentId: equipment.equipmentId,
        room: equipment.room,
        anchor,
        end: addSeconds(anchor, Math.round((processMin + queueMin) * 60)),
        recipe: RECIPES[Math.floor(rnd() * RECIPES.length)],
        lotId: `LOT-${day.replace(/-/g, '')}-${equipment.equipmentId}-${hour}-${j + 1}`,
        ppid: PPIDS[Math.floor(rnd() * PPIDS.length)],
        quality: rnd() < 0.15 ? 'review' : 'unknown',
        cycleMinV3: processMin,
        cycleMinV4: round1(processMin + queueMin),
        queueMin,
        dwellMin: queueMin,
        occupiedMin: Math.min(processMin, Math.floor(60 / perHour)),
        segments,
      });
    }
  }
  dayCache.set(key, jobs);
  return jobs;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from.slice(0, 10);
  const last = to.slice(0, 10);
  while (cursor <= last && days.length < 400) {
    days.push(cursor);
    const next = new Date(parseDateTime(`${cursor}T00:00:00`, 'day').getTime() + 86_400_000);
    cursor = formatDateTime(next).slice(0, 10);
  }
  return days;
}

/** Completed jobs in [from, to) whose anchor is before DATA_THROUGH. */
export function jobsInPeriod(equipment: Equipment[], from: string, to: string): Job[] {
  const out: Job[] = [];
  for (const equipmentRow of equipment) {
    for (const day of eachDay(from, to)) {
      for (const job of jobsForEquipmentDay(equipmentRow, day)) {
        if (job.anchor >= from && job.anchor < to && job.anchor < DATA_THROUGH) out.push(job);
      }
    }
  }
  return out;
}

export function cycleMinutes(job: Job, version: string): number {
  return version === '4' ? job.cycleMinV4 : job.cycleMinV3;
}

/** Hours strictly before DATA_THROUGH that overlap [from, to). */
export function observableHours(from: string, to: string): number {
  const start = parseDateTime(from, 'from').getTime();
  const end = Math.min(parseDateTime(to, 'to').getTime(), parseDateTime(DATA_THROUGH, 'through').getTime());
  if (end <= start) return 0;
  return (end - start) / 3_600_000;
}
