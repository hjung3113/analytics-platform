import { occurrenceOverlapsWindow } from '../occurrence/overlap.js';
import type { OccurrenceBatch } from '../occurrence/schema.js';

/** Whether the applied window has a known Occurrence to support its rendered positions. */
export function hasKnownOccurrenceInWindow(
  batch: Pick<OccurrenceBatch, 'occurrences' | 'watermark'>,
  window: Pick<OccurrenceBatch, 'from' | 'to'>,
): boolean {
  if (window.from > batch.watermark.at) return false;

  return batch.occurrences.some((occurrence) => {
    if (occurrence.start.at === null) return false;
    if (occurrence.end?.at != null && occurrence.start.at > occurrence.end.at) return false;
    // Replay positions are open over [start.at, end.at): an Occurrence ending at the window start supports none of it.
    if (occurrence.end?.at != null && occurrence.end.at <= window.from) return false;
    return occurrenceOverlapsWindow(occurrence, window.from, window.to);
  });
}
