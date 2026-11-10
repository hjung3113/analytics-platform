/**
 * Server-side table paging wire shape (06 §15). PlatformDataTable sends a PageQuery through `loadPage`; a menu
 * endpoint carries it in its params and answers a PageResult. `page` is 0-based; the URL `page` key is 1-based
 * and stays the table's concern.
 */
export type PageSort = { id: string; desc: boolean };
export type PageQuery = { page: number; pageSize: number; sorting: PageSort[] };
export type PageResult<T> = { rows: T[]; total: number };

/** Sort an in-memory row set by the first sort key without slicing (export handlers, #173). Stable; nulls last ascending (first when desc). `accessor` reads a column's value (default `row[id]`), like `filterRows` and `groupPage`. */
export function sortRows<T>(rows: readonly T[], sorting: PageSort[], accessor: (row: T, id: string) => unknown = (row, id) => (row as Record<string, unknown>)[id]): T[] {
  const sorted = [...rows];
  const s = sorting[0];
  if (s) sorted.sort((a, b) => {
    const av = accessor(a, s.id); const bv = accessor(b, s.id);
    const c = av === bv ? 0 : av === null || av === undefined ? 1 : bv === null || bv === undefined ? -1 : av < bv ? -1 : 1;
    return s.desc ? -c : c;
  });
  return sorted;
}

/** Sort and slice an in-memory row set by the first sort key — the mock server's half of a PageQuery. */
export function sortAndPage<T>(rows: readonly T[], q: PageQuery, accessor?: (row: T, id: string) => unknown): PageResult<T> {
  const sorted = sortRows(rows, q.sorting, accessor);
  return { rows: sorted.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: rows.length };
}
