/** Shell adapter only; the underlying codec keeps the original Python route profile. */
import { ContractError, contextLink, parseUrl, serialize, type ContextState } from './codec';
import { equipmentDetail, menus, type MenuEntry, type PageEntry } from './registry';
const detailCodecPrefix = '/prototype/equipment/';
/** Page-owned key on the detail URL: the exact origin URL to restore on Back (§6.4). Not registered, so the codec keeps it as an extra. */
export const RETURN_KEY = 'returnTo';
export function readLocation(url: string): { menu: PageEntry; context: ContextState } {
  const path = url.split('?')[0];
  // The destination ID is a path segment, so the codec parses it apart from the Selection query keys.
  if (path.startsWith(equipmentDetail.pathPrefix)) return { menu: equipmentDetail, context: parseUrl(detailCodecPrefix + url.slice(equipmentDetail.pathPrefix.length)) };
  const menu = menus.find(item => item.path === path);
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  // Validate version before rejecting an unregistered fixture route.
  const context = parseUrl('/prototype/context' + query);
  if (!menu) throw new ContractError('invalid_route', 'Use a registered synthetic fixture route.');
  return { menu, context };
}
export function writeLocation(page: PageEntry, context: ContextState, transfer = false): string {
  if ('pathPrefix' in page) return page.pathPrefix + serialize(context).slice(detailCodecPrefix.length);
  const url = transfer ? contextLink(context, 'context') : serialize(context);
  return page.path + url.slice(url.indexOf('?'));
}
/** Context Link to the detail destination: registered Context transfers as-is, the destination never touches Selection, and the origin URL rides along for Back. */
export function detailLink(originUrl: string, context: ContextState, destination: string): string {
  const link = parseUrl(contextLink(context, 'equipment', destination));
  return writeLocation(equipmentDetail, { ...link, extras: [[RETURN_KEY, originUrl]] });
}
/** Back target only when it is exactly one local URL of a registered menu; anything else (external, detail, malformed) is refused rather than guessed. */
export function returnTarget(context: ContextState): { menu: MenuEntry; url: string } | null {
  const values = context.extras.filter(([key]) => key === RETURN_KEY);
  if (values.length !== 1) return null;
  try {
    const { menu } = readLocation(values[0][1]);
    return 'path' in menu ? { menu, url: values[0][1] } : null;
  } catch { return null; }
}
