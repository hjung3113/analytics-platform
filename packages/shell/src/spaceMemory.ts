// THROWAWAY #250 — never merge.
import { parseQuery, type Permission, type SpaceId } from '@ap/contracts';
import type { Registry } from '@ap/kernel';

const URL_KEY = 'platform:proto-250:last-space-url';
const ID_KEY = 'platform:proto-250:last-space-id';

export function readLastUrls(): Partial<Record<SpaceId, string>> {
  try {
    const raw = sessionStorage.getItem(URL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<SpaceId, string>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export function writeLastUrl(spaceId: SpaceId, url: string) {
  try {
    sessionStorage.setItem(URL_KEY, JSON.stringify({ ...readLastUrls(), [spaceId]: url }));
    sessionStorage.setItem(ID_KEY, spaceId);
  } catch { /* private mode */ }
}

export function readLastSpaceId(): string | null {
  try { return sessionStorage.getItem(ID_KEY); } catch { return null; }
}

/** Last in-space URL if it still matches that space and the user may open it; otherwise the space home. Globals come from linkTo, same as switchSpace. */
export function restoreHref(
  registry: Registry,
  spaceId: SpaceId,
  can: (permission: Permission) => boolean,
  linkTo: (menuId: string, options?: { params?: Record<string, string>; page?: Record<string, string> }) => string,
): string {
  const space = registry.spaces.find(s => s.id === spaceId);
  const home = () => (space ? linkTo(space.homeMenuId) : '/');
  if (!space) return home();
  if (space.permission && !can(space.permission)) return home();
  const stored = readLastUrls()[spaceId];
  if (!stored) return home();
  const q = stored.indexOf('?');
  const path = (q === -1 ? stored : stored.slice(0, q)) || '/';
  const search = q === -1 ? '' : stored.slice(q);
  if (path === '/') return home();
  const match = registry.matchRoute(path);
  if (!match || registry.spaceOf(match.menu).id !== spaceId || !can(match.menu.permission)) return home();
  try {
    const parsed = parseQuery(search, match.menu.pageKeys);
    return linkTo(match.menu.id, { params: match.params, page: Object.fromEntries(parsed.page) });
  } catch { return home(); }
}
