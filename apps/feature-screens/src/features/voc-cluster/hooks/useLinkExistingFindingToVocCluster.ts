// useLinkExistingFindingToVocCluster — command-only association that refreshes
// the cluster detail so its backend-authorized linked_findings are rendered.

import type { LinkedFindingDto } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';

export interface LinkExistingFindingToVocClusterVariables {
  clusterId: string;
  findingId: string;
}

export function useLinkExistingFindingToVocCluster(args?: {
  idempotencyKey?: string;
}): UseMutationResult<LinkedFindingDto, ApiError, LinkExistingFindingToVocClusterVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clusterId, findingId }) => {
      const response = await apiClient<LinkedFindingDto>(
        'POST',
        `/voc-clusters/${clusterId}/link-finding`,
        {
          body: { finding_id: findingId },
          ...(args?.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
        },
      );
      return response.data;
    },
    onSuccess: async (_finding, { clusterId }) => {
      invalidateRecovery(queryClient);
      invalidateNavCounts(queryClient);
      await queryClient.invalidateQueries({
        queryKey: ['voc-cluster', clusterId],
      });
    },
  });
}
