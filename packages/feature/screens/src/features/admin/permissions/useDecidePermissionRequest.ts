import { mapUnknownError } from '../../../lib/api/errorMapper';
import {
  type PermissionRequestDecisionAction,
  decidePermissionRequest,
  permissionRequestAdminDetailKey,
} from '../../../lib/api/permission-admin';
import {
  permissionRequestOwnerDetailKey,
  permissionRequestsMineKey,
} from '../../../lib/api/permission-requests';
import type { ApiError } from '../../../lib/api/types';
import { useHostNotice } from '../../../lib/host/host-seam';
import { invalidateRecovery } from '../../../lib/query/recovery';
import { decidePermissionRequestBatch } from '../../../lib/api/permission-groups';
import { fetchPermissionRequestAdminDetail } from '../../../lib/api/permission-admin';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';
import type { ApprovePermissionRequest, PermissionDecisionResult } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export const permissionRequestsReviewKey = ['permission-requests', 'review'] as const;
type ReviewDecisionResult = PermissionDecisionResult & { reviewRevisions?: Record<string, number> };

export interface DecidePermissionRequestArgs {
  batch?: { id: string; revisions: Record<string, number>; approveIds: string[] };
  id: string;
  expectedRevision: number;
  action: PermissionRequestDecisionAction;
  reason: string;
  idempotencyKey: string;
  selfApproval?: ApprovePermissionRequest['self_approval'];
  grantedManagedSystemId?: ApprovePermissionRequest['granted_managed_system_id'];
  grantedScope?: { site: string; room: string };
  expiration?: ApprovePermissionRequest['expiration'];
}

export function useDecidePermissionRequest(
  onSettled?: (succeeded: boolean) => void,
  onStale?: () => void,
  onSucceeded?: (result: ReviewDecisionResult) => void,
): UseMutationResult<ReviewDecisionResult, ApiError, DecidePermissionRequestArgs> {
  const queryClient = useQueryClient();
  const { notify } = useHostNotice();

  return useMutation({
    mutationFn: async ({
      batch,
      id,
      expectedRevision,
      action,
      reason,
      idempotencyKey,
      selfApproval,
      expiration,
      grantedManagedSystemId,
      grantedScope,
    }: DecidePermissionRequestArgs) => {
      if (batch) {
        if (action === 'deny') throw new Error('Batch deny is not supported');
        const result = await decidePermissionRequestBatch(batch.id, {
          action, expected_revisions: batch.revisions, reason,
          ...(action === 'approve' ? { approve_ids: batch.approveIds } : {}),
          ...(expiration !== undefined ? { expiration } : {}),
          ...(selfApproval ? { self_approval: selfApproval } : {}),
          ...(grantedManagedSystemId !== undefined ? { granted_managed_system_id: grantedManagedSystemId } : {}),
        }, idempotencyKey);
        const members = await Promise.all(Object.keys(batch.revisions).map(memberId => fetchPermissionRequestAdminDetail(memberId)));
        const fresh = members.find(item => item.id === id);
        if (!fresh) throw new Error('Batch response omitted the selected request');
        const outcome = result.items.find(item => item.id === id);
        if (!outcome) throw new Error('Batch response omitted the selected request');
        return { id, revision: fresh.revision, status: outcome.status, updated_at: fresh.updated_at, reviewRevisions: Object.fromEntries(members.map(item => [item.id, item.revision])) };
      }
      return decidePermissionRequest(
        id,
        action,
        reason,
        idempotencyKey,
        expectedRevision,
        selfApproval,
        expiration,
        grantedManagedSystemId,
        grantedScope,
      );
    },
    retry: false,
    onSettled: (data) => onSettled?.(data !== undefined),
    onSuccess: async (data, args) => {
      onSucceeded?.(data);
      notify({ tone: 'success', message: args.batch && args.action === 'approve' ? PERMISSION_GROUP_COPY.decided(args.batch.approveIds.length, Object.keys(args.batch.revisions).length - args.batch.approveIds.length) : '권한 요청이 처리되었습니다.' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: permissionRequestsReviewKey }),
        queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(args.id) }),
        queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(args.id) }),
        ...(args.batch ? [queryClient.invalidateQueries({ queryKey: ['permission-requests'] }), queryClient.invalidateQueries({ queryKey: ['permission-grants'] }), queryClient.invalidateQueries({ queryKey: ['permission-grant-options'] })] : []),
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
          ...(args.batch ? Object.keys(args.batch.revisions).flatMap(id => [queryClient.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(id) }), queryClient.invalidateQueries({ queryKey: permissionRequestOwnerDetailKey(id) })]) : []),
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
