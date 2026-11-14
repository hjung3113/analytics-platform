/** Natural order for the occupancy breakdown: text compares numerically inside ("EQ-2" before "EQ-10") and case-insensitively; numbers by value. */
const naturalText = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareBreakdownCells(a: number | string, b: number | string): number {
  if (typeof a === 'string' || typeof b === 'string') return naturalText.compare(String(a), String(b));
  return a - b;
}
