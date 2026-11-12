import type { Routing } from './bundle/routing.js';
import { MenuUpstreamError } from './forwarder.js';

type Sort = NonNullable<NonNullable<Routing['merge']>['sort']>[number][];
type Value = number | string | null;
function sortValue(row: unknown, field: string): Value {
  const value = row !== null && typeof row === 'object' && Object.hasOwn(row, field) ? (row as Record<string, unknown>)[field] : undefined;
  if (value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new MenuUpstreamError('unavailable');
}
function compare(left: Value, right: Value): number {
  if (left === right) return 0;
  if (typeof left !== typeof right) throw new MenuUpstreamError('unavailable');
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1;
  if (typeof left === 'string' && typeof right === 'string') {
    const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
    const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const x = a[index] ?? 0; const y = b[index] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return a.length - b.length;
  }
  throw new MenuUpstreamError('unavailable');
}

/** Inputs are projected rows in route declaration order. No source values enter failures. */
export function mergeRows(legs: readonly (readonly unknown[])[], sort: Sort | undefined): unknown[] {
  if (!sort) return legs.flatMap((rows) => [...rows]);
  const last = sort.at(-1);
  if (!last?.unique) throw new MenuUpstreamError('unavailable');
  const seen = new Map<Value, number>();
  const types = new Map<string, string>();
  const rows = legs.flatMap((leg, legIndex) => leg.map((row) => {
    const values = sort.map(({ field }) => {
      const value = sortValue(row, field);
      if (value !== null) {
        const type = types.get(field);
        if (type !== undefined && type !== typeof value) throw new MenuUpstreamError('unavailable');
        types.set(field, typeof value);
      }
      return value;
    });
    const key = sortValue(row, last.field);
    if (seen.has(key) && seen.get(key) !== legIndex) throw new MenuUpstreamError('unavailable');
    seen.set(key, legIndex);
    return { row, values };
  }));
  rows.sort((left, right) => {
    for (let index = 0; index < sort.length; index++) {
      const a = left.values[index] ?? null; const b = right.values[index] ?? null;
      // Null placement is independent of direction.
      if (a === null || b === null) { if (a !== b) return a === null ? 1 : -1; continue; }
      const order = compare(a, b);
      if (order !== 0) return sort[index]?.direction === 'desc' ? -order : order;
    }
    return 0;
  });
  return rows.map(({ row }) => row);
}

export interface PagePlan { page: number; pageSize: number; sort: Sort }
/** merge.sort is the bundle's sortable-field allowlist; its unique key always sorts last. */
export function pagePlan(merge: Routing['merge'], params: Record<string, unknown>): PagePlan | undefined {
  const { page, pageSize, sorting = [] } = params;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 0 || typeof pageSize !== 'number' || !Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger((page + 1) * pageSize)) return undefined;
  if (!Array.isArray(sorting) || sorting.length > (merge?.sort?.length ?? 0)) return undefined;
  const requested: Sort = [];
  for (const item of sorting) {
    if (item === null || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.desc !== 'boolean' || Object.keys(item).some((key) => !['id', 'desc'].includes(key)) || !merge?.sort?.some(({ field }) => field === item.id) || requested.some(({ field }) => field === item.id)) return undefined;
    requested.push({ field: item.id, direction: item.desc ? 'desc' : 'asc' });
  }
  const last = merge?.sort?.at(-1);
  if (!last?.unique) return undefined;
  const tie = requested.find(({ field }) => field === last.field);
  const sort = [
    ...requested.filter(({ field }) => field !== last.field),
    ...(merge?.sort ?? []).filter(({ field }) => field !== last.field && !requested.some((item) => item.field === field)),
    { ...last, ...(tie ? { direction: tie.direction } : {}) },
  ];
  return { page, pageSize, sort };
}
