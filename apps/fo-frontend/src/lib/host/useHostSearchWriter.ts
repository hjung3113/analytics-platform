// One search writer for a screen over the host seam. A write builds on the host search, or on the search the
// previous write left while that write is pending, so several writes before the host has applied the first
// (Enter, a tab pick and a blur) fold like a router's functional `search` did. Any host navigation (a new
// `useHostSearch()` object, even Back to the same URL) drops the fold.

import * as React from 'react';
import { useHostNavigate, useHostSearch } from './host-seam';
import { type HostSearch, searchHref } from './search';

type SearchRecord = Readonly<Record<string, string | undefined>>;

/** `validate` must be a stable function (a module-level one): the memoized `search` depends on it. */
export function useHostSearchWriter<T extends SearchRecord>(
  path: string,
  validate: (raw: HostSearch) => T,
): {
  search: T;
  write: (update: (previous: T) => T, options?: { replace?: boolean }) => void;
} {
  const hostSearch = useHostSearch();
  const hostNavigate = useHostNavigate();
  const search = React.useMemo(() => validate(hostSearch), [validate, hostSearch]);

  const latest = React.useRef({ search, navigate: hostNavigate });
  React.useEffect(() => {
    latest.current.search = search;
  }, [search]);
  React.useEffect(() => {
    latest.current.navigate = hostNavigate;
  }, [hostNavigate]);
  const write = React.useCallback(
    (update: (previous: T) => T, options?: { replace?: boolean }): void => {
      const next = update(latest.current.search);
      latest.current.search = next;
      const href = searchHref(path, next);
      if (options?.replace === true) latest.current.navigate(href, { replace: true });
      else latest.current.navigate(href);
    },
    [path],
  );

  return { search, write };
}
