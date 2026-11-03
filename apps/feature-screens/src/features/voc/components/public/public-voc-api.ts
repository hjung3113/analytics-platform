// Reads of the public VOC projection (`GET /vocs/public`, `GET /vocs/public/:id`, ADR-0110). Each response is parsed with
// the shared strict schema; the server decides what the actor may see, so nothing is filtered here.

import { apiRequest } from '@/lib/api/client';
import {
  type PublicVocListResponse,
  type PublicVocView,
  publicVocListResponseSchema,
  publicVocViewSchema,
} from '@ap/feature-shared';
import { PUBLIC_VOC_PAGE_SIZE, type PublicVocQuery } from './public-voc-query';

export async function fetchPublicVocPage(
  query: PublicVocQuery,
  options: { cursor?: string | undefined; signal?: AbortSignal | undefined } = {},
): Promise<PublicVocListResponse> {
  const params = new URLSearchParams();
  if (query.mine) params.set('mine', 'true');
  if (query.systemId !== null) params.set('managed_system_id', query.systemId);
  if (query.q !== '') params.set('q', query.q);
  if (options.cursor !== undefined) params.set('cursor', options.cursor);
  params.set('limit', String(PUBLIC_VOC_PAGE_SIZE));
  const res = await apiRequest('GET', `/vocs/public?${params.toString()}`, publicVocListResponseSchema, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return res.data;
}

export async function fetchPublicVoc(id: string, signal?: AbortSignal): Promise<PublicVocView> {
  const res = await apiRequest('GET', `/vocs/public/${id}`, publicVocViewSchema, signal ? { signal } : {});
  return res.data;
}
