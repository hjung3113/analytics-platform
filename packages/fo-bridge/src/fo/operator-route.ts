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
};

export type OperatorRoute = {
  /** The FeedbackOps path this table stands for. */
  foPath: string;
  /** The platform page keys the table maps. */
  pageKeys: readonly string[];
  /** The destination of an FO path+query, or `null` when any key is neither fixed nor mapped (the link stays unlinked rather than dropping state). */
  target: TargetOf;
  /** The inverse: a platform page to the FO search it stands for (fixed keys added, unknown page keys ignored). */
  toFoSearch(page: Readonly<Record<string, string>>): Record<string, string>;
  /** An FO search fragment as platform page keys (for `navViews`). */
  preset(foSearch: Readonly<Record<string, string>>): Record<string, string>;
};

/** One route table for an operator menu; both directions (FO → page, page → FO) come from it (761 plan P5). */
export function operatorRoute({ foPath, foFixed, menuId, keys }: OperatorRouteSpec): OperatorRoute {
  const target = (to: string): PlatformTarget | null => {
    if (to.includes('#')) return null;
    const at = to.indexOf('?');
    const path = at === -1 ? to : to.slice(0, at);
    const query = at === -1 ? '' : to.slice(at + 1);
    if (path !== foPath) return null;
    const search = new URLSearchParams(query);
    const seen = [...search.keys()];
    if (new Set(seen).size !== seen.length) return null;
    const page: Record<string, string> = {};
    for (const [key, value] of search) {
      if (Object.hasOwn(foFixed, key)) {
        if (foFixed[key] !== value) return null;
      } else if (Object.hasOwn(keys, key)) {
        if (value !== '') page[keys[key]!] = value;
      } else return null;
    }
    if (Object.keys(foFixed).some(key => !search.has(key))) return null;
    return { menuId, page };
  };
  return {
    foPath,
    pageKeys: Object.values(keys),
    target,
    toFoSearch(page) {
      const search: Record<string, string> = { ...foFixed };
      for (const [foKey, pageKey] of Object.entries(keys)) {
        const value = page[pageKey];
        if (value !== undefined && value !== '') search[foKey] = value;
      }
      return search;
    },
    preset(foSearch) {
      const page: Record<string, string> = {};
      for (const [foKey, value] of Object.entries(foSearch)) {
        if (Object.hasOwn(keys, foKey)) page[keys[foKey]!] = value;
      }
      return page;
    },
  };
}

/** A module-level `useSearch` hook for `FoBridge`: the current page read through one route table, as FO search strings. */
export function routeSearch(route: OperatorRoute) {
  return function useRouteSearch(): Readonly<Record<string, string>> {
    // `url` and `page` are the kernel values that change with each navigation; the memo is keyed on them so
    // a screen that folds pending writes sees a new object whenever the platform reports a new location.
    const { pageParam, url, page } = usePlatform();
    return useMemo(() => {
      const page: Record<string, string> = {};
      for (const key of route.pageKeys) {
        const value = pageParam(key);
        if (value !== null) page[key] = value;
      }
      return route.toFoSearch(page);
    }, [pageParam, url, page]);
  };
}

/** A module-level `useHere` hook for `FoBridge`: the current page as the FeedbackOps path+query of this route table. */
export function routeHere(route: OperatorRoute) {
  const useRouteSearch = routeSearch(route);
  return function useRouteHere(): string {
    const search = useRouteSearch();
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) if (value !== '') query.set(key, value);
    const text = query.toString();
    return text === '' ? route.foPath : `${route.foPath}?${text}`;
  };
}
