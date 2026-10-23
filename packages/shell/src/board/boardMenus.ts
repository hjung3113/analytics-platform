import { pathFor, routeParamNames, type MenuEntry, type Registry } from '@ap/kernel';
import { hasDotSegment, type PaneScreen } from '@ap/kernel/host';

/** Menus a pane may hold from an empty pane: board-declared, listed in navigation, and with no route parameter to ask for. */
export function isBoardPlaceable(menu: MenuEntry): boolean {
  return menu.features.board === true && !menu.navHidden && routeParamNames(menu.path).length === 0;
}

/** `분석 화면 넣기` list and the rail entry's visibility share this one rule (docs/16 §4, §6). */
export function placeableMenus(registry: Registry, canOpen: (menuId: string) => boolean): MenuEntry[] {
  return registry.menus.filter(menu => isBoardPlaceable(menu) && canOpen(menu.id));
}

/**
 * Whether a saved pane screen may be mounted (docs/16 §7, PaneScreenProvider's preconditions): the menu is registered, declares
 * board support, and its params build a path that matches the same menu and params again. Never throws.
 * A registered board menu the user cannot open is admitted: the pane shows the permission state itself.
 */
export function admitPaneScreen(registry: Registry, screen: PaneScreen): boolean {
  const menu = registry.menus.find(m => m.id === screen.menuId);
  if (!menu || menu.features.board !== true) return false;
  if (!routeParamNames(menu.path).every(name => typeof screen.params[name] === 'string' && screen.params[name] !== '')) return false;
  let path: string;
  try { path = pathFor(menu, screen.params); } catch { return false; }
  if (hasDotSegment(path)) return false;
  const matched = registry.matchRoute(path);
  if (!matched || matched.menu.id !== menu.id) return false;
  const names = routeParamNames(menu.path);
  const extra = Object.keys(screen.params).some(key => !names.includes(key));
  return !extra && names.every(name => matched.params[name] === screen.params[name]);
}

/**
 * Whether a saved pane's menu screen would actually mount its page: admitted, and both the space entry and the menu permission pass
 * (the gate order of `ScreenOutlet`). The pane's Context bar uses it so a denied pane asks for nothing.
 */
export function canMountPaneScreen(registry: Registry, canOpen: (menuId: string) => boolean, screen: PaneScreen): boolean {
  return admitPaneScreen(registry, screen) && canOpen(screen.menuId);
}
