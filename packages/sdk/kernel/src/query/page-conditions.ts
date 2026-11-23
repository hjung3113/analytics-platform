import { FILTER_PARAM_LIMITS, isRepeatedPageCondition, pageConditionKeys, wallClockEpochMs, type GlobalContext, type MenuMeta, type PageConditionCategory, type PageConditionOption, type Pair } from '@ap/contracts';

/** Same URL budget as table filters; count is across all lists of one category. */
export const PAGE_CONDITION_LIMITS = { valuesPerCategory: FILTER_PARAM_LIMITS.listValues, encodedLength: FILTER_PARAM_LIMITS.encodedLength } as const;
export const PAGE_CONDITION_EMPTY = '~none';
export type PageConditionRange = { min: number | null; max: number | null };
/** Lists preserve order. A scalar/date has exactly one value; [] is explicit empty selection. */
export type PageConditionValue = readonly string[] | PageConditionRange;
export type PageConditionValues = Readonly<Record<string, PageConditionValue>>;
export type PageConditionIssueReason = 'too-long' | 'too-many-values' | 'repeated-single-key' | 'invalid-empty-selection' | 'invalid-range' | 'invalid-date' | 'invalid-value' | 'reversed-date' | 'undeclared-key';
export type PageConditionIssue = { key: string; categoryId: string; reason: PageConditionIssueReason };
export type PageConditionMenu = Pick<MenuMeta, 'pageConditions'>;
export type DecodedPageConditions = { values: Record<string, PageConditionValue>; issues: PageConditionIssue[] };
export class PageConditionError extends Error {
  constructor(readonly issues: readonly PageConditionIssue[]) {
    super(issues.map(issue => `${issue.key}: ${issue.reason}`).join('; '));
    this.name = 'PageConditionError';
  }
}
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function validText(value: string): boolean {
  if (!value.trim()) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}
const encodeValue = (value: string) => value.startsWith('~') ? `~${value}` : value;
function decodedValue(raw: string): string | null {
  if (raw.startsWith('~~')) return raw.slice(1);
  if (raw.startsWith('~') || !validText(raw)) return null;
  return raw;
}
function readRange(raw: string): PageConditionRange | null {
  const parts = raw.split('..');
  if (parts.length !== 2 || parts.every(value => value === '')) return null;
  const [left, right] = parts;
  if ([left, right].some(value => value !== '' && (!NUMBER.test(value) || !Number.isFinite(Number(value))))) return null;
  const min = left === '' ? null : Number(left);
  const max = right === '' ? null : Number(right);
  return min !== null && max !== null && min > max ? null : { min, max };
}
function encodedLength(pairs: readonly Pair[]): number {
  return pairs.reduce((total, pair) => total + new URLSearchParams([pair]).toString().length + 1, 0);
}

/** Rejects a malformed category atomically. Input pairs are never repaired or overwritten. */
export function decodePageConditions(menu: PageConditionMenu, pairs: readonly Pair[]): DecodedPageConditions {
  const values = new Map<string, PageConditionValue>();
  const issues: PageConditionIssue[] = [];
  const categories = menu.pageConditions?.categories ?? [];
  const declared = new Set(categories.flatMap(pageConditionKeys));
  if (encodedLength(pairs.filter(([key]) => declared.has(key))) > PAGE_CONDITION_LIMITS.encodedLength) {
    for (const category of categories) for (const key of pageConditionKeys(category)) if (pairs.some(([k]) => key === k)) issues.push({ key, categoryId: category.id, reason: 'too-long' });
    return { values: Object.fromEntries(values), issues };
  }
  for (const category of categories) {
    const keys = pageConditionKeys(category);
    const local = new Map<string, PageConditionValue>();
    const before = issues.length;
    const issue = (key: string, reason: PageConditionIssueReason) => issues.push({ key, categoryId: category.id, reason });
    let count = 0;
    for (const key of keys) {
      const raw = pairs.filter(([k]) => k === key).map(([, value]) => value);
      if (!raw.length) continue;
      if (!isRepeatedPageCondition(category) && raw.length > 1) { issue(key, 'repeated-single-key'); continue; }
      if (raw.includes(PAGE_CONDITION_EMPTY)) {
        if (raw.length !== 1 || category.kind.type === 'range' || category.kind.type === 'date') issue(key, 'invalid-empty-selection');
        else local.set(key, []);
        continue;
      }
      count += raw.length;
      if (category.kind.type === 'range') {
        const range = readRange(raw[0]);
        if (range === null) issue(key, 'invalid-range'); else local.set(key, range);
      } else if (category.kind.type === 'date') {
        if (wallClockEpochMs(raw[0]) === null) issue(key, 'invalid-date'); else local.set(key, raw);
      } else {
        const decoded = raw.map(decodedValue);
        if (decoded.some(value => value === null || !validText(value))) issue(key, 'invalid-value');
        else local.set(key, decoded as string[]);
      }
    }
    if (count > PAGE_CONDITION_LIMITS.valuesPerCategory) issue(keys[0], 'too-many-values');
    if (category.kind.type === 'date') {
      const { from, to } = category.kind;
      const start = local.get(from); const end = local.get(to);
      if (Array.isArray(start) && Array.isArray(end) && start[0] >= end[0]) issue(from, 'reversed-date');
    }
    if (before === issues.length) for (const [key, value] of local) values.set(key, value);
  }
  return { values: Object.fromEntries(values), issues };
}

