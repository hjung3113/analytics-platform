import { encodeFilterParams, filterParamLimit, FILTER_PARAM_LIMITS, parseFilterParams, validateFilters, type ColumnFilter, type ColumnFilterSpec, type FilterParamRejection } from '@ap/contracts';

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

/** Why a filter state was refused, in the user's words (the sentence's cause; never the enum token). */
export const FILTER_PROBLEM_CAUSES: Readonly<Record<TableFilterProblem['reason'], { ko: string; en: string }>> = {
  'invalid-id': { ko: '필드 이름이 올바르지 않습니다.', en: 'The field name is not valid.' },
  'undeclared-field': { ko: '이 화면에 없는 항목입니다.', en: 'This screen has no such field.' },
  'duplicate-field': { ko: '같은 항목에 조건이 둘 이상 있습니다.', en: 'The same field has more than one condition.' },
  'op-not-allowed': { ko: '이 항목에서 쓸 수 없는 조건 방식입니다.', en: 'This field does not support that condition.' },
  'bad-value': { ko: '값의 형식이 맞지 않습니다.', en: 'The value has the wrong format.' },
  'multiple-not-allowed': { ko: '이 항목은 값을 하나만 고를 수 있습니다.', en: 'This field accepts only one value.' },
  'requires-unmet': { ko: '먼저 필요한 다른 조건이 없습니다.', en: 'A condition this one depends on is missing.' },
  malformed: { ko: '조건을 읽을 수 없습니다.', en: 'The condition cannot be read.' },
  'too-many-conditions': { ko: `조건은 ${FILTER_PARAM_LIMITS.conditions}개까지 쓸 수 있습니다.`, en: `At most ${FILTER_PARAM_LIMITS.conditions} conditions are allowed.` },
  'too-many-values': { ko: `한 조건의 값은 ${FILTER_PARAM_LIMITS.listValues}개까지 쓸 수 있습니다.`, en: `A condition takes at most ${FILTER_PARAM_LIMITS.listValues} values.` },
  'too-long': { ko: '조건이 너무 길어 링크로 공유할 수 없습니다.', en: 'The conditions are too long to share as a link.' },
  'legacy-invalid': { ko: '예전 주소의 값을 조건으로 바꿀 수 없습니다.', en: 'The old address value cannot be turned into a condition.' },
};

/** Field id of a raw condition as entered (`status:equals:x` → `status`), for naming it in a sentence even when the rest is broken. */
const rawField = (raw: string): string => raw.slice(0, Math.max(raw.indexOf(':'), 0)) || raw;

const withoutRequires = (specs: Readonly<Record<string, ColumnFilterSpec>>): Record<string, ColumnFilterSpec> =>
  Object.fromEntries(Object.entries(specs).map(([id, spec]) => [id, spec.requires ? { ...spec, requires: [] } : spec]));

/**
 * The filters the URL holds: the new key's values through the codec, then every present legacy key converted and merged (a legacy key
 * and a condition on the same field, an unconvertible legacy value, or any failed rule is a problem, never a repair). Pure.
 */
export function readTableFilters(option: TableFilterOption, values: readonly string[], legacyRaw: readonly (string | null)[]): TableFilterRead {
  // `requires` spans conditions, so it is judged once on the merged set below (a legacy key may satisfy a new condition and vice versa).
  const parsed = parseFilterParams(values, withoutRequires(option.specs), option.key);
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
  const check = validateFilters(filters, option.specs);
  if (!check.ok) {
    const raw = raws[filters.indexOf(check.filter)] as string;
    return { ok: false, problems: [{ reason: check.reason, field: check.filter.id, raw }] };
  }
  const limit = legacyPresent ? filterParamLimit(encodeFilterParams(filters), option.key) : null;
  if (limit) return { ok: false, problems: [{ reason: limit, field: '', raw: raws[raws.length - 1] as string }] };
  return { ok: true, filters, legacyPresent };
}
