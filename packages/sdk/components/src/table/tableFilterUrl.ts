import { encodeFilterParams, filterParamLimit, parseFilterParams, validateFilters, type ColumnFilter, type ColumnFilterSpec, type FilterParamRejection } from '@ap/contracts';

/**
 * A page-declared old single key (`status=active`) read for one release and rewritten into the filter key (ADR-0105 §6). The SDK has
 * no constants: the page says which keys exist and what each raw value means. `null` = the value is not a valid condition.
 */
export type LegacyFilterKey = { key: string; toFilter: (raw: string) => ColumnFilter | null };

/** What a page hands `useTableUrlState` to opt into URL-held column filters. `key` must be in the menu's `pageKeys`, `repeatedPageKeys` (and normally `hiddenPageKeys`); each legacy key must be in `pageKeys`. */
export type TableFilterOption = {
  key: string;
  specs: Readonly<Record<string, ColumnFilterSpec>>;
  /** User-facing field names for the warning sentences; an id without an entry reads as the id. */
  labels?: Readonly<Record<string, string>>;
  legacy?: readonly LegacyFilterKey[];
};

export type TableFilterProblem = { reason: FilterParamRejection | 'legacy-invalid'; field: string; raw: string };
export type TableFilterRead =
  | { ok: true; filters: ColumnFilter[]; legacyPresent: boolean }
  | { ok: false; problems: TableFilterProblem[] };

/** Field id of a raw condition as entered (`status:equals:x` → `status`), for naming it in a sentence even when the rest is broken. */
const rawField = (raw: string): string => raw.slice(0, Math.max(raw.indexOf(':'), 0)) || raw;

/**
 * The filters the URL holds: the new key's values through the codec, then every present legacy key converted and merged (a legacy key
 * and a condition on the same field, an unconvertible legacy value, or any failed rule is a problem, never a repair). Pure.
 */
export function readTableFilters(option: TableFilterOption, values: readonly string[], legacyRaw: readonly (string | null)[]): TableFilterRead {
  const parsed = parseFilterParams(values, option.specs);
  if (!parsed.ok) return { ok: false, problems: [{ reason: parsed.reason, field: parsed.reason === 'too-many-conditions' || parsed.reason === 'too-long' ? '' : rawField(parsed.value), raw: parsed.value }] };
  const filters = [...parsed.filters];
  const raws = [...values];
  const legacy = option.legacy ?? [];
  const problems: TableFilterProblem[] = [];
  let legacyPresent = false;
  legacy.forEach((entry, index) => {
    const raw = legacyRaw[index];
    if (raw === null || raw === undefined) return;
    legacyPresent = true;
    const filter = entry.toFilter(raw);
    if (!filter) problems.push({ reason: 'legacy-invalid', field: entry.key, raw });
    else { filters.push(filter); raws.push(raw); }
  });
  if (problems.length > 0) return { ok: false, problems };
  if (!legacyPresent) return { ok: true, filters, legacyPresent };
  const check = validateFilters(filters, option.specs);
  if (!check.ok) {
    const raw = raws[filters.indexOf(check.filter)] as string;
    return { ok: false, problems: [{ reason: check.reason, field: check.filter.id, raw }] };
  }
  const limit = filterParamLimit(encodeFilterParams(filters));
  if (limit) return { ok: false, problems: [{ reason: limit, field: '', raw: raws[raws.length - 1] as string }] };
  return { ok: true, filters, legacyPresent };
}
