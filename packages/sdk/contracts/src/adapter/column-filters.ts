import { instantEpochMs } from '../values/instant.js';
import type { PageQuery } from './paging.js';

/**
 * Column filters (06 §15, ADR-0104, ADR-0105). A field declares its kind (`PlatformColumn.filter` or a non-column filter
 * field); the table sends the user's `ColumnFilter[]` to the server through `loadPage` and the export request. The server
 * owns the meaning: the table never filters a server page on the client. `filterRows` is the mock endpoint's one-line half
 * and `validateFilters` the guard every mock and server runs first.
 *
 * Semantics (the contract; servers must match):
 * - One condition per field, AND across fields. Enum `in`/`notIn` is the only OR.
 * - Blank = `null | undefined | ''` for `text`, `null | undefined` for every other kind.
 * - Positive ops (`contains`, `equals`, `eq`, `gt`, `in`, `between`, ...) never match a blank value.
 * - Negated ops (`notContains`, `notEquals`, `neq`, `notIn`) EXCLUDE blanks too (SQL `NOT x` with NULL is not true). Use
 *   `isEmpty` / `isNotEmpty` to ask about blanks explicitly.
 * - Text is case-insensitive (locale-independent lower-case) unless the spec says `caseSensitive: true`.
 * - Number `between` is inclusive on both ends. Date values are wall-clock `YYYY-MM-DD` (06 §6.3): `between` is `from`
 *   inclusive / `to` EXCLUSIVE, `before` = strictly before that day (`< value`), `after` = strictly after that day (`>=` the
 *   next day). Instant (`instant` kind) `between` is half-open `[from, to)` over ISO instants.
 * - Field ids must not contain `:` (the URL codec splits on it).
 */
export const TEXT_OPS = ['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals', 'isEmpty', 'isNotEmpty'] as const;
export const NUMBER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'] as const;
export const DATE_OPS = ['between', 'before', 'after', 'isEmpty', 'isNotEmpty'] as const;
export const INSTANT_OPS = ['between', 'isEmpty', 'isNotEmpty'] as const;
export const ENUM_OPS = ['in', 'notIn', 'isEmpty', 'isNotEmpty'] as const;

export type TextOp = (typeof TEXT_OPS)[number];
export type NumberOp = (typeof NUMBER_OPS)[number];
export type DateOp = (typeof DATE_OPS)[number];
export type InstantOp = (typeof INSTANT_OPS)[number];
export type EnumOp = (typeof ENUM_OPS)[number];
export type ColumnFilterOp = TextOp | NumberOp | DateOp | InstantOp | EnumOp;

/** All operators of each kind (what a spec without `ops` supports). */
export const FILTER_OPS_BY_KIND = {
  text: TEXT_OPS,
  number: NUMBER_OPS,
  date: DATE_OPS,
  instant: INSTANT_OPS,
  enum: ENUM_OPS,
} as const;

/** Wire meaning shared by every kind. Display concerns (`label`, `pinned`) are NOT here (components own them). */
type SpecBase = {
  /** Fields whose condition must also be present for this one to be valid (e.g. target id needs target type). */
  requires?: string[];
};

/**
 * `ops` is the server-supported subset of the kind's operators; absent = all of them. `text.caseSensitive: true` makes
 * `equals`/`contains`/... compare exactly. `enum.multiple: false` allows exactly one value. `instant` is a real-time range
 * (ISO instants with offset or `Z`), distinct from the wall-clock `date`.
 */
export type ColumnFilterSpec =
  | (SpecBase & { kind: 'text'; ops?: readonly TextOp[]; caseSensitive?: true })
  | (SpecBase & { kind: 'number'; ops?: readonly NumberOp[] })
  | (SpecBase & { kind: 'date'; ops?: readonly DateOp[] })
  | (SpecBase & { kind: 'instant'; ops?: readonly InstantOp[] })
  | (SpecBase & { kind: 'enum'; options: { value: string; label: string }[]; ops?: readonly EnumOp[]; multiple?: false });

