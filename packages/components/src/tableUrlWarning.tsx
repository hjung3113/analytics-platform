import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { invalidValueSentence, useI18n, usePlatform, type Text } from '@ap/kernel';
import { encodeTableSort, parsePageIndex, parseTableSort, type TableUrlState } from './PlatformDataTable';
import { StateMessage } from './StateView';
import { RecoverButton } from './RecoverButton';

/**
 * §6.1 `sort`/`page` raw values parsed against the page's allowed sort columns, plus the ADR-0034 sentences
 * (user field name + raw value as entered, one sentence per bad field — never `key=value`). Allowed columns stay page-owned.
 */
export function useTableUrlWarning(allowedSort: readonly string[]) {
  const { pageParam } = usePlatform();
  const { lang, text } = useI18n();
  const sortRaw = pageParam('sort');
  const pageRaw = pageParam('page');
  const parsedSort = parseTableSort(sortRaw, allowedSort);
  const parsedPage = parsePageIndex(pageRaw);
  const sentences = [
    !parsedSort.ok ? invalidValueSentence(lang, 'value', text('invalidTableSort'), sortRaw ?? '') : null,
    !parsedPage.ok ? invalidValueSentence(lang, 'value', text('invalidTablePage'), pageRaw ?? '') : null,
  ].filter((sentence): sentence is string => sentence !== null);
  return { parsedSort, parsedPage, invalid: !parsedSort.ok || !parsedPage.ok, sentences };
}

/** Why the table asked for a sort/page write (`TableUrlState.onChange`'s reason). */
export type TableUrlChangeReason = Parameters<TableUrlState['onChange']>[1];

/**
 * `useTableUrlWarning` plus the controlled `urlState` for `PlatformDataTable` (§6.1): `undefined` while sort or page is invalid
 * (the page shows `TableUrlWarning` instead), else the parsed values (page 1 kept off the URL as `null`) and one `onChange` that
 * writes `sort` and `page` in one `setPage` — a `replace` entry only for the table's own `clamp`, a history entry otherwise.
 * `extraPatch(reason)` adds page-owned keys to that same write (e.g. closing the focused row on a user sort/page change).
 */
export function useTableUrlState(
  allowedSort: readonly string[],
  options?: { extraPatch?: (reason: TableUrlChangeReason) => Record<string, string | null> | undefined },
) {
  const warning = useTableUrlWarning(allowedSort);
  const { setPage } = usePlatform();
  const { parsedSort, parsedPage } = warning;
  const extraPatch = options?.extraPatch;
  const urlState: TableUrlState | undefined = parsedSort.ok && parsedPage.ok ? {
    page: parsedPage.page === 1 ? null : parsedPage.page,
    sorting: parsedSort.sorting,
    onChange: ({ page, sorting }, reason) => setPage(
      { sort: encodeTableSort(sorting), page: page === null ? null : String(page), ...extraPatch?.(reason) },
      { replace: reason === 'clamp' },
    ),
  } : undefined;
  return { ...warning, urlState };
}

/** One page key the screen accepts: its user-facing field name and the check of a present raw value (an absent key is always fine). */
export type PageKeyRule = { key: string; label: Text; valid: (raw: string) => boolean };

/**
 * Rejects malformed page keys, never corrects them (06 §6, ADR-0034): `invalid` is `null` when every present key passes,
 * else one sentence per bad key (field name + raw value as entered). `badKeys` are those keys and `recover` clears exactly
 * them in one `setPage`. While `invalid` is set the screen sends no query and shows `PageKeyWarning`.
 */
export function usePageKeyRules(rules: readonly PageKeyRule[]): { invalid: string[] | null; badKeys: string[]; recover: () => void } {
  const { pageParam, setPage } = usePlatform();
  const { lang } = useI18n();
  const bad = rules.flatMap(rule => {
    const raw = pageParam(rule.key);
    return raw === null || rule.valid(raw) ? [] : [{ rule, raw }];
  });
  const badKeys = bad.map(({ rule }) => rule.key);
  return {
    invalid: bad.length === 0 ? null : bad.map(({ rule, raw }) => invalidValueSentence(lang, 'value', rule.label, raw)),
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
 * `filters` is the management layout's filter slot (the `필터 · n` control when the rail is hidden); it renders above the message with the toolbar's gap.
 */
export function TableUrlWarning({ sentences, filters }: { sentences: readonly string[]; filters?: ReactNode }) {
  const { t } = useI18n();
  const { setPage } = usePlatform();
  return <UrlWarning title={t('invalidTableTitle')} sentences={sentences} filters={filters}
    action={<RecoverButton onRecover={() => setPage({ sort: null, page: null })} />} />;
}

/**
 * The shared invalid filter-key message of a management screen: same frame as `TableUrlWarning`, one ADR-0034 sentence per bad
 * key. `recover` is the screen's reset action — `useManagementFilters().recoverButton`, which moves focus to main first (06 §26).
 */
export function FilterUrlWarning({ sentences, filters, recover }: { sentences: readonly string[]; filters?: ReactNode; recover: ReactNode }) {
  const { t } = useI18n();
  return <UrlWarning title={t('invalidFilterTitle')} sentences={sentences} filters={filters} action={recover} />;
}

/**
 * The rejected page-key message of a screen (06 §6, ADR-0034): the same frame as `FilterUrlWarning`, one sentence per bad key
 * (`usePageKeyRules().invalid`), and a Reset that clears exactly those keys (`recover`) after focus moved off the button.
 */
export function PageKeyWarning({ sentences, onRecover, filters }: { sentences: readonly string[]; onRecover: () => void; filters?: ReactNode }) {
  return <FilterUrlWarning sentences={sentences} filters={filters} recover={<RecoverButton onRecover={onRecover} />} />;
}
