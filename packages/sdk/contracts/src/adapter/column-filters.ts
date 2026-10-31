import type { PageQuery } from './paging.js';

/**
 * Column filters (06 §15, ADR-0104). A column declares its kind (`PlatformColumn.filter`); the table sends the user's
 * `ColumnFilter[]` to the server through `loadPage` and the export request. The server owns the meaning: the table never
 * filters a server page on the client. `filterRows` is the mock endpoint's one-line half.
 */
export type ColumnFilterSpec =
  | { kind: 'text' }
  | { kind: 'number' }
  | { kind: 'date' }
  | { kind: 'enum'; options: { value: string; label: string }[] };

/** `id` is the column id (= the server field). Operators are fixed per kind. */
export type ColumnFilter =
  | { id: string; op: 'contains' | 'equals'; value: string }
  | { id: string; op: 'eq' | 'gte' | 'lte'; value: number }
  | { id: string; op: 'between'; value: [number, number] }
  /** Wall-clock `YYYY-MM-DD` (06 §6.3), never an instant. `from` inclusive, `to` EXCLUSIVE on the wire; either may be absent. */
  | { id: string; op: 'between'; value: { from?: string; to?: string } }
  | { id: string; op: 'in'; value: string[] };

/**
 * What `PlatformDataTable.loadPage` receives: `PageQuery` plus the opt-in column filters (sent only when non-empty) and the
 * opt-in row grouping (#556d, ADR-0104). `groupBy` is ONE column id (one level); a future multi-level form would be a new
 * additive field (`groupBy: string[]`), never a type change of this one. Absent = flat rows.
 */
export type TableQuery = PageQuery & { filters?: ColumnFilter[]; groupBy?: string };

const isRange = (value: ColumnFilter['value']): value is { from?: string; to?: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function matches(filter: ColumnFilter, raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  switch (filter.op) {
    case 'contains': return String(raw).toLowerCase().includes(filter.value.toLowerCase());
    case 'equals': return String(raw).toLowerCase() === filter.value.toLowerCase();
    case 'eq': return Number(raw) === filter.value;
    case 'gte': return Number(raw) >= filter.value;
    case 'lte': return Number(raw) <= filter.value;
    case 'in': return filter.value.includes(String(raw));
    case 'between': {
      if (isRange(filter.value)) {
        // Wall-clock strings compare lexicographically: a date-time `2026-01-05T09:00:00` is within `from: 2026-01-05` and before `to: 2026-01-06`.
        const text = String(raw);
        const { from, to } = filter.value;
        return (from === undefined || from === '' || from <= text) && (to === undefined || to === '' || text < to);
      }
      const n = Number(raw);
      return n >= filter.value[0] && n <= filter.value[1];
    }
  }
}

/**
 * Apply column filters to an in-memory row set (AND across filters) — the mock server's half. Text is case-insensitive
 * (locale-independent lower-case); number `between` is inclusive on both ends; date compares wall-clock strings with `to`
 * exclusive; a missing value (`null`/`undefined`) matches no filter. No filters = the same rows.
 */
export function filterRows<T>(rows: readonly T[], filters: readonly ColumnFilter[] | undefined, accessor: (row: T, id: string) => unknown = (row, id) => (row as Record<string, unknown>)[id]): T[] {
  if (!filters || filters.length === 0) return [...rows];
  return rows.filter(row => filters.every(f => matches(f, accessor(row, f.id))));
}
