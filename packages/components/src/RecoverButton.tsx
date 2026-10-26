import type { MouseEvent } from 'react';
import { useI18n } from '@ap/kernel';
import { Button } from '@ap/ui';
import { focusPageFallback } from './pageFocus';

/**
 * The reset action of a rejected-value message (06 §26): it disappears with the message, so focus moves to the page fallback
 * first, then `onRecover` clears the keys. `label` defaults to `초기화`/`Reset`.
 */
export function RecoverButton({ onRecover, label }: { onRecover: () => void; label?: string }) {
  const { t } = useI18n();
  const recover = (event: MouseEvent<HTMLButtonElement>) => { focusPageFallback(event.currentTarget); onRecover(); };
  return <Button type="button" size="sm" variant="secondary" onClick={recover}>{label ?? t('reset')}</Button>;
}
