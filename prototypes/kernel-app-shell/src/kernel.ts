/** Shell adapter only; the underlying codec keeps the original Python route profile. */
import { ContractError, contextLink, parseUrl, serialize, type ContextState } from './codec';
import { menus, type MenuEntry } from './registry';
export function readLocation(url: string): { menu: MenuEntry; context: ContextState } {
  const path = url.split('?')[0];
  const menu = menus.find(item => item.path === path);
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  // Validate version before rejecting an unregistered fixture route.
  const context = parseUrl('/prototype/context' + query);
  if (!menu) throw new ContractError('invalid_route', 'Use a registered synthetic fixture route.');
  return { menu, context };
}
export function writeLocation(menu: MenuEntry, context: ContextState, transfer = false): string {
  const url = transfer ? contextLink(context, 'context') : serialize(context);
  return menu.path + url.slice(url.indexOf('?'));
}
