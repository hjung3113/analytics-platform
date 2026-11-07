// The table filter model (`filters: ColumnFilter[]`, ADR-0105) as the catalog reads accept it. The server cannot
// import `@ap/contracts` at runtime (check-boundaries rule 11), so the wire shape and the per-field rules are
// mirrored here; the menu's `src/endpoints.ts` declares the same specs and a drift test pins both sides.
// Every refusal is a message for the engine's params judgment (`error` outcome), never an empty page.
// Semantics (docs/integration/real-server-checklist.md §3): one condition per field, AND across fields;
// `in` = any value; `notIn` excludes blanks too (no field here is nullable); on a `cell: 'many'` field `in` =
// EXISTS element in the values, `notIn` = at least one element AND NOT EXISTS element in the values,
// `isEmpty` = no element.

import { unsafeText } from '../text-safety.js';

export const FILTER_VALUES_MAX = 200;
export const FILTER_TEXT_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CatalogFilterOp = 'in' | 'notIn' | 'isEmpty' | 'isNotEmpty';

export interface CatalogFilterFieldSpec {
  ops: readonly CatalogFilterOp[];
  /** `false`: at most one value (`multiple: false` of the spec). */
  multiple: boolean;
  /** `many`: the row's cell is a set of values (an array cell). */
  cell: 'scalar' | 'many';
  /** What a value looks like; `enum` = one of `allowed`; `text` = a non-blank string of at most `maxLength` characters. */
  values: 'boolean' | 'uuid' | 'enum' | 'text';
  /** The closed value list of an `enum` field. */
  allowed?: readonly string[];
  /** Character cap of a `text` value (default `FILTER_TEXT_MAX`). */
  maxLength?: number;
  /** Fixed words a `uuid` field accepts besides a uuid (e.g. `me`); the endpoint resolves them before the query. */
  literals?: readonly string[];
}

export interface FilterCondition {
  op: CatalogFilterOp;
  /** `boolean` fields carry 'true' | 'false'; uuid fields carry uuid strings. Empty for isEmpty / isNotEmpty. */
  values: string[];
}
export type FilterConditions = Record<string, FilterCondition>;

export type FilterParse = { ok: true; value: FilterConditions } | { ok: false; message: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const refuse = (message: string): { ok: false; message: string } => ({ ok: false, message });

function validValue(spec: CatalogFilterFieldSpec, v: string): boolean {
  switch (spec.values) {
    case 'boolean':
      return v === 'true' || v === 'false';
    case 'enum':
      return (spec.allowed ?? []).includes(v);
    case 'text':
      return v.trim() !== '' && v.length <= (spec.maxLength ?? FILTER_TEXT_MAX) && !unsafeText(v);
    default:
      return UUID.test(v) || (spec.literals ?? []).includes(v);
  }
}

function valueMessage(id: string, spec: CatalogFilterFieldSpec): string {
  switch (spec.values) {
    case 'boolean':
      return `filter ${id} values are 'true' or 'false'`;
    case 'enum':
      return `filter ${id} values are one of ${(spec.allowed ?? []).join(', ')}`;
    case 'text':
      return `filter ${id} values are non-blank text of at most ${spec.maxLength ?? FILTER_TEXT_MAX} characters`;
    default:
      return `filter ${id} values are uuid strings${spec.literals?.length ? ` or ${spec.literals.join(', ')}` : ''}`;
  }
}

/** Parses `params.filters` (absent = no filter) against one endpoint's field specs. */
export function parseCatalogFilters(
  raw: unknown,
  specs: Readonly<Record<string, CatalogFilterFieldSpec>>,
): FilterParse {
  if (raw === undefined) return { ok: true, value: {} };
  if (!Array.isArray(raw)) return refuse('filters must be a list of { id, op, value } conditions');
  const out: FilterConditions = {};
  for (const entry of raw as unknown[]) {
    if (!isPlainObject(entry)) return refuse('a filter is { id, op, value }');
    const { id, op, value, ...rest } = entry;
    if (Object.keys(rest).length > 0) return refuse('a filter is { id, op, value }');
    if (typeof id !== 'string' || id === '' || id.includes(':')) return refuse('a filter id is a field name');
    const spec = Object.hasOwn(specs, id) ? specs[id] : undefined;
    if (!spec) return refuse(`filtering by ${id} is not supported`);
    if (Object.hasOwn(out, id)) return refuse(`filter ${id} appears twice`);
    if (typeof op !== 'string' || !(spec.ops as readonly string[]).includes(op)) {
      return refuse(`filter ${id}: operator ${String(op)} is not supported`);
    }
    if (op === 'isEmpty' || op === 'isNotEmpty') {
      if (value !== undefined) return refuse(`filter ${id}:${op} takes no value`);
      out[id] = { op, values: [] };
      continue;
    }
    if (!Array.isArray(value) || value.length === 0) {
      return refuse(`filter ${id}:${op} needs a non-empty list of values`);
    }
    if (value.length > FILTER_VALUES_MAX || (!spec.multiple && value.length > 1)) {
      return refuse(
        spec.multiple
          ? `filter ${id} takes at most ${FILTER_VALUES_MAX} values`
          : `filter ${id} takes one value`,
      );
    }
    for (const v of value as unknown[]) {
      if (typeof v !== 'string' || !validValue(spec, v)) return refuse(valueMessage(id, spec));
    }
    out[id] = { op: op as CatalogFilterOp, values: value as string[] };
  }
  return { ok: true, value: out };
}
