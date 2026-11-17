import type { ConformanceCheck } from '../../types';

/** Marks a check that only means something for a site-scoped destination type (`planPortChecks` skips them for a siteless sample). */
export type AtSite = (check: ConformanceCheck) => ConformanceCheck;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
/** Same JSON regardless of object key order: a server may store JSON in a form that reorders keys (PostgreSQL `jsonb`). */
export const sameJson = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
