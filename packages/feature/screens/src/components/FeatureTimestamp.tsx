import { useMemo } from 'react';
import { formatDateTime, formatRelativeTime, formatShortDateTime, formatZonedDateTime } from '../lib/format/datetime';
import { useHostSeam } from '../lib/host/host-seam';

const MISSING = '—';
type At = string | null | undefined;

/**
 * Instant text through the host's Kernel notation (kernel.md §6.3), for places that need a string rather than an element.
 * A seam without `time` (standalone app, tests) falls back to the feature formatters; a missing instant is `—`.
 */
export function useFeatureTime() {
  const { time } = useHostSeam();
  return useMemo(() => ({
    /** The viewer's zone for instant inputs, the same zone the host notation renders in (#2587). */
    timeZone: time?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    list: (at: At, options?: { timeZone?: string }): string => {
      if (!at) return MISSING;
      if (time) return time.list(at, options);
      return options?.timeZone ? formatZonedDateTime(at, options.timeZone) : formatDateTime(at);
    },
    summary: (at: At): string => at ? (time?.summary(at) ?? formatShortDateTime(at)) : MISSING,
    feed: (at: At): { text: string; title?: string } => at ? (time?.feed(at) ?? { text: formatRelativeTime(at), title: formatDateTime(at) }) : { text: MISSING },
  }), [time]);
}

export function FeatureTimestamp({ at, notation, className }: { at: string | null | undefined; notation: 'list' | 'summary' | 'feed'; className?: string }) {
  const format = useFeatureTime();
  if (!at) return <span className={className}>{MISSING}</span>;
  if (notation === 'feed') {
    const value = format.feed(at);
    return <time dateTime={at} title={value.title} className={className}>{value.text}</time>;
  }
  return <time dateTime={at} className={className}>{format[notation](at)}</time>;
}
