import { FilterUrlWarning, focusPageFallback } from '@ap/components';
import { useI18n } from '@ap/kernel';
import { Button } from '@ap/ui';

/** The invalid `sort`/`trend`/`row` message of the HW Time screens: replaces the body, Reset clears exactly the bad keys after focus moved off the button (06 §26). */
export function HwTimeUrlWarning({ sentences, onRecover }: { sentences: readonly string[]; onRecover: () => void }) {
  const { t } = useI18n();
  return <FilterUrlWarning sentences={sentences}
    recover={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); onRecover(); }}>{t('reset')}</Button>} />;
}
