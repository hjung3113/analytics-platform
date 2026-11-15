import {
  LIST_MAX_LIMIT,
  type ListTaskRequestsResponse,
  type ListTasksResponse,
} from '@ap/feature-shared';

import { fetchTaskRequests } from './task-requests';
import { listTasks } from './tasks';

// The list endpoints return one page (default 50, cap 100). Views that group, search or filter
// the whole set locally follow the cursor with these helpers; lists with "load more" page themselves.

/** Every Task matching the filters. */
export function listAllTasks(
  options: Parameters<typeof listTasks>[0] = {},
): Promise<ListTasksResponse> {
  const fetchPage = (cursor?: string) =>
    listTasks({ ...options, limit: LIST_MAX_LIMIT, ...(cursor === undefined ? {} : { cursor }) });
  const rest = async (first: ListTasksResponse): Promise<ListTasksResponse> => {
    const items = [...first.items];
    let page = first;
    while (page.page?.has_more && page.page.cursor !== undefined) {
      page = await fetchPage(page.page.cursor);
      items.push(...page.items);
    }
    return {
      items,
      page: { has_more: false, ...(first.page?.total === undefined ? {} : { total: first.page.total }) },
    };
  };
  // A single page (the common case) is returned as the server sent it, without another round trip.
  return fetchPage().then((first) => (first.page?.has_more ? rest(first) : first));
}

/** Every Task Request matching the filters. */
export async function fetchAllTaskRequests(
  options: Parameters<typeof fetchTaskRequests>[0] = {},
): Promise<ListTaskRequestsResponse> {
  const items: ListTaskRequestsResponse['items'] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchTaskRequests({
      ...options,
      limit: LIST_MAX_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    items.push(...page.items);
    cursor = page.page?.has_more ? page.page.cursor : undefined;
  } while (cursor !== undefined);
  return { items, page: { has_more: false } };
}
