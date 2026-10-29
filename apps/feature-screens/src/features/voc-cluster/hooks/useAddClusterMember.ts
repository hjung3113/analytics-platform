// useAddClusterMember — POST /voc-clusters/:id/vocs.
// Invalidates the cluster detail query on success.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { invalidateRecovery } from '@/lib/query/recovery';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface AddClusterMemberVariables {
  clusterId: string;
  vocId: string;
}

export function useAddClusterMember(): UseMutationResult<
  void,
  ApiError,
  AddClusterMemberVariables
> {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the response/value type is intentionally void here (the former Biome rule allowed void call-site type arguments)
  return useMutation<void, ApiError, AddClusterMemberVariables>({
    mutationFn: async ({ clusterId, vocId }) => {
      await apiClient('POST', `/voc-clusters/${clusterId}/vocs`, { body: { voc_id: vocId } });
    },
    onSuccess: async (_data, { clusterId }) => {
      invalidateRecovery(qc);
      invalidateNavCounts(qc);
      await qc.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
      void qc.invalidateQueries({ queryKey: ['voc-cluster-candidate-peers', clusterId] });
    },
  });
}
