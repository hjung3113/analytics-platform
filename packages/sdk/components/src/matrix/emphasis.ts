import type { MatrixColumn, MatrixEmphasisRule, MatrixNode } from '@ap/contracts';

export type MatrixValueOf<N extends MatrixNode> = (node: N, column: MatrixColumn) => string | number | null;

/** Typed, inclusive matching. Empty cells are never emphasized. */
export function matchesEmphasis(value: string | number | null, match: MatrixEmphasisRule['match']): boolean {
  if (value === null) return false;
  if (match.kind === 'values') return match.values.includes(value);
  return typeof value === 'number' && Number.isFinite(value) && (match.min === undefined || value >= match.min) && (match.max === undefined || value <= match.max);
}

/** A consumer can add this rule from its own selected-cell action; null means there is no value to match. */
export function sameValueRule<N extends MatrixNode>(node: N, column: MatrixColumn, valueOf: MatrixValueOf<N>): MatrixEmphasisRule | null {
  const value = valueOf(node, column);
  return value === null ? null : { row: node.id, match: { kind: 'values', values: [value] } };
}

/** Only the row's own loaded values; kept as typed values, so the text "1" and number 1 remain different choices. */
export function distinctRowValues<N extends MatrixNode>(node: N, columns: readonly MatrixColumn[], valueOf: MatrixValueOf<N>) {
  const counts = new Map<string | number, number>();
  for (const column of columns) {
    const value = valueOf(node, column);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}