/** `id` is the field id (= the server field), without `:`. Operators are fixed per kind. */
export type ColumnFilter =
  | { id: string; op: 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals'; value: string }
  | { id: string; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
  | { id: string; op: 'between'; value: [number, number] }
  /** Wall-clock `YYYY-MM-DD` (06 §6.3), never an instant. `from` inclusive, `to` EXCLUSIVE on the wire; either may be absent. For an `instant` field: ISO instants, half-open the same way. */
  | { id: string; op: 'between'; value: { from?: string; to?: string } }
  /** Date: wall-clock `YYYY-MM-DD`; `before` is `< value`, `after` is `>=` the next day. */
  | { id: string; op: 'before' | 'after'; value: string }
  | { id: string; op: 'in' | 'notIn'; value: string[] }
  | { id: string; op: 'isEmpty' | 'isNotEmpty' };

/**
 * What `PlatformDataTable.loadPage` receives: `PageQuery` plus the opt-in column filters (sent only when non-empty) and the
 * opt-in row grouping (#556d, ADR-0104). `groupBy` is ONE column id (one level); a future multi-level form would be a new
 * additive field (`groupBy: string[]`), never a type change of this one. Absent = flat rows.
 */
export type TableQuery = PageQuery & { filters?: ColumnFilter[]; groupBy?: string };


const isRange = (value: unknown): value is { from?: string; to?: string } => typeof value === 'object' && value !== null && !Array.isArray(value);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isWallClockDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}
function nextDay(value: string): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** Filter grammar (regex) plus the repo's strict instant check, so `2026-02-30T00:00:00Z` is rejected, not rolled into March. */
function isInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !INSTANT_RE.test(value)) return false;
  try {
    return Number.isFinite(instantEpochMs(value));
  } catch {
    return false;
  }
}

export type FilterRowsOptions = {
  /** Field specs by id. Optional: with them `filterRows` honours `caseSensitive` (text), `instant` ranges and kind-specific blanks. Without them the old ops behave exactly as before (`''` is a value for every op that is not a text op). */
  specs?: Readonly<Record<string, ColumnFilterSpec>>;
};

const TEXT_OP_SET: ReadonlySet<string> = new Set(['contains', 'notContains', 'startsWith', 'endsWith', 'equals', 'notEquals']);

/** `''` is blank for text only. With a spec the kind decides; without one only the op can tell: text ops and `isEmpty`/`isNotEmpty` (kind unknown) treat `''` as blank, every other (old) op keeps `''` a value. */
function isBlank(filter: ColumnFilter, raw: unknown, spec: ColumnFilterSpec | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  if (raw !== '') return false;
  if (spec) return spec.kind === 'text';
  return TEXT_OP_SET.has(filter.op) || filter.op === 'isEmpty' || filter.op === 'isNotEmpty';
}

function matches(filter: ColumnFilter, raw: unknown, spec: ColumnFilterSpec | undefined): boolean {
  const blank = isBlank(filter, raw, spec);
  switch (filter.op) {
    case 'isEmpty': return blank;
    case 'isNotEmpty': return !blank;
  }
  if (blank) return false; // every other op, negated ones included
  const sensitive = spec?.kind === 'text' && spec.caseSensitive === true;
  const fold = (text: string) => (sensitive ? text : text.toLowerCase());
  switch (filter.op) {
    case 'contains': return fold(String(raw)).includes(fold(filter.value));
    case 'notContains': return !fold(String(raw)).includes(fold(filter.value));
    case 'startsWith': return fold(String(raw)).startsWith(fold(filter.value));
    case 'endsWith': return fold(String(raw)).endsWith(fold(filter.value));
    case 'equals': return fold(String(raw)) === fold(filter.value);
    case 'notEquals': return fold(String(raw)) !== fold(filter.value);
    case 'eq': return Number(raw) === filter.value;
    case 'neq': return Number.isNaN(Number(raw)) ? false : Number(raw) !== filter.value;
    case 'gt': return Number(raw) > filter.value;
    case 'gte': return Number(raw) >= filter.value;
    case 'lt': return Number(raw) < filter.value;
    case 'lte': return Number(raw) <= filter.value;
    case 'in': return filter.value.includes(String(raw));
    case 'notIn': return !filter.value.includes(String(raw));
    case 'before': return String(raw) < filter.value;
    case 'after': return String(raw) >= nextDay(filter.value);
    case 'between': {
      if (isRange(filter.value)) {
        const { from, to } = filter.value;
        if (spec?.kind === 'instant') {
          const at = typeof raw === 'number' ? raw : Date.parse(String(raw));
          if (Number.isNaN(at)) return false;
          return (from === undefined || from === '' || Date.parse(from) <= at) && (to === undefined || to === '' || at < Date.parse(to));
        }
        // Wall-clock strings compare lexicographically: a date-time `2026-01-05T09:00:00` is within `from: 2026-01-05` and before `to: 2026-01-06`.
        const text = String(raw);
        return (from === undefined || from === '' || from <= text) && (to === undefined || to === '' || text < to);
      }
      const n = Number(raw);
      return n >= filter.value[0] && n <= filter.value[1];
    }
  }
}

