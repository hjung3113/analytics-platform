import { vocCreateTargetsSchema } from '@ap/feature-shared';
import { apiRequest } from './client';

/** `GET /vocs/create-targets` (#1358): which live Managed Systems the signed-in actor may file a VOC in. */
export async function fetchVocCreateTargets(signal?: AbortSignal) {
  const response = await apiRequest(
    'GET',
    '/vocs/create-targets',
    vocCreateTargetsSchema,
    signal ? { signal } : {},
  );
  return response.data.items;
}
