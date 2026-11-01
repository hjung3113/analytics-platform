import { useEffect, useMemo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { invalidValueSentence, useI18n, usePlatform, type Text } from '@ap/kernel';
import { encodeFilterParams, type ColumnFilter } from '@ap/contracts';
import { encodeTableSort, parsePageIndex, parseTableSort, type TableUrlState } from './PlatformDataTable';
import { FILTER_PROBLEM_CAUSES, readTableFilters, type TableFilterOption, type TableFilterRead } from './tableFilterUrl';
import { StateMessage } from '../StateView';
import { RecoverButton } from '../state/RecoverButton';

/** What is wrong in the address: `sortPage` (default), `filter` (only a condition) or `both`; names the warning's title. */
export type TableUrlWarningCause = 'sortPage' | 'filter' | 'both';
const WARNING_TITLE = { sortPage: 'invalidTableTitle', filter: 'invalidFilterTitle', both: 'invalidTableFilterTitle' } as const;

const GENERIC_FILTER_LABEL: Text = { ko: '필터', en: 'Filter' };

/**
 * §6.1 `sort`/`page` raw values parsed against the page's allowed sort columns, plus the ADR-0034 sentences
 * (user field name + raw value as entered, one sentence per bad field — never `key=value`). Allowed columns stay page-owned.
 *
 * With `filters` (ADR-0105, opt-in) the page's filter key and its legacy keys are read through the codec as well: a bad condition adds
 * one sentence (the field's label from `labels`, else its id; the whole raw condition as entered; a cap names the generic 「필터」),
 * `invalid` covers it, `filterRead` carries the parsed filters and `recoverKeys` the keys the one Reset must clear: `sort`+`page` when
 * either is bad (as before), the filter key + legacy keys when a filter is bad — each only when it is the bad one, so a bad sort never
 * drops the conditions and a bad filter never drops the sort. Without the option nothing here changes.
 */
export function useTableUrlWarning(allowedSort: readonly string[], filters?: TableFilterOption) {
  const { pageParam, pageParams } = usePlatform();
  const { lang, text } = useI18n();
  const sortRaw = pageParam('sort');
  const pageRaw = pageParam('page');
  const parsedSort = parseTableSort(sortRaw, allowedSort);
  const parsedPage = parsePageIndex(pageRaw);
  const values = filters ? pageParams(filters.key) : [];
  const legacyRaw = (filters?.legacy ?? []).map(entry => pageParam(entry.key));
  const signature = JSON.stringify([values, legacyRaw]);
  // The read result is memoised on the raw strings so a re-render never hands the table (and `loadPage`) a new filter array.
  const filterRead: TableFilterRead | null = useMemo(
    () => filters ? readTableFilters(filters, values, legacyRaw) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters` is the page's declaration and the raw strings are its only changing input
    [signature, filters?.key, filters?.specs],
  );
  const filterBad = filterRead !== null && !filterRead.ok;
  const sortPageBad = !parsedSort.ok || !parsedPage.ok;
  const sentences = [
    !parsedSort.ok ? invalidValueSentence(lang, 'value', text('invalidTableSort'), sortRaw ?? '') : null,
    !parsedPage.ok ? invalidValueSentence(lang, 'value', text('invalidTablePage'), pageRaw ?? '') : null,
    ...(filterRead && !filterRead.ok ? filterRead.problems.map(({ field, raw, reason, detail }) => {
      const name = field === '' ? GENERIC_FILTER_LABEL : { ko: filters?.labels?.[field] ?? field, en: filters?.labels?.[field] ?? field };
      return `${invalidValueSentence(lang, 'filter', name, raw)} ${(detail ?? FILTER_PROBLEM_CAUSES[reason])[lang]}`;
    }) : []),
  ].filter((sentence): sentence is string => sentence !== null);
  const recoverKeys = [
    ...(sortPageBad || !filterBad ? ['sort', 'page'] : []),
    ...(filterBad && filters ? [filters.key, ...(filters.legacy ?? []).map(entry => entry.key)] : []),
  ];
  // Which part is bad, for the warning's title: only the filter, only sort/page, or both.
  const cause: TableUrlWarningCause = filterBad ? (sortPageBad ? 'both' : 'filter') : 'sortPage';
  return { parsedSort, parsedPage, filterRead, invalid: sortPageBad || filterBad, sentences, recoverKeys, cause };
}

/** Why the table asked for a sort/page write (`TableUrlState.onChange`'s reason). */
export type TableUrlChangeReason = Parameters<TableUrlState['onChange']>[1];

/**
 * `useTableUrlWarning` plus the controlled `urlState` for `PlatformDataTable` (§6.1): `undefined` while sort or page is invalid
 * (the page shows `TableUrlWarning` instead), else the parsed values (page 1 kept off the URL as `null`) and one `onChange` that
 * writes `sort` and `page` in one `setPage` — a `replace` entry only for the table's own `clamp`, a history entry otherwise.
 * `extraPatch(reason)` adds page-owned keys to that same write (e.g. closing the focused row on a user sort/page change).
 *
 * `filters` (ADR-0105, opt-in): the page's repeated (and normally hidden) filter key. `urlState` then also carries `filters`, and an
 * `onChange` that carries `filters` writes the encoded conditions (one value each; none removes the key) together with `page` in the
 * same `setPage`, clearing the legacy keys too. A change without `filters` (sort, page, clamp) leaves the filter key alone. Present
 * legacy keys are rewritten once into the filter key with `replace`. A bad filter state makes `urlState` `undefined` like a bad sort.
 */
export function useTableUrlState(
  allowedSort: readonly string[],
  options?: { extraPatch?: (reason: TableUrlChangeReason) => Record<string, string | null> | undefined; filters?: TableFilterOption },
) {
  const filterOption = options?.filters;
  const warning = useTableUrlWarning(allowedSort, filterOption);
  const { setPage } = usePlatform();
  const { parsedSort, parsedPage, filterRead } = warning;
  const extraPatch = options?.extraPatch;
  const legacyKeys = (filterOption?.legacy ?? []).map(entry => entry.key);
  const rewrite = filterOption && filterRead?.ok && filterRead.legacyPresent ? { key: filterOption.key, values: encodeFilterParams(filterRead.filters) } : null;
  const rewriteSignature = rewrite ? JSON.stringify([rewrite, legacyKeys]) : null;
  useEffect(() => {
    if (!rewrite) return;
    setPage({ [rewrite.key]: rewrite.values, ...Object.fromEntries(legacyKeys.map(key => [key, null])) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per distinct legacy state; `rewriteSignature` is that state
  }, [rewriteSignature]);
  const filterWrite = filterOption ? (filters: readonly ColumnFilter[]) => ({
    [filterOption.key]: encodeFilterParams(filters),
    ...Object.fromEntries(legacyKeys.map(key => [key, null])),
  }) : null;
  const urlState: TableUrlState | undefined = parsedSort.ok && parsedPage.ok && (!filterRead || filterRead.ok) ? {
    page: parsedPage.page === 1 ? null : parsedPage.page,
    sorting: parsedSort.sorting,
    ...(filterRead?.ok ? { filters: filterRead.filters } : {}),
    ...(filterOption?.validate ? { validate: filterOption.validate } : {}),
    onChange: ({ page, sorting, filters }, reason) => setPage(
      { sort: encodeTableSort(sorting), page: page === null ? null : String(page), ...(filters && filterWrite ? filterWrite(filters) : {}), ...extraPatch?.(reason) },
      { replace: reason === 'clamp' },
    ),
  } : undefined;
  return { ...warning, urlState };
}

/**
 * One page key the screen accepts: its user-facing field name and the check of a present raw value (an absent key is always fine).
 * `key` must be one of the menu's `pageKeys`: `pageParam` reads nothing else, so a rule for another key never fires.
 */
export type PageKeyRule = { key: string; label: Text; valid: (raw: string) => boolean };

/**
 * Rejects malformed page keys, never corrects them (06 §6, ADR-0034), shaped like `useTableUrlWarning`: `invalid` is true when
 * a present key fails its rule, `sentences` holds one sentence per bad key (field name + raw value as entered), `badKeys` are
 * those keys and `recover` clears exactly them in one `setPage`. While `invalid` the screen sends no query and shows `PageKeyWarning`.
 */
export function usePageKeyRules(rules: readonly PageKeyRule[]): { invalid: boolean; sentences: string[]; badKeys: string[]; recover: () => void } {
  const { pageParam, setPage } = usePlatform();
  const { lang } = useI18n();
  const bad = rules.flatMap(rule => {
    const raw = pageParam(rule.key);
    return raw === null || rule.valid(raw) ? [] : [{ rule, raw }];
  });
  const badKeys = bad.map(({ rule }) => rule.key);
  return {
    invalid: bad.length > 0,
    sentences: bad.map(({ rule, raw }) => invalidValueSentence(lang, 'value', rule.label, raw)),
    badKeys,
    recover: () => setPage(Object.fromEntries(badKeys.map(key => [key, null]))),
  };
}

function UrlWarning({ title, sentences, action, filters }: { title: string; sentences: readonly string[]; action: ReactNode; filters?: ReactNode }) {
  const message = <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
    title={title}
    body={sentences.map((sentence, index) => <p key={index}>{sentence}</p>)}
    action={action} />;
  return filters ? <div className="flex flex-col gap-3">{filters}{message}</div> : message;
}

/**
 * The shared invalid sort/page message (06 §15): replaces the table, never substitutes a value, Reset clears both keys in one `setPage`.
 * `recoverKeys` (`useTableUrlWarning().recoverKeys`) narrows or widens that one write to exactly the bad keys when the page opted into URL filters (ADR-0105); the default is `sort` and `page`.
 * `cause` (`useTableUrlWarning().cause`) names the title after what is actually wrong: sort/page (default), only a filter condition, or both.
 * `filters` is the management layout's filter slot (the `필터 · n` control when the rail is hidden); it renders above the message with the toolbar's gap.
 */
export function TableUrlWarning({ sentences, filters, recoverKeys = ['sort', 'page'], cause = 'sortPage' }: { sentences: readonly string[]; filters?: ReactNode; recoverKeys?: readonly string[]; cause?: TableUrlWarningCause }) {
  const { t } = useI18n();
  const { setPage } = usePlatform();
  return <UrlWarning title={t(WARNING_TITLE[cause])} sentences={sentences} filters={filters}
    action={<RecoverButton onRecover={() => setPage(Object.fromEntries(recoverKeys.map(key => [key, null])))} />} />;
}

/**
 * The rejected page-key message of a screen (06 §6, ADR-0034): one sentence per bad key
 * (`usePageKeyRules().sentences`), and a Reset that clears exactly those keys (`recover`) after focus moved off the button.
 */
export function PageKeyWarning({ sentences, onRecover, filters }: { sentences: readonly string[]; onRecover: () => void; filters?: ReactNode }) {
  const { t } = useI18n();
  return <UrlWarning title={t('invalidFilterTitle')} sentences={sentences} filters={filters} action={<RecoverButton onRecover={onRecover} />} />;
}
