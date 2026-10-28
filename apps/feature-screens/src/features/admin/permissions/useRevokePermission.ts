import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { errorMapper } from '@/lib/api/errorMapper';
import { revokePermission } from '@/lib/api/permission-admin';
import type { ApiError } from '@/lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { useHostNotice } from '@/lib/host/host-seam';
import type { RevokePermissionResult } from '@fops/shared';

export const permissionGrantsListKey = ['permission-grants', 'admin'] as const;
export const permissionDeniesListKey = ['permission-denies', 'admin'] as const;

export interface RevokePermissionArgs {
  kind: 'grants' | 'denies';
  id: string;
  reason: string;
  idempotencyKey: string;
}

export function useRevokePermission(
  onGrantRevoked?: (id: string) => void,
): UseMutationResult<RevokePermissionResult, ApiError, RevokePermissionArgs> {
  const queryClient = useQueryClient();
  const { notify } = useHostNotice();

  return useMutation({
    mutationFn: ({ kind, id, reason, idempotencyKey }: RevokePermissionArgs) =>
      revokePermission(kind, id, reason, idempotencyKey),
    onSuccess: async (_result, args) => {
      if (args.kind === 'grants') onGrantRevoked?.(args.id);
      notify({
        tone: 'success',
        message:
          args.kind === 'grants'
            ? ADMIN_PERMISSIONS_COPY.revokeSuccess
            : ADMIN_PERMISSIONS_COPY.liftSuccess,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
        queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
      ]);
    },
    onError: async (error: ApiError, args) => {
      notify({ tone: 'error', message: errorMapper(error.envelope).message });
      if (error.code === 'conflict.permission_not_active' || error.code === 'not_found.record') {
        if (args.kind === 'grants') onGrantRevoked?.(args.id);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
          queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
        ]);
      }
    },
  });
}
