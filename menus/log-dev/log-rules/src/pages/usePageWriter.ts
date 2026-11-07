import { useCallback, useLayoutEffect, useRef } from 'react';
import { usePlatform } from '@ap/kernel';

/** Table cell renderers stay mounted when page state opens a drawer, so its opener remains available for focus restoration. */
export function usePageWriter() {
  const { setPage } = usePlatform();
  const latest = useRef(setPage);
  useLayoutEffect(() => { latest.current = setPage; }, [setPage]);
  return useCallback((patch: Parameters<typeof setPage>[0]) => latest.current(patch), []);
}
