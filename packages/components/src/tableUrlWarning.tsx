import { AlertTriangle } from 'lucide-react';
import { invalidValueSentence, useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { parsePageIndex, parseTableSort } from './PlatformDataTable';
import { StateMessage } from './StateView';
import { focusPageFallback } from './pageFocus';

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

/** The shared invalid sort/page message (06 §15): replaces the table, never substitutes a value, Reset clears both keys in one `setPage`. */
export function TableUrlWarning({ sentences }: { sentences: readonly string[] }) {
  const { t } = useI18n();
  const { setPage } = usePlatform();
  return <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
    title={t('invalidTableTitle')}
    body={sentences.map((sentence, index) => <p key={index}>{sentence}</p>)}
    action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); setPage({ sort: null, page: null }); }}>{t('reset')}</Button>} />;
}
