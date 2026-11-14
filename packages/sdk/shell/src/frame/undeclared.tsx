import type { ComponentType, ReactNode } from 'react';
import type { SpaceDef } from '@ap/contracts';
import type { GroupDef, MenuEntry, UndeclaredMenu } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { ShellBoundary } from './ShellBoundary';

// Operator-only diagnostics (#1846, #2201): a menu no server declaration grants to anyone is not in `visibleMenus`; the app's `undeclaredMenus` list
// draws it greyed where it would be, and a section or space whose menus are ALL such is drawn greyed too (06 §7, operator exception).
// Sidebar, rail and switcher only: the palette, favorites, recents, resume and every access check read `visibleMenus`, which never holds these.

const NO_UNDECLARED: readonly UndeclaredMenu[] = [];
export type UndeclaredRender = (list: readonly UndeclaredMenu[]) => ReactNode;
const NoUndeclared = ({ children }: { children: UndeclaredRender }) => <>{children(NO_UNDECLARED)}</>;
/** The app's operator-only list wraps its region once (`undeclaredMenus.Read`); when it throws, the same region renders without those entries (#1876 shape). */
export function UndeclaredBoundary({ children }: { children: UndeclaredRender }) {
  return <ShellBoundary fallback={<NoUndeclared>{children}</NoUndeclared>}><UndeclaredHostSlot>{children}</UndeclaredHostSlot></ShellBoundary>;
}
function UndeclaredHostSlot({ children }: { children: UndeclaredRender }) {
  const { slots } = useHostPlatform();
  const Host: ComponentType<{ children: UndeclaredRender }> = slots.undeclaredMenus?.Read ?? NoUndeclared;
  return <Host>{children}</Host>;
}

export type UndeclaredEntry = { menu: MenuEntry; undeclaredPermission: string };
/** The listed menus of one group that the actor cannot see; a listed menu the actor can actually see, a detail screen (`navHidden`) and an unknown id never count. */
function undeclaredIn(groupId: string, undeclared: readonly UndeclaredMenu[], menus: readonly MenuEntry[], shown: ReadonlySet<string>): UndeclaredEntry[] {
  const found: UndeclaredEntry[] = [];
  for (const { menuId, permission } of undeclared) {
    const menu = menus.find(m => m.id === menuId);
    if (menu !== undefined && menu.group === groupId && !menu.navHidden && !shown.has(menu.id)) found.push({ menu, undeclaredPermission: permission });
  }
  return found;
}

/** The group's visible rows plus its undeclared ones in Registry order. */
export function withUndeclared(items: readonly MenuEntry[], groupId: string, undeclared: readonly UndeclaredMenu[], menus: readonly MenuEntry[], order: ReadonlyMap<string, number>): (MenuEntry | UndeclaredEntry)[] {
  if (undeclared.length === 0) return [...items];
  const extra = undeclaredIn(groupId, undeclared, menus, new Set(items.map(menu => menu.id)));
  if (extra.length === 0) return [...items];
  const rank = (entry: MenuEntry | UndeclaredEntry) => order.get('undeclaredPermission' in entry ? entry.menu.id : entry.id) ?? 0;
  return [...items, ...extra].sort((a, b) => rank(a) - rank(b));
}

/** Distinct permission keys of a section or space, in listing order, for its name. */
const permissionsOf = (entries: readonly UndeclaredEntry[]) => [...new Set(entries.map(entry => entry.undeclaredPermission))].join(', ');

export type UndeclaredSection = { group: GroupDef; permissions: string };
/** Groups of `spaceId` with no visible menu and at least one undeclared one, in Registry order (the rail's dimmed section buttons). */
export function undeclaredOnlySections(spaceId: string, groups: readonly GroupDef[], menus: readonly MenuEntry[], visibleMenus: readonly MenuEntry[], undeclared: readonly UndeclaredMenu[]): UndeclaredSection[] {
  if (undeclared.length === 0) return [];
  return groups.filter(group => group.space === spaceId && !visibleMenus.some(menu => !menu.navHidden && menu.group === group.id)).flatMap(group => {
    const found = undeclaredIn(group.id, undeclared, menus, new Set());
    return found.length === 0 ? [] : [{ group, permissions: permissionsOf(found) }];
  });
}

export type UndeclaredSpace = { space: SpaceDef; permissions: string };
/** Spaces the actor cannot enter that have no visible menu and at least one undeclared one (the switcher's dimmed cards). */
export function undeclaredOnlySpaces(spaces: readonly SpaceDef[], accessible: readonly SpaceDef[], groups: readonly GroupDef[], menus: readonly MenuEntry[], visibleMenus: readonly MenuEntry[], undeclared: readonly UndeclaredMenu[]): UndeclaredSpace[] {
  if (undeclared.length === 0) return [];
  return spaces.filter(space => !accessible.some(open => open.id === space.id)).flatMap(space => {
    const own = groups.filter(group => group.space === space.id);
    if (own.some(group => visibleMenus.some(menu => !menu.navHidden && menu.group === group.id))) return [];
    const found = own.flatMap(group => undeclaredIn(group.id, undeclared, menus, new Set()));
    return found.length === 0 ? [] : [{ space, permissions: permissionsOf(found) }];
  });
}
