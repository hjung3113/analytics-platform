/** A screen's current search as raw URL strings (never JSON-parsed): what `useHostSearch()` returns. */
export type HostSearch = Readonly<Record<string, string>>;

/**
 * `path` plus the non-empty entries of `record`, in the order given. The result is the complete feature
 * path+query for `useHostNavigate()`: a key left out (or `undefined`/empty) is cleared.
 */
export function searchHref(
  path: string,
  record: Readonly<Record<string, string | undefined>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}
