import { buildQuery, withoutReturnTo, type GlobalContext, type Pair } from '@ap/contracts';
import { pathFor, routeParamNames, type RouteMatch } from '@ap/kernel';

export type ShareLinkKind = 'menu' | 'conditions';
export type ShareLinkFailure = 'no-route' | 'missing-param' | 'serialize' | 'too-long';
export type ShareLinkResult = { ok: true; href: string } | { ok: false; reason: ShareLinkFailure };

/** Default bound on the copied address; longer addresses are refused, never truncated (06 §6.4 / kernel.md §11). */
export const SHARE_LINK_MAX_LENGTH = 4000;

/**
 * The one serializer behind "share current conditions", "copy menu address" and the VOC repro link (cross-menu-links.md).
 * `menu` = the deployment-aware canonical path with its route params, no query. `conditions` = that path + the v1 query of the
 * APPLIED `global`/`page` pairs: `returnTo` and unregistered extras are never written, and a query-bar draft is not an input here.
 * A failure never degrades to a shorter link: no truncation, no bare-path fallback.
 */
export function buildShareLink({ kind, route, global, page, absoluteUrl, maxLength = SHARE_LINK_MAX_LENGTH }: {
  kind: ShareLinkKind;
  route: Pick<RouteMatch, 'menu' | 'params'> | null;
  global: GlobalContext;
  page: readonly Pair[];
  absoluteUrl: (url: string) => string;
  maxLength?: number;
}): ShareLinkResult {
  if (route === null) return { ok: false, reason: 'no-route' };
  if (routeParamNames(route.menu.path).some(name => !route.params[name])) return { ok: false, reason: 'missing-param' };
  let href: string;
  try {
    href = absoluteUrl(pathFor(route.menu, route.params) + (kind === 'conditions' ? buildQuery(global, withoutReturnTo([...page])) : ''));
  } catch {
    return { ok: false, reason: 'serialize' };
  }
  return href.length > maxLength ? { ok: false, reason: 'too-long' } : { ok: true, href };
}
