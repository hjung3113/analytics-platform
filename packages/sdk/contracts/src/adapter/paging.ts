/**
 * Server-side table paging wire shape (06 §15). PlatformDataTable sends a PageQuery through `loadPage`; a menu
 * endpoint carries it in its params and answers a PageResult. `page` is 0-based; the URL `page` key is 1-based
 * and stays the table's concern.
 */
export type PageSort = { id: string; desc: boolean };
export type PageQuery = { page: number; pageSize: number; sorting: PageSort[] };
export type PageResult<T> = { rows: T[]; total: number };

/** Natural order for text (#2218): digit runs compare as numbers (`EQ-2` before `EQ-10`) and case is ignored. The locale is the runtime's own; `PageQuery` carries none. */
const textOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Sort an in-memory row set by the first sort key without slicing (export handlers, #173). Stable; nulls last ascending (first when desc).
 * Two strings compare in natural order (`Intl.Collator`, numeric); numbers and dates compare with `<`. `accessor` reads a column's value (default `row[id]`), like `filterRows` and `groupPage`.
 * The order is the in-memory (mock and client-side) order only: the real server sorts in the database by its own collation, and a mock order is not a contract the server must match.
 */
export function sortRows<T>(rows: readonly T[], sorting: PageSort[], accessor: (row: T, id: string) => unknown = (row, id) => (row as Record<string, unknown>)[id]): T[] {
  const sorted = [...rows];
  const s = sorting[0];
  if (s) sorted.sort((a, b) => {
    const av = accessor(a, s.id); const bv = accessor(b, s.id);
    const c = av === bv ? 0 : av === null || av === undefined ? 1 : bv === null || bv === undefined ? -1
      : typeof av === 'string' && typeof bv === 'string' ? textOrder.compare(av, bv) : (av as number) < (bv as number) ? -1 : av === bv ? 0 : 1;
    return s.desc ? -c : c;
  });
  return sorted;
}

/** Sort and slice an in-memory row set by the first sort key — the mock server's half of a PageQuery. */
export function sortAndPage<T>(rows: readonly T[], q: PageQuery, accessor?: (row: T, id: string) => unknown): PageResult<T> {
  const sorted = sortRows(rows, q.sorting, accessor);
  return { rows: sorted.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: rows.length };
}
