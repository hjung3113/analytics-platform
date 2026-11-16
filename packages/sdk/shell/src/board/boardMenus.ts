import { pathFor, routeParamNames, withPagePreset, type MenuEntry, type MenuSuccessor, type Registry } from '@ap/kernel';
import { hasDotSegment, type PaneScreen } from '@ap/kernel/host';
import type { Board } from './boardTypes';

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

/**
 * A saved pane screen of a retired menu id as its successor's screen (`createRegistry({ retiredMenus })`, #2330): the successor's id, the
 * same params, and the retired id's page preset added to the query where the query does not hold the key. Null when the id is not retired.
 */
export function successorScreen(registry: Registry, screen: PaneScreen): PaneScreen | null {
  const successor = registry.successorOf(screen.menuId);
  return successor === null ? null : { menuId: successor.menu.id, params: successorParams(registry, successor, screen.params), query: withPagePreset(screen.query, successor.page) };
}

/**
 * Stored params of a retired id in the successor's parameter names: the old address whose parameters are exactly the stored keys is built
 * and matched, as a visit to that address would be. Params the successor already names, or that no old address fits, are kept as they
 * are (a pane that cannot be admitted then shows the removed-menu state).
 */
function successorParams(registry: Registry, successor: MenuSuccessor, params: Record<string, string>): Record<string, string> {
  const keys = Object.keys(params);
  const fits = (names: string[]) => names.length === keys.length && names.every(name => typeof params[name] === 'string' && params[name] !== '');
  if (fits(routeParamNames(successor.menu.path))) return params;
  for (const template of successor.paths) {
    if (!fits(routeParamNames(template))) continue;
    const path = template.split('/').map(segment => (segment.startsWith(':') ? encodeURIComponent(params[segment.slice(1)]!) : segment)).join('/');
    const matched = registry.matchRoute(path);
    if (matched?.menu.id === successor.menu.id) return matched.params;
  }
  return params;
}

/** The board with every pane screen (and the screen `뒤로` returns to) of a retired id moved to its successor; the same board when none is. */
export function boardWithSuccessors(registry: Registry, board: Board): Board {
  const move = (screen: PaneScreen | null) => (screen === null ? null : successorScreen(registry, screen));
  if (!board.sheets.some(sheet => sheet.panes.some(slot => move(slot.screen) !== null || move(slot.previous) !== null))) return board;
  return { ...board, sheets: board.sheets.map(sheet => ({ ...sheet, panes: sheet.panes.map(slot => ({ ...slot, screen: move(slot.screen) ?? slot.screen, previous: move(slot.previous) ?? slot.previous })) })) };
}
