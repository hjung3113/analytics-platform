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

/** Kind precedence for a column that mixes value kinds, so the order stays transitive: numbers, then booleans, then text, then anything else (dates and the like). */
const kindRank = (v: unknown): number => typeof v === 'number' || typeof v === 'bigint' ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'string' ? 2 : 3;

/**
 * Sort an in-memory row set by the first sort key without slicing (export handlers, #173). Stable; nulls last ascending (first when desc).
 * Two strings compare in natural order (`Intl.Collator`, numeric); other pairs of one kind compare with `<`; a column that mixes kinds orders by kind (numbers, booleans, text, others) first (#2218).
 * `accessor` reads a column's value (default `row[id]`), like `filterRows` and `groupPage`.
 * The order is the in-memory (mock and client-side) order only: the real server sorts in the database by its own collation, and a mock order is not a contract the server must match.
 */
export function sortRows<T>(rows: readonly T[], sorting: PageSort[], accessor: (row: T, id: string) => unknown = (row, id) => (row as Record<string, unknown>)[id]): T[] {
  const sorted = [...rows];
  const s = sorting[0];
  if (s) sorted.sort((a, b) => {
    const av = accessor(a, s.id); const bv = accessor(b, s.id);
    const c = av === bv ? 0 : av === null || av === undefined ? 1 : bv === null || bv === undefined ? -1 : compareValues(av, bv);
    return s.desc ? -c : c;
  });
  return sorted;
}
function compareValues(av: unknown, bv: unknown): number {
  const ar = kindRank(av); const br = kindRank(bv);
  if (ar !== br) return ar < br ? -1 : 1;
  if (typeof av === 'string' && typeof bv === 'string') return textOrder.compare(av, bv);
  return (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
}

/** Sort and slice an in-memory row set by the first sort key — the mock server's half of a PageQuery. */
export function sortAndPage<T>(rows: readonly T[], q: PageQuery, accessor?: (row: T, id: string) => unknown): PageResult<T> {
  const sorted = sortRows(rows, q.sorting, accessor);
  return { rows: sorted.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: rows.length };
}
