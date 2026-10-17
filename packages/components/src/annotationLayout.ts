/** One note's range in axis units: epoch ms on a time axis, a category index on a category axis. */
export type NoteSpan = { from: number; to: number };

const MIN_LABEL_WIDTH = 24;

/** Row for each note: notes whose ranges overlap take successive rows. Depends only on the spans, so callers cache it across zoom and resize. */
export function assignNoteLevels(spans: readonly NoteSpan[]): number[] {
  const placed: { from: number; to: number; level: number }[] = [];
  return spans.map(span => {
    const from = Math.min(span.from, span.to);
    const to = Math.max(span.from, span.to);
    const taken = new Set(placed.filter(o => o.from <= to && from <= o.to).map(o => o.level));
    let level = 0;
    while (taken.has(level)) level++;
    placed.push({ from, to, level });
    return level;
  });
}

/** Pixel budget per note, clamped to the plot so a long text truncates with an ellipsis instead of running past the chart edge. */
export function noteLabelWidths(spans: readonly NoteSpan[], pxPerUnit: number, plotWidth: number): number[] {
  return spans.map(span => Math.min(Math.max(plotWidth, MIN_LABEL_WIDTH), Math.max(MIN_LABEL_WIDTH, Math.round(Math.abs(span.to - span.from) * pxPerUnit))));
}

