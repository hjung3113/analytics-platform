import { mapUnknownError } from '@/lib/api/errorMapper';
import {
  type PermissionRequestDecisionAction,
  decidePermissionRequest,
  permissionRequestAdminDetailKey,
} from '@/lib/api/permission-admin';
import {
  permissionRequestOwnerDetailKey,
  permissionRequestsMineKey,
} from '@/lib/api/permission-requests';
import type { ApiError } from '@/lib/api/types';
import { useHostNotice } from '@/lib/host/host-seam';
import { invalidateRecovery } from '@/lib/query/recovery';
import type { ApprovePermissionRequest, PermissionDecisionResult } from '@fops/shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export const permissionRequestsReviewKey = ['permission-requests', 'review'] as const;

export interface DecidePermissionRequestArgs {
  id: string;
  expectedRevision: number;
  action: PermissionRequestDecisionAction;
  reason: string;
  idempotencyKey: string;
  selfApproval?: ApprovePermissionRequest['self_approval'];
  grantedManagedSystemId?: ApprovePermissionRequest['granted_managed_system_id'];
  expiration?: ApprovePermissionRequest['expiration'];
}

export function useDecidePermissionRequest(
  onSettled?: (succeeded: boolean) => void,
  onStale?: () => void,
  onSucceeded?: (result: PermissionDecisionResult) => void,
): UseMutationResult<PermissionDecisionResult, ApiError, DecidePermissionRequestArgs> {
  const queryClient = useQueryClient();
  const { notify } = useHostNotice();

  return useMutation({
    mutationFn: ({
      id,
      expectedRevision,
      action,
      reason,
      idempotencyKey,
      selfApproval,
      expiration,
      grantedManagedSystemId,
    }: DecidePermissionRequestArgs) =>
      decidePermissionRequest(
        id,
        action,
        reason,
        idempotencyKey,
        expectedRevision,
        selfApproval,
        expiration,
        grantedManagedSystemId,
      ),
    retry: false,
    onSettled: (data) => onSettled?.(data !== undefined),
    onSuccess: async (data, args) => {
      onSucceeded?.(data);
      notify({ tone: 'success', message: '권한 요청이 처리되었습니다.' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(args.id) }),
        queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(args.id) }),
        queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
        queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
        invalidateRecovery(queryClient),
        queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
      ]);
    },
    onError: async (error: ApiError, args) => {
      notify({ tone: 'error', message: mapUnknownError(error).message });
      if (error.code === 'conflict.stale_write') {
        onStale?.();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
          queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(args.id) }),
          queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(args.id) }),
          queryClient.invalidateQueries({ queryKey: permissionRequestsMineKey }),
          queryClient.invalidateQueries({ queryKey: ['permission-check'] }),
          queryClient.invalidateQueries({ queryKey: ['managed-system-scope'] }),
          invalidateRecovery(queryClient),
        ]);
      }
    },
  });
}
