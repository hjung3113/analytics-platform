// useCreateVocCluster — POST /voc-clusters.
// Invalidates the cluster list on success.

import { apiRequest } from '../../../lib/api/client';
import { ApiParseError, type ApiError } from '../../../lib/api/types';
import { invalidateNavCounts } from '../../../lib/query/navCounts';
import { vocClusterDtoSchema, type CreateVocClusterRequest, type VocClusterDto } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateVocCluster(): UseMutationResult<
  VocClusterDto,
  ApiError,
  CreateVocClusterRequest
> {
  const qc = useQueryClient();
  return useMutation<VocClusterDto, ApiError, CreateVocClusterRequest>({
    mutationFn: async (body) => {
      const res = await apiRequest('POST', '/voc-clusters', vocClusterDtoSchema, { body });
      if (res.status === 304) throw new ApiParseError(res.status, 'POST /voc-clusters', [], res.requestId);
      return res.data;
    },
    onSuccess: async () => {
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-clusters'] });
    },
  });
}
