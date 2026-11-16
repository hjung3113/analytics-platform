import { pathFor, routeParamNames, withPagePreset, type Registry } from '../registry/registry';
import type { Recent } from './types';

/**
 * Stored menu references that name a retired id (`createRegistry({ retiredMenus })`, #2330) now name its successor. Both normalizers
 * keep the first entry per menu id and return the same list when nothing changed, so the stable identities of #1671 hold.
 */
export function favoritesWithSuccessors(registry: Registry, list: string[]): string[] {
  if (!list.some(id => registry.successorOf(id) !== null)) return list;
  const out: string[] = [];
  for (const id of list) {
    const next = registry.successorOf(id)?.menu.id ?? id;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/**
 * A recent visit of a retired id opens its successor: the stored address through `canonicalHref` (the id's old addresses are aliases of
 * the successor), else the successor's own path with the stored search. A successor that needs route params it cannot get is dropped.
 */
export function recentWithSuccessors(registry: Registry, list: Recent[]): Recent[] {
  if (!list.some(r => registry.successorOf(r.menuId) !== null)) return list;
  const out: Recent[] = [];
  for (const r of list) {
    const successor = registry.successorOf(r.menuId);
    let next: Recent | null = r;
    if (successor !== null) {
      const href = registry.canonicalHref(r.url);
      const q = href.indexOf('?');
      const search = q === -1 ? '' : href.slice(q);
      if (registry.matchRoute(q === -1 ? href : href.slice(0, q))?.menu.id === successor.menu.id) next = { ...r, menuId: successor.menu.id, url: href };
      else if (routeParamNames(successor.menu.path).length === 0) next = { ...r, menuId: successor.menu.id, url: pathFor(successor.menu) + withPagePreset(search, successor.page) };
      else next = null;
    }
    if (next !== null && !out.some(o => o.menuId === next.menuId)) out.push(next);
  }
  return out;
}
