import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { mapUnknownError } from '@/lib/api/errorMapper';
import { createDirectPermissionGrant } from '@/lib/api/permission-admin';
import { permissionRequestsMineKey } from '@/lib/api/permission-requests';
import type { ApiError } from '@/lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { useHostNotice } from '@/lib/host/host-seam';
import type { DirectPermissionGrant, PermissionGrantAdminItem } from '@ap/feature-shared';

import { permissionRequestsReviewKey } from './useDecidePermissionRequest.js';
import { permissionDeniesListKey, permissionGrantsListKey } from './useRevokePermission.js';

export interface DirectPermissionGrantArgs {
  body: DirectPermissionGrant;
  idempotencyKey: string;
}

export function useDirectPermissionGrant(
  cacheReturnedGrant: (item: PermissionGrantAdminItem) => void,
): UseMutationResult<PermissionGrantAdminItem, ApiError, DirectPermissionGrantArgs> {
  const queryClient = useQueryClient();
  const { notify } = useHostNotice();

  return useMutation({
    mutationFn: ({ body, idempotencyKey }) => createDirectPermissionGrant(body, idempotencyKey),
    retry: false,
    onSuccess: (item) => {
      cacheReturnedGrant(item);
      notify({ tone: 'success', message: ADMIN_PERMISSIONS_COPY.directGrant.success });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionGrantsListKey }),
        queryClient.invalidateQueries({ queryKey: permissionDeniesListKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
        queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
        queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
        queryClient.invalidateQueries({ queryKey: ['permission-grant-options'] }),
      ]);
    },
    onError: (error) => {
      notify({ tone: 'error', message: mapUnknownError(error).message });
    },
  });
}
