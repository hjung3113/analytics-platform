import { useMemo } from 'react';
import { type GroupDef, type MenuEntry, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';

export type PlatformMenuSection = { group: GroupDef; items: MenuEntry[] };

/**
 * Platform destinations (ADR-0070): the openable menus of every global group (`space: null`), in group order.
 * Judged only by each menu's own permission; they are never spaces. The `/` menu is shown as `홈`.
 */
export function usePlatformMenu(): { sections: PlatformMenuSection[]; labelOf: (menu: MenuEntry) => string } {
  const { registry, globalMenus, resolveLink } = useHostPlatform();
  const { t, tx } = useI18n();
  const homeId = registry.matchRoute('/')?.menu.id;
  const sections = useMemo(() => registry.groups.filter(group => group.space === null)
    .map(group => ({ group, items: globalMenus.filter(menu => menu.group === group.id && !menu.navHidden && resolveLink(menu.id).allowed) }))
    .filter(section => section.items.length > 0), [registry, globalMenus, resolveLink]);
  return { sections, labelOf: menu => menu.id === homeId ? t('home') : tx(menu.label) };
}
