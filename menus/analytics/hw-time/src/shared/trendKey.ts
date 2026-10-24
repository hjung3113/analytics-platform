import { HW_TIME_MAX_TREND_ROWS, isHwTimeRowId } from '../endpoints';

/** Page key `trend`: comma-separated row ids. Invalid, duplicate and surplus entries are dropped. */
export function parseTrendKey(raw: string | null): string[] {
  if (!raw) return [];
  const rows: string[] = [];
  for (const part of raw.split(',')) {
    if (isHwTimeRowId(part) && !rows.includes(part)) rows.push(part);
    if (rows.length === HW_TIME_MAX_TREND_ROWS) break;
  }
  return rows;
}

/** The page-key value for these rows; empty = absent. */
export function formatTrendKey(rows: readonly string[]): string | null {
  return rows.length === 0 ? null : rows.join(',');
}
