import * as React from 'react';
import { searchDebounceMs } from '../../../lib/forms/search-debounce';

export function useOutcomeTaskSearch(scope: string) {
  const [search, setSearch] = React.useState({ scope, draft: '', committed: '' });
  if (search.scope !== scope) setSearch({ scope, draft: '', committed: '' });
  const { draft } = search;
  React.useEffect(() => {
    if (!draft) return;
    const timeoutId = window.setTimeout(() => {
      setSearch((current) =>
        current.scope === scope && current.draft === draft ? { ...current, committed: draft } : current,
      );
    }, searchDebounceMs(draft));
    return () => window.clearTimeout(timeoutId);
  }, [draft, scope]);

  const setDraft = React.useCallback((value: string) => {
    setSearch((current) => current.draft === value
      ? current
      : { ...current, draft: value, committed: value ? current.committed : '' });
  }, []);
  return [search.committed, setDraft] as const;
}
