import { HW_TIME_MAX_TREND_ROWS, isHwTimeRowId } from '../endpoints';

export type TrendKeyParse = { ok: true; rows: string[] } | { ok: false };

/**
 * Page key `trend`: comma-separated row ids. Absent = no rows. Present but empty, an empty part, a malformed id, a duplicate or more than
 * the maximum rows rejects the whole key (06 §6: a malformed value is never corrected).
 */
export function parseTrendKey(raw: string | null): TrendKeyParse {
  if (raw === null) return { ok: true, rows: [] };
  const rows = raw.split(',');
  const valid = rows.every(part => isHwTimeRowId(part)) && new Set(rows).size === rows.length && rows.length <= HW_TIME_MAX_TREND_ROWS;
  return valid ? { ok: true, rows } : { ok: false };
}

/** The page-key value for these rows; empty = absent. */
export function formatTrendKey(rows: readonly string[]): string | null {
  return rows.length === 0 ? null : rows.join(',');
}
