import { type GroupDef, type MenuEntry, usePlatform } from '@ap/kernel';

export type SystemSection = { group: GroupDef; items: MenuEntry[] };

/**
 * Sections (= groups with a visible menu) of the current business system (15 §3.2, ADR-0042).
 * `null` unless the matched route's space is the one the sidebar draws: global screens, unmatched paths and
 * space-entry denials keep their fallback sidebar but have no current system, so no section is active (B5).
 */
export function useSystemSections(): { sections: SystemSection[]; currentGroupId: string | null } | null {
  const { currentSpace, sidebarSpace, route, visibleMenus, registry } = usePlatform();
  if (currentSpace === null || sidebarSpace?.id !== currentSpace.id || route === null) return null;
  const sections = registry.groups.filter(group => group.space === currentSpace.id)
    .map(group => ({ group, items: visibleMenus.filter(menu => !menu.navHidden && menu.group === group.id) }))
    .filter(section => section.items.length > 0);
  // A hidden detail screen keeps its parent menu's section active.
  const activeMenu = route.menu.navHidden && route.menu.parent ? registry.menuById(route.menu.parent) : route.menu;
  return { sections, currentGroupId: activeMenu.group };
}

/** First menu a section button opens: the first visible one that needs no path parameter. */
export function firstOpenableMenu(items: readonly MenuEntry[]): MenuEntry {
  return items.find(menu => !menu.path.split('/').some(segment => segment.startsWith(':'))) ?? items[0]!;
}
