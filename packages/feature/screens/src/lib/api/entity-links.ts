import {
  type EntityLinkEntityType,
  LIST_MAX_LIMIT,
  type ListEntityLinksResponse,
  listEntityLinksResponseSchema,
} from '@ap/feature-shared';

import { apiRequest } from './client';

export async function fetchTaskRequestEntityLinks(
  taskRequestId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  return fetchEntityLinksBySource('task_request', taskRequestId, options);
}

export async function fetchEntityLinksBySource(
  sourceType: EntityLinkEntityType,
  sourceId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  return fetchEntityLinksByEndpoint('source', sourceType, sourceId, options);
}

export async function fetchEntityLinksByTarget(
  targetType: EntityLinkEntityType,
  targetId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  return fetchEntityLinksByEndpoint('target', targetType, targetId, options);
}

async function fetchEntityLinksByEndpoint(
  side: 'source' | 'target',
  endpointType: EntityLinkEntityType,
  endpointId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ListEntityLinksResponse> {
  // Endpoint mode accepts the endpoint plus paging (relation_type is an inventory-only
  // filter); callers pick the relevant row from the response, so follow the cursor to
  // return every link, not just the first page.
  const items: ListEntityLinksResponse['items'] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({
      ...(side === 'source'
        ? { source_type: endpointType, source_id: endpointId }
        : { target_type: endpointType, target_id: endpointId }),
      limit: String(LIST_MAX_LIMIT),
    });
    if (cursor !== undefined) query.set('cursor', cursor);
    const response = await apiRequest(
      'GET',
      `/entity-links?${query.toString()}`,
      listEntityLinksResponseSchema,
      options,
    );
    items.push(...response.data.items);
    cursor = response.data.page?.has_more ? response.data.page.cursor : undefined;
  } while (cursor !== undefined);
  return { items, page: { has_more: false } };
}
