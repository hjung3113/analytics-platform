import type { ChartRowGroups } from './chartRowGroups';

/** Row order of a horizontal bar chart. `original` keeps the order the rows came in (the default, owner 2026-11-16, #2391). */
export type RowOrderSort = 'original' | 'total-desc' | 'total-asc';

/**
 * One category row of a two-level horizontal bar chart (for example equipment › module). The menu owns what the levels mean;
 * this piece only orders. `category` is the row's axis value (unique, the Frame's category identity); `levels` are the row's
 * outer and inner key as declared (before any swap); `total` is the row's sum (`null` = not measured, sorted last).
 */
export type OrderableRow = { category: string; levels: readonly [string, string]; total: number | null };

export type RowOrderOptions = {
  /** Default `original`. */
  sort?: RowOrderSort;
  /** Swap the two levels: the inner key groups the rows and the outer key labels them. Default `false`. */
  swap?: boolean;
  /** Under a total sort, also order the rows inside each group by their own total (stable, nulls last). Default `true`; `false` keeps the input order inside a group. */
  sortWithinGroups?: boolean;
  /**
   * Header of each level as declared (before any swap), e.g. `['설비', 'Module']`. With it the result carries `groups` for the Frame's `rowGroups`
   * (header = the grouping level after the swap, group = that row's grouping key, label = the other key); without it `groups` is `undefined`.
   */
  levelLabels?: readonly [string, string];
};

export type RowOrderResult<R extends OrderableRow> = { rows: R[]; groups: ChartRowGroups | undefined };

const sumKnown = (totals: readonly (number | null)[]): number | null => {
  const known = totals.filter((value): value is number => value !== null && Number.isFinite(value));
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
};

/** Stable comparison of nullable totals: nulls last in both directions, ties keep their input order (Array#sort is stable). */
const byTotal = (direction: 1 | -1) => (rawA: number | null, rawB: number | null) => {
  const a = rawA !== null && Number.isFinite(rawA) ? rawA : null;
  const b = rawB !== null && Number.isFinite(rawB) ? rawB : null;
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return direction * (a - b);
};

/**
 * Orders two-level category rows (#2391, chart §16). `original` without `swap` returns the input order unchanged. Otherwise every group is
 * contiguous: groups follow the first appearance of their key under `original` (with `swap`), else their summed total (sum of the known row totals; a group with none is last). Pure: the input is not changed.
 */
export function orderRows<R extends OrderableRow>(rows: readonly R[], options: RowOrderOptions = {}): RowOrderResult<R> {
  const { sort = 'original', swap = false, sortWithinGroups = true, levelLabels } = options;
  const groupKey = (row: R) => row.levels[swap ? 1 : 0];
  const rowKey = (row: R) => row.levels[swap ? 0 : 1];
  const buckets = new Map<string, R[]>();
  for (const row of rows) {
    const bucket = buckets.get(groupKey(row));
    if (bucket) bucket.push(row); else buckets.set(groupKey(row), [row]);
  }
  // `original` without a swap is the input order verbatim, even when a group's rows are not adjacent (#2394 review).
  if (sort === 'original' && !swap) return result([...rows]);
  let groups = [...buckets.values()];
  if (sort !== 'original') {
    const compare = byTotal(sort === 'total-desc' ? -1 : 1);
    if (sortWithinGroups) groups = groups.map(group => [...group].sort((a, b) => compare(a.total, b.total)));
    groups = groups.map(group => ({ group, total: sumKnown(group.map(row => row.total)) }))
      .sort((a, b) => compare(a.total, b.total)).map(({ group }) => group);
  }
  return result(groups.flat());

  function result(ordered: R[]): RowOrderResult<R> {
    if (!levelLabels) return { rows: ordered, groups: undefined };
    const byCategory = new Map(ordered.map(row => [row.category, { group: groupKey(row), label: rowKey(row) }]));
    return { rows: ordered, groups: { header: levelLabels[swap ? 1 : 0], byCategory } };
  }
}
