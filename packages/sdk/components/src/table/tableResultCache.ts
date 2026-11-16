import { useState } from 'react';
import { isAnswered, type ApiResponse, type GroupedPageResult } from '@ap/contracts';

/** Most recent answered pages a cache keeps; older ones are dropped first. */
const MAX_ENTRIES = 32;

/**
 * Answered pages of server-paged tables, owned by the screen that creates it (`useTableResultCache`), never module-global: it lives as long as
 * that component and is dropped with it (#2380). A table given `resultCache` shows a page it already holds at once, without a request or a
 * loading state, when its request identity (Context, user, revision, filters, page, sort, group, refresh epoch) is unchanged.
 * `clear()` after a write the table cannot see (`refreshOn` epochs already change the identity).
 */
export type TableResultCache = { clear(): void };

type Entry = ApiResponse<GroupedPageResult<unknown>>;
const stores = new WeakMap<TableResultCache, Map<string, Entry>>();

export function createTableResultCache(): TableResultCache {
  const entries = new Map<string, Entry>();
  const cache: TableResultCache = { clear: () => entries.clear() };
  stores.set(cache, entries);
  return cache;
}

/** One cache per mounted component: stable across renders. */
export function useTableResultCache(): TableResultCache {
  return useState(createTableResultCache)[0];
}

export function readCachedPage<T>(cache: TableResultCache, key: string): ApiResponse<GroupedPageResult<T>> | undefined {
  return stores.get(cache)?.get(key) as ApiResponse<GroupedPageResult<T>> | undefined;
}

/** Only answered results (`ok`, `empty`) are kept: a failure is read again. */
export function writeCachedPage<T>(cache: TableResultCache, key: string, response: ApiResponse<GroupedPageResult<T>>) {
  const entries = stores.get(cache);
  if (!entries || !isAnswered(response.outcome)) return;
  entries.delete(key);
  entries.set(key, response as Entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}
