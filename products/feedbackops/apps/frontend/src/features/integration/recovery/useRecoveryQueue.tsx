import type { RecoverySearch } from '@/lib/host/search-fields';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { RenderRecoveryAccess } from './RecoveryPanel';
import { type RecoveryQueueIo, useRecoveryQueueCore } from './useRecoveryQueueCore';

/** Integration's supported composition seam: caller's existing PageShell owns the slot. The router-bound adapter of `useRecoveryQueueCore` (Home's). */
export function useRecoveryQueue(
  view: 'operational' | 'actionable',
  active = true,
  renderRequestAccess?: RenderRecoveryAccess,
) {
  const search = useSearch({ strict: false }) as RecoverySearch;
  const location = useLocation();
  const navigate = useNavigate();
  const write = useCallback<RecoveryQueueIo['write']>(
    (values, options) => {
      void navigate({
        to: location.pathname,
        ...(options?.replace === true ? { replace: true } : {}),
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          ...(options?.resetCursor ? { cursor: undefined } : {}),
          ...values,
        }),
      });
    },
    [navigate, location.pathname],
  );
  const io = useMemo(
    () => ({ search, write, here: location.href }),
    [search, write, location.href],
  );
  return useRecoveryQueueCore(view, active, renderRequestAccess, io);
}
