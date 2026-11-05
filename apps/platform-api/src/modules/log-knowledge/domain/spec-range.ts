// Software-version ranges of spec change rows (#1196 c, design v0.6 §15.3). Pure. A change applies on `[start, end)` in
// `release_order`: from its start version up to, NOT including, `endsBefore` (open-ended when null). `release_order` is
// mutable and not unique, so the range is judged when read; overlap is only a write-time check. A range whose end is
// not after its start in the current order is empty.

export interface OrderRange {
  start: number;
  /** null = open-ended */
  endBefore: number | null;
}

/** True when the change applies to a version at `order`. */
export const appliesAt = (range: OrderRange, order: number): boolean =>
  range.start <= order && (range.endBefore === null || order < range.endBefore);

const isEmpty = (r: OrderRange): boolean => r.endBefore !== null && r.endBefore <= r.start;

/** Two ranges intersect when some version order is in both (empty ranges intersect nothing). */
export function rangesOverlap(a: OrderRange, b: OrderRange): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  const aEnd = a.endBefore ?? Number.POSITIVE_INFINITY;
  const bEnd = b.endBefore ?? Number.POSITIVE_INFINITY;
  return a.start < bEnd && b.start < aEnd;
}
