// useCreateVocCluster — POST /voc-clusters.
// Invalidates the cluster list on success.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import type { CreateVocClusterRequest, VocClusterDto } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateVocCluster(): UseMutationResult<
  VocClusterDto,
  ApiError,
  CreateVocClusterRequest
> {
  const qc = useQueryClient();
  return useMutation<VocClusterDto, ApiError, CreateVocClusterRequest>({
    mutationFn: async (body) => {
      const res = await apiClient<VocClusterDto>('POST', '/voc-clusters', { body });
      return res.data;
    },
    onSuccess: async () => {
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-clusters'] });
    },
  });
}
