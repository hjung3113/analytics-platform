import { vocOwnerCandidatesSchema } from '@ap/feature-shared';
import { apiRequest } from './client';
import { apiPath } from './path';

export async function fetchVocOwnerCandidates(vocId: string, signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    apiPath`/vocs/${vocId}/owner-candidates`,
    vocOwnerCandidatesSchema,
    signal ? { signal } : {},
  );
  return response.data;
}
