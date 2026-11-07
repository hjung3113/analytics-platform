// Time-reversal marker (design §2 order preservation). Source order is file order, then line; it is never re-sorted by timestamp. A row
// whose timestamp is earlier than the previous timestamped row's gets `timeReversal: true`; the row stays where the Source put it. Pure.

import type { SourceRow } from '@ap/contract-schemas';

/** `YYYY-MM-DDTHH:mm:ss` with an optional fraction, as the Source wrote it. Other forms are not comparable and never raise a marker. */
const COMPARABLE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function comparable(timestamp: string | null): string | null {
  if (timestamp === null || !COMPARABLE.test(timestamp)) return null;
  return timestamp.replace(' ', 'T');
}

/** Same rows, same order, `timeReversal` recomputed against the previous comparable timestamp. The first row is never a reversal. */
export function markTimeReversals(rows: readonly SourceRow[], previousTimestamp: string | null = null): SourceRow[] {
  let previous = comparable(previousTimestamp);
  return rows.map((row) => {
    const current = comparable(row.timestamp);
    const reversed = previous !== null && current !== null && current < previous;
    if (current !== null) previous = current;
    return { ...row, timeReversal: reversed };
  });
}

/** True when rows follow file order then line (the only order the port promises). */
export function isInSourceOrder(rows: readonly Pick<SourceRow, 'fileOrder' | 'line'>[]): boolean {
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a === undefined || b === undefined) continue;
    if (b.fileOrder < a.fileOrder || (b.fileOrder === a.fileOrder && b.line <= a.line)) return false;
  }
  return true;
}
