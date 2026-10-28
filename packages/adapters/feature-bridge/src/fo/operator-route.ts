import { useMemo } from 'react';
import { usePlatform } from '@ap/kernel';
import type { PlatformTarget, TargetOf } from './links';

export type OperatorRouteSpec = {
  /** The FeedbackOps path, e.g. `/vocs`. */
  foPath: string;
  /** FO keys that must be present with exactly these values, e.g. `{ view: 'inbox' }`. */
  foFixed: Readonly<Record<string, string>>;
  menuId: string;
  /** FO key → platform page key, e.g. `{ selected: 'focus', q: 'q' }`. */
  keys: Readonly<Record<string, string>>;
  /** FO key → a value that means "no value" for it (e.g. `{ managedSystem: 'all' }`): the link is kept and the page key is left absent. */
  foAbsent?: Readonly<Record<string, string>>;
  /** A detail href `foPath/<id>` (one path segment that `pattern` accepts) reads as `foPath` with `key` = the id; `key` is an FO key of `keys`. Any other deeper path stays unmapped. */
  detailPath?: { key: string; pattern: RegExp };
  /** The one `#fragment` the table accepts (e.g. `/admin/settings#coverage`): it reads as page key `key` = `fragment`; any other fragment stays unmapped. A table without `hash` accepts none. */
  hash?: { fragment: string; key: string };
};

export type OperatorRoute = {
  /** The FeedbackOps path this table stands for. */
  foPath: string;
  /** The platform page keys the table maps. */
  pageKeys: readonly string[];
  /** The destination of an FO path+query, or `null` when any key is neither fixed nor mapped (the link stays unlinked rather than dropping state). A `foAbsent` value maps to `null` for its page key: an explicit clear that `linkTo` honours (an omitted key would inherit the carried value). */
  target: TargetOf;
  /** The inverse: a platform page to the FO search it stands for (fixed keys added, unknown page keys ignored). */
  toFoSearch(page: Readonly<Record<string, string | null>>): Record<string, string>;
  /** The inverse of the table's `hash`: `#fragment` when the page carries it, `''` otherwise (and always `''` for a table without `hash`). */
  toFoHash(page: Readonly<Record<string, string | null>>): string;
  /** An FO search fragment as platform page keys (for `navViews`). */
  preset(foSearch: Readonly<Record<string, string>>): Record<string, string>;
  /** The first page key (table order) whose present value (`''` included) `accepts` refuses for its FO key; `null` when every value is accepted (06 §6.4: the caller rejects and preserves it). */
  rejectedKey(pageParam: (key: string) => string | null, accepts: (foKey: string, value: string) => boolean): { key: string; value: string } | null;
};

/** One route table for an operator menu; both directions (FO → page, page → FO) come from it (761 plan P5). */
export function operatorRoute({ foPath, foFixed, menuId, keys, foAbsent = {}, detailPath, hash }: OperatorRouteSpec): OperatorRoute {
  const target = (to: string): PlatformTarget | null => {
    const hashAt = to.indexOf('#');
    if (hashAt !== -1 && (hash === undefined || to.slice(hashAt + 1) !== hash.fragment)) return null;
    const bare = hashAt === -1 ? to : to.slice(0, hashAt);
    const at = bare.indexOf('?');
    const path = at === -1 ? bare : bare.slice(0, at);
    const query = at === -1 ? '' : bare.slice(at + 1);
    const search = new URLSearchParams(query);
    if (path !== foPath) {
      const id = detailPath !== undefined && path.startsWith(`${foPath}/`) ? path.slice(foPath.length + 1) : null;
      if (detailPath === undefined || id === null || !detailPath.pattern.test(id) || search.has(detailPath.key)) return null;
      search.set(detailPath.key, id);
    }
    const seen = [...search.keys()];
    if (new Set(seen).size !== seen.length) return null;
    const page: Record<string, string | null> = {};
    for (const [key, value] of search) {
      if (Object.hasOwn(foFixed, key)) {
        if (foFixed[key] !== value) return null;
      } else if (Object.hasOwn(keys, key)) {
        if (value !== '') page[keys[key]!] = foAbsent[key] === value ? null : value;
      } else return null;
    }
    if (Object.keys(foFixed).some(key => !search.has(key))) return null;
    if (hashAt !== -1 && hash !== undefined) page[hash.key] = hash.fragment;
    return { menuId, page };
  };
  return {
    foPath,
    pageKeys: hash === undefined ? Object.values(keys) : [...Object.values(keys), hash.key],
    target,
    toFoSearch(page) {
      const search: Record<string, string> = { ...foFixed };
      for (const [foKey, pageKey] of Object.entries(keys)) {
        const value = page[pageKey];
        if (value !== undefined && value !== null && value !== '') search[foKey] = value;
      }
      return search;
    },
    toFoHash(page) {
      return hash !== undefined && page[hash.key] === hash.fragment ? `#${hash.fragment}` : '';
    },
    preset(foSearch) {
      const page: Record<string, string> = {};
      for (const [foKey, value] of Object.entries(foSearch)) {
        if (Object.hasOwn(keys, foKey)) page[keys[foKey]!] = value;
      }
      if (hash !== undefined && foSearch[hash.key] === hash.fragment) page[hash.key] = hash.fragment;
      return page;
    },
    rejectedKey(pageParam, accepts) {
      for (const [foKey, pageKey] of Object.entries(keys)) {
        const value = pageParam(pageKey);
        if (value !== null && !accepts(foKey, value)) return { key: pageKey, value };
      }
      if (hash !== undefined) {
        const value = pageParam(hash.key);
        if (value !== null && value !== hash.fragment) return { key: hash.key, value };
      }
      return null;
    },
  };
}

/** A module-level `useSearch` hook for `FeatureBridge`: the current page read through one route table, as FO search strings. */
export function routeSearch(route: OperatorRoute) {
  return function useRouteSearch(): Readonly<Record<string, string>> {
    // `url` and `page` are the kernel values that change with each navigation; the memo is keyed on them so
    // a screen that folds pending writes sees a new object whenever the platform reports a new location.
    const { url, page } = usePlatform();
    return useMemo(() => {
      void url; // read so the navigation identity is a real input of this memo
      const mapped: Record<string, string> = {};
      // First pair wins, as `pageParam` reads it.
      for (const [key, value] of page) if (route.pageKeys.includes(key) && !(key in mapped)) mapped[key] = value;
      return route.toFoSearch(mapped);
    }, [page, url]);
  };
}

/** A module-level `useHere` hook for `FeatureBridge`: the current page as the FeedbackOps path+query(+hash) of this route table. */
export function routeHere(route: OperatorRoute) {
  const useRouteSearch = routeSearch(route);
  return function useRouteHere(): string {
    const search = useRouteSearch();
    const { page } = usePlatform();
    const hash = route.toFoHash(Object.fromEntries([...page].reverse()));
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value !== '') query.set(key, value);
    const text = query.toString();
    return `${text === '' ? route.foPath : `${route.foPath}?${text}`}${hash}`;
  };
}
