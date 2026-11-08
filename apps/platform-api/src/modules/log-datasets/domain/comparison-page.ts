// Server paging of the comparison's rule list (design §6, ADR-0105 filter model): filter, search, sort and page, in memory over the rules of
// the selected items (at most 20 items of at most a baseline's rules each). Pure. Severity order puts the rows that need a human first.

import type { FilterConditions } from '../../../lib/list-params/catalog-filters.js';
import type { PageSort } from '../../../lib/list-params/types.js';
import type { Classification } from './comparison.js';

/** regressed, not_comparable, missing, new, fixed, unchanged: a rule that needs a look comes before one that is settled. */
const SEVERITY: Record<Classification, number> = { regressed: 0, not_comparable: 1, missing: 2, new: 3, fixed: 4, unchanged: 5 };

export interface RuleRow {
  ordinal: number;
  ruleId: string;
  classification: Classification;
  expected: string | null;
  observed: string | null;
  required: boolean | null;
  /** The latest review label name, or `null`. */
  label: string | null;
}

function matches(condition: { op: string; values: string[] } | undefined, value: string): boolean {
  if (!condition) return true;
  const inValues = condition.values.includes(value);
  return condition.op === 'notIn' ? !inValues : inValues;
}

export function filterRules(rows: readonly RuleRow[], conditions: FilterConditions, q: string | null): RuleRow[] {
  const needle = q === null || q.trim() === '' ? null : q.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (needle === null || row.ruleId.toLowerCase().includes(needle)) &&
      matches(conditions.classification, row.classification) &&
      matches(conditions.observed, row.observed ?? 'none') &&
      matches(conditions.expected, row.expected ?? 'none') &&
      matches(conditions.label, row.label ?? 'none') &&
      matches(conditions.required, String(row.required ?? 'none')),
  );
}

export function sortRules(rows: readonly RuleRow[], sorting: readonly PageSort[]): RuleRow[] {
  const cmp = (a: RuleRow, b: RuleRow): number => {
    for (const s of sorting) {
      const x = s.id === 'severity' ? SEVERITY[a.classification] - SEVERITY[b.classification] : a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
      if (x !== 0) return s.desc ? -x : x;
    }
    // A stable total order: rule id, then item.
    return (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) || a.ordinal - b.ordinal;
  };
  return [...rows].sort(cmp);
}

export function pageOf<T>(rows: readonly T[], page: number, pageSize: number): { total: number; rows: T[] } {
  return { total: rows.length, rows: rows.slice(page * pageSize, page * pageSize + pageSize) };
}
