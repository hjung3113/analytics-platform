import { useEffect } from 'react';
import { useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';

/**
 * The browser tab title, written on every route change: `<menu> — <system> · <product>` (layout §7). Status screens use the name their own
 * heading shows (not found, contract error, denied space), so history and bookmarks tell screens apart. Global screens have no system,
 * and a host that passes no product name gets none. The document's initial `<title>` stays the fallback until the first route resolves.
 */
export function useDocumentTitle(productName: string | undefined): void {
  const { route, contractError, currentSpace, platformScreen, can, url } = useHostPlatform();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  let title: string;
  if (platformScreen === 'board') title = m('documentTitleBoard');
  else if (!route) title = t('notFoundTitle');
  else if (contractError) title = t('contractError');
  else if (currentSpace !== null && currentSpace.permission !== undefined && !can(currentSpace.permission)) title = tx(currentSpace.label);
  else {
    const name = tx(route.menu.label);
    const system = currentSpace !== null ? tx(currentSpace.label) : null;
    title = system ? `${system} · ${name}` : name;
  }
  const full = productName ? `${title} · ${productName}` : title;
  useEffect(() => { document.title = full; }, [full, url]);
}