/** Values are decoded ids, never pre-escaped tokens. Throws with the same issues as decode. */
export function encodePageConditions(menu: PageConditionMenu, values: PageConditionValues): Pair[] {
  const pairs: Pair[] = [];
  const categories = menu.pageConditions?.categories ?? [];
  const declared = new Set(categories.flatMap(pageConditionKeys));
  const unknown = Object.keys(values).filter(key => !declared.has(key));
  if (unknown.length) throw new PageConditionError(unknown.map(key => ({ key, categoryId: '', reason: 'undeclared-key' })));
  for (const category of categories) for (const key of pageConditionKeys(category)) {
    const value = Object.hasOwn(values, key) ? values[key] : undefined;
    if (value === undefined) continue;
    if (category.kind.type === 'range') {
      if (Array.isArray(value)) throw new PageConditionError([{ key, categoryId: category.id, reason: 'invalid-range' }]);
      const range = value as PageConditionRange;
      pairs.push([key, `${range.min ?? ''}..${range.max ?? ''}`]);
    } else {
      if (!Array.isArray(value)) throw new PageConditionError([{ key, categoryId: category.id, reason: 'invalid-value' }]);
      if (!value.length) pairs.push([key, PAGE_CONDITION_EMPTY]);
      else for (const item of value) pairs.push([key, encodeValue(item)]);
    }
  }
  const result = decodePageConditions(menu, pairs);
  if (result.issues.length) throw new PageConditionError(result.issues);
  return pairs;
}

export type PageConditionSummaryItem = { key: string; label: string; value: string };
export type PageConditionSummaryIssue = { key: string; label: string; reason: string };
/** Structurally matches QueryBarExtension without a dependency on React/components. */
export type PageConditionExtension = {
  pageSummary?: readonly PageConditionSummaryItem[];
  appliedPageSummary?: readonly PageConditionSummaryItem[];
  issues?: readonly PageConditionSummaryIssue[];
  historyPageSummary?: (global: GlobalContext, page: readonly Pair[]) => readonly PageConditionSummaryItem[];
  historyDrill?: boolean;
};
export type PageConditionSummaryInput = {
  menu: PageConditionMenu;
  lang: 'ko' | 'en';
  /** Resolved options for the candidate being formatted; keys are category ids. Absence means not loaded. */
  options?: Readonly<Record<string, readonly PageConditionOption[]>>;
};
function optionsFor(category: PageConditionCategory, input: PageConditionSummaryInput): readonly PageConditionOption[] | undefined {
  const kind = category.kind;
  if ((kind.type === 'select' || kind.type === 'multi') && 'static' in kind.options) return kind.options.static;
  // Own entries only: a category id such as `constructor` must not read Object.prototype.
  const loaded = input.options;
  return loaded !== undefined && Object.hasOwn(loaded, category.id) ? loaded[category.id] : undefined;
}
/** Pure candidate summary: missing options never drop the original id or guess a replacement. */
export function summarizePageConditions(input: PageConditionSummaryInput, pairs: readonly Pair[]) {
  const decoded = decodePageConditions(input.menu, pairs);
  const summary: PageConditionSummaryItem[] = [];
  const issues: PageConditionSummaryIssue[] = [];
  for (const category of input.menu.pageConditions?.categories ?? []) {
    const options = optionsFor(category, input);
    for (const key of pageConditionKeys(category)) {
      const list = category.kind.type === 'groupedChecks' ? category.kind.lists.find(list => list.key === key) : undefined;
      const label = (list?.label ?? category.label)[input.lang];
      for (const issue of decoded.issues.filter(issue => issue.key === key)) issues.push({ key, label, reason: issue.reason });
      const value = Object.hasOwn(decoded.values, key) ? decoded.values[key] : undefined;
      if (value === undefined) continue;
      let display: string;
      if (Array.isArray(value)) {
        display = value.map(id => options?.find(option => option.value === id)?.label[input.lang] ?? id).join(', ');
      } else {
        const range = value as PageConditionRange;
        display = `${range.min ?? ''}..${range.max ?? ''}`;
      }
      summary.push({ key, label, value: display });
    }
  }
  return { summary, issues };
}

/** SDK items own declared keys; legacy items for all other keys retain their order. No rendering. */
export function derivePageConditionExtension(input: PageConditionSummaryInput & {
  draft: readonly Pair[];
  applied: readonly Pair[];
  extension?: PageConditionExtension;
  /** Metadata resolved on the applied Context, separately from draft options. */
  appliedOptions?: PageConditionSummaryInput['options'];
  /** Resolve metadata for this exact arbitrary history candidate; never reuse draft metadata. */
  historyOptions?: (global: GlobalContext, page: readonly Pair[]) => PageConditionSummaryInput['options'];
}) {
  const owned = new Set(input.menu.pageConditions?.categories.flatMap(pageConditionKeys) ?? []);
  const legacy = input.extension;
  // Nothing declared: the SDK owns no keys, so keep the legacy fields as they are (an omitted applied summary must stay omitted for the page-head fallback).
  if (owned.size === 0) return { pageSummary: legacy?.pageSummary ?? [], appliedPageSummary: legacy?.appliedPageSummary, issues: legacy?.issues ?? [], historyPageSummary: legacy?.historyPageSummary, historyDrill: legacy?.historyDrill };
  const draft = summarizePageConditions(input, input.draft);
  const applied = summarizePageConditions({ ...input, options: input.appliedOptions }, input.applied);
  const other = <T extends { key: string }>(items: readonly T[] = []) => items.filter(item => !owned.has(item.key));
  return {
    pageSummary: [...draft.summary, ...other(legacy?.pageSummary)],
    appliedPageSummary: [...applied.summary, ...other(legacy?.appliedPageSummary)],
    issues: [...draft.issues, ...other(legacy?.issues)],
    historyPageSummary: (global: GlobalContext, page: readonly Pair[]) => [...summarizePageConditions({ ...input, options: input.historyOptions?.(global, page) }, page).summary, ...other(legacy?.historyPageSummary?.(global, page))],
    historyDrill: legacy?.historyDrill,
  };
}
