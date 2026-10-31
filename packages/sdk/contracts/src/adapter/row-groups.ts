import type { PageResult, PageSort } from './paging.js';

/**
 * Server row groups (06 §15, ADR-0104). When the request carries `groupBy`, the server orders rows by group key and then by the
 * request sorting, and answers `groups`: one entry per group that has rows on THIS page, each describing the WHOLE filtered
 * result (not the page). The table renders those values; it never groups or sums a server page itself.
 */
export type PageGroup = {
  /** Stable group key (the column's value as text; `''` = no value). Group header rows are keyed by it. */
  key: string;
  /** Header text, chosen by the server (`(값 없음)` for the empty group in `groupPage`). */
  label: string;
  /** Rows of this group in the whole filtered result. */
  count: number;
  /**
   * Result-wide totals by column id, for columns the table declares `subtotal` (only columns whose reaggregation is `sum`, ADR-0082).
   * `null` = the server has no total for that column in this group.
   */
  subtotals?: Record<string, number | null>;
  /**
   * `true` when this group already has rows before the page slice (the page starts inside it), so the table repeats its header as
   * 「(이어서)」. Server-owned: only the server knows the row before the slice. Absent = the group starts on this page.
   */
  continued?: boolean;
};

/** `PageResult` plus the optional `groups` of a grouped request. A response without `groups` renders as flat rows. */
export type GroupedPageResult<T> = PageResult<T> & { groups?: PageGroup[] };

export const EMPTY_GROUP_LABEL = '(값 없음)';

type GroupPageOptions<T> = {
  groupBy: string;
  sorting: PageSort[];
  /** Column ids that are additive (reaggregation `sum`); only these get subtotals. */
  subtotalColumns?: readonly string[];
  accessor?: (row: T, id: string) => unknown;
  /** 0-based page and size: rows become that slice while `groups` still describe the whole set. Omit both for every row. */
  page?: number;
  pageSize?: number;
};

const isMissing = (v: unknown) => v === null || v === undefined || v === '';
const compareValues = (av: unknown, bv: unknown): number =>
  av === bv ? 0 : isMissing(av) ? 1 : isMissing(bv) ? -1 : (av as number | string) < (bv as number | string) ? -1 : 1;
/** The group key a row belongs to: every empty representation (null/undefined/'') is the one `''` bucket. */
const normalizeKey = (v: unknown): unknown => (isMissing(v) ? '' : v);

/**
 * The mock endpoint's half of a grouped request, over an already filtered set: orders by group key (empty last), then by ALL
 * `sorting` keys (stable), slices the page and answers `groups` for the whole set, limited to the groups that have rows on the
 * page. A null/undefined/empty key is the `''` group labelled `(값 없음)`. Only `subtotalColumns` are summed (non-numeric
 * values are skipped; a group with no numeric value for a column gets `null`).
 */
export function groupPage<T>(rows: readonly T[], options: GroupPageOptions<T>): { rows: T[]; total: number; groups: PageGroup[] } {
  const { groupBy, sorting, subtotalColumns = [], page, pageSize } = options;
  const get = options.accessor ?? ((row: T, id: string) => (row as Record<string, unknown>)[id]);
  // Keys are normalized once so the empty bucket compares equal to itself (then ALL sorting keys apply inside it) and sorts last.
  const keys = new Map<T, unknown>(rows.map(row => [row, normalizeKey(get(row, groupBy))]));
  const ordered = [...rows].sort((a, b) => {
    const ka = keys.get(a), kb = keys.get(b);
    const g = ka === kb ? 0 : ka === '' ? 1 : kb === '' ? -1 : compareValues(ka, kb);
    if (g !== 0) return g;
    for (const s of sorting) {
      const c = compareValues(get(a, s.id), get(b, s.id));
      if (c !== 0) return s.desc ? -c : c;
    }
    return 0;
  });
  const keyOf = (row: T) => String(keys.get(row));
  const all = new Map<string, PageGroup>();
  for (const row of ordered) {
    const key = keyOf(row);
    let group = all.get(key);
    if (!group) {
      group = { key, label: key === '' ? EMPTY_GROUP_LABEL : key, count: 0, ...(subtotalColumns.length > 0 ? { subtotals: Object.fromEntries(subtotalColumns.map(id => [id, null as number | null])) } : {}) };
      all.set(key, group);
    }
    group.count += 1;
    for (const id of subtotalColumns) {
      const v = get(row, id);
      if (typeof v === 'number' && Number.isFinite(v)) group.subtotals![id] = (group.subtotals![id] ?? 0) + v;
    }
  }
  const start = page === undefined || pageSize === undefined ? 0 : page * pageSize;
  const slice = page === undefined || pageSize === undefined ? ordered : ordered.slice(start, (page + 1) * pageSize);
  const onPage = new Set(slice.map(keyOf));
  // The group of the slice's first row continues when the row just before the slice has the same (normalized) key.
  const continuedKey = start > 0 && slice.length > 0 && keyOf(ordered[start - 1]) === keyOf(slice[0]) ? keyOf(slice[0]) : null;
  return { rows: slice, total: ordered.length, groups: [...all.values()].filter(g => onPage.has(g.key)).map(g => g.key === continuedKey ? { ...g, continued: true } : g) };
}
