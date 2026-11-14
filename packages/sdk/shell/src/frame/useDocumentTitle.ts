import { useEffect } from 'react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';

/**
 * The browser tab title, written on every route change: `<menu> — <system> · <product>` (layout §7). Status screens use the name their own
 * heading shows (not found, contract error, denied space), so history and bookmarks tell screens apart. Global screens have no system,
 * and a host that passes no product name gets none. The document's initial `<title>` stays the fallback until the first route resolves.
 */
export function useDocumentTitle(productName: string | undefined): void {
  const { route, contractError, currentSpace, platformScreen, can, url } = useHostPlatform();
  const { t, tx, lang } = useI18n();
  let title: string;
  if (platformScreen === 'board') title = lang === 'ko' ? '분석 보드' : 'Analysis board';
  else if (!route) title = t('notFoundTitle');
  else if (contractError) title = t('contractError');
  else if (currentSpace !== null && currentSpace.permission !== undefined && !can(currentSpace.permission)) title = tx(currentSpace.label);
  else {
    const name = tx(route.menu.label);
    const system = currentSpace !== null ? tx(currentSpace.label) : null;
    title = system ? `${name} — ${system}` : name;
  }
  const full = productName ? `${title} · ${productName}` : title;
  useEffect(() => { document.title = full; }, [full, url]);
}
