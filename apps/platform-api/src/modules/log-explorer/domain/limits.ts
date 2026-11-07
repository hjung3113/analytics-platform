// Limit arithmetic of the SourceReadPort (design §3.1 start values). Pure.

import {
  SOURCE_READ_ROWS_MAX,
  SOURCE_READ_ROW_CHARS_MAX,
  SOURCE_READ_TIME_BUDGET_MS,
  SOURCE_READ_WINDOW_MAX,
  type SourceLimits,
} from '@ap/contract-schemas';

export const PLATFORM_SOURCE_LIMITS: SourceLimits = {
  maxRows: SOURCE_READ_ROWS_MAX,
  maxRowChars: SOURCE_READ_ROW_CHARS_MAX,
  maxWindow: SOURCE_READ_WINDOW_MAX,
  timeBudgetMs: SOURCE_READ_TIME_BUDGET_MS,
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** The limits a call really runs under: the adapter's declared limits, never above the platform's. */
export function effectiveLimits(declared: Partial<SourceLimits> | undefined): SourceLimits {
  const d = declared ?? {};
  return {
    maxRows: clampInt(d.maxRows ?? PLATFORM_SOURCE_LIMITS.maxRows, 1, PLATFORM_SOURCE_LIMITS.maxRows),
    maxRowChars: clampInt(d.maxRowChars ?? PLATFORM_SOURCE_LIMITS.maxRowChars, 1, PLATFORM_SOURCE_LIMITS.maxRowChars),
    maxWindow: clampInt(d.maxWindow ?? PLATFORM_SOURCE_LIMITS.maxWindow, 0, PLATFORM_SOURCE_LIMITS.maxWindow),
    timeBudgetMs: clampInt(d.timeBudgetMs ?? PLATFORM_SOURCE_LIMITS.timeBudgetMs, 1, PLATFORM_SOURCE_LIMITS.timeBudgetMs),
  };
}

/** Rows asked for: at least 1, at most the row limit. */
export function clampRowLimit(requested: number, limits: SourceLimits = PLATFORM_SOURCE_LIMITS): number {
  return clampInt(requested, 1, limits.maxRows);
}

/** Lines asked for on one side of a window: at least 0, at most the window limit. */
export function clampWindowSide(requested: number, limits: SourceLimits = PLATFORM_SOURCE_LIMITS): number {
  return clampInt(requested, 0, limits.maxWindow);
}

/** The time budget of a call: the caller's ask, at least 1 ms, at most the platform budget. An absent ask means the full budget. */
export function clampTimeBudgetMs(requested: number | undefined, limits: SourceLimits = PLATFORM_SOURCE_LIMITS): number {
  return clampInt(requested ?? limits.timeBudgetMs, 1, limits.timeBudgetMs);
}

/**
 * Cuts a row text to the row limit in UTF-16 units (the unit the wire schema counts), never splitting a surrogate pair. A cut is
 * never hidden: `truncated` is true whenever any text was removed.
 */
export function truncateRowText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  let end = maxChars;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { text: text.slice(0, end), truncated: true };
}
