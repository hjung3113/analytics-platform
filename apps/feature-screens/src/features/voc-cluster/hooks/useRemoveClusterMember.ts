// useRemoveClusterMember — DELETE /voc-clusters/:id/vocs/:vocId.
// Invalidates the cluster detail query on success.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface RemoveClusterMemberVariables {
  clusterId: string;
  vocId: string;
}

export function useRemoveClusterMember(): UseMutationResult<
  void,
  ApiError,
  RemoveClusterMemberVariables
> {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the response/value type is intentionally void here (the former Biome rule allowed void call-site type arguments)
  return useMutation<void, ApiError, RemoveClusterMemberVariables>({
    mutationFn: async ({ clusterId, vocId }) => {
      await apiClient('DELETE', `/voc-clusters/${clusterId}/vocs/${vocId}`);
    },
    onSuccess: async (_data, { clusterId }) => {
      invalidateRecovery(qc);
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
    },
  });
}
