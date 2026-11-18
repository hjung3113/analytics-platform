import { apiPath } from '../../../lib/api/path';
// useCreateFindingFromCluster — POST /voc-clusters/:id/create-finding.
// Mirrors useCreateFindingFromVocMutation shape; apiClient auto-mints Idempotency-Key.

import { apiClient } from '../../../lib/api/client';
import type { ApiError } from '../../../lib/api/types';
import { invalidateNavCounts } from '../../../lib/query/navCounts';
import { invalidateRecovery } from '../../../lib/query/recovery';
import type { CreateFindingFromVocClusterRequest, FindingDto } from '@ap/feature-shared';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

export interface CreateFindingFromClusterVariables {
  clusterId: string;
  body: CreateFindingFromVocClusterRequest;
}

export function useCreateFindingFromCluster(args?: {
  idempotencyKey?: string;
}): UseMutationResult<FindingDto, ApiError, CreateFindingFromClusterVariables> {
  const queryClient = useQueryClient();
  return useMutation<FindingDto, ApiError, CreateFindingFromClusterVariables>({
    mutationFn: async ({ clusterId, body }) => {
      const res = await apiClient<FindingDto>('POST', apiPath`/voc-clusters/${clusterId}/create-finding`, {
        body,
        ...(args?.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
      });
      return res.data;
    },
    onSuccess: (_data, { clusterId }) => {
      void queryClient.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
      void queryClient.invalidateQueries({ queryKey: ['voc-clusters'] });
      void queryClient.invalidateQueries({ queryKey: ['findings'] });
      invalidateRecovery(queryClient);
      invalidateNavCounts(queryClient);
    },
    // A rejected evidence selection means the member list the dialog showed is stale (#2531 review C7).
    onError: (err, { clusterId, body }) => {
      if (err.code === 'not_found.record' && (body.evidence_voc_ids?.length ?? 0) > 0) {
        void queryClient.invalidateQueries({ queryKey: ['voc-cluster', clusterId] });
      }
    },
  });
}