/**
 * Apply column filters to an in-memory row set (AND across filters) — the mock server's half. Semantics are the header
 * comment's. Permissive on purpose (old callers): it does not check operators against specs; mocks call `validateFilters`
 * first. No filters = the same rows.
 */
export function filterRows<T>(rows: readonly T[], filters: readonly ColumnFilter[] | undefined, accessor: (row: T, id: string) => unknown = (row, id) => (row as Record<string, unknown>)[id], options?: FilterRowsOptions): T[] {
  if (!filters || filters.length === 0) return [...rows];
  return rows.filter(row => filters.every(f => matches(f, accessor(row, f.id), options?.specs?.[f.id])));
}

export type FilterRejection = 'invalid-id' | 'undeclared-field' | 'duplicate-field' | 'op-not-allowed' | 'bad-value' | 'multiple-not-allowed' | 'requires-unmet';
export type FilterValidation = { ok: true } | { ok: false; reason: FilterRejection; filter: ColumnFilter };

function valueFits(filter: ColumnFilter, spec: ColumnFilterSpec): boolean {
  const { op } = filter;
  const value: unknown = 'value' in filter ? filter.value : undefined;
  switch (op) {
    case 'isEmpty':
    case 'isNotEmpty': return value === undefined;
    case 'contains': case 'notContains': case 'startsWith': case 'endsWith': case 'equals': case 'notEquals': return typeof value === 'string';
    case 'eq': case 'neq': case 'gt': case 'gte': case 'lt': case 'lte': return typeof value === 'number' && Number.isFinite(value);
    case 'before': case 'after': return isWallClockDate(value);
    case 'in': case 'notIn': return Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string');
    case 'between': {
      if (spec.kind === 'number') return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v));
      if (!isRange(value)) return false;
      const ok = spec.kind === 'instant' ? isInstant : isWallClockDate;
      const { from, to } = value;
      return (from !== undefined || to !== undefined) && (from === undefined || ok(from)) && (to === undefined || ok(to));
    }
  }
}

/**
 * Guard every mock and server runs before `filterRows` / the real query: rejects a filter on an undeclared field, a field id
 * containing `:`, a second condition on one field, an op outside the field's `ops` (default: all ops of its kind), a value of
 * the wrong shape, a `multiple: false` enum with more than one value, and a condition whose `requires` fields have no
 * condition. Returns the first offending filter. URL caps (condition count, `in` size) are the URL codec's, not here.
 */
export function validateFilters(filters: readonly ColumnFilter[], specs: Readonly<Record<string, ColumnFilterSpec>>): FilterValidation {
  const seen = new Set<string>();
  for (const filter of filters) {
    const fail = (reason: FilterRejection): FilterValidation => ({ ok: false, reason, filter });
    if (filter.id.includes(':')) return fail('invalid-id');
    const spec = Object.prototype.hasOwnProperty.call(specs, filter.id) ? specs[filter.id] : undefined;
    if (!spec) return fail('undeclared-field');
    if (seen.has(filter.id)) return fail('duplicate-field');
    seen.add(filter.id);
    const allowed: readonly string[] = spec.ops ?? FILTER_OPS_BY_KIND[spec.kind];
    if (!allowed.includes(filter.op) || !(FILTER_OPS_BY_KIND[spec.kind] as readonly string[]).includes(filter.op)) return fail('op-not-allowed');
    if (!valueFits(filter, spec)) return fail('bad-value');
    if (spec.kind === 'enum' && spec.multiple === false && (filter.op === 'in' || filter.op === 'notIn') && filter.value.length > 1) return fail('multiple-not-allowed');
  }
  for (const filter of filters) {
    const required = specs[filter.id]?.requires ?? [];
    if (required.some(id => !seen.has(id))) return { ok: false, reason: 'requires-unmet', filter };
  }
  return { ok: true };
}
