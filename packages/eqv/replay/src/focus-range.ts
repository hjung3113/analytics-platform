import { millisToWallClock, wallClockToMillis, type Occurrence, type OccurrenceBatch, type SiteWallClock } from '@eqv/core';

import { entryOccurrence } from './entry-occurrence.js';

export type FocusEntry = { entityType: string | null; anchor: string | null };
export type FocusRange = {
  range: { from: SiteWallClock; to: SiteWallClock };
  cursor: SiteWallClock;
  entry: Occurrence | null;
  notice: string | null;
};

const MIN_MARGIN_MS = 60_000;

/**
 * Default Focus range for an entry key (`entityType` `job`: `anchor` is the RecordSequence string, AP ADR-0094; otherwise `anchor` is an Occurrence id, the Studio reading).
 * The entry's span widened by max(25 %, 60 s) each side and clamped to the batch; the batch window when no entry applies.
 */
export function focusRange(batch: OccurrenceBatch, key: FocusEntry, requestedCursor: SiteWallClock | null = null): FocusRange {
  const { anchor } = key;
  const whole = { from: batch.from, to: batch.to };
  const batchFrom = wallClockToMillis(batch.from);
  const batchTo = wallClockToMillis(batch.to);
  const requestedMs = requestedCursor === null ? null : wallClockToMillis(requestedCursor);
  const validRequestedCursor = requestedMs !== null && requestedMs >= batchFrom && requestedMs <= batchTo ? requestedCursor : null;
  const validRequestedMs = validRequestedCursor === null ? null : requestedMs;
  const fallback = (notice: string, entry: Occurrence | null = null): FocusRange => ({ range: whole, cursor: validRequestedCursor ?? batch.from, entry, notice });
  if (anchor === null) return fallback('진입 키가 없어 전체 구간을 표시합니다');
  const entry = entryOccurrence(batch, key);
  if (!entry) return fallback(`진입 Occurrence를 찾지 못해 전체 구간을 표시합니다 (${anchor})`);
  const startAt = entry.start.at;
  if (startAt === null) return fallback('진입 Occurrence의 시작 시각이 없어 전체 구간을 표시합니다', entry);

  const first = wallClockToMillis(startAt);
  const second = wallClockToMillis(entry.end?.at ?? batch.to);
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const margin = Math.max((high - low) / 4, MIN_MARGIN_MS);
  const floor = batchFrom;
  const ceiling = batchTo;
  let from = Math.min(Math.max(low - margin, floor), ceiling - 1);
  const to = Math.max(Math.min(high + margin, ceiling), from + 1);
  let widenedFrom = Math.min(from, validRequestedMs ?? from);
  let widenedTo = Math.max(to, Math.min(ceiling, (validRequestedMs ?? (to - 1)) + 1));
  widenedFrom = Math.min(Math.max(widenedFrom, floor), ceiling - 1);
  widenedTo = Math.max(Math.min(widenedTo, ceiling), widenedFrom + 1);
  const range = { from: millisToWallClock(Math.round(widenedFrom)), to: millisToWallClock(Math.round(widenedTo)) };
  const cursor = validRequestedCursor ?? (startAt < range.from || startAt >= range.to ? range.from : startAt);
  return { range, cursor, entry, notice: null };
}
