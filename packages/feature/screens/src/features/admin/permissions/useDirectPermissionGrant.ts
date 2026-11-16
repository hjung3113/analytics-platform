import { type QueryClient, type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { mapUnknownError } from '../../../lib/api/errorMapper';
import { createDirectPermissionGrant, createDirectPermissionGrantBatch } from '../../../lib/api/permission-admin';
import { permissionRequestsMineKey } from '../../../lib/api/permission-requests';
import type { ApiError } from '../../../lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '../../../lib/copy/admin-permissions';
import { useHostNotice } from '../../../lib/host/host-seam';
import type { DirectPermissionGrant, DirectPermissionGrantBatch, PermissionGrantAdminItem } from '@ap/feature-shared';

import { permissionRequestsReviewKey } from './useDecidePermissionRequest.js';
import { permissionDeniesListKey, permissionGrantsListKey } from './useRevokePermission.js';

function invalidateGrantQueries(queryClient: QueryClient) {
  return Promise.all([
    permissionGrantsListKey, permissionDeniesListKey, permissionRequestsMineKey, permissionRequestsReviewKey,
    ['permission-check'], ['managed-system-scope'], ['permission-grant-options'],
  ].map(queryKey => queryClient.invalidateQueries({ queryKey })));
}

export interface DirectPermissionGrantArgs {
  body: DirectPermissionGrant;
  idempotencyKey: string;
}

export function useDirectPermissionGrantBatch(cacheReturnedGrant: (item: PermissionGrantAdminItem) => void) {
  const queryClient = useQueryClient();
  const { notify } = useHostNotice();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: DirectPermissionGrantBatch; idempotencyKey: string }) =>
      createDirectPermissionGrantBatch(body, idempotencyKey),
    retry: false,
    onSuccess: (result) => {
      result.items.forEach(cacheReturnedGrant);
      notify({ tone: 'success', message: ADMIN_PERMISSIONS_COPY.directGrant.batchSuccess(result.items.length) });
      void invalidateGrantQueries(queryClient);
    },
  });
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
      void invalidateGrantQueries(queryClient);
    },
    onError: (error) => {
      notify({ tone: 'error', message: mapUnknownError(error).message });
    },
  });
}
