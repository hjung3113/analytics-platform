/**
 * `vite --mode real` proxy table (ADR-0071, O13). FeedbackOps backend paths stay at the root; the bridge's FeedbackOps
 * client calls them under `/api/features`, and the edge strips that prefix. Production does the same at deploy time (#151).
 * Order matters: Vite takes the first context the URL starts with, so `/api/features/` (trailing slash, so `/api/fonts` is not
 * caught) must come before `/api`.
 */
export const FO_API_PREFIX = '/api/features';

export function realDevProxy(origin: string) {
  return {
    [`${FO_API_PREFIX}/`]: { target: origin, rewrite: (path: string) => path.slice(FO_API_PREFIX.length) },
    '/api': origin,
    '/auth': origin,
  };
}
