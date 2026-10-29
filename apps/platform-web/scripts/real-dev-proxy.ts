/**
 * `vite --mode real` proxy table (ADR-0071, O13). feature backend paths stay at the root; the bridge's feature
 * client calls them under `/api/features`, and the edge strips that prefix. Production does the same at deploy time (#151).
 * Order matters: Vite takes the first context the URL starts with, so `/api/features/` (trailing slash, so `/api/fonts` is not
 * caught) must come before `/api`.
 */
export const FEATURE_API_PREFIX = '/api/features';

export function realDevProxy(origin: string) {
  return {
    [`${FEATURE_API_PREFIX}/`]: { target: origin, rewrite: (path: string) => path.slice(FEATURE_API_PREFIX.length) },
    '/api': origin,
    '/auth': origin,
  };
}
