import { useMemo } from 'react';
import { useI18n } from '../i18n';
import { formatFeedTime, formatListTime, formatSummaryTime, type Instant, type TimeNotationOptions } from './time';

/** The Kernel instant notation (kernel.md §6.3) bound to the current language, for a host or seam that hands it to screens. */
export type TimeNotation = {
  list(at: Instant, options?: Pick<TimeNotationOptions, 'timeZone'>): string;
  summary(at: Instant, options?: TimeNotationOptions): string;
  feed(at: Instant, options?: TimeNotationOptions): { text: string; title?: string };
};

/**
 * `formatListTime`, `formatSummaryTime` and `formatFeedTime` in the current `useI18n()` language. The object is the same
 * until the language changes, so a host may put it in a memoised context value without re-rendering its screens.
 */
export function useTimeNotation(): TimeNotation {
  const { lang } = useI18n();
  return useMemo<TimeNotation>(() => ({
    list: (at, options) => formatListTime(at, options),
    summary: (at, options) => formatSummaryTime(at, lang, options),
    feed: (at, options) => formatFeedTime(at, lang, options),
  }), [lang]);
}
