import { progressNotesQueryKey } from '@/features/cross-system/progress-notes/useProgressNotes';
import { apiPath } from '@/lib/api/path';
import { apiRequest } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { type PatchFindingResponse, type PatchFindingRequest, patchFindingResponseSchema } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface UseFindingStatusMutationArgs {
  findingId: string;
  idempotencyKey: string;
  onSuccess?: (data: PatchFindingResponse) => void;
  onError?: (err: ApiError) => void;
}

export function useFindingStatusMutation(
  args: UseFindingStatusMutationArgs,
): UseMutationResult<PatchFindingResponse, ApiError, PatchFindingRequest> {
  const { findingId, idempotencyKey, onSuccess, onError } = args;
  const queryClient = useQueryClient();

  return useMutation<PatchFindingResponse, ApiError, PatchFindingRequest>({
    mutationFn: async (body) => {
      const res = await apiRequest('PATCH', apiPath`/findings/${findingId}`, patchFindingResponseSchema, {
        body,
        idempotencyKey,
      });
      return res.data;
    },
    onSuccess: (data) => {
      void invalidateRecovery(queryClient);
      invalidateNavCounts(queryClient);
      if ('source_type' in data) queryClient.setQueryData(['finding', findingId], data);
      void queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      void queryClient.invalidateQueries({ queryKey: progressNotesQueryKey({ kind: 'finding', id: findingId }) });
      onSuccess?.(data);
    },
    ...(onError ? { onError } : {}),
  });
}
